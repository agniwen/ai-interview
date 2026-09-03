const SAMPLE_RATE = 16_000;
const BUFFER_BYTES = 90_000 * 32;
export interface CorrectionSentence {
  endMs: number;
  itemId: string;
  startMs: number;
  text: string;
}

/** Index only PCM accepted by the provider. Recording storage is never read or changed. */
export function createLiveTranscriptAudio() {
  const buffer = Buffer.alloc(BUFFER_BYTES);
  let totalBytes = 0;
  let closed = false;
  const completed = new Map<string, CorrectionSentence>();
  const readBytes = (start: number, end: number): Buffer | null => {
    if (start < Math.max(0, totalBytes - BUFFER_BYTES) || end > totalBytes || end <= start) {
      return null;
    }
    const size = end - start;
    const offset = start % BUFFER_BYTES;
    const first = Math.min(size, BUFFER_BYTES - offset);
    return Buffer.concat([
      buffer.subarray(offset, offset + first),
      buffer.subarray(0, size - first),
    ]);
  };
  const read = (itemId: string, originalText: string, consume: boolean): Buffer | null => {
    const sentence = completed.get(itemId);
    if (closed || !sentence || sentence.text !== originalText) {
      return null;
    }
    if (consume) {
      completed.delete(itemId);
    }
    const start = Math.round((sentence.startMs * SAMPLE_RATE) / 1000) * 2;
    const end = Math.round((sentence.endMs * SAMPLE_RATE) / 1000) * 2;
    return readBytes(start, end);
  };
  return {
    appendPcm: (bytes: Uint8Array) => {
      if (closed) {
        return;
      }
      const kept = bytes.subarray(Math.max(0, bytes.length - BUFFER_BYTES));
      const offset = (totalBytes + bytes.length - kept.length) % BUFFER_BYTES;
      const first = Math.min(kept.length, BUFFER_BYTES - offset);
      buffer.set(kept.subarray(0, first), offset);
      buffer.set(kept.subarray(first), 0);
      totalBytes += bytes.length;
    },
    close: () => {
      closed = true;
      completed.clear();
      buffer.fill(0);
    },
    complete: (sentence: CorrectionSentence) => {
      if (
        closed ||
        sentence.endMs <= sentence.startMs ||
        sentence.endMs - sentence.startMs > 60_000 ||
        !sentence.text.trim()
      ) {
        return;
      }
      completed.set(sentence.itemId, sentence);
      while (completed.size > 30) {
        const oldest = completed.keys().next().value;
        if (oldest !== undefined) {
          completed.delete(oldest);
        }
      }
    },
    peek: (itemId: string, originalText: string): Buffer | null =>
      read(itemId, originalText, false),
    peekRecent: (durationMs: number): Buffer | null => {
      if (closed || !Number.isFinite(durationMs) || durationMs <= 0 || totalBytes <= 0) {
        return null;
      }
      const size = Math.min(totalBytes, BUFFER_BYTES, Math.round(durationMs * 32));
      return readBytes(totalBytes - size, totalBytes);
    },
    take: (itemId: string, originalText: string): Buffer | null => read(itemId, originalText, true),
  };
}
