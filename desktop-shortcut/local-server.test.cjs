const assert = require('node:assert/strict');
const H = require('../completion-history.js');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'todo-local-verify-'));
  const serverPath=path.resolve('server.js');let child;
  async function start(){
    child=spawn(process.execPath,['-e',`require(${JSON.stringify(serverPath)}).createServer().listen(0,'127.0.0.1',function(){console.log(this.address().port)})`],{env:{...process.env,TODO_DATA_DIR:directory,TODO_SHORTCUT_MODE:'1'},stdio:['ignore','pipe','pipe']});
    child.stderr.on('data',()=>{});
    return await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',data=>resolve('http://127.0.0.1:'+String(data).trim()));});
  }
  async function stop(){if(child&&!child.killed){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}}
  try {
    let base=await start();
    const initial={ 'todo-list-mvp':JSON.stringify({title:'Local test',tasks:[{id:'a',task:'Homework',date:{day:2,month:11,year:2026},label:'Extra',completed:true,completedOn:'2026-11-02'}]}), 'todo-calendar-events':JSON.stringify([{id:'event',title:'Holiday',holiday:true,startDate:'2026-12-31',endDate:'2027-01-14',startTime:'15:00',endTime:'16:00'}]),'todo-appearance':'dark','todo-task-timers-v1':JSON.stringify({owner:'local',timers:{}}) };
    initial[H.KEY]=JSON.stringify(H.update(null,[{id:'rate',date:{year:2026,month:11,day:4},completed:true,completedOn:'2026-11-04',label:''}],{now:new Date('2026-11-04T18:00:00'),transition:{id:'rate',before:false,after:true}}));
    initial[H.KEY]=JSON.stringify(H.update(initial[H.KEY],[{id:'rate',date:{year:2026,month:11,day:4},completed:true,completedOn:'2026-11-04',label:''},{id:'missed',task:'Forgotten task',date:{year:2026,month:11,day:4},completed:false},{id:'detail',task:'Saved detail',label:'Extra',completed:true,completedOn:'2026-11-04'}],{now:new Date('2026-11-04T18:00:00'),transition:{id:'detail',before:false,after:true}}));
    initial[H.KEY]=JSON.stringify(H.editFinish(initial[H.KEY],'2026-11-04',{date:'2026-11-05',time:'00:15',showEdited:true}));
    initial[H.KEY]=JSON.stringify(H.editRate(initial[H.KEY],'2026-11-04',['missed'],[],{now:new Date('2026-11-05T12:00:00')}));
    const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
    assert.equal((await (await fetch(base+'/api/desktop/health')).json()).loginRequired,false);
    assert.equal((await post('/api/local-data',{data:initial})).status,200);
    assert.equal((await post('/api/local-data',{data:{}},{Origin:'https://attacker.invalid'})).status,403);
    assert.equal((await fetch(base+'/api/local-data',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await post('/api/desktop/ai-settings',{DEEPSEEK_API_KEY:'qa-private-key-not-real'})).status,200);
    const config=await (await fetch(base+'/api/desktop/config')).json();assert.equal(config.deepseekConfigured,true);assert.equal(JSON.stringify(config).includes('qa-private-key'),false);
    assert.equal((await fs.stat(path.join(directory,'ai-connection.json'))).mode&0o777,0o600);
    assert.equal((await post('/api/desktop/backup',{})).status,200);
    const backups=await fs.readdir(path.join(directory,'backups'));assert.equal(backups.length,1);
    const recovery=JSON.parse(await fs.readFile(path.join(directory,'backups',backups[0]),'utf8'));assert.deepEqual(recovery.data,initial);assert.equal(JSON.stringify(recovery).includes('qa-private-key'),false);
    await stop();base=await start();
    assert.deepEqual((await (await fetch(base+'/api/local-data')).json()).data,initial);
    const legacy={...initial};delete legacy[H.KEY];
    assert.equal((await post('/api/local-data',{data:legacy})).status,200);
    const saved=(await (await fetch(base+'/api/local-data')).json()).data;
    assert.equal(H.read(saved[H.KEY]).days['2026-11-04'].rate.completed,1,'Local file and old-client saves must preserve rate history');
    const older=JSON.parse(saved[H.KEY]);delete older.finishEdits;delete older.rateCohorts;delete older.rateEdits;Object.values(older.days).forEach(entry=>delete entry.bonusDetails);
    assert.equal((await post('/api/local-data',{data:{...saved,[H.KEY]:JSON.stringify(older)}})).status,200);
    assert.equal(H.read((await (await fetch(base+'/api/local-data')).json()).data[H.KEY]).days['2026-11-04'].bonusDetails.detail.title,'Saved detail','Restart and old-client saves preserve task snapshots');
    assert.equal(H.read((await (await fetch(base+'/api/local-data')).json()).data[H.KEY]).finishEdits['2026-11-04'].corrected.day,'2026-11-05','Local saves preserve corrections and original timestamps across restart and old-client writes');
    const persistedRate=H.read((await (await fetch(base+'/api/local-data')).json()).data[H.KEY]);assert(persistedRate.rateEdits['2026-11-04'].onTimeIds.includes('missed'));assert.equal(H.rows(persistedRate,{now:new Date('2026-11-05T12:00:00')})[5].rate.percent,100);
    assert.equal((await fetch(base+'/.env')).status,404);
    console.log('Local Shortcut server passed: no login, atomic save/reopen, all data types, local recovery backup, private AI setup, no key export, cross-origin and non-JSON write protection.');
  } finally {await stop();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
