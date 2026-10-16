(() => {
  "use strict";

  const authCard = document.querySelector("#auth-card");
  const recoveryPanel = document.querySelector("#recovery-panel");
  const loginTab = document.querySelector("#login-tab");
  const registerTab = document.querySelector("#register-tab");
  const authForm = document.querySelector("#auth-form");
  const authEmail = document.querySelector("#auth-email");
  const authPassword = document.querySelector("#auth-password");
  const confirmField = document.querySelector("#confirm-password-field");
  const authPasswordConfirm = document.querySelector("#auth-password-confirm");
  const passwordHelp = document.querySelector("#password-help");
  const authSubmit = document.querySelector("#auth-submit");
  const forgotPassword = document.querySelector("#forgot-password");
  const authStatus = document.querySelector("#auth-status");
  const backToLogin = document.querySelector("#back-to-login");
  const recoveryForm = document.querySelector("#recovery-form");
  const recoveryEmail = document.querySelector("#recovery-email");
  const recoveryStatus = document.querySelector("#recovery-status");
  let mode = "login";

  function setStatus(element, message) {
    element.textContent = message;
    element.className = "auth-status notice";
  }

  function setMode(nextMode) {
    mode = nextMode;
    const registering = mode === "register";
    loginTab.classList.toggle("active", !registering);
    registerTab.classList.toggle("active", registering);
    loginTab.setAttribute("aria-selected", String(!registering));
    registerTab.setAttribute("aria-selected", String(registering));
    authPassword.autocomplete = registering ? "new-password" : "current-password";
    confirmField.hidden = !registering;
    confirmField.style.display = registering ? "grid" : "none";
    authPasswordConfirm.required = registering;
    authSubmit.textContent = registering ? "Create account" : "Sign in";
    forgotPassword.hidden = registering;
    forgotPassword.style.display = registering ? "none" : "inline-block";
    passwordHelp.textContent = registering
      ? "Use at least eight characters. Email verification will be connected in the cloud step."
      : "Use the password for your existing account.";
    authStatus.textContent = registering
      ? "New accounts will begin with an empty To-Do List after authentication is connected."
      : "Authentication is not connected yet. This is the interface preview only.";
    authStatus.className = "auth-status";
  }

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (mode === "register" && authPassword.value !== authPasswordConfirm.value) {
      setStatus(authStatus, "The two passwords must match.");
      authPasswordConfirm.focus();
      return;
    }
    setStatus(authStatus, mode === "register"
      ? "Registration UI is ready. Account creation will be enabled when cloud authentication is connected."
      : "Sign-in UI is ready. Secure authentication will be enabled in the next cloud step.");
  });

  forgotPassword.addEventListener("click", () => {
    recoveryEmail.value = authEmail.value;
    authCard.hidden = true;
    recoveryPanel.hidden = false;
    requestAnimationFrame(() => recoveryEmail.focus());
  });

  backToLogin.addEventListener("click", () => {
    recoveryPanel.hidden = true;
    authCard.hidden = false;
    requestAnimationFrame(() => authEmail.focus());
  });

  recoveryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus(recoveryStatus, "Password-reset delivery will be enabled when cloud authentication is connected.");
  });

  loginTab.addEventListener("click", () => setMode("login"));
  registerTab.addEventListener("click", () => setMode("register"));
  setMode("login");
})();
