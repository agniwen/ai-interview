import { describe, expect, it } from "vitest";
import type {
  DashboardActionItem,
  DashboardRecruiterProgressRow,
} from "@app/shared/studio-dashboard";
import {
  getRecruiterDisplayRows,
  getVacancyMetric,
  sortVisibleDashboardActions,
} from "./dashboard-presentation";

describe("dashboard presentation", () => {
  it("does not present an unknown vacancy total as zero", () => {
    expect(getVacancyMetric({ activeJobs: 79, unconfiguredHeadcount: 79, vacancies: 0 })).toEqual({
      description: "79 个岗位未配置计划人数",
      value: "—",
    });
    expect(getVacancyMetric({ activeJobs: 10, unconfiguredHeadcount: 2, vacancies: 4 })).toEqual({
      description: "另有 2 个岗位未配置",
      value: "4+",
    });
    expect(getVacancyMetric({ activeJobs: 10, unconfiguredHeadcount: 0, vacancies: 4 })).toEqual({
      description: "按计划人数",
      value: "4",
    });
  });

  it("keeps every non-zero risk and orders failures first", () => {
    const actions: DashboardActionItem[] = [
      { count: 56, description: "AI", key: "ai_pending", label: "AI", severity: "info" },
      {
        count: 1554,
        description: "筛选",
        key: "screening",
        label: "筛选",
        severity: "warning",
      },
      {
        count: 6,
        description: "通知",
        key: "notification_failed",
        label: "通知失败",
        severity: "danger",
      },
      {
        count: 7,
        description: "复面",
        key: "human_pending",
        label: "复面",
        severity: "warning",
      },
      { count: 0, description: "Offer", key: "offer_sent", label: "Offer", severity: "warning" },
    ];

    expect(sortVisibleDashboardActions(actions).map((item) => item.key)).toEqual([
      "notification_failed",
      "screening",
      "human_pending",
      "ai_pending",
    ]);
  });

  it("disambiguates same-name recruiter accounts without merging their records", () => {
    const rows: DashboardRecruiterProgressRow[] = [
      {
        hired: 0,
        interviewing: 4,
        offerOnboarding: 1,
        pendingActions: 4,
        total: 9,
        userId: "user-abc123",
        userImage: null,
        userName: "艾伦",
        userRemark: null,
      },
      {
        hired: 0,
        interviewing: 1,
        offerOnboarding: 0,
        pendingActions: 0,
        total: 1,
        userId: "user-xyz789",
        userImage: null,
        userName: "艾伦",
        userRemark: "海外招聘",
      },
    ];

    expect(getRecruiterDisplayRows(rows).map((row) => row.accountHint)).toEqual([
      "账号尾号 c123",
      "海外招聘",
    ]);
    expect(getRecruiterDisplayRows(rows).map((row) => row.total)).toEqual([9, 1]);
  });
});
