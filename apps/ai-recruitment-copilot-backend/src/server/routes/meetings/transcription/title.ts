import { getMastraModelApiKey } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import {
  generateTextWithMastraAgent,
  titleAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";

const MAX_TITLE_LENGTH = 28;
const MAX_PROMPT_TRANSCRIPT_CHARS = 6000;
const TITLE_QUOTES_REGEX = /["'`“”‘’]/g;
const TITLE_TRAILING_PUNCTUATION_REGEX = /[。！？!?；;，,：:、]+$/g;
const TITLE_WHITESPACE_REGEX = /\s+/g;

function sanitizeMeetingTitle(value: string): string {
  return value
    .replace(TITLE_QUOTES_REGEX, "")
    .replace(TITLE_WHITESPACE_REGEX, " ")
    .trim()
    .replace(TITLE_TRAILING_PUNCTUATION_REGEX, "")
    .slice(0, MAX_TITLE_LENGTH);
}

export function fallbackMeetingTitleFromTranscript(
  transcript: CanonicalMeetingTranscript,
): string | null {
  const firstMeaningfulTurn = transcript.turns.find((turn) => turn.text.trim().length > 1);
  return firstMeaningfulTurn ? sanitizeMeetingTitle(firstMeaningfulTurn.text) || null : null;
}

export async function generateMeetingTitleFromTranscript(
  transcript: CanonicalMeetingTranscript,
): Promise<string | null> {
  const fallback = fallbackMeetingTitleFromTranscript(transcript);
  if (!(fallback && getMastraModelApiKey())) {
    return fallback;
  }
  const content = transcript.turns
    .map((turn) => `${turn.speakerKey}: ${turn.text.trim()}`)
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, MAX_PROMPT_TRANSCRIPT_CHARS);
  try {
    const generated = await generateTextWithMastraAgent({
      agent: titleAgent,
      maxOutputTokens: 48,
      prompt: `根据以下完整会议转录内容生成一个中文会议标题。
要求：
- 只输出标题，不要解释
- 8 到 16 个字，最长不超过 28 字
- 概括会议的核心主题或关键事项
- 不使用“会议记录”“会议讨论”等空泛表述
- 不要标点结尾

会议转录：
${content}`,
      temperature: 0.2,
    });
    return sanitizeMeetingTitle(generated) || fallback;
  } catch {
    return fallback;
  }
}
