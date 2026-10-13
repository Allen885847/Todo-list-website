const assert = require("node:assert/strict");
const fs = require("node:fs");

const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const calendarScript = fs.readFileSync("calendar.js", "utf8");

assert.doesNotMatch(calendarHtml, />\s*Data\s*</);
assert.doesNotMatch(calendarScript, /["'`]All [Dd]ay["'`]/);
assert.doesNotMatch(calendarScript, /createSection\("Schedule"|appendGroup\("Schedule"/);
assert.match(calendarScript, /createSection\("Tasks", tasks, \[\]/);
assert.match(calendarScript, /createSection\("Events", \[\], \[\.\.\.allDayEvents, \.\.\.timedEvents\]/);
assert.match(calendarScript, /appendGroup\("Tasks", tasks, \[\]\)/);
assert.match(calendarScript, /appendGroup\("Events", \[\], \[/);
assert.match(calendarScript, /return event\.endTime \? `\$\{start\}–\$\{formatClockTime\(event\.endTime\)\}` : start;/);
assert.match(calendarScript, /function startOfMondayWeek\(date\)/);
assert.match(calendarScript, /function renderWeek\(\) \{\s*const weekStart = startOfMondayWeek\(selectedDate\);/);
assert.match(calendarScript, /function renderMonth\(\)[\s\S]*?const gridStart = startOfWeek\(first\);/);

console.log("Calendar labels and controls passed.");
