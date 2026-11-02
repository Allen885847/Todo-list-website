(() => {
  const status = document.querySelector('#local-status'), file = document.querySelector('#local-backup-file');
  const message = (text, type = '') => { status.textContent = text; status.dataset.type = type; };
  let config, popup, nonce, transfer, incoming, choices = {}, busy = false;
  const review = document.querySelector('#local-review'), save = document.querySelector('#local-save');
  async function api(path, options = {}) {
    if (window.TodoBrowserStorage && path === '/api/desktop/config') return { website: location.origin, hostedAi: true };
    if (window.TodoBrowserStorage && path === '/api/desktop/backup') return TodoBrowserStorage.backup();
    const response = await fetch(path, { ...options, cache: 'no-store' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The request could not be completed.'); return body;
  }
  const backup = () => api('/api/desktop/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const current = () => TodoDataMigration.snapshot('local export');
  document.querySelector('#local-export').addEventListener('click', () => { try { TodoDataMigration.downloadBackup(); message('Backup downloaded. It does not include your API keys.', 'success'); } catch (error) { message(error.message, 'error'); } });
  document.querySelector('#local-choose').addEventListener('click', () => file.click());
  const plan = () => TodoBackupMerge.preview(current().data, incoming, { choices });
  const update = () => { save.disabled = busy || !plan().canSave; };
  file.addEventListener('change', async () => {
    const selected = file.files[0]; if (!selected || busy) return;
    try {
      if (selected.size > 2_000_000) throw new Error('Choose a Todo List backup smaller than 2 MB.');
      incoming = TodoBackupMerge.readBackup(JSON.parse(await selected.text())); choices = {};
      TodoMergeReview.render(document.querySelector('#local-merge-content'), plan(), { choices, currentLabel: 'local', incomingLabel: 'backup', onChange: update }); review.hidden = false; update();
      message('Review the restore below. Nothing has been changed yet.');
    } catch (error) { message(error instanceof SyntaxError ? 'This file is not a valid JSON backup. Choose a Todo List backup and try again.' : error.message, 'error'); } finally { file.value = ''; }
  });
  document.querySelector('#local-cancel').addEventListener('click', () => { if (!busy) { review.hidden = true; incoming = null; message('Restore cancelled.'); } });
  save.addEventListener('click', async () => {
    if (busy || !incoming || !plan().canSave) return;
    busy = true; update();
    try {
      await TodoLocalPersistence.saveNow({ strict: true }); await backup();
      const result = plan();
      Object.entries(result.data).forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
      await TodoLocalPersistence.saveNow({ strict: true }); review.hidden = true; incoming = null;
      message(`Restored safely. ${result.counts.tasks} tasks and ${result.counts.events} events are saved locally. A recovery copy was kept.`, 'success');
    } catch (error) { message(error.message, 'error'); } finally { busy = false; if (incoming) update(); }
  });
  document.querySelector('#local-sync').addEventListener('click', async () => {
    if (!config || busy) return;
    nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
    const params = new URLSearchParams({ origin: location.origin, nonce });
    if (window.TodoBrowserLocal) params.set('mode', 'browser-local');
    popup = window.open(`${config.website}/desktop-sync?${params}`, 'todo-website-sync-' + nonce);
    if (!popup) { message('Allow this tab to open the website, then try Sync to Website again.', 'error'); return; }
    transfer = null; message('Sign in on the website. Return here to confirm sending your data. Nothing has been uploaded.');
  });
  window.addEventListener('message', event => {
    if (!config || event.origin !== config.website || event.source !== popup || event.data?.nonce !== nonce) return;
    if (event.data.type === 'todo-sync-ready') {
      if (transfer || document.querySelector('#local-sync-confirm').open) return;
      document.querySelector('#local-sync-account').textContent = `Send a copy of your local tasks, events, holidays, labels, completion states, and settings to ${event.data.email} at ${new URL(config.website).hostname}? You will review any differences on the website before saving. Your local copy will stay on this computer.`;
      document.querySelector('#local-sync-error').textContent = '';
      document.querySelector('#local-sync-confirm').showModal();
    } else if (event.data.type === 'todo-sync-saved') { transfer = null; message('Sync complete. Your records are available Online, and your local copy is unchanged.', 'success'); }
    else if (event.data.type === 'todo-sync-cancelled') { transfer = null; message('Sync cancelled. Your local copy is unchanged.'); }
  });
  document.querySelector('#local-sync-send').addEventListener('click', async () => {
    if (busy) return;
    if (!popup || popup.closed) { document.querySelector('#local-sync-error').textContent = 'The website tab was closed. Cancel and start Sync to Website again.'; return; }
    busy = true; document.querySelector('#local-sync-send').disabled = true;
    try {
      await TodoLocalPersistence.saveNow({ strict: true }); await backup(); transfer = current();
      if (!document.querySelector('#local-sync-confirm').open || popup.closed) { transfer = null; message('Transfer cancelled. No local data was sent.'); return; }
      popup.postMessage({ type: 'todo-sync-transfer', nonce, payload: transfer }, config.website);
      document.querySelector('#local-sync-confirm').close();
      message('Copy sent for review. Finish the merge in the website tab. Your local data is unchanged.');
    } catch (error) { document.querySelector('#local-sync-error').textContent = error.message; message(error.message, 'error'); } finally { busy = false; document.querySelector('#local-sync-send').disabled = false; }
  });
  document.querySelector('#local-sync-dismiss').addEventListener('click', () => { if (!busy) { document.querySelector('#local-sync-confirm').close(); message('Transfer cancelled. No local data was sent.'); } });
  document.querySelector('#local-ai-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true;
    try {
      await api('/api/desktop/ai-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ DEEPSEEK_API_KEY: form.elements.deepseek.value.trim(), DOUBAO_SPEECH_API_KEY: form.elements.doubao.value.trim() }) });
      form.reset(); config = await api('/api/desktop/config'); showAI(); message('AI connection saved on this computer. You can use AI without signing in.', 'success');
    } catch (error) { message(error.message, 'error'); } finally { button.disabled = false; }
  });
  function showAI() { if(config.hostedAi) { document.querySelector('#local-ai-state').textContent = 'Connected to the website’s hosted DeepSeek and Doubao services. No API key or account is needed.'; return; } document.querySelector('#local-ai-state').textContent = `DeepSeek: ${config.deepseekConfigured ? 'configured' : 'not configured'} · Voice: ${config.voiceConfigured ? 'configured' : 'not configured'}`; }
  api('/api/desktop/config').then(result => { config = result; showAI(); message('Your data is saved locally. Website sync is off unless you choose it.'); }).catch(error => message(error.message, 'error'));
})();
