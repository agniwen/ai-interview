import { createHash } from "node:crypto";
import type { CandidateFormTemplateSnapshot } from "@arc/db-schema/candidate-forms";
import { stableStringify } from "./stable-stringify";

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
