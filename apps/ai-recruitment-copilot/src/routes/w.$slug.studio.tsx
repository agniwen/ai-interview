import type { ReactNode } from "react";
import { Outlet, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SiteHeader } from "@/components/features/studio/site-header";
import { StudioSidebarSlots } from "@/components/features/studio/studio-sidebar-slots";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { getStudioPageAccessState } from "@/lib/start/auth-session";
import type { StudioPagePermissionAction } from "@/lib/start/auth-session-types";

const STUDIO_PAGE_PATHS = [
  { action: "resumes", path: "/resumes" },
  { action: "resumePool", path: "/resume-pool" },
  { action: "interviews", path: "/interviews" },
  { action: "dashboard", path: "/dashboard" },
  { action: "departments", path: "/departments" },
  { action: "interviewers", path: "/interviewers" },
  { action: "jobDescriptions", path: "/job-descriptions" },
  { action: "forms", path: "/forms" },
  { action: "interviewQuestions", path: "/interview-questions" },
  { action: "me", path: "/me" },
  { action: "members", path: "/members" },
  { action: "mailIngestAccounts", path: "/mail-ingest-accounts" },
  { action: "agentDebug", path: "/agent-debug" },
  { action: "permissions", path: "/permissions" },
  { action: "globalConfig", path: "/global-config" },
] as const satisfies readonly {
  action: StudioPagePermissionAction;
  path: string;
}[];

function findStudioPageByPath(pathname: string, slug: string) {
  const studioBasePath = `/w/${slug}/studio`;
  const relativePath = pathname.slice(studioBasePath.length) || "/";
  return STUDIO_PAGE_PATHS.find(
    (item) => relativePath === item.path || relativePath.startsWith(`${item.path}/`),
  );
}

async function findFirstAllowedStudioPath(slug: string) {
  for (const item of STUDIO_PAGE_PATHS) {
    const state = await getStudioPageAccessState({ data: { action: item.action, slug } });
    if (state.status === "ready" && state.allowed) {
      return item.path;
    }
  }
  return null;
}

function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StudioSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1.5rem)] border border-border">
        <ScrollArea className="@container/main min-h-0 flex-1 bg-background" scrollbars="never">
          <SiteHeader />
          <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
            {children}
          </PendingOutlet>
        </ScrollArea>
      </SidebarInset>
    </>
  );
}

function StudioShellRoute() {
  return (
    <StudioLayout>
      <Outlet />
    </StudioLayout>
  );
}

export const Route = createFileRoute("/w/$slug/studio")({
  component: StudioShellRoute,
  head: () => ({
    meta: [
      {
        content: "Studio 管理后台。",
        name: "description",
      },
      { title: "Studio" },
    ],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as {
      location: { pathname: string };
      params: { slug: string };
    };

    if (location.pathname === `/w/${params.slug}/studio`) {
      const fallbackPath = await findFirstAllowedStudioPath(params.slug);
      if (!fallbackPath) {
        throw notFound();
      }
      throw redirect({ href: `/w/${params.slug}/studio${fallbackPath}` });
    }

    const requestedPage = findStudioPageByPath(location.pathname, params.slug);
    if (!requestedPage) {
      return null;
    }

    const state = await getStudioPageAccessState({
      data: { action: requestedPage.action, slug: params.slug },
    });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(location.pathname)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    if (!state.allowed) {
      throw notFound();
    }

    return null;
  },
});
