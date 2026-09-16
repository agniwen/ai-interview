import type { DashboardCumulativeFunnel } from "@app/shared/studio-dashboard";

const FUNNEL_META = [
  { color: "bg-blue-500", key: "resumesAdded", label: "简历入库" },
  { color: "bg-violet-500", key: "enteredInterview", label: "进入面试" },
  { color: "bg-indigo-500", key: "enteredSecondInterview", label: "进入复面" },
  { color: "bg-amber-500", key: "enteredOffer", label: "进入 Offer" },
  { color: "bg-emerald-500", key: "hired", label: "已入职" },
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
