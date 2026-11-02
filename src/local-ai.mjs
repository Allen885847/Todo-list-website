import { handleAiRequest } from './cloudflare-ai.mjs';
const COOKIE = '__Secure-todo-local-ai';
const encoder = new TextEncoder();
const json = (data, status = 200, extra = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store',...extra}});
async function key(secret) { return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function createSession(secret, now = Date.now()) {
  const payload = `${crypto.randomUUID()}.${Math.floor(now/1000)+86400}`;
  return payload+'.'+hex(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload))));
}
export async function readSession(value, secret, now = Date.now()) {
  if(!secret || !/^[a-f0-9-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(value || ''))return null;
  const [id,expires,signature]=value.split('.');
  if(Number(expires)<=now/1000 || Number(expires)>now/1000+86500)return null;
  const bytes=Uint8Array.from(signature.match(/../g),part=>parseInt(part,16));
  return await crypto.subtle.verify('HMAC',await key(secret),bytes,encoder.encode(`${id}.${expires}`)) ? {id,expires:Number(expires)} : null;
}
async function scopeHash(value, secret) { return hex(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(value)))); }
async function quota(env,scope,limit) {
  const day=new Date().toISOString().slice(0,10);
  const row=await env.DB.prepare(`INSERT INTO local_ai_usage(day,scope,requests) VALUES(?,?,1)
    ON CONFLICT(day,scope) DO UPDATE SET requests=requests+1 WHERE requests < ? RETURNING requests`).bind(day,scope,limit).first();
  return Boolean(row);
}
export async function handleLocalAi(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/local-ai/'))return null;
  if(!env.BETTER_AUTH_SECRET)return json({error:'Hosted AI is temporarily unavailable. Manual entry is still available.'},503);
  if(request.method==='POST' && request.headers.get('Origin')!==url.origin)return json({error:'Open AI from your Todo List local workspace.'},403);
  const secret=env.BETTER_AUTH_SECRET;
  const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const session=await readSession(token,secret);
  if(url.pathname==='/api/local-ai/session' && request.method==='GET')return json({active:Boolean(session)});
  const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash=await scopeHash('ip:'+ip,secret);
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(env.LOCAL_AI_RATE_LIMITER && !(await env.LOCAL_AI_RATE_LIMITER.limit({key:ipHash})).success)return json({error:'AI is receiving too many requests. Wait a minute and retry.'},429);
  if(url.pathname==='/api/local-ai/session') {
    if(session)return json({active:true});
    if(!env.TURNSTILE_SECRET_KEY)return json({error:'The secure AI connection is not configured yet.'},503);
    if(Number(request.headers.get('Content-Length'))>4096)return json({error:'Invalid connection check.'},400);
    let body;try{const text=await request.text();if(text.length>4096)throw 0;body=JSON.parse(text)}catch{return json({error:'Invalid connection check.'},400)}
    if(typeof body.token!=='string'||!body.token||body.token.length>2048)return json({error:'Complete the secure AI connection check and retry.'},400);
    try {
      const result=await(await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.token,remoteip:ip})})).json();
      const hosts=(env.TURNSTILE_HOSTNAMES||url.hostname).split(',').map(s=>s.trim());
      if(!result.success||result.action!=='local_ai'||!hosts.includes(result.hostname))return json({error:'The secure AI connection check failed. Please retry.'},403);
      const value=await createSession(secret);
      return json({active:true},200,{'Set-Cookie':`${COOKIE}=${value}; Path=/api/local-ai/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`});
    }catch{return json({error:'The AI connection check is unavailable. Check your connection and retry.'},503)}
  }
  if(!session)return json({error:'Reconnect to hosted AI and retry.'},401);
  if(request.headers.get('X-Todo-Local')!=='1')return json({error:'Open AI from the local workspace.'},403);
  const action=url.pathname.slice('/api/local-ai/'.length);
  if(!['parse-tasks','parse-event','transcribe'].includes(action))return json({error:'Not found.'},404);
  const max=action==='transcribe'?15*1024*1024:32000;
  if(Number(request.headers.get('Content-Length'))>max)return json({error:'This input is too large. Try a shorter description or recording.'},413);
  try {
    for(const [scope,limit] of [['global',Number(env.LOCAL_AI_DAILY_GLOBAL)||5000],['ip:'+ipHash,Number(env.LOCAL_AI_DAILY_IP)||500],['session:'+session.id,Number(env.LOCAL_AI_DAILY_SESSION)||100]]) {
      if(!await quota(env,scope,limit))return json({error:'The hosted AI daily limit has been reached. You can still add tasks and events manually. Try AI again tomorrow.'},429);
    }
    // Keep only anonymous usage counts; no account lookup or account message writes.
    url.pathname='/api/'+action;
    return await handleAiRequest(new Request(url,request),env,null);
  }catch{return json({error:'Hosted AI is temporarily unavailable. Your input is preserved; please retry.'},503)}
}
