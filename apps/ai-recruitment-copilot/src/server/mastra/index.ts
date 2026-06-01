import "server-only";

import { Mastra } from "@mastra/core/mastra";
import { getMastraStorage } from "./storage";

declare global {
  // eslint-disable-next-line no-var -- Preserve one Mastra instance across Next.js HMR reloads.
  var arcMastra: Mastra | undefined;
}

export function getMastra(): Mastra {
  if (!globalThis.arcMastra) {
    globalThis.arcMastra = new Mastra({
      storage: getMastraStorage(),
    });
  }
  return globalThis.arcMastra;
}
