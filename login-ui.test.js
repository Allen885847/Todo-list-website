const assert = require("node:assert/strict");
const fs = require("node:fs");

const appHtml = fs.readFileSync("app.html", "utf8");
const loginScript = fs.readFileSync("login-ui.js", "utf8");
const loginStyles = fs.readFileSync("login.css", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const ignore = fs.readFileSync(".gitignore", "utf8");

assert.match(appHtml, /id="login-tab"/);
assert.match(appHtml, /id="register-tab"/);
assert.match(appHtml, /id="confirm-password-field"[^>]*hidden/);
assert.match(appHtml, /id="forgot-password"/);
assert.match(appHtml, /id="recovery-panel"/);
assert.match(appHtml, /id="turnstile-widget"/);
assert.match(appHtml, /id="verification-code"/);
assert.match(appHtml, /id="send-recovery-code"/);
assert.match(appHtml, /id="auth-password"[^>]*minlength="8"/);
assert.match(appHtml, /id="app-stage"/);
assert.match(appHtml, /id="account-menu-button"/);
assert.match(appHtml, /id="edit-profile-button"/);
assert.match(appHtml, /id="profile-display-name"[^>]*maxlength="60"/);
assert.match(appHtml, /id="profile-email"[^>]*readonly/);
assert.match(appHtml, /<script src="login-ui\.js"><\/script>/);
assert.doesNotMatch(appHtml, /cloud|supabase/i);

assert.match(loginScript, /function setMode\(nextMode\)/);
assert.match(loginScript, /authPasswordConfirm\.required = registering/);
assert.match(loginScript, /The two passwords must match/);
assert.match(loginScript, /\/api\/auth\/sign-in\/email/);
assert.match(loginScript, /\/api\/auth\/sign-up\/email/);
assert.match(loginScript, /x-captcha-response/);
assert.match(loginScript, /\/api\/auth\/email-otp\/verify-email/);
assert.match(loginScript, /\/api\/auth\/email-otp\/request-password-reset/);
assert.match(loginScript, /\/api\/auth\/email-otp\/reset-password/);
assert.match(loginScript, /Set or reset an existing account password/);
assert.match(loginScript, /\/api\/auth\/sign-out/);
assert.match(loginScript, /\/api\/auth\/update-user/);
assert.match(loginScript, /JSON\.stringify\(\{ name \}\)/);
assert.match(loginScript, /renderAccount\(session\?\.user/);
assert.match(loginScript, /accountMenuEmail\.textContent = currentUser\?\.email/);
assert.match(loginScript, /accountDisplayName\.textContent = displayNameFor\(currentUser\)/);

assert.match(loginStyles, /\.auth-tabs/);
assert.match(loginStyles, /\.verification-fields/);
assert.match(loginStyles, /\.account-menu/);
assert.match(loginStyles, /\.profile-dialog/);
assert.match(loginStyles, /:root\[data-theme="dark"\] \.auth-card/);
assert.match(loginStyles, /@media \(max-width: 600px\)/);
assert.match(server, /\["\/login\.css", \["login\.css", "text\/css; charset=utf-8"\]\]/);
assert.match(server, /\["\/login-ui\.js", \["login-ui\.js", "text\/javascript; charset=utf-8"\]\]/);
assert.doesNotMatch(server, /SUPABASE|\/api\/cloud-config/);

assert.match(ignore, /^\.env\.\*$/m);
assert.match(ignore, /^!\.env\.example$/m);
assert.match(ignore, /^\*\.txt$/m);
assert.match(ignore, /^state\.json$/m);

console.log("Login, registration, and recovery interface passed.");
