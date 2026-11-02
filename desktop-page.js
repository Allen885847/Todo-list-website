(() => {
  const status = document.querySelector('#desktop-status');
  const review = document.querySelector('#desktop-merge-review');
  const content = document.querySelector('#merge-content');
  const save = document.querySelector('#confirm-desktop-merge');
  const fileInput = document.querySelector('#desktop-backup-file');
  let user, incoming, snapshot, beforeImport, choices = {}, busy = false;
  const message = (text, type = '') => { status.textContent = text; status.dataset.type = type; };
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || 'The request failed. Please try again.'), { code: body.code });
    return body;
  }
  const plan = () => TodoBackupMerge.preview(snapshot.data, incoming, { choices, owner: user.id });
  function update() { save.disabled = busy || !plan().canSave; }
  function renderReview() {
    choices = {};
    TodoMergeReview.render(content, plan(), { choices, onChange: update });
    review.hidden = false; update();
  }
  function download(data, label) {
    const blob = new Blob([JSON.stringify({ format: 'ai-todo-list-backup', schemaVersion: 1, label, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `Todo-List-${label}-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  document.querySelector('#choose-desktop-backup').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; if (!file || busy) return;
    try {
      if (!user) throw new Error('Sign in to your Online account before importing a backup.');
      if (file.size > 2_000_000) throw new Error('Choose a Todo List backup smaller than 2 MB.');
      incoming = TodoBackupMerge.readBackup(JSON.parse(await file.text()));
      snapshot = await api('/api/storage');
      renderReview(); message('Review the import below. Nothing has been uploaded or saved yet.');
    } catch (error) { message(error instanceof SyntaxError ? 'This file is not a valid JSON backup. Choose a Todo List backup and try again.' : error.message, 'error'); } finally { fileInput.value = ''; }
  });
  document.querySelector('#cancel-desktop-merge').addEventListener('click', () => { if (!busy) { incoming = null; review.hidden = true; message('Import cancelled. Your data is unchanged.'); } });
  save.addEventListener('click', async () => {
    if (busy || !incoming || !plan().canSave) return;
    busy = true; update(); message('Saving the reviewed merge…');
    try {
      const activeUser = (await api('/api/auth/get-session'))?.user;
      if (activeUser?.id !== user.id) throw new Error('The signed-in account changed. Start again and confirm the correct account.');
      const result = await api('/api/desktop/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: incoming, choices, revision: snapshot.revision, confirmed: true, accountId: user.id }) });
      beforeImport = snapshot.data;
      Object.entries(result.data).forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
      document.querySelector('#export-before-import').hidden = false;
      review.hidden = true; incoming = null;
      message(`Import complete. ${result.counts.tasks} tasks and ${result.counts.events} events are available. Your local file is unchanged.`, 'success');
    } catch (error) {
      if (error.code === 'MERGE_CHANGED') { snapshot = await api('/api/storage'); renderReview(); }
      message(error.message, 'error');
    } finally { busy = false; if (incoming) update(); }
  });
  document.querySelector('#export-online-backup').addEventListener('click', async () => { try { download((await api('/api/storage')).data, 'Online-backup'); message('Online backup downloaded.', 'success'); } catch (error) { message(error.message, 'error'); } });
  document.querySelector('#export-before-import').addEventListener('click', () => download(beforeImport, 'before-import'));
  async function initialize() {
    try {
      user = (await api('/api/auth/get-session'))?.user;
      if (!user) throw new Error('Sign in to your Online account to import or export its data.');
      message(`Signed in as ${user.name || user.email}.`);
    } catch (error) { message(error.message, 'error'); }
    finally { window.parent.postMessage({ type: 'todo-storage-ready' }, location.origin); }
    if (document.documentElement.classList.contains('is-mobile-device')) { document.querySelector('#desktop-mobile-note').hidden = false; return; }
    const downloads = document.querySelector('#desktop-downloads');
    try {
      const manifest = await api('/api/desktop-downloads'); downloads.replaceChildren();
      for (const file of manifest.files || []) {
        const link = document.createElement('a'); link.className = 'desktop-primary'; link.href = file.url; link.textContent = `Download for ${file.arch === 'arm64' ? 'Apple silicon' : 'Intel'} Mac`; link.download = file.filename; downloads.append(link);
      }
      if (!downloads.childElementCount) downloads.textContent = 'The Shortcut download is being prepared. Please check again shortly.';
      document.querySelector('#download-note').textContent = manifest.files?.length ? `Version ${manifest.version}. Each download includes everything needed to run the local server; Node.js does not need to be installed separately.` : '';
    } catch { downloads.textContent = 'Downloads are temporarily unavailable. Please try again.'; }
  }
  initialize();
})();
