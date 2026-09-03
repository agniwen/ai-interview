export function normalizeHumanInterviewEvaluationText(value: string): string {
  return value.trim() || "-";
}

export function normalizeHumanInterviewProfessionalSkill(value: string): string {
  const normalized = normalizeHumanInterviewEvaluationText(value);
  if (normalized === "-") {
    return normalized;
  }
  if (normalized.startsWith("优")) {
    return "优";
  }
  if (normalized.startsWith("良")) {
    return "良";
  }
  if (normalized.startsWith("中") || normalized.startsWith("一般")) {
    return "中";
  }
  if (
    normalized.startsWith("差") ||
    normalized.startsWith("较差") ||
    normalized.startsWith("不足")
  ) {
    return "差";
  }
  return "-";
}
