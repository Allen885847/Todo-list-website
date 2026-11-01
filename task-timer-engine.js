(function (root) {
  const remaining = (timer, now) => timer.status === 'running' ? Math.max(0, timer.endAt - now) : Math.max(0, timer.remainingMs || 0);
  function create(initial = {}, clock = Date.now) {
    const state = { timers: {}, selected: null, collapsed: Boolean(initial.collapsed) };
    for (const [id, timer] of Object.entries(initial.timers || {})) {
      if (id && ['running','paused','expired'].includes(timer.status) && Number.isFinite(timer.remainingMs) && Number.isFinite(timer.durationMs)
        && (timer.status !== 'running' || Number.isFinite(timer.endAt))) state.timers[id] = { ...timer, id };
    }
    state.selected = state.timers[initial.selected] ? initial.selected : Object.keys(state.timers)[0] || null;
    // Recover safely from malformed/older state that contains multiple running timers.
    let running = false;
    for (const timer of Object.values(state.timers)) if (timer.status === 'running') {
      if (running) { timer.remainingMs = remaining(timer, clock()); timer.endAt = null; timer.status = 'paused'; }
      running = true;
    }
    const api = {
      state,
      remaining: timer => remaining(timer, clock()),
      tick() {
        let changed = false;
        for (const timer of Object.values(state.timers)) if (timer.status === 'running' && remaining(timer, clock()) === 0) {
          Object.assign(timer, { status: 'expired', remainingMs: 0, endAt: null, notified: false });
          state.selected = timer.id;
          state.collapsed = false;
          changed = true;
        }
        return changed;
      },
      pause(id) {
        api.tick();
        const timer = state.timers[id];
        if (timer?.status !== 'running') return;
        timer.remainingMs = remaining(timer, clock());
        timer.endAt = null;
        timer.status = 'paused';
      },
      resume(id) {
        api.tick();
        const timer = state.timers[id];
        if (!timer || timer.status !== 'paused' || timer.remainingMs <= 0) return;
        Object.keys(state.timers).filter(key => key !== id).forEach(api.pause);
        timer.status = 'running';
        timer.endAt = clock() + timer.remainingMs;
        state.selected = id;
      },
      start(task, durationMs) {
        if (!task?.id || !Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 86400000) throw new Error('Choose a valid duration.');
        api.tick();
        Object.keys(state.timers).forEach(api.pause);
        state.timers[task.id] = { id: task.id, title: task.task, durationMs, remainingMs: durationMs, startedAt: clock(), endAt: clock() + durationMs, status: 'running', notified: false };
        state.selected = task.id;
        state.collapsed = false;
      },
      end(id) {
        delete state.timers[id];
        if (state.selected === id) state.selected = Object.keys(state.timers).find(key => state.timers[key].status === 'running') || Object.keys(state.timers)[0] || null;
      },
      syncTasks(tasks) {
        for (const id of Object.keys(state.timers)) {
          const task = tasks.find(task => task.id === id);
          if (!task || task.completed) api.end(id);
          else state.timers[id].title = task.task;
        }
      },
    };
    api.tick();
    return api;
  }
  const exported = { create, remaining };
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.TodoTimerEngine = exported;
})(globalThis);
