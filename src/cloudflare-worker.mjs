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
    authentication: "pending-configuration",
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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return health(env);
    }

    if (url.pathname.startsWith("/api/")) {
      return pendingAuthentication();
    }

    return env.ASSETS.fetch(request);
  },
};
