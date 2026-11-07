import assert from 'node:assert/strict';
import History from './completion-history.js';
import { handleDataRequest } from './src/cloudflare-data.mjs';
const records = new Map(), backups = new Map();
let beforeWrite;
const env = {
  DB: { prepare: sql => ({ bind: (...values) => ({
    first: async () => records.get(values[0]) || null,
    run: async () => {
      const hook = beforeWrite; beforeWrite = null; hook?.();
      const current = records.get(values[0]);
      if (current && current.data_json !== values[4]) return {meta:{changes:0}};
      records.set(values[0], { schema_version: values[1], data_json: values[2], updated_at: values[3] });
      return {meta:{changes:1}};
    },
  }) }) },
  BUCKET: { put: async (key, data) => backups.set(key, data), get: async key => backups.has(key) ? { json: async () => JSON.parse(backups.get(key)) } : null },
};
const data = {
  'todo-list-mvp': JSON.stringify({ title: 'Private title', tasks: [{ id: 'a', task: 'Test', label: 'Extra', completed: true }] }),
  'todo-calendar-events': JSON.stringify([{ id: 'e', title: 'Holiday', holiday: true, startDate: '2026-12-31', endDate: '2027-01-14' }]),
  'todo-task-timers-v1': JSON.stringify({ owner: 'account-a', timers: {} }),
  'todo-appearance': 'dark',
  [History.KEY]: JSON.stringify(History.update(null,[],{now:new Date('2026-11-04T08:00:00Z')})),
};
const put = new Request('https://test.invalid/api/storage', { method: 'PUT', body: JSON.stringify({ schemaVersion: 1, data: { ...data, credential: 'never-save' } }) });
assert.equal((await handleDataRequest(put, env, 'account-a')).status, 200);
const get = () => new Request('https://test.invalid/api/storage');
const restored = await (await handleDataRequest(get(), env, 'account-a')).json();
assert.deepEqual(restored.data, data);
assert.equal((await (await handleDataRequest(get(), env, 'account-b')).json()).exists, false);
// An older tab without the new key must not erase separately recorded history.
const legacyData = {...data}; delete legacyData[History.KEY];
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:legacyData})}),env,'account-a')).status,200);
assert.equal((await (await handleDataRequest(get(),env,'account-a')).json()).data[History.KEY],data[History.KEY]);
records.clear();
const recovered = await (await handleDataRequest(get(), env, 'account-a')).json();
assert.equal(recovered.recoveredFromBackup, true);
assert.deepEqual(recovered.data, data);
// A concurrent writer between read and CAS must not drop either device's counts.
const now = new Date('2026-11-04T08:00:00Z'), day = History.localDay(now);
const bonus = id => ({id,task:'Recorded '+id,label:'Extra',completed:true,completedOn:day,date:null});
const leftHistory = History.update(null,[bonus('device-a')],{now,transition:{id:'device-a',before:false,after:true}});
const rightHistory = History.update(null,[bonus('device-b')],{now,transition:{id:'device-b',before:false,after:true}});
beforeWrite = () => records.set('account-a',{schema_version:1,data_json:JSON.stringify({...data,[History.KEY]:JSON.stringify(rightHistory)}),updated_at:now.toISOString()});
const race = await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...data,[History.KEY]:JSON.stringify(leftHistory)}})}),env,'account-a');
assert.equal(race.status,200);
const combined = await (await handleDataRequest(get(),env,'account-a')).json();
assert.deepEqual(History.read(combined.data[History.KEY]).days[day].bonus,['device-a','device-b']);
console.log('Completion history cloud persistence passed: older clients preserve history, concurrent saves retry and union counts, account isolation and private R2 recovery.');
console.log('Account snapshots passed: task/event/holiday/settings/timer round trip, private per-account storage, allowlist, and R2 recovery.');

// An older history-aware client omits only the new optional rate fields.
const oldHistory=JSON.parse(combined.data[History.KEY]);delete oldHistory.rateStarted;
Object.values(oldHistory.days).forEach(entry=>{delete entry.rate;delete entry.bonusDetails;entry.updatedAt=new Date(now.getTime()+3600000).toISOString()});
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...combined.data,[History.KEY]:JSON.stringify(oldHistory)}})}),env,'account-a')).status,200);
const withRate=History.read((await (await handleDataRequest(get(),env,'account-a')).json()).data[History.KEY]);
assert.deepEqual(withRate.days[day].rate,History.read(combined.data[History.KEY]).days[day].rate,'A newer old-client write preserves the independently timestamped rate');
assert.ok(withRate.rateStarted);

assert.equal(withRate.days[day].bonusDetails['device-a'].title,'Recorded device-a');
assert.equal(withRate.days[day].bonusDetails['device-b'].title,'Recorded device-b');

const regular={id:'regular-finish',date:{year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate()},completed:true,completedOn:day};
const finishHistory=History.update(withRate,[regular],{now,transition:{id:regular.id,before:false,after:true}});
const correctedHistory=History.editFinish(finishHistory,day,{date:day,time:'20:15',showEdited:true},{now});
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...combined.data,[History.KEY]:JSON.stringify(correctedHistory)}})}),env,'account-a')).status,200);
const stripped=JSON.parse(JSON.stringify(correctedHistory));delete stripped.finishEdits;
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...combined.data,[History.KEY]:JSON.stringify(stripped)}})}),env,'account-a')).status,200);
const persistedEdit=History.read((await (await handleDataRequest(get(),env,'account-a')).json()).data[History.KEY]).finishEdits[day];
assert.equal(persistedEdit.corrected.minutes,1215);assert.equal(persistedEdit.original.at,now.toISOString());assert(persistedEdit.showEdited);

const missed={id:'missed-past',task:'Forgotten check-off',date:regular.date,completed:false};
let pastSource=History.update(null,[regular,missed],{now,transition:{id:regular.id,before:false,after:true}});
pastSource=History.editRate(pastSource,day,[missed.id],[regular,missed],{now:new Date(now.getTime()+86400000)});
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...combined.data,[History.KEY]:JSON.stringify(pastSource)}})}),env,'rate-account')).status,200);
const oldRateClient=JSON.parse(JSON.stringify(pastSource));delete oldRateClient.rateCohorts;delete oldRateClient.rateEdits;
assert.equal((await handleDataRequest(new Request('https://test.invalid/api/storage',{method:'PUT',body:JSON.stringify({data:{...combined.data,[History.KEY]:JSON.stringify(oldRateClient)}})}),env,'rate-account')).status,200);
const savedPast=History.read((await (await handleDataRequest(get(),env,'rate-account')).json()).data[History.KEY]);
assert(savedPast.rateEdits[day].onTimeIds.includes(missed.id));assert.equal(History.rows(savedPast,{now:new Date(now.getTime()+86400000)})[5].rate.percent,100);assert.equal(History.rows(savedPast,{now:new Date(now.getTime()+86400000)})[5].finish,null);
