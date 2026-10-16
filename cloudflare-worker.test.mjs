import assert from "node:assert/strict";
import worker from "./src/cloudflare-worker.mjs";

const env = {
  DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
  BUCKET: {},
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
};

const health = await worker.fetch(new Request("https://example.com/api/health"), env);
assert.equal(health.status, 200);
assert.equal((await health.json()).database, "ready");

const protectedRoute = await worker.fetch(new Request("https://example.com/api/tasks"), env);
assert.equal(protectedRoute.status, 503);
assert.equal((await protectedRoute.json()).code, "AUTH_NOT_CONFIGURED");

const asset = await worker.fetch(new Request("https://example.com/app.html"), env);
assert.equal(await asset.text(), "asset");

console.log("Cloudflare Worker routing and secure pre-auth guard passed.");
