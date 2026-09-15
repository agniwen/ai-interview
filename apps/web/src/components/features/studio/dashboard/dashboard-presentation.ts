import type {
  DashboardActionItem,
  DashboardRecruiterProgressRow,
} from "@app/shared/studio-dashboard";

const ACTION_SEVERITY_ORDER = {
  danger: 0,
  info: 2,
  warning: 1,
} as const;

export interface DashboardVacancyMetric {
  description: string;
  value: string;
}

export function getVacancyMetric({
  activeJobs,
  unconfiguredHeadcount,
  vacancies,
}: {
  activeJobs: number;
  unconfiguredHeadcount: number;
  vacancies: number;
}): DashboardVacancyMetric {
  if (activeJobs > 0 && unconfiguredHeadcount === activeJobs) {
    return { description: `${unconfiguredHeadcount} 个岗位未配置计划人数`, value: "—" };
  }
  if (unconfiguredHeadcount > 0) {
    return { description: `另有 ${unconfiguredHeadcount} 个岗位未配置`, value: `${vacancies}+` };
  }
  return { description: "按计划人数", value: vacancies.toLocaleString("zh-CN") };
}

export function sortVisibleDashboardActions(actions: readonly DashboardActionItem[]) {
  return actions
    .filter((item) => item.count > 0)
    .toSorted(
      (left, right) =>
        ACTION_SEVERITY_ORDER[left.severity] - ACTION_SEVERITY_ORDER[right.severity] ||
        right.count - left.count,
    );
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase("zh-CN");
}

export function getRecruiterDisplayRows(rows: readonly DashboardRecruiterProgressRow[]) {
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeName(row.userName);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return rows.map((row) => {
    const hasDuplicateName = (nameCounts.get(normalizeName(row.userName)) ?? 0) > 1;
    let accountHint: string | null = null;
    if (hasDuplicateName) {
      accountHint =
        row.userRemark?.trim() || (row.userId ? `账号尾号 ${row.userId.slice(-4)}` : "未关联账号");
    }
    return { ...row, accountHint };
  });
}
