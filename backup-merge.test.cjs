const assert = require('node:assert/strict');
const M = require('./backup-merge.js');
const date = { year: 2026, month: 11, day: 2 };
const task = (id, name, rest = {}) => ({ id, task: name, subject: 'Physics', date, completed: false, label: 'Extra', ...rest });
const event = (id, rest = {}) => ({ id, title: 'Winter holiday', startDate: '2026-12-20', endDate: '2027-01-05', holiday: true, allDay: true, ...rest });
const data = (tasks = [], events = [], settings = {}) => ({ 'todo-list-mvp': JSON.stringify({ title: 'My work', tasks, orderMode: 'manual' }), 'todo-calendar-events': JSON.stringify(events), ...settings });
let a = data([task('a','Homework')], [event('e')], { 'todo-appearance': 'dark' });
let b = data([task('another-id','Homework'),task('b','Reading')], [event('new-id'),event('birthday',{ title: 'Birthday', startDate: '2027-01-06', endDate: '2027-01-06', holiday: false })]);
let plan = M.preview(a,b);
assert.equal(plan.canSave,true); assert.equal(plan.counts.tasks,2); assert.equal(plan.counts.events,2);
assert.equal(JSON.parse(plan.data['todo-list-mvp']).orderMode,'manual');
assert.equal(JSON.parse(plan.data['todo-calendar-events'])[0].endDate,'2027-01-05');
assert.equal(M.preview(plan.data,b).counts.tasks,2); assert.equal(M.preview(plan.data,b).counts.events,2);
assert.equal(JSON.parse(M.preview(data([task('a','Same'),task('b','Same')]), data()).data['todo-list-mvp']).tasks.length,2,'Do not collapse separate records already in target');
b=data([task('a','Homework',{ completed:true, completedOn:'2026-11-02' })], [event('e',{ startTime:'15:00', endTime:'16:00', allDay:false })], {'todo-appearance':'light'});
plan=M.preview(a,b); assert.equal(plan.canSave,false);
const choices=Object.fromEntries(plan.conflicts.map(c=>[c.key,'incoming']));
plan=M.preview(a,b,{choices,owner:'account-a'}); assert.equal(plan.canSave,true);
assert.equal(JSON.parse(plan.data['todo-list-mvp']).tasks[0].completed,true);
assert.equal(JSON.parse(plan.data['todo-list-mvp']).tasks[0].label,'Extra');
assert.equal(JSON.parse(plan.data['todo-calendar-events'])[0].startTime,'15:00');
assert.equal(JSON.parse(plan.data['todo-calendar-events'])[0].holiday,true);
assert.equal(plan.data['todo-appearance'],'light');
assert.equal(JSON.parse(plan.data['todo-task-timers-v1']).owner,'account-a');
const timers=data([task('a','Homework')],[],{'todo-task-timers-v1':JSON.stringify({owner:'local',timers:{a:{id:'a',status:'running',durationMs:60000,remainingMs:60000,endAt:120000}}})});
plan=M.preview(data(),timers,{now:100000,owner:'account-b'});
const imported=Object.values(JSON.parse(plan.data['todo-task-timers-v1']).timers)[0];
assert.equal(imported.status,'paused');assert.equal(imported.remainingMs,20000);
assert.throws(()=>M.readBackup({format:'ai-todo-list-backup',schemaVersion:999,data:a}));
assert.throws(()=>M.readBackup({format:'ai-todo-list-backup',schemaVersion:1,data:{'todo-list-mvp':'not JSON'}}));
assert.equal(M.cleanData({...a,DEEPSEEK_API_KEY:'private-key'}).DEEPSEEK_API_KEY,undefined);
const text=JSON.stringify(a);M.preview(a,b);assert.equal(JSON.stringify(a),text,'Merge preview never mutates source data');
console.log('Backup merge checks passed: all record types, id/content deduplication, repeat imports, explicit conflict choices, preserved source/order/labels/completion/holidays/times/settings, paused timer import, invalid data and secret exclusion.');

const legacy = data([{task:'Same legacy task',subject:'General',date,completed:false},{task:'Same legacy task',subject:'General',date,completed:true}]);
let legacyPlan=M.preview(data(),legacy);assert.equal(legacyPlan.counts.tasks,2,'Do not lose separate legacy occurrences');
legacyPlan=M.preview(legacyPlan.data,legacy);assert.equal(legacyPlan.counts.tasks,2,'Repeated legacy import is occurrence-safe and idempotent');assert.equal(legacyPlan.canSave,true);
assert.equal(JSON.parse(M.preview(legacy,data()).data['todo-list-mvp']).tasks.length,2,'Preserve separate legacy records already saved');

assert.equal(M.preview(data(),data([task('new','Inspectable task')])).additions.tasks[0].task,'Inspectable task');

assert.throws(()=>M.readBackup({format:'ai-todo-list-backup',schemaVersion:1,data:data([task('__proto__','Unsafe identifier')])}));

assert.equal(M.preview(data(),data([task(1234567890123,'Legacy numeric ID')])).canSave,true);
