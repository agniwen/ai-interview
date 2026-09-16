import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, inArray, lte, sql, asc } from "drizzle-orm";
import { aiInterviewReportReceipt } from "@app/db-schema/schema";
import { db } from "../../../lib/server/db/index";
import { stableStringify, jsonValueSchema } from "../../../lib/server/stable-stringify";
import { reportPayloadSchema } from "./route";
import type { AgentRouterDependencies, ReportPayload } from "./route";
import { lockAiRound } from "../studio/routes/interviews/dao/ai-round-lifecycle";
import { enqueueAiInterviewCompletedEvent } from "../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../interview-notifications/utils/feature-flags";

const RETRY_DELAY_MS = 60_000;
const LEASE_MS = 10 * 60_000;

async function runAnalyses(
  dependencies: AgentRouterDependencies,
  options: { conversationId: string; interviewRecordId: string },
  receiptId: string,
) {
  try {
    // Each analysis job persists its own retry state; never delay callback acknowledgement.
    await Promise.all([
      dependencies.runSummaryJob(options),
      dependencies.runKeyInformationJob(options),
    ]);
  } catch {
    console.error("[agent-report] analysis awaits recovery", { receiptId });
  }
}

async function processReceipt(id: string, dependencies: AgentRouterDependencies) {
  const now = new Date();
  const [receipt] = await db
    .update(aiInterviewReportReceipt)
    .set({
      attempts: sql`${aiInterviewReportReceipt.attempts} + 1`,
      nextAttemptAt: new Date(now.getTime() + LEASE_MS),
    })
    .where(
      and(
        eq(aiInterviewReportReceipt.id, id),
        inArray(aiInterviewReportReceipt.status, ["pending", "applied"]),
        lte(aiInterviewReportReceipt.nextAttemptAt, now),
        sql`NOT EXISTS (
    SELECT 1 FROM ai_interview_report_receipt earlier
    WHERE earlier.conversation_id = ${aiInterviewReportReceipt.conversationId}
      AND earlier.status = 'pending'
      AND (earlier.created_at, earlier.id) < (${aiInterviewReportReceipt.createdAt}, ${aiInterviewReportReceipt.id})
  )`,
      ),
    )
    .returning();
  if (!receipt) {
    return;
  }
  try {
    const data = reportPayloadSchema.parse(receipt.payload);
    const options = {
      conversationId: data.conversationId,
      interviewRecordId: data.interviewRecordId,
    };
    if (receipt.status === "pending") {
      const accepted = await dependencies.persistReport({
        data,
        isNewTranscript: false,
        keyInformationColumnsAvailable: true,
        now,
        organizationId: receipt.organizationId,
      });
      if (!accepted) {
        await db
          .update(aiInterviewReportReceipt)
          .set({ lastError: null, processedAt: new Date(), status: "archived" })
          .where(eq(aiInterviewReportReceipt.id, id));
        return;
      }
      await db
        .update(aiInterviewReportReceipt)
        .set({ status: "applied" })
        .where(eq(aiInterviewReportReceipt.id, id));
    }
    // Core evidence and completed state have already committed. Any failure below
    // leaves the immutable receipt retryable, including notification SQL errors.
    await dependencies.createInterviewEvidenceSnapshot(options);
    dependencies.safeUpdateTag(dependencies.cacheTags.studioInterviews(receipt.organizationId));
    dependencies.safeUpdateTag(
      dependencies.cacheTags.interviewConversationsByRecord(data.interviewRecordId),
    );
    dependencies.safeUpdateTag(dependencies.cacheTags.interviewConversations);
    void runAnalyses(dependencies, options, id);
    if (isInterviewNotificationFlowEnabled()) {
      await db.transaction(async (tx) => {
        const locked = await lockAiRound(tx, data.scheduleEntryId, receipt.organizationId);
        if (locked?.isEffective && locked.round.conversationId === data.conversationId) {
          await enqueueAiInterviewCompletedEvent(tx, { scheduleEntryId: data.scheduleEntryId });
        }
      });
    }
    await db
      .update(aiInterviewReportReceipt)
      .set({ lastError: null, processedAt: new Date(), status: "processed" })
      .where(eq(aiInterviewReportReceipt.id, id));
  } catch (error) {
    await db
      .update(aiInterviewReportReceipt)
      .set({
        lastError: error instanceof Error ? error.name : "ProcessingError",
        nextAttemptAt: new Date(Date.now() + RETRY_DELAY_MS),
      })
      .where(eq(aiInterviewReportReceipt.id, id));
    console.error("[agent-report] receipt processing deferred", {
      errorName: error instanceof Error ? error.name : "ProcessingError",
      receiptId: id,
    });
  }
}

export async function receiveAgentReport(
  data: ReportPayload,
  dependencies: AgentRouterDependencies,
): Promise<void> {
  const organizationId = await dependencies.resolveOrgFromInterview(data.interviewRecordId);
  const id = createHash("sha256")
    .update(organizationId)
    .update(stableStringify(jsonValueSchema.parse(data)))
    .digest("hex");
  // Validate ownership while the round is locked; receipt identifiers remain as
  // historical evidence even if the round is subsequently removed.
  await db.transaction(async (tx) => {
    const locked = await lockAiRound(tx, data.scheduleEntryId, organizationId);
    if (!locked || locked.record.id !== data.interviewRecordId) {
      throw new Error("Report round ownership mismatch");
    }
    await tx
      .insert(aiInterviewReportReceipt)
      .values({
        aiRoundId: data.scheduleEntryId,
        conversationId: data.conversationId,
        id,
        organizationId,
        payload: z.record(z.string(), z.json()).parse(data),
        recruitingRecordId: data.interviewRecordId,
      })
      .onConflictDoNothing({ target: aiInterviewReportReceipt.id });
  });
  // A process exit cannot lose this work: the Worker drains the persistent inbox.
  await processReceipt(id, dependencies).catch(() => {
    console.error("[agent-report] receipt awaits recovery", { receiptId: id });
  });
}

export async function retryAgentReportReceipts(
  dependencies: AgentRouterDependencies,
): Promise<void> {
  const pending = await db
    .select({ id: aiInterviewReportReceipt.id })
    .from(aiInterviewReportReceipt)
    .where(
      and(
        inArray(aiInterviewReportReceipt.status, ["pending", "applied"]),
        lte(aiInterviewReportReceipt.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(aiInterviewReportReceipt.createdAt))
    .limit(20);
  for (const receipt of pending) {
    await processReceipt(receipt.id, dependencies);
  }
}
