import {mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),build=join(root,'.desktop-build'),output=join(root,'desktop-downloads');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const folder=join(build,'Todo List Local');
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true});await mkdir(output,{recursive:true});
const launcher=join(folder,'Todo List Local.crwebloc');
await writeFile(launcher,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>URL</key><string>https://todolist.uno/local/app</string><key>CrProfile</key><string>Default</string></dict></plist>\n`,{mode:0o644});
// File metadata only: preserve the existing Shortcut artwork without an app bundle.
const swift=join(build,'set-shortcut-icon.swift');
await writeFile(swift,`import AppKit\nlet args = CommandLine.arguments\nif let image = NSImage(contentsOfFile: args[1]) {\n guard NSWorkspace.shared.setIcon(image, forFile: args[2], options: []) else { exit(2) }\n} else { exit(3) }\n`);
execFileSync('xcrun',['swift',swift,join(root,'desktop-shortcut/TodoList.icns'),launcher],{stdio:'inherit'});
await writeFile(join(folder,'Read me.md'),await readFile(join(root,'desktop-shortcut/README.md')));
const filename='todo-list-chrome-launcher-macos.zip',target=join(output,filename);
await rm(target,{force:true});execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',folder,target]);
const bytes=await readFile(target);
let old={};try{old=JSON.parse(await readFile(join(root,'desktop-shortcut/downloads.json'),'utf8'))}catch{}
const legacyFiles=[...(old.legacyFiles||[]),...(old.files||[])].filter(file=>file.filename!==filename);
const files=[{arch:'universal',filename,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:'/downloads/'+filename,objectKey:`desktop-downloads/${version}/${filename}`}];
await writeFile(join(output,'manifest.json'),JSON.stringify({version,files,legacyFiles},null,2)+'\n');
console.log(`Built ${filename} (${(bytes.length/1024).toFixed(0)} KB): Chrome data shortcut, exact existing artwork, no installer, executable, runtime, credentials, or user data.`);
