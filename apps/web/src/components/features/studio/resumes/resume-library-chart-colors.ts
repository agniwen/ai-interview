/** Shared semantic palette for top-level stages and submenu status distributions. */
export const PIPELINE_COLORS = {
  advanced: "var(--pipeline-human-interview)",
  archived: "var(--muted-foreground)",
  early: "var(--pipeline-screening)",
  failure: "var(--pipeline-closed-rejected)",
  final: "var(--pipeline-offer)",
  middle: "var(--pipeline-ai-interview)",
  success: "var(--pipeline-closed-hired)",
} as const;

const BOARD_FLOW_FALLBACK_COLORS = [
  PIPELINE_COLORS.early,
  PIPELINE_COLORS.middle,
  PIPELINE_COLORS.advanced,
  PIPELINE_COLORS.final,
  PIPELINE_COLORS.success,
] as const;

const BOARD_FLOW_COLORS = new Map<string, string>([
  ["closed:archived", PIPELINE_COLORS.archived],
  ["closed:hired", PIPELINE_COLORS.success],
  ["closed:rejected", PIPELINE_COLORS.failure],
  ["closed:withdrawn", `color-mix(in oklab, ${PIPELINE_COLORS.failure} 68%, var(--muted))`],
  ["interview:ai", PIPELINE_COLORS.middle],
  ["interview:final", PIPELINE_COLORS.final],
  ["interview:second", PIPELINE_COLORS.advanced],
  ["offer:background", PIPELINE_COLORS.final],
  ["offer:income", PIPELINE_COLORS.early],
  ["offer:negotiating", PIPELINE_COLORS.middle],
  ["offer:send", PIPELINE_COLORS.advanced],
  ["onboarding:hired", PIPELINE_COLORS.success],
  ["onboarding:pending", PIPELINE_COLORS.final],
  ["onboarding:withdrawn", PIPELINE_COLORS.failure],
  ["screening:fail", PIPELINE_COLORS.failure],
  ["screening:pass", PIPELINE_COLORS.success],
  ["screening:pending", PIPELINE_COLORS.early],
]);

export function getBoardFlowColor(view: string, index: number) {
  return (
    BOARD_FLOW_COLORS.get(view) ??
    BOARD_FLOW_FALLBACK_COLORS[index % BOARD_FLOW_FALLBACK_COLORS.length]
  );
}
