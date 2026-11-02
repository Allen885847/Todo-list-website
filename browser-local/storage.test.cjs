const assert=require('node:assert/strict');
const {IDBFactory}=require('./node_modules/fake-indexeddb');
const namespace=require('./storage-namespace');
const {create,keys}=require('./local-store');
class StorageDouble {
 constructor(){this.values=new Map()}
 get length(){return this.values.size}
 getItem(k){return this.values.get(String(k))??null}
 setItem(k,v){this.values.set(String(k),String(v))}
 removeItem(k){this.values.delete(String(k))}
 key(i){return [...this.values.keys()][i]??null}
 clear(){this.values.clear()}
}
(async()=>{
 const local=new StorageDouble(),session=new StorageDouble(),other=new StorageDouble();
 local.setItem('todo-list-mvp','private online data');local.setItem('todo-appearance','dark');
 const {original}=namespace.install({StorageClass:StorageDouble,local,session});
 assert.equal(local.getItem('todo-list-mvp'),null,'local mode must not read Online records');
 local.setItem('todo-list-mvp','local data');session.setItem('session','local session');other.setItem('plain','unaltered');
 assert.equal(original.getItem.call(local,'todo-list-mvp'),'private online data');
 assert.equal(local.length,1);assert.equal(local.key(0),'todo-list-mvp');assert.equal(session.getItem('session'),'local session');assert.equal(other.getItem('plain'),'unaltered');
 local.clear();assert.equal(original.getItem.call(local,'todo-list-mvp'),'private online data');
 const task=JSON.stringify({title:'Local test',tasks:[{id:'local1',task:'Math worksheet',date:{day:2,month:11,year:2026},completed:false,label:'Extra'}]});
 const events=JSON.stringify([{id:'event1',title:'Trip',type:'holiday',startDate:'2026-12-31',endDate:'2027-01-14'}]);
 local.setItem('todo-list-mvp',task);local.setItem('todo-calendar-events',events);local.setItem('todo-weather-enabled-v1','enabled');
 const db=new IDBFactory(),store=create({storage:local,indexedDB:db});
 await store.save();await store.backup();
 const saved=await store.load();assert.equal(saved.data['todo-list-mvp'],task);assert.equal(saved.data['todo-calendar-events'],events);
 local.setItem('todo-list-mvp','changed local');await store.save();
 assert.equal((await store.readRecovery()).data['todo-list-mvp'],task);assert.equal((await store.readBackups()).length,1);
 // Simulate reopening with only the independent IndexedDB copy remaining.
 local.clear();const reopened=create({storage:local,indexedDB:db});
 assert.equal((await reopened.load()).data['todo-list-mvp'],'changed local');
 assert.equal((await reopened.load()).data['todo-weather-enabled-v1'],'enabled');
 assert.equal(original.getItem.call(local,'todo-list-mvp'),'private online data');
 await assert.rejects(reopened.chooseFolder(),/does not support/);
 assert.deepEqual(await reopened.folderStatus(),{connected:false,status:'not-selected'});
 // A pre-existing backup file is never overwritten by choosing its folder.
 const existing=create({storage:local,indexedDB:new IDBFactory(),chooseDirectory:async()=>({getFileHandle:async()=>({})})});
 await assert.rejects(existing.chooseFolder(),/already contains/);
 console.log('Browser-local storage passed: namespace isolation, reload recovery, all record payloads, settings, recovery snapshots, and safe folder selection.');
})().catch(e=>{console.error(e);process.exitCode=1});
