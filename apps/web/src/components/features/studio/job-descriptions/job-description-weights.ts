import type { JobDescriptionDimensionWeights } from "@app/db-schema/job-description-structured-config";

export const JOB_DESCRIPTION_DIMENSIONS = [
  { color: "var(--job-weight-skill)", key: "skillMatch", label: "技能" },
  { color: "var(--job-weight-experience)", key: "experienceRelevance", label: "经验" },
  { color: "var(--job-weight-project)", key: "projectMatch", label: "项目" },
  { color: "var(--job-weight-education)", key: "educationBackground", label: "学历" },
  { color: "var(--job-weight-potential)", key: "potential", label: "潜力" },
  { color: "var(--job-weight-stability)", key: "stability", label: "稳定" },
] as const satisfies readonly {
  color: string;
  key: keyof JobDescriptionDimensionWeights;
  label: string;
}[];

function getDimensionWeightValues(weights: JobDescriptionDimensionWeights): number[] {
  return JOB_DESCRIPTION_DIMENSIONS.map(({ key }) => weights[key]);
}

export function getDimensionWeightBoundaries(weights: JobDescriptionDimensionWeights): number[] {
  const values = getDimensionWeightValues(weights);
  let cumulative = 0;
  return values.slice(0, -1).map((weight) => {
    cumulative += weight;
    return cumulative;
  });
}

export function moveDimensionWeightBoundary(
  weights: JobDescriptionDimensionWeights,
  boundaryIndex: number,
  requestedBoundary: number,
): JobDescriptionDimensionWeights {
  const values = getDimensionWeightValues(weights);
  const weightBeforePair = values.slice(0, boundaryIndex).reduce((sum, weight) => sum + weight, 0);
  const pairTotal = (values[boundaryIndex] ?? 0) + (values[boundaryIndex + 1] ?? 0);
  const roundedBoundary = Math.round(requestedBoundary);
  const nextLeftWeight = Math.max(0, Math.min(pairTotal, roundedBoundary - weightBeforePair));
  const nextValues = [...values];
  nextValues[boundaryIndex] = nextLeftWeight;
  nextValues[boundaryIndex + 1] = pairTotal - nextLeftWeight;

  return {
    educationBackground: nextValues[3] ?? 0,
    experienceRelevance: nextValues[1] ?? 0,
    potential: nextValues[4] ?? 0,
    projectMatch: nextValues[2] ?? 0,
    skillMatch: nextValues[0] ?? 0,
    stability: nextValues[5] ?? 0,
  };
}
