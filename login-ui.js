(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const authStage = $("#auth-stage");
  const authCard = $("#auth-card");
  const recoveryPanel = $("#recovery-panel");
  const resetStage = $("#reset-stage");
  const appStage = $("#app-stage");
  const loginTab = $("#login-tab");
  const registerTab = $("#register-tab");
  const authForm = $("#auth-form");
  const authEmail = $("#auth-email");
  const authPassword = $("#auth-password");
  const confirmField = $("#confirm-password-field");
  const authPasswordConfirm = $("#auth-password-confirm");
  const passwordHelp = $("#password-help");
  const authSubmit = $("#auth-submit");
  const forgotPassword = $("#forgot-password");
  const authStatus = $("#auth-status");
  const backToLogin = $("#back-to-login");
  const recoveryForm = $("#recovery-form");
  const recoveryEmail = $("#recovery-email");
  const recoveryStatus = $("#recovery-status");
  const resetForm = $("#reset-form");
  const resetPassword = $("#reset-password");
  const resetPasswordConfirm = $("#reset-password-confirm");
  const resetStatus = $("#reset-status");
  const accountEmail = $("#account-email");
  const logoutButton = $("#logout-button");
  const turnstileContainer = $("#turnstile-widget");
  let mode = "login";
  let busy = false;
  let turnstileWidgetId = null;
  let turnstileToken = "";
  let appStarted = false;

  function setStatus(element, message, type = "notice") {
    element.textContent = message;
    element.className = `auth-status ${type}`;
  }

  async function api(path, options = {}) {
    const headers = options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : (options.headers || {});
    const response = await fetch(path, { ...options, credentials: "same-origin", headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || result.error || "The request could not be completed.");
      error.status = response.status;
      error.code = result.code;
      throw error;
    }
    return result;
  }

  function setBusy(active) {
    busy = active;
    authSubmit.disabled = active;
    loginTab.disabled = active;
    registerTab.disabled = active;
  }

  function resetTurnstile() {
    turnstileToken = "";
    if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
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
      ? "Use at least eight characters. We will send an email verification link."
      : "Use the password for your existing account.";
    setStatus(authStatus, registering
      ? "New accounts start with a completely empty To-Do List."
      : "Sign in to securely restore your private tasks and calendar.");
    resetTurnstile();
  }

  function startApplication(user) {
    authStage.hidden = true;
    resetStage.hidden = true;
    appStage.hidden = false;
    accountEmail.textContent = user?.email || "Signed in";
    if (appStarted) return;
    appStarted = true;
    const script = document.createElement("script");
    script.src = "app-shell.js";
    document.body.append(script);
  }

  async function initializeTurnstile(siteKey) {
    if (!siteKey) throw new Error("Security configuration is missing.");
    await new Promise((resolve, reject) => {
      if (window.turnstile) return resolve();
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: siteKey,
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      callback: (token) => { turnstileToken = token; },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => setStatus(authStatus, "The security check could not load. Please retry.", "error"),
    });
  }

  async function initialize() {
    const parameters = new URLSearchParams(location.search);
    if (parameters.has("token") || parameters.has("error")) {
      authStage.hidden = true;
      resetStage.hidden = false;
      if (parameters.has("error")) setStatus(resetStatus, "This password-reset link is invalid or expired.", "error");
      return;
    }
    try {
      const session = await api("/api/auth/get-session", { method: "GET" });
      if (session?.user) return startApplication(session.user);
    } catch (error) {
      if (error.status === 503) {
        setStatus(authStatus, "Cloud sign-in is still being configured.", "error");
        return;
      }
    }
    try {
      const config = await api("/api/config", { method: "GET" });
      if (!config.authenticationReady) {
        setStatus(authStatus, "Cloud sign-in is still being configured.", "error");
        return;
      }
      await initializeTurnstile(config.turnstileSiteKey);
      setMode("login");
    } catch {
      setStatus(authStatus, "Secure sign-in could not be initialized. Please refresh.", "error");
    }
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (mode === "register" && authPassword.value !== authPasswordConfirm.value) {
      setStatus(authStatus, "The two passwords must match.", "error");
      authPasswordConfirm.focus();
      return;
    }
    if (!turnstileToken) {
      setStatus(authStatus, "Please complete the security check.", "error");
      return;
    }
    setBusy(true);
    setStatus(authStatus, mode === "register" ? "Creating your account…" : "Signing in…");
    try {
      const path = mode === "register" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const body = mode === "register"
        ? { name: authEmail.value.split("@")[0], email: authEmail.value, password: authPassword.value, callbackURL: "/app.html" }
        : { email: authEmail.value, password: authPassword.value, callbackURL: "/app.html", rememberMe: true };
      const result = await api(path, {
        method: "POST",
        headers: { "x-captcha-response": turnstileToken },
        body: JSON.stringify(body),
      });
      if (mode === "register" && !result?.token) {
        setMode("login");
        setStatus(authStatus, "Account created. Check your email to verify it before signing in.");
      } else {
        startApplication(result.user);
      }
    } catch (error) {
      setStatus(authStatus, error.status === 403
        ? "Please verify your email address before signing in."
        : error.message, "error");
    } finally {
      setBusy(false);
      resetTurnstile();
    }
  });

  forgotPassword.addEventListener("click", () => {
    recoveryEmail.value = authEmail.value;
    authCard.hidden = true;
    recoveryPanel.hidden = false;
    recoveryForm.insertBefore(turnstileContainer, recoveryForm.querySelector("button"));
    resetTurnstile();
    requestAnimationFrame(() => recoveryEmail.focus());
  });

  backToLogin.addEventListener("click", () => {
    recoveryPanel.hidden = true;
    authCard.hidden = false;
    authForm.insertBefore(turnstileContainer, authSubmit);
    resetTurnstile();
    requestAnimationFrame(() => authEmail.focus());
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !turnstileToken) {
      setStatus(recoveryStatus, "Please complete the security check.", "error");
      return;
    }
    busy = true;
    try {
      await api("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "x-captcha-response": turnstileToken },
        body: JSON.stringify({ email: recoveryEmail.value, redirectTo: `${location.origin}/app.html` }),
      });
      setStatus(recoveryStatus, "If that account exists, a reset link has been sent.");
    } catch (error) {
      setStatus(recoveryStatus, error.message, "error");
    } finally {
      busy = false;
      resetTurnstile();
    }
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (resetPassword.value !== resetPasswordConfirm.value) {
      setStatus(resetStatus, "The two passwords must match.", "error");
      return;
    }
    try {
      const token = new URLSearchParams(location.search).get("token");
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: resetPassword.value, token }),
      });
      setStatus(resetStatus, "Password updated. Returning to sign in…");
      setTimeout(() => { location.href = "/app.html"; }, 700);
    } catch (error) {
      setStatus(resetStatus, error.message, "error");
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try { await api("/api/auth/sign-out", { method: "POST", body: "{}" }); } finally { location.href = "/app.html"; }
  });
  loginTab.addEventListener("click", () => setMode("login"));
  registerTab.addEventListener("click", () => setMode("register"));
  initialize();
})();
