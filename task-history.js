(() => {
  const history = window.TodoCompletionHistory;
  let ready = false, pending = [], lastError = '';
  const tasks = () => { try { return JSON.parse(localStorage.getItem('todo-list-mvp'))?.tasks || []; } catch { return []; } };
  function record(items, transition = null, now = new Date()) {
    if (!ready) {
      // Loading observations can be stale. Only real user transitions may wait.
      if (transition && transition.before !== transition.after) pending.push({transition,now});
      return;
    }
    try {
      const previous = localStorage.getItem(history.KEY);
      const next = JSON.stringify(history.update(previous,items,{transition,now}));
      if (next !== previous) localStorage.setItem(history.KEY,next);
      lastError = '';
    } catch (error) { lastError = 'Completion history could not be saved. Export a backup and check available storage.'; console.warn(lastError,error); }
    window.dispatchEvent(new CustomEvent('todo-history-changed'));
  }
  function observe() { record(tasks()); }
  window.TodoTaskHistory = {record,observe,read:() => history.read(localStorage.getItem(history.KEY)),get error(){return lastError}};
  Promise.resolve(window.TodoLocalPersistence?.ready).then(() => {
    ready = true;
    const queued = pending; pending = [];
    queued.forEach(item => {
      const hydrated = tasks(), task = hydrated.find(task => String(task.id) === String(item.transition.id));
      const saved = history.read(localStorage.getItem(history.KEY)).completions[String(item.transition.id)];
      if (task && Boolean(task.completed) === item.transition.after && (!saved || saved.updatedAt <= item.now.toISOString())) record(hydrated,item.transition,item.now);
    });
    observe();
  });
  let day = history.localDay(new Date());
  window.setInterval(() => {
    const today = history.localDay(new Date());
    if (today !== day) { day = today; observe(); }
  },15000);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) observe()});
  window.addEventListener('pageshow',observe);
})();
