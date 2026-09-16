import type { DashboardCumulativeFunnel } from "@app/shared/studio-dashboard";

import { DASHBOARD_COLORS } from "./dashboard-colors";

const FUNNEL_META = [
  { color: DASHBOARD_COLORS.resumes.background, key: "resumesAdded", label: "简历入库" },
  { color: DASHBOARD_COLORS.ai.background, key: "enteredInterview", label: "进入面试" },
  { color: DASHBOARD_COLORS.human.background, key: "enteredSecondInterview", label: "进入复面" },
  { color: DASHBOARD_COLORS.offer.background, key: "enteredOffer", label: "进入 Offer" },
  { color: DASHBOARD_COLORS.hired.background, key: "hired", label: "已入职" },
] as const;

function formatConversion(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";
}

export function getDashboardFunnelRows(funnel: DashboardCumulativeFunnel) {
  return FUNNEL_META.map((stage, index) => {
    const count = funnel[stage.key];
    const previousStage = FUNNEL_META[index - 1];
    const conversionBase = previousStage ? funnel[previousStage.key] : count;
    return {
      ...stage,
      conversion: formatConversion(count, conversionBase),
      conversionBase,
      count,
    };
  });
}
