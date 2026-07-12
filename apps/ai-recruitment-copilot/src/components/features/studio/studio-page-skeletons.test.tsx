import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AgentDebugPageSkeleton,
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
    ["招聘", () => <RecruitingPageSkeleton />],
    ["人才库", () => <ResumePoolPageSkeleton />],
    ["AI 面试", () => <StudioTablePageSkeleton label="AI 面试" summary />],
    ["数据看板", () => <DashboardPageSkeleton />],
    ["岗位设置", () => <JobDescriptionsPageSkeleton />],
    ["我的信息", () => <ProfilePageSkeleton />],
    ["工作区管理", () => <MembersPageSkeleton />],
    ["Agent 调试", () => <AgentDebugPageSkeleton />],
    ["权限管理", () => <PermissionsPageSkeleton />],
    ["系统设置", () => <GlobalConfigPageSkeleton />],
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
    const permissions = renderToStaticMarkup(<PermissionsPageSkeleton />);

    expect(recruiting).toContain("lg:grid-cols-3");
    expect(recruiting).toContain("h-44 w-full");
    expect(resumePool).toContain("lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4");
    expect(dashboard).toContain("grid-cols-2 gap-4 xl:grid-cols-4");
    expect(dashboard).toContain("xl:grid-cols-[minmax(0,1fr)_24rem]");
    expect(profile).toContain("lg:grid-cols-2");
    expect(profile).toContain("min-h-[34rem]");
    expect(permissions).toContain("min-w-[72rem]");
  });
});
