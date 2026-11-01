(function (root) {
  // Restored alert: two quiet 740 Hz beeps, repeated every 1.8 seconds.
  const CYCLE_SECONDS = 1.8;
  function createBuffer(audio) {
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * CYCLE_SECONDS), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (const offset of [0, .24]) {
      const start = Math.round(offset * audio.sampleRate);
      const length = Math.ceil(.19 * audio.sampleRate);
      for (let index = 0; index < length && start + index < samples.length; index++) {
        const time = index / audio.sampleRate;
        const envelope = time < .025
          ? .035 * time / .025
          : time < .17
            ? .035 * Math.pow(.0001 / .035, (time - .025) / .145)
            : .0001 * Math.max(0, 1 - (time - .17) / .02);
        samples[start + index] = Math.sin(2 * Math.PI * 740 * time) * envelope;
      }
    }
    return buffer;
  }
  function create({ getAudio, claim = () => true, release = () => {} }) {
    let activeId = null;
    let playing = null;
    const buffers = new WeakMap();
    function stopPlayback() {
      if (!playing) return;
      const { source, gain, audio } = playing;
      playing = null;
      // Silence immediately, including audio already queued by the device.
      try { gain.gain.cancelScheduledValues(audio.currentTime); gain.gain.setValueAtTime(0, audio.currentTime); } catch {}
      try { source.stop(); } catch {}
      try { source.disconnect(); gain.disconnect(); } catch {}
    }
    function stop() {
      stopPlayback();
      release();
      activeId = null;
    }
    function update(id) {
      if (id !== activeId) { stop(); activeId = id || null; }
      if (!activeId) return;
      const audio = getAudio();
      if (!audio || audio.state !== 'running') { stopPlayback(); release(); return; }
      if (!claim(activeId)) { stopPlayback(); return; }
      if (playing?.audio === audio) return;
      stopPlayback();
      if (!buffers.has(audio)) buffers.set(audio, createBuffer(audio));
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      source.buffer = buffers.get(audio);
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = CYCLE_SECONDS;
      gain.gain.setValueAtTime(1, audio.currentTime);
      source.connect(gain);
      gain.connect(audio.destination);
      playing = { source, gain, audio };
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (playing?.source === source) playing = null;
      };
      // Native audio looping has no repetition limit and does not depend on
      // setInterval, so a throttled background tab does not break the rhythm.
      source.start();
    }
    return { update, stop };
  }
  const exported = { create, createBuffer };
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.TodoTimerAlarm = exported;
})(globalThis);
