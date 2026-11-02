(() => {
  const status=document.querySelector('#local-folder-status'),resume=document.querySelector('#local-folder-resume');
  async function refresh(){const state=await TodoBrowserStorage.folderStatus();resume.hidden=!state.connected||state.status==='saved';status.textContent=state.status==='saved'?'Automatic folder backup is connected.':state.status==='permission-required'?'Your list is saved in Chrome. Reconnect the folder to resume file backups.':state.status==='write-failed'?'Your list is saved in Chrome, but the backup folder could not be written. Reconnect it or download a backup.':'No backup folder selected. Your list is saved in this Chrome profile.';}
  async function run(action){try{await action();await refresh()}catch(error){if(error.name!=='AbortError')status.textContent=error.message}}
  document.querySelector('#local-folder-choose').addEventListener('click',()=>run(()=>TodoBrowserStorage.chooseFolder()));
  resume.addEventListener('click',()=>run(()=>TodoBrowserStorage.resumeFolder()));
  refresh().catch(()=>{status.textContent='Folder backups are unavailable. You can still download a backup.'});
})();
