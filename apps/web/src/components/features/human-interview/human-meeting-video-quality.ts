import { ScreenSharePresets, VideoPresets } from "livekit-client";

export const meetingCameraCaptureOptions = {
  resolution: VideoPresets.h1080.resolution,
};

export const meetingScreenShareCaptureOptions = {
  resolution: ScreenSharePresets.h1080fps15.resolution,
};
