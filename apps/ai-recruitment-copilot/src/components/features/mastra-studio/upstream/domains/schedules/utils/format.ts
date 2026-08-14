export const formatScheduleTimestamp = (ms?: number) => {
  if (!ms || ms <= 0) {
    return "—";
  }
  return new Date(ms).toLocaleString("zh-CN");
};

export const formatRelativeTime = (ms?: number) => {
  if (!ms || ms <= 0) {
    return "—";
  }
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const seconds = Math.floor(abs / 1000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  if (seconds < 60) {
    return formatter.format(diff >= 0 ? seconds : -seconds, "second");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return formatter.format(diff >= 0 ? minutes : -minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatter.format(diff >= 0 ? hours : -hours, "hour");
  }
  const days = Math.floor(hours / 24);
  return formatter.format(diff >= 0 ? days : -days, "day");
};
