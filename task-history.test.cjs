const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),H=require('./completion-history');
(async()=>{
 let release;const ready=new Promise(resolve=>release=resolve), values=new Map(), events={};let saves=0;
 const task={id:'restored',task:'Sample',date:{year:2026,month:11,day:4},label:'',completed:false,completedOn:null};
 values.set('todo-list-mvp',JSON.stringify({tasks:[task]}));
 const window={TodoCompletionHistory:H,TodoLocalPersistence:{ready,saveNow(){saves++}},setInterval(){},setTimeout(){},clearTimeout(){},addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}};
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 vm.runInNewContext(fs.readFileSync('task-history.js','utf8'),{window,document:{hidden:true,addEventListener:(name,fn)=>events[name]=fn},localStorage:storage,Date,JSON,console,CustomEvent:class{}});
 events.visibilitychange();assert.equal(saves,0,"Lifecycle events must not save stale data before hydration");
 events.pageshow(); // A stale incomplete observation before hydration must be ignored.
 const now=new Date();task.completed=true;task.completedOn=H.localDay(now);
 task.date={year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate()};
 const good=H.update(null,[task],{now,transition:{id:task.id,before:false,after:true}});
 values.set('todo-list-mvp',JSON.stringify({tasks:[task]}));values.set(H.KEY,JSON.stringify(good));
 release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saves,1,"A deferred lifecycle save must run after fresh hydration and observation");
 assert.equal(H.read(values.get(H.KEY)).completions.restored.completion.at,now.toISOString(),'A restored exact timestamp must survive stale startup observations');
 assert.equal(H.read(values.get(H.KEY)).days[H.localDay(now)].finish.at,now.toISOString());
 const before=values.get(H.KEY);window.TodoTaskHistory.observe();assert.equal(values.get(H.KEY),before,'Unchanged observation must not churn storage');
 console.log('History startup passed: deferred persistence hydration cannot replay stale observations or erase restored timestamps.');
})().catch(error=>{console.error(error);process.exitCode=1});
