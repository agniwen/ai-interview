import { and, eq } from "drizzle-orm";
import { recruitingInitialInterviewVersion } from "@app/db-schema/schema";
import {
  initialInterviewHrEvaluationSchema,
  initialInterviewStatusSchema,
} from "@app/shared/human-initial-interview";
import { db } from "../../../../../../../../lib/server/db";
import { generateFeishuHrEvaluation } from "../../../../../../agent/utils/feishu-hr-evaluation";
import { loadInitialInterviewVersion, withInitialInterviewLock } from "../dao";
import { publishInitialInterviewDocument } from "./publish-initial-interview-document";
import { processInitialInterview } from "./process-initial-interview";

export function processInitialInterviewVersion(
  input: { organizationId: string; versionId: string },
  context?: { attempt: number; maxAttempts: number },
) {
  return processInitialInterview(
    { ...input, attempt: context?.attempt ?? 1, maxAttempts: context?.maxAttempts ?? 1 },
    {
      generate: (job) =>
        generateFeishuHrEvaluation({
          candidateFormResponses: "",
          recordedTranscript: JSON.stringify({
            candidateName: job.snapshot.candidateName,
            turns: job.turns.map((turn) => ({
              speakerKey: turn.speakerKey,
              startMs: turn.startMs,
              text: turn.text,
            })),
          }),
          resumeEmploymentContext: job.snapshot.resumeEmploymentContext,
        }),
      load: async (organizationId, versionId) => {
        const loaded = await loadInitialInterviewVersion(organizationId, versionId);
        if (!loaded) {
          return null;
        }
        return {
          actorId: loaded.version.createdBy,
          documentId: loaded.version.documentId,
          evaluation: loaded.version.evaluation
            ? initialInterviewHrEvaluationSchema.parse(loaded.version.evaluation)
            : null,
          id: loaded.version.id,
          initialInterviewId: loaded.source.id,
          organizationId,
          overwriteDocumentId: loaded.version.overwriteDocumentId,
          recruitingRecordId: loaded.source.recruitingRecordId,
          roles: loaded.roles,
          snapshot: loaded.snapshot,
          status: initialInterviewStatusSchema.parse(loaded.version.status),
          turns: loaded.turns,
        };
      },
      publish: publishInitialInterviewDocument,
      update: async (job, patch) => {
        await db
          .update(recruitingInitialInterviewVersion)
          .set({ ...patch, updatedAt: new Date() })
          .where(
            and(
              eq(recruitingInitialInterviewVersion.id, job.id),
              eq(recruitingInitialInterviewVersion.organizationId, job.organizationId),
            ),
          );
      },
      withLock: withInitialInterviewLock,
    },
  );
}
