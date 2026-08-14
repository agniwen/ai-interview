import { formatAppDateTime } from "@/lib/client/datetime";

export function formatResumeRecordDisplayId(id: string): string {
  const text = id.trim();
  if (text.length <= 8) {
    return text;
  }
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

/** Display timestamps in Asia/Shanghai via shared dayjs helpers. */
export function formatLocalDateTime(value: string | null | undefined): string {
  return formatAppDateTime(value);
}

export function getResumeLibraryJobDescriptionLabel(record: {
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
}): string | null {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}
