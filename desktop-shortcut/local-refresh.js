// Loaded only by the installed, login-free local Shortcut. No page reloads.
(() => {
  let refreshTasks, refreshWeather, midnightTimer, renderedDay = localDay();
  let refreshing = false, animationTimer;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'refresh-local-list';
  button.className = 'calendar-link local-refresh-button';
  button.title = 'Refresh date, tasks, progress, weather and AQI';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>';
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  const tools = document.createElement('div');
  tools.className = 'local-refresh-tools';
  tools.append(button, status);
  document.querySelector('.card-header')?.before(tools);

  function localDay() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }
  function schedule() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(() => refresh(), Math.max(1, next - now));
  }
  function refresh() {
    if (refreshing || !refreshTasks) return;
    refreshing = true;
    try {
      // Update the local UI first. Weather/network delays never block tasks.
      refreshTasks();
      renderedDay = localDay();
      status.textContent = 'Date, tasks and progress refreshed. Weather and AQI update separately when enabled.';
      button.classList.add('is-refreshing');
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => button.classList.remove('is-refreshing'), 400);
    } finally {
      refreshing = false;
      schedule();
    }
    Promise.resolve().then(() => refreshWeather?.()).catch(() => {
      status.textContent = 'Tasks refreshed. Weather could not be updated; try again.';
    });
  }
  function checkDate() {
    if (!document.hidden && localDay() !== renderedDay) refresh();
  }
  window.TodoLocalRefresh = {
    registerTasks(callback) { refreshTasks = callback; schedule(); },
    registerWeather(callback) { refreshWeather = callback; },
    refresh, schedule,
  };
  button.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', checkDate);
  window.addEventListener('focus', checkDate);
  window.addEventListener('pageshow', checkDate);
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.data?.type === 'todo-view-activated') checkDate();
  });
  // Recovers after sleep or a system-clock/time-zone adjustment without reloading.
  setInterval(checkDate, 30000);
})();
