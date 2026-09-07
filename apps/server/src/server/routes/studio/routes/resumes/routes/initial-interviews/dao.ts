import { advanceScreeningRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import {
  recruitingRecord,
  recruitingEvaluationDocument,
  recruitingInitialInterview,
  recruitingInitialInterviewVersion,
} from "@app/db-schema/schema";
import {
  initialInterviewHrEvaluationSchema,
  initialInterviewRolesSchema,
  initialInterviewSnapshotSchema,
  initialInterviewStatusSchema,
  initialInterviewTurnsSchema,
} from "@app/shared/human-initial-interview";
import type {
  HumanInitialInterviewDetail,
  HumanInitialInterviewSummary,
  InitialInterviewRoles,
  InitialInterviewSnapshot,
  InitialInterviewTurn,
} from "@app/shared/human-initial-interview";
import { db } from "../../../../../../../lib/server/db";
import { InitialInterviewError } from "./errors";

export interface InitialInterviewScope {
  organizationId: string;
  recruitingRecordId: string;
}

export function initialInterviewRecordScope(
  table: typeof recruitingInitialInterview | typeof recruitingInitialInterviewVersion,
  scope: InitialInterviewScope,
) {
  return and(
    eq(table.organizationId, scope.organizationId),
    eq(table.recruitingRecordId, scope.recruitingRecordId),
  );
}

export async function withInitialInterviewLock<T>(
  scope: InitialInterviewScope,
  run: () => Promise<T>,
): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const connection = postgres(url, { max: 1 });
  const key = `initial-interview:${scope.organizationId}:${scope.recruitingRecordId}`;
  try {
    await connection`select pg_advisory_lock(hashtextextended(${key}, 0))`;
    return await run();
  } finally {
    await connection.end();
  }
}

export async function loadInitialInterviewDocument(scope: InitialInterviewScope) {
  const [document] = await db
    .select({
      documentId: recruitingEvaluationDocument.documentId,
      documentUrl: recruitingEvaluationDocument.documentUrl,
      status: recruitingEvaluationDocument.status,
    })
    .from(recruitingEvaluationDocument)
    .where(
      and(
        eq(recruitingEvaluationDocument.organizationId, scope.organizationId),
        eq(recruitingEvaluationDocument.recruitingRecordId, scope.recruitingRecordId),
      ),
    )
    .limit(1);
  return document ?? null;
}

export async function requireInitialInterviewOverwrite(
  scope: InitialInterviewScope,
  documentId: string | null,
) {
  const document = await loadInitialInterviewDocument(scope);
  if (document && document.documentId !== documentId) {
    throw new InitialInterviewError("已有飞书评价表，请确认覆盖 HR 初面七项后再生成。");
  }
  if (documentId && document?.documentId !== documentId) {
    throw new InitialInterviewError("飞书评价表已变化，请刷新并重新确认覆盖范围。");
  }
}

export async function loadInitialInterviewVersion(organizationId: string, versionId: string) {
  const [row] = await db
    .select({
      source: recruitingInitialInterview,
      version: recruitingInitialInterviewVersion,
    })
    .from(recruitingInitialInterviewVersion)
    .innerJoin(
      recruitingInitialInterview,
      and(
        eq(recruitingInitialInterview.id, recruitingInitialInterviewVersion.initialInterviewId),
        eq(
          recruitingInitialInterview.organizationId,
          recruitingInitialInterviewVersion.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(recruitingInitialInterviewVersion.id, versionId),
        eq(recruitingInitialInterviewVersion.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    ...row,
    roles: initialInterviewRolesSchema.parse(row.version.roles),
    snapshot: initialInterviewSnapshotSchema.parse(row.source.snapshot),
    turns: initialInterviewTurnsSchema.parse(row.version.transcript.turns),
  };
}

export async function listInitialInterviews(
  scope: InitialInterviewScope,
  initialInterviewId?: string,
): Promise<HumanInitialInterviewDetail[]> {
  const sources = await db
    .select()
    .from(recruitingInitialInterview)
    .where(
      and(
        initialInterviewRecordScope(recruitingInitialInterview, scope),
        initialInterviewId ? eq(recruitingInitialInterview.id, initialInterviewId) : undefined,
      ),
    )
    .orderBy(desc(recruitingInitialInterview.createdAt));
  const versions = sources.length
    ? await db
        .select()
        .from(recruitingInitialInterviewVersion)
        .where(
          and(
            initialInterviewRecordScope(recruitingInitialInterviewVersion, scope),
            initialInterviewId
              ? eq(recruitingInitialInterviewVersion.initialInterviewId, initialInterviewId)
              : undefined,
          ),
        )
        .orderBy(desc(recruitingInitialInterviewVersion.version))
    : [];
  return sources.map((source) => ({
    createdAt: source.createdAt.toISOString(),
    id: source.id,
    recruitingRecordId: source.recruitingRecordId,
    snapshot: initialInterviewSnapshotSchema.parse(source.snapshot),
    versions: versions
      .filter((version) => version.initialInterviewId === source.id)
      .map((version) => ({
        completedAt: version.completedAt?.toISOString() ?? null,
        createdAt: version.createdAt.toISOString(),
        documentId: version.documentId,
        documentUrl: version.documentUrl,
        error: version.error,
        evaluation: version.evaluation
          ? initialInterviewHrEvaluationSchema.parse(version.evaluation)
          : null,
        id: version.id,
        overwriteDocumentId: version.overwriteDocumentId,
        roles: initialInterviewRolesSchema.parse(version.roles),
        status: initialInterviewStatusSchema.parse(version.status),
        turns: initialInterviewTurnsSchema.parse(version.transcript.turns),
        version: version.version,
      })),
  }));
}

export async function listInitialInterviewSummaries(
  scope: InitialInterviewScope,
): Promise<HumanInitialInterviewSummary[]> {
  const sources = await db
    .select({
      createdAt: recruitingInitialInterview.createdAt,
      durationMs: sql<number>`(${recruitingInitialInterview.snapshot}->>'durationMs')::double precision`,
      id: recruitingInitialInterview.id,
      recordedAt: sql<string>`${recruitingInitialInterview.snapshot}->>'recordedAt'`,
      title: sql<string>`${recruitingInitialInterview.snapshot}->>'title'`,
    })
    .from(recruitingInitialInterview)
    .where(initialInterviewRecordScope(recruitingInitialInterview, scope))
    .orderBy(desc(recruitingInitialInterview.createdAt));
  if (!sources.length) {
    return [];
  }
  const versions = await db
    .select({
      completedAt: recruitingInitialInterviewVersion.completedAt,
      createdAt: recruitingInitialInterviewVersion.createdAt,
      documentId: recruitingInitialInterviewVersion.documentId,
      documentUrl: recruitingInitialInterviewVersion.documentUrl,
      error: recruitingInitialInterviewVersion.error,
      id: recruitingInitialInterviewVersion.id,
      initialInterviewId: recruitingInitialInterviewVersion.initialInterviewId,
      overwriteDocumentId: recruitingInitialInterviewVersion.overwriteDocumentId,
      status: recruitingInitialInterviewVersion.status,
      version: recruitingInitialInterviewVersion.version,
    })
    .from(recruitingInitialInterviewVersion)
    .where(initialInterviewRecordScope(recruitingInitialInterviewVersion, scope))
    .orderBy(desc(recruitingInitialInterviewVersion.version));
  return sources.flatMap((source) => {
    const history = versions.filter((version) => version.initialInterviewId === source.id);
    const [latest] = history;
    return latest
      ? [
          {
            ...source,
            createdAt: source.createdAt.toISOString(),
            latestVersion: {
              ...latest,
              completedAt: latest.completedAt?.toISOString() ?? null,
              createdAt: latest.createdAt.toISOString(),
              status: initialInterviewStatusSchema.parse(latest.status),
            },
            versionCount: history.length,
          },
        ]
      : [];
  });
}

export async function saveInitialInterviewSnapshot(
  input: InitialInterviewScope & {
    id: string;
    actorId: string;
    overwriteDocumentId: string | null;
    snapshot: InitialInterviewSnapshot;
  },
) {
  await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(recruitingRecord)
      .where(
        and(
          eq(recruitingRecord.id, input.recruitingRecordId),
          eq(recruitingRecord.organizationId, input.organizationId),
        ),
      )
      .for("update");
    if (!record) {
      throw new InitialInterviewError("招聘记录不存在。", 404);
    }
    if (
      record.outcome !== "in_pipeline" ||
      !["screening", "ai_interview"].includes(record.currentStage)
    ) {
      throw new InitialInterviewError("只能选择简历筛选或 AI 面试阶段的进行中招聘记录。");
    }
    const [document] = await tx
      .select({ id: recruitingEvaluationDocument.recruitingRecordId })
      .from(recruitingEvaluationDocument)
      .where(
        and(
          eq(recruitingEvaluationDocument.recruitingRecordId, input.recruitingRecordId),
          eq(recruitingEvaluationDocument.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    const [existing] = await tx
      .select({ id: recruitingInitialInterview.id })
      .from(recruitingInitialInterview)
      .where(initialInterviewRecordScope(recruitingInitialInterview, input))
      .limit(1);
    if (document || existing) {
      throw new InitialInterviewError(
        "该招聘记录已有评价表或人工初面生成记录，请在招聘台查看或继续处理。",
      );
    }
    if (record.currentStage === "screening") {
      await advanceScreeningRecruitingNodeTx(tx, {
        expectedVersion: record.version,
        operatorId: input.actorId,
        organizationId: input.organizationId,
        recordId: input.recruitingRecordId,
        targetNode: "ai_interview",
      });
    }
    await tx.insert(recruitingInitialInterview).values({
      createdBy: input.actorId,
      id: input.id,
      organizationId: input.organizationId,
      recruitingRecordId: input.recruitingRecordId,
      snapshot: z.record(z.string(), z.json()).parse(input.snapshot),
    });
    await tx.insert(recruitingInitialInterviewVersion).values({
      createdBy: input.actorId,
      id: input.id,
      initialInterviewId: input.id,
      organizationId: input.organizationId,
      overwriteDocumentId: input.overwriteDocumentId,
      recruitingRecordId: input.recruitingRecordId,
      transcript: z.record(z.string(), z.json()).parse({ turns: input.snapshot.turns }),
      version: 1,
    });
  });
}

export async function createInitialInterviewVersion(
  input: InitialInterviewScope & {
    initialInterviewId: string;
    id: string;
    actorId: string;
    overwriteDocumentId: string | null;
    roles: InitialInterviewRoles;
    turns: InitialInterviewTurn[];
  },
) {
  const [latest] = await db
    .select({ version: max(recruitingInitialInterviewVersion.version) })
    .from(recruitingInitialInterviewVersion)
    .where(
      and(
        initialInterviewRecordScope(recruitingInitialInterviewVersion, input),
        eq(recruitingInitialInterviewVersion.initialInterviewId, input.initialInterviewId),
      ),
    );
  await db.insert(recruitingInitialInterviewVersion).values({
    createdBy: input.actorId,
    id: input.id,
    initialInterviewId: input.initialInterviewId,
    organizationId: input.organizationId,
    overwriteDocumentId: input.overwriteDocumentId,
    recruitingRecordId: input.recruitingRecordId,
    roles: input.roles,
    transcript: z.record(z.string(), z.json()).parse({ turns: input.turns }),
    version: (latest?.version ?? 0) + 1,
  });
}

export function listPendingInitialInterviewVersions(limit = 50) {
  return db
    .select({
      organizationId: recruitingInitialInterviewVersion.organizationId,
      versionId: recruitingInitialInterviewVersion.id,
    })
    .from(recruitingInitialInterviewVersion)
    .where(
      inArray(recruitingInitialInterviewVersion.status, ["queued", "identifying", "generating"]),
    )
    .orderBy(asc(recruitingInitialInterviewVersion.createdAt))
    .limit(limit);
}
