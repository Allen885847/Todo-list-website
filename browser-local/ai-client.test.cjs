const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let calls=[];
 const fetch=async(resource,options)=>{
  calls.push([resource,options]);
  if(resource==='/api/local-ai/session')return Response.json({active:true});
  if(resource==='/api/local-ai/parse-tasks'){assert.equal(options.headers.get('X-Todo-Local'),'1');assert.match(new TextDecoder().decode(options.body),/worksheet/);return Response.json({tasks:[{title:'Math worksheet'}]})}
  return Response.json({untouched:true});
 };
 const window={TodoBrowserLocal:true,fetch};const context={window,fetch,location:{origin:'https://todolist.uno',href:'https://todolist.uno/local/app'},navigator:{onLine:true},Request,Response,Headers,URL,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync('browser-local/ai-client.js','utf8'),context);
 const result=await window.fetch('https://todolist.uno/api/parse-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"input":"Math worksheet"}'});
 assert.equal((await result.json()).tasks[0].title,'Math worksheet');assert.deepEqual(calls.map(c=>c[0]),['/api/local-ai/session','/api/local-ai/parse-tasks']);
 await window.fetch('https://todolist.uno/api/storage');assert.equal(calls.at(-1)[0],'https://todolist.uno/api/storage','unrelated requests must not be rewritten');
 const offlineWindow={TodoBrowserLocal:true,fetch:async()=>{throw new TypeError('Network unavailable')}};
 vm.runInNewContext(fs.readFileSync('browser-local/ai-client.js','utf8'),{...context,window:offlineWindow,navigator:{onLine:false}});
 const offline=await offlineWindow.fetch('https://todolist.uno/api/parse-tasks',{method:'POST',body:'{}'});assert.equal(offline.status,503);assert.match((await offline.json()).error,/offline/);
 console.log('Browser-local AI client passed: existing actions use hosted anonymous backend, body retained, unrelated routes unchanged, and readable offline error.');
})().catch(error=>{console.error(error);process.exitCode=1});
