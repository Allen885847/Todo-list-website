(() => {
  const api = window.parent !== window ? window.parent.TodoTimer : null;
  if (!api) return;
  const update = () => {
    document.querySelectorAll('[data-timer-task]').forEach(badge => {
      const timer = api.getTaskState(badge.dataset.timerTask);
      badge.hidden = !timer;
      if (timer) badge.textContent = `${timer.status === 'running' ? 'In progress' : timer.status === 'paused' ? 'Paused' : 'Time’s up'} · ${api.format(timer.remainingMs)}`;
    });
  };
  const unsubscribe = api.subscribe(update);
  document.addEventListener('pointerdown', api.unlockAudio, { once: true });
  window.addEventListener('pagehide', unsubscribe, { once: true });
})();
