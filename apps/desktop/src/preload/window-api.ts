export interface WindowApi {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  maximize: () => Promise<boolean>;
  minimize: () => Promise<void>;
  platform: NodeJS.Platform;
}
