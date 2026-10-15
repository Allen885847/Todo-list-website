const assert = require("node:assert/strict");
const fs = require("node:fs");

const indexHtml = fs.readFileSync("index.html", "utf8");
const taskScript = fs.readFileSync("script.js", "utf8");
const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const calendarScript = fs.readFileSync("calendar.js", "utf8");
const voiceScript = fs.readFileSync("voice-input.js", "utf8");
const serverScript = fs.readFileSync("server.js", "utf8");
const styles = fs.readFileSync("style.css", "utf8");

assert.match(indexHtml, /id="task-ai-tab"/);
assert.match(indexHtml, /id="task-manual-tab"/);
assert.match(indexHtml, /id="manual-task-form"/);
assert.match(indexHtml, /id="manual-task-label"/);
assert.match(taskScript, /function saveManualTask\(\)/);
assert.match(taskScript, /completed: false, completedOn: null/);
assert.match(indexHtml, /id="task-edit-dialog"/);
assert.match(indexHtml, /id="edit-task-label"/);
assert.match(indexHtml, /id="rewrite-task-ai"/);
assert.match(taskScript, /function openTaskEditor\(index\)/);
assert.match(taskScript, /async function rewriteEditedTask\(\)/);
assert.match(taskScript, /fetch\("\/api\/parse-tasks"/);
assert.match(taskScript, /editButton\.addEventListener\("click", \(\) => openTaskEditor\(index\)\)/);
assert.match(styles, /--accent: #ea6847;/);
assert.match(styles, /--accent: #ff8060;/);
assert.match(styles, /--page-background:\s*radial-gradient/);

assert.match(calendarHtml, /id="event-record-button"/);
assert.match(calendarHtml, /id="event-voice-waveform"/);
assert.match(calendarHtml, /src="voice-input\.js"/);
assert.match(calendarScript, /new DoubaoVoiceInput\(/);
assert.match(calendarScript, /eventDescription\.value = transcript/);
assert.match(calendarScript, /await interpretEvent\(\)/);
assert.match(voiceScript, /fetch\(`\/api\/transcribe\?language=/);
assert.match(voiceScript, /Content-Type": "audio\/wav"/);
assert.match(serverScript, /\["\/voice-input\.js"/);
assert.match(serverScript, /"label":"Extra"/);
assert.match(serverScript, /only do it if I have time/);
assert.match(serverScript, /preserve their wording in label/);
assert.match(taskScript, /label: normalizeLabel\(task\.label\)/);
assert.match(taskScript, /className = "task-label-badge"/);
assert.match(taskScript, /if \(badges\.childElementCount\) content\.append\(badges\);\s*content\.append\(text\);/);

console.log("Manual task, customizable labels, and calendar voice entry methods passed.");
