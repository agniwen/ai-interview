interface MicrophoneDeviceOption {
  deviceId: string;
  label: string;
}

export function resolveActiveMicrophoneLabel(
  devices: MicrophoneDeviceOption[],
  activeDeviceId: string,
) {
  const activeDevice = devices.find((device) => device.deviceId === activeDeviceId);
  const label = activeDevice?.label.trim();
  if (label) {
    return label;
  }
  return activeDeviceId === "default" ? "系统默认麦克风" : "当前麦克风";
}

export function resolvePreferredMicrophoneDeviceId(
  preferredDeviceId: string,
  activeDeviceId: string,
) {
  return activeDeviceId === "default" ? "default" : preferredDeviceId;
}
