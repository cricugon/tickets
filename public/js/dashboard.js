document.addEventListener("DOMContentLoaded", async () => {
  const state = {
    user: null,
    tickets: [],
    status: "open",
    site: "all",
    query: ""
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
  const ticketsBody = document.getElementById("tickets-body");
  const ticketsEmpty = document.getElementById("tickets-empty");
  const ticketModal = document.getElementById("ticket-modal");
  const closeTicketModalButton = document.getElementById("close-ticket-modal");
  const ticketForm = document.getElementById("ticket-form");
  const ticketSite = document.getElementById("ticket-site");
  const ticketFormMessage = document.getElementById("ticket-form-message");

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
      : "Tus tickets quedan ligados a tu web y cada respuesta mueve el estado y el timeline.";

  if (state.user.role === "consultant") {
    openTicketModalButton.classList.remove("hidden");
    ticketSite.value = state.user.site;
    ticketSite.readOnly = true;
  } else {
    siteFilter.classList.remove("hidden");
    await loadSites();
  }

  document.querySelectorAll("[data-status-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.status = button.dataset.statusTab;
      document.querySelectorAll("[data-status-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
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

  refreshButton.addEventListener("click", loadTickets);
  openTicketModalButton.addEventListener("click", () => ticketModal.classList.add("open"));
  closeTicketModalButton.addEventListener("click", () => ticketModal.classList.remove("open"));

  ticketModal.addEventListener("click", (event) => {
    if (event.target === ticketModal) {
      ticketModal.classList.remove("open");
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

  function renderMetrics() {
    document.getElementById("metric-visible").textContent = state.tickets.length;
    document.getElementById("metric-critical").textContent = state.tickets.filter((ticket) => ticket.severity === "critical").length;
    document.getElementById("metric-support").textContent = state.tickets.filter((ticket) => (ticket.supportingAdmins || []).length > 0).length;
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
      const row = document.createElement("tr");
      row.className = "ticket-row";
      row.innerHTML = `
        <td><span class="chip status-${ticket.status}">${TicketsApp.statusLabels[ticket.status]}</span></td>
        <td>
          <button type="button" class="headline-link" data-ticket-id="${ticket.id}">${safeReference}</button>
          <span class="muted-line">${ticket.participantCount} participante(s)</span>
        </td>
        <td>
          <span class="headline-link">${safeTitle}</span>
          <span class="muted-line">${safeDescription}</span>
        </td>
        <td>${safeSite}</td>
        <td>${safeAdmin}</td>
        <td>${TicketsApp.relativeDate(ticket.updatedAt)}</td>
      `;
      ticketsBody.appendChild(row);
    });

    ticketsBody.querySelectorAll("[data-ticket-id]").forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = `/ticket/${button.dataset.ticketId}`;
      });
    });
  }

  async function loadTickets() {
    try {
      const params = new URLSearchParams({
        status: state.status,
        q: state.query
      });

      if (state.user.role === "admin") {
        params.set("site", state.site);
      }

      const data = await TicketsApp.api(`/api/tickets?${params.toString()}`);
      state.tickets = data.tickets;
      renderMetrics();
      renderTickets();
    } catch (error) {
      TicketsApp.createToast(error.message, "error");
    }
  }

  await loadTickets();
});
