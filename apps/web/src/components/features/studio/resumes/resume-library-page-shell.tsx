import { getRecruitingBoardPageTitle } from "@app/shared/recruiting-board";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/features/studio/page-header";
import { RecruitingBoardTabs } from "./recruiting-board-tabs";
import type { ResumeLibraryGridState } from "./resume-library-page-model";

export function ResumeLibraryPageShell({
  children,
  fixedRecruitingGroup,
  grid,
  metrics,
}: {
  children: ReactNode;
  fixedRecruitingGroup?: string;
  grid: ResumeLibraryGridState;
  metrics: ResumeLibraryMetrics | undefined;
}) {
  const pageTitle = getRecruitingBoardPageTitle(fixedRecruitingGroup);
  const groupCountRows = metrics?.groupCounts;
  const statusCountRows = metrics?.boardStatusCounts;
  const groupCounts = useMemo(
    () =>
      groupCountRows ? new Map(groupCountRows.map((item) => [item.id, item.count])) : undefined,
    [groupCountRows],
  );
  const viewCounts = useMemo(
    () =>
      statusCountRows ? new Map(statusCountRows.map((item) => [item.view, item.count])) : undefined,
    [statusCountRows],
  );

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader className="items-end sm:items-end" title={pageTitle} />
      <RecruitingBoardTabs
        counts={groupCounts}
        fixedGroupId={fixedRecruitingGroup}
        value={grid.filters.stage}
        viewCounts={viewCounts}
        onChange={(value) => grid.setFilter("stage", value)}
      />
      {children}
    </div>
  );
}
