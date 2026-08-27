import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = join(import.meta.dirname, "../..");
const readRendererSource = (path: string) => readFileSync(join(rendererRoot, path), "utf-8");

describe("desktop cold-load skeletons", () => {
  it("keeps pagination and archive geometry stable without replaying on refetch", () => {
    const pagination = readRendererSource("components/data-grid/parts/pagination-bar.tsx");
    const archive = readRendererSource("components/features/meeting/meeting-trash-view.tsx");

    expect(pagination).toContain("function PaginationBarSkeleton()");
    expect(pagination).toContain("paginationBarClassName");
    expect(pagination).toContain("paginationBarControlsClassName");
    expect(pagination).toContain('data-slot="pagination-bar-skeleton"');
    expect(pagination).toContain('className="h-8 w-[5.5rem]"');
    expect(archive).toContain("placeholderData: keepPreviousData");
    expect(archive).toContain("const isColdLoading = trashQuery.isPending && !paged");
    expect(archive).toContain("<PaginationBarSkeleton />");
    expect(archive).toContain("loading={isColdLoading}");
    expect(archive).toMatch(/<SkeletonReveal[\s\S]*?loading=\{isColdLoading\}/);
  });

  it("matches virtual card row geometry and reveals only the cold list load", () => {
    const list = readRendererSource("components/features/studio/resumes/resume-library-list.tsx");
    const query = readRendererSource(
      "components/features/studio/resumes/use-resume-library-list.ts",
    );

    const skeleton = readRendererSource(
      "components/features/studio/resumes/resume-library-list-skeleton.tsx",
    );

    expect(skeleton).toContain("style={{ height: STUDIO_DATE_GROUP_ROW_HEIGHT }}");
    expect(skeleton).toContain("style={{ height: rowHeight }}");
    expect(skeleton).toContain('data-slot="resume-library-card-skeleton-row"');
    expect(skeleton).toContain("relative flex h-full overflow-hidden rounded-xl border");
    expect(list).not.toContain('Skeleton className="h-44 rounded-xl"');
    expect(list).toContain("const isColdLoading = isInitialLoading && records.length === 0");
    expect(list).toContain("loading={isColdLoading}");
    expect(query).toContain("placeholderData: keepPreviousData");
  });
});
