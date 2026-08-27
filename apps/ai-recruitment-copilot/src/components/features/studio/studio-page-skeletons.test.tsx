import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DashboardPageSkeleton,
  GlobalConfigPageSkeleton,
  InterviewDetailPageSkeleton,
  JobDescriptionsPageSkeleton,
  MembersPageSkeleton,
  PermissionsPageSkeleton,
  ProfilePageSkeleton,
  RecruitingPageSkeleton,
  ResumePoolPageSkeleton,
  StudioTablePageSkeleton,
} from "./studio-page-skeletons";

describe("Studio page skeletons", () => {
  it.each([
    ["招聘台", () => <RecruitingPageSkeleton />],
    ["人才库", () => <ResumePoolPageSkeleton />],
    ["AI 面试", () => <StudioTablePageSkeleton label="AI 面试" summary />],
    ["数据看板", () => <DashboardPageSkeleton />],
    ["岗位设置", () => <JobDescriptionsPageSkeleton />],
    ["个人中心", () => <ProfilePageSkeleton />],
    ["工作区管理", () => <MembersPageSkeleton />],
    ["权限管理", () => <PermissionsPageSkeleton />],
    ["上下文设置", () => <GlobalConfigPageSkeleton />],
    ["面试详情", () => <InterviewDetailPageSkeleton />],
  ])("renders an accessible %s loading state", (label, createSkeleton) => {
    const html = renderToStaticMarkup(createSkeleton());

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`aria-label="${label}加载中"`);
  });

  it("matches the responsive layout relationships of the real pages", () => {
    const recruiting = renderToStaticMarkup(<RecruitingPageSkeleton />);
    const resumePool = renderToStaticMarkup(<ResumePoolPageSkeleton />);
    const dashboard = renderToStaticMarkup(<DashboardPageSkeleton />);
    const profile = renderToStaticMarkup(<ProfilePageSkeleton />);
    const jobDescriptions = renderToStaticMarkup(<JobDescriptionsPageSkeleton />);
    const permissions = renderToStaticMarkup(<PermissionsPageSkeleton />);

    expect(recruiting).toContain("lg:grid-cols-3");
    expect(recruiting.match(/data-slot="metrics-card-skeleton"/g)).toHaveLength(3);
    expect(recruiting.match(/data-slot="metrics-card-body-skeleton"/g)).toHaveLength(3);
    expect(recruiting).toContain('data-slot="resume-library-card-skeleton"');
    expect(recruiting).toContain("h-[395px] pb-3 sm:h-[314px]");
    expect(recruiting).toContain("xl:h-[219px] 2xl:h-[217px]");
    expect(recruiting).not.toContain("h-12 w-full sm:w-32");
    expect(recruiting).not.toContain("h-9 w-full rounded-lg sm:w-60");
    expect(recruiting.indexOf('data-slot="filter-control-skeleton"')).toBeLessThan(
      recruiting.indexOf('data-slot="clear-filter-skeleton"'),
    );
    expect(recruiting.indexOf('data-slot="clear-filter-skeleton"')).toBeLessThan(
      recruiting.indexOf('data-slot="refresh-skeleton"'),
    );
    expect(recruiting).toContain('data-slot="date-group-header-skeleton"');
    expect(resumePool).toContain('data-slot="date-group-header-skeleton"');
    expect(resumePool).toContain('data-slot="resume-pool-card-skeleton"');
    expect(resumePool).toContain('data-slot="resume-pool-card-skeleton-avatar"');
    expect(resumePool).toContain("h-[356px]");
    expect(resumePool).toContain("2xl:h-[218px]");
    expect(dashboard).toContain("grid-cols-2 gap-4 xl:grid-cols-4");
    expect(dashboard).toContain("xl:grid-cols-[minmax(0,1fr)_24rem]");
    expect(dashboard.match(/data-slot="dashboard-panel-skeleton"/g)).toHaveLength(6);
    expect(dashboard).toContain("h-72 w-full");
    const tablePage = renderToStaticMarkup(<StudioTablePageSkeleton />);
    expect(tablePage).toContain('data-slot="pagination-bar-skeleton"');
    expect(tablePage).toContain('data-slot="data-grid-content-skeleton"');
    expect(tablePage).toContain('data-slot="data-grid-skeleton"');
    expect(tablePage.match(/data-slot="table-row"/g)).toHaveLength(11);
    expect(tablePage).not.toContain('data-slot="table-skeleton"');
    expect(profile).toContain("max-w-2xl");
    expect(profile).toContain('data-slot="profile-activity-skeleton"');
    expect(profile.match(/data-slot="profile-settings-group-skeleton"/g)).toHaveLength(3);
    expect(jobDescriptions.match(/data-slot="job-description-chart-skeleton"/g)).toHaveLength(3);
    expect(jobDescriptions).toContain('data-slot="data-grid-content-skeleton"');
    expect(permissions).toContain("min-w-[72rem]");
  });
});
