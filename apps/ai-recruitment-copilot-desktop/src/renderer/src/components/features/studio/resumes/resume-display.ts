export function formatResumeRecordDisplayId(id: string): string {
  const text = id.trim();
  if (text.length <= 8) {
    return text;
  }
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getResumeLibraryJobDescriptionLabel(record: {
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
}): string | null {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}
