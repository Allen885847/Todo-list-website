const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Node {
 constructor(){this.attrs={};this.events={};this.children=[];this.hidden=false;this.style={};this.clientWidth=700;this.clientHeight=220;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c))};this.animations=[];}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}removeAttribute(k){delete this.attrs[k]}
 append(...nodes){this.children.push(...nodes)}replaceChildren(){this.children=[]}contains(n){return n===this}
 addEventListener(k,fn){this.events[k]=fn}focus(){this.focused=true}
 animate(frames,options){let resolve,reject;const a={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b}),finish:()=>resolve(),cancel:()=>reject(new Error('cancelled'))};this.animations.push(a);return a;}
}
(async()=>{
 const ids={},get=id=>ids[id]??=new Node(),dialog=get('stats-dialog'),info=get('stats-info'),data=new Node();info.hidden=true;
 const types=['finish','bonus','rate'],tabs=types.map(type=>{const tab=new Node();tab.dataset={statsTab:type};tab.setAttribute('aria-controls',`stats-${type}-panel`);get(`stats-${type}-panel`).hidden=type!=='finish';get(`stats-${type}-chart`).parentElement=get(`stats-${type}-panel`);return tab});
 const ranges=[7,30].map(n=>{const b=new Node();b.dataset={statsRange:n};return b});
 dialog.querySelectorAll=s=>s==='[data-stats-range]'?ranges:tabs;dialog.querySelector=()=>data;dialog.showModal=()=>dialog.open=true;
 const motion={matches:false},window={matchMedia:()=>motion,addEventListener(){},TodoTaskHistory:{observe(){},read:()=>({started:null})},TodoCompletionHistory:{rows:()=>[{day:'2026-11-05',finish:null,count:null,rate:{total:5,completed:4,percent:80}}]}};
 const document={querySelector:s=>get(s.slice(1)),getElementById:get,createElement:()=>new Node(),createElementNS:()=>new Node()};
 vm.runInNewContext(fs.readFileSync('stats-panel.js','utf8'),{window,document,Date,Math,Set,Promise,requestAnimationFrame:fn=>fn(),prepareDialogOpening(){},closeDialogAnimated(){}});
 info.hidden=false;data.open=true;get('open-stats').events.click();assert(info.hidden);assert.equal(data.open,false,'Opening starts with collapsed data and explanations');
 tabs[1].events.click();const old=get('stats-finish-panel'),next=get('stats-bonus-panel');assert(old.hidden);assert(old.inert);assert(old.classes.has('is-leaving'));assert(!next.hidden);assert.equal(old.animations[0].frames[1].opacity,0);assert.equal(next.animations[0].frames[0].opacity,0,'Both charts crossfade');
 tabs[2].events.click();assert(!old.classes.has('is-leaving'),'Rapid switching removes old overlay');assert.equal(old.inert,false);assert(get('stats-bonus-panel').inert);assert(!get('stats-rate-panel').hidden);
 get('stats-bonus-panel').animations.at(-1).finish();get('stats-rate-panel').animations.at(-1).finish();await new Promise(resolve=>setImmediate(resolve));
 assert(!get('stats-bonus-panel').classes.has('is-leaving'));assert.equal(get('stats-bonus-panel').inert,false);
 assert.equal(get('stats-rate-summary').textContent,'Today · 4/5 completed · 80%');
 get('stats-info-toggle').events.click();assert(!info.hidden);let prevented=false;dialog.events.keydown({key:'Escape',preventDefault(){prevented=true},stopPropagation(){}});assert(prevented);assert(info.hidden);assert(get('stats-info-toggle').focused);
 motion.matches=true;tabs[0].events.click();assert(!get('stats-rate-panel').classes.has('is-leaving'),'Reduced motion switches without overlays');
 assert.equal(get('stats-finish-chart').attrs.viewBox,'0 0 700 220','Chart geometry follows available slot height');
 console.log('Stats panel passed: crossfade, interrupted switching, reduced motion, stable chart sizing, collapsed defaults and info dismissal.');
})().catch(e=>{console.error(e);process.exitCode=1});
