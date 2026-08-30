import { RESUME_REVIEW_DIMENSIONS } from "@arc/shared/resume-review";
import type {
  ActionConfusion,
  EvalSliceMetrics,
  PerJobMetrics,
  ResumeReviewEvalMetrics,
  ResumeReviewEvalSample,
  ScoreBin,
} from "./types";

const probability = (sample: ResumeReviewEvalSample) => sample.baseScore / 100;

function actionConfusion(samples: ResumeReviewEvalSample[]): ActionConfusion {
  const result: ActionConfusion = {
    negative: { hold: 0, interview: 0, reject: 0 },
    positive: { hold: 0, interview: 0, reject: 0 },
  };
  for (const sample of samples) {
    result[sample.label][sample.action] += 1;
  }
  return result;
}

function rocAuc(samples: ResumeReviewEvalSample[]): number | null {
  const positives = samples.filter((sample) => sample.label === "positive");
  const negatives = samples.filter((sample) => sample.label === "negative");
  if (!(positives.length && negatives.length)) {
    return null;
  }
  let favorablePairs = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive.baseScore > negative.baseScore) {
        favorablePairs += 1;
      } else if (positive.baseScore === negative.baseScore) {
        favorablePairs += 0.5;
      }
    }
  }
  return favorablePairs / (positives.length * negatives.length);
}

function averagePrecision(samples: ResumeReviewEvalSample[]): number | null {
  const positives = samples.filter((sample) => sample.label === "positive").length;
  if (!(positives && positives < samples.length)) {
    return null;
  }
  const sorted = [...samples].toSorted((a, b) => b.baseScore - a.baseScore);
  let seenPositives = 0;
  let precisionSum = 0;
  for (const [index, sample] of sorted.entries()) {
    if (sample.label === "positive") {
      seenPositives += 1;
      precisionSum += seenPositives / (index + 1);
    }
  }
  return precisionSum / positives;
}

function expectedCalibrationError(samples: ResumeReviewEvalSample[]): number | null {
  if (!samples.length) {
    return null;
  }
  let weightedError = 0;
  for (let lower = 0; lower < 1; lower += 0.1) {
    const upper = lower + 0.1;
    const bin = samples.filter((sample) => {
      const score = probability(sample);
      return score >= lower && (upper >= 1 ? score <= upper : score < upper);
    });
    if (!bin.length) {
      continue;
    }
    const predicted = bin.reduce((sum, sample) => sum + probability(sample), 0) / bin.length;
    const observed = bin.filter((sample) => sample.label === "positive").length / bin.length;
    weightedError += (bin.length / samples.length) * Math.abs(predicted - observed);
  }
  return weightedError;
}

function f1(truePositive: number, falsePositive: number, falseNegative: number): number {
  const denominator = 2 * truePositive + falsePositive + falseNegative;
  return denominator ? (2 * truePositive) / denominator : 0;
}

function macroF1OnDecided(samples: ResumeReviewEvalSample[]): number | null {
  const decided = samples.filter((sample) => sample.action !== "hold");
  if (
    !decided.some((sample) => sample.label === "positive") ||
    !decided.some((sample) => sample.label === "negative")
  ) {
    return null;
  }
  const positiveTp = decided.filter(
    (sample) => sample.label === "positive" && sample.action === "interview",
  ).length;
  const positiveFp = decided.filter(
    (sample) => sample.label === "negative" && sample.action === "interview",
  ).length;
  const positiveFn = decided.filter(
    (sample) => sample.label === "positive" && sample.action === "reject",
  ).length;
  const negativeTp = decided.filter(
    (sample) => sample.label === "negative" && sample.action === "reject",
  ).length;
  return (f1(positiveTp, positiveFp, positiveFn) + f1(negativeTp, positiveFn, positiveFp)) / 2;
}

function computeSlice(samples: ResumeReviewEvalSample[]): EvalSliceMetrics {
  const positiveCount = samples.filter((sample) => sample.label === "positive").length;
  const negativeCount = samples.length - positiveCount;
  let squaredError = 0;
  for (const sample of samples) {
    const actual = sample.label === "positive" ? 1 : 0;
    squaredError += (probability(sample) - actual) ** 2;
  }
  return {
    actionConfusion: actionConfusion(samples),
    averagePrecision: averagePrecision(samples),
    brierScore: samples.length ? squaredError / samples.length : null,
    decisionCoverage: samples.length
      ? samples.filter((sample) => sample.action !== "hold").length / samples.length
      : 0,
    ece: expectedCalibrationError(samples),
    macroF1OnDecided: macroF1OnDecided(samples),
    negativeCount,
    positiveCount,
    rocAuc: rocAuc(samples),
    sampleCount: samples.length,
  };
}

function perJob(samples: ResumeReviewEvalSample[]): PerJobMetrics[] {
  const groups = new Map<string, ResumeReviewEvalSample[]>();
  for (const sample of samples) {
    groups.set(sample.jobDescriptionId, [...(groups.get(sample.jobDescriptionId) ?? []), sample]);
  }
  return [...groups.entries()]
    .map(([jobDescriptionId, values]) => {
      const hired = values.filter((sample) => sample.labelReason === "hired");
      return {
        averagePrecision: averagePrecision(values),
        hiredCount: hired.length,
        hiredRejectCount: hired.filter((sample) => sample.action === "reject").length,
        jobDescriptionId,
        negativeCount: values.filter((sample) => sample.label === "negative").length,
        positiveCount: values.filter((sample) => sample.label === "positive").length,
        rocAuc: rocAuc(values),
        sampleCount: values.length,
      };
    })
    .toSorted((a, b) => a.jobDescriptionId.localeCompare(b.jobDescriptionId));
}

function scoreBins(samples: ResumeReviewEvalSample[]): ScoreBin[] {
  const boundaries = [0, 50, 60, 70, 80, 90] as const;
  return boundaries.flatMap((lowerBound, index) => {
    const upperBound = index === boundaries.length - 1 ? 100 : boundaries[index + 1] - 1;
    const values = samples.filter(
      (sample) => sample.baseScore >= lowerBound && sample.baseScore <= upperBound,
    );
    if (!values.length) {
      return [];
    }
    return [
      {
        averagePredictedScore:
          values.reduce((sum, sample) => sum + probability(sample), 0) / values.length,
        lowerBound,
        positiveRate: values.filter((sample) => sample.label === "positive").length / values.length,
        sampleCount: values.length,
        upperBound,
      },
    ];
  });
}

export function computeResumeReviewEvalMetrics(
  samples: ResumeReviewEvalSample[],
): ResumeReviewEvalMetrics {
  const hired = samples.filter((sample) => sample.labelReason === "hired");
  const positives = samples.filter((sample) => sample.label === "positive");
  const dimensionDeltas: ResumeReviewEvalMetrics["dimensionDeltas"] = {};
  for (const dimension of RESUME_REVIEW_DIMENSIONS) {
    const positiveValues = positives.flatMap((sample) => {
      const value = sample.dimensionScores[dimension.key];
      return value === undefined ? [] : [value];
    });
    const negativeValues = samples.flatMap((sample) => {
      const value = sample.dimensionScores[dimension.key];
      return sample.label === "negative" && value !== undefined ? [value] : [];
    });
    const positiveMean = positiveValues.length
      ? positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
      : null;
    const negativeMean = negativeValues.length
      ? negativeValues.reduce((sum, value) => sum + value, 0) / negativeValues.length
      : null;
    dimensionDeltas[dimension.key] = {
      delta: positiveMean === null || negativeMean === null ? null : positiveMean - negativeMean,
      negativeMean,
      positiveMean,
    };
  }

  const hiredRejectCount = hired.filter((sample) => sample.action === "reject").length;
  const positiveRejectCount = positives.filter((sample) => sample.action === "reject").length;
  return {
    all: computeSlice(samples),
    dimensionDeltas,
    guardrails: {
      hiredCount: hired.length,
      hiredRejectCount,
      hiredRejectRate: hired.length ? hiredRejectCount / hired.length : null,
      positiveRejectRate: positives.length ? positiveRejectCount / positives.length : null,
    },
    perJob: perJob(samples),
    scoreBins: scoreBins(samples),
    strong: computeSlice(samples.filter((sample) => sample.labelStrength === "strong")),
  };
}
