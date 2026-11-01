import { createRouteMask, createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "@/components/layout/not-found-view";
import { RoutePendingView } from "@/components/layout/route-pending-view";
import { getStudioCandidateDetailScrollToTopElement } from "@/components/features/studio/studio-scroll-restoration";
import { getQueryClient } from "@/lib/client/query-client";
import { routeTree } from "./routeTree.gen";

const recruiterResumeOverlayMask = createRouteMask({
  from: "/w/$slug/studio/resumes/overlay/$recordId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/resumes/$recordId",
  unmaskOnReload: true,
});

const resumePoolOverlayMask = createRouteMask({
  from: "/w/$slug/studio/resume-pool/overlay/$recordId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/resume-pool/$recordId",
  unmaskOnReload: true,
});

const humanInterviewDetailOverlayMask = createRouteMask({
  from: "/w/$slug/studio/resumes/overlay/$recordId/human-interviews/$roundId/meetings/$meetingId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/resumes/$recordId/human-interviews/$roundId/meetings/$meetingId",
  unmaskOnReload: true,
});

const jobDescriptionEditorMask = createRouteMask({
  from: "/w/$slug/studio/job-descriptions/overlay/$jobId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/job-descriptions/$jobId",
  unmaskOnReload: true,
});
const interviewQuestionEditorMask = createRouteMask({
  from: "/w/$slug/studio/question-bank/interview-questions/overlay/$templateId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/question-bank/interview-questions/$templateId",
  unmaskOnReload: true,
});

const candidateFormEditorMask = createRouteMask({
  from: "/w/$slug/studio/question-bank/forms/overlay/$templateId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/question-bank/forms/$templateId",
  unmaskOnReload: true,
});

function DefaultNotFoundComponent() {
  return <NotFoundPage />;
}

function DefaultPendingComponent() {
  return <RoutePendingView />;
}

export function getRouter() {
  const queryClient = getQueryClient();
  const router = createRouter({
    context: { queryClient },
    defaultNotFoundComponent: DefaultNotFoundComponent,
    defaultPendingComponent: DefaultPendingComponent,
    defaultPendingMinMs: 300,
    defaultPendingMs: 350,
    defaultPreload: "intent",
    notFoundMode: "root",
    routeMasks: [
      recruiterResumeOverlayMask,
      resumePoolOverlayMask,
      humanInterviewDetailOverlayMask,
      jobDescriptionEditorMask,
      interviewQuestionEditorMask,
      candidateFormEditorMask,
    ],
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: [getStudioCandidateDetailScrollToTopElement],
  });

  setupRouterSsrQueryIntegration({ queryClient, router });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
