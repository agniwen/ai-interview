import startHandler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { applyServerEnv } from "./env/server";

const globalWithCommonJsDirname = globalThis as typeof globalThis & {
  __dirname?: string;
};

// Some Node-oriented dependencies still probe `__dirname` after ESM bundling.
// Define a process-wide fallback before any lazy backend chunks are imported.
globalWithCommonJsDirname.__dirname ??= import.meta.dirname;

interface HonoApp {
  fetch(request: Request): Response | Promise<Response>;
}

let honoAppPromise: Promise<HonoApp> | undefined;
let feishuBotStartPromise: Promise<void> | undefined;

async function createHonoApp() {
  const { createServerApp } = await import("@arc/ai-recruitment-copilot-backend/server/app");
  return createServerApp();
}

async function getHonoApp() {
  honoAppPromise ??= createHonoApp();
  return await honoAppPromise;
}

async function createOgImageResponse() {
  const { createOgImageResponse: createResponse } = await import("./lib/server/og-image");
  return createResponse();
}

async function createReadinessResponse() {
  try {
    const [, { pingDatabase }, queue] = await Promise.all([
      getHonoApp(),
      import("@arc/ai-recruitment-copilot-backend/lib/server/db"),
      import("@arc/resume-parse-queue/resume-parse"),
    ]);

    await pingDatabase();
    if (queue.isResumeParseQueueConfigured()) {
      await queue.getResumeParseQueueStats();
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[web] readiness check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}

function startFeishuBotsIfEnabled() {
  if (process.env.FEISHU_BOT_ENABLED !== "true" || process.env.TSS_PRERENDERING === "true") {
    return;
  }

  feishuBotStartPromise ??= (async () => {
    try {
      const { initializeFeishuBots } =
        await import("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot");
      await initializeFeishuBots();
      console.info("[web] Feishu bot websocket connections initialized");
    } catch (error) {
      feishuBotStartPromise = undefined;
      console.error("[web] failed to initialize Feishu bot websocket connections", error);
    }
  })();
}

function isApiRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isHealthRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/health";
}

function isReadinessRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/ready";
}

function isAppVersionRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/api/app-version";
}

function isOgImageRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === "/og.png";
}

export default createServerEntry({
  async fetch(request, options) {
    applyServerEnv();

    if (isHealthRequest(request)) {
      return Response.json({ ok: true });
    }

    if (isReadinessRequest(request)) {
      return createReadinessResponse();
    }

    if (isOgImageRequest(request)) {
      return createOgImageResponse();
    }

    if (isAppVersionRequest(request)) {
      if (options === undefined) {
        return startHandler.fetch(request);
      }
      return startHandler.fetch(request, options);
    }

    startFeishuBotsIfEnabled();

    if (isApiRequest(request)) {
      const honoApp = await getHonoApp();
      return honoApp.fetch(request);
    }

    if (options === undefined) {
      return startHandler.fetch(request);
    }

    return startHandler.fetch(request, options);
  },
});
