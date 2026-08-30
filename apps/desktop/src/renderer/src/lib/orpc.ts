import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/message-port";
import type { RouterContractClient } from "@orpc/contract";
import type { orpcContract } from "../../../preload/orpc-contract";

/**
 * oRPC client over an Electron MessageChannel.
 *
 * We create one port pair at module scope, forward the server end to the main
 * process through the preload (which relays it via `ipcRenderer.postMessage`),
 * and keep the client end for type-safe calls. See
 * `src/main/orpc.ts` for the main-process side.
 */
const { port1: clientPort, port2: serverPort } = new MessageChannel();
window.postMessage("start-orpc-client", "*", [serverPort]);

const link = new RPCLink({ port: clientPort });
clientPort.start();

export const orpc: RouterContractClient<typeof orpcContract> = createORPCClient(link);
