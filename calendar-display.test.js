const assert = require("node:assert/strict");
const fs = require("node:fs");

const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const calendarScript = fs.readFileSync("calendar.js", "utf8");

assert.doesNotMatch(calendarHtml, />\s*Data\s*</);
assert.doesNotMatch(calendarScript, /["'`]All [Dd]ay["'`]/);
assert.match(calendarScript, /createSection\("Tasks & events"/);
assert.match(calendarScript, /appendGroup\("Tasks & events"/);
assert.match(calendarScript, /return event\.endTime \? `\$\{start\}–\$\{formatClockTime\(event\.endTime\)\}` : start;/);

console.log("Calendar labels and controls passed.");
