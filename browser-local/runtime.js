(() => {
  if (!location.pathname.startsWith('/local/')) return;
  window.TodoBrowserLocal = true;
  const {prefix} = TodoStorageNamespace.install({StorageClass:Storage,local:localStorage,session:sessionStorage});
  window.addEventListener('storage', event => {
    if (event.todoLocalEvent) return;
    event.stopImmediatePropagation();
    if (!event.key?.startsWith(prefix)) return;
    const logical = new StorageEvent('storage',{key:event.key.slice(prefix.length),oldValue:event.oldValue,newValue:event.newValue,url:event.url,storageArea:event.storageArea});
    Object.defineProperty(logical,'todoLocalEvent',{value:true}); window.dispatchEvent(logical);
  },true);
  window.TodoBrowserStorage = TodoLocalStore.create({storage:localStorage,indexedDB,chooseDirectory:window.showDirectoryPicker?.bind(window)});
  if (window.parent === window && 'serviceWorker' in navigator) {
    window.addEventListener('load',() => navigator.serviceWorker.register('/local/sw.js',{scope:'/local/',updateViaCache:'none'}).then(registration => registration.update()).catch(() => {}));
  }
})();
