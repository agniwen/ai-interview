import type { DisplayInterviewTurn } from "@app/shared/interview-transcript-turns";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export interface TranscriptSpeakerLabels {
  candidate: string;
  interviewer: string;
}

/**
 * 把通话内秒数格式化为 m:ss（超过一小时为 h:mm:ss）。
 * Format an in-call offset as m:ss, or h:mm:ss past one hour.
 */
export function formatCallTime(totalSecs: number): string {
  const secs = Math.max(0, Math.floor(totalSecs));
  const hours = Math.floor(secs / SECONDS_PER_HOUR);
  const minutes = Math.floor((secs % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = String(secs % SECONDS_PER_MINUTE).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

/**
 * 找到播放位置所在的那一句：通话时间不晚于当前播放时间的最后一条。
 * Find the turn being played: the last turn whose in-call time is at or before
 * the playback position. Turns without a time are skipped.
 */
export function findPlaybackTurnId(
  turns: readonly DisplayInterviewTurn[],
  currentTimeSecs: number | null,
): string | null {
  if (currentTimeSecs === null) {
    return null;
  }
  let activeId: string | null = null;
  let activeSecs = Number.NEGATIVE_INFINITY;
  for (const turn of turns) {
    const secs = turn.timeInCallSecs;
    if (secs === null || secs === undefined || secs > currentTimeSecs) {
      continue;
    }
    if (secs >= activeSecs) {
      activeId = turn.id;
      activeSecs = secs;
    }
  }
  return activeId;
}

/**
 * 导出纯文本对话：每条一段，“[m:ss] 说话人：内容”，没有通话时间的省略时间前缀。
 * Plain-text export: one paragraph per turn as "[m:ss] Speaker: text"; turns
 * without an in-call time omit the prefix.
 */
export function buildTranscriptText(
  turns: readonly DisplayInterviewTurn[],
  labels: TranscriptSpeakerLabels,
): string {
  return turns
    .map((turn) => {
      const speaker = turn.role === "user" ? labels.candidate : labels.interviewer;
      const time =
        turn.timeInCallSecs === null || turn.timeInCallSecs === undefined
          ? ""
          : `[${formatCallTime(turn.timeInCallSecs)}] `;
      return `${time}${speaker}：${turn.message.trim()}`;
    })
    .join("\n\n");
}
