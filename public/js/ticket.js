document.addEventListener("DOMContentLoaded", async () => {
  const ticketId = window.location.pathname.split("/").filter(Boolean).pop();
  const state = {
    user: null,
    ticket: null,
    admins: [],
    tab: "all"
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
  const messageBox = document.getElementById("message-box");
  const timelineList = document.getElementById("timeline-list");

  try {
    state.user = await TicketsApp.requireUser("/");
  } catch (_error) {
    return;
  }

  detailUserPill.textContent = `${state.user.name} · ${state.user.role === "admin" ? "Admin" : "Consultor"}`;

  logoutButton.addEventListener("click", async () => {
    await TicketsApp.api("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  });

  document.querySelectorAll("[data-timeline-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.timelineTab;
      document.querySelectorAll("[data-timeline-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      renderTimeline();
    });
  });

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await TicketsApp.api(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        body: { body: messageBody.value }
      });
      messageBody.value = "";
      messageBox.textContent = "";
      await loadTicket();
      TicketsApp.createToast("Mensaje enviado", "success");
    } catch (error) {
      messageBox.textContent = error.message;
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
    `;

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
        <span>Creado</span>
        <strong>${TicketsApp.formatDate(ticket.createdAt)}</strong>
      </div>
      <div class="summary-item">
        <span>Ultima actualizacion</span>
        <strong>${TicketsApp.formatDate(ticket.updatedAt)}</strong>
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
    messageForm.querySelector("button[type='submit']").disabled = isClosed;
    renderInviteOptions();
  }

  function renderTimeline() {
    const items = TicketsApp.mergeTimeline(state.ticket, state.tab);

    if (!items.length) {
      timelineList.innerHTML = '<div class="empty-state">No hay actividad para mostrar.</div>';
      return;
    }

    timelineList.innerHTML = items
      .map(
        (item) => `
          <article class="timeline-item">
            <div class="timeline-meta">
              <strong>${TicketsApp.escapeHtml(item.title)}</strong>
              <span>${item.subtitle} · ${TicketsApp.formatDate(item.createdAt)}</span>
            </div>
            <div class="timeline-body">${TicketsApp.escapeHtml(item.body)}</div>
          </article>
        `
      )
      .join("");
  }

  async function loadTicket(silent = false) {
    try {
      const data = await TicketsApp.api(`/api/tickets/${ticketId}`);
      state.ticket = data.ticket;
      renderSummary();
      renderTimeline();
    } catch (error) {
      if (!silent) {
        TicketsApp.createToast(error.message, "error");
      }
    }
  }

  await loadAdmins();
  await loadTicket();

  window.setInterval(() => {
    loadTicket(true);
  }, 8000);
});
