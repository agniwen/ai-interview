import type { DatasetRecord } from "@mastra/client-js";
import type { DatasetTargetType } from "../target-type-options";
import { DATASET_TARGET_TYPE_OPTIONS, isDatasetTargetType } from "../target-type-options";

export type DatasetTargetFilter = "all" | "none" | DatasetTargetType;

// 'none' surfaces legacy/untyped datasets (created before targetType was persisted) so they can be
// found and classified instead of silently disappearing under a type filter.
export const DATASET_TARGET_OPTIONS = [
  { label: "All targets", value: "all" },
  ...DATASET_TARGET_TYPE_OPTIONS,
  { label: "No target", value: "none" },
] as const satisfies readonly { value: DatasetTargetFilter; label: string }[];

/** Target-filter predicate for the Datasets list. `targetTypes` comes from
 *  `getDatasetTargetTypes` (explicit type, or derived from experiments). */
export function matchesDatasetTargetFilter(
  targetTypes: readonly DatasetTargetType[],
  targetFilter: string,
): boolean {
  if (targetFilter === "all") {
    return true;
  }
  if (targetFilter === "none") {
    return targetTypes.length === 0;
  }
  return isDatasetTargetType(targetFilter) && targetTypes.includes(targetFilter);
}

export const DATASET_EXPERIMENT_OPTIONS = [
  { label: "All datasets", value: "all" },
  { label: "With experiments", value: "with" },
  { label: "Without experiments", value: "without" },
] as const;

/** `targetType` is persisted by create/edit flows and is the source of truth.
 *  When absent, `getDatasetTargetTypes` falls back to the distinct target type(s)
 *  from the dataset's experiments so legacy/imported datasets can still be
 *  classified. Returns one type when known, several when experiments span types. */
export function getDatasetTargetTypes(
  targetType: string | null | undefined,
  experiments: { targetType?: string | null }[],
): DatasetTargetType[] {
  if (isDatasetTargetType(targetType)) {
    return [targetType];
  }
  // Sorted so the derived list renders in a stable order regardless of experiment order.
  return [...new Set(experiments.map((e) => e.targetType).filter(isDatasetTargetType))].toSorted();
}

export function getDatasetTagOptions(datasets: DatasetRecord[]) {
  const tagSet = new Set<string>();

  for (const dataset of datasets) {
    if (!Array.isArray(dataset.tags)) {
      continue;
    }

    for (const tag of dataset.tags as string[]) {
      tagSet.add(tag);
    }
  }

  return [
    { label: "All tags", value: "all" },
    ...[...tagSet].toSorted().map((tag) => ({ label: tag, value: tag })),
  ];
}
