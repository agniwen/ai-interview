import type { PositiveLabel } from "./types";

export function labelKey(l: { jobDescriptionId: string; candidateId: string }): string {
  return `${l.jobDescriptionId}::${l.candidateId}`;
}

export interface DedupResult {
  conflicts: number;
  labels: PositiveLabel[];
}

export function dedupeLabels(raw: PositiveLabel[]): DedupResult {
  const map = new Map<string, PositiveLabel>();
  let conflicts = 0;
  for (const r of raw) {
    const k = labelKey(r);
    const cur = map.get(k);
    if (!cur) {
      map.set(k, r);
      continue;
    }
    conflicts += 1;
    if (cur.source === "mined" && r.source === "manual") {
      map.set(k, r);
    }
  }
  return { conflicts, labels: [...map.values()] };
}

export function validateLabels(
  labels: PositiveLabel[],
  validKeys: Set<string>,
): { valid: PositiveLabel[]; invalid: number } {
  const valid = labels.filter((l) => validKeys.has(labelKey(l)));
  return { invalid: labels.length - valid.length, valid };
}
