import startHandler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { applyServerEnv } from "./env/server";

// Some Node-oriented dependencies still probe `__dirname` after ESM bundling.
// Define a process-wide fallback before any lazy backend chunks are imported.
globalThis.__dirname ??= import.meta.dirname;

interface HonoApp {
  fetch(request: Request): Response | Promise<Response>;
}

type StartHandlerOptions = Parameters<typeof startHandler.fetch>[1];

type ResumeParseQueueStats = Record<string, number>;

export interface ServerEntryDependencies {
  applyServerEnv: () => void;
  createHonoApp: () => Promise<HonoApp>;
  createOgImageResponse: () => Response | Promise<Response>;
  getEnv: (name: string) => string | undefined;
  getResumeParseQueueStats: () => Promise<ResumeParseQueueStats>;
  initializeFeishuBots: () => Promise<void>;
  isResumeParseQueueConfigured: () => boolean | Promise<boolean>;
  pingDatabase: () => Promise<void>;
  startFetch: (request: Request, options?: StartHandlerOptions) => Response | Promise<Response>;
}

async function createHonoApp(): Promise<HonoApp> {
  const { createServerApp } = await import("@arc/ai-recruitment-copilot-backend/server/app");
  return createServerApp();
}

async function createOgImageResponse() {
  const { createOgImageResponse: createResponse } = await import("./lib/server/og-image");
  return createResponse();
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

export function createServerEntryHandler(dependencies: ServerEntryDependencies) {
  let honoAppPromise: Promise<HonoApp> | undefined;
  let feishuBotStartPromise: Promise<void> | undefined;

  const getHonoApp = () => {
    honoAppPromise ??= dependencies.createHonoApp();
    return honoAppPromise;
  };

  const createReadinessResponse = async () => {
    try {
      await getHonoApp();
      await dependencies.pingDatabase();
      if (await dependencies.isResumeParseQueueConfigured()) {
        await dependencies.getResumeParseQueueStats();
      }

      return Response.json({ ok: true });
    } catch (error) {
      console.error("[web] readiness check failed", error);
      return Response.json({ ok: false }, { status: 503 });
    }
  };

  const startFeishuBotsIfEnabled = () => {
    if (
      (dependencies.getEnv("FEISHU_BOT_ENABLED") !== "true" &&
        dependencies.getEnv("FEISHU_HUMAN_INTERVIEW_ENABLED") !== "true") ||
      dependencies.getEnv("TSS_PRERENDERING") === "true"
    ) {
      return;
    }

    feishuBotStartPromise ??= (async () => {
      try {
        await dependencies.initializeFeishuBots();
        console.info("[web] Feishu bot websocket connections initialized");
      } catch (error) {
        feishuBotStartPromise = undefined;
        console.error("[web] failed to initialize Feishu bot websocket connections", error);
      }
    })();
  };

  return {
    async fetch(request: Request, options?: StartHandlerOptions) {
      dependencies.applyServerEnv();
      const startFetch = () =>
        options === undefined
          ? dependencies.startFetch(request)
          : dependencies.startFetch(request, options);

      if (isHealthRequest(request)) {
        return Response.json({ ok: true });
      }

      if (isReadinessRequest(request)) {
        return createReadinessResponse();
      }

      if (isOgImageRequest(request)) {
        return dependencies.createOgImageResponse();
      }

      if (isAppVersionRequest(request)) {
        return startFetch();
      }

      startFeishuBotsIfEnabled();

      if (isApiRequest(request)) {
        const honoApp = await getHonoApp();
        return honoApp.fetch(request);
      }

      return startFetch();
    },
  };
}

const defaultDependencies: ServerEntryDependencies = {
  applyServerEnv,
  createHonoApp,
  createOgImageResponse,
  getEnv: (name) => process.env[name],
  getResumeParseQueueStats: async () => {
    const { getResumeParseQueueStats } = await import("@arc/resume-parse-queue/resume-parse");
    return getResumeParseQueueStats();
  },
  initializeFeishuBots: async () => {
    const { initializeFeishuBots } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot");
    await initializeFeishuBots();
  },
  isResumeParseQueueConfigured: async () => {
    const { isResumeParseQueueConfigured } = await import("@arc/resume-parse-queue/resume-parse");
    return isResumeParseQueueConfigured();
  },
  pingDatabase: async () => {
    const { pingDatabase } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
    await pingDatabase();
  },
  startFetch: (request, options) =>
    options === undefined ? startHandler.fetch(request) : startHandler.fetch(request, options),
};

export default createServerEntry(createServerEntryHandler(defaultDependencies));
