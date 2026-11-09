// Explicit local-only promotion. Never deploys or changes the launcher or server.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const [applicationDirectory,dataDirectory]=process.argv.slice(2).map(p=>resolve(p));
if(!applicationDirectory||!dataDirectory)throw new Error('Usage: node scripts/update-local-refresh.mjs <local-app-directory> <local-data-directory>');
let html=await readFile(join(applicationDirectory,'index.html'),'utf8');
if(!html.includes('<script src="script.js"></script>')||!html.includes('</head>'))throw new Error('Local page was not recognized; no files changed.');
const backup=join(dataDirectory,'backups',`before-local-refresh-${Date.now()}`);
await mkdir(backup,{recursive:true,mode:0o700});
for(const file of ['state.json','state.previous.json']){
  try {const data=await readFile(join(dataDirectory,file));await writeFile(join(backup,file),data,{mode:0o600});}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const file of ['index.html','script.js','weather.js'])await copyFile(join(applicationDirectory,file),join(backup,file));
// Bundle into the local page: the existing server has a strict asset allowlist.
// This avoids changing/restarting it or touching its authentication/storage code.
html=html.replace(/\s*<script src="local-refresh.js"><\/script>/,'').replace(/\s*<link rel="stylesheet" href="local-refresh.css">/,'');
html=html.replace(/\s*<script data-local-refresh>[\s\S]*?<\/script>/,'').replace(/\s*<style data-local-refresh>[\s\S]*?<\/style>/,'');
const js=await readFile(join(root,'desktop-shortcut/local-refresh.js'),'utf8');
const css=await readFile(join(root,'desktop-shortcut/local-refresh.css'),'utf8');
html=html.replace('<script src="script.js"></script>',`<script data-local-refresh>\n${js}\n</script>\n    <script src="script.js"></script>`);
html=html.replace('</head>',`<style data-local-refresh>\n${css}\n</style>\n  </head>`);
for(const file of ['script.js','weather.js'])await copyFile(join(root,file),join(applicationDirectory,file));
for(const file of ['local-refresh.js','local-refresh.css'])await copyFile(join(root,'desktop-shortcut',file),join(applicationDirectory,file));
await writeFile(join(applicationDirectory,'index.html'),html);
console.log(`Local-only refresh installed. Recoverable backup: ${backup}`);
