import { MastraServer } from "@mastra/hono";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { mastra } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/index";

export const platformMastraRouter = factory.createApp();

const server = new MastraServer({
  app: platformMastraRouter,
  mastra,
  prefix: "/",
});

await server.init();
