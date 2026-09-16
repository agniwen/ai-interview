import { recruitingRecordReadModel as record } from "@app/database/recruiting-read-model";
import { aiInterviewRound, humanInterviewRound, recruitingOffer } from "@app/db-schema/schema";
import type { DashboardRecruitingActionScope } from "@app/shared/studio-dashboard";
import { and, eq, exists, inArray, isNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";

function hasAiRoundStatus(status: "interrupted" | "pending") {
  return exists(
    db
      .select({ one: aiInterviewRound.id })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.recruitingRecordId, record.id),
          eq(aiInterviewRound.organizationId, record.organizationId),
          eq(aiInterviewRound.status, status),
        ),
      ),
  );
}

const hasPendingHumanRound = exists(
  db
    .select({ one: humanInterviewRound.id })
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.recruitingRecordId, record.id),
        eq(humanInterviewRound.organizationId, record.organizationId),
        eq(humanInterviewRound.roundKind, record.pipelineStage),
        eq(humanInterviewRound.status, "pending"),
      ),
    ),
);

const hasSentOffer = exists(
  db
    .select({ one: recruitingOffer.id })
    .from(recruitingOffer)
    .where(
      and(
        eq(recruitingOffer.recruitingRecordId, record.id),
        eq(recruitingOffer.organizationId, record.organizationId),
        eq(recruitingOffer.status, "sent"),
      ),
    ),
);

export function buildDashboardActionFilter(
  scope: DashboardRecruitingActionScope | null | undefined,
): SQL | null {
  switch (scope) {
    case "screening": {
      return (
        and(
          eq(record.pipelineStage, "screening"),
          eq(record.outcome, "in_pipeline"),
          isNull(record.result),
        ) ?? null
      );
    }
    case "ai_pending": {
      return (
        and(
          eq(record.pipelineStage, "ai_interview"),
          eq(record.outcome, "in_pipeline"),
          hasAiRoundStatus("pending"),
        ) ?? null
      );
    }
    case "ai_interrupted": {
      return (
        and(
          eq(record.pipelineStage, "ai_interview"),
          eq(record.outcome, "in_pipeline"),
          hasAiRoundStatus("interrupted"),
        ) ?? null
      );
    }
    case "human_pending": {
      return (
        and(
          inArray(record.pipelineStage, ["second_interview", "final_interview"]),
          eq(record.outcome, "in_pipeline"),
          hasPendingHumanRound,
        ) ?? null
      );
    }
    case "offer_sent": {
      return (
        and(eq(record.pipelineStage, "offer"), eq(record.outcome, "in_pipeline"), hasSentOffer) ??
        null
      );
    }
    default: {
      return null;
    }
  }
}
