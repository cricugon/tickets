document.addEventListener("DOMContentLoaded", async () => {
  const state = {
    user: null,
    tickets: [],
    status: "open",
    scope: "mine",
    site: "all",
    query: "",
    notifications: []
  };

  const currentUserPill = document.getElementById("current-user-pill");
  const logoutButton = document.getElementById("logout-button");
  const heroCopyText = document.getElementById("hero-copy-text");
  const bannerTitle = document.getElementById("banner-title");
  const bannerCopy = document.getElementById("banner-copy");
  const openTicketModalButton = document.getElementById("open-ticket-modal");
  const refreshButton = document.getElementById("refresh-button");
  const searchInput = document.getElementById("search-input");
  const siteFilter = document.getElementById("site-filter");
  const scopeTabs = document.getElementById("scope-tabs");
  const unassignedCount = document.getElementById("unassigned-count");
  const ticketsBody = document.getElementById("tickets-body");
  const ticketsEmpty = document.getElementById("tickets-empty");
  const ticketModal = document.getElementById("ticket-modal");
  const closeTicketModalButton = document.getElementById("close-ticket-modal");
  const ticketForm = document.getElementById("ticket-form");
  const ticketSite = document.getElementById("ticket-site");
  const ticketFormMessage = document.getElementById("ticket-form-message");
  const notificationButton = document.getElementById("notification-button");
  const notificationCount = document.getElementById("notification-count");
  const notificationPanel = document.getElementById("notification-panel");
  const notificationList = document.getElementById("notification-list");

  try {
    state.user = await TicketsApp.requireUser("/");
  } catch (_error) {
    return;
  }

  currentUserPill.textContent = `${state.user.name} · ${state.user.role === "admin" ? "Admin" : "Consultor"}`;
  bannerTitle.textContent = state.user.role === "admin" ? "Panel de admins" : "Tus tickets";
  bannerCopy.textContent =
    state.user.role === "admin"
      ? "Filtra por web, entra al detalle y coordina a los admins participantes."
      : `Estas trabajando sobre la web ${state.user.site}. Crea tickets y sigue su estado.`;
  heroCopyText.textContent =
    state.user.role === "admin"
      ? "Tienes vista global de tickets y puedes encontrar incidencias filtrando por la web del consultor."
      : "Tus tickets quedan ligados a tu web y cada respuesta mueve el estado y los avisos no leidos.";

  if (state.user.role === "consultant") {
    openTicketModalButton.classList.remove("hidden");
    ticketSite.value = state.user.site;
    ticketSite.readOnly = true;
  } else {
    scopeTabs.classList.remove("hidden");
    siteFilter.classList.remove("hidden");
    syncAdminCopy();
    await loadSites();
  }

  function setStatusTab(status) {
    state.status = status;
    document.querySelectorAll("[data-status-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.statusTab === status);
    });
  }

  document.querySelectorAll("[data-status-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      setStatusTab(button.dataset.statusTab);
      await loadTickets();
    });
  });

  document.querySelectorAll("[data-scope-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.scope = button.dataset.scopeTab;
      document.querySelectorAll("[data-scope-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      if (state.scope === "unassigned") {
        setStatusTab("open");
      }
      syncAdminCopy();
      await loadTickets();
    });
  });

  searchInput.addEventListener("input", async (event) => {
    state.query = event.target.value.trim();
    await loadTickets();
  });

  siteFilter.addEventListener("change", async (event) => {
    state.site = event.target.value;
    await loadTickets();
  });

  logoutButton.addEventListener("click", async () => {
    await TicketsApp.api("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  });

  refreshButton.addEventListener("click", async () => {
    await loadTickets();
    await loadNotifications();
  });

  openTicketModalButton.addEventListener("click", () => ticketModal.classList.add("open"));
  closeTicketModalButton.addEventListener("click", () => ticketModal.classList.remove("open"));

  ticketModal.addEventListener("click", (event) => {
    if (event.target === ticketModal) {
      ticketModal.classList.remove("open");
    }
  });

  notificationButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !notificationPanel.classList.contains("hidden");
    notificationPanel.classList.toggle("hidden", isOpen);
    notificationButton.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!notificationPanel.classList.contains("hidden") && !notificationPanel.contains(event.target) && event.target !== notificationButton) {
      notificationPanel.classList.add("hidden");
      notificationButton.setAttribute("aria-expanded", "false");
    }
  });

  ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(ticketForm);

    try {
      ticketFormMessage.textContent = "";
      await TicketsApp.api("/api/tickets", {
        method: "POST",
        body: {
          title: formData.get("title"),
          severity: formData.get("severity"),
          site: formData.get("site"),
          description: formData.get("description")
        }
      });

      TicketsApp.createToast("Ticket creado", "success");
      ticketForm.reset();
      ticketSite.value = state.user.site || "";
      ticketModal.classList.remove("open");
      await loadTickets();
      await loadNotifications();
    } catch (error) {
      ticketFormMessage.textContent = error.message;
    }
  });

  async function loadSites() {
    const data = await TicketsApp.api("/api/users/sites");
    siteFilter.innerHTML = '<option value="all">Todas las webs</option>';
    data.sites.forEach((site) => {
      const option = document.createElement("option");
      option.value = site;
      option.textContent = site;
      siteFilter.appendChild(option);
    });
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
            <strong>${TicketsApp.escapeHtml(ticket.reference)} · ${TicketsApp.escapeHtml(ticket.title)}</strong>
            <span>${TicketsApp.escapeHtml(ticket.site)} · ${ticket.unreadCount} novedad(es) · ${TicketsApp.relativeDate(ticket.latestUnreadAt || ticket.updatedAt)}</span>
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

  function renderMetrics() {
    document.getElementById("metric-visible").textContent = state.tickets.length;
    document.getElementById("metric-critical").textContent = state.tickets.filter((ticket) => ticket.severity === "critical").length;
    document.getElementById("metric-support").textContent = state.tickets.filter((ticket) => (ticket.supportingAdmins || []).length > 0).length;
  }

  function navigateToTicket(ticketId) {
    window.location.href = `/ticket/${ticketId}`;
  }

  function syncAdminCopy() {
    if (state.user.role !== "admin") {
      return;
    }

    if (state.scope === "mine") {
      bannerTitle.textContent = "Panel de admins · Mis tickets";
      bannerCopy.textContent = "Aqui solo ves tickets donde ya participas, te invitaron o eres admin principal.";
      return;
    }

    if (state.scope === "others") {
      bannerTitle.textContent = "Panel de admins · Otros tickets";
      bannerCopy.textContent = "Aqui ves tickets donde aun no participas, para revisarlos y unirte si hace falta.";
      return;
    }

    bannerTitle.textContent = "Panel de admins · Sin atender";
    bannerCopy.textContent = "Cola de tickets abiertos sin ningun admin asignado todavia.";
  }

  function renderTickets() {
    ticketsBody.innerHTML = "";

    if (!state.tickets.length) {
      ticketsEmpty.classList.remove("hidden");
      return;
    }

    ticketsEmpty.classList.add("hidden");

    state.tickets.forEach((ticket) => {
      const safeReference = TicketsApp.escapeHtml(ticket.reference);
      const safeTitle = TicketsApp.escapeHtml(ticket.title);
      const safeDescription = TicketsApp.escapeHtml(ticket.description.slice(0, 90));
      const safeSite = TicketsApp.escapeHtml(ticket.site);
      const safeAdmin = TicketsApp.escapeHtml(ticket.primaryAdmin ? ticket.primaryAdmin.name : "Sin admin principal");
      const unreadMarkup =
        state.user.role === "admin" && state.scope === "others"
          ? '<span class="muted-line">Sin participar</span>'
          : state.user.role === "admin" && state.scope === "unassigned"
            ? '<span class="chip unread-chip">Sin atender</span>'
          : ticket.hasUnread
            ? `<span class="chip unread-chip">Nuevo ${ticket.unreadCount}</span>`
            : '<span class="muted-line">Sin novedades</span>';

      const row = document.createElement("tr");
      row.className = `ticket-row${ticket.hasUnread ? " has-unread" : ""}`;
      row.tabIndex = 0;
      row.setAttribute("role", "link");
      row.dataset.ticketId = ticket.id;
      row.innerHTML = `
        <td><span class="chip status-${ticket.status}">${TicketsApp.statusLabels[ticket.status]}</span></td>
        <td>
          <span class="headline-link">${safeReference}</span>
          <span class="muted-line">${ticket.participantCount} participante(s)</span>
        </td>
        <td>
          <span class="headline-link">${safeTitle}</span>
          <span class="muted-line">${safeDescription}</span>
        </td>
        <td>${safeSite}</td>
        <td>${unreadMarkup}</td>
        <td>${safeAdmin}</td>
        <td>${TicketsApp.relativeDate(ticket.updatedAt)}</td>
      `;

      row.addEventListener("click", () => navigateToTicket(ticket.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigateToTicket(ticket.id);
        }
      });

      ticketsBody.appendChild(row);
    });
  }

  async function loadTickets() {
    try {
      const params = new URLSearchParams({
        status: state.status,
        q: state.query
      });

      if (state.user.role === "admin") {
        params.set("scope", state.scope);
        params.set("site", state.site);
      }

      const data = await TicketsApp.api(`/api/tickets?${params.toString()}`);
      state.tickets = data.tickets;
      renderMetrics();
      renderTickets();

      if (state.user.role === "admin") {
        await loadUnassignedCount();
      }
    } catch (error) {
      TicketsApp.createToast(error.message, "error");
    }
  }

  async function loadUnassignedCount() {
    const params = new URLSearchParams({
      status: "open",
      scope: "unassigned"
    });

    if (state.site && state.site !== "all") {
      params.set("site", state.site);
    }

    const data = await TicketsApp.api(`/api/tickets?${params.toString()}`);
    unassignedCount.textContent = data.tickets.length;
    unassignedCount.classList.toggle("hidden", data.tickets.length === 0);
  }

  await loadTickets();
  await loadNotifications();

  window.setInterval(async () => {
    await loadTickets();
    await loadNotifications();
  }, 15000);
});
