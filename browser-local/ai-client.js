(() => {
  if (!window.TodoBrowserLocal) return;
  const fetchOriginal = window.fetch.bind(window);
  let preparation;
  async function challenge(siteKey) {
    if (!window.turnstile) await new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
      script.onload=resolve;script.onerror=()=>reject(new Error('The AI connection check could not load. Check your internet connection and retry.'));document.head.append(script);
    });
    return new Promise((resolve,reject) => {
      const holder=document.createElement('div');holder.className='local-ai-check';holder.setAttribute('aria-label','Secure AI connection check');document.body.append(holder);
      let id; const timeout=setTimeout(()=>finish(new Error('The AI connection check timed out. Please retry.')),90000);
      function finish(error,token) { clearTimeout(timeout);if(id!==undefined)try{turnstile.remove(id)}catch{}holder.remove();error?reject(error):resolve(token); }
      id=turnstile.render(holder,{sitekey:siteKey,action:'local_ai',theme:document.documentElement.dataset.theme==='dark'?'dark':'light',appearance:'interaction-only',callback:token=>finish(null,token),'error-callback':()=>finish(new Error('The AI connection check failed. Please retry.')),'expired-callback':()=>finish(new Error('The AI connection check expired. Please retry.'))});
    });
  }
  async function prepare() {
    let response=await fetchOriginal('/api/local-ai/session',{cache:'no-store'});let state=await response.json();
    if(response.ok&&state.active)return;
    const config=await(await fetchOriginal('/api/config',{cache:'no-store'})).json();
    if(!config.turnstileSiteKey)throw new Error('Hosted AI is temporarily unavailable. Manual task and event entry still work.');
    const token=await challenge(config.turnstileSiteKey);
    response=await fetchOriginal('/api/local-ai/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});state=await response.json();
    if(!response.ok)throw new Error(state.error||'Hosted AI could not connect. Please retry.');
  }
  window.fetch=async function(resource,options) {
    const url=new URL(resource instanceof Request ? resource.url : String(resource),location.href);
    const method=options?.method || (resource instanceof Request ? resource.method : 'GET');
    if(method.toUpperCase()!=='POST'||url.origin!==location.origin||!['/api/parse-tasks','/api/parse-event','/api/transcribe'].includes(url.pathname))return fetchOriginal(resource,options);
    try {
      await(preparation ||= prepare().catch(error=>{preparation=null;throw error}));
      const request=new Request(resource,options);const headers=new Headers(request.headers);headers.set('X-Todo-Local','1');
      const result=await fetchOriginal('/api/local-ai/'+url.pathname.split('/').at(-1),{method:request.method,headers,body:await request.arrayBuffer(),signal:request.signal});
      if(result.status===401)preparation=null;
      return result;
    } catch(error) { if(error.name==='AbortError')throw error; return new Response(JSON.stringify({error:navigator.onLine===false?'You are offline. AI needs internet; your local tasks and Calendar are still available.':error.message}),{status:503,headers:{'Content-Type':'application/json'}}); }
  };
})();
