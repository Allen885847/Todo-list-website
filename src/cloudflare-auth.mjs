import { betterAuth } from "better-auth";
import { captcha, emailOTP } from "better-auth/plugins";
import { sendQQEmail } from "./qq-smtp.mjs";

const REQUIRED_AUTH_CONFIG = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "QQ_SMTP_USER",
  "QQ_SMTP_AUTH_CODE",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_SITE_KEY",
];

function configured(env, key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

export function getAuthReadiness(env) {
  const missing = REQUIRED_AUTH_CONFIG.filter((key) => !configured(env, key));
  return { ready: missing.length === 0, missing };
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail(env, { to, subject, heading, message, actionLabel, actionUrl }) {
  try {
    await sendQQEmail(env, {
      to,
      subject,
      text: `${heading}\n\n${message}\n\n${actionLabel}: ${actionUrl}`,
      html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172126;background:#f8f4ec;padding:32px"><div style="max-width:560px;margin:auto;background:white;border:1px solid #eadfd6;border-radius:20px;padding:32px"><p style="color:#ea6847;font-weight:800;letter-spacing:.12em">TODO-LIST</p><h1>${escapeHtml(heading)}</h1><p style="line-height:1.6">${escapeHtml(message)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#ea6847;color:white;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)}</a></p></div></body></html>`,
    });
    console.log("QQ SMTP delivery completed.");
  } catch (error) {
    console.error("QQ SMTP delivery failed:", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}

async function sendOtpEmail(env, { email, otp, type }) {
  const resetting = type === "forget-password";
  try {
    await sendQQEmail(env, {
      to: email,
      subject: resetting ? "Todo List password reset code" : "Todo List email verification code",
      text: `Your Todo List verification code is ${otp}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.`,
      html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#172126;background:#f8f4ec;padding:32px"><div style="max-width:560px;margin:auto;background:white;border:1px solid #eadfd6;border-radius:20px;padding:32px"><p style="color:#ea6847;font-weight:800;letter-spacing:.12em">TODO-LIST</p><h1>${resetting ? "Reset your password" : "Verify your email"}</h1><p style="line-height:1.6">Enter this six-digit code in Todo List. It expires in 10 minutes and can be used once.</p><p style="font-size:34px;font-weight:800;letter-spacing:.22em;margin:28px 0">${escapeHtml(otp)}</p><p style="color:#667277">If you did not request this, you can ignore this email.</p></div></body></html>`,
    });
    console.log("QQ SMTP OTP delivery completed.");
  } catch (error) {
    console.error("QQ SMTP OTP delivery failed:", error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}

export function createAuth(request, env, ctx) {
  const readiness = getAuthReadiness(env);
  if (!readiness.ready) return null;

  const requestOrigin = new URL(request.url).origin;
  const trustedOrigins = [...new Set([requestOrigin, env.BETTER_AUTH_URL, ...parseList(env.BETTER_AUTH_TRUSTED_ORIGINS)])];
  const allowedHostnames = parseList(env.TURNSTILE_HOSTNAMES);

  return betterAuth({
    appName: "Todo List",
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your Todo List password",
          heading: "Reset your password",
          message: "Use the secure link below to choose a new password. If you did not request this, you can ignore this email.",
          actionLabel: "Reset password",
          actionUrl: url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Verify your Todo List email",
          heading: "Verify your email",
          message: "Confirm this email address to finish creating your private Todo List account.",
          actionLabel: "Verify email",
          actionUrl: url,
        });
      },
    },
    plugins: [
      emailOTP({
        expiresIn: 600,
        otpLength: 6,
        allowedAttempts: 5,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        sendVerificationOnSignUp: true,
        async sendVerificationOTP({ email, otp, type }) {
          await sendOtpEmail(env, { email, otp, type });
        },
      }),
      captcha({
        provider: "cloudflare-turnstile",
        secretKey: env.TURNSTILE_SECRET_KEY,
        endpoints: [
          "/sign-up/email",
          "/sign-in/email",
          "/request-password-reset",
          "/email-otp/send-verification-otp",
          "/email-otp/request-password-reset",
        ],
        ...(allowedHostnames.length ? { allowedHostnames } : {}),
      }),
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
  });
}

export async function getAuthenticatedUser(request, env, ctx) {
  const auth = createAuth(request, env, ctx);
  if (!auth) return { auth: null, session: null };
  const session = await auth.api.getSession({ headers: request.headers });
  return { auth, session };
}
