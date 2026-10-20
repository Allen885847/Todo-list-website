import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
  "task-file-scanner.js",
  "voice-input.js",
  "page-transition.js",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((file) => cp(resolve(root, file), resolve(output, file))));
const vendorAssets = [
  ["node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "vendor/pdf.min.mjs"],
  ["node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "vendor/pdf.worker.min.mjs"],
  ["node_modules/mammoth/mammoth.browser.min.js", "vendor/mammoth.browser.min.js"],
  ["node_modules/tesseract.js/dist/tesseract.min.js", "vendor/tesseract.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "vendor/tesseract.worker.min.js"],
];
await Promise.all(vendorAssets.map(async ([source, destination]) => {
  const target = resolve(output, destination);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, source), target);
}));
console.log(`Prepared ${assets.length} app assets and ${vendorAssets.length} scanner assets in ${output}.`);
