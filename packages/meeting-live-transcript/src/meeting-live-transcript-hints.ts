import type { MeetingLiveTranscriptHints } from "@arc/shared/meeting-transcription";

export interface RecruitingTranscriptHintSource {
  candidateName: string;
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
  resumeSkills: string[];
  targetRole: string | null;
}

const MAX_CONTEXT_CHARS = 400;
const MAX_HOTWORDS = 30;
const HOTWORD_WEIGHT = 4 as const;

function canUseAsHotword(value: string): boolean {
  const compact = value.trim();
  if (!compact) {
    return false;
  }
  if (/^[\u0020-\u007E]+$/.test(compact)) {
    return compact.split(/\s+/u).length <= 7;
  }
  return [...compact].length <= 15;
}

/** Build meeting-scoped hints from data already visible on the recording setup page. */
export function createMeetingLiveTranscriptHints(
  input: RecruitingTranscriptHintSource,
): MeetingLiveTranscriptHints {
  const fields = [
    ["候选人", input.candidateName],
    ["目标岗位", input.targetRole],
    ["岗位", input.jobDescriptionName],
    ["部门", input.jobDescriptionDepartmentName],
    ["重点术语", input.resumeSkills.join("、")],
  ] as const;
  const context = fields
    .flatMap(([label, raw]) => {
      const value = raw?.trim();
      return value ? [`${label}：${value}`] : [];
    })
    .join("；")
    .slice(0, MAX_CONTEXT_CHARS);
  const vocabulary: MeetingLiveTranscriptHints["vocabulary"] = {};
  const candidates = [
    input.candidateName,
    input.targetRole,
    input.jobDescriptionName,
    input.jobDescriptionDepartmentName,
    ...input.resumeSkills,
  ];
  for (const raw of candidates) {
    const word = raw?.trim();
    if (!word || !canUseAsHotword(word) || Object.hasOwn(vocabulary, word)) {
      continue;
    }
    vocabulary[word] = HOTWORD_WEIGHT;
    if (Object.keys(vocabulary).length >= MAX_HOTWORDS) {
      break;
    }
  }
  return { context: context ? [context] : [], vocabulary };
}
