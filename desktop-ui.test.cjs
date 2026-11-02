const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
for(const [agent,platform,touches,mobile] of [['Mozilla/5.0 Macintosh','MacIntel',0,false],['Mozilla/5.0 Windows NT','Win32',0,false],['Mozilla/5.0 iPhone Mobile','iPhone',5,true],['Mozilla/5.0 Android','Linux',5,true],['Mozilla/5.0 Macintosh','MacIntel',5,true]]){
 const link={hidden:false},classes={};vm.runInNewContext(fs.readFileSync('desktop-availability.js','utf8'),{navigator:{userAgent:agent,platform,maxTouchPoints:touches},document:{documentElement:{classList:{toggle:(name,value)=>classes[name]=value}},querySelectorAll:()=>[link]}});assert.equal(link.hidden,mobile);
}
const local=fs.readFileSync('desktop-shortcut/local-data.js','utf8');
assert.ok(local.indexOf("payload: transfer")>local.indexOf("querySelector('#local-sync-send').addEventListener"));
assert.match(local,/event\.origin !== config\.website \|\| event\.source !== popup \|\| event\.data\?\.nonce !== nonce/);
const online=fs.readFileSync('desktop-sync.js','utf8');assert.match(online,/event\.source !== window\.opener/);assert.match(online,/confirmed: true/);
const main=fs.readFileSync('index.html','utf8');assert.match(main,/data-desktop-only href="desktop.html"/);assert.match(main,/>Desktop App<\/a>/);
assert.doesNotMatch(fs.readFileSync('desktop/app.html','utf8'),/login-ui|auth-stage/);
assert.match(fs.readFileSync('desktop-shortcut/README.md','utf8'),/not a native application/);
console.log('Desktop UI guards passed: desktop-only navigation, no transfer before confirmation, exact origin/window/nonce checks, Online review, and login-free local shell.');
