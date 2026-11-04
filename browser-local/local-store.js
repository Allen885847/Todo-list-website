(function(root) {
  const keys = ['todo-list-mvp','todo-calendar-events','todo-calendar-events-v2.5','todo-calendar-events-v2.4','todo-appearance','todo-calendar-view','todo-calendar-view-v2.5','todo-task-timers-v1','todo-completion-history-v1','todo-data-schema','todo-data-backup-before-v2.5','todo-weather-enabled-v1'];
  function create({ storage, indexedDB, now = () => new Date().toISOString(), chooseDirectory } = {}) {
    let databasePromise, queue = Promise.resolve();
    const collect = () => Object.fromEntries(keys.map(key => [key, storage.getItem(key)]));
    function database() {
      return databasePromise ||= new Promise((resolve, reject) => {
        const request = indexedDB.open('todo-local-browser-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async function read(key) {
      const db = await database();
      return new Promise((resolve, reject) => { const request = db.transaction('records').objectStore('records').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    }
    async function write(entries) {
      const db = await database();
      return new Promise((resolve, reject) => { const transaction = db.transaction('records','readwrite'); for (const [key,value] of entries) transaction.objectStore('records').put(value,key); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
    }
    const snapshot = data => ({ format:'ai-todo-list-backup',schemaVersion:1,label:'Local browser save',updatedAt:now(),data });
    async function load() {
      // Capture browser values before asynchronous boot migrations can write defaults.
      const browser = collect(), previous = await read('latest');
      const data = { ...(previous?.data || {}) };
      Object.entries(browser).forEach(([key,value]) => { if (value !== null) data[key] = value; });
      return { schemaVersion:1, data };
    }
    async function writeFile(handle, name, contents) {
      const file = await handle.getFileHandle(name,{create:true});
      const writable = await file.createWritable();
      await writable.write(contents); await writable.close();
    }
    async function saveFolder(payload) {
      const handle = await read('save-folder');
      if (!handle) return;
      if (await handle.queryPermission({mode:'readwrite'}) !== 'granted') {
        await write([['folder-status','permission-required']]); return;
      }
      try {
        const existing = await handle.getFileHandle('Todo-List-local-save.json');
        const day = payload.updatedAt.slice(0,10);
        if (await read('file-backup-day') !== day) {
          const previous = await (await existing.getFile()).text();
          const backups = await handle.getDirectoryHandle('Todo List backups',{create:true});
          await writeFile(backups,`before-save-${day}.json`,previous);
          await write([['file-backup-day',day]]);
        }
      } catch (error) { if (error.name !== 'NotFoundError') throw error; }
      await writeFile(handle,'Todo-List-local-save.json',JSON.stringify(payload,null,2)+'\n');
      await write([['folder-status','saved']]);
    }
    function save(data = collect()) {
      const payload = snapshot(data);
      const operation = queue.catch(() => {}).then(async() => {
        const previous = await read('latest');
        await write([['latest',payload], ...(previous ? [['previous',previous]] : [])]);
        // A missing folder permission must not prevent the independent IndexedDB save.
        try { await saveFolder(payload); } catch { await write([['folder-status','write-failed']]); }
        return { saved:true,updatedAt:payload.updatedAt };
      });
      queue = operation; return operation;
    }
    async function backup() {
      const payload = snapshot(collect()), records = await read('backups') || [];
      records.push(payload); await write([['backups',records.slice(-20)]]);
      return { ok:true,filename:'Recovery copy kept on this device' };
    }
    async function chooseFolder() {
      if (!chooseDirectory) throw new Error('This browser does not support automatic folder backups. Use Download backup instead.');
      const handle = await chooseDirectory({mode:'readwrite',id:'todo-local-data'});
      try {
        await handle.getFileHandle('Todo-List-local-save.json');
        throw new Error('This folder already contains a Todo List save file. Import it with Choose backup first, then choose a new empty folder for automatic saving. The existing file was not changed.');
      } catch(error) { if (error.name !== 'NotFoundError') throw error; }
      await write([['save-folder',handle],['folder-status','saved']]); await save();
      return { saved:true };
    }
    async function resumeFolder() {
      const handle = await read('save-folder');
      if (!handle) return chooseFolder();
      if (await handle.requestPermission({mode:'readwrite'}) !== 'granted') throw new Error('Folder permission was not granted. Your browser save is still available.');
      await save(); return {saved:true};
    }
    async function folderStatus() { return { connected:Boolean(await read('save-folder')),status:await read('folder-status') || 'not-selected' }; }
    return { keys,collect,load,save,backup,chooseFolder,resumeFolder,folderStatus,readRecovery:() => read('previous'),readBackups:() => read('backups') };
  }
  const api = { create,keys };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TodoLocalStore = api;
})(globalThis);
