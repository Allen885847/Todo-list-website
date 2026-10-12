(function exposeTaskRules(root) {
  function localDateIso(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function dueDateIso(task) {
    if (!task?.date) return "";
    return `${Number(task.date.year)}-${String(Number(task.date.month)).padStart(2, "0")}-${String(Number(task.date.day)).padStart(2, "0")}`;
  }

  function normalizeCompletedOn(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;
  }

  function withCompletion(task, completed, today = localDateIso()) {
    return {
      ...task,
      completed: Boolean(completed),
      completedOn: completed ? today : null,
    };
  }

  function isVisibleInActiveList(task, today = localDateIso()) {
    if (!task?.completed) return true;
    return dueDateIso(task) === today && normalizeCompletedOn(task.completedOn) === today;
  }

  const rules = {
    dueDateIso,
    isVisibleInActiveList,
    localDateIso,
    normalizeCompletedOn,
    withCompletion,
  };

  if (typeof module === "object" && module.exports) module.exports = rules;
  root.TodoTaskRules = rules;
}(typeof globalThis === "object" ? globalThis : this));
