import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { emptyFiltersSchema, platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { loadPlatformOrganizationsHydrationState } from "./organizations.server";

export type PlatformOrganizationsState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformOrganizationsState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<PlatformOrganizationsState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformOrganizationsHydrationState(data.query),
      status: "ready",
    };
  });
