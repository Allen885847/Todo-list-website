const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('./node_modules/fake-indexeddb');
const {create}=require('./local-store');
class Storage {constructor(){this.data=new Map}getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
(async()=>{
 const localStorage=new Storage(),sessionStorage=new Storage(),indexedDB=new IDBFactory();
 const store=create({storage:localStorage,indexedDB});
 const fixture={'todo-list-mvp':JSON.stringify({title:'Local fixture',tasks:[{id:'t1',task:'Worksheet',completed:false}]}),'todo-calendar-events':'[{"id":"e1","title":"Trip","holiday":true}]','todo-appearance':'dark'};
 await store.save(fixture);
 let ready;const completion=new Promise(resolve=>ready=resolve);let networkCalls=0;
 const location={protocol:'https:',hostname:'todolist.uno',origin:'https://todolist.uno',reload(){ready('reloaded')}};
 const window={TodoBrowserStorage:store,TodoDataMigration:{importBackup(){}},addEventListener(){},setTimeout,clearTimeout};window.parent={postMessage(){ready('ready')}};
 const context={window,Storage,localStorage,sessionStorage,location,document:{readyState:'complete'},clearTimeout,setTimeout,console,fetch(){networkCalls++;throw new Error('Local mode must not contact account storage')}};
 vm.runInNewContext(fs.readFileSync('persistent-storage.js','utf8'),context);
 assert.equal(await completion,'reloaded');assert.equal(localStorage.getItem('todo-list-mvp'),fixture['todo-list-mvp']);
 localStorage.setItem('todo-appearance','light');await window.TodoLocalPersistence.saveNow({strict:true});
 assert.equal((await store.load()).data['todo-appearance'],'light');assert.equal(networkCalls,0);
 console.log('Browser-local persistence passed: independent recovery/reopen, edits saved to IndexedDB, zero account/cloud storage requests.');
})().catch(error=>{console.error(error);process.exitCode=1});
