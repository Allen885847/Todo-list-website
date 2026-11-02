import assert from 'node:assert/strict';
import { handleDataRequest } from './src/cloudflare-data.mjs';
const records=new Map(),backups=new Map();let forceRace=false;
const env={DB:{prepare:sql=>({bind:(...v)=>({first:async()=>records.get(v[0])||null,run:async()=>{
  if(sql.includes('WHERE user_snapshots.data_json')){
    const old=records.get(v[0]);
    if(forceRace||(old&&old.data_json!==v[3]))return{meta:{changes:0}};
    records.set(v[0],{schema_version:1,data_json:v[1],updated_at:v[2]});return{meta:{changes:1}};
  }
  records.set(v[0],{schema_version:v[1],data_json:v[2],updated_at:v[3]});return{meta:{changes:1}};
}})})},BUCKET:{put:async(k,v)=>backups.set(k,v),get:async k=>backups.has(k)?{json:async()=>JSON.parse(backups.get(k))}:null}};
const task=(id,name,completed=false)=>({id,task:name,subject:'Physics',date:{year:2026,month:11,day:2},completed,label:'Extra'});
const data=tasks=>({'todo-list-mvp':JSON.stringify({title:'Tasks',tasks}),'todo-calendar-events':'[]'});
const a=data([task('a','Homework')]);
records.set('account-a',{schema_version:1,data_json:JSON.stringify(a),updated_at:'initial'});
const get=async user=>(await handleDataRequest(new Request('https://test.invalid/api/storage'),env,user)).json();
const merge=(body,user='account-a',origin='https://test.invalid')=>handleDataRequest(new Request('https://test.invalid/api/desktop/merge',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({accountId:user,...body})}),env,user);
let snapshot=await get('account-a');
assert.equal((await merge({data:data([]),revision:snapshot.revision,confirmed:false})).status,400);
assert.equal((await merge({data:data([]),revision:snapshot.revision,confirmed:true},'account-a','https://attacker.invalid')).status,403);
let response=await merge({data:data([task('a','Homework',true)]),revision:snapshot.revision,confirmed:true});assert.equal(response.status,422);
response=await merge({data:data([task('a','Homework',true),task('b','Reading')]),choices:{'task:a':'incoming'},revision:snapshot.revision,confirmed:true});assert.equal(response.status,200);
const result=await response.json();assert.equal(result.counts.tasks,2);assert.equal(JSON.parse(result.data['todo-list-mvp']).tasks[0].completed,true);
assert.equal([...backups.keys()].some(k=>k.startsWith('accounts/account-a/import-backups/')),true);
const old=JSON.parse([...backups.entries()].find(([k])=>k.includes('import-backups'))[1]);assert.deepEqual(old.data,a);
assert.equal((await get('account-b')).exists,false);
assert.equal((await merge({data:a,revision:snapshot.revision,confirmed:true})).status,409);
snapshot=await get('account-a');forceRace=true;
assert.equal((await merge({data:a,choices:{"task:a":"current"},revision:snapshot.revision,confirmed:true})).status,409);forceRace=false;
assert.deepEqual((await get('account-a')).data,result.data);
console.log('Desktop merge endpoint passed: explicit confirmation, same-origin guard, conflict review, account isolation, pre-import recovery, atomic revision checks, stale preview/race rejection.');

assert.equal((await merge({data:a,revision:(await get('account-a')).revision,confirmed:true,accountId:'account-b'})).status,409);
