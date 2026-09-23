import { z } from "zod";

export const hrStatisticStages = [
  "resumes",
  "screening",
  "ai_interview",
  "second_interview",
  "final_interview",
  "offer_negotiation",
  "pending_onboarding",
  "hired",
] as const;

export type HrStatisticStage = (typeof hrStatisticStages)[number];
export const hrStatisticPeriodSchema = z.enum([
  "week",
  "last_week",
  "month",
  "last_month",
  "quarter",
  "last_quarter",
  "custom",
]);
export type HrStatisticPeriod = z.infer<typeof hrStatisticPeriodSchema>;

export function hrStatisticToday(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(date);
}

export const hrStatisticsQuerySchema = z
  .object({
    departmentIds: z.string().optional(),
    from: z.iso.date().optional(),
    jdIds: z.string().optional(),
    period: hrStatisticPeriodSchema.default("week"),
    responsibleHrIds: z.string().optional(),
    to: z.iso.date().optional(),
  })
  .refine((value) => value.period !== "custom" || Boolean(value.from && value.to), {
    message: "自定义范围需选择开始和结束日期。",
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "开始日期不能晚于结束日期。",
  })
  .refine((value) => value.period !== "custom" || !value.from || value.from <= hrStatisticToday(), {
    message: "开始日期不能晚于今天。",
  });

export interface HrStatisticWindow {
  from: string;
  to: string;
  start: string;
  end: string;
}

export interface HrStatisticRanges {
  current: HrStatisticWindow;
  previous: HrStatisticWindow;
  comparison:
    | "complete_week"
    | "complete_month"
    | "complete_quarter"
    | "same_progress"
    | "equal_days";
}

function addDays(value: string, days: number): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function dayOfWeek(value: string): number {
  return (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function addMonths(value: string, months: number): string {
  const date = new Date(`${monthStart(value)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthEnd(value: string): string {
  return addDays(addMonths(value, 1), -1);
}

function quarterStart(value: string): string {
  const month = Number(value.slice(5, 7));
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${value.slice(0, 4)}-${String(firstMonth).padStart(2, "0")}-01`;
}

function quarterEnd(value: string): string {
  return addDays(addMonths(quarterStart(value), 3), -1);
}

function atStart(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`);
}

function atEnd(value: string): Date {
  return atStart(addDays(value, 1));
}

function window(from: string, to: string, end = atEnd(to)): HrStatisticWindow {
  return { end: end.toISOString(), from, start: atStart(from).toISOString(), to };
}

interface HrStatisticDates {
  from: string;
  to: string;
}

function selectedDates(
  selection: { period: HrStatisticPeriod; from?: string; to?: string },
  today: string,
): HrStatisticDates {
  const weekStart = addDays(today, -dayOfWeek(today));
  switch (selection.period) {
    case "week": {
      return { from: weekStart, to: addDays(weekStart, 6) };
    }
    case "last_week": {
      const from = addDays(weekStart, -7);
      return { from, to: addDays(from, 6) };
    }
    case "month": {
      const from = monthStart(today);
      return { from, to: monthEnd(from) };
    }
    case "last_month": {
      const from = addMonths(today, -1);
      return { from, to: monthEnd(from) };
    }
    case "quarter": {
      const from = quarterStart(today);
      return { from, to: quarterEnd(from) };
    }
    case "last_quarter": {
      const from = addMonths(quarterStart(today), -3);
      return { from, to: quarterEnd(from) };
    }
    case "custom": {
      const { from, to } = selection;
      if (!(from && to)) {
        throw new Error("自定义范围需选择开始和结束日期。");
      }
      return { from, to };
    }
    default: {
      throw new Error("未知时间范围。");
    }
  }
}

export function resolveHrStatisticRanges(
  selection: { period: HrStatisticPeriod; from?: string; to?: string },
  now = new Date(),
): HrStatisticRanges {
  const today = hrStatisticToday(now);
  const { from, to } = selectedDates(selection, today);
  if (selection.period === "custom" && from > today) {
    throw new Error("开始日期不能晚于今天。");
  }
  const currentEnd = to >= today ? now : atEnd(to);
  const complete = to < today;
  const fullQuarter = from === quarterStart(from) && to === quarterEnd(from);
  const fullMonth = from === monthStart(from) && to === monthEnd(from);
  const fullWeek = dayOfWeek(from) === 0 && to === addDays(from, 6);
  let previousFrom: string;
  let previousTo: string;
  let comparison: HrStatisticRanges["comparison"];
  if (fullQuarter) {
    previousFrom = addMonths(from, -3);
    previousTo = quarterEnd(previousFrom);
    comparison = complete ? "complete_quarter" : "same_progress";
  } else if (fullMonth) {
    previousFrom = addMonths(from, -1);
    previousTo = monthEnd(previousFrom);
    comparison = complete ? "complete_month" : "same_progress";
  } else if (fullWeek) {
    previousFrom = addDays(from, -7);
    previousTo = addDays(to, -7);
    comparison = complete ? "complete_week" : "same_progress";
  } else {
    const days = Math.round((atStart(to).getTime() - atStart(from).getTime()) / 86_400_000) + 1;
    previousTo = addDays(from, -1);
    previousFrom = addDays(previousTo, 1 - days);
    comparison = to >= today ? "same_progress" : "equal_days";
  }
  let previousEnd = atEnd(previousTo);
  if (!complete) {
    const elapsed = now.getTime() - atStart(from).getTime();
    previousEnd = new Date(
      Math.min(previousEnd.getTime(), atStart(previousFrom).getTime() + elapsed),
    );
  }
  return {
    comparison,
    current: window(from, to, currentEnd),
    previous: window(previousFrom, previousTo, previousEnd),
  };
}

export function hrStageRatio(counts: readonly number[], index: number): number | null {
  if (index === 0 || !counts[index - 1]) {
    return null;
  }
  return (counts[index] / counts[index - 1]) * 100;
}

export interface HrStatisticEntry {
  at: string;
  candidateName: string;
  departmentId: string | null;
  hrId: string | null;
  id: string;
  jobId: string | null;
  metric: HrStatisticStage;
  recordId: string | null;
}

export interface HrStatisticCounts {
  hrId: string | null;
  name: string;
  counts: number[];
  ratios: (number | null)[];
}

export interface HrStatisticResult {
  comparison: HrStatisticRanges["comparison"];
  current: HrStatisticWindow;
  details: HrStatisticEntry[];
  hr: HrStatisticCounts[];
  previous: HrStatisticWindow;
  previousDetails: HrStatisticEntry[];
  team: {
    count: number;
    change: number | null;
    previousRatio: number | null;
    ratio: number | null;
    stage: HrStatisticStage;
  }[];
}

export interface HrStatisticsResponse extends HrStatisticResult {
  limitedVisibility: boolean;
  facets: {
    departments: { id: string; label: string }[];
    jobs: { id: string; label: string }[];
    recruiters: { id: string; label: string }[];
  };
}

export function aggregateHrStatistics(
  entries: HrStatisticEntry[],
  ranges: HrStatisticRanges,
  names: Map<string, string>,
  filters: { departmentIds?: string[]; hrIds?: string[]; jobIds?: string[] } = {},
): HrStatisticResult {
  const first = new Map<string, HrStatisticEntry>();
  for (const entry of entries) {
    const key = `${entry.metric}:${entry.recordId ?? entry.id}`;
    const previous = first.get(key);
    if (!previous || entry.at < previous.at) {
      first.set(key, entry);
    }
  }
  const selected = [...first.values()].filter(
    (entry) =>
      (!filters.departmentIds?.length ||
        Boolean(entry.departmentId && filters.departmentIds.includes(entry.departmentId))) &&
      (!filters.jobIds?.length || Boolean(entry.jobId && filters.jobIds.includes(entry.jobId))) &&
      (!filters.hrIds?.length || Boolean(entry.hrId && filters.hrIds.includes(entry.hrId))),
  );
  const current = selected.filter(
    (entry) => entry.at >= ranges.current.start && entry.at < ranges.current.end,
  );
  const previous = selected.filter(
    (entry) => entry.at >= ranges.previous.start && entry.at < ranges.previous.end,
  );
  const counts = (rows: HrStatisticEntry[]) =>
    hrStatisticStages.map((stage) => rows.filter((entry) => entry.metric === stage).length);
  const currentCounts = counts(current);
  const previousCounts = counts(previous);
  const hrIds = [...new Set(current.map((entry) => entry.hrId))];
  const hr = hrIds
    .map((hrId) => {
      const rowCounts = counts(current.filter((entry) => entry.hrId === hrId));
      return {
        counts: rowCounts,
        hrId,
        name: hrId ? (names.get(hrId) ?? "离职或未知 HR") : "历史归属待核验",
        ratios: rowCounts.map((_, index) => hrStageRatio(rowCounts, index)),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return {
    comparison: ranges.comparison,
    current: ranges.current,
    details: current.toSorted((a, b) => b.at.localeCompare(a.at)),
    hr,
    previous: ranges.previous,
    previousDetails: previous.toSorted((a, b) => b.at.localeCompare(a.at)),
    team: hrStatisticStages.map((stage, index) => {
      const ratio = hrStageRatio(currentCounts, index);
      const previousRatio = hrStageRatio(previousCounts, index);
      return {
        change: ratio === null || previousRatio === null ? null : ratio - previousRatio,
        count: currentCounts[index],
        previousRatio,
        ratio,
        stage,
      };
    }),
  };
}
