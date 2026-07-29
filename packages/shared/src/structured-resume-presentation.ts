import type {
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "./structured-resume-scoring";

interface StructuredResumePrimaryLabelInput {
  gateStatus: StructuredResumeGateStatus;
  grade: StructuredResumeGrade;
  recruiterStatus: "fail" | "pass" | null;
}

export type StructuredResumePrimaryLabel =
  | { kind: "gate"; label: "未通过门槛" | "门槛待核实" }
  | { kind: "grade"; label: "不匹配" | "匹配" | "推荐" }
  | { kind: "recruiter"; label: "不通过" | "通过" };

export function resolveStructuredResumePrimaryLabel(
  input: StructuredResumePrimaryLabelInput,
): StructuredResumePrimaryLabel {
  if (input.recruiterStatus) {
    return {
      kind: "recruiter",
      label: input.recruiterStatus === "pass" ? "通过" : "不通过",
    };
  }
  if (input.gateStatus === "failed") {
    return { kind: "gate", label: "未通过门槛" };
  }
  if (input.gateStatus === "needs_verification") {
    return { kind: "gate", label: "门槛待核实" };
  }
  return {
    kind: "grade",
    label: {
      matched: "匹配",
      recommended: "推荐",
      unmatched: "不匹配",
    }[input.grade] as "不匹配" | "匹配" | "推荐",
  };
}
