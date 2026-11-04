const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('script.js','utf8');
class Element {
  constructor(classes='') { this.className=classes;this.dataset={};this.style={};this.children=[];this.shift=0;
    this.classList={contains:n=>this.className.split(' ').includes(n),add:(...names)=>{this.className=[...new Set([...this.className.split(' '),...names])].join(' ')},remove:(...names)=>{this.className=this.className.split(' ').filter(n=>!names.includes(n)).join(' ')}};
  }
  append(...nodes) {nodes.forEach(n=>{n.remove();n.parent=this;this.children.push(n)})}
  remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null}}
  insertBefore(node,anchor){node.remove();node.parent=this;this.children.splice(anchor?this.children.indexOf(anchor):this.children.length,0,node)}
  before(node){this.parent.insertBefore(node,this)}
  get nextElementSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1]||null}
  get offsetHeight(){return this.classList.contains('subject-drag-source')?0:parseFloat(this.style.height)||(this.classList.contains('task-item')?60:36)}
  getBoundingClientRect(){let top=150;if(this.parent===list){for(const n of list.children){if(n===this)break;top+=n.offsetHeight}}return {top:top+this.shift,bottom:top+this.shift+this.offsetHeight,left:20,width:350,height:this.offsetHeight}}
  cloneNode(deep){const n=new Element(this.className);n.dataset={...this.dataset};if(deep)this.children.forEach(c=>n.append(c.cloneNode(true)));return n}
  setAttribute(){} focus(){} setPointerCapture(id){this.capture=id}
  querySelectorAll(selector){const classes=selector.split(',').map(s=>s.slice(1));return this.children.flatMap(n=>[...(classes.some(c=>n.classList.contains(c))?[n]:[]),...n.querySelectorAll(selector)])}
  querySelector(selector){return this.querySelectorAll(selector)[0]}
  animate(frames){this.shift=Number(frames[0].transform.match(/-?[\d.]+/)[0]);return {cancel:()=>{this.shift=0}}}
}
const list=new Element('task-list'),body=new Element(),state={tasks:[]},animations=new WeakMap(),timeouts=[];
const iso=d=>`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
function render(){list.children.forEach(n=>n.parent=null);list.children=[];let date,subject;for(const task of state.tasks){const day=iso(task.date);if(day!==date){list.append(new Element('task-date-heading'));date=day;subject=null}if(task.subject!==subject){const h=new Element('task-subject-heading');h.dataset={dateKey:date,subject:task.subject};h.append(new Element('subject-drag-handle'));list.append(h);subject=task.subject}const n=new Element('task-item');n.dataset.taskId=task.id;list.append(n)}}
let saves=0,frame=0;
const context=vm.createContext({document:{body,createElement:()=>new Element()},taskList:list,state,taskLayoutAnimations:animations,prefersReducedMotion:false,toIsoDate:iso,requestAnimationFrame:()=>++frame,cancelAnimationFrame(){},getComputedStyle:n=>({marginTop:'0',marginBottom:'0',transform:n.shift?`matrix(1, 0, 0, 1, 0, ${n.shift})`:'none'}),DOMMatrixReadOnly:class{constructor(s){this.m42=Number(s.match(/, ([\d.-]+)\)$/)[1])}},window:{innerHeight:1000,scrollBy(){},setTimeout:fn=>timeouts.push(fn)},saveState:()=>saves++,renderTasks:render,showPageNotice(){}});
const dragCode=source.slice(source.indexOf('function reorderSubjectTasks('),source.indexOf('function calculateTodayProgress('));
const cleanup=source.slice(source.indexOf('function cleanUpPointerDrag('),source.indexOf('function finishPointerDrag('));
const cancel=source.slice(source.indexOf('function cancelPointerDrag('),source.indexOf('// Subject ordering'));
vm.runInContext('let pointerDrag=null;\n'+dragCode+'\n'+cleanup+'\n'+cancel,context);
const event=(y,type='mouse',id=7)=>({button:0,pointerId:id,pointerType:type,clientX:330,clientY:y,preventDefault(){}});
const run=(name,...args)=>context[name](...args),drag=()=>vm.runInContext('pointerDrag',context);
function reset(){state.tasks=[['h1','History',4],['h2','History',4],['p','Physics',4],['c','Chinese',4],['future','History',5]].map(([id,subject,day])=>({id,subject,date:{year:2026,month:11,day},completed:false}));render();saves=0;timeouts.length=0}
function start(subject){const h=list.children.find(n=>n.dataset.subject===subject);run('beginSubjectDrag',event(h.getBoundingClientRect().top),h,h.children[0]);return h}
reset();const before=JSON.stringify(state.tasks),h=start('History');run('updateSubjectDrag',event(155));assert.ok(drag()?.active);assert.equal(drag().ghost.children.length,3,'ghost includes heading and every task');assert.ok(drag().nodes.every(n=>n.classList.contains('subject-drag-source')));
run('updateSubjectDrag',event(970));assert.equal(drag().targetSubject,'Chinese');assert.ok(drag().after);assert.ok(drag().placeholder.nextElementSibling.classList.contains('task-date-heading'),'drop stays before the next date heading');
run('finishSubjectDrag',event(970));assert.ok(drag().settling);timeouts.shift()();assert.equal(drag(),null);assert.equal(body.children.length,0);assert.equal(saves,1);assert.deepEqual(state.tasks.map(t=>t.id),['p','c','h1','h2','future']);assert.equal(state.orderMode,'manual');assert.equal(state.tasks.at(-1).date.day,5);
// Touch follows the same path, including cancellation and no-op taps.
reset();start('Chinese');run('updateSubjectDrag',event(155,'touch'));assert.equal(drag().targetSubject,'History');run('cancelPointerDrag',{pointerId:7});assert.equal(drag(),null);assert.equal(JSON.stringify(state.tasks),before);assert.equal(saves,0);assert.ok(list.children.every(n=>!n.classList.contains('subject-drag-source')));assert.equal(body.children.length,0);
start('History');run('finishSubjectDrag',event(150,'touch'));assert.equal(drag(),null);assert.equal(saves,0);
// A second pointer cannot replace the active one; cancellation ignores unrelated pointers.
start('History');run('beginSubjectDrag',event(170,'touch',8),h,h.children[0]);assert.equal(drag().pointerId,7);run('cancelPointerDrag',{pointerId:8});assert.ok(drag());run('cancelPointerDrag',{pointerId:7});
// Interrupted FLIP captures the visible position, cancels transforms, then animates live replacements.
reset();const item=list.children.find(n=>n.dataset.taskId==='h1');animations.set(item,item.animate([{transform:'translateY(25px)'}]));const top=item.getBoundingClientRect().top;const positions=run('captureSubjectPositions');assert.equal(item.shift,0);assert.equal(positions.get('["task","h1"]'),top);run('moveSubjectGroup','2026-11-04','History','Chinese',true);run('animateSubjectPositions',positions);const replacement=list.children.find(n=>n.dataset.taskId==='h1');assert.notEqual(item,replacement);assert.ok(animations.has(replacement),'keyboard reorder animates the newly rendered task');
console.log('Subject pointer lifecycle passed: mouse/touch paths, full-group ghost, date boundary, save, cancel, tap, pointer isolation and interrupted FLIP.');
