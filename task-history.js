(() => {
  const history = window.TodoCompletionHistory;
  let ready = false, pending = [], lastError = '', lastTasks, pendingFlush = false;
  const tasks = () => { try { return JSON.parse(localStorage.getItem('todo-list-mvp'))?.tasks || []; } catch { return []; } };
  function record(items, transition = null, now = new Date()) {
    if (!ready) {
      // Loading observations can be stale. Only real user transitions may wait.
      if (transition && transition.before !== transition.after) pending.push({transition,now});
      return;
    }
    try {
      const previous = localStorage.getItem(history.KEY);
      const snapshot = JSON.stringify(items);
      const taskMutation = lastTasks !== undefined && snapshot !== lastTasks;
      const next = JSON.stringify(history.update(previous,items,{transition,now,taskMutation}));
      if (next !== previous) localStorage.setItem(history.KEY,next);
      lastTasks = snapshot;
      lastError = '';
    } catch (error) { lastError = 'Completion history could not be saved. Export a backup and check available storage.'; console.warn(lastError,error); }
    window.dispatchEvent(new CustomEvent('todo-history-changed'));
  }
  async function editFinish(day,values) {
    if(!ready) throw new Error('Your saved history is still loading. Please try again in a moment.');
    const next=history.editFinish(localStorage.getItem(history.KEY),day,values);
    localStorage.setItem(history.KEY,JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('todo-history-changed'));
    try { await window.TodoLocalPersistence?.saveNow({strict:true}); }
    catch { throw new Error('The correction is saved on this device, but could not be synced or backed up. Check your connection and try Save again.'); }
  }
  function observe() { record(tasks()); }
  function flush() {
    if (!ready) { pendingFlush = true; return; }
    window.TodoLocalPersistence?.saveNow();
  }
  window.TodoTaskHistory = {record,observe,editFinish,read:() => history.read(localStorage.getItem(history.KEY)),get error(){return lastError}};
  Promise.resolve(window.TodoLocalPersistence?.ready).then(() => {
    ready = true;
    const queued = pending; pending = [];
    queued.forEach(item => {
      const hydrated = tasks(), task = hydrated.find(task => String(task.id) === String(item.transition.id));
      const saved = history.read(localStorage.getItem(history.KEY)).completions[String(item.transition.id)];
      if (task && Boolean(task.completed) === item.transition.after && (!saved || saved.updatedAt <= item.now.toISOString())) record(hydrated,item.transition,item.now);
    });
    observe();
    if (pendingFlush) { pendingFlush = false; flush(); }
  });
  let day = history.localDay(new Date()), midnightTimer;
  function scheduleMidnight() {
    window.clearTimeout(midnightTimer);
    const now = new Date(), next = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
    midnightTimer = window.setTimeout(() => {
      day = history.localDay(new Date());
      observe();
      flush();
      scheduleMidnight();
    },Math.max(1,next.getTime()-now.getTime()));
  }
  scheduleMidnight();
  window.setInterval(() => {
    const today = history.localDay(new Date());
    if (today !== day) { day = today; observe(); scheduleMidnight(); }
  },15000);
  document.addEventListener('visibilitychange',() => {
    observe();
    if (document.hidden) flush();
    else scheduleMidnight();
  });
  window.addEventListener('pageshow',observe);
})();
