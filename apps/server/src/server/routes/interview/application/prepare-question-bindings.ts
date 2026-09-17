import type { db } from "../../../../lib/server/db/index";
import type { InterviewContextSnapshotPayload } from "@app/db-schema/interview-snapshots";
import { lockAiRound } from "../../studio/routes/interviews/dao/ai-round-lifecycle";
import {
  buildSnapshotPayloadFromDatabase,
  flattenPresetQuestionsFromContextSnapshot,
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
} from "../../studio/routes/interviews/dao/context-snapshots";
import { loadSubmissionsByInterview } from "../../studio/routes/forms/dao/submissions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the recruiting record/round lock through snapshot and session writes. */
export async function prepareQuestionBindings(
  tx: Tx,
  input: {
    interviewRecordId: string;
    roundId: string;
    phase: "forms" | "questions";
    preview?: boolean;
  },
): Promise<InterviewContextSnapshotPayload | null> {
  const locked = await lockAiRound(tx, input.roundId);
  if (!locked?.isEffective || locked.record.id !== input.interviewRecordId) {
    return null;
  }
  const active = await loadActiveInterviewContextSnapshot(input.interviewRecordId, tx);
  if (!active) {
    return null;
  }
  const submissions = await loadSubmissionsByInterview(input.interviewRecordId, tx);
  const started = Boolean(
    locked.round.sessionStartedAt ||
    locked.round.liveKitRoomName ||
    locked.round.status === "completed",
  );
  const bindings = active.payload.bindings ?? {
    forms: submissions.length > 0 || started,
    questions: started,
  };
  if (input.phase === "questions") {
    const submittedIds = new Set(submissions.map((submission) => submission.templateId));
    if (
      !bindings.forms ||
      active.payload.forms.some((form) => !submittedIds.has(form.templateId))
    ) {
      return null;
    }
  }
  if (bindings[input.phase] || (input.phase === "questions" && started)) {
    return active.payload;
  }
  const options = {
    bindingPhase: input.phase,
    createdBy: null,
    interviewRecordId: input.interviewRecordId,
    previousPayload: { ...active.payload, bindings },
    reason: "manual_refresh" as const,
    scheduleEntryId: input.roundId,
  };
  const { payload } = await buildSnapshotPayloadFromDatabase(tx, options);
  // Submitted answers always keep the exact form version they were validated against.
  payload.forms = payload.forms.map((form) => {
    const submitted = submissions.find((submission) => submission.templateId === form.templateId);
    return submitted
      ? {
          snapshot: submitted.snapshot,
          templateId: submitted.templateId,
          version: submitted.version,
          versionId: submitted.versionId,
        }
      : form;
  });
  if (
    input.preview ||
    (input.phase === "questions" && flattenPresetQuestionsFromContextSnapshot(payload).length === 0)
  ) {
    return payload;
  }
  const snapshot = await refreshInterviewContextSnapshot(tx, {
    ...options,
    payloadOverride: payload,
  });
  return snapshot.payload;
}
