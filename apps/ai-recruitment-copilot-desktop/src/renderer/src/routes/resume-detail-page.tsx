import { HomeSidebarSlots } from "@/components/features/home/home-sidebar-slots";
import { ResumeDetailPage } from "@/components/features/studio/resumes/resume-detail-page";

/**
 * Page-level 招聘台候选人详情（对齐 web `/w/$slug/studio/resumes/$recordId`）。
 */
export function ResumeDetailRoutePage(): React.JSX.Element {
  return (
    <>
      <HomeSidebarSlots />
      <ResumeDetailPage />
    </>
  );
}
