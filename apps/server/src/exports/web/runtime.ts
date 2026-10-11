import type { auth } from "../../infrastructure/auth";

export type ServerAuth = typeof auth;
export { createServerEnv, SERVER_ENV_NAMES } from "../../infrastructure/env";
export type { ServerEnvName } from "../../infrastructure/env";

// Runtime capabilities load the backend lazily so the Web host can import the environment
// contract during startup without evaluating the Server graph before its own setup runs.

// Loading the Server pool module registers it as the shared-package database
// (`@app/database/context`). Every capability does this first because some, such as Feishu
// bot events, can reach package workflows before the first API request creates the app.
async function loadServerDatabase() {
  return await import("../../infrastructure/db");
}

export async function createServerApp() {
  await loadServerDatabase();
  const { createServerApp: create } = await import("../../app");
  return create();
}

export async function pingDatabase(): Promise<void> {
  const { pingDatabase: ping } = await loadServerDatabase();
  await ping();
}

export async function initializeFeishuBots(): Promise<void> {
  await loadServerDatabase();
  const { initializeFeishuBots: initialize } =
    await import("@app/recruiting-workflows/feishu-bot/bot");
  await initialize();
}

export async function startHumanInterviewDocumentSync() {
  await loadServerDatabase();
  const { startHumanInterviewDocumentSync: start } =
    await import("../../routes/studio/routes/interviews/adapters/default-document-sync-scheduler");
  return start();
}
