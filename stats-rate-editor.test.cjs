const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),H=require('./completion-history');
class Node{
 constructor(){this.children=[];this.events={};this.attrs={};this.style={};this.hidden=true;this.classList={add(){},remove(){}}}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}removeAttribute(k){delete this.attrs[k]}append(...n){this.children.push(...n)}replaceChildren(){this.children=[]}querySelectorAll(){return []}querySelector(){return new Node()}contains(n){return n===this}addEventListener(k,fn){this.events[k]=fn}focus(){}showModal(){this.open=true}getBoundingClientRect(){return {left:0,top:0,width:700,height:300}}
}
(async()=>{
 const nodes={},get=id=>nodes[id]??=new Node(),document={querySelector:s=>get(s.slice(1)),createElement:()=>new Node(),createElementNS:()=>new Node()};get('stats-finish-chart').parentElement=new Node();
 const day='2026-11-04',tasks=[{id:'one',task:'Missed check-off',date:{year:2026,month:11,day:4},completed:false},{id:'late',task:'Late work',date:{year:2026,month:11,day:4},completed:false}],now=new Date(2026,10,5,12);
 let history=H.update(null,tasks,{now:new Date(2026,10,4,23)}),calls=0,release,closes=0;tasks[1].completed=true;tasks[1].completedOn='2026-11-05';
 const window={TodoCompletionHistory:H,TodoTaskHistory:{rateDetails:day=>H.rateDetails(history,day,tasks,{now}),editRate(day,ids,options={}){calls++;history=H.editRate(history,day,ids,tasks,{now,...options});return new Promise(resolve=>release=resolve)}},matchMedia:()=>({matches:true}),addEventListener(){},clearTimeout,setTimeout};
 vm.runInNewContext(fs.readFileSync('stats-panel.js','utf8').replace(/\}\)\(\);\s*$/,'window.testOpenRate=openRateEditor;})();'),{document,window,Date,Math,Set,Promise,prepareDialogOpening(){},closeDialogAnimated(){closes++}});
 window.testOpenRate({day,rate:{total:2,completed:0,percent:0}});assert(get('stats-rate-editor').open);
 const labels=get('stats-rate-edit-tasks').children;assert.equal(labels.length,2);assert.equal(labels[1].children[0].checked,false,'A late check-off does not become on-time');
 const input=labels[0].children[0];input.checked=true;input.events.change();assert.equal(get('stats-rate-edit-count').textContent,'1/2 completed on time · 50%');
 const submit=get('stats-rate-form').events.submit,first=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(calls,1);release();await first;assert.equal(closes,1);assert.equal(H.rows(history,{now})[5].rate.percent,50);assert.equal(H.rows(history,{now})[5].finish,null);
 const row=()=>H.rows(history,{now})[5];
 window.testOpenRate(row());
 assert(get('stats-rate-finish-field').hidden,'Partial rate keeps optional time hidden');
 let choices=get('stats-rate-edit-tasks').children.map(label=>label.children[0]);
 choices[1].checked=true;choices[1].events.change();
 assert.equal(get('stats-rate-finish-field').hidden,false,'100% with unknown finish shows the field');
 assert.equal(get('stats-rate-finish-time').value,'');
 let save=submit({preventDefault(){}});release();await save;
 assert.equal(row().rate.percent,100);assert.equal(row().finish,null,'100% can be saved with blank time');
 window.testOpenRate(row());assert.equal(get('stats-rate-finish-field').hidden,false);
 get('stats-rate-finish-time').value='21:16';
 choices=get('stats-rate-edit-tasks').children.map(label=>label.children[0]);
 choices[1].checked=false;choices[1].events.change();assert(get('stats-rate-finish-field').hidden);
 assert(get('stats-rate-finish-time').disabled,'Hidden time cannot interfere with validation');
 choices[1].checked=true;choices[1].events.change();assert.equal(get('stats-rate-finish-field').hidden,false);
 save=submit({preventDefault(){}});release();await save;
 assert.equal(row().finish.minutes,1276);assert.equal(row().finish.day,day);
 window.testOpenRate(row());assert(get('stats-rate-finish-field').hidden,'Existing finish time does not offer a second field');
 window.TodoTaskHistory.rateDetails=()=>({available:false,tasks:[],reason:'Historical tasks cannot be safely matched.'});window.testOpenRate({day,rate:{total:2,completed:0}});assert(get('stats-rate-edit-save').disabled);assert.equal(get('stats-rate-edit-status').textContent,'Historical tasks cannot be safely matched.');
 console.log('Past-rate editor passed: per-task confirmations, live ratio, no automatic late counts, duplicate-submit guard and unavailable-history protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
