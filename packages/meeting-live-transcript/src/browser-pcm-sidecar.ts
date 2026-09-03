import pcmSidecarProcessorUrl from "./pcm-sidecar-processor.js?url";
import type { LiveTranscriptPcmTap } from "./live-transcript-draft";

export async function createBrowserPcmSidecar(input: {
  mediaTrack: MediaStreamTrack;
  onFrame: (frame: Int16Array) => void;
}): Promise<LiveTranscriptPcmTap> {
  const context = new AudioContext();
  let processor: AudioWorkletNode | null = null;
  let silentOutput: GainNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  const disconnectNodes = () => {
    for (const node of [source, processor, silentOutput]) {
      try {
        node?.disconnect();
      } catch {
        // Cleanup must preserve the original initialization error.
      }
    }
  };
  try {
    await context.audioWorklet.addModule(pcmSidecarProcessorUrl);
    source = context.createMediaStreamSource(new MediaStream([input.mediaTrack]));
    processor = new AudioWorkletNode(context, "meeting-live-transcript-pcm");
    silentOutput = context.createGain();
    silentOutput.gain.value = 0;
    processor.port.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
      input.onFrame(new Int16Array(event.data));
    });
    processor.port.start();
    source.connect(processor);
    processor.connect(silentOutput);
    silentOutput.connect(context.destination);
  } catch (error) {
    processor?.port.close();
    disconnectNodes();
    try {
      await context.close();
    } catch {
      // Cleanup failure must preserve the original initialization error.
    }
    throw error;
  }
  let stopped = false;
  return {
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      processor.port.close();
      disconnectNodes();
      void context.close();
    },
  };
}
