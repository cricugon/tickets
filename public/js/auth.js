document.addEventListener("DOMContentLoaded", async () => {
  await TicketsApp.redirectIfAuthenticated();

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const authMessage = document.getElementById("auth-message");
  const authTabs = document.querySelectorAll("[data-auth-tab]");
  const roleField = document.getElementById("register-role");
  const siteField = document.getElementById("site-field");
  const adminCodeField = document.getElementById("admin-code-field");

  function setAuthTab(tabName) {
    authTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.authTab === tabName);
    });

    loginForm.classList.toggle("hidden", tabName !== "login");
    registerForm.classList.toggle("hidden", tabName !== "register");
    authMessage.textContent = "";
    authMessage.className = "message-box";
  }

  function syncRoleFields() {
    const isAdmin = roleField.value === "admin";
    siteField.classList.toggle("hidden", isAdmin);
    adminCodeField.classList.toggle("hidden", !isAdmin);
  }

  authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  });

  roleField.addEventListener("change", syncRoleFields);
  syncRoleFields();

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      await TicketsApp.api("/api/auth/login", {
        method: "POST",
        body: {
          email: formData.get("email"),
          password: formData.get("password")
        }
      });

      TicketsApp.createToast("Sesion iniciada", "success");
      window.location.href = "/app";
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);

    try {
      await TicketsApp.api("/api/auth/register", {
        method: "POST",
        body: {
          name: formData.get("name"),
          role: formData.get("role"),
          email: formData.get("email"),
          site: formData.get("site"),
          adminCode: formData.get("adminCode"),
          password: formData.get("password")
        }
      });

      TicketsApp.createToast("Cuenta creada correctamente", "success");
      window.location.href = "/app";
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });
});
