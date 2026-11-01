const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('./task-timer-engine.js');

class Element {
  constructor() { this.nodes = new Map(); this.listeners = {}; this.style = {}; this.classList = { toggle() {} }; this.hidden = false; }
  querySelector(name) { if (!this.nodes.has(name)) this.nodes.set(name, new Element()); return this.nodes.get(name); }
  querySelectorAll() { return []; }
  addEventListener(name, action) { this.listeners[name] = action; }
  setAttribute() {}
  append() {}
}
function boot(owner, savedOwner = owner) {
  const task = { id: 'task-a', task: 'Test task', completed: false };
  const initial = engine.create(); initial.start(task, 60000);
  const values = new Map([
    ['todo-list-mvp', JSON.stringify({ tasks: [task] })],
    ['todo-task-timers-v1', JSON.stringify({ ...initial.state, owner: savedOwner })],
  ]);
  const messages = [], listeners = {};
  const frame = { contentWindow: { postMessage: message => messages.push(message) }, contentDocument: { body: new Element(), documentElement: new Element() } };
  const document = { body: new Element(), hidden: false, createElement: () => new Element(), addEventListener() {}, querySelectorAll: () => [frame] };
  const window = { todoAccountId: owner === 'local' ? undefined : owner, addEventListener: (name, action) => { listeners[name] = action; } };
  const context = { window, document, location: { origin: 'https://test.invalid' }, crypto: { randomUUID: () => 'test-alarm-owner' }, TodoTimerEngine: engine, TodoTimerAlarm: { create: () => ({ update() {}, stop() {} }) }, Date, setInterval() {}, localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  vm.runInNewContext(fs.readFileSync('task-timer.js', 'utf8'), context);
  const restore = source => listeners.message({ origin: 'https://test.invalid', source, data: { type: 'todo-storage-ready' } });
  return { timer: window.TodoTimer, values, messages, restore, frame, listeners };
}
const local = boot('local');
assert.equal(local.timer.getTaskState('task-a'), null, 'Do not read timer data before local/account restore');
local.restore({});
assert.equal(local.timer.getTaskState('task-a'), null, 'Ignore unrelated storage-ready messages');
local.restore(local.frame.contentWindow);
assert.equal(local.timer.getTaskState('task-a').status, 'running');
local.timer.stopTask('task-a');
assert.equal(JSON.parse(local.values.get('todo-task-timers-v1')).owner, 'local');
assert.equal(local.messages.at(-1).type, 'todo-timer-changed', 'Notify existing persistence layer after parent-host writes');
assert.equal(local.timer.getTaskState('task-a'), null);
const account = boot('account-a'); account.restore(account.frame.contentWindow);
assert.equal(account.timer.getTaskState('task-a').status, 'running');
const other = boot('account-b', 'account-a'); other.restore(other.frame.contentWindow);
assert.equal(other.timer.getTaskState('task-a'), null, 'Never display another account’s timer');

const taskScript = fs.readFileSync('script.js', 'utf8');
const progress = taskScript.match(/function calculateTodayProgress\([\s\S]*?\n\}/)[0];
const rules = require('./task-rules.js');
const context = { TodoTaskRules: rules }; vm.createContext(context); vm.runInContext(progress, context);
const task = (day, completed, label = '') => ({ task: 'Task', date: { year: 2026, month: 11, day }, completed, label });
const result = context.calculateTodayProgress([task(2,false),task(2,true),task(2,false,'Extra'),task(1,false),task(3,true)], '2026-11-02');
assert.equal(result.total, 2); assert.equal(result.completed, 1); assert.equal(result.percent, 50);
assert.equal(context.calculateTodayProgress([], '2026-11-02').percent, 0);
console.log('Release persistence checks passed: restore ordering, account-isolated timers, local persistence notifications, and today-only regular task progress.');
