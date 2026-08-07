import { HomeSidebarSlots } from "@/components/features/home/home-sidebar-slots";
import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";

/**
 * Default authenticated home: 招聘台 (resume library), read-only list.
 */
export function HomePage(): React.JSX.Element {
  return (
    <>
      <HomeSidebarSlots />
      <ResumeLibraryPage />
    </>
  );
}
