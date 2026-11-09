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

const weather = await worker.fetch(new Request("https://example.com/api/weather?latitude=30.25&longitude=120.21"),env);
assert.equal(weather.status,200);
assert.equal((await weather.json()).provider,'open-meteo','Login-free weather must fail safely without credentials');
assert.equal(weather.headers.get('Access-Control-Allow-Origin'),'*');

const protectedRoute = await worker.fetch(new Request("https://example.com/api/tasks"), env);
assert.equal(protectedRoute.status, 503);
assert.equal((await protectedRoute.json()).code, "AUTH_NOT_CONFIGURED");

const asset = await worker.fetch(new Request("https://example.com/app.html"), env);
assert.equal(await asset.text(), "asset");

console.log("Cloudflare Worker routing and secure pre-auth guard passed.");
