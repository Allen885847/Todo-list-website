const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Node {
 constructor(){this.attrs={};this.events={};this.children=[];this.hidden=false;this.style={};this.clientWidth=700;this.clientHeight=220;this.offsetTop=48;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c))};this.animations=[];}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}removeAttribute(k){delete this.attrs[k]}
 append(...nodes){this.children.push(...nodes);nodes.forEach(n=>n.parentElement=this)}replaceChildren(){this.children=[]}contains(n){return n===this}
 getBoundingClientRect(){return {left:0,top:100,width:700,height:500}}
 querySelectorAll(){return []}
 cloneNode(){return new Node()}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this)}
 addEventListener(k,fn){this.events[k]=fn}focus(){this.focused=true}
 animate(frames,options){let resolve,reject;const a={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b}),finish:()=>resolve(),cancel:()=>reject(new Error('cancelled'))};this.animations.push(a);return a;}
}
(async()=>{
 const ids={},get=id=>ids[id]??=new Node(),dialog=get('stats-dialog'),info=get('stats-info'),data=new Node();info.hidden=true;get('stats-bonus-card').hidden=true;get('stats-bonus-detail').hidden=true;
 const types=['finish','bonus','rate'],tabs=types.map(type=>{const tab=new Node();tab.dataset={statsTab:type};tab.setAttribute('aria-controls',`stats-${type}-panel`);get(`stats-${type}-panel`).hidden=type!=='finish';get(`stats-${type}-chart`).parentElement=get(`stats-${type}-panel`);return tab});
 const ranges=[7,30].map(n=>{const b=new Node();b.dataset={statsRange:n};return b});
 dialog.querySelectorAll=s=>s==='[data-stats-range]'?ranges:tabs;dialog.querySelector=s=>s==='.stats-data'?data:get('stats-card');dialog.showModal=()=>dialog.open=true;
 const motion={matches:false},window={setTimeout,clearTimeout,matchMedia:()=>motion,addEventListener(){},TodoTaskHistory:{observe(){},read:()=>({started:null})},TodoCompletionHistory:{rows:()=>[{day:'2026-11-05',finish:null,count:4,bonusTasks:[{id:'1',title:'Sample Extra',extra:true,earlyDays:2},{id:'2',title:'Sample early',extra:false,earlyDays:1},{id:'3',title:'Third',extra:true,earlyDays:0},{id:'4',title:'Fourth',extra:true,earlyDays:0}],rate:{total:5,completed:4,percent:80}}]}};
 const document={querySelector:s=>get(s.slice(1)),getElementById:get,createElement:()=>new Node(),createElementNS:()=>new Node()};
 vm.runInNewContext(fs.readFileSync('stats-panel.js','utf8'),{window,document,Date,Math,Set,Promise,requestAnimationFrame:fn=>fn(),prepareDialogOpening(){},closeDialogAnimated(){}});
 info.hidden=false;data.open=true;get('open-stats').events.click();assert(info.hidden);assert.equal(data.open,false,'Opening starts with collapsed data and explanations');
 tabs[1].events.click();const old=get('stats-finish-panel'),next=get('stats-bonus-panel');assert(old.hidden);assert(old.inert);assert(old.classes.has('is-leaving'));assert(!next.hidden);assert.equal(old.animations[0].frames[1].opacity,0);assert.equal(next.animations[0].frames[0].opacity,0,'Both charts crossfade');
 tabs[2].events.click();assert(!old.classes.has('is-leaving'),'Rapid switching removes old overlay');assert.equal(old.inert,false);assert(get('stats-bonus-panel').inert);assert(!get('stats-rate-panel').hidden);
 get('stats-bonus-panel').animations.at(-1).finish();get('stats-rate-panel').animations.at(-1).finish();await new Promise(resolve=>setImmediate(resolve));
 assert(!get('stats-bonus-panel').classes.has('is-leaving'));assert.equal(get('stats-bonus-panel').inert,false);
 assert.equal(get('stats-rate-summary').textContent,'Today · 4/5 completed · 80%');
 get('stats-info-toggle').events.click();assert(!info.hidden);let prevented=false;dialog.events.keydown({key:'Escape',preventDefault(){prevented=true},stopPropagation(){}});assert(prevented);assert(info.inert);info.animations.at(-1).finish();await new Promise(resolve=>setImmediate(resolve));assert(info.hidden);assert(get('stats-info-toggle').focused);
 tabs[1].events.click();
 const bar=get('stats-bonus-chart').children.find(n=>n.attrs.class==='stats-bonus-target stats-mark');bar.events.click();
 assert.equal(get('stats-bonus-card').hidden,false);assert.equal(get('stats-bonus-card-items').children.length,3);assert.equal(get('stats-bonus-card-count').textContent,'4 tasks completed');
 assert.equal(get('stats-bonus-card-items').children[0].children[1].children.length,2,'Extra and early are both labeled on one entry');
 get('stats-bonus-view-all').events.click();assert.equal(get('stats-bonus-detail').hidden,false);assert.equal(get('stats-bonus-detail-items').children.length,4);
 get('stats-bonus-detail-close').events.click();assert(get('stats-bonus-detail').hidden);
 ranges[1].events.click();assert.equal(get('stats-bonus-chart').animations.at(-1).frames[0].opacity,0,'Range changes crossfade the chart');
 ranges[0].events.click();assert.equal(ranges[0].attrs['aria-pressed'],'true','Interrupted range updates preserve the latest selection');
 motion.matches=true;tabs[0].events.click();assert(!get('stats-rate-panel').classes.has('is-leaving'),'Reduced motion switches without overlays');
 assert.equal(get('stats-finish-chart').attrs.viewBox,'0 0 700 220','Chart geometry follows available slot height');
 console.log('Stats panel passed: crossfade, interrupted switching, reduced motion, stable chart sizing, collapsed defaults and info dismissal.');
})().catch(e=>{console.error(e);process.exitCode=1});
