// One hosted connection for Online and login-free Shortcut clients. Never send credentials to clients.
const MONTHLY_LIMIT = 10_000; // Attempts, not just successes. Even two UTC buckets stay below the 50k free tier.
const flights = new Map();
let signing;
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' };
const response = (data,status=200,ttl=0) => new Response(JSON.stringify(data),{status,headers:{...headers,...(ttl?{'Cache-Control':`public, max-age=${ttl}`}:{})}});
const fallback = () => ({ provider:'open-meteo',weather:null,air:null });
const finite = x => typeof x==='number' && Number.isFinite(x);
const bands = ['good','moderate','sensitive','unhealthy','very-unhealthy','hazardous'];
function weatherCode(code) {
  const n=Number(code); if(n===100||n===150)return 0;if(n===102||n===152)return 1;if(n===101||n===103||n===151||n===153)return 2;if(n===104)return 3;
  if([302,303,304].includes(n))return 95;if(n>=300&&n<400)return 61;if(n>=400&&n<500)return 71;if(n>=500&&n<600)return 45;return null;
}
export function normalizeWeather(current,daily) {
  if(!finite(current?.temperature?.value)||!Array.isArray(daily?.days)||daily.days.length<4)return null;
  const days=daily.days.slice(0,4);if(days.some(d=>!/^\d{4}-\d{2}-\d{2}T/.test(d.forecastStartTime)||!finite(d.temperatureMax?.value)||!finite(d.temperatureMin?.value)))return null;
  const probability=d=>{const values=[d.daytime?.precipitation?.probability,d.nighttime?.precipitation?.probability].filter(x=>finite(x)&&x>=0&&x<=1);return values.length?Math.round(Math.max(...values)*100):null};
  return {current:{temperature_2m:current.temperature.value,weather_code:weatherCode(current.condition?.code),condition:current.condition?.text||'',time:current.validTime||null},daily:{time:days.map(d=>d.forecastStartTime.slice(0,10)),weather_code:days.map(d=>weatherCode(d.daytime?.condition?.code)),condition:days.map(d=>d.daytime?.condition?.text||''),temperature_2m_max:days.map(d=>d.temperatureMax.value),temperature_2m_min:days.map(d=>d.temperatureMin.value),precipitation_probability_max:days.map(probability)}};
}
export function normalizeAir(data) {
  const a=data?.indexes?.find(x=>x.code==='cn-mee')||data?.indexes?.find(x=>x.code==='us-epa')||data?.indexes?.find(x=>x.code!=='qaqi')||data?.indexes?.[0];
  if(!finite(a?.aqi)||a.aqi<0||!a.category||!bands[Number(a.level)-1])return null;
  return {value:a.aqi,display:String(a.aqiDisplay??a.aqi),scale:a.code,name:a.code==='cn-mee'?'China AQI':a.name||'AQI',category:a.category,level:bands[Number(a.level)-1],source:'QWeather'};
}
function configuration(env) {
  try {const c=JSON.parse(env.QWEATHER_CONFIG||'null');return c&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.qweatherapi\.com$/.test(c.host)&&c.privateKey&&c.credentialId&&c.developerId&&c.projectId?c:null}catch{return null}
}
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
async function jwt(c,now) {
  const signatureKey=JSON.stringify(c);
  if(signing?.signatureKey===signatureKey&&signing.expires>now+60_000)return signing.token;
  const bytes=Uint8Array.from(atob(c.privateKey.replace(/-----[^-]+-----|\s/g,'')),x=>x.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'Ed25519'},false,['sign']);
  const encode=x=>b64(new TextEncoder().encode(JSON.stringify(x)));const at=Math.floor(now/1000);
  const body=encode({alg:'EdDSA',kid:c.credentialId})+'.'+encode({iss:c.developerId,sub:c.projectId,iat:at-30,exp:at+600});
  const token=body+'.'+b64(new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(body))));signing={signatureKey,token,expires:now+600_000};return token;
}
export async function reserveRequest(db,now=Date.now()) {
  // Atomic conditional increment survives deployments, concurrent isolates and local-client restarts.
  const period=new Date(now).toISOString().slice(0,7);
  const result=await db.prepare('INSERT INTO weather_request_budget (period, used) VALUES (?, 1) ON CONFLICT(period) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(period,MONTHLY_LIMIT).first();
  return Boolean(result&&result.used<=MONTHLY_LIMIT);
}
export async function handleWeather(request,env,ctx={},options={}) {
  const url=new URL(request.url);if(url.pathname!=='/api/weather')return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return response({error:'Use GET to load weather.'},405);
  const latitude=Number(url.searchParams.get('latitude')),longitude=Number(url.searchParams.get('longitude'));
  if(!url.searchParams.has('latitude')||!url.searchParams.has('longitude')||!url.searchParams.get('latitude')?.trim()||!url.searchParams.get('longitude')?.trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return response({error:'Valid latitude and longitude are required.'},400);
  const cfg=configuration(env);if(!cfg||!env.DB)return response(fallback());
  const now=options.now??Date.now();
  const lat=latitude.toFixed(2),lon=longitude.toFixed(2),cache=options.cache??globalThis.caches?.default;
  // Expire at quarter-hour boundaries, including local midnight, so Today never reuses yesterday's forecast.
  const key=new Request(`${url.origin}/api/weather?latitude=${lat}&longitude=${lon}&bucket=${Math.floor(now/900000)}`);
  try {const hit=await cache?.match(key);if(hit)return hit;}catch{}
  const flightKey=key.url;let work=flights.get(flightKey);
  if(!work){
    work=(async()=>{
      const fetcher=options.fetcher||fetch;
      let token;try{token=await jwt(cfg,now)}catch{return fallback()}
      async function get(endpoint){
        // Fail closed: no database, reservation failure or exhausted quota means no paid-provider call.
        if(!await reserveRequest(env.DB,now))throw new Error('Free weather allowance reached');
        const r=await fetcher(`https://${cfg.host}${endpoint}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw new Error('Weather unavailable');return r.json();
      }
      const r=await Promise.allSettled([get(`/weather/v1/current/${lat}/${lon}?localTime=true&lang=en`),get(`/weather/v1/daily/${lat}/${lon}?days=4&localTime=true&lang=en`),get(`/airquality/v1/current/${lat}/${lon}?lang=en`)]);
      const value=i=>r[i].status==='fulfilled'?r[i].value:null;
      const weather=normalizeWeather(value(0),value(1)),air=normalizeAir(value(2));return weather||air?{provider:'qweather',weather,air}:fallback();
    })().catch(()=>fallback()).finally(()=>flights.delete(flightKey));
    if(flights.size<256)flights.set(flightKey,work);
  }
  const result=await work,ttl=Math.max(1,Math.min(result.weather&&result.air?900:60,900-Math.floor(now/1000)%900));
  const output=response(result,200,ttl);
  if(cache){const save=cache.put(key,output.clone()).catch(()=>{});if(ctx.waitUntil)ctx.waitUntil(save);else await save;}
  return output;
}
