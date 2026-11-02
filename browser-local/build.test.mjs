import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const base=new URL('../dist/local/',import.meta.url);
for(const name of ['app.html','index.html','calendar.html','data.html']){
 const html=await readFile(new URL(name,base),'utf8');assert.ok(html.indexOf('storage-namespace.js')<html.indexOf('localStorage.getItem') || !html.includes('localStorage.getItem'));assert.doesNotMatch(html,/login-ui\.js|auth-stage|local-ai-form/);
}
assert.match(await readFile(new URL('local-data.js',base),'utf8'),/mode', 'browser-local/);
const worker=await readFile(new URL('sw.js',base),'utf8');const files=JSON.parse(worker.match(/FILES=(\[[^;]*\]);/)[1]);
for(const pathname of files){assert.ok(pathname.startsWith('/local/'));assert.ok(!pathname.includes('/api/'));if(/\.[a-z]+$/i.test(pathname))await readFile(new URL('.'+pathname,new URL('../dist/',import.meta.url)))}
const listeners={},cached=new Map();let network=0;
const cache={addAll:async files=>files.forEach(file=>cached.set('https://todolist.uno'+file,new Response('cached '+file))),match:async key=>cached.get(key)};
const caches={open:async()=>cache,keys:async()=>['todo-local-obsolete','other-app-cache'],delete:async name=>assert.equal(name,'todo-local-obsolete')};
vm.runInNewContext(worker,{self:{location:{origin:'https://todolist.uno'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>listeners[name]=fn},caches,URL,fetch:()=>{network++;throw new Error('Offline')}});
await new Promise((resolve,reject)=>listeners.install({waitUntil:p=>p.then(resolve,reject)}));
await new Promise((resolve,reject)=>listeners.activate({waitUntil:p=>p.then(resolve,reject)}));
let response;listeners.fetch({request:new Request('https://todolist.uno/local/calendar.html?embedded=1'),respondWith:p=>response=p});assert.match(await(await response).text(),/cached/);assert.equal(network,0);
let intercepted=false;listeners.fetch({request:new Request('https://todolist.uno/api/storage'),respondWith:()=>intercepted=true});assert.equal(intercepted,false);
console.log('Browser-local build/cache passed: login-free pages, namespace before app scripts, all offline assets present, offline Calendar navigation, APIs never cached.');
