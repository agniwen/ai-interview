import { Outlet, useRouterState } from "@tanstack/react-router";
import { HomeSidebarSlots } from "@/components/features/home/home-sidebar-slots";
import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";

/**
 * `/recruitment`: 招聘台（简历列表）。应用首页 `/` 会进入新建录制。
 */
export function HomePage(): React.JSX.Element {
  const isOverlayRoute = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId === "/_app/recruitment/overlay/$recordId",
  });
  return (
    <>
      <HomeSidebarSlots />
      <div
        className="contents"
        aria-hidden={isOverlayRoute || undefined}
        inert={isOverlayRoute || undefined}
      >
        <ResumeLibraryPage isDetailOpen={isOverlayRoute} />
      </div>
      {isOverlayRoute ? <Outlet /> : null}
    </>
  );
}
