import { cp, mkdir, readFile, writeFile, rm, chmod, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const build = join(root, '.desktop-build');
const output = join(root, 'desktop-downloads');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const nodeVersion = 'v24.22.2';
const architectures = process.argv.slice(2).length ? process.argv.slice(2) : ['arm64','x64'];
if (architectures.some(arch => !['arm64','x64'].includes(arch))) throw new Error('Choose arm64 or x64.');
await mkdir(build, { recursive: true }); await mkdir(output, { recursive: true });
async function download(url, destination) {
  try { await stat(destination); return; } catch {}
  const temporary = destination + '.download';
  execFileSync('curl', ['--fail','--silent','--show-error','--location','--retry','2','--max-time','180',url,'-o',temporary], { stdio: 'inherit' });
  await (await import('node:fs/promises')).rename(temporary, destination);
}
const sumsPath = join(build, `node-${nodeVersion}-SHASUMS256`);
await download(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`, sumsPath);
const sums = await readFile(sumsPath, 'utf8');
const fontSource = join(build, 'fonts-source.css');
await download('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap', fontSource);
let fontCss = await readFile(fontSource, 'utf8');
const fontUrls = [...new Set([...fontCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(match => match[1]))];
const fonts = [];
for (let index = 0; index < fontUrls.length; index++) {
  const filename = `planner-font-${index}.ttf`, location = join(build, filename);
  await download(fontUrls[index], location); fonts.push([location, filename]); fontCss = fontCss.replaceAll(fontUrls[index], 'fonts/' + filename);
}
const webAssets = ['index.html','style.css','impeccable.css','script.js','flip-clock.js','flip-clock.css','weather.js','weather.css','task-timer-engine.js','task-timer-alarm.js','task-timer.js','task-timer.css','task-timer-bindings.js','app-shell.css','app-shell.js','calendar.html','calendar.css','calendar.js','data.css','persistent-storage.js','data-migration.js','task-rules.js','task-file-scanner.js','voice-input.js','page-transition.js','backup-merge.js','merge-review.js','desktop-page.css','desktop-theme.js'];
const vendor = [
  ['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs','vendor/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','vendor/pdf.worker.min.mjs'],
  ['node_modules/mammoth/mammoth.browser.min.js','vendor/mammoth.browser.min.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js','vendor/tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js','vendor/tesseract.worker.min.js'],
];
const files = [];
for (const arch of architectures) {
  const archive = `node-${nodeVersion}-darwin-${arch}.tar.gz`, archivePath = join(build, archive);
  await download(`https://nodejs.org/dist/${nodeVersion}/${archive}`, archivePath);
  const expected = sums.split('\n').find(line => line.trim().endsWith('  ' + archive))?.split(/\s+/)[0];
  if (!expected || createHash('sha256').update(await readFile(archivePath)).digest('hex') !== expected) throw new Error('Node.js checksum verification failed: ' + arch);
  const unpack = join(build, `runtime-${arch}`); await mkdir(unpack, { recursive: true });
  execFileSync('tar', ['-xzf',archivePath,'--strip-components=1','-C',unpack,`node-${nodeVersion}-darwin-${arch}/bin/node`,`node-${nodeVersion}-darwin-${arch}/LICENSE`]);
  const packageName = `Todo-List-Local-macOS-${arch}`, directory = join(build, packageName);
  await rm(directory, { recursive: true, force: true });
  const app = join(directory, 'Todo List Local.app'), contents = join(app, 'Contents'), resources = join(contents, 'Resources'), application = join(resources, 'application');
  await mkdir(join(contents, 'MacOS'), { recursive: true }); await mkdir(application, { recursive: true });
  await cp(join(root, 'desktop-shortcut/TodoListLauncher'), join(contents, 'MacOS/TodoListLauncher'));
  await chmod(join(contents, 'MacOS/TodoListLauncher'), 0o755);
  await cp(join(root, 'desktop-shortcut/TodoList.icns'), join(resources, 'TodoList.icns'));
  await cp(unpack, join(resources, 'runtime'), { recursive: true });
  for (const filename of webAssets) await cp(join(root, filename), join(application, filename));
  for (const [source, destination] of vendor) { await mkdir(resolve(application, destination, '..'), { recursive: true }); await cp(join(root, source), join(application, destination)); }
  await mkdir(join(application, 'node_modules'), { recursive: true });
  await cp(join(root, 'node_modules/ws'), join(application, 'node_modules/ws'), { recursive: true });
  await cp(join(root, 'server.js'), join(application, 'server.js'));
  await mkdir(join(application, 'desktop-shortcut'), { recursive: true }); await cp(join(root, 'desktop-shortcut/local-support.cjs'), join(application, 'desktop-shortcut/local-support.cjs'));
  await cp(join(root, 'desktop/app.html'), join(application, 'app.html'));
  await cp(join(root, 'desktop-shortcut/local-data.html'), join(application, 'data.html'));
  await cp(join(root, 'desktop-shortcut/local-data.js'), join(application, 'local-data.js'));
  await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'todo-list-local', version, private: true }) + '\n');
  let index = await readFile(join(application, 'index.html'), 'utf8');
  index = index.replace('data-desktop-only href="desktop.html"','href="data.html"').replace('>Desktop App</a>','>Data</a>').replace('    <script src="desktop-availability.js"></script>\n','').replaceAll('__APP_VERSION__', version);
  await writeFile(join(application, 'index.html'), index);
  let shell = await readFile(join(application, 'app-shell.js'), 'utf8'); shell = shell.replace('data: { src: "desktop.html?embedded=1", title: "Desktop App · Todo List" }','data: { src: "data.html?embedded=1", title: "Data · Todo List" }'); await writeFile(join(application, 'app-shell.js'), shell);
  await mkdir(join(application, 'fonts'), { recursive: true });
  for (const [source, filename] of fonts) await cp(source, join(application, 'fonts', filename));
  await writeFile(join(application, 'fonts.css'), fontCss);
  for (const name of ['index.html','calendar.html','data.html','app.html']) {
    let html = await readFile(join(application, name), 'utf8');
    html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[\s\S]*?\/>/g, '');
    html = html.replace('</head>', '    <link rel="stylesheet" href="fonts.css" />\n  </head>'); await writeFile(join(application, name), html);
  }
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>uno.todolist.local-shortcut</string><key>CFBundleName</key><string>Todo List Local</string><key>CFBundleDisplayName</key><string>Todo List Local</string><key>CFBundleExecutable</key><string>TodoListLauncher</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>TodoList.icns</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>13.5</string></dict></plist>\n`);
  await cp(join(root, 'desktop-shortcut/Install.command'), join(directory, 'Install.command')); await chmod(join(directory, 'Install.command'), 0o755);
  await cp(join(root, 'desktop-shortcut/README.md'), join(directory, 'Read me.md'));
  await mkdir(join(directory, 'Third-party licenses'), { recursive: true });
  for (const [source, name] of [
    ['node_modules/pdfjs-dist/LICENSE','PDF.js.md'],
    ['node_modules/mammoth/LICENSE','Mammoth.md'],
    ['node_modules/tesseract.js/LICENSE.md','Tesseract.md'],
    ['node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt','Tesseract-browser-notices.md'],
    ['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt','Tesseract-worker-notices.md'],
  ]) await cp(join(root, source), join(directory, 'Third-party licenses', name));
  // Include font license text in the package, alongside Node.js/ws notices.
  for (const [family, url] of [['DM-Sans','https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt'],['Fraunces','https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt']]) {
    const notice = join(build, family + '-OFL'); await download(url, notice); await cp(notice, join(directory, family + '-license.md'));
  }
  const filename = `todo-list-local-macos-${arch}.zip`, destination = join(output, filename);
  await rm(destination, { force: true }); execFileSync('ditto', ['-c','-k','--keepParent',directory,destination]);
  const bytes = await readFile(destination); files.push({ arch, filename, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), url: '/downloads/' + filename, objectKey: `desktop-downloads/${version}/${filename}` });
  console.log(`Built ${filename}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB. Includes verified Node.js ${nodeVersion}, local assets, no user data or credentials.`);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version, nodeVersion, files }, null, 2) + '\n');
