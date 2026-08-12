import { HomeSidebarSlots } from "@/components/features/home/home-sidebar-slots";
import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";

/**
 * `/recruitment`: 招聘台（简历列表）。应用首页 `/` 会进入新建录制。
 */
export function HomePage(): React.JSX.Element {
  return (
    <>
      <HomeSidebarSlots />
      <ResumeLibraryPage />
    </>
  );
}
