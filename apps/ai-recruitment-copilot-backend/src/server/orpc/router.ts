import { os } from "@orpc/server";

import type { ORPCContext } from "./context";

const publicProcedure = os.$context<ORPCContext>();

export const orpcRouter = {
  health: publicProcedure.handler(() => ({ ok: true as const })),
};

export type ORPCRouter = typeof orpcRouter;
