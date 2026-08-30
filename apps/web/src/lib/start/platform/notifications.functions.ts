import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { z } from "zod";
import { loadPlatformNotificationsHydrationState } from "./notifications.server";

const notificationFiltersSchema = z.object({
  providerId: z.enum(["all", "feishu", "feishu-jiguang-hr"]),
  status: z.enum(["all", "pending", "sent", "failed"]),
});

export type PlatformNotificationsState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformNotificationsState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(notificationFiltersSchema))
  .handler(async ({ data }): Promise<PlatformNotificationsState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformNotificationsHydrationState(data.query),
      status: "ready",
    };
  });
