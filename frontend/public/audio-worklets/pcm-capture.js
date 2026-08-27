class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.position = 0;
    this.pending = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    const merged = new Float32Array(this.pending.length + input.length);
    merged.set(this.pending);
    merged.set(input, this.pending.length);
    const output = [];
    while (this.position + 1 < merged.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const sample = merged[index] * (1 - fraction) + merged[index + 1] * fraction;
      output.push(Math.max(-1, Math.min(1, sample)));
      this.position += this.ratio;
    }

    const consumed = Math.floor(this.position);
    this.pending = merged.slice(consumed);
    this.position -= consumed;
    if (output.length) {
      const pcm = new Int16Array(output.length);
      for (let index = 0; index < output.length; index += 1) {
        const sample = output[index];
        pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
