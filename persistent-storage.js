(function initializePersistentStorage() {
  "use strict";

  const keys = [
    "todo-list-mvp",
    "todo-calendar-events",
    "todo-calendar-events-v2.5",
    "todo-calendar-events-v2.4",
    "todo-appearance",
    "todo-calendar-view",
    "todo-calendar-view-v2.5",
    "todo-data-schema",
    "todo-data-backup-before-v2.5",
  ];
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  let saveTimer;
  let restoring = true;

  function collect() {
    return Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
  }

  async function saveNow({ keepalive = false } = {}) {
    clearTimeout(saveTimer);
    try {
      const cloudMode = location.protocol === "https:" || location.hostname === "localhost";
      const response = await fetch(cloudMode ? "/api/storage" : "/api/local-data", {
        method: cloudMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: 1, data: collect() }),
        keepalive,
      });
      if (!response.ok && response.status !== 401) throw new Error(`Save failed (${response.status}).`);
    } catch (error) {
      console.warn("Local file backup could not be updated.", error);
    }
  }

  function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveNow(), 250);
  }

  function notifyShellReady() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "todo-storage-ready" }, location.origin);
    }
  }

  Storage.prototype.setItem = function setItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && keys.includes(String(key))) scheduleSave();
  };
  Storage.prototype.removeItem = function removeItem(key) {
    nativeRemoveItem.call(this, key);
    if (this === localStorage && keys.includes(String(key))) scheduleSave();
  };

  async function restore() {
    let serverPayload;
    try {
      const cloudMode = location.protocol === "https:" || location.hostname === "localhost";
      const response = await fetch(cloudMode ? "/api/storage" : "/api/local-data", { cache: "no-store" });
      if (response.ok) serverPayload = await response.json();
    } catch (error) {
      console.warn("Local file backup could not be loaded.", error);
    }

    await new Promise((resolve) => {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", resolve, { once: true });
      else resolve();
    });

    const remoteData = serverPayload?.data;
    if (serverPayload?.exists === false) {
      keys.forEach((key) => nativeRemoveItem.call(localStorage, key));
    }
    if (remoteData && Object.values(remoteData).some((value) => typeof value === "string" && value.length)) {
      const localData = collect();
      const before = JSON.stringify(localData);
      try {
        Object.entries(remoteData).forEach(([key, value]) => {
          if (keys.includes(key) && typeof value === "string") nativeSetItem.call(localStorage, key, value);
        });
        window.TodoDataMigration?.importBackup({
          format: "ai-todo-list-backup",
          schemaVersion: serverPayload.schemaVersion || 1,
          data: localData,
        });
      } catch (error) {
        console.warn("Local file backup could not be merged.", error);
      }
      const changed = before !== JSON.stringify(collect());
      restoring = false;
      await saveNow();
      if (changed && sessionStorage.getItem("todo-local-file-restored") !== "yes") {
        sessionStorage.setItem("todo-local-file-restored", "yes");
        location.reload();
        return;
      }
    } else {
      restoring = false;
      await saveNow();
    }
    sessionStorage.removeItem("todo-local-file-restored");
    notifyShellReady();
  }

  window.addEventListener("pagehide", () => saveNow({ keepalive: true }));
  window.TodoLocalPersistence = { collect, saveNow };
  restore();
})();
