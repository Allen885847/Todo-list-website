import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  "flip-clock.js",
  "flip-clock.css",
  "weather.js",
  "weather.css",
  "task-timer-engine.js",
  "task-timer-alarm.js",
  "task-timer.js",
  "task-timer-bindings.js",
  "task-timer.css",
  "calendar.html",
  "calendar.css",
  "impeccable.css",
  "calendar.js",
  "desktop.html",
  "desktop-theme.js",
  "desktop-page.css",
  "desktop-page.js",
  "desktop-availability.js",
  "desktop-sync.html",
  "desktop-sync.js",
  "backup-merge.js",
  "merge-review.js",
  "data.html",
  "data.css",
  "data.js",
  "data-migration.js",
  "persistent-storage.js",
  "task-rules.js",
  "completion-history.js",
  "task-history.js",
  "stats-panel.js",
  "stats-panel.css",
  "task-file-scanner.js",
  "voice-input.js",
  "page-transition.js",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map((file) => cp(resolve(root, file), resolve(output, file))));

const packageConfig = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (typeof packageConfig.version !== "string" || !packageConfig.version.trim()) {
  throw new Error("package.json must provide a non-empty version.");
}
const builtIndexPath = resolve(output, "index.html");
const builtIndex = await readFile(builtIndexPath, "utf8");
if (!builtIndex.includes("__APP_VERSION__")) {
  throw new Error("index.html is missing the app version placeholder.");
}
await writeFile(builtIndexPath, builtIndex.replaceAll("__APP_VERSION__", packageConfig.version.trim()));

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
await import('./build-browser-local.mjs');
