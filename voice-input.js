(function exposeDoubaoVoiceInput(root) {
  class DoubaoVoiceInput {
    constructor(options) {
      Object.assign(this, options);
      this.phase = "idle";
      this.chunks = [];
      this.sampleRate = 16000;
      this.startedAt = 0;
      this.cancelRequested = false;
      this.handleRecordClick = () => (this.phase === "recording" ? this.stop() : this.start());
      this.handleCancelClick = () => this.cancel();
      this.handleResize = () => { if (this.phase === "recording") this.resizeWaveform(); };
      this.recordButton.addEventListener("click", this.handleRecordClick);
      this.cancelButton.addEventListener("click", this.handleCancelClick);
      window.addEventListener("resize", this.handleResize);
      this.updateControls();
    }

    status(message, type = "idle") {
      this.onStatus?.(message, type);
    }

    updateControls() {
      const recording = this.phase === "recording";
      const unavailable = !navigator.mediaDevices?.getUserMedia;
      const locked = this.phase === "starting" || this.phase === "stopping" || this.phase === "transcribing";
      document.body.classList.toggle("recording", recording);
      this.recordButton.setAttribute("aria-pressed", String(recording));
      this.recordButton.setAttribute("aria-label", recording ? "Stop voice recording" : "Start voice recording");
      this.recordButton.disabled = unavailable || locked || (!recording && Boolean(this.isBusy?.()));
      this.cancelButton.hidden = !recording;
      this.timer.hidden = !recording;
      this.languageSelect.disabled = recording || locked || Boolean(this.isBusy?.());
    }

    resizeWaveform() {
      const ratio = window.devicePixelRatio || 1;
      this.waveform.width = Math.round(this.waveform.clientWidth * ratio);
      this.waveform.height = Math.round(this.waveform.clientHeight * ratio);
    }

    drawWaveform() {
      if (!this.analyser) return;
      const context = this.waveform.getContext("2d");
      const values = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteTimeDomainData(values);
      context.clearRect(0, 0, this.waveform.width, this.waveform.height);
      const gradient = context.createLinearGradient(0, 0, this.waveform.width, 0);
      gradient.addColorStop(0, "#229b81");
      gradient.addColorStop(0.5, "#ea6847");
      gradient.addColorStop(1, "#229b81");
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(2, (window.devicePixelRatio || 1) * 1.2);
      context.beginPath();
      values.forEach((value, index) => {
        const x = index * this.waveform.width / values.length;
        const y = value / 128 * this.waveform.height / 2;
        index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
      });
      context.stroke();
      this.animationFrame = requestAnimationFrame(() => this.drawWaveform());
    }

    startTimer() {
      this.startedAt = Date.now();
      this.timer.textContent = "00:00";
      this.timerInterval = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
        this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      }, 250);
    }

    releaseMedia() {
      cancelAnimationFrame(this.animationFrame);
      clearInterval(this.timerInterval);
      if (this.processor) {
        this.processor.onaudioprocess = null;
        try { this.processor.disconnect(); } catch { /* Already disconnected. */ }
      }
      if (this.sink) {
        try { this.sink.disconnect(); } catch { /* Already disconnected. */ }
      }
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.analyser = undefined;
      this.processor = undefined;
      this.sink = undefined;
      if (this.audioContext) this.audioContext.close().catch(() => {});
      this.audioContext = undefined;
      this.waveform.hidden = true;
      this.timer.hidden = true;
    }

    combineChunks() {
      const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
      const combined = new Float32Array(length);
      let offset = 0;
      this.chunks.forEach((chunk) => {
        combined.set(chunk, offset);
        offset += chunk.length;
      });
      return combined;
    }

    resample(samples, outputRate = 16000) {
      if (this.sampleRate === outputRate) return samples;
      const ratio = this.sampleRate / outputRate;
      const output = new Float32Array(Math.max(1, Math.round(samples.length / ratio)));
      for (let index = 0; index < output.length; index += 1) {
        const position = index * ratio;
        const lower = Math.floor(position);
        const upper = Math.min(lower + 1, samples.length - 1);
        const mix = position - lower;
        output[index] = samples[lower] * (1 - mix) + samples[upper] * mix;
      }
      return output;
    }

    createWav(samples, sampleRate = 16000) {
      const buffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(buffer);
      const writeText = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
      };
      writeText(0, "RIFF");
      view.setUint32(4, 36 + samples.length * 2, true);
      writeText(8, "WAVE");
      writeText(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeText(36, "data");
      view.setUint32(40, samples.length * 2, true);
      samples.forEach((sample, index) => {
        const clipped = Math.max(-1, Math.min(1, sample));
        view.setInt16(44 + index * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
      });
      return new Blob([buffer], { type: "audio/wav" });
    }

    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.status("Voice recording is not supported in this browser. Continue typing instead.", "error");
        return;
      }
      if (this.phase !== "idle" || this.isBusy?.()) return;
      this.phase = "starting";
      this.cancelRequested = false;
      this.chunks = [];
      this.updateControls();
      this.status("Requesting microphone access…", "processing");
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (this.cancelRequested || this.phase !== "starting") {
          this.releaseMedia();
          this.phase = "idle";
          this.updateControls();
          return;
        }
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await this.audioContext.resume();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);
        this.sampleRate = this.audioContext.sampleRate;
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.sink = this.audioContext.createGain();
        this.sink.gain.value = 0;
        this.processor.onaudioprocess = (event) => {
          if (this.phase === "recording") this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        source.connect(this.processor);
        this.processor.connect(this.sink);
        this.sink.connect(this.audioContext.destination);
        this.phase = "recording";
        this.waveform.hidden = false;
        this.resizeWaveform();
        this.drawWaveform();
        this.startTimer();
        this.updateControls();
        this.status("Recording… Describe the event, then press the stop button.", "recording");
      } catch (error) {
        this.releaseMedia();
        this.phase = "idle";
        this.updateControls();
        this.status(
          error.name === "NotAllowedError"
            ? "Microphone access was denied. Allow access in Chrome settings, or continue typing."
            : "The microphone could not start. Check that it is connected, or continue typing.",
          "error",
        );
      }
    }

    async stop() {
      if (this.phase !== "recording") return;
      this.phase = "stopping";
      this.updateControls();
      this.status("Preparing your recording…", "processing");
      const samples = this.combineChunks();
      const wav = this.createWav(this.resample(samples));
      this.chunks = [];
      this.releaseMedia();
      if (this.cancelRequested) {
        this.phase = "idle";
        this.updateControls();
        return;
      }
      if (samples.length === 0) {
        this.phase = "idle";
        this.updateControls();
        this.status("No speech was detected. Check your microphone and try again.", "error");
        return;
      }
      await this.transcribe(wav);
    }

    async transcribe(blob) {
      this.phase = "transcribing";
      this.updateControls();
      this.status("Transcribing with Doubao Speech 2.0…", "processing");
      try {
        const response = await fetch(`/api/transcribe?language=${encodeURIComponent(this.languageSelect.value)}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: blob,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Doubao could not transcribe this recording.");
        const transcript = typeof result.transcript === "string" ? result.transcript.trim() : "";
        if (!transcript) throw new Error("No speech was detected. Check your microphone and try again.");
        if (this.cancelRequested) {
          this.phase = "idle";
          this.updateControls();
          return;
        }
        this.phase = "idle";
        this.updateControls();
        await this.onTranscript(transcript);
      } catch (error) {
        this.phase = "idle";
        this.updateControls();
        this.status(error.message || "Transcription failed. Please retry or continue typing.", "error");
      }
    }

    cancel() {
      if (this.phase === "idle") return;
      this.cancelRequested = true;
      this.chunks = [];
      this.releaseMedia();
      this.phase = "idle";
      this.updateControls();
      this.status("Recording canceled. Nothing was submitted.", "idle");
    }

    destroy() {
      this.cancel();
      this.releaseMedia();
      this.recordButton.removeEventListener("click", this.handleRecordClick);
      this.cancelButton.removeEventListener("click", this.handleCancelClick);
      window.removeEventListener("resize", this.handleResize);
    }
  }

  root.DoubaoVoiceInput = DoubaoVoiceInput;
}(typeof globalThis === "object" ? globalThis : this));
