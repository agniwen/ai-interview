import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { resumeDuplicateMatch } from "@arc/db-schema/schema";
import type { ResumeSemanticSourceType } from "@arc/db-schema/schema";
import { getResumeSemanticIndexConfig } from "./indexer";

export interface PersistDuplicateMatchesInput {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceId: string;
  matches: DedupMatchRecord[];
  embeddingVersion?: string;
}

export function toDuplicateMatchInsertRows(input: Required<PersistDuplicateMatchesInput>) {
  return input.matches.map((match) => ({
    embeddingVersion: input.embeddingVersion,
    id: crypto.randomUUID(),
    level: match.level ?? "medium",
    matchedSourceId: match.id,
    matchedSourceType: "studio_interview" as const,
    organizationId: input.organizationId,
    reasons: match.semanticReasons ?? [],
    score: Math.round(match.score ?? 0),
    signals: match.conflictingSignals ?? [],
    similarity: match.similarity ?? null,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    status: "active" as const,
  }));
}

export async function replaceDuplicateMatchesForSource(
  input: PersistDuplicateMatchesInput,
): Promise<number> {
  const embeddingVersion =
    input.embeddingVersion ?? getResumeSemanticIndexConfig().embeddingVersion;
  await db
    .delete(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        eq(resumeDuplicateMatch.sourceId, input.sourceId),
        eq(resumeDuplicateMatch.embeddingVersion, embeddingVersion),
        eq(resumeDuplicateMatch.status, "active"),
      ),
    );

  if (input.matches.length === 0) {
    return 0;
  }

  const rows = toDuplicateMatchInsertRows({ ...input, embeddingVersion });
  await db
    .insert(resumeDuplicateMatch)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        level: sql`excluded.level`,
        reasons: sql`excluded.reasons`,
        score: sql`excluded.score`,
        signals: sql`excluded.signals`,
        similarity: sql`excluded.similarity`,
        status: "active",
        updatedAt: new Date(),
      },
      target: [
        resumeDuplicateMatch.organizationId,
        resumeDuplicateMatch.sourceType,
        resumeDuplicateMatch.sourceId,
        resumeDuplicateMatch.matchedSourceType,
        resumeDuplicateMatch.matchedSourceId,
        resumeDuplicateMatch.embeddingVersion,
      ],
    });
  return rows.length;
}

export async function listActiveDuplicateMatchCounts(input: {
  organizationId: string;
  sourceType: ResumeSemanticSourceType;
  sourceIds: string[];
}): Promise<Map<string, { count: number; highestLevel: "high" | "low" | "medium" | null }>> {
  if (input.sourceIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      highestLevel: sql<"high" | "low" | "medium" | null>`
        CASE
          WHEN bool_or(${resumeDuplicateMatch.level} = 'high') THEN 'high'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'medium') THEN 'medium'
          WHEN bool_or(${resumeDuplicateMatch.level} = 'low') THEN 'low'
          ELSE NULL
        END
      `,
      sourceId: resumeDuplicateMatch.sourceId,
    })
    .from(resumeDuplicateMatch)
    .where(
      and(
        eq(resumeDuplicateMatch.organizationId, input.organizationId),
        eq(resumeDuplicateMatch.sourceType, input.sourceType),
        inArray(resumeDuplicateMatch.sourceId, input.sourceIds),
        inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
      ),
    )
    .groupBy(resumeDuplicateMatch.sourceId);

  return new Map(rows.map((row) => [row.sourceId, row]));
}
