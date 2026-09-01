import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { meetingProcessingRun, meetingSession } from "@arc/db-schema/schema";
import {
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceTemplate } from "@arc/shared/meeting-intelligence";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import type { BackgroundRecoveryRepository } from "./background-recovery.repository.js";

export class MeetingIntelligenceRecoveryService {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;
  private readonly queueProducer: BackgroundQueueProducerService;
  private readonly recovery: BackgroundRecoveryRepository;

  constructor(
    database: Database,
    recovery: BackgroundRecoveryRepository,
    queueProducer: BackgroundQueueProducerService,
    env: NodeJS.ProcessEnv = rawBackendEnvironment,
  ) {
    this.database = database;
    this.env = env;
    this.queueProducer = queueProducer;
    this.recovery = recovery;
  }

  async recoverMissing(): Promise<void> {
    const model = this.env.MEETING_INTELLIGENCE_MODEL?.trim();
    if (!model) {
      throw new Error("MEETING_INTELLIGENCE_MODEL is required for intelligence recovery");
    }
    const provider = model.split("/", 1)[0] || "unknown";
    const missing = await this.recovery.listMeetingsNeedingAutomaticIntelligence();
    const jobs: { processingRunId: string }[] = [];
    for (const meeting of missing) {
      const run = await this.createAutomaticRun({ ...meeting, model, provider });
      if (run) {
        jobs.push({ processingRunId: run });
      }
    }
    if (jobs.length > 0) {
      await this.queueProducer.enqueueMeetingIntelligenceJobs(jobs);
    }
  }

  private createAutomaticRun(input: {
    meetingId: string;
    model: string;
    organizationId: string;
    provider: string;
  }): Promise<string | null> {
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          intelligenceRunId: meetingSession.intelligenceRunId,
          status: meetingSession.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !meeting?.activeTranscriptRevisionId ||
        meeting.status !== "ready" ||
        meeting.transcriptionStatus !== "ready"
      ) {
        return null;
      }
      if (meeting.intelligenceRunId) {
        const [active] = await tx
          .select({ id: meetingProcessingRun.id, status: meetingProcessingRun.status })
          .from(meetingProcessingRun)
          .where(eq(meetingProcessingRun.id, meeting.intelligenceRunId))
          .for("update")
          .limit(1);
        if (active && ["pending", "processing"].includes(active.status)) {
          return active.id;
        }
      }
      const recruiting = await tx.query.meetingRecruitingContext.findFirst({
        columns: { meetingId: true },
        where: { meetingId: input.meetingId, organizationId: input.organizationId },
      });
      const template: MeetingIntelligenceTemplate = recruiting ? "recruiting-interview" : "general";
      const idempotencyKey = [
        "meeting-intelligence",
        input.meetingId,
        meeting.activeTranscriptRevisionId,
        template,
        input.provider,
        input.model,
        MEETING_INTELLIGENCE_PIPELINE_VERSION,
        MEETING_INTELLIGENCE_PROMPT_VERSION,
      ].join(":");
      const runId = randomUUID();
      const [inserted] = await tx
        .insert(meetingProcessingRun)
        .values({
          attempt: 0,
          id: runId,
          idempotencyKey,
          inputTranscriptRevisionId: meeting.activeTranscriptRevisionId,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
          promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
          provider: input.provider,
          region: "default",
          requestKind: "automatic",
          requestedBy: null,
          stage: "meeting-intelligence",
          status: "pending",
          templateKey: template,
        })
        .onConflictDoNothing({ target: meetingProcessingRun.idempotencyKey })
        .returning({ id: meetingProcessingRun.id });
      const existingRows = inserted
        ? []
        : await tx
            .select({ id: meetingProcessingRun.id })
            .from(meetingProcessingRun)
            .where(eq(meetingProcessingRun.idempotencyKey, idempotencyKey))
            .limit(1);
      const existing = inserted?.id ?? existingRows[0]?.id;
      if (!existing) {
        return null;
      }
      if (meeting.intelligenceRunId && meeting.intelligenceRunId !== existing) {
        await tx
          .update(meetingProcessingRun)
          .set({
            errorCode: "superseded",
            errorMessage: "Meeting Intelligence run was superseded",
            executionToken: null,
            finishedAt: new Date(),
            status: "failed",
          })
          .where(
            and(
              eq(meetingProcessingRun.id, meeting.intelligenceRunId),
              inArray(meetingProcessingRun.status, ["pending", "processing"]),
            ),
          );
      }
      await tx
        .update(meetingSession)
        .set({
          intelligenceError: null,
          intelligenceRunId: existing,
          intelligenceStatus: "pending",
        })
        .where(eq(meetingSession.id, input.meetingId));
      return existing;
    });
  }
}
