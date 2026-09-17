import { MediaDeviceFailure } from "livekit-client";
import { toast } from "sonner";

export function getMeetingMediaErrorMessage(failure?: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied: {
      return "未获得媒体权限或已取消屏幕共享，请允许访问后重试。";
    }
    case MediaDeviceFailure.NotFound: {
      return "未找到可用设备，请检查麦克风或摄像头是否已连接。";
    }
    case MediaDeviceFailure.DeviceInUse: {
      return "无法访问媒体设备，请检查设备是否被其他应用占用后重试。";
    }
    default: {
      return "无法开启媒体设备或屏幕共享，请检查设备与系统权限后重试。";
    }
  }
}

export function notifyMeetingMediaFailure(failure?: MediaDeviceFailure) {
  toast.error(getMeetingMediaErrorMessage(failure), { id: "human-meeting-media-error" });
}

export function notifyMeetingMediaError(error: Error) {
  notifyMeetingMediaFailure(MediaDeviceFailure.getFailure(error));
}
