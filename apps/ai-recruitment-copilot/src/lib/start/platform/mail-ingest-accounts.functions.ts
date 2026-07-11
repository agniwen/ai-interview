import { createServerFn } from "@tanstack/react-start";
import { getPlatformAdminStateFromRequest } from "@/lib/start/platform-admin.server";
import { emptyFiltersSchema, platformDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { JsonValue } from "@/lib/start/server-function-types";
import { listAccountMailMessages } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import { listMailMessagesQuerySchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/schema";
import { z } from "zod";
import { loadPlatformMailIngestAccountsHydrationState } from "./mail-ingest-accounts.server";

export type PlatformMailIngestAccountsState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

export const loadPlatformMailIngestAccountsState = createServerFn({ method: "GET" })
  .validator(platformDataGridInputSchema(emptyFiltersSchema))
  .handler(async ({ data }): Promise<PlatformMailIngestAccountsState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    return {
      dehydratedState: await loadPlatformMailIngestAccountsHydrationState(data.query),
      status: "ready",
    };
  });

const platformMailIngestAccountMessagesInputSchema = z.object({
  accountId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  query: listMailMessagesQuerySchema,
});

export type PlatformMailIngestAccountMessagesState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      result: Awaited<ReturnType<typeof listAccountMailMessages>>;
      status: "ready";
    };

export const loadPlatformMailIngestAccountMessages = createServerFn({ method: "GET" })
  .validator(platformMailIngestAccountMessagesInputSchema)
  .handler(async ({ data }): Promise<PlatformMailIngestAccountMessagesState> => {
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    const result = await listAccountMailMessages({
      accountId: data.accountId,
      organizationId: data.organizationId,
      ...data.query,
    });

    return { result, status: "ready" };
  });
