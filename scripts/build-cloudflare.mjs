import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
const assets = [
  "app.html",
  "app-shell.css",
  "app-shell.js",
  "login.css",
  "login-ui.js",
  "index.html",
  "style.css",
  "script.js",
  "calendar.html",
  "calendar.css",
  "calendar.js",
  "data.html",
  "data.css",
  "data.js",
  "data-migration.js",
  "persistent-storage.js",
  "task-rules.js",
  "voice-input.js",
  "page-transition.js",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((file) => cp(resolve(root, file), resolve(output, file))));
console.log(`Prepared ${assets.length} Cloudflare assets in ${output}.`);
