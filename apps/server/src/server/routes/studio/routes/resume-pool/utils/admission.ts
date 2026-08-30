import type { ResumePoolInitialRecruitmentStage } from "@arc/shared/resume-pool";

interface ResumePoolAdmissionSource {
  id: string;
  organizationId: string | null;
  resumeParseStatus: string;
}

interface ResumePoolAdmissionInput {
  dedupPolicy: "check" | "force";
  importedBy: string;
  initialRecruitmentStage?: ResumePoolInitialRecruitmentStage;
  jobDescriptionId: string | null;
  organizationId: string;
  poolItemId: string;
  reimport?: boolean;
}

interface ResumePoolAdmissionKey {
  organizationId: string;
  resumeRecordId: string;
}

export interface ResumePoolAdmissionDeps<TSource extends ResumePoolAdmissionSource, TMatch> {
  cloneSemanticIndex: (
    input: ResumePoolAdmissionKey & {
      poolItemId: string;
      sourceOrganizationId: string;
    },
  ) => Promise<void>;
  ensureAdmissionRecord: (input: {
    admission: ResumePoolAdmissionInput;
    source: TSource;
  }) => Promise<string>;
  findDuplicateMatches: (input: {
    admission: ResumePoolAdmissionInput;
    existingResumeRecordId: string | null;
    source: TSource;
  }) => Promise<TMatch[]>;
  loadExistingAdmissionRecord: (input: ResumePoolAdmissionInput) => Promise<string | null>;
  loadSource: (input: ResumePoolAdmissionInput) => Promise<TSource | null>;
  markAdmissionFailed: (input: ResumePoolAdmissionKey & { errorMessage: string }) => Promise<void>;
  markAdmissionReady: (input: ResumePoolAdmissionKey) => Promise<void>;
  replaceDuplicateSnapshot: (
    input: ResumePoolAdmissionKey & { matches: TMatch[] },
  ) => Promise<void>;
}

export type ResumePoolAdmissionResult<TMatch> =
  | { matches: TMatch[]; status: "duplicate_found" }
  | { resumeRecordId: string; status: "imported" };

export async function admitResumePoolItem<TSource extends ResumePoolAdmissionSource, TMatch>(
  input: ResumePoolAdmissionInput,
  deps: ResumePoolAdmissionDeps<TSource, TMatch>,
): Promise<ResumePoolAdmissionResult<TMatch>> {
  const source = await deps.loadSource(input);
  if (!source) {
    throw new Error("简历池记录不存在或无权访问");
  }
  if (source.resumeParseStatus !== "ready") {
    throw new Error("简历解析完成后才能入库");
  }

  const existingResumeRecordId = input.reimport
    ? null
    : await deps.loadExistingAdmissionRecord(input);
  const matches = await deps.findDuplicateMatches({
    admission: input,
    existingResumeRecordId,
    source,
  });
  if (input.dedupPolicy === "check" && matches.length > 0) {
    return { matches, status: "duplicate_found" };
  }

  const resumeRecordId =
    existingResumeRecordId ?? (await deps.ensureAdmissionRecord({ admission: input, source }));
  const key = { organizationId: input.organizationId, resumeRecordId };
  try {
    await deps.cloneSemanticIndex({
      ...key,
      poolItemId: source.id,
      sourceOrganizationId: source.organizationId ?? input.organizationId,
    });
    await deps.replaceDuplicateSnapshot({ ...key, matches });
    await deps.markAdmissionReady(key);
    return { resumeRecordId, status: "imported" };
  } catch (error) {
    await deps.markAdmissionFailed({
      ...key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
