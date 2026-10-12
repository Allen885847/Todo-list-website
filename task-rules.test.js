const assert = require("node:assert/strict");
const {
  isVisibleInActiveList,
  withCompletion,
} = require("./task-rules.js");

const date = (year, month, day) => ({ year, month, day });

assert.equal(isVisibleInActiveList({ date: date(2026, 10, 12), completed: false }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 13), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 13), completed: true, completedOn: "2026-10-13" }, "2026-10-14"), false);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 12), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), false);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 14), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), false);
assert.equal(isVisibleInActiveList({ date: null, completed: true, completedOn: "2026-10-13" }, "2026-10-13"), false);

const completed = withCompletion({ task: "History worksheet", date: date(2026, 10, 13) }, true, "2026-10-13");
assert.equal(completed.completed, true);
assert.equal(completed.completedOn, "2026-10-13");
assert.equal(withCompletion(completed, false, "2026-10-13").completedOn, null);

console.log("Task completion visibility rules passed.");
