(function initializeTodoDataMigration() {
  "use strict";

  const TASK_KEY = "todo-list-mvp";
  const EVENT_KEY = "todo-calendar-events";
  const LEGACY_EVENT_KEYS = ["todo-calendar-events-v2.5", "todo-calendar-events-v2.4"];
  const APPEARANCE_KEY = "todo-appearance";
  const VIEW_KEYS = ["todo-calendar-view", "todo-calendar-view-v2.5"];
  const BACKUP_KEY = "todo-data-backup-before-v2.5";
  const MIGRATION_KEY = "todo-data-schema";
  const SCHEMA_VERSION = 1;

  function parseJson(value, fallback) {
    if (typeof value !== "string" || !value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function snapshot(label = "manual") {
    const keys = [TASK_KEY, EVENT_KEY, ...LEGACY_EVENT_KEYS, APPEARANCE_KEY, ...VIEW_KEYS, MIGRATION_KEY];
    return {
      format: "ai-todo-list-backup",
      schemaVersion: SCHEMA_VERSION,
      label,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      data: Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
    };
  }

  function ensurePreMigrationBackup() {
    if (localStorage.getItem(BACKUP_KEY)) return;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(snapshot("automatic pre-v2.5 migration")));
  }

  function taskFingerprint(task) {
    const date = task?.date
      ? `${Number(task.date.year)}-${Number(task.date.month)}-${Number(task.date.day)}`
      : "undated";
    return [
      String(task?.task ?? task?.text ?? "").trim().toLocaleLowerCase(),
      String(task?.subject || "General").trim().toLocaleLowerCase(),
      date,
    ].join("|");
  }

  function eventFingerprint(event) {
    if (event?.id) return `id:${String(event.id)}`;
    return [
      String(event?.title || "").trim().toLocaleLowerCase(),
      String(event?.startDate || ""),
      String(event?.endDate || ""),
      String(event?.startTime || ""),
      String(event?.endTime || ""),
      Boolean(event?.allDay),
      Boolean(event?.holiday),
    ].join("|");
  }

  function mergeUnique(items, fingerprint) {
    const merged = [];
    const positions = new Map();
    items.flat().forEach((item) => {
      if (!item || typeof item !== "object") return;
      const key = fingerprint(item);
      if (!key || positions.has(key)) return;
      positions.set(key, merged.length);
      merged.push(item);
    });
    return merged;
  }

  function eventArraysFromData(data) {
    return [EVENT_KEY, ...LEGACY_EVENT_KEYS]
      .map((key) => parseJson(data?.[key], []))
      .filter(Array.isArray);
  }

  function migrateLocalStorage() {
    ensurePreMigrationBackup();
    const data = Object.fromEntries(
      [EVENT_KEY, ...LEGACY_EVENT_KEYS].map((key) => [key, localStorage.getItem(key)]),
    );
    const events = mergeUnique(eventArraysFromData(data), eventFingerprint);
    localStorage.setItem(EVENT_KEY, JSON.stringify(events));
    localStorage.setItem(MIGRATION_KEY, JSON.stringify({ version: SCHEMA_VERSION, migratedAt: new Date().toISOString() }));
    return events.length;
  }

  function importBackup(payload) {
    if (!payload || payload.format !== "ai-todo-list-backup" || !payload.data || typeof payload.data !== "object") {
      throw new Error("This is not a valid Todo List backup file.");
    }

    ensurePreMigrationBackup();
    const currentTaskState = parseJson(localStorage.getItem(TASK_KEY), { title: "Today’s focus", tasks: [], orderMode: "date" });
    const importedTaskState = parseJson(payload.data[TASK_KEY], { title: "Today’s focus", tasks: [], orderMode: "date" });
    const currentTasks = Array.isArray(currentTaskState?.tasks) ? currentTaskState.tasks : [];
    const importedTasks = Array.isArray(importedTaskState?.tasks) ? importedTaskState.tasks : [];
    const tasks = mergeUnique([currentTasks, importedTasks], taskFingerprint);
    const taskState = {
      ...currentTaskState,
      title: currentTasks.length > 0
        ? (currentTaskState.title || "Today’s focus")
        : (importedTaskState.title || currentTaskState.title || "Today’s focus"),
      tasks,
      orderMode: currentTaskState.orderMode === "manual" ? "manual" : "date",
    };
    localStorage.setItem(TASK_KEY, JSON.stringify(taskState));

    const currentData = Object.fromEntries(
      [EVENT_KEY, ...LEGACY_EVENT_KEYS].map((key) => [key, localStorage.getItem(key)]),
    );
    const events = mergeUnique(
      [...eventArraysFromData(currentData), ...eventArraysFromData(payload.data)],
      eventFingerprint,
    );
    localStorage.setItem(EVENT_KEY, JSON.stringify(events));

    [APPEARANCE_KEY, ...VIEW_KEYS].forEach((key) => {
      if (localStorage.getItem(key) === null && typeof payload.data[key] === "string") {
        localStorage.setItem(key, payload.data[key]);
      }
    });
    localStorage.setItem(MIGRATION_KEY, JSON.stringify({ version: SCHEMA_VERSION, migratedAt: new Date().toISOString() }));
    return { tasks: tasks.length, events: events.length };
  }

  function downloadBackup() {
    const payload = snapshot("manual export");
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Todo-List-backup-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.TodoDataMigration = {
    downloadBackup,
    importBackup,
    migrateLocalStorage,
    snapshot,
    storageKeys: { TASK_KEY, EVENT_KEY, BACKUP_KEY, MIGRATION_KEY },
  };

  try {
    migrateLocalStorage();
  } catch (error) {
    console.error("Todo List data migration could not be completed.", error);
  }
})();
