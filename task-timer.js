(() => {
  const KEY = 'todo-task-timers-v1';
  // The host waits for the authenticated/local storage restore before reading timers.
  let ready = false;
  const account = () => window.todoAccountId || 'local';
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved?.owner === account() ? saved : {};
    } catch { return {}; }
  };
  let engine = TodoTimerEngine.create();
  let audio;
  let storageError = false;
  let selectedTask;
  const subscribers = new Set();
  const icon = '<svg class="timer-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6M12 2v3m6 1 2 2"/><circle cx="12" cy="14" r="8"/><path d="M12 9v5l3 2"/></svg>';
  const bar = document.createElement('section');
  bar.className = 'timer-bar';
  bar.setAttribute('aria-label', 'Task countdown timer');
  bar.hidden = true;
  bar.innerHTML = `${icon}<div class="timer-bar-info"><strong class="timer-bar-title"></strong><span class="timer-bar-status" role="status"></span></div><span class="timer-countdown" role="timer" aria-live="off"></span><button class="timer-control timer-action" type="button">Pause</button><button class="timer-control timer-end" type="button">End</button><button class="timer-control timer-collapse" type="button" aria-label="Collapse timer"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button>`;
  const picker = document.createElement('dialog');
  picker.className = 'timer-picker';
  picker.setAttribute('aria-labelledby', 'timer-picker-heading');
  picker.innerHTML = `<form><div class="timer-picker-header"><h2 id="timer-picker-heading">Task timer</h2><button class="timer-close" type="button" aria-label="Close timer picker">${'<svg class="timer-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'}</button></div><p class="timer-picker-title"></p><fieldset class="timer-presets"><legend class="timer-sr-only">Duration</legend>${[10,15,20,25,30,'custom'].map(value => `<label><input type="radio" name="timer-duration" value="${value}" ${value === 25 ? 'checked' : ''}><span>${value === 'custom' ? 'Custom' : `${value} min`}</span></label>`).join('')}</fieldset><label class="timer-custom" hidden>Duration in minutes<input type="number" min="1" max="1440" step="1" inputmode="numeric" value="25" disabled></label><p class="timer-picker-error" role="alert"></p><button class="timer-control timer-resume-saved" type="button" hidden>Resume saved timer</button><button class="timer-control timer-start" type="submit">Start timer</button><p class="timer-save-note"></p></form>`;
  document.body.append(bar,picker);
  const find = selector => bar.querySelector(selector);
  const form = picker.querySelector('form');
  const format = ms => {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...engine.state, owner: account() }));
      document.querySelectorAll('iframe.app-view').forEach(frame => frame.contentWindow?.postMessage({ type: 'todo-timer-changed' }, location.origin));
      storageError = false;
    }
    catch { storageError = true; }
  }
  function taskStore() { try { const data = JSON.parse(localStorage.getItem('todo-list-mvp')); return Array.isArray(data?.tasks) ? data.tasks : null; } catch { return null; } }
  function syncTasks() {
    const tasks = taskStore();
    if (tasks) engine.syncTasks(tasks);
  }
  function notify() { subscribers.forEach(callback => { try { callback(); } catch {} }); }
  function displayedTimer() {
    return Object.values(engine.state.timers).find(timer => timer.status === 'expired') || engine.state.timers[engine.state.selected];
  }
  function render() {
    const timer = displayedTimer();
    bar.hidden = !timer;
    bar.classList.toggle('is-collapsed', engine.state.collapsed && timer?.status !== 'expired');
    document.querySelectorAll('iframe.app-view').forEach(frame => {
      try { frame.contentDocument?.body?.classList.toggle('has-task-timer', Boolean(timer)); frame.contentDocument?.documentElement?.classList.toggle('has-task-timer', Boolean(timer)); } catch {}
    });
    if (!timer) { notify(); return; }
    find('.timer-bar-title').textContent = timer.title;
    find('.timer-bar-title').title = timer.title;
    find('.timer-countdown').textContent = format(engine.remaining(timer));
    const statusText = timer.status === 'expired' ? 'Time’s up' : `${timer.status === 'running' ? 'In progress' : 'Paused'}${storageError ? ' · Timer could not be saved' : ''}`;
    if (find('.timer-bar-status').textContent !== statusText) find('.timer-bar-status').textContent = statusText;
    find('.timer-action').hidden = timer.status === 'expired';
    find('.timer-action').textContent = timer.status === 'running' ? 'Pause' : 'Resume';
    find('.timer-end').textContent = timer.status === 'expired' ? 'Dismiss' : 'End';
    const collapse = find('.timer-collapse');
    collapse.hidden = timer.status === 'expired';
    collapse.setAttribute('aria-label', engine.state.collapsed ? 'Expand timer' : 'Collapse timer');
    collapse.setAttribute('aria-expanded', String(!engine.state.collapsed));
    collapse.style.transform = engine.state.collapsed ? 'rotate(180deg)' : '';
    notify();
  }
  async function unlockAudio() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') await audio.resume();
    } catch { /* The visible alert remains available if sound is blocked. */ }
  }
  const alarmOwner = crypto.randomUUID();
  const ALARM_LEASE = 'todo-task-timer-alarm-owner';
  const alarm = TodoTimerAlarm.create({
    getAudio: () => audio,
    claim(id) {
      try {
        const lease = JSON.parse(localStorage.getItem(ALARM_LEASE) || 'null');
        if (lease && lease.owner !== alarmOwner && lease.until > Date.now()) return false;
        if (!lease || lease.owner !== alarmOwner || lease.id !== id || lease.until < Date.now() + 1500) {
          localStorage.setItem(ALARM_LEASE, JSON.stringify({ owner: alarmOwner, id, until: Date.now() + 2500 }));
        }
        return true;
      } catch { return true; }
    },
    release() {
      try {
        if (JSON.parse(localStorage.getItem(ALARM_LEASE) || 'null')?.owner === alarmOwner) localStorage.removeItem(ALARM_LEASE);
      } catch {}
    },
  });
  function tick() {
    if (!ready) return;
    const before = JSON.stringify(engine.state);
    syncTasks();
    engine.tick();
    for (const timer of Object.values(engine.state.timers)) if (timer.status === 'expired' && !timer.notified) {
      timer.notified = true;

    }
    if (before !== JSON.stringify(engine.state)) persist();
    const expired = Object.values(engine.state.timers).find(timer => timer.status === 'expired');
    alarm.update(expired ? `${expired.id}:${expired.startedAt || expired.durationMs}` : null);
    render();
  }
  function mutate(action) {
    if (!ready) return;
    engine = TodoTimerEngine.create(read());
    syncTasks();
    action(engine);
    persist();
    tick();
  }
  window.TodoTimer = {
    unlockAudio,
    format,
    getTaskState(id) { const timer = engine.state.timers[id]; return timer ? { ...timer, remainingMs: engine.remaining(timer) } : null; },
    subscribe(callback) { subscribers.add(callback); callback(); return () => subscribers.delete(callback); },
    open(task) {
      if (!ready || task.completed) return;
      unlockAudio();
      selectedTask = task;
      picker.querySelector('.timer-picker-title').textContent = task.task;
      picker.querySelector('.timer-picker-error').textContent = '';
      const saved = engine.state.timers[task.id];
      const resume = picker.querySelector('.timer-resume-saved');
      resume.hidden = saved?.status !== 'paused';
      resume.textContent = saved ? `Resume saved timer · ${format(engine.remaining(saved))}` : 'Resume saved timer';
      picker.querySelector('.timer-save-note').textContent = Object.values(engine.state.timers).some(timer => timer.status === 'running' && timer.id !== task.id) ? 'Starting this timer pauses your other task timer.' : 'Your timer continues when you open Calendar or refresh.';
      picker.showModal();
    },
    stopTask(id) { mutate(controller => controller.end(id)); },
    sync: tick,
  };
  picker.querySelector('.timer-close').addEventListener('click', () => picker.close());
  picker.addEventListener('click', event => { if (event.target === picker) { const box = picker.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) picker.close(); } });
  form.addEventListener('change', () => { const custom = form.elements['timer-duration'].value === 'custom'; picker.querySelector('.timer-custom').hidden = !custom; picker.querySelector('.timer-custom input').required = custom; picker.querySelector('.timer-custom input').disabled = !custom; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = form.elements['timer-duration'].value;
    const minutes = Number(value === 'custom' ? picker.querySelector('.timer-custom input').value : value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { picker.querySelector('.timer-picker-error').textContent = 'Enter a duration from 1 to 1,440 minutes.'; return; }
    const task = taskStore()?.find(task => task.id === selectedTask?.id);
    if (!task || task.completed) { picker.querySelector('.timer-picker-error').textContent = 'This task was completed or deleted. Choose another task.'; return; }
    unlockAudio();
    mutate(controller => controller.start(task, minutes * 60000));
    picker.close();
  });
  picker.querySelector('.timer-resume-saved').addEventListener('click', () => { unlockAudio(); mutate(controller => controller.resume(selectedTask.id)); picker.close(); });
  find('.timer-action').addEventListener('click', () => { unlockAudio(); mutate(controller => { const timer = controller.state.timers[controller.state.selected]; if (timer?.status === 'running') controller.pause(timer.id); else if (timer) controller.resume(timer.id); }); });
  find('.timer-end').addEventListener('click', () => { const id = displayedTimer()?.id; alarm.stop(); mutate(controller => controller.end(id)); });
  find('.timer-collapse').addEventListener('click', () => mutate(controller => { controller.state.collapsed = !controller.state.collapsed; }));
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'todo-storage-ready') return;
    const ownFrame = [...document.querySelectorAll('iframe.app-view')].some(frame => frame.contentWindow === event.source);
    if (!ownFrame || ready) return;
    ready = true;
    engine = TodoTimerEngine.create(read());
    tick();
  });
  window.addEventListener('storage', event => { if (event.key === KEY) engine = TodoTimerEngine.create(read()); if ([KEY,'todo-list-mvp'].includes(event.key)) tick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', tick);
  window.addEventListener('pagehide', () => alarm.stop());
  setInterval(tick, 250);
  tick();
})();
