import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { loadPlatformQueuesHydrationState } from "./queues.server";

const queueFiltersSchema = z.object({
  queue: z.string(),
  state: z.string(),
});

export type PlatformQueuesState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformQueuesState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(queueFiltersSchema))
  .handler(async ({ data }): Promise<PlatformQueuesState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformQueuesHydrationState(data.query),
      status: "ready",
    };
  });
