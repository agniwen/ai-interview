import { and, eq } from "drizzle-orm";
import { jobDescription } from "@app/db-schema/schema";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  buildRecruitingInitialInterviewObjectKey,
  copyMeetingRecordingToRecruitingStorage,
  copyRecruitingSnapshotObject,
  deleteRecruitingSnapshotObject,
} from "@app/object-storage";
import { enqueueInitialInterviewEvaluationJobs } from "@app/meeting-processing-queue/initial-interview-evaluation";
import { initialInterviewSnapshotSchema } from "@app/shared/human-initial-interview";
import { db } from "../../../../../../../../lib/server/db";
import { loadAuthorizedMeeting, meetingRole } from "../../../../../../meetings/authorized-meeting";
import { loadActiveMeetingTranscript } from "../../../../../../meetings/transcription/revision-dao";
import { formatResumeEmploymentContext } from "../../../../../../agent/utils/feishu-hr-evaluation";
import {
  loadInitialInterviewVersion,
  requireInitialInterviewOverwrite,
  saveInitialInterviewSnapshot,
  withInitialInterviewLock,
} from "../dao";
import { InitialInterviewError } from "../errors";
import { importRecordedInitialInterview } from "./import-recorded-initial-interview";
import type { ImportRecordedInitialInterviewInput } from "./import-recorded-initial-interview";

async function captureSnapshot(input: ImportRecordedInitialInterviewInput) {
  const sourceInput = {
    meetingId: input.meetingId,
    memberRole: input.memberRole,
    organizationId: input.organizationId,
    userId: input.actorId,
  };
  const meeting = await loadAuthorizedMeeting(sourceInput);
  if (!meeting || meeting.status === "trashed") {
    throw new InitialInterviewError("录音不存在或无权访问。", 404);
  }
  const role = meetingRole(meeting, sourceInput);
  if (role !== "owner" && role !== "administrator") {
    throw new InitialInterviewError("只有录音创建者或工作区管理员可以将资料提交到招聘台。", 403);
  }
  const [transcript, records] = await Promise.all([
    loadActiveMeetingTranscript(sourceInput),
    db
      .select()
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, input.recruitingRecordId),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
        ),
      )
      .limit(1),
  ]);
  const [record] = records;
  const playback = meeting.assets.find(
    (asset) => asset.track === "playback" && asset.status === "ready",
  );
  if (!transcript?.turns.length || !playback) {
    throw new InitialInterviewError("录音与完整转写仍在后台处理中，请完成后再生成评价表。");
  }
  if (!record) {
    throw new InitialInterviewError("招聘记录不存在。", 404);
  }
  const [job] = record.jobDescriptionId
    ? await db
        .select({
          id: jobDescription.id,
          prompt: jobDescription.prompt,
          title: jobDescription.name,
        })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.id, record.jobDescriptionId),
            eq(jobDescription.organizationId, input.organizationId),
          ),
        )
        .limit(1)
    : [];
  const copiedKeys: string[] = [];
  try {
    const recordingKey = await buildRecruitingInitialInterviewObjectKey(
      input.organizationId,
      input.requestId,
      "recording",
    );
    copiedKeys.push(recordingKey);
    const copied = await copyMeetingRecordingToRecruitingStorage({
      contentType: playback.contentType,
      sourceStorageKey: playback.storageKey,
      targetStorageKey: recordingKey,
    });
    let resume: { storageKey: string; fileName: string } | null = null;
    if (record.resumeStorageKey) {
      const storageKey = await buildRecruitingInitialInterviewObjectKey(
        input.organizationId,
        input.requestId,
        "resume",
      );
      copiedKeys.push(storageKey);
      await copyRecruitingSnapshotObject({
        sourceStorageKey: record.resumeStorageKey,
        targetStorageKey: storageKey,
      });
      resume = {
        fileName: record.resumeFileName ?? `${record.candidateName}-简历.pdf`,
        storageKey,
      };
    }
    return initialInterviewSnapshotSchema.parse({
      candidateName: record.candidateName,
      durationMs: playback.durationMs ?? transcript.turns.at(-1)?.endMs ?? 0,
      interviewQuestions: record.interviewQuestions ?? [],
      job: job ?? null,
      qualitativeResumeEvaluation: record.qualitativeResumeEvaluation,
      recordedAt: meeting.startedAt.toISOString(),
      recording: {
        contentType: playback.contentType,
        sizeBytes: copied.sizeBytes,
        storageKey: recordingKey,
      },
      resume,
      resumeEmploymentContext: formatResumeEmploymentContext(record.resumeProfile),
      resumeText: record.resumeText ?? "",
      sourceMeetingId: meeting.id,
      sourceTranscriptRevisionId: transcript.id,
      title: meeting.title,
      turns: transcript.turns,
    });
  } catch (error) {
    await Promise.allSettled(copiedKeys.map(deleteRecruitingSnapshotObject));
    throw error;
  }
}

export async function dispatchInitialInterviewVersion(organizationId: string, versionId: string) {
  try {
    await enqueueInitialInterviewEvaluationJobs([{ organizationId, versionId }]);
  } catch (error) {
    console.error("[initial-interview] queued version retained for recovery", { error, versionId });
  }
}

export function importRecordedInitialInterviewSnapshot(input: ImportRecordedInitialInterviewInput) {
  return importRecordedInitialInterview(input, {
    capture: captureSnapshot,
    checkOverwrite: (command) =>
      requireInitialInterviewOverwrite(command, command.overwriteDocumentId),
    cleanup: async (snapshot) => {
      await Promise.allSettled([
        deleteRecruitingSnapshotObject(snapshot.recording.storageKey),
        ...(snapshot.resume ? [deleteRecruitingSnapshotObject(snapshot.resume.storageKey)] : []),
      ]);
    },
    enqueue: dispatchInitialInterviewVersion,
    findExisting: async (command) => {
      const existing = await loadInitialInterviewVersion(command.organizationId, command.requestId);
      return existing?.source ?? null;
    },
    persist: (command, snapshot) =>
      saveInitialInterviewSnapshot({ ...command, id: command.requestId, snapshot }),
    withLock: withInitialInterviewLock,
  });
}
