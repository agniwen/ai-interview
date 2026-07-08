import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio resumes migration", () => {
  it("registers the studio resumes route in the generated route tree", () => {
    expect(readSource("routeTree.gen.ts")).toContain("'/w/$slug/studio/resumes'");
  });

  it("registers the internal recruiter detail route separately from the member review route", () => {
    const routeTree = readSource("routeTree.gen.ts");

    expect(routeTree).toContain("'/resume-review/$slug/$recordId'");
    expect(routeTree).toContain("'/w/$slug/studio/resumes/$recordId'");
  });

  it("keeps the migrated resumes route and page free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.studio.resumes.tsx"),
      readSource("routes/w.$slug.studio.resumes.$recordId.tsx"),
      readSource("routes/resume-review.$slug.$recordId.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:dynamic|navigation|headers|server|cache)/u);
  });

  it("shows a tooltip on unsupported resume preview file icons", () => {
    const source = readSource("components/features/studio/resumes/resume-library-card.tsx");

    expect(source).toContain("UnsupportedResumeDocumentPreviewTooltip");
  });

  it("adds a permission-scoped copy detail link action to resume-library rows", () => {
    const routeSource = readSource("routes/w.$slug.studio.resumes.tsx");
    const cardSource = readSource("components/features/studio/resumes/resume-library-card.tsx");

    expect(routeSource).toContain("copyResumeDetailLink");
    expect(cardSource).toContain("复制详情链接");
    expect(routeSource).toMatch(/`\/resume-review\/\$\{slug\}\/\$\{record\.id\}`/u);
    expect(routeSource).not.toMatch(/`\/w\/\$\{slug\}\/studio\/resumes\/\$\{record\.id\}`/u);
    expect(cardSource).toContain("record.createdBy === currentUserId");
    expect(cardSource).toContain("canCopyResumeDetailLink");
  });

  it("uses a recruiter resume detail page without transition-only wrappers", () => {
    const source = readSource("routes/w.$slug.studio.resumes.$recordId.tsx");
    const listSource = readSource("routes/w.$slug.studio.resumes.tsx");
    const cardSource = readSource("components/features/studio/resumes/resume-library-card.tsx");
    const studioShellSource = readSource("routes/w.$slug.studio.tsx");

    expect(source).toContain('createFileRoute("/w/$slug/studio/resumes/$recordId")');
    expect(source).toContain("StudioPersonDetailPanel");
    expect(source).toContain('accessMode="authed"');
    expect(source).toContain('layoutMode="page"');
    expect(source).not.toContain("ViewTransition");
    expect(source).not.toContain("getResumeDetailTransitionName(recordId)");
    expect(source).not.toContain("getResumeDetailMotionLayoutId(recordId)");
    expect(source).not.toContain("viewTransitionName: transitionName");
    expect(source).not.toContain("viewTransition: true");
    expect(source).not.toContain('share="resume-card-expand"');
    expect(source).toContain("LaunchInterviewDialog");
    expect(source).toContain("TransitionCandidateDialog");
    expect(source).toContain("StudioPersonEditDialog");
    expect(source).toContain("requireStudioPageAccess");
    expect(source).toContain("pendingComponent: RecruiterResumeDetailSkeleton");
    expect(source).toContain("function RecruiterResumeDetailSkeleton()");
    expect(source).toContain("function RecruiterResumeDetailHeaderText(");
    expect(source).toContain('import { Skeleton } from "@/components/ui/skeleton"');
    expect(source).toContain("if (detailQuery.isLoading) {");
    expect(source).toContain("return <RecruiterResumeDetailSkeleton />;");
    expect(source).toContain("<RecruiterResumeDetailHeaderText");
    expect(source).toContain('<Skeleton className="h-8 w-48" />');
    expect(source).toContain('<Skeleton className="mt-2 h-4 w-64 max-w-full" />');
    expect(source).toContain("const locationState = router.state.location.state as");
    expect(source).toContain("locationState.fromRecruiterResumeList");
    expect(source).toContain("router.history.canGoBack()");
    expect(source).toContain("router.history.back();");
    expect(listSource).toContain("Outlet");
    expect(listSource).toContain("useRouterState");
    expect(listSource).toContain("routerState.location.pathname");
    expect(listSource).not.toContain("LayoutGroup");
    expect(listSource).toContain("<Outlet />");
    expect(listSource).not.toContain("startTransition(() => {");
    expect(listSource).toContain('to: "/w/$slug/studio/resumes/$recordId"');
    expect(listSource).toContain("useElementScrollRestoration");
    expect(listSource).toContain("STUDIO_MAIN_SCROLL_RESTORATION_ID");
    expect(listSource).toContain("initialOffset: studioScrollEntry?.scrollY");
    expect(listSource).toContain("fromRecruiterResumeList: true");
    expect(listSource).not.toContain("viewTransition: true");
    expect(listSource).not.toContain("transitionName={getResumeDetailTransitionName(record.id)}");
    expect(studioShellSource).toContain("STUDIO_MAIN_SCROLL_RESTORATION_ID");
    expect(studioShellSource).toContain('"data-scroll-restoration-id"');
    expect(studioShellSource).toContain('} as ComponentProps<"div">');
    expect(cardSource).not.toContain("ViewTransition");
    expect(cardSource).not.toContain("getResumeDetailMotionLayoutId(record.id)");
    expect(cardSource).not.toContain("viewTransitionName: transitionName");
    expect(cardSource).not.toContain('share="resume-card-expand"');
    expect(cardSource).not.toContain("onPrefetchDetail");
  });

  it("uses a standalone member review page with only the detail title in the header", () => {
    const source = readSource("routes/resume-review.$slug.$recordId.tsx");

    expect(source).toContain("StudioPersonDetailPanel");
    expect(source).toContain('accessMode="review"');
    expect(source).toContain('layoutMode="page"');
    expect(source).toContain("shell={({ body, title })");
    expect(source).toContain("<h1");
    expect(source).toContain("{title}");
    expect(source).toContain("ResumeReviewEvaluationBar");
    expect(source).toContain("submitResumeReviewEvaluation");
    expect(source).toContain('createFileRoute("/resume-review/$slug/$recordId")');
    expect(source).toContain("<WorkspaceSlugProvider");
    expect(source).toContain("pb-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(source).not.toContain("UserRoundIcon");
    expect(source).not.toContain("同工作区成员可查看该候选人的简历详情并提交一次评估。");
  });

  it("keeps the review detail page on document scrolling instead of modal internal scrolling", () => {
    const source = readSource("components/features/studio/studio-person-detail-panel.tsx");

    expect(source).toContain('layoutMode = "modal"');
    expect(source).toContain("const canUseTimelineRailScroll");
    expect(source).toContain('layoutMode === "modal"');
    expect(source).toContain('scrollMode={canUseTimelineRailScroll ? "internal" : "page"}');
    expect(source).toContain('canUseTimelineRailScroll ? "xl:overflow-hidden" : undefined');
  });

  it("shows the submitted resume evaluation status instead of disabled action buttons", () => {
    const source = readSource("routes/resume-review.$slug.$recordId.tsx");

    expect(source).toContain("const hasSubmittedEvaluation");
    expect(source).toContain("describeResumeEvaluationStatus(status)");
    expect(source).toContain("评估结果");
    expect(source).toContain("if (hasSubmittedEvaluation) {");
  });
});
