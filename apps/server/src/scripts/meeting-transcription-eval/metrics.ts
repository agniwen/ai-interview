import type { CanonicalMeetingTranscript } from "@app/shared/meeting-transcription";
import type {
  BenchmarkEntity,
  BenchmarkInterval,
  MeetingTranscriptionBenchmarkScore,
} from "./types";

interface SpeakerBoundaryEvents {
  addPrediction: string[];
  addReference: string[];
  removePrediction: string[];
  removeReference: string[];
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function chineseCharacters(value: string): string {
  return value.match(/\p{Script=Han}/gu)?.join("") ?? "";
}

// Myers' bit-vector algorithm keeps exact edit distance while scaling to long meeting text.
// oxlint-disable no-bitwise -- BigInt bit vectors are the algorithm's representation.
function levenshtein(leftValue: string, rightValue: string): number {
  if (leftValue === rightValue) {
    return 0;
  }
  let pattern = [...leftValue];
  let text = [...rightValue];
  if (pattern.length > text.length) {
    [pattern, text] = [text, pattern];
  }
  if (pattern.length === 0) {
    return text.length;
  }
  const characterMasks = new Map<string, bigint>();
  for (const [index, character] of pattern.entries()) {
    characterMasks.set(character, (characterMasks.get(character) ?? 0n) | (1n << BigInt(index)));
  }
  const widthMask = (1n << BigInt(pattern.length)) - 1n;
  const highestBit = 1n << BigInt(pattern.length - 1);
  let positive = widthMask;
  let negative = 0n;
  let score = pattern.length;
  for (const character of text) {
    const equal = characterMasks.get(character) ?? 0n;
    const vertical = equal | negative;
    const horizontal = (((equal & positive) + positive) ^ positive) | equal;
    let positiveHorizontal = negative | ~(horizontal | positive);
    let negativeHorizontal = positive & horizontal;
    if ((positiveHorizontal & highestBit) !== 0n) {
      score += 1;
    } else if ((negativeHorizontal & highestBit) !== 0n) {
      score -= 1;
    }
    positiveHorizontal = ((positiveHorizontal << 1n) | 1n) & widthMask;
    negativeHorizontal = (negativeHorizontal << 1n) & widthMask;
    positive = (negativeHorizontal | ~(vertical | positiveHorizontal)) & widthMask;
    negative = positiveHorizontal & vertical;
  }
  return score;
}
// oxlint-enable no-bitwise

function chineseCharacterErrorRate(
  reference: CanonicalMeetingTranscript,
  prediction: CanonicalMeetingTranscript,
): number {
  const expected = chineseCharacters(reference.turns.map((turn) => turn.text).join(""));
  const actual = chineseCharacters(prediction.turns.map((turn) => turn.text).join(""));
  if (expected.length === 0) {
    return actual.length === 0 ? 0 : 1;
  }
  return levenshtein(expected, actual) / expected.length;
}

function entityRecall(
  prediction: CanonicalMeetingTranscript,
  entities: BenchmarkEntity[],
  category: BenchmarkEntity["category"],
): number {
  const expected = entities.filter((entity) => entity.category === category);
  if (expected.length === 0) {
    return 1;
  }
  const text = prediction.turns
    .map((turn) => turn.text)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  const matched = expected.filter((entity) =>
    text.includes(entity.text.normalize("NFKC").toLocaleLowerCase("en-US")),
  ).length;
  return matched / expected.length;
}

function speakerIdentity(turn: CanonicalMeetingTranscript["turns"][number]): string {
  return `${turn.track}:${turn.speakerKey}`;
}

function incrementActiveSpeaker(active: Map<string, number>, value: string): void {
  active.set(value, (active.get(value) ?? 0) + 1);
}

function decrementActiveSpeaker(active: Map<string, number>, value: string): void {
  const next = (active.get(value) ?? 0) - 1;
  if (next <= 0) {
    active.delete(value);
  } else {
    active.set(value, next);
  }
}

// oxlint-disable-next-line complexity -- Hungarian assignment keeps speaker-label mapping globally optimal.
function maximumAssignmentWeight(weights: number[][]): number {
  const size = Math.max(weights.length, weights[0]?.length ?? 0);
  if (size === 0) {
    return 0;
  }
  const maximum = Math.max(0, ...weights.flat());
  const potentialsByRow = Array.from({ length: size + 1 }, () => 0);
  const potentialsByColumn = Array.from({ length: size + 1 }, () => 0);
  const matchedRowByColumn = Array.from({ length: size + 1 }, () => 0);
  const previousColumn = Array.from({ length: size + 1 }, () => 0);
  for (let row = 1; row <= size; row += 1) {
    matchedRowByColumn[0] = row;
    let column = 0;
    const minimum = Array.from({ length: size + 1 }, () => Number.POSITIVE_INFINITY);
    const used = Array.from({ length: size + 1 }, () => false);
    do {
      used[column] = true;
      const currentRow = matchedRowByColumn[column] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate += 1) {
        if (used[candidate]) {
          continue;
        }
        const weight = weights[currentRow - 1]?.[candidate - 1] ?? 0;
        const cost =
          maximum -
          weight -
          (potentialsByRow[currentRow] ?? 0) -
          (potentialsByColumn[candidate] ?? 0);
        if (cost < (minimum[candidate] ?? Number.POSITIVE_INFINITY)) {
          minimum[candidate] = cost;
          previousColumn[candidate] = column;
        }
        if ((minimum[candidate] ?? Number.POSITIVE_INFINITY) < delta) {
          delta = minimum[candidate] ?? Number.POSITIVE_INFINITY;
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate += 1) {
        if (used[candidate]) {
          const usedRow = matchedRowByColumn[candidate] ?? 0;
          potentialsByRow[usedRow] = (potentialsByRow[usedRow] ?? 0) + delta;
          potentialsByColumn[candidate] = (potentialsByColumn[candidate] ?? 0) - delta;
        } else {
          minimum[candidate] = (minimum[candidate] ?? Number.POSITIVE_INFINITY) - delta;
        }
      }
      column = nextColumn;
    } while ((matchedRowByColumn[column] ?? 0) !== 0);
    do {
      const prior = previousColumn[column] ?? 0;
      matchedRowByColumn[column] = matchedRowByColumn[prior] ?? 0;
      column = prior;
    } while (column !== 0);
  }
  let matched = 0;
  for (let column = 1; column <= size; column += 1) {
    const row = matchedRowByColumn[column] ?? 0;
    matched += weights[row - 1]?.[column - 1] ?? 0;
  }
  return matched;
}

function speakerErrorRate(
  evaluationDurationMs: number,
  reference: CanonicalMeetingTranscript,
  prediction: CanonicalMeetingTranscript,
): number {
  const startMs = 0;
  const endMs = evaluationDurationMs;
  if (!Number.isFinite(endMs) || endMs <= 0) {
    return 0;
  }
  const referenceSpeakers = new Set(reference.turns.map(speakerIdentity));
  const predictionSpeakers = new Set(prediction.turns.map(speakerIdentity));
  if (referenceSpeakers.size > 64 || predictionSpeakers.size > 64) {
    return 1;
  }
  const events = new Map<number, SpeakerBoundaryEvents>();
  const eventAt = (atMs: number) => {
    const existing = events.get(atMs);
    if (existing) {
      return existing;
    }
    const created: SpeakerBoundaryEvents = {
      addPrediction: [],
      addReference: [],
      removePrediction: [],
      removeReference: [],
    };
    events.set(atMs, created);
    return created;
  };
  const addEvents = (transcript: CanonicalMeetingTranscript, kind: "Prediction" | "Reference") => {
    for (const turn of transcript.turns) {
      const clippedStart = Math.max(startMs, turn.startMs);
      const clippedEnd = Math.min(endMs, turn.endMs);
      if (clippedEnd <= clippedStart) {
        continue;
      }
      eventAt(clippedStart)[`add${kind}`].push(speakerIdentity(turn));
      eventAt(clippedEnd)[`remove${kind}`].push(speakerIdentity(turn));
    }
  };
  addEvents(reference, "Reference");
  addEvents(prediction, "Prediction");
  const activeReference = new Map<string, number>();
  const activePrediction = new Map<string, number>();
  const pairWeights = new Map<string, number>();
  let referenceSpeakerTime = 0;
  let maximumActiveSpeakerTime = 0;
  const points = [...events.keys()].toSorted((left, right) => left - right);
  for (const [index, point] of points.entries()) {
    const event = events.get(point);
    if (!event) {
      continue;
    }
    for (const value of event.removeReference) {
      decrementActiveSpeaker(activeReference, value);
    }
    for (const value of event.removePrediction) {
      decrementActiveSpeaker(activePrediction, value);
    }
    for (const value of event.addReference) {
      incrementActiveSpeaker(activeReference, value);
    }
    for (const value of event.addPrediction) {
      incrementActiveSpeaker(activePrediction, value);
    }
    const duration = (points[index + 1] ?? point) - point;
    referenceSpeakerTime += activeReference.size * duration;
    maximumActiveSpeakerTime += Math.max(activeReference.size, activePrediction.size) * duration;
    for (const expectedSpeaker of activeReference.keys()) {
      for (const actualSpeaker of activePrediction.keys()) {
        const key = `${actualSpeaker}\u0000${expectedSpeaker}`;
        pairWeights.set(key, (pairWeights.get(key) ?? 0) + duration);
      }
    }
  }
  const expected = [...referenceSpeakers].toSorted();
  const actual = [...predictionSpeakers].toSorted();
  const weights = actual.map((actualSpeaker) =>
    expected.map(
      (expectedSpeaker) => pairWeights.get(`${actualSpeaker}\u0000${expectedSpeaker}`) ?? 0,
    ),
  );
  const matched = maximumAssignmentWeight(weights);
  if (referenceSpeakerTime === 0) {
    return maximumActiveSpeakerTime > 0 ? 1 : 0;
  }
  return clampRatio((maximumActiveSpeakerTime - matched) / referenceSpeakerTime);
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

function ngramCountsFromGrams(grams: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const gram of grams) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

function textSimilarity(left: string, right: string): number {
  const grams = (value: string) => {
    const characters = [...normalizedText(value)];
    return characters.length < 2
      ? characters
      : characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
  };
  const leftCounts = ngramCountsFromGrams(grams(left));
  const rightCounts = ngramCountsFromGrams(grams(right));
  const leftTotal = [...leftCounts.values()].reduce((total, count) => total + count, 0);
  const rightTotal = [...rightCounts.values()].reduce((total, count) => total + count, 0);
  if (leftTotal + rightTotal === 0) {
    return 1;
  }
  let intersection = 0;
  for (const [gram, count] of leftCounts) {
    intersection += Math.min(count, rightCounts.get(gram) ?? 0);
  }
  return (2 * intersection) / (leftTotal + rightTotal);
}

interface AlignedTurns {
  actual: CanonicalMeetingTranscript["turns"];
  expected: CanonicalMeetingTranscript["turns"][number];
}

function alignTurnsByContent(
  reference: CanonicalMeetingTranscript,
  prediction: CanonicalMeetingTranscript,
): AlignedTurns[] {
  const aligned: AlignedTurns[] = [];
  for (const track of ["local", "remote"] as const) {
    const expectedTurns = reference.turns.filter((turn) => turn.track === track);
    const actualTurns = prediction.turns.filter((turn) => turn.track === track);
    let cursor = 0;
    for (const expected of expectedTurns) {
      let best: { end: number; similarity: number; start: number } | null = null;
      for (let start = cursor; start < Math.min(actualTurns.length, cursor + 12); start += 1) {
        for (let length = 1; length <= 3 && start + length <= actualTurns.length; length += 1) {
          const group = actualTurns.slice(start, start + length);
          const similarity = textSimilarity(
            expected.text,
            group.map((turn) => turn.text).join(" "),
          );
          if (!best || similarity > best.similarity) {
            best = { end: start + length - 1, similarity, start };
          }
        }
      }
      if (!best || best.similarity < 0.2) {
        aligned.push({ actual: [], expected });
        continue;
      }
      aligned.push({ actual: actualTurns.slice(best.start, best.end + 1), expected });
      cursor = best.start;
    }
  }
  return aligned;
}

function meanTimestampDriftMs(aligned: AlignedTurns[]): number {
  let total = 0;
  let boundaries = 0;
  for (const pair of aligned) {
    const [first] = pair.actual;
    const last = pair.actual.at(-1);
    if (!(first && last)) {
      total += pair.expected.endMs - pair.expected.startMs;
      boundaries += 1;
      continue;
    }
    total +=
      Math.abs(pair.expected.startMs - first.startMs) + Math.abs(pair.expected.endMs - last.endMs);
    boundaries += 2;
  }
  return boundaries === 0 ? 0 : total / boundaries;
}

function ngramCounts(texts: string[]): Map<string, number> {
  const grams: string[] = [];
  for (const text of texts) {
    const characters = [...normalizedText(text)];
    const textGrams =
      characters.length < 2
        ? characters
        : characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
    grams.push(...textGrams);
  }
  return ngramCountsFromGrams(grams);
}

function overlapSpeechLossRate(
  reference: CanonicalMeetingTranscript,
  prediction: CanonicalMeetingTranscript,
  intervals: BenchmarkInterval[],
): number {
  let expectedGrams = 0;
  let coveredGrams = 0;
  for (const interval of intervals) {
    const overlaps = (turn: CanonicalMeetingTranscript["turns"][number]) =>
      turn.startMs < interval.endMs && turn.endMs > interval.startMs;
    const referenceCounts = ngramCounts(interval.referenceTexts);
    const predictionCounts = ngramCounts(
      prediction.turns.filter(overlaps).map((turn) => turn.text),
    );
    for (const [gram, count] of referenceCounts) {
      expectedGrams += count;
      coveredGrams += Math.min(count, predictionCounts.get(gram) ?? 0);
    }
  }
  return expectedGrams === 0 ? 0 : 1 - coveredGrams / expectedGrams;
}

export function scoreMeetingTranscription(input: {
  entities: BenchmarkEntity[];
  evaluationDurationMs: number;
  overlapIntervals: BenchmarkInterval[];
  prediction: CanonicalMeetingTranscript;
  reference: CanonicalMeetingTranscript;
}): MeetingTranscriptionBenchmarkScore {
  const aligned = alignTurnsByContent(input.reference, input.prediction);
  return {
    chineseCharacterErrorRate: chineseCharacterErrorRate(input.reference, input.prediction),
    englishEntityRecall: entityRecall(input.prediction, input.entities, "english"),
    meanTimestampDriftMs: meanTimestampDriftMs(aligned),
    overlapSpeechLossRate: overlapSpeechLossRate(
      input.reference,
      input.prediction,
      input.overlapIntervals,
    ),
    speakerErrorRate: speakerErrorRate(
      input.evaluationDurationMs,
      input.reference,
      input.prediction,
    ),
    technicalEntityRecall: entityRecall(input.prediction, input.entities, "technical"),
  };
}
