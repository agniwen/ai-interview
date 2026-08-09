export interface DownloadApi {
  start: (url: string) => Promise<boolean>;
}
