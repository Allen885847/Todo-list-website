const assert = require('node:assert/strict');
const { create, createBuffer } = require('./task-timer-alarm.js');
const sources = [];
const gains = [];
const audio = {
  state: 'running', currentTime: 5, sampleRate: 48000, destination: {},
  createBuffer(channels,length,sampleRate) {
    const samples = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => samples };
  },
  createBufferSource() {
    const source = { stops: 0, starts: 0, connect() {}, disconnect() {}, start() { this.starts++; }, stop() { this.stops++; } };
    sources.push(source);
    return source;
  },
  createGain() {
    const gain = { gain: { value: 0, setValueAtTime(value) { this.value = value; }, cancelScheduledValues() {} }, connect() {}, disconnect() {} };
    gains.push(gain);
    return gain;
  },
};
const samples = createBuffer(audio).getChannelData(0);
assert(samples.every(Number.isFinite));
assert(samples.some(value => Math.abs(value) > .03), 'The original quiet beeps are present');
assert(samples.every(value => Math.abs(value) <= .0351), 'Original quiet beep volume is preserved');
assert(samples.slice(Math.ceil(.44 * audio.sampleRate)).every(value => value === 0), 'The original pause follows each beep pair');
assert.equal(samples[0],0);
assert.equal(samples[samples.length - 1],0,'No hard waveform edge at the loop boundary');
let claimed = true;
let released = 0;
const alarm = create({ getAudio: () => audio, claim: () => claimed, release: () => released++ });
alarm.update('test-task:1');
assert.equal(sources.length,1);
assert.equal(sources[0].loop,true,'Native audio loops indefinitely without a repetition counter');
assert.equal(sources[0].loopEnd,sources[0].buffer.duration);
assert.equal(gains[0].gain.value,1);
for (let index=0; index<600; index++) { audio.currentTime += .25; alarm.update('test-task:1'); }
assert.equal(sources.length,1,'The same source keeps looping after many repetitions');
assert.equal(sources[0].stops,0,'No automatic cutoff');
alarm.stop();
assert.equal(sources[0].stops,1,'Dismiss stops playback immediately');
assert.equal(gains[0].gain.value,0,'Dismiss immediately silences the output');
assert(released > 0);
alarm.update(null);
assert.equal(sources.length,1,'No replay after dismissal');
claimed = false;
alarm.update('another-task');
assert.equal(sources.length,1,'No overlapping audio from another tab');
claimed = true;
audio.state = 'suspended';
alarm.update('another-task');
assert.equal(sources.length,1);
audio.state = 'running';
alarm.update('another-task');
assert.equal(sources.length,2,'Undismissed alert resumes when audio is unlocked');
alarm.update('new-task');
assert.equal(sources[1].stops,1,'Changing alerts cancels the old source');
alarm.stop();
console.log('Restored double-beep checks passed: bounded waveform, smooth loop boundary, indefinite native looping, immediate dismiss, no duplicate tab audio, suspended audio recovery.');
