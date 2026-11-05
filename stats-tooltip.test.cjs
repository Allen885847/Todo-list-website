const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node {
 constructor(){this.children=[];this.attrs={};this.events={};this.hidden=false;this.style={};this.clientWidth=375;this.classList={add(){}};}
 setAttribute(k,v){this.attrs[k]=String(v)} removeAttribute(k){delete this.attrs[k]}
 append(...nodes){this.children.push(...nodes)} replaceChildren(){this.children=[]}
 addEventListener(k,fn){this.events[k]=fn} contains(node){return this===node||this.children.some(n=>n.contains(node))}
 getBoundingClientRect(){return this.rect||{left:0,top:0,width:150,height:30}}
}
const dialog=new Node(),button=new Node(),info=new Node(),panel=new Node(),svg=new Node(),infoPanel=new Node();infoPanel.hidden=true;
panel.rect={left:100,top:100,width:375,height:400};svg.parentElement=panel;
dialog.querySelectorAll=()=>[];
const document={querySelector:s=>({'#stats-dialog':dialog,'#open-stats':button,'#stats-info-toggle':info,'#stats-info':infoPanel,'#stats-finish-chart':svg}[s]),createElement:()=>new Node(),createElementNS:()=>new Node()};
const window={matchMedia:()=>({matches:false}),addEventListener(){}};
const source=fs.readFileSync('stats-panel.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testChart=chart;})();');
vm.runInNewContext(source,{window,document,Date,Math,Set});
const rows=[{day:'2026-11-04',finish:{day:'2026-11-04',minutes:1276,zone:'Asia/Shanghai'}}];
window.testChart(svg,rows,'finish');
const target=svg.children.find(n=>n.attrs.class==='stats-finish-target stats-mark'),tooltip=panel.children[0];
assert(target,'Recorded finish time must have an interactive target');
assert.equal(target.children[0].attrs.ry,'14','Touch target must be larger than visible dot');
target.rect={left:465,top:250,width:8,height:8};
target.events.pointerenter({pointerType:'mouse'});
assert.equal(tooltip.textContent,'Nov 4 · 9:16 PM');assert.equal(tooltip.hidden,false);
assert.equal(tooltip.style.left,'221px','Tooltip stays inside chart near the right edge');
assert.equal(target.attrs['aria-describedby'],'stats-finish-tooltip');
target.events.pointerleave({pointerType:'mouse'});assert.equal(tooltip.hidden,true);
target.events.pointerenter({pointerType:'touch'});assert.equal(tooltip.hidden,true);
target.events.click();target.events.pointerleave({pointerType:'touch'});assert.equal(tooltip.hidden,false,'Touch tooltip stays open after finger lifts');
dialog.events.pointerdown({target:new Node()});assert.equal(tooltip.hidden,true);
target.events.focus();assert.equal(tooltip.hidden,false);
let prevented=false;dialog.events.keydown({key:'Escape',preventDefault(){prevented=true},stopPropagation(){}});assert(prevented);assert.equal(tooltip.hidden,true);
target.events.focus();target.events.blur();assert.equal(tooltip.hidden,true);
target.events.click();window.testChart(svg,rows,'finish');assert.equal(tooltip.hidden,true,'Re-render must clear stale tooltip');
window.testChart(svg,[{day:'2026-11-04',finish:null}],'finish');assert(!svg.children.some(n=>n.attrs.class==='stats-finish-target stats-mark'),'Missing history must not create a point or invent time');
for (const [minutes,expected] of [[0,'12:00 AM'],[720,'12:00 PM']]) {
 window.testChart(svg,[{day:'2026-11-04',finish:{day:'2026-11-04',minutes,zone:'Asia/Shanghai'}}],'finish');
 svg.children.find(n=>n.attrs.class==='stats-finish-target stats-mark').events.click();assert.equal(tooltip.textContent,`Nov 4 · ${expected}`);
}
console.log('Finish tooltip passed: recorded local time, hover, tap, focus, dismissal, boundary placement and missing history.');
