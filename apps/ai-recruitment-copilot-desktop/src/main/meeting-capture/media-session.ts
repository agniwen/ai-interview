// oxlint-disable promise/prefer-await-to-callbacks -- Electron permission APIs are callback based.

export interface MeetingCaptureContents {
  mainFrame: { url: string };
}

interface PermissionCheckDetails {
  isMainFrame: boolean;
  mediaType?: string;
  requestingUrl?: string;
}

interface PermissionRequestDetails {
  isMainFrame: boolean;
  mediaTypes?: string[];
  requestingUrl?: string;
}

interface DisplayMediaRequest<Contents extends MeetingCaptureContents> {
  audioRequested: boolean;
  frame: Contents["mainFrame"] | null;
  videoRequested: boolean;
}

interface DisplayMediaStreams<Source extends object> {
  audio?: "loopback";
  video?: Source;
}

interface MeetingCaptureMediaSessionDependencies<
  Contents extends MeetingCaptureContents,
  Source extends object,
> {
  getMainWindowWebContents: () => Contents | null;
  getSources: (options: {
    thumbnailSize: { height: number; width: number };
    types: ["screen"];
  }) => Promise<readonly Source[]>;
  setDisplayMediaRequestHandler: (
    handler: (
      request: DisplayMediaRequest<Contents>,
      callback: (streams: DisplayMediaStreams<Source>) => void,
    ) => void,
    options: { useSystemPicker: false },
  ) => void;
  setPermissionCheckHandler: (
    handler: (
      contents: Contents | null,
      permission: string,
      requestingOrigin: string,
      details: PermissionCheckDetails,
    ) => boolean,
  ) => void;
  setPermissionRequestHandler: (
    handler: (
      contents: Contents,
      permission: string,
      callback: (granted: boolean) => void,
      details: PermissionRequestDetails,
    ) => void,
  ) => void;
}

export function registerMeetingCaptureMediaSessionHandlers<
  Contents extends MeetingCaptureContents,
  Source extends object,
>(dependencies: MeetingCaptureMediaSessionDependencies<Contents, Source>): void {
  const {
    getMainWindowWebContents,
    getSources,
    setDisplayMediaRequestHandler,
    setPermissionCheckHandler,
    setPermissionRequestHandler,
  } = dependencies;

  const isTrustedMainDocument = (
    contents: MeetingCaptureContents | null,
    details: { isMainFrame: boolean; requestingUrl?: string },
  ): boolean => {
    const trustedContents = getMainWindowWebContents();
    return Boolean(
      contents &&
      trustedContents === contents &&
      details.isMainFrame &&
      details.requestingUrl === trustedContents.mainFrame.url,
    );
  };

  setPermissionCheckHandler((contents, permission, _requestingOrigin, details) => {
    const allowedPermission =
      permission === "media" && (details.mediaType === undefined || details.mediaType === "audio");
    return allowedPermission && isTrustedMainDocument(contents, details);
  });
  setPermissionRequestHandler((contents, permission, callback, details) => {
    const isDisplayMedia = details.mediaTypes?.length === 0;
    const isAudioOnly = details.mediaTypes?.length === 1 && details.mediaTypes[0] === "audio";
    const allowedPermission =
      permission === "display-capture" ||
      (permission === "media" && (isAudioOnly || isDisplayMedia));
    callback(allowedPermission && isTrustedMainDocument(contents, details));
  });
  setDisplayMediaRequestHandler(
    async (request, callback) => {
      const trustedContents = getMainWindowWebContents();
      if (!trustedContents || request.frame !== trustedContents.mainFrame) {
        callback({});
        return;
      }
      try {
        const sources = await getSources({
          thumbnailSize: { height: 0, width: 0 },
          types: ["screen"],
        });
        const [source] = sources;
        if (!source) {
          callback({});
          return;
        }
        callback({
          audio: request.audioRequested ? "loopback" : undefined,
          video: request.videoRequested ? source : undefined,
        });
      } catch (error) {
        console.error("[meeting-capture] display-media grant failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}
