import type { StudioPersonDetailTab } from "./studio-person-detail-model";

/** 仅匹配当前候选人及当前 tab 的查询，不刷新其他候选人或列表。 */
export function matchesDetailRefresh(
  key: readonly unknown[],
  input: { slug: string; recordId: string; tab: StudioPersonDetailTab; roundIds: string[] },
): boolean {
  if (key[1] !== input.slug) {
    return false;
  }
  if (key[0] === "studio-resumes") {
    if (key[3] !== input.recordId) {
      return false;
    }
    if (key[2] === "timeline" || key[4] === "meetings") {
      return input.tab === "overview";
    }
    return key[2] === "detail";
  }
  if (input.tab === "rounds") {
    if (key[0] === "studio-resume-rounds") {
      return key[2] === input.recordId;
    }
    return (
      [
        "studio-interview-round",
        "studio-interview-round-reports",
        "studio-interview-round-form-submissions",
      ].includes(String(key[0])) && input.roundIds.includes(String(key[2]))
    );
  }
  if (input.tab === "human-interview") {
    return (
      [
        "human-interview-rounds",
        "human-interview-meetings",
        "human-interview-meeting-detail",
      ].includes(String(key[0])) && key[2] === input.recordId
    );
  }
  if (input.tab === "ai-analysis") {
    return key[0] === "resume-evaluation-history" && key[2] === input.recordId;
  }
  return input.tab === "offer" && key[0] === "offer-drafts" && key[2] === input.recordId;
}
