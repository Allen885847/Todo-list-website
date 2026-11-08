const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),weekContext=require('./week-context.cjs');
const src=fs.readFileSync('calendar.js','utf8');
const fn=(s,name)=>s.slice(s.indexOf(`function ${name}(`),s.indexOf('\n}\n',s.indexOf(`function ${name}(`))+3);
class Node{constructor(){this.children=[];this.attrs={};this.classList={add(){}}}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}setAttribute(k,v){this.attrs[k]=v}addEventListener(){}}
const stage=new Node(),c={Date,Intl,stage,periodLabel:new Node(),document:{createElement:()=>new Node(),createDocumentFragment:()=>new Node()},weekdayNames:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],monthNames:['January','February','March','April','May','June','July','August','September','October','November','December'],holidaysOnDate:()=>[],countsForDate:()=>({tasks:0,events:0}),createDots:()=>({dots:new Node(),counts:{}}),openDate(){},formatLongDate:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
vm.createContext(c);vm.runInContext(`let selectedDate=new Date(2026,10,8),calendarView='week';${['startOfDay','addDays','addMonths','addYears','startOfWeek','startOfMondayWeek','toIsoDate','sameDate','isWeekend','movedPeriodDate','renderMonth','renderYear'].map(n=>fn(src,n)).join('\n')}globalThis.select=d=>selectedDate=d;globalThis.move=n=>selectedDate=movedPeriodDate(n);globalThis.week=()=>toIsoDate(startOfWeek(selectedDate));`,c);
assert.equal(c.week(),'2026-11-02','Sunday belongs to the preceding Monday');c.move(1);assert.equal(c.week(),'2026-11-09');c.move(-1);assert.equal(c.week(),'2026-11-02');
c.renderMonth();let [labels,grid]=stage.children[0].children;assert.deepEqual(labels.children.map(x=>x.textContent),['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);assert.match(grid.children[6].attrs['aria-label'],/2026-11-01/);assert.match(grid.children[13].attrs['aria-label'],/2026-11-08/);
c.renderYear();const november=stage.children[0].children[10];assert.deepEqual(november.children[1].children.map(x=>x.textContent),['M','T','W','T','F','S','S']);assert.equal(november.children[2].children[6].children[0].textContent,'1');
c.select(new Date(2027,0,3));assert.equal(c.week(),'2026-12-28');c.move(1);assert.equal(c.week(),'2027-01-04');
for(const day of ['2026-11-02','2026-11-07','2026-11-08'])assert.match(weekContext(day),/Next week: 2026-11-09 \(Monday\) through 2026-11-15 \(Sunday\)/);
assert.match(weekContext('2027-01-03'),/Next week: 2027-01-04/);assert.match(weekContext('2026-03-08'),/Next week: 2026-03-09/);assert.throws(()=>weekContext('2026-02-30'));
(async()=>{
 for(const file of ['server.js','src/cloudflare-ai.mjs']){
  const s=fs.readFileSync(file,'utf8'),prompts=[],context={weekContext,AbortSignal,JSON,getLocalContext:()=>({today:'2026-11-08',localTime:'Sunday'}),localContext:()=>({today:'2026-11-08',localTime:'Sunday'}),apiKey:()=>'',normalizeGeneratedTasks:x=>x,normalizeGeneratedEvents:x=>x,normalizeTasks:x=>x,normalizeEvents:x=>x,callDeepSeek:async(env,messages)=>{prompts.push(messages[0].content);return {tasks:[],events:[]}},fetch:async(url,opts)=>{prompts.push(JSON.parse(opts.body).messages[0].content);return {ok:true,json:async()=>({choices:[{message:{content:'{"tasks":[],"events":[]}'}}]})}}};
  vm.createContext(context);vm.runInContext(['parseTasks','parseEvents'].map(n=>'async '+fn(s,n)).join('\n'),context);
  if(file==='server.js'){await context.parseTasks('Next Monday homework','Asia/Shanghai');await context.parseEvents('下周一上课','Asia/Shanghai')}else{await context.parseTasks({},'Next Monday homework','Asia/Shanghai');await context.parseEvents({},'下周一上课','Asia/Shanghai')}
  assert.equal(prompts.length,2);for(const p of prompts){assert.match(p,/Next week: 2026-11-09 \(Monday\) through 2026-11-15 \(Sunday\)/);assert.match(p,/next Monday \/ 下周一 = 2026-11-09/);assert.doesNotMatch(p,/Week-relative weekday phrases[^\n]*require confirmation/)}
 }
 console.log('Monday-first calendars, Sunday navigation, year/DST boundaries, and both AI task/event prompts passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
