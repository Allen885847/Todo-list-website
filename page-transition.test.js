const assert = require("node:assert/strict");
const fs = require("node:fs");

const indexHtml = fs.readFileSync("index.html", "utf8");
const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const styles = fs.readFileSync("style.css", "utf8");
const transitions = fs.readFileSync("page-transition.js", "utf8");
const server = fs.readFileSync("server.js", "utf8");

assert.match(indexHtml, /class="composer-region collapsed" aria-hidden="true" inert/);
assert.match(indexHtml, /aria-expanded="false"/);
assert.match(indexHtml, /page-transition\.js/);
assert.match(calendarHtml, /page-transition\.js/);
assert.match(indexHtml, /rel="prefetch" href="calendar\.html"/);
assert.match(calendarHtml, /rel="prefetch" href="index\.html"/);
assert.match(transitions, /a\.calendar-link, a\.back-link/);
assert.match(transitions, /sessionStorage\.setItem\("todo-page-direction", direction\)/);
assert.match(transitions, /prefers-reduced-motion: reduce/);
assert.match(styles, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
assert.match(styles, /page-transition-leaving/);
assert.match(server, /\["\/page-transition\.js", \["page-transition\.js", "text\/javascript; charset=utf-8"\]\]/);

console.log("Page transitions and stable composer boot state passed.");
