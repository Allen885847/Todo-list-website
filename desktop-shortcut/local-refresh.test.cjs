const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let now = new Date(2026, 10, 9, 23, 59, 50).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const events = {}, timers = new Map(), intervals = [], elements = [];
let id = 0, tasks = 0, weather = 0;
const context = { Date: Clock, Promise, location: {origin:'http://localhost'},
  setTimeout(fn, delay) { timers.set(++id,{fn,delay}); return id; }, clearTimeout(key) { timers.delete(key); },
  setInterval(fn) { intervals.push(fn); },
  document: {hidden:false, createElement() { const el={setAttribute(){},append(){},classList:{add(){},remove(){}},addEventListener(n,fn){this[n]=fn}};elements.push(el);return el;},
    querySelector(){return {before(){}}}, addEventListener(n,fn){events[n]=fn}},
  window: { addEventListener(n,fn){events[n]=fn} },
};
vm.runInNewContext(fs.readFileSync('desktop-shortcut/local-refresh.js','utf8'),context);
const api=context.window.TodoLocalRefresh;
api.registerTasks(()=>tasks++);
// Simulate a slow or permanently hung weather request.
api.registerWeather(()=>{weather++;return new Promise(()=>{});});
const midnight=[...timers.values()][0];
assert.equal(midnight.delay,10000,'Schedule the actual next local midnight');
elements[0].click();
assert.equal(tasks,1,'Tasks refresh synchronously before weather');
assert.equal(weather,0);
Promise.resolve().then(()=> {
  assert.equal(weather,1);
  elements[0].click();
  assert.equal(tasks,2,'Slow weather never blocks a second task refresh');
  now=new Date(2026,10,10).getTime();
  midnight.fn();
  assert.equal(tasks,3,'Midnight refresh');
  events.focus();events.visibilitychange();
  assert.equal(tasks,3,'Same-day return does not repeat midnight refresh');
  now=new Date(2026,10,11,9).getTime();
  context.document.hidden=true;events.visibilitychange();assert.equal(tasks,3);
  context.document.hidden=false;events.visibilitychange();assert.equal(tasks,4,'Recover after sleeping across midnight');
  events.message({origin:'https://evil.invalid',data:{type:'todo-view-activated'}});
  assert.equal(tasks,4);
  now=new Date(2026,10,12,9).getTime();
  events.message({origin:'http://localhost',data:{type:'todo-view-activated'}});
  assert.equal(tasks,5,'Calendar return catches a changed date');
  now=new Date(2026,10,13,9).getTime();intervals[0]();assert.equal(tasks,6);

  const source=fs.readFileSync('script.js','utf8');
  const callback=source.match(/window\.TodoLocalRefresh\?\.registerTasks\(\(\) => \{([\s\S]*?)\n\}\);/)[1];
  const rules=require('../task-rules.js');
  const snapshot={tasks:[{id:'done',date:{year:2026,month:11,day:9},completed:true,completedOn:'2026-11-09'}, {id:'pending',date:{year:2026,month:11,day:9},completed:false}]};
  let observed=0,visible;
  const integration={window:{TodoTaskHistory:{observe(){observed++}}},loadState:()=>snapshot,state:null,
    renderTasks(options){assert.equal(options.preserveDrafts,true);visible=this.state.tasks.filter(t=>rules.isVisibleInActiveList(t,'2026-11-10'));}};
  // Method callbacks in browser code are globals, so use a closure for the fixture.
  integration.renderTasks=options=>{assert.equal(options.preserveDrafts,true);visible=integration.state.tasks.filter(t=>rules.isVisibleInActiveList(t,'2026-11-10'));};
  vm.runInNewContext(callback,integration);
  assert.equal(observed,1);assert.deepEqual(visible.map(t=>t.id),['pending']);
  assert.match(source,/if \(!preserveDrafts\) titleInput.value = state.title/);
  assert.match(source,/!composerOpen && !preserveDrafts/);
  assert(!fs.readFileSync('index.html','utf8').includes('src="local-refresh.js"'),'Online HTML must not load Shortcut-only controls');
  console.log('Local refresh passed: immediate tasks, independent weather, local midnight, wake/date recovery, no repeat same-day refresh, and draft-preserving integration.');
}).catch(error=>{console.error(error);process.exitCode=1;});
