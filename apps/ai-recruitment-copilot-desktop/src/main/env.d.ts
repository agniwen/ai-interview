interface ImportMetaEnv {
  readonly VITE_BETTER_AUTH_URL: string;
  readonly VITE_RECORDING_R2_UPLOAD_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
