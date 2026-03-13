(function bootstrapCommon() {
  const statusLabels = {
    open: "Abierto",
    claimed: "Asignado",
    in_progress: "En progreso",
    waiting_consultant: "Esperando consultor",
    client_replied: "Respondio cliente",
    closed: "Cerrado"
  };

  const severityLabels = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Critica"
  };

  async function api(url, options = {}) {
    const config = {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    };

    if (options.body) {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      throw new Error(payload?.message || "Ha ocurrido un error");
    }

    return payload;
  }

  function formatDate(dateValue) {
    if (!dateValue) {
      return "-";
    }

    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(dateValue));
  }

  function relativeDate(dateValue) {
    if (!dateValue) {
      return "-";
    }

    const seconds = Math.round((new Date(dateValue).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
    const intervals = [
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60]
    ];

    for (const [unit, size] of intervals) {
      const delta = Math.round(seconds / size);

      if (Math.abs(delta) >= 1) {
        return formatter.format(delta, unit);
      }
    }

    return "ahora";
  }

  function initials(name = "") {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function createToast(message, variant = "info") {
    const stack = document.getElementById("toast-stack") || createToastStack();
    const toast = document.createElement("div");
    toast.className = `toast ${variant}`;
    toast.textContent = message;
    stack.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  function createToastStack() {
    const stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
    return stack;
  }

  async function requireUser(redirectPath = "/") {
    try {
      const data = await api("/api/auth/me");
      return data.user;
    } catch (error) {
      window.location.href = redirectPath;
      throw error;
    }
  }

  async function redirectIfAuthenticated() {
    try {
      await api("/api/auth/me");
      window.location.href = "/app";
    } catch (_error) {
      return null;
    }
  }

  function mergeTimeline(ticket, activeTab = "all") {
    const messages = (ticket.messages || []).map((item) => ({
      type: "message",
      title: item.authorName,
      subtitle: item.authorRole === "admin" ? "Admin" : "Consultor",
      body: item.body,
      createdAt: item.createdAt
    }));

    const activities = (ticket.activityLog || []).map((item) => ({
      type: "activity",
      title: item.actorName,
      subtitle: item.actorRole === "admin" ? "Admin" : item.actorRole === "consultant" ? "Consultor" : "Sistema",
      body: item.description,
      createdAt: item.createdAt
    }));

    let items = [...messages, ...activities];

    if (activeTab === "messages") {
      items = messages;
    }

    if (activeTab === "activity") {
      items = activities;
    }

    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  window.TicketsApp = {
    api,
    formatDate,
    relativeDate,
    initials,
    createToast,
    requireUser,
    redirectIfAuthenticated,
    mergeTimeline,
    escapeHtml,
    statusLabels,
    severityLabels
  };
})();
