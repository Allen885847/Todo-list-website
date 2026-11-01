const assert = require('node:assert/strict');
const { localTimeParts } = require('./flip-clock.js');
const cases = [
  [0,0,0,'12:00:00','AM'], [0,5,9,'12:05:09','AM'],
  [1,2,3,'01:02:03','AM'], [11,59,59,'11:59:59','AM'],
  [12,0,0,'12:00:00','PM'], [12,34,56,'12:34:56','PM'],
  [13,5,9,'01:05:09','PM'], [23,59,59,'11:59:59','PM'],
];
for (const [hour,minute,second,text,period] of cases) {
  const value = localTimeParts(new Date(2026,10,2,hour,minute,second));
  assert.equal(value.parts.join(':'),text);
  assert.equal(value.meridiem,period);
}
const fs = require('node:fs');
const vm = require('node:vm');
class Node {
  constructor() { this.children=[]; this.attrs={}; this.textContent=''; this.className=''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name,value) { this.attrs[name]=value; }
  querySelectorAll(selector) {
    if (selector === '.flip-half > span') return this.faces ||= [new Node(),new Node()];
    return [];
  }
}
const clock = new Node();
const document = { hidden:false, getElementById: id => id === "flip-clock" ? clock : null, createElement: () => new Node(), addEventListener() {} };
const fixed = new Date(2026,10,2,13,5,9);
class LocalDate extends Date { constructor() { super(fixed); } static now() { return fixed.getTime(); } }
const context = {
  document,
  Date: LocalDate,
  setTimeout: () => 1,
  clearTimeout() {},
  matchMedia: () => ({ matches: false }),
  window: { addEventListener() {} },
};
vm.runInNewContext(fs.readFileSync('flip-clock.js','utf8'), context);

assert.equal(clock.attrs['aria-label'],'Local time 01:05:09 PM');
assert.equal(clock.children.at(-1).textContent,'PM');
assert.equal(clock.children.filter(node=>node.className==='flip-clock-pair').length,3);
console.log('Clock checks passed: local 12-hour display, leading zeros, midnight/noon boundaries, 6 flip digits, and visible/accessibility AM/PM.');
