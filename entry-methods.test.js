const assert = require("node:assert/strict");
const fs = require("node:fs");

const indexHtml = fs.readFileSync("index.html", "utf8");
const taskScript = fs.readFileSync("script.js", "utf8");
const calendarHtml = fs.readFileSync("calendar.html", "utf8");
const calendarScript = fs.readFileSync("calendar.js", "utf8");
const voiceScript = fs.readFileSync("voice-input.js", "utf8");
const serverScript = fs.readFileSync("server.js", "utf8");

assert.match(indexHtml, /id="task-ai-tab"/);
assert.match(indexHtml, /id="task-manual-tab"/);
assert.match(indexHtml, /id="manual-task-form"/);
assert.match(taskScript, /function saveManualTask\(\)/);
assert.match(taskScript, /completed: false, completedOn: null/);

assert.match(calendarHtml, /id="event-record-button"/);
assert.match(calendarHtml, /id="event-voice-waveform"/);
assert.match(calendarHtml, /src="voice-input\.js"/);
assert.match(calendarScript, /new DoubaoVoiceInput\(/);
assert.match(calendarScript, /eventDescription\.value = transcript/);
assert.match(calendarScript, /await interpretEvent\(\)/);
assert.match(voiceScript, /fetch\(`\/api\/transcribe\?language=/);
assert.match(voiceScript, /Content-Type": "audio\/wav"/);
assert.match(serverScript, /\["\/voice-input\.js"/);

console.log("Manual task and calendar voice entry methods passed.");
