(() => {
  const params = new URLSearchParams(location.search);
  const origin = params.get('origin'), nonce = params.get('nonce');
  const status = document.querySelector('#sync-status'), save = document.querySelector('#sync-save');
  let user, incoming, snapshot, choices = {}, busy = false;
  const valid = /^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(origin || '') && Number(new URL(origin).port) <= 65535 && /^[a-f0-9]{32}$/.test(nonce || '') && window.opener;
  const message = (text, type = '') => { status.textContent = text; status.dataset.type = type; };
  const send = data => window.opener?.postMessage({ ...data, nonce }, origin);
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json(); if (!response.ok) throw Object.assign(new Error(body.error || 'The request failed.'), { code: body.code }); return body;
  }
  const plan = () => TodoBackupMerge.preview(snapshot.data, incoming, { choices, owner: user.id });
  const update = () => { save.disabled = busy || !plan().canSave; };
  function review() {
    choices = {};
    TodoMergeReview.render(document.querySelector('#sync-merge-content'), plan(), { choices, onChange: update });
    document.querySelector('#sync-review').hidden = false; document.querySelector('#sync-waiting').hidden = true; update();
  }
  window.addEventListener('message', async event => {
    if (!valid || !user || event.origin !== origin || event.source !== window.opener || event.data?.nonce !== nonce || event.data?.type !== 'todo-sync-transfer' || busy || incoming) return;
    try {
      const activeUser = (await api('/api/auth/get-session'))?.user;
      if (activeUser?.id !== user.id) throw new Error('The signed-in account changed. Start Sync to Website again and confirm the correct account.');
      incoming = TodoBackupMerge.readBackup(event.data.payload);
      snapshot = await api('/api/storage'); review(); message('Review the merge. Your account has not changed yet.');
    } catch (error) { incoming = null; message(error.message, 'error'); }
  });
  save.addEventListener('click', async () => {
    if (busy || !incoming || !plan().canSave) return;
    busy = true; update(); message('Saving the reviewed merge…');
    try {
      const activeUser = (await api('/api/auth/get-session'))?.user;
      if (activeUser?.id !== user.id) throw new Error('The signed-in account changed. Start again and confirm the correct account.');
      const result = await api('/api/desktop/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: incoming, choices, revision: snapshot.revision, confirmed: true, accountId: user.id }) });
      Object.entries(result.data).forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
      send({ type: 'todo-sync-saved', counts: result.counts });
      document.querySelector('#sync-review').hidden = true; incoming = null;
      message(`Synced successfully: ${result.counts.tasks} tasks and ${result.counts.events} events are available Online. Your local copy is unchanged. You can close this tab.`, 'success');
    } catch (error) {
      if (error.code === 'MERGE_CHANGED') { snapshot = await api('/api/storage'); review(); }
      message(error.message, 'error');
    } finally { busy = false; if (incoming) update(); }
  });
  document.querySelector('#sync-cancel').addEventListener('click', () => { if (!busy) { incoming = null; send({ type: 'todo-sync-cancelled' }); document.querySelector('#sync-review').hidden = true; message('Sync cancelled. Local and Online data are unchanged.'); } });
  async function initialize() {
    if (!valid) { document.querySelector('#sync-waiting').hidden = true; message('Start Sync to Website from the local Shortcut. Keep that tab open while signing in.', 'error'); return; }
    try {
      user = (await api('/api/auth/get-session'))?.user;
      if (!user) {
        sessionStorage.setItem('todo-desktop-sync-return', '/desktop-sync?' + params.toString());
        document.querySelector('#sync-sign-in').hidden = false;
        document.querySelector('#sync-account').textContent = 'Sign in to choose the Online account that will receive your local data.';
        return;
      }
      document.querySelector('#sync-account').textContent = `${user.name || 'Online account'} · ${user.email}`;
      send({ type: 'todo-sync-ready', email: user.email });
      message('Waiting for your confirmation in the local tab.');
    } catch (error) { message(error.message, 'error'); }
  }
  initialize();
})();
