const express = require("express");

const asyncHandler = require("../middleware/asyncHandler");
const { protect, requireRole } = require("../middleware/auth");
const Ticket = require("../models/Ticket");
const User = require("../models/User");

const router = express.Router();

const ticketPopulate = [
  { path: "consultant", select: "name email role site" },
  { path: "primaryAdmin", select: "name email role site" },
  { path: "supportingAdmins", select: "name email role site" },
  { path: "invitedAdmins", select: "name email role site" },
  { path: "closedBy", select: "name email role site" }
];

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    site: user.site
  };
}

function resolveId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value._id) {
    return value._id.toString();
  }

  return value.toString();
}

function getUnreadState(ticket, viewer) {
  if (!viewer) {
    return {
      unreadCount: 0,
      hasUnread: false,
      lastSeenAt: null,
      latestUnreadAt: null
    };
  }

  const viewerId = resolveId(viewer._id || viewer.id || viewer);
  const readEntry = (ticket.readState || []).find((entry) => resolveId(entry.user) === viewerId);
  const lastSeenAt = readEntry?.lastSeenAt ? new Date(readEntry.lastSeenAt) : null;

  const unreadMessages = (ticket.messages || []).filter((message) => {
    const authorId = resolveId(message.author);
    const createdAt = new Date(message.createdAt);

    if (authorId === viewerId) {
      return false;
    }

    return !lastSeenAt || createdAt > lastSeenAt;
  });

  const unreadActivity = (ticket.activityLog || []).filter((entry) => {
    const actorId = resolveId(entry.actor);
    const createdAt = new Date(entry.createdAt);

    if (entry.type === "message_posted") {
      return false;
    }

    if (actorId && actorId === viewerId) {
      return false;
    }

    return !lastSeenAt || createdAt > lastSeenAt;
  });

  const unreadItems = [...unreadMessages, ...unreadActivity].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );

  return {
    unreadCount: unreadItems.length,
    hasUnread: unreadItems.length > 0,
    lastSeenAt,
    latestUnreadAt: unreadItems[0]?.createdAt || null
  };
}

function setTicketReadState(ticket, viewer) {
  const viewerId = resolveId(viewer._id || viewer.id || viewer);
  const now = new Date();
  const readEntry = (ticket.readState || []).find((entry) => resolveId(entry.user) === viewerId);

  if (readEntry) {
    readEntry.lastSeenAt = now;
    return;
  }

  ticket.readState.push({
    user: viewerId,
    lastSeenAt: now
  });
}

function ticketSummary(ticket, viewer) {
  const participantIds = new Set();
  const unreadState = getUnreadState(ticket, viewer);

  if (ticket.consultant?._id) {
    participantIds.add(ticket.consultant._id.toString());
  }

  if (ticket.primaryAdmin?._id) {
    participantIds.add(ticket.primaryAdmin._id.toString());
  }

  (ticket.supportingAdmins || []).forEach((admin) => {
    if (admin?._id) {
      participantIds.add(admin._id.toString());
    }
  });

  return {
    id: ticket._id,
    reference: ticket.reference,
    title: ticket.title,
    description: ticket.description,
    severity: ticket.severity,
    status: ticket.status,
    site: ticket.site,
    consultant: normalizeUser(ticket.consultant),
    primaryAdmin: normalizeUser(ticket.primaryAdmin),
    supportingAdmins: (ticket.supportingAdmins || []).map(normalizeUser),
    invitedAdmins: (ticket.invitedAdmins || []).map(normalizeUser),
    closedBy: normalizeUser(ticket.closedBy),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
    participantCount: participantIds.size,
    unreadCount: unreadState.unreadCount,
    hasUnread: unreadState.hasUnread,
    lastSeenAt: unreadState.lastSeenAt,
    latestUnreadAt: unreadState.latestUnreadAt
  };
}

function ticketDetail(ticket, viewer) {
  return {
    ...ticketSummary(ticket, viewer),
    messages: (ticket.messages || []).map((message) => ({
      id: message._id,
      author: message.author,
      authorName: message.authorName,
      authorRole: message.authorRole,
      body: message.body,
      kind: message.kind,
      createdAt: message.createdAt
    })),
    activityLog: (ticket.activityLog || [])
      .filter((entry) => entry.type !== "message_posted")
      .map((entry) => ({
        id: entry._id,
        type: entry.type,
        actor: entry.actor,
        actorName: entry.actorName,
        actorRole: entry.actorRole,
        description: entry.description,
        meta: entry.meta,
        createdAt: entry.createdAt
      }))
  };
}

function addActivity(ticket, { type, actor, description, meta = {} }) {
  ticket.activityLog.push({
    type,
    actor: actor ? actor._id : null,
    actorName: actor ? actor.name : "Sistema",
    actorRole: actor ? actor.role : "system",
    description,
    meta
  });
}

function canAccessTicket(ticket, user) {
  if (user.role === "admin") {
    return true;
  }

  return ticket.consultant && ticket.consultant._id.toString() === user._id.toString();
}

async function getTicketOr404(ticketId) {
  return Ticket.findById(ticketId).populate(ticketPopulate);
}

async function getTicketQueryForViewer(viewer, extraQuery = {}) {
  const query = { ...extraQuery };

  if (viewer.role === "consultant") {
    query.consultant = viewer._id;
  }

  return Ticket.find(query).populate(ticketPopulate).sort({ updatedAt: -1, createdAt: -1 });
}

router.use(protect);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status = "open", site = "all", q = "" } = req.query;
    const query = {};

    if (status === "closed") {
      query.status = "closed";
    } else if (status === "all") {
      query.status = { $exists: true };
    } else {
      query.status = { $ne: "closed" };
    }

    if (req.user.role === "consultant") {
      query.consultant = req.user._id;
    } else if (site && site !== "all") {
      query.site = site;
    }

    if (q && q.trim()) {
      query.$or = [
        { title: { $regex: q.trim(), $options: "i" } },
        { reference: { $regex: q.trim(), $options: "i" } },
        { description: { $regex: q.trim(), $options: "i" } },
        { site: { $regex: q.trim(), $options: "i" } }
      ];
    }

    const tickets = await Ticket.find(query)
      .populate(ticketPopulate)
      .sort({ updatedAt: -1, createdAt: -1 });

    res.json({ tickets: tickets.map((ticket) => ticketSummary(ticket, req.user)) });
  })
);

router.get(
  "/notifications/summary",
  asyncHandler(async (req, res) => {
    const tickets = await getTicketQueryForViewer(req.user);
    const notifications = tickets
      .map((ticket) => ticketSummary(ticket, req.user))
      .filter((ticket) => ticket.unreadCount > 0)
      .sort((left, right) => new Date(right.latestUnreadAt || 0) - new Date(left.latestUnreadAt || 0));

    res.json({
      totalUnreadTickets: notifications.length,
      totalUnreadItems: notifications.reduce((sum, ticket) => sum + ticket.unreadCount, 0),
      notifications: notifications.slice(0, 8)
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { title, description, severity = "medium", site = "" } = req.body;

    if (req.user.role !== "consultant") {
      return res.status(403).json({ message: "Solo los consultores pueden abrir tickets" });
    }

    if (!title || !description) {
      return res.status(400).json({ message: "Asunto y descripcion son obligatorios" });
    }

    const resolvedSite = req.user.site || site.trim();

    if (!resolvedSite) {
      return res.status(400).json({ message: "La web del ticket es obligatoria" });
    }

    const ticket = new Ticket({
      title: title.trim(),
      description: description.trim(),
      severity,
      site: resolvedSite,
      consultant: req.user._id,
      status: "open"
    });

    ticket.messages.push({
      author: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      body: description.trim()
    });

    addActivity(ticket, {
      type: "ticket_created",
      actor: req.user,
      description: `${req.user.name} creo el ticket`
    });
    setTicketReadState(ticket, req.user);

    await ticket.save();

    const hydratedTicket = await getTicketOr404(ticket._id);
    res.status(201).json({
      message: "Ticket creado",
      ticket: ticketDetail(hydratedTicket, req.user)
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ticket = await getTicketOr404(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ message: "No puedes acceder a este ticket" });
    }

    res.json({ ticket: ticketDetail(ticket, req.user) });
  })
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ message: "No puedes marcar este ticket como leido" });
    }

    setTicketReadState(ticket, req.user);
    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Ticket marcado como leido",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const { body } = req.body;
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ message: "No puedes responder a este ticket" });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ message: "El ticket esta cerrado" });
    }

    if (!body || !body.trim()) {
      return res.status(400).json({ message: "El mensaje no puede estar vacio" });
    }

    ticket.messages.push({
      author: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role,
      body: body.trim()
    });

    ticket.status = req.user.role === "consultant" ? "client_replied" : "in_progress";
    setTicketReadState(ticket, req.user);

    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.status(201).json({
      message: "Mensaje enviado",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.post(
  "/:id/claim",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ message: "El ticket esta cerrado" });
    }

    if (ticket.primaryAdmin && ticket.primaryAdmin._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({
        message: `El ticket ya esta asignado a ${ticket.primaryAdmin.name}`
      });
    }

    ticket.primaryAdmin = req.user._id;
    ticket.supportingAdmins = ticket.supportingAdmins.filter(
      (admin) => admin._id.toString() !== req.user._id.toString()
    );
    ticket.status = "claimed";
    addActivity(ticket, {
      type: "ticket_claimed",
      actor: req.user,
      description: `${req.user.name} tomo el ticket como admin principal`
    });
    setTicketReadState(ticket, req.user);

    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Ticket asignado",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.post(
  "/:id/join",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ message: "El ticket esta cerrado" });
    }

    const isPrimaryAdmin =
      ticket.primaryAdmin && ticket.primaryAdmin._id.toString() === req.user._id.toString();
    const alreadySupporting = ticket.supportingAdmins.some(
      (admin) => admin._id.toString() === req.user._id.toString()
    );

    if (!isPrimaryAdmin && !alreadySupporting) {
      ticket.supportingAdmins.push(req.user._id);
      addActivity(ticket, {
        type: "admin_joined",
        actor: req.user,
        description: `${req.user.name} se unio al ticket como apoyo`
      });
    }

    setTicketReadState(ticket, req.user);
    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Participacion actualizada",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.post(
  "/:id/invite",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { adminId } = req.body;
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!adminId) {
      return res.status(400).json({ message: "Debes indicar el admin a invitar" });
    }

    const invitedAdmin = await User.findOne({ _id: adminId, role: "admin" });

    if (!invitedAdmin) {
      return res.status(404).json({ message: "El admin indicado no existe" });
    }

    const alreadyInvited = ticket.invitedAdmins.some(
      (admin) => admin._id.toString() === invitedAdmin._id.toString()
    );

    if (!alreadyInvited) {
      ticket.invitedAdmins.push(invitedAdmin._id);
      addActivity(ticket, {
        type: "admin_invited",
        actor: req.user,
        description: `${req.user.name} invito a ${invitedAdmin.name} a unirse`,
        meta: { invitedAdminId: invitedAdmin._id }
      });
    }

    setTicketReadState(ticket, req.user);
    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Invitacion enviada",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ["open", "claimed", "in_progress", "waiting_consultant", "client_replied", "closed"];
    const consultantAllowedStatuses = ["client_replied", "closed"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Estado no valido" });
    }

    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ message: "No puedes editar este ticket" });
    }

    if (req.user.role === "consultant" && !consultantAllowedStatuses.includes(status)) {
      return res.status(403).json({ message: "Un consultor no puede poner ese estado" });
    }

    ticket.status = status;

    if (status === "closed") {
      ticket.closedAt = new Date();
      ticket.closedBy = req.user._id;
    } else {
      ticket.closedAt = null;
      ticket.closedBy = null;
    }

    addActivity(ticket, {
      type: "status_changed",
      actor: req.user,
      description: `${req.user.name} cambio el estado a ${status}`
    });
    setTicketReadState(ticket, req.user);

    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Estado actualizado",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

router.post(
  "/:id/close",
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id).populate(ticketPopulate);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ message: "No puedes cerrar este ticket" });
    }

    if (ticket.status !== "closed") {
      ticket.status = "closed";
      ticket.closedAt = new Date();
      ticket.closedBy = req.user._id;
      addActivity(ticket, {
        type: "ticket_closed",
        actor: req.user,
        description: `${req.user.name} cerro el ticket`
      });
    }

    setTicketReadState(ticket, req.user);
    await ticket.save();

    const updatedTicket = await getTicketOr404(ticket._id);
    res.json({
      message: "Ticket cerrado",
      ticket: ticketDetail(updatedTicket, req.user)
    });
  })
);

module.exports = router;
