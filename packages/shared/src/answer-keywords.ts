import { BUILT_IN_RISK_WORDS, BUILT_IN_SKILLS, METRIC_REGEX } from "./answer-keywords-dictionary";

export type KeywordCategory = "skill" | "metric" | "risk";

export interface KeywordSpan {
  /** JS 字符串下标（UTF-16 code unit），含 / inclusive start. */
  start: number;
  /** 不含；与 String.prototype.slice(start, end) 一致 / exclusive end. */
  end: number;
  text: string;
  category: KeywordCategory;
}

export interface ExtractOptions {
  extraSkills?: string[];
}

const CATEGORY_PRIORITY: Record<KeywordCategory, number> = {
  metric: 1,
  risk: 3,
  skill: 2,
};

const LATIN_CHAR = /[A-Za-z0-9]/;
const HAS_LATIN_LETTER = /[A-Za-z]/;

function buildSkillList(extraSkills?: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of [...BUILT_IN_SKILLS, ...(extraSkills ?? [])]) {
    const term = raw.trim();
    if (!term) {
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    list.push(term);
  }
  return list;
}

function matchSkills(text: string, skills: string[]): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  const haystack = text.toLowerCase();
  for (const term of skills) {
    const needle = term.toLowerCase();
    const latin = HAS_LATIN_LETTER.test(term);
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) {
        break;
      }
      const end = idx + needle.length;
      from = idx + 1;
      if (latin) {
        const before = idx > 0 ? text[idx - 1] : "";
        const after = end < text.length ? text[end] : "";
        if (LATIN_CHAR.test(before) || LATIN_CHAR.test(after)) {
          continue;
        }
      }
      spans.push({ category: "skill", end, start: idx, text: text.slice(idx, end) });
    }
  }
  return spans;
}

function matchMetrics(text: string): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  for (const match of text.matchAll(METRIC_REGEX)) {
    const start = match.index ?? 0;
    spans.push({ category: "metric", end: start + match[0].length, start, text: match[0] });
  }
  return spans;
}

function matchRisks(text: string): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  for (const word of BUILT_IN_RISK_WORDS) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(word, from);
      if (idx === -1) {
        break;
      }
      spans.push({ category: "risk", end: idx + word.length, start: idx, text: word });
      from = idx + 1;
    }
  }
  return spans;
}

function resolveOverlaps(candidates: KeywordSpan[], length: number): KeywordSpan[] {
  const ordered = [...candidates].toSorted((a, b) => {
    const byPriority = CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
    if (byPriority !== 0) {
      return byPriority;
    }
    const byLength = b.end - b.start - (a.end - a.start);
    if (byLength !== 0) {
      return byLength;
    }
    return a.start - b.start;
  });
  const occupied = Array.from({ length }).map(() => false);
  const accepted: KeywordSpan[] = [];
  for (const span of ordered) {
    let free = true;
    for (let i = span.start; i < span.end; i += 1) {
      if (occupied[i]) {
        free = false;
        break;
      }
    }
    if (!free) {
      continue;
    }
    for (let i = span.start; i < span.end; i += 1) {
      occupied[i] = true;
    }
    accepted.push(span);
  }
  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

export function extractAnswerKeywords(text: string, options?: ExtractOptions): KeywordSpan[] {
  if (!text) {
    return [];
  }
  const skills = buildSkillList(options?.extraSkills);
  const candidates = [...matchSkills(text, skills), ...matchMetrics(text), ...matchRisks(text)];
  return resolveOverlaps(candidates, text.length);
}
