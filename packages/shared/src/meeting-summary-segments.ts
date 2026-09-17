interface SummaryTurn {
  endMs: number;
  id: string;
  startMs: number;
  text: string;
}

const sentenceEnd = /[。！？.!?][”’"』」）)]*$/u;
const unfinishedEnding =
  /(?:但是|不过|前提是|条件是|如果|除非|因为|所以|以及|然后|也就是|but|if|unless|because)\s*[，,:：]?$/iu;

/** Soft limits select whole turns; they never silently cut a sentence's text. */
export function selectSummarySegment<T extends SummaryTurn>(turns: T[]): T[] {
  const selected: T[] = [];
  let characters = 0;
  for (const turn of turns) {
    if (selected.length >= 200 || (selected.length > 0 && characters + turn.text.length > 8000)) {
      break;
    }
    selected.push(turn);
    characters += turn.text.length;
    const [first] = selected;
    const reachedTarget = characters >= 1000 || (first && turn.endMs - first.startMs >= 60_000);
    if (
      reachedTarget &&
      sentenceEnd.test(turn.text.trim()) &&
      !unfinishedEnding.test(turn.text.trim())
    ) {
      break;
    }
    // A speaker may never pause or punctuate. Bound the call, retaining overlap for its continuation.
    if (characters >= 2500 && !unfinishedEnding.test(turn.text.trim())) {
      break;
    }
  }
  return selected;
}

export function summarySegmentContext<T extends SummaryTurn>(all: T[], segment: T[]): T[] {
  const [first] = segment;
  if (!first) {
    return [];
  }
  const index = all.findIndex((turn) => turn.id === first.id);
  if (index <= 0) {
    return [];
  }
  const context: T[] = [];
  let characters = 0;
  for (let position = index - 1; position >= 0 && context.length < 3; position -= 1) {
    const turn = all[position];
    if (!turn || characters + turn.text.length > 4000) {
      break;
    }
    context.unshift(turn);
    characters += turn.text.length;
  }
  return context;
}
