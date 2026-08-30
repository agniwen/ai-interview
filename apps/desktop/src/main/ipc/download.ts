import { ipcMain } from "electron";

const MEETING_EXPORT_PATH =
  /^\/api\/w\/[^/]+\/meetings\/[^/]+\/exports\/(?:audio|markdown|txt|srt|json)$/;

export function isAllowedMeetingExportDownloadUrl(value: string, apiOrigin: string): boolean {
  try {
    const url = new URL(value);
    const configuredOrigin = new URL(apiOrigin).origin;
    const trustedProtocol =
      url.protocol === "https:" ||
      (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
    const tracks = url.searchParams.getAll("track");
    const trustedQuery =
      tracks.length <= 1 &&
      tracks.every((track) => ["playback", "microphone", "system"].includes(track));
    return (
      trustedProtocol &&
      url.origin === configuredOrigin &&
      !url.username &&
      !url.password &&
      MEETING_EXPORT_PATH.test(url.pathname) &&
      [...url.searchParams.keys()].every((key) => key === "track") &&
      trustedQuery
    );
  } catch {
    return false;
  }
}

export function registerDownloadIpc(
  apiOrigin = import.meta.env.VITE_BETTER_AUTH_URL,
  ipcMainLike: Pick<typeof ipcMain, "handle"> = ipcMain,
): void {
  ipcMainLike.handle("download:start", (event, url: string) => {
    if (!isAllowedMeetingExportDownloadUrl(url, apiOrigin)) {
      return false;
    }
    event.sender.downloadURL(url);
    return true;
  });
}
