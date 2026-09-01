import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import {
  captureBackendException,
  flushBackendSentry,
  initializeBackendSentry,
} from "./lib/server/sentry";
import { validateServerEnv } from "./lib/server/env";
import { resolveStandaloneServerConfig } from "./standalone/config";
import { loadStandaloneEnv } from "./standalone/env";
import { RuntimeCloseStack } from "./standalone/runtime-lifecycle";

async function startFeishuBotsIfEnabled(): Promise<(() => Promise<void>) | null> {
  if (
    process.env.FEISHU_BOT_ENABLED !== "true" &&
    process.env.FEISHU_HUMAN_INTERVIEW_ENABLED !== "true"
  ) {
    return null;
  }

  const { initializeFeishuBots, shutdownFeishuBots } =
    await import("./server/integrations/feishu/bot");
  await initializeFeishuBots();
  console.info("[backend] Feishu bot websocket connections initialized");
  return shutdownFeishuBots;
}

async function main() {
  loadStandaloneEnv();
  validateServerEnv();
  initializeBackendSentry();

  const runtime = new RuntimeCloseStack();
  try {
    const { hostname, port } = resolveStandaloneServerConfig();
    const [{ createServerApp }, { closeDatabase }] = await Promise.all([
      import("./server/app"),
      import("./lib/server/db"),
    ]);
    runtime.add("database", closeDatabase);

    const stopFeishuBots = await startFeishuBotsIfEnabled();
    if (stopFeishuBots) {
      runtime.add("Feishu bots", stopFeishuBots);
    }

    const app = createServerApp();
    const server = serve({
      fetch: app.fetch,
      hostname,
      port,
    });
    runtime.add("HTTP server", promisify(server.close.bind(server)));
    console.info(`[backend] listening on http://${hostname}:${port}`);

    let shutdownPromise: Promise<void> | null = null;
    const shutdown = (signal: NodeJS.Signals) => {
      shutdownPromise ??= (async () => {
        try {
          await runtime.close();
          process.exit(0);
        } catch (error) {
          console.error(`[backend] failed to shut down after ${signal}:`, error);
          captureBackendException(error, "backend.shutdown", { signal });
          await flushBackendSentry();
          process.exit(1);
        }
      })();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (startupError) {
    try {
      await runtime.close();
    } catch (shutdownError) {
      throw new Error("Standalone backend startup failed and resource rollback was incomplete.", {
        cause: shutdownError,
      });
    }
    throw startupError;
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  captureBackendException(error, "backend.startup");
  await flushBackendSentry();
  process.exit(1);
}
