import "server-only";

import { createHash } from "node:crypto";
import type { CandidateFormTemplateSnapshot } from "@/lib/shared/candidate-forms";

// 与候选人作答 schema 共用的稳定 stringify。键序排序后输出，保证内容相同
// 但键序不同的对象哈希一致。
// Stable stringify shared with the answer schema. Sorts object keys so two
// objects with the same content but different key order hash identically.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) => {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  });
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",")}}`;
}

/**
 * Content hash of a snapshot — stable across key order and identity. Excludes
 * `templateId` so two templates with identical content under the same id get
 * the same hash (which is what dedup cares about: "did the user-visible
 * content change").
 */
export function hashTemplateSnapshot(snapshot: CandidateFormTemplateSnapshot): string {
  const { templateId: _templateId, ...rest } = snapshot;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}
