(function (root) {
  const PREFIX = 'todo-local::';
  function install({ StorageClass, local, session }) {
    const prototype = StorageClass.prototype;
    const original = Object.fromEntries(['getItem','setItem','removeItem','key','clear'].map(key => [key, prototype[key]]));
    const length = Object.getOwnPropertyDescriptor(prototype, 'length')?.get;
    const managed = storage => storage === local || storage === session;
    const physicalKeys = storage => {
      const result = [];
      for (let index = 0; index < length.call(storage); index++) {
        const key = original.key.call(storage, index);
        if (key?.startsWith(PREFIX)) result.push(key);
      }
      return result;
    };
    prototype.getItem = function(key) { return original.getItem.call(this, managed(this) ? PREFIX + key : key); };
    prototype.setItem = function(key, value) { return original.setItem.call(this, managed(this) ? PREFIX + key : key, value); };
    prototype.removeItem = function(key) { return original.removeItem.call(this, managed(this) ? PREFIX + key : key); };
    prototype.key = function(index) { return managed(this) ? physicalKeys(this)[index]?.slice(PREFIX.length) ?? null : original.key.call(this, index); };
    prototype.clear = function() { if (managed(this)) physicalKeys(this).forEach(key => original.removeItem.call(this,key)); else original.clear.call(this); };
    if (length) Object.defineProperty(prototype, 'length', { configurable: true, get() { return managed(this) ? physicalKeys(this).length : length.call(this); } });
    return { original, prefix: PREFIX };
  }
  const api = { install, prefix: PREFIX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TodoStorageNamespace = api;
})(globalThis);
