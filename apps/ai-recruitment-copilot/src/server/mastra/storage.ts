import "server-only";

import { PostgresStore } from "@mastra/pg";

declare global {
  // eslint-disable-next-line no-var -- Preserve one Mastra store across Next.js HMR reloads.
  var arcMastraPgStore: PostgresStore | undefined;
}

export function getMastraStorage(): PostgresStore {
  if (!globalThis.arcMastraPgStore) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    globalThis.arcMastraPgStore = new PostgresStore({
      connectionString,
      id: "arc-mastra-pg",
      schemaName: "mastra",
    });
  }
  return globalThis.arcMastraPgStore;
}
