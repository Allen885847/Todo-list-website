const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),H=require('./completion-history');
(async()=>{
 process.env.TZ='Asia/Shanghai';const RealDate=Date;let now=new RealDate('2026-11-04T23:59:50'),id=0,saves=0;const timers=new Map(),values=new Map(),events={};
 class Clock extends RealDate {constructor(...args){super(...(args.length?args:[now.getTime()]))}static now(){return now.getTime()}}
 const tasks=Array.from({length:5},(_,i)=>({id:String(i),date:{year:2026,month:11,day:4},label:'',completed:i<4,completedOn:i<4?'2026-11-04':null}));
 values.set('todo-list-mvp',JSON.stringify({tasks}));const doc={hidden:false,addEventListener:(name,fn)=>events[name]=fn};
 const window={TodoCompletionHistory:H,TodoLocalPersistence:{ready:Promise.resolve(),saveNow(){saves++}},setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id},clearTimeout:key=>timers.delete(key),setInterval:(fn)=>events.interval=fn,addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync('task-history.js','utf8'),{window,document:doc,localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},Date:Clock,JSON,console,CustomEvent:class{}});
 await new Promise(resolve=>setImmediate(resolve));
 let history=H.read(values.get(H.KEY));assert.equal(history.days['2026-11-04'].rate.completed,4);assert.equal(history.days['2026-11-04'].rate.total,5);
 const [timer,tick]=[...timers][0];assert.equal(tick.delay,10000,'Snapshot rollover must be scheduled at local midnight');
 now=new RealDate('2026-11-05T00:00:00');timers.delete(timer);tick.fn();history=H.read(values.get(H.KEY));assert.equal(saves,1,'Rollover flushes the history through the existing persistence path');assert.equal(history.days['2026-11-04'].rate.finalized,true);assert.equal(history.days['2026-11-04'].rate.completed,4);
 tasks[4].completed=true;tasks[4].completedOn='2026-11-05';values.set('todo-list-mvp',JSON.stringify({tasks}));window.TodoTaskHistory.record(tasks,{id:'4',before:false,after:true},now);
 values.set('todo-list-mvp',JSON.stringify({tasks:[]}));window.TodoTaskHistory.observe();history=H.read(values.get(H.KEY));assert.equal(history.days['2026-11-04'].rate.completed,4);assert.equal(H.rows(history,{now}).find(r=>r.day==='2026-11-04').rate.percent,80,'Late completion and active-list cleanup cannot erase or rewrite yesterday');
 doc.hidden=true;events.visibilitychange();assert.equal(saves,2,'Hiding the page checkpoints history');
 now=new RealDate('2026-11-08T10:00:00');doc.hidden=false;events.visibilitychange();history=H.read(values.get(H.KEY));assert.equal(H.rows(history,{now}).find(r=>r.day==='2026-11-06').rate,null,'Sleeping for several days cannot fabricate historical rows');
 console.log('History midnight checkpoint passed: local boundary scheduling, hydration, durable flush, cleanup, late completion and sleep recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
