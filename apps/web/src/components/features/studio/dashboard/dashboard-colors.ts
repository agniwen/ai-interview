// Keep milestone, activity, and summary colors aligned with the shared chart palette.
export const DASHBOARD_COLORS = {
  ai: { accent: "bg-chart-2/15 text-chart-2", background: "bg-chart-2", fill: "var(--chart-2)" },
  hired: { accent: "bg-chart-3/15 text-chart-3", background: "bg-chart-3", fill: "var(--chart-3)" },
  human: { accent: "bg-chart-5/15 text-chart-5", background: "bg-chart-5", fill: "var(--chart-5)" },
  offer: { accent: "bg-chart-4/15 text-chart-4", background: "bg-chart-4", fill: "var(--chart-4)" },
  resumes: {
    accent: "bg-chart-1/15 text-chart-1",
    background: "bg-chart-1",
    fill: "var(--chart-1)",
  },
} as const;
