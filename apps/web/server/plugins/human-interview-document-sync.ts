import { startHumanInterviewDocumentSync } from "@app/server/web/document-sync";
import { definePlugin } from "nitro";
import { applyServerEnv } from "../../src/env/server";

export default definePlugin((app) => {
  if (import.meta.prerender || process.env.TSS_PRERENDERING === "true") {
    return;
  }

  applyServerEnv();
  if (!process.env.DATABASE_URL) {
    return;
  }

  const scheduler = startHumanInterviewDocumentSync();
  const close = async () => {
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
    await scheduler.close();
  };
  // The Bun preset closes HTTP on signals without invoking Nitro's close hook.
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  app.hooks.hook("close", close);
});
