(() => {
  const system = matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    let saved = 'system';
    try { saved = localStorage.getItem('todo-appearance') || 'system'; } catch {}
    const mode = ['light','dark','system'].includes(saved) ? saved : 'system';
    document.documentElement.dataset.appearance = mode;
    document.documentElement.dataset.theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
  }
  window.addEventListener('storage', event => { if (event.key === 'todo-appearance') apply(); });
  window.addEventListener('message', event => { if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'todo-appearance-sync') apply(); });
  system.addEventListener('change', apply);
  apply();
})();
