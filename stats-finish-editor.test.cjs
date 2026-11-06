const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),H=require('./completion-history');
class Node {
 constructor(){this.children=[];this.events={};this.attrs={};this.style={};this.hidden=true;this.classList={add(){},remove(){}};this.clientWidth=700;this.clientHeight=220;}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}removeAttribute(k){delete this.attrs[k]}
 append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}querySelectorAll(){return []}querySelector(){return new Node()}contains(n){return n===this}
 addEventListener(k,fn){this.events[k]=fn}focus(){this.focused=true}showModal(){this.open=true}getBoundingClientRect(){return {left:0,top:0,width:700,height:300}}
}
(async()=>{
 const nodes={},get=id=>nodes[id]??=new Node(),document={querySelector:s=>get(s.slice(1)),createElement:()=>new Node(),createElementNS:()=>new Node()};get('stats-finish-chart').parentElement=new Node();
 let calls=0,release,closes=0;const window={TodoCompletionHistory:H,TodoTaskHistory:{editFinish(){calls++;return new Promise(resolve=>release=resolve)}},matchMedia:()=>({matches:true}),addEventListener(){},clearTimeout,setTimeout};
 const source=fs.readFileSync('stats-panel.js','utf8').replace(/\}\)\(\);\s*$/,'window.testChart=chart;})();');
 vm.runInNewContext(source,{document,window,Date,Math,Set,Promise,prepareDialogOpening(){},closeDialogAnimated(){closes++}});
 const time=H.stamp(new Date(2026,10,6,21,16,17)),row={day:'2026-11-06',finish:time};
 window.testChart(get('stats-finish-chart'),[row],'finish');const target=get('stats-finish-chart').children.find(n=>n.attrs.class==='stats-finish-target stats-mark');
 assert.equal(target.attrs.role,'button');target.events.click();assert(get('stats-finish-editor').open);assert.equal(get('stats-finish-edit-time').value,'21:16:17');assert.equal(get('stats-finish-edit-date').value,row.day);
 const submit=get('stats-finish-form').events.submit,first=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(calls,1);assert(get('stats-finish-edit-save').disabled);
 get('stats-finish-edit-cancel').events.click();assert.equal(closes,0,'Do not close an in-flight save');release();await first;assert.equal(closes,1);assert(!get('stats-finish-edit-save').disabled);
 target.events.keydown({key:'Enter',preventDefault(){}});assert(get('stats-finish-editor').open);
 window.TodoTaskHistory.editFinish=async()=>{throw new Error('Storage unavailable. Retry saving.')};await submit({preventDefault(){}});assert.equal(get('stats-finish-edit-status').textContent,'Storage unavailable. Retry saving.');assert(!get('stats-finish-edit-status').hidden);assert.equal(get('stats-finish-edit-date').value,row.day);assert(!get('stats-finish-edit-date').disabled);
 const edited={...row,finishEdit:{original:time,corrected:time,showEdited:true}};window.testChart(get('stats-finish-chart'),[edited],'finish');assert(get('stats-finish-chart').children.some(n=>n.attrs.class==='stats-edited-label'));
 window.testChart(get('stats-finish-chart'),[{...edited,finishEdit:{...edited.finishEdit,showEdited:false}}],'finish');assert(!get('stats-finish-chart').children.some(n=>n.attrs.class==='stats-edited-label'));
 console.log('Finish editor passed: direct click/keyboard entry, exact fields, label visibility, duplicate-save guard and recoverable errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
