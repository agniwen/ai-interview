export interface MeetingPlaybackApi {
  readAudioBytes: (url: string) => Promise<ArrayBuffer>;
}
