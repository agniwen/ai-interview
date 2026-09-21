import { createServerFn } from "@tanstack/react-start";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioRecruitingLedgerState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ready" };

export const loadStudioRecruitingLedgerState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioRecruitingLedgerState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(
      data.slug,
      "recruitingLedger",
    );
    return access.status === "ready" ? { status: "ready" } : access;
  });
