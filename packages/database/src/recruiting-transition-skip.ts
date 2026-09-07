import type { RecruitingNode } from "@app/db-schema/schema";

export function getRecruitingTransitionSkipIssue(
  targetNode: RecruitingNode,
  skipped: Set<RecruitingNode>,
  traversed: RecruitingNode[],
): "outside_transition" | "unsupported_transition" | null {
  if ([...skipped].some((node) => !traversed.includes(node))) {
    return "outside_transition";
  }
  if (skipped.size === 0) {
    return null;
  }
  const onlySkips = (node: RecruitingNode) => skipped.size === 1 && skipped.has(node);
  if (
    (targetNode === "second_interview" && onlySkips("ai_interview")) ||
    (targetNode === "final_interview" && onlySkips("second_interview"))
  ) {
    return null;
  }
  return "unsupported_transition";
}
