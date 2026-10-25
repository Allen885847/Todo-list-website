const assert = require("node:assert/strict");
const {
  areCurrentTasksComplete,
  compareByDueDate,
  countIncompleteTasks,
  isExtraTask,
  isOptionalOrEarlyTask,
  isVisibleInActiveList,
  shouldCelebrateCurrentTasks,
  withCompletion,
} = require("./task-rules.js");

const date = (year, month, day) => ({ year, month, day });

assert.equal(isVisibleInActiveList({ date: date(2026, 10, 12), completed: false }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 13), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 13), completed: true, completedOn: "2026-10-13" }, "2026-10-14"), false);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 12), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), false);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 14), completed: true, completedOn: "2026-10-13" }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: null, completed: true, completedOn: "2026-10-13" }, "2026-10-13"), true);
assert.equal(isVisibleInActiveList({ date: date(2026, 10, 12), completed: true, completedOn: "2026-10-12" }, "2026-10-13"), false);

const completed = withCompletion({ task: "History worksheet", date: date(2026, 10, 13) }, true, "2026-10-13");
assert.equal(completed.completed, true);
assert.equal(completed.completedOn, "2026-10-13");
assert.equal(withCompletion(completed, false, "2026-10-13").completedOn, null);

const counterTasks = [
  { date: date(2026, 10, 12), completed: false },
  { date: date(2026, 10, 13), completed: false },
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 14), completed: false },
  { date: null, completed: false },
];
assert.deepEqual(countIncompleteTasks(counterTasks, "2026-10-13"), { today: 1, total: 4 });
assert.deepEqual(countIncompleteTasks([
  ...counterTasks.slice(0, 1),
  { ...counterTasks[1], completed: true },
  ...counterTasks.slice(2),
], "2026-10-13"), { today: 0, total: 3 });
assert.deepEqual(countIncompleteTasks([
  { ...counterTasks[0], completed: true },
  ...counterTasks.slice(1),
], "2026-10-13"), { today: 1, total: 3 });
assert.deepEqual(countIncompleteTasks([
  ...counterTasks.slice(0, 3),
  { ...counterTasks[3], completed: true },
  ...counterTasks.slice(4),
], "2026-10-13"), { today: 1, total: 3 });

assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 14), completed: false },
], "2026-10-13"), true);
assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 13), completed: false },
], "2026-10-13"), false);
assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 14), completed: true },
], "2026-10-13"), false);
assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 12), completed: false },
  { date: date(2026, 10, 13), completed: true },
], "2026-10-13"), false);
assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 13), completed: false, label: "Extra" },
], "2026-10-13"), true);
assert.equal(areCurrentTasksComplete([
  { date: date(2026, 10, 13), completed: false, label: "Extra" },
], "2026-10-13"), false);

const currentCompletedTasks = [
  { date: date(2026, 10, 13), completed: true, label: "Extra" },
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 12), completed: true },
  { date: date(2026, 10, 14), completed: false },
];
assert.equal(shouldCelebrateCurrentTasks(currentCompletedTasks, currentCompletedTasks[1], false, "2026-10-13"), true);
assert.equal(shouldCelebrateCurrentTasks(currentCompletedTasks, currentCompletedTasks[1], true, "2026-10-13"), false);
assert.equal(shouldCelebrateCurrentTasks(currentCompletedTasks, currentCompletedTasks[2], false, "2026-10-13"), true);
assert.equal(shouldCelebrateCurrentTasks(currentCompletedTasks, currentCompletedTasks[3], false, "2026-10-13"), false);
assert.equal(shouldCelebrateCurrentTasks(currentCompletedTasks, currentCompletedTasks[0], false, "2026-10-13"), false);
assert.equal(shouldCelebrateCurrentTasks([
  { date: date(2026, 10, 12), completed: true },
  { date: date(2026, 10, 14), completed: true },
], { date: date(2026, 10, 12), completed: true }, false, "2026-10-13"), false);
assert.equal(shouldCelebrateCurrentTasks([
  { date: date(2026, 10, 13), completed: true },
  { date: date(2026, 10, 13), completed: false, label: "Extra" },
], { date: date(2026, 10, 13), completed: true }, false, "2026-10-13"), true);
assert.equal(shouldCelebrateCurrentTasks([
  { date: date(2026, 10, 12), completed: false },
  { date: date(2026, 10, 13), completed: true },
], { date: date(2026, 10, 13), completed: true }, false, "2026-10-13"), false);

assert.equal(isOptionalOrEarlyTask({ label: "Extra", date: date(2026, 10, 13) }, "2026-10-13"), true);
assert.equal(isOptionalOrEarlyTask({ label: " extra ", date: date(2026, 10, 12) }, "2026-10-13"), true);
assert.equal(isOptionalOrEarlyTask({ label: "", date: date(2026, 10, 14) }, "2026-10-13"), true);
assert.equal(isOptionalOrEarlyTask({ label: "Extra", date: date(2026, 10, 14) }, "2026-10-13"), true);
assert.equal(isOptionalOrEarlyTask({ label: "Important", date: date(2026, 10, 13) }, "2026-10-13"), false);
assert.equal(isOptionalOrEarlyTask({ label: "", date: null }, "2026-10-13"), false);
assert.equal(isExtraTask({ label: " Extra " }), true);
assert.equal(isExtraTask({ label: "Important" }), false);

const orderedDates = [
  { date: date(2026, 10, 30) },
  { date: null },
  { date: date(2027, 1, 2) },
  { date: date(2026, 10, 19) },
  { date: date(2025, 12, 31) },
].sort(compareByDueDate).map((task) => task.date
  ? `${task.date.year}-${task.date.month}-${task.date.day}`
  : "undated");

assert.deepEqual(orderedDates, [
  "2025-12-31",
  "2026-10-19",
  "2026-10-30",
  "2027-1-2",
  "undated",
]);

console.log("Task completion visibility rules passed.");
