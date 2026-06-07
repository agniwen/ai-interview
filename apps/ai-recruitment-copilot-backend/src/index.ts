import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import { resolveStandaloneServerConfig } from "./standalone/config";
import { loadStandaloneEnv } from "./standalone/env";

async function main() {
  loadStandaloneEnv();

  const { hostname, port } = resolveStandaloneServerConfig();
  const { createServerApp } = await import("./server/app");
  const app = createServerApp();

  const server = serve({
    fetch: app.fetch,
    hostname,
    port,
  });
  const closeServer = promisify(server.close.bind(server));
  console.info(`[backend] listening on http://${hostname}:${port}`);

  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      try {
        await closeServer();
        process.exit(0);
      } catch (error) {
        console.error(`[backend] failed to shut down after ${signal}:`, error);
        process.exit(1);
      }
    })();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
