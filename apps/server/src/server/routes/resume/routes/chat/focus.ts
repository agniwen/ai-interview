import type { RecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";

export type RecruitingCopilotFocusInput = { id: string; kind: "resume_record" } | undefined;

export interface ResolvedRecruitingCopilotFocus {
  id: string;
  kind: "resume_record";
}

interface RecruitingCopilotFocusDeps {
  loadResumeRecord: (input: {
    organizationId: string;
    resumeRecordId: string;
    visibilityScope: RecruitingVisibilityScope;
  }) => Promise<{ id: string } | null>;
}

export async function resolveRecruitingCopilotFocus(
  input: {
    focus: RecruitingCopilotFocusInput;
    organizationId: string;
    visibilityScope: RecruitingVisibilityScope;
  },
  deps: RecruitingCopilotFocusDeps,
): Promise<ResolvedRecruitingCopilotFocus | { kind: "not_found" } | null> {
  if (!input.focus) {
    return null;
  }

  const record = await deps.loadResumeRecord({
    organizationId: input.organizationId,
    resumeRecordId: input.focus.id,
    visibilityScope: input.visibilityScope,
  });
  if (!record) {
    return { kind: "not_found" };
  }

  return {
    id: record.id,
    kind: "resume_record",
  };
}
