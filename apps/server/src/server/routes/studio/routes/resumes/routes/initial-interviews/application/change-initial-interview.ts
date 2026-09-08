import { and, desc, eq } from "drizzle-orm";
import {
  recruitingInitialInterview,
  recruitingInitialInterviewVersion,
} from "@app/db-schema/schema";
import {
  getInitialInterviewRolesIssue,
  initialInterviewRolesSchema,
  initialInterviewTurnsSchema,
} from "@app/shared/human-initial-interview";
import type {
  InitialInterviewRoles,
  InitialInterviewTurn,
} from "@app/shared/human-initial-interview";
import { db } from "../../../../../../../../lib/server/db";
import {
  createInitialInterviewVersion,
  initialInterviewRecordScope,
  loadInitialInterviewVersion,
  requireInitialInterviewOverwrite,
  withInitialInterviewLock,
} from "../dao";
import type { InitialInterviewScope } from "../dao";
import { InitialInterviewError } from "../errors";
import { dispatchInitialInterviewVersion } from "./default-import-recorded-initial-interview";

export function regenerateInitialInterview(
  input: InitialInterviewScope & {
    initialInterviewId: string;
    requestId: string;
    actorId: string;
    overwriteDocumentId: string | null;
    roles?: InitialInterviewRoles;
    turns?: InitialInterviewTurn[];
  },
) {
  return withInitialInterviewLock(input, async () => {
    const previousRequest = await loadInitialInterviewVersion(
      input.organizationId,
      input.requestId,
    );
    if (previousRequest) {
      if (
        previousRequest.source.id !== input.initialInterviewId ||
        previousRequest.source.recruitingRecordId !== input.recruitingRecordId
      ) {
        throw new InitialInterviewError("生成请求已用于其他资料快照。");
      }
      return { id: previousRequest.version.id };
    }
    const [source] = await db
      .select({ id: recruitingInitialInterview.id })
      .from(recruitingInitialInterview)
      .where(
        and(
          initialInterviewRecordScope(recruitingInitialInterview, input),
          eq(recruitingInitialInterview.id, input.initialInterviewId),
        ),
      )
      .limit(1);
    if (!source) {
      throw new InitialInterviewError("资料快照不存在。", 404);
    }
    const [latest] = await db
      .select()
      .from(recruitingInitialInterviewVersion)
      .where(
        and(
          initialInterviewRecordScope(recruitingInitialInterviewVersion, input),
          eq(recruitingInitialInterviewVersion.initialInterviewId, source.id),
        ),
      )
      .orderBy(desc(recruitingInitialInterviewVersion.version))
      .limit(1);
    if (
      !latest ||
      ["queued", "identifying", "generating", "needs_speakers"].includes(latest.status)
    ) {
      throw new InitialInterviewError("请先完成当前生成任务或确认说话人。");
    }
    await requireInitialInterviewOverwrite(input, input.overwriteDocumentId);
    const turns = input.turns ?? initialInterviewTurnsSchema.parse(latest.transcript.turns);
    const roles =
      input.roles ?? (input.turns ? {} : initialInterviewRolesSchema.parse(latest.roles));
    if (input.roles) {
      const issue = getInitialInterviewRolesIssue(turns, input.roles);
      if (issue) {
        throw new InitialInterviewError(issue, 400);
      }
    }
    await createInitialInterviewVersion({ ...input, id: input.requestId, roles, turns });
    await dispatchInitialInterviewVersion(input.organizationId, input.requestId);
    return { id: input.requestId };
  });
}

export function resumeInitialInterviewVersion(
  input: InitialInterviewScope & {
    versionId: string;
    overwriteDocumentId: string | null;
    roles?: InitialInterviewRoles;
  },
) {
  return withInitialInterviewLock(input, async () => {
    const loaded = await loadInitialInterviewVersion(input.organizationId, input.versionId);
    if (!loaded || loaded.source.recruitingRecordId !== input.recruitingRecordId) {
      throw new InitialInterviewError("评价版本不存在。", 404);
    }
    if (!["needs_speakers", "failed"].includes(loaded.version.status)) {
      throw new InitialInterviewError("此版本无需重试或已在处理中。");
    }
    await requireInitialInterviewOverwrite(input, input.overwriteDocumentId);
    const roles = input.roles ?? loaded.roles;
    if (input.roles) {
      const issue = getInitialInterviewRolesIssue(loaded.turns, roles);
      if (issue) {
        throw new InitialInterviewError(issue, 400);
      }
    }
    const [latest] = await db
      .select({ id: recruitingInitialInterviewVersion.id })
      .from(recruitingInitialInterviewVersion)
      .where(eq(recruitingInitialInterviewVersion.initialInterviewId, loaded.source.id))
      .orderBy(desc(recruitingInitialInterviewVersion.version))
      .limit(1);
    if (latest?.id !== input.versionId) {
      throw new InitialInterviewError("已有更新的评价版本，请在最新版本上操作。");
    }
    await db
      .update(recruitingInitialInterviewVersion)
      .set({
        error: null,
        evaluation: input.roles ? null : loaded.version.evaluation,
        overwriteDocumentId: input.overwriteDocumentId,
        roles,
        status: "queued",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recruitingInitialInterviewVersion.id, input.versionId),
          initialInterviewRecordScope(recruitingInitialInterviewVersion, input),
        ),
      );
    await dispatchInitialInterviewVersion(input.organizationId, input.versionId);
    return { id: input.versionId };
  });
}
