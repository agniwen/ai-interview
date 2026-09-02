export interface HumanMeetingAudioMix {
  mediaTrack: MediaStreamTrack;
  setTracks: (tracks: MediaStreamTrack[]) => void;
  stop: () => void;
}

export async function createHumanMeetingAudioMix(
  tracks: MediaStreamTrack[],
): Promise<HumanMeetingAudioMix> {
  if (tracks.length === 0) {
    throw new Error("音频通道尚未就绪，暂时无法开始实时转录。");
  }
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const sources = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
  const setTracks = (nextTracks: MediaStreamTrack[]) => {
    const retained = new Set(nextTracks);
    for (const [track, source] of sources) {
      if (!retained.has(track)) {
        source.disconnect();
        sources.delete(track);
      }
    }
    for (const track of nextTracks) {
      if (!sources.has(track)) {
        const source = context.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
        sources.set(track, source);
      }
    }
  };
  setTracks(tracks);
  await context.resume();
  const [mediaTrack] = destination.stream.getAudioTracks();
  if (!mediaTrack) {
    await context.close();
    throw new Error("无法创建远端音频转录通道。");
  }
  let stopped = false;
  return {
    mediaTrack,
    setTracks,
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const source of sources.values()) {
        source.disconnect();
      }
      sources.clear();
      destination.disconnect();
      mediaTrack.stop();
      void context.close();
    },
  };
}
