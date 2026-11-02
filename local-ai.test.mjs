import assert from 'node:assert/strict';
import {createSession,readSession,handleLocalAi} from './src/local-ai.mjs';
const secret='isolated test signing secret, never a credential';
const token=await createSession(secret);assert.ok(await readSession(token,secret));assert.equal(await readSession(token+'0',secret),null);assert.equal(await readSession(token,'wrong secret'),null);assert.equal(await readSession(token,secret,Date.now()+86401000),null);
let calls=[];const env={BETTER_AUTH_SECRET:secret,DB:{prepare(sql){calls.push(sql);return {bind(){return this},first:async()=>({requests:1})}}},TURNSTILE_SECRET_KEY:'test',TURNSTILE_HOSTNAMES:'todolist.uno'};
const request=(path,body={},headers={})=>new Request('https://todolist.uno/api/local-ai/'+path,{method:'POST',headers:{Origin:'https://todolist.uno','X-Todo-Local':'1','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
assert.equal((await handleLocalAi(request('parse-tasks'),env)).status,401);
assert.equal((await handleLocalAi(request('parse-tasks',{}, {Origin:'https://other.invalid'}),env)).status,403);
assert.equal((await handleLocalAi(request('session',{token:''}),env)).status,400);
const originalFetch=globalThis.fetch;
try {
 globalThis.fetch=async()=>Response.json({success:false});assert.equal((await handleLocalAi(request('session',{token:'test'}),env)).status,403);
 globalThis.fetch=async()=>Response.json({success:true,hostname:'attacker.invalid',action:'local_ai'});assert.equal((await handleLocalAi(request('session',{token:'test'}),env)).status,403);
 globalThis.fetch=async()=>Response.json({success:true,hostname:'todolist.uno',action:'local_ai'});
 const session=await handleLocalAi(request('session',{token:'test'}),env);assert.equal(session.status,200);assert.match(session.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const cookie=session.headers.get('Set-Cookie').split(';')[0];
 const active=await handleLocalAi(new Request('https://todolist.uno/api/local-ai/session',{headers:{Cookie:cookie}}),env);assert.equal((await active.json()).active,true);
 // Valid session reaches the existing parser; the mock provider returns one synthetic task.
 globalThis.fetch=async(url)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');return Response.json({choices:[{message:{content:JSON.stringify({tasks:[{title:'Math worksheet',subject:'Mathematics',emoji:'📐',date:{year:2026,month:11,day:2},completed:false}]})}}]})};
 const parsed=await handleLocalAi(request('parse-tasks',{input:'Math worksheet today',timeZone:'Asia/Shanghai'},{Cookie:cookie}),{...env,DEEPSEEK_API_KEY:'test-server-only'});
 assert.equal(parsed.status,200,await parsed.clone().text());assert.equal((await parsed.json()).tasks.length,1);assert.equal(calls.filter(sql=>sql.includes('INSERT INTO messages')).length,0,'anonymous input must not be written to account messages');
 const quotaEnv={...env,DB:{prepare(){return{bind(){return this},first:async()=>null}}}};assert.equal((await handleLocalAi(request('parse-tasks',{input:'x'},{Cookie:cookie}),quotaEnv)).status,429);
 assert.equal((await handleLocalAi(request('session',{token:'x'}),{...env,LOCAL_AI_RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
}finally{globalThis.fetch=originalFetch}
console.log('Hosted local AI passed: signed sessions, expiry, exact origin and Turnstile checks, server-only provider key, quotas, and no account message writes.');
