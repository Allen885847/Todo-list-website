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

  function compareByDueDate(first, second) {
    const firstDate = dueDateIso(first);
    const secondDate = dueDateIso(second);
    if (!firstDate && !secondDate) return 0;
    if (!firstDate) return 1;
    if (!secondDate) return -1;
    return firstDate.localeCompare(secondDate);
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
    const dueDate = dueDateIso(task);
    if (dueDate && dueDate < today) return false;
    return normalizeCompletedOn(task.completedOn) === today;
  }

  function areCurrentTasksComplete(tasks, today = localDateIso()) {
    const currentTasks = (Array.isArray(tasks) ? tasks : [])
      .filter((task) => dueDateIso(task) && dueDateIso(task) <= today);
    const hasTaskDueToday = currentTasks.some((task) => dueDateIso(task) === today);
    return hasTaskDueToday && currentTasks.every((task) => task.completed);
  }

  function shouldCelebrateCurrentTasks(tasks, completedTask, wereCurrentTasksComplete, today = localDateIso()) {
    const completedDueDate = dueDateIso(completedTask);
    return Boolean(
      completedTask?.completed
      && completedDueDate
      && completedDueDate <= today
      && !wereCurrentTasksComplete
      && areCurrentTasksComplete(tasks, today)
    );
  }

  function isOptionalOrEarlyTask(task, today = localDateIso()) {
    const isExtra = String(task?.label || "").trim().toLowerCase() === "extra";
    const dueDate = dueDateIso(task);
    return isExtra || Boolean(dueDate && dueDate > today);
  }

  const rules = {
    areCurrentTasksComplete,
    compareByDueDate,
    dueDateIso,
    isOptionalOrEarlyTask,
    isVisibleInActiveList,
    localDateIso,
    normalizeCompletedOn,
    shouldCelebrateCurrentTasks,
    withCompletion,
  };

  if (typeof module === "object" && module.exports) module.exports = rules;
  root.TodoTaskRules = rules;
}(typeof globalThis === "object" ? globalThis : this));
