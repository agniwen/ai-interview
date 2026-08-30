const TARGET_SAMPLE_RATE = 24_000;
const FRAME_SAMPLES = 2400;

class MeetingLiveTranscriptPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.nextInputIndex = 0;
    this.pending = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }
    const step = sampleRate / TARGET_SAMPLE_RATE;
    while (this.nextInputIndex < input.length) {
      const sample = Math.max(-1, Math.min(1, input[Math.floor(this.nextInputIndex)] ?? 0));
      this.pending.push(sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767));
      this.nextInputIndex += step;
    }
    this.nextInputIndex -= input.length;
    while (this.pending.length >= FRAME_SAMPLES) {
      const frame = Int16Array.from(this.pending.splice(0, FRAME_SAMPLES));
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}

registerProcessor("meeting-live-transcript-pcm", MeetingLiveTranscriptPcmProcessor);
