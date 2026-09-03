export function formatResumeRecordDisplayId(id: string): string {
  const text = id.trim();
  if (text.length <= 8) {
    return text;
  }
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

export function formatResumeCandidateTitle(name: string, id: string): string {
  return `${name} (${formatResumeRecordDisplayId(id)})`;
}
