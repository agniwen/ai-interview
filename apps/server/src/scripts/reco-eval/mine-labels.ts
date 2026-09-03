import { and, eq, isNotNull } from "drizzle-orm";
import { studioInterview } from "@app/db-schema/schema";
import { db } from "../../lib/server/db/index";
import { labelKey } from "./labels";
import type { PositiveLabel } from "./types";

const ADVANCED = new Set(["written_test", "ai_interview", "human_interview", "offer"]);

export function isMinedPositive(row: {
  outcome: string;
  pipelineStage: string;
  previousStage: string | null;
}): boolean {
  if (row.outcome === "withdrawn" || row.outcome === "archived") {
    return false;
  }
  if (row.outcome === "hired") {
    return true;
  }
  if (ADVANCED.has(row.pipelineStage)) {
    return true;
  }
  return (
    row.outcome === "rejected" && row.previousStage !== null && ADVANCED.has(row.previousStage)
  );
}

export async function mineLabels(organizationId: string): Promise<PositiveLabel[]> {
  const rows = await db
    .select({
      closedMeta: studioInterview.closedMeta,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        isNotNull(studioInterview.jobDescriptionId),
      ),
    );
  return rows.flatMap((row) => {
    if (
      !row.jobDescriptionId ||
      !isMinedPositive({
        outcome: row.outcome,
        pipelineStage: row.pipelineStage,
        previousStage: row.closedMeta?.previousStage ?? null,
      })
    ) {
      return [];
    }
    return [
      {
        candidateId: row.id,
        jobDescriptionId: row.jobDescriptionId,
        label: "positive" as const,
        source: "mined" as const,
      },
    ];
  });
}

export async function loadValidLabelKeys(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: studioInterview.id, jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.organizationId, organizationId),
        isNotNull(studioInterview.jobDescriptionId),
        eq(studioInterview.resumeParseStatus, "ready"),
      ),
    );
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.jobDescriptionId) {
      keys.add(labelKey({ candidateId: row.id, jobDescriptionId: row.jobDescriptionId }));
    }
  }
  return keys;
}
