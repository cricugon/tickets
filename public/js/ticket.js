document.addEventListener("DOMContentLoaded", async () => {
  const ticketId = window.location.pathname.split("/").filter(Boolean).pop();
  const state = {
    user: null,
    ticket: null,
    admins: [],
    notifications: [],
    messageAttachments: []
  };

  const detailUserPill = document.getElementById("detail-user-pill");
  const logoutButton = document.getElementById("detail-logout-button");
  const ticketReferenceChip = document.getElementById("ticket-reference-chip");
  const ticketHeroTitle = document.getElementById("ticket-hero-title");
  const ticketHeroCopy = document.getElementById("ticket-hero-copy");
  const heroStatus = document.getElementById("hero-status");
  const heroSeverity = document.getElementById("hero-severity");
  const heroUpdated = document.getElementById("hero-updated");
  const summaryChips = document.getElementById("summary-chips");
  const summaryList = document.getElementById("summary-list");
  const participantsList = document.getElementById("participants-list");
  const claimButton = document.getElementById("claim-button");
  const joinButton = document.getElementById("join-button");
  const closeButton = document.getElementById("close-button");
  const statusField = document.getElementById("status-field");
  const statusSelect = document.getElementById("status-select");
  const inviteField = document.getElementById("invite-field");
  const inviteSelect = document.getElementById("invite-select");
  const inviteButton = document.getElementById("invite-button");
  const messageForm = document.getElementById("message-form");
  const messageBody = document.getElementById("message-body");
  const messageAttachments = document.getElementById("message-attachments");
  const messageAttachmentsList = document.getElementById("message-attachments-list");
  const messageBox = document.getElementById("message-box");
  const messagesList = document.getElementById("messages-list");
  const activityList = document.getElementById("activity-list");
  const notificationButton = document.getElementById("notification-button");
  const notificationCount = document.getElementById("notification-count");
  const notificationPanel = document.getElementById("notification-panel");
  const notificationList = document.getElementById("notification-list");

  try {
    state.user = await TicketsApp.requireUser("/");
  } catch (_error) {
    return;
  }

  detailUserPill.textContent = `${state.user.name} - ${state.user.role === "admin" ? "Admin" : "Consultor"}`;

  logoutButton.addEventListener("click", async () => {
    await TicketsApp.api("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  });

  notificationButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !notificationPanel.classList.contains("hidden");
    notificationPanel.classList.toggle("hidden", isOpen);
    notificationButton.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    if (
      !notificationPanel.classList.contains("hidden") &&
      !notificationPanel.contains(event.target) &&
      event.target !== notificationButton
    ) {
      notificationPanel.classList.add("hidden");
      notificationButton.setAttribute("aria-expanded", "false");
    }
  });

  messageAttachments.addEventListener("change", (event) => {
    try {
      state.messageAttachments = mergeSelectedFiles(event.target.files);
      renderSelectedFiles();
      messageAttachments.value = "";
    } catch (error) {
      TicketsApp.createToast(error.message, "error");
    }
  });

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = messageForm.querySelector("button[type='submit']");

    try {
      submitButton.disabled = true;
      await TicketsApp.api(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        body: {
          body: messageBody.value,
          attachments: await Promise.all(
            state.messageAttachments.map((file) => TicketsApp.fileToAttachmentPayload(file))
          )
        }
      });
      resetMessageComposer();
      await loadTicket();
      await loadNotifications();
      TicketsApp.createToast("Mensaje enviado", "success");
    } catch (error) {
      messageBox.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  claimButton.addEventListener("click", async () => {
    await performAction(`/api/tickets/${ticketId}/claim`, "POST", "Ticket asignado");
  });

  joinButton.addEventListener("click", async () => {
    await performAction(`/api/tickets/${ticketId}/join`, "POST", "Te has unido al ticket");
  });

  closeButton.addEventListener("click", async () => {
    await performAction(`/api/tickets/${ticketId}/close`, "POST", "Ticket cerrado");
  });

  statusSelect.addEventListener("change", async () => {
    await performAction(`/api/tickets/${ticketId}/status`, "PATCH", "Estado actualizado", {
      status: statusSelect.value
    });
  });

  inviteButton.addEventListener("click", async () => {
    if (!inviteSelect.value) {
      TicketsApp.createToast("Selecciona un admin", "error");
      return;
    }

    await performAction(`/api/tickets/${ticketId}/invite`, "POST", "Admin invitado", {
      adminId: inviteSelect.value
    });
  });

  async function performAction(url, method, successMessage, body) {
    try {
      await TicketsApp.api(url, {
        method,
        body
      });
      await loadTicket();
      await loadNotifications();
      TicketsApp.createToast(successMessage, "success");
    } catch (error) {
      TicketsApp.createToast(error.message, "error");
    }
  }

  async function loadAdmins() {
    if (state.user.role !== "admin") {
      return;
    }

    const data = await TicketsApp.api("/api/users/admins");
    state.admins = data.admins;
  }

  async function loadNotifications() {
    try {
      const data = await TicketsApp.api("/api/tickets/notifications/summary");
      state.notifications = data.notifications;
      renderNotifications(data.totalUnreadItems);
    } catch (error) {
      TicketsApp.createToast(error.message, "error");
    }
  }

  function renderNotifications(totalUnreadItems) {
    notificationCount.textContent = totalUnreadItems;
    notificationCount.classList.toggle("hidden", totalUnreadItems === 0);

    if (!state.notifications.length) {
      notificationList.innerHTML = '<div class="empty-state">No hay avisos pendientes.</div>';
      return;
    }

    notificationList.innerHTML = state.notifications
      .map(
        (ticket) => `
          <button class="notification-item" type="button" data-ticket-id="${ticket.id}">
            <strong>${TicketsApp.escapeHtml(ticket.reference)} - ${TicketsApp.escapeHtml(ticket.title)}</strong>
            <span>${TicketsApp.escapeHtml(ticket.site)} - ${ticket.unreadCount} novedad(es) - ${TicketsApp.relativeDate(ticket.latestUnreadAt || ticket.updatedAt)}</span>
          </button>
        `
      )
      .join("");

    notificationList.querySelectorAll("[data-ticket-id]").forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = `/ticket/${button.dataset.ticketId}`;
      });
    });
  }

  function renderInviteOptions() {
    if (state.user.role !== "admin" || !state.ticket) {
      return;
    }

    const excludedIds = new Set([
      state.ticket.primaryAdmin?.id,
      ...state.ticket.supportingAdmins.map((admin) => admin.id),
      state.user.id
    ]);

    const candidates = state.admins.filter((admin) => !excludedIds.has(admin.id));
    inviteSelect.innerHTML = candidates.length
      ? candidates
          .map((admin) => `<option value="${admin.id}">${TicketsApp.escapeHtml(admin.name)}</option>`)
          .join("")
      : '<option value="">No hay admins disponibles</option>';
  }

  function renderSummary() {
    const ticket = state.ticket;
    ticketReferenceChip.textContent = ticket.reference;
    ticketHeroTitle.textContent = ticket.title;
    ticketHeroCopy.textContent = ticket.description;
    heroStatus.textContent = TicketsApp.statusLabels[ticket.status];
    heroSeverity.textContent = TicketsApp.severityLabels[ticket.severity];
    heroUpdated.textContent = TicketsApp.relativeDate(ticket.updatedAt);
    document.title = `${ticket.reference} | SiteOps Desk`;

    summaryChips.innerHTML = `
      <span class="chip status-${ticket.status}">${TicketsApp.statusLabels[ticket.status]}</span>
      <span class="chip severity-${ticket.severity}">${TicketsApp.severityLabels[ticket.severity]}</span>
      ${ticket.attachmentCount ? `<span class="chip">${ticket.attachmentCount} adjunto(s)</span>` : ""}
      ${ticket.hasUnread ? `<span class="chip unread-chip">Nuevo ${ticket.unreadCount}</span>` : ""}
    `;

    const invitedNames = ticket.invitedAdmins.length
      ? ticket.invitedAdmins.map((admin) => TicketsApp.escapeHtml(admin.name)).join(", ")
      : "Ninguno";

    summaryList.innerHTML = `
      <div class="summary-item">
        <span>Web</span>
        <strong>${TicketsApp.escapeHtml(ticket.site)}</strong>
      </div>
      <div class="summary-item">
        <span>Consultor</span>
        <strong>${TicketsApp.escapeHtml(ticket.consultant?.name || "-")}</strong>
      </div>
      <div class="summary-item">
        <span>Admin principal</span>
        <strong>${TicketsApp.escapeHtml(ticket.primaryAdmin?.name || "Sin asignar")}</strong>
      </div>
      <div class="summary-item">
        <span>Admins invitados</span>
        <strong>${invitedNames}</strong>
      </div>
      <div class="summary-item">
        <span>Creado</span>
        <strong>${TicketsApp.formatDate(ticket.createdAt)}</strong>
      </div>
      <div class="summary-item">
        <span>Ultima actualizacion</span>
        <strong>${TicketsApp.formatDate(ticket.updatedAt)}</strong>
      </div>
      <div class="summary-item">
        <span>Adjuntos</span>
        <strong>${ticket.attachmentCount ? `${ticket.attachmentCount} fichero(s)` : "Sin adjuntos"}</strong>
      </div>
    `;

    const participantItems = [];
    const seenParticipantIds = new Set();

    [ticket.consultant, ticket.primaryAdmin, ...ticket.supportingAdmins]
      .filter(Boolean)
      .forEach((user) => {
        if (!seenParticipantIds.has(user.id)) {
          seenParticipantIds.add(user.id);
          participantItems.push(user);
        }
      });

    participantsList.innerHTML = participantItems
      .map(
        (user) => `
          <div class="participant">
            <span class="avatar">${TicketsApp.initials(user.name)}</span>
            <div>
              <strong>${TicketsApp.escapeHtml(user.name)}</strong>
              <div class="muted">${user.role === "admin" ? "Admin" : "Consultor"}</div>
            </div>
          </div>
        `
      )
      .join("");

    const isPrimaryMine = ticket.primaryAdmin?.id === state.user.id;
    const isSupportingMine = ticket.supportingAdmins.some((admin) => admin.id === state.user.id);
    const isClosed = ticket.status === "closed";

    claimButton.classList.toggle("hidden", state.user.role !== "admin" || isClosed || Boolean(ticket.primaryAdmin));
    joinButton.classList.toggle("hidden", state.user.role !== "admin" || isClosed || !ticket.primaryAdmin || isPrimaryMine || isSupportingMine);
    closeButton.classList.toggle("hidden", isClosed);
    statusField.classList.toggle("hidden", state.user.role !== "admin");
    inviteField.classList.toggle("hidden", state.user.role !== "admin" || isClosed);
    statusSelect.value = ticket.status;
    messageBody.disabled = isClosed;
    messageAttachments.disabled = isClosed;
    messageForm.querySelector("button[type='submit']").disabled = isClosed;
    renderInviteOptions();
  }

  function renderMessages() {
    const items = [...state.ticket.messages].sort(
      (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
    );

    if (!items.length) {
      messagesList.innerHTML = '<div class="empty-state">Aun no hay mensajes en este ticket.</div>';
      return;
    }

    messagesList.innerHTML = items
      .map(
        (item) => `
          <article class="timeline-item message-entry">
            <div class="timeline-meta">
              <strong>${TicketsApp.escapeHtml(item.authorName)}${item.kind === "description" ? " - Descripcion inicial" : ""}</strong>
              <span>${item.authorRole === "admin" ? "Admin" : "Consultor"} - ${TicketsApp.formatDate(item.createdAt)}</span>
            </div>
            ${item.body ? `<div class="timeline-body">${TicketsApp.escapeHtml(item.body)}</div>` : ""}
            ${renderAttachmentMarkup(item.attachments || [])}
          </article>
        `
      )
      .join("");
  }

  function renderAttachmentMarkup(attachments) {
    if (!attachments.length) {
      return "";
    }

    return `
      <div class="timeline-attachments">
        ${attachments
          .map(
            (attachment) => `
              <div class="attachment-card">
                <div class="attachment-meta">
                  <a class="attachment-link" href="${attachment.url}" target="_blank" rel="noreferrer">
                    ${TicketsApp.escapeHtml(attachment.originalName)}
                  </a>
                  <span>${TicketsApp.formatFileSize(attachment.size)} - ${TicketsApp.escapeHtml(attachment.uploadedByName || "")}</span>
                </div>
                <a class="secondary-button attachment-download" href="${attachment.downloadUrl}">Descargar</a>
                ${attachment.isImage ? `<img class="attachment-image" src="${attachment.url}" alt="${TicketsApp.escapeHtml(attachment.originalName)}" loading="lazy" />` : ""}
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderActivity() {
    const items = [...state.ticket.activityLog].sort(
      (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
    );

    if (!items.length) {
      activityList.innerHTML = '<div class="empty-state">Aun no hay eventos registrados.</div>';
      return;
    }

    activityList.innerHTML = items
      .map(
        (item) => `
          <article class="timeline-item activity-entry">
            <div class="timeline-meta">
              <strong>${TicketsApp.escapeHtml(item.actorName)}</strong>
              <span>${item.actorRole === "admin" ? "Admin" : item.actorRole === "consultant" ? "Consultor" : "Sistema"} - ${TicketsApp.formatDate(item.createdAt)}</span>
            </div>
            <div class="timeline-body">${TicketsApp.escapeHtml(item.description)}</div>
          </article>
        `
      )
      .join("");
  }

  function getFileFingerprint(file) {
    return [file.name, file.size, file.lastModified, file.type].join(":");
  }

  function mergeSelectedFiles(files) {
    const combined = [...state.messageAttachments, ...[...files]];
    const uniqueByFingerprint = new Map(combined.map((file) => [getFileFingerprint(file), file]));
    const deduped = [...uniqueByFingerprint.values()];
    const totalBytes = deduped.reduce((sum, file) => sum + file.size, 0);

    if (deduped.length > TicketsApp.attachmentLimits.maxFiles) {
      throw new Error(`Solo puedes adjuntar ${TicketsApp.attachmentLimits.maxFiles} ficheros por mensaje.`);
    }

    const oversized = deduped.find((file) => file.size > TicketsApp.attachmentLimits.maxFileSize);

    if (oversized) {
      throw new Error(
        `${oversized.name} supera el limite de ${TicketsApp.formatFileSize(TicketsApp.attachmentLimits.maxFileSize)}.`
      );
    }

    if (totalBytes > TicketsApp.attachmentLimits.maxTotalSize) {
      throw new Error(
        `La suma de adjuntos supera ${TicketsApp.formatFileSize(TicketsApp.attachmentLimits.maxTotalSize)}.`
      );
    }

    return deduped;
  }

  function removeSelectedFile(index) {
    state.messageAttachments.splice(index, 1);
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    if (!state.messageAttachments.length) {
      messageAttachmentsList.innerHTML = "";
      return;
    }

    messageAttachmentsList.innerHTML = state.messageAttachments
      .map(
        (file, index) => `
          <div class="selected-file">
            <div class="selected-file-meta">
              <strong>${TicketsApp.escapeHtml(file.name)}</strong>
              <span>${TicketsApp.formatFileSize(file.size)}</span>
            </div>
            <button class="ghost-button selected-file-remove" type="button" data-remove-index="${index}">Quitar</button>
          </div>
        `
      )
      .join("");

    messageAttachmentsList.querySelectorAll("[data-remove-index]").forEach((button) => {
      button.addEventListener("click", () => removeSelectedFile(Number(button.dataset.removeIndex)));
    });
  }

  function resetMessageComposer() {
    messageBody.value = "";
    messageBox.textContent = "";
    state.messageAttachments = [];
    messageAttachments.value = "";
    renderSelectedFiles();
  }

  async function markTicketAsRead() {
    const data = await TicketsApp.api(`/api/tickets/${ticketId}/read`, { method: "POST" });
    state.ticket = data.ticket;
  }

  async function loadTicket(silent = false) {
    try {
      const data = await TicketsApp.api(`/api/tickets/${ticketId}`);
      state.ticket = data.ticket;

      if (state.ticket.hasUnread) {
        await markTicketAsRead();
      }

      renderSummary();
      renderMessages();
      renderActivity();
    } catch (error) {
      if (!silent) {
        TicketsApp.createToast(error.message, "error");
      }
    }
  }

  await loadAdmins();
  await loadTicket();
  await loadNotifications();

  window.setInterval(async () => {
    await loadTicket(true);
    await loadNotifications();
  }, 8000);
});
