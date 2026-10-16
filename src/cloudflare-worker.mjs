import { createAuth, getAuthenticatedUser, getAuthReadiness } from "./cloudflare-auth.mjs";
import { handleDataRequest } from "./cloudflare-data.mjs";
import { handleAiRequest } from "./cloudflare-ai.mjs";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function health(env) {
  let database = "unavailable";
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    database = "ready";
  } catch {
    database = "unavailable";
  }

  return json({
    service: "todo-list-online",
    status: database === "ready" ? "ready" : "degraded",
    database,
    objectStorage: env.BUCKET ? "bound" : "unavailable",
    authentication: getAuthReadiness(env).ready ? "ready" : "pending-configuration",
  }, database === "ready" ? 200 : 503);
}

function pendingAuthentication() {
  return json({
    error: "Cloud authentication is not enabled yet.",
    code: "AUTH_NOT_CONFIGURED",
    next: "Configure Better Auth, email delivery, and Turnstile before enabling user data routes.",
  }, 503);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const executionContext = ctx || { waitUntil: (promise) => promise.catch(console.error) };

    if (url.pathname === "/api/health" && request.method === "GET") {
      return health(env);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
        authenticationReady: getAuthReadiness(env).ready,
      });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(request, env, executionContext);
      return auth ? auth.handler(request) : pendingAuthentication();
    }

    if (url.pathname.startsWith("/api/")) {
      const { auth, session } = await getAuthenticatedUser(request, env, executionContext);
      if (!auth) return pendingAuthentication();
      if (!session?.user?.id) return json({ error: "Sign in is required.", code: "UNAUTHORIZED" }, 401);
      const aiResponse = await handleAiRequest(request, env, session.user.id);
      if (aiResponse) return aiResponse;
      return handleDataRequest(request, env, session.user.id);
    }

    return env.ASSETS.fetch(request);
  },
};
