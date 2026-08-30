import type { JsonValue } from "@arc/db-schema/json";
import type { ResumeReview } from "@arc/db-schema/resume-review";
import { qualitativeResumeEvaluationSchema } from "@arc/db-schema/qualitative-resume-evaluation";
import type {
  QualitativeResumeEvaluation,
  ResumeEvaluationContractMode,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeEvaluationV1 } from "@arc/db-schema/structured-resume-evaluation";
import { z } from "zod";

export const PRE_QUALITATIVE_CURRENT_ARCHIVE_RUN_ID = "archive:pre-qualitative-current";

const structuredContractMetadataSchema = z.object({
  engine: z.object({
    engineVersion: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
  }),
  schemaVersion: z.number().int().positive(),
});

const legacyContractMetadataSchema = z.object({
  schemaVersion: z.number().int().positive(),
});

type PersistedEvaluationArtifact =
  | JsonValue
  | QualitativeResumeEvaluation
  | ResumeReview
  | StructuredResumeEvaluationV1;

interface CurrentEvaluationForArchive {
  notes: string | null;
  qualitativeJobDescriptionVersionId: string | null;
  qualitativeResumeEvaluation: PersistedEvaluationArtifact | null;
  resumeEvaluationArtifactMode: ResumeEvaluationContractMode | null;
  resumeReview: PersistedEvaluationArtifact | null;
  resumeReviewGeneratedAt: Date | string | null;
  structuredCompositeScore: number | null;
  structuredResumeEvaluation: PersistedEvaluationArtifact | null;
}

export function deriveResumeEvaluationContractVersion(
  mode: ResumeEvaluationContractMode,
  artifact: PersistedEvaluationArtifact,
): string {
  if (mode === "qualitative") {
    const parsed = qualitativeResumeEvaluationSchema.safeParse(artifact);
    return parsed.success ? `qualitative-v${parsed.data.schemaVersion}` : "qualitative-unknown";
  }
  if (mode === "structured") {
    const parsed = structuredContractMetadataSchema.safeParse(artifact);
    if (!parsed.success) {
      return "structured-unknown";
    }
    return [
      `structured-v${parsed.data.schemaVersion}`,
      `engine=${parsed.data.engine.engineVersion}`,
      `prompt=${parsed.data.engine.promptVersion}`,
    ].join(":");
  }
  const parsed = legacyContractMetadataSchema.safeParse(artifact);
  return parsed.success ? `legacy-resume-review-v${parsed.data.schemaVersion}` : "legacy-unknown";
}

export function buildPreQualitativeEvaluationArchive(input: {
  organizationId: string;
  record: CurrentEvaluationForArchive;
  resumeRecordId: string;
}) {
  const { record } = input;
  const inferredMode = structuredResumeEvaluationV1Schema.safeParse(
    record.structuredResumeEvaluation,
  ).success
    ? "structured"
    : "legacy";
  const mode = record.resumeEvaluationArtifactMode ?? inferredMode;
  if (mode === "qualitative") {
    return null;
  }
  const artifact =
    mode === "structured"
      ? record.structuredResumeEvaluation
      : (record.resumeReview ?? (record.notes ? { notes: record.notes } : null));
  if (!artifact) {
    return null;
  }
  return {
    // SAFETY: persisted evaluation artifacts and the legacy notes wrapper are JSON-compatible.
    artifact: artifact as JsonValue,
    contractVersion: deriveResumeEvaluationContractVersion(mode, artifact),
    createdAt: record.resumeReviewGeneratedAt
      ? new Date(record.resumeReviewGeneratedAt)
      : new Date(),
    id: crypto.randomUUID(),
    jobDescriptionVersionId: record.qualitativeJobDescriptionVersionId,
    numericScore: mode === "structured" ? record.structuredCompositeScore : null,
    organizationId: input.organizationId,
    recommendationLevel: null,
    resumeRecordId: input.resumeRecordId,
    runId: PRE_QUALITATIVE_CURRENT_ARCHIVE_RUN_ID,
  };
}
