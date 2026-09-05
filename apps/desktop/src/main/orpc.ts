import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/message-port";
import { ipcMain } from "electron";
import { orpcContract } from "../preload/orpc-contract";
import { readSettings, updateSettings } from "./settings";
import { createLocalMeetingLiveTranscriptAuthorization } from "./meeting-transcription-provider-authorization";
import {
  clearMeetingTranscriptionProviderCredential,
  getMeetingTranscriptionProviderCredentialStatus,
  setMeetingTranscriptionProviderCredential,
} from "./meeting-transcription-provider-credentials";

/**
 * oRPC router implementing the shared contract. The renderer reaches it over
 * an Electron MessageChannel (see `src/preload/index.ts` port forwarding and
 * `src/renderer/src/lib/orpc.ts` client).
 */
const orpcRouter = implement(orpcContract).router({
  settings: {
    get: implement(orpcContract.settings.get).handler(() => readSettings()),
    set: implement(orpcContract.settings.set).handler(({ input }) => updateSettings(input)),
  },
  transcriptionProviders: {
    authorize: implement(orpcContract.transcriptionProviders.authorize).handler(({ input }) =>
      createLocalMeetingLiveTranscriptAuthorization(input),
    ),
    clearCredential: implement(orpcContract.transcriptionProviders.clearCredential).handler(
      ({ input }) => clearMeetingTranscriptionProviderCredential(input.provider),
    ),
    getCredentialStatus: implement(orpcContract.transcriptionProviders.getCredentialStatus).handler(
      () => getMeetingTranscriptionProviderCredentialStatus(),
    ),
    setCredential: implement(orpcContract.transcriptionProviders.setCredential).handler(
      ({ input }) => setMeetingTranscriptionProviderCredential(input.provider, input.apiKey),
    ),
  },
});

export function registerOrpcIpc(): void {
  const handler = new RPCHandler(orpcRouter, {
    interceptors: [
      async ({ next }) => {
        try {
          return await next();
        } catch (error) {
          console.error("[orpc]", error);
          throw error;
        }
      },
    ],
  });

  // The renderer creates a MessageChannel and forwards one port here via the
  // preload. Each renderer load upgrades its own port on the shared handler.
  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
    handler.upgrade(serverPort);
    serverPort.start();
  });
}
