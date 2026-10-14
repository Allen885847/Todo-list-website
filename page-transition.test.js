const assert = require("node:assert/strict");
const fs = require("node:fs");

const indexHtml = fs.readFileSync("index.html", "utf8");
const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const styles = fs.readFileSync("style.css", "utf8");
const calendarStyles = fs.readFileSync("calendar.css", "utf8");
const transitions = fs.readFileSync("page-transition.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");
const taskScript = fs.readFileSync("script.js", "utf8");
const calendarScript = fs.readFileSync("calendar.js", "utf8");

assert.match(indexHtml, /class="composer-region collapsed" aria-hidden="true" inert/);
assert.match(indexHtml, /aria-expanded="false"/);
assert.match(indexHtml, /page-transition\.js/);
assert.match(calendarHtml, /page-transition\.js/);
assert.match(indexHtml, /rel="prefetch" href="calendar\.html"/);
assert.match(calendarHtml, /rel="prefetch" href="index\.html"/);
assert.match(transitions, /a\.calendar-link, a\.back-link/);
assert.match(transitions, /sessionStorage\.setItem\("todo-page-direction", direction\)/);
assert.match(transitions, /window\.runTodoViewTransition/);
assert.match(transitions, /if \(supportsNativePageTransition && !reducedMotion\.matches\) return/);
assert.match(transitions, /prefers-reduced-motion: reduce/);
assert.match(styles, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
assert.match(styles, /@view-transition\s*\{\s*navigation: auto;/);
assert.match(styles, /page-transition-leaving/);
assert.match(styles, /view-transition-name: task-entry-content/);
assert.match(calendarStyles, /view-transition-name: event-entry-content/);
assert.match(calendarStyles, /dialog-card-in/);
assert.match(calendarStyles, /dialog-backdrop-in/);
assert.match(calendarStyles, /\.editor-dialog\.is-opening \.dialog-card\s*\{\s*overflow-y: hidden;/);
assert.match(taskScript, /runTodoViewTransition\("task-panel", updateMode\)/);
assert.match(calendarScript, /runTodoViewTransition\("event-panel", updateMode\)/);
assert.match(calendarScript, /function closeDialogAnimated\(dialog\)/);
assert.match(calendarScript, /function prepareDialogOpening\(dialog\)/);
assert.match(calendarScript, /dialog\.classList\.remove\("is-opening"\)/);
assert.match(server, /\["\/page-transition\.js", \["page-transition\.js", "text\/javascript; charset=utf-8"\]\]/);

console.log("Page transitions and stable composer boot state passed.");
