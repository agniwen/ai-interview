const WAVEFORM_BARS = 96;
const waveformCache = new Map<string, number[]>();

export function waveformCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function peaksFromChannelData(channel: ArrayLike<number>, bars = WAVEFORM_BARS): number[] {
  if (channel.length === 0) {
    return [];
  }
  const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
  const peaks: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    const start = index * samplesPerBar;
    const end = Math.min(channel.length, start + samplesPerBar);
    const step = Math.max(1, Math.floor((end - start) / 240));
    let max = 0;
    for (let sample = start; sample < end; sample += step) {
      const value = Math.abs(channel[sample] ?? 0);
      if (value > max) {
        max = value;
      }
    }
    peaks.push(max);
  }
  const peak = Math.max(...peaks, 0.01);
  return peaks.map((value) => Math.min(1, Math.max(0.08, value / peak)));
}

export async function extractWaveformPeaks(url: string, bars = WAVEFORM_BARS): Promise<number[]> {
  const key = `${waveformCacheKey(url)}:${bars}`;
  const cached = waveformCache.get(key);
  if (cached) {
    return cached;
  }
  const arrayBuffer = await window.api.meetingPlayback.readAudioBytes(url);
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const peaks = peaksFromChannelData(audioBuffer.getChannelData(0), bars);
    waveformCache.set(key, peaks);
    return peaks;
  } finally {
    await audioContext.close();
  }
}

export type WaveformLoadResult =
  | { peaks: number[]; status: "ready" }
  | { peaks: []; status: "unavailable" };

export async function loadWaveformPeaks(
  url: string,
  extract: (source: string) => Promise<number[]> = extractWaveformPeaks,
): Promise<WaveformLoadResult> {
  try {
    const peaks = await extract(url);
    return peaks.length > 0 ? { peaks, status: "ready" } : { peaks: [], status: "unavailable" };
  } catch {
    return { peaks: [], status: "unavailable" };
  }
}
