const assert=require('node:assert/strict'),H=require('./completion-history');
const at=(day,time='12:00:00')=>new Date(`${day}T${time}`);
const task=(id,due,options={})=>({id,date:due?{year:+due.slice(0,4),month:+due.slice(5,7),day:+due.slice(8,10)}:null,completed:false,completedOn:null,label:'',...options});
for(const zone of ['Asia/Shanghai','America/Los_Angeles','Pacific/Kiritimati']){
 process.env.TZ=zone;
 const day='2026-11-04';let tasks=[task('a',day),task('b',day),task('c',day),task('d',day),task('early',day,{completed:true,completedOn:'2026-11-03'}),task('extra',day,{label:'Extra'}),task('past','2026-11-03'),task('future','2026-11-05'),task('no-date',null)];
 let history=H.update(null,tasks,{now:at(day,'09:00:00')});
 assert.equal(history.days[day].rate.total,5);assert.equal(history.days[day].rate.completed,1,'Early completion belongs to the due-day rate');assert.equal(H.rows(history,{now:at(day)}).at(-1).rate.percent,20);
 const change=(id,completed,when)=>{const t=tasks.find(t=>t.id===id),before=t.completed;t.completed=completed;t.completedOn=completed?H.localDay(when):null;history=H.update(history,tasks,{now:when,transition:{id,before,after:completed}})};
 for(const id of ['a','b','c']) change(id,true,at(day,'18:00:00'));
 let row=H.rows(history,{now:at(day)}).at(-1);assert.equal(row.rate.completed,4);assert.equal(row.rate.total,5);assert.equal(row.rate.percent,80);assert.equal(row.finish,null,'Rate must not alter the finish-time eligibility');
 change('c',false,at(day,'18:01:00'));assert.equal(H.rows(history,{now:at(day)}).at(-1).rate.percent,60);
 change('c',true,at(day,'18:02:00'));change('extra',true,at(day,'19:00:00'));change('future',true,at(day,'19:01:00'));change('past',true,at(day,'19:02:00'));assert.equal(H.rows(history,{now:at(day)}).at(-1).rate.percent,80);assert.equal(history.days[day].bonus.length,2);
 const before=JSON.stringify(history.days[day].rate);const midnight=H.update(history,[],{now:at('2026-11-05','00:00:00')});assert.equal(midnight.days[day].rate.completed,4);assert.equal(midnight.days[day].rate.total,5);assert.equal(midnight.days[day].rate.finalized,true);assert.equal(midnight.days[day].rate.updatedAt,JSON.parse(before).updatedAt,'Sealing cannot make a stale observation look newer');assert.equal(H.rows(midnight,{now:at('2026-11-05')}).at(-1).rate,null,'No eligible tasks is a gap');
 history=JSON.parse(JSON.stringify(midnight));change('d',true,at('2026-11-05','10:00:00'));assert.equal(history.days[day].rate.completed,4,'A late completion must not repair yesterday’s rate');assert.equal(history.days[day].finish,null);
 tasks[0].completed=false;tasks[0].completedOn=null;history=H.update(history,tasks,{now:at('2026-11-06')});assert.equal(history.days[day].rate.completed,4,'Later unchecking or editing cannot rewrite a sealed day');
 assert.equal(H.rows(history,{now:at('2026-11-06')}).find(r=>r.day==='2026-11-03').rate,null,'Unobserved days are not backfilled');
 const legacy=JSON.parse(JSON.stringify(history));delete legacy.rateStarted;for(const entry of Object.values(legacy.days))delete entry.rate;
 assert.equal(H.read(legacy).rateStarted,null);assert.equal(H.rows(legacy,{now:at(day)}).at(-1).rate,null,'Old regularTotal fields are not rate history');
 legacy.days[day].updatedAt=at('2026-11-08').toISOString();const merged=H.merge(history,legacy);assert.equal(merged.days[day].rate.completed,4,'A newer old-client summary cannot erase rate data');assert.equal(merged.rateStarted.at,history.rateStarted.at);
 const stale=JSON.parse(JSON.stringify(history));stale.days[day].rate={total:5,completed:2,updatedAt:at(day,'09:00:00').toISOString(),finalized:true};assert.equal(H.merge(stale,history).days[day].rate.completed,4,'Newer actual counts win over stale finalization');
 const invalid=JSON.parse(JSON.stringify(history));invalid.days[day].rate.completed=9;assert.equal(H.read(invalid).days[day].rate,null,'Impossible percentages are rejected');
 const todayLegacy=task('legacy-now',day,{completed:true,completedOn:null});const observed=H.update(null,[todayLegacy],{now:at(day)});assert.equal(observed.days[day].rate.completed,1,'A currently observed completion does not require an exact clock timestamp for its rate');assert.equal(observed.days[day].finish,null,'Unknown exact finish times still stay blank');
 assert.equal(H.rows(H.update(null,[task('extra-only',day,{label:'Extra'})],{now:at(day)}),{now:at(day)}).at(-1).rate,null);
}
console.log('Completion Rate passed: live 4/5=80%, early tasks, Extra exclusion, local dates, midnight/reload retention, late completions, old-history gaps and safe merges.');

// A later real edit is a fresh observation even when its numerator is unchanged.
process.env.TZ='Asia/Shanghai';
const item=task('edit','2026-11-04',{completed:true,completedOn:'2026-11-04'});
let fresh=H.update(null,[item],{now:at('2026-11-04','09:00:00')});
const other=H.update(null,[{...item,completed:false,completedOn:null}],{now:at('2026-11-04','10:00:00')});
fresh=H.update(fresh,[{...item,task:'Edited title'}],{now:at('2026-11-04','11:00:00'),taskMutation:true});
assert.equal(H.merge(other,fresh).days['2026-11-04'].rate.completed,1,'A newer unchanged-count task edit must win over an older count');
const stamp=fresh.days['2026-11-04'].rate.updatedAt;fresh=H.update(fresh,[item],{now:at('2026-11-04','11:01:00')});assert.equal(fresh.days['2026-11-04'].rate.updatedAt,stamp,'A no-op observation must not advance task freshness');
