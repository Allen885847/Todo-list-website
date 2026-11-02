import {cp,mkdir,readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'), out=join(root,'dist/local'), cache=join(root,'.desktop-build');
await mkdir(out,{recursive:true});await mkdir(cache,{recursive:true});
const assets=['index.html','style.css','impeccable.css','script.js','flip-clock.js','flip-clock.css','weather.js','weather.css','task-timer-engine.js','task-timer-alarm.js','task-timer.js','task-timer.css','task-timer-bindings.js','app-shell.css','app-shell.js','calendar.html','calendar.css','calendar.js','data.css','persistent-storage.js','data-migration.js','task-rules.js','task-file-scanner.js','voice-input.js','page-transition.js','backup-merge.js','merge-review.js','desktop-page.css','desktop-theme.js'];
for(const name of assets)await cp(join(root,'dist',name),join(out,name));
await cp(join(root,'dist/vendor'),join(out,'vendor'),{recursive:true});
await cp(join(root,'desktop/app.html'),join(out,'app.html'));
await cp(join(root,'desktop-shortcut/local-data.html'),join(out,'data.html'));
await cp(join(root,'desktop-shortcut/local-data.js'),join(out,'local-data.js'));
for(const name of ['storage-namespace.js','local-store.js','runtime.js','ai-client.js','local-settings.js','local.css'])await cp(join(root,'browser-local',name),join(out,name));
let data=await readFile(join(out,'data.html'),'utf8');
data=data.replace(/      <section class="desktop-section"><h2>AI connection[\s\S]*?<\/section>/,`      <section class="desktop-section"><h2>AI connection</h2><p>AI uses the website’s hosted DeepSeek and Doubao services. No API key or account is needed. Only text or audio you submit to AI is sent for processing; your saved list stays on this computer.</p><p id="local-ai-state" class="desktop-note"></p></section>
      <section class="desktop-section"><h2>Automatic folder backup</h2><p>Your list saves automatically in this Chrome profile. For an independent recovery copy, choose a folder on your computer. Chrome may ask you to reconnect the folder after reopening. Do not clear browser site data without exporting a backup first.</p><div class="desktop-actions"><button id="local-folder-choose" class="desktop-secondary" type="button">Choose backup folder</button><button id="local-folder-resume" class="desktop-secondary" type="button" hidden>Reconnect folder</button></div><p id="local-folder-status" class="desktop-note" role="status"></p></section>`);
data=data.replace('API keys are not included in backups.','Backups contain your list and settings, with no credentials.').replace('</body>','<script src="local-settings.js"></script></body>');
await writeFile(join(out,'data.html'),data);
let index=await readFile(join(out,'index.html'),'utf8');
index=index.replace('data-desktop-only href="desktop.html"','href="data.html"').replace('>Desktop App</a>','>Data</a>').replace('    <script src="desktop-availability.js"></script>\n','');
await writeFile(join(out,'index.html'),index);
let shell=await readFile(join(out,'app-shell.js'),'utf8');
shell=shell.replace('data: { src: "desktop.html?embedded=1", title: "Desktop App · Todo List" }','data: { src: "data.html?embedded=1", title: "Data · Todo List" }');
await writeFile(join(out,'app-shell.js'),shell);
let scanner=await readFile(join(out,'task-file-scanner.js'),'utf8');await writeFile(join(out,'task-file-scanner.js'),scanner.replaceAll('"/vendor/','"/local/vendor/'));
async function download(url,name){const path=join(cache,name);try{await stat(path)}catch{execFileSync('curl',['--fail','--silent','--show-error','--location','--retry','2','--max-time','120',url,'-o',path],{stdio:'inherit'})}return path;}
let fontCss=await readFile(await download('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap','fonts-source.css'),'utf8');
const urls=[...new Set([...fontCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]))];
await mkdir(join(out,'fonts'),{recursive:true});
for(let i=0;i<urls.length;i++){const name=`planner-font-${i}.ttf`;await cp(await download(urls[i],name),join(out,'fonts',name));fontCss=fontCss.replaceAll(urls[i],'fonts/'+name)}
await writeFile(join(out,'fonts.css'),fontCss);
for(const [family,url] of [['DM-Sans','https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt'],['Fraunces','https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt']])await cp(await download(url,family+'-OFL'),join(out,'fonts',family+'-license.md'));
const bootstrap='<script src="storage-namespace.js"></script><script src="local-store.js"></script><script src="runtime.js"></script><script src="ai-client.js"></script>';
for(const name of ['app.html','index.html','calendar.html','data.html']){
 let html=await readFile(join(out,name),'utf8');html=html.replace('<head>','<head>\n'+bootstrap);
 html=html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[\s\S]*?\/>/g,'');
 html=html.replace('</head>','<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="local.css"></head>');await writeFile(join(out,name),html);
}
async function paths(directory,prefix=''){let files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())files.push(...await paths(join(directory,entry.name),name+'/'));else files.push(name)}return files;}
const files=(await paths(out)).filter(f=>f!=='sw.js').sort();
const digest=createHash('sha256');for(const name of files)digest.update(await readFile(join(out,name)));
const version=digest.digest('hex').slice(0,16);
const resources=files.map(name=>'/local/'+name);
for(const name of ['app','calendar','data'])resources.push('/local/'+name);resources.push('/local/');
const worker=`const CACHE='todo-local-${version}',FILES=${JSON.stringify(resources)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('todo-local-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/local/')||url.pathname==='/local/sw.js')return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const key=url.origin+url.pathname;const hit=await cache.match(key);if(hit)return hit;return fetch(event.request)})())});
`;
await writeFile(join(out,'sw.js'),worker);
console.log('Built login-free, isolated browser-local workspace and offline cache:',version);
