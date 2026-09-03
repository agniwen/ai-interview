import type {
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewMeetingStatus,
} from "@app/db-schema/studio-interviews";
import { db } from "../../../../../lib/server/db/index";
import { factory } from "../../../../factory";
import { createHumanInterviewDocumentSyncDao } from "../../../studio/routes/interviews/dao/human-interview-document-sync";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";
import { resolveHumanInterviewReviewMutationAccess } from "./access";
import type { HumanInterviewReviewScopeResolver } from "../../../studio/routes/interviews/review-actions-route";

interface DocumentSyncRetryDependencies {
  resolveInterviewer(token: string): Promise<{
    organizationId: string;
    roundId: string;
    role: HumanInterviewMeetingInterviewerRole;
    status: HumanInterviewMeetingStatus;
  } | null>;
  retry(input: { organizationId: string; roundId: string }): Promise<boolean>;
}

export function createHumanInterviewDocumentSyncRouter(
  dependencies: DocumentSyncRetryDependencies,
  resolveScope?: HumanInterviewReviewScopeResolver,
) {
  return factory.createApp().post("/:inviteToken/evaluation-document-retry", async (c) => {
    const scope = await (resolveScope
      ? resolveScope(c)
      : dependencies.resolveInterviewer(c.req.param("inviteToken")));
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    const access = resolveHumanInterviewReviewMutationAccess(scope, "submit");
    if (access) {
      return c.json({ error: access.message }, access.status);
    }
    const retried = await dependencies.retry({
      organizationId: scope.organizationId,
      roundId: scope.roundId,
    });
    return retried
      ? c.json({ ok: true }, 200)
      : c.json({ error: "当前没有需要重试的评价表同步任务。" }, 409);
  });
}

export const humanInterviewDocumentSyncRouter = createHumanInterviewDocumentSyncRouter({
  resolveInterviewer: resolveHumanInterviewMeetingInterviewerInviteToken,
  retry: (input) => createHumanInterviewDocumentSyncDao(db).retry(input),
});
