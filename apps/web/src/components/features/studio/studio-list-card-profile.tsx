import type {
  ResumeLibraryProfileSnapshot,
  ResumeLibraryProfileSnapshotLine,
} from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 列表卡片骨架（招聘台 / 人才库共用）：每块都是“固定槽位 × 固定行高”，卡片高度只取决于断点。
 * - <xl：单列，标题 / 元信息 / 经历条（md 起）/ 评价，操作行贴底靠右；
 * - xl：左栏元信息 + 评价，右栏经历；操作区叠在右栏底部，仍位于卡片右下角且不额外占高。
 * 超宽屏参考 Juicebox：左栏限制在舒适阅读宽度（46rem），右栏经历最宽 30rem 靠左，
 * 多出的空白留在右栏内，操作区始终贴卡片右缘，视线按“标题 → 评价 → 经历 → 操作”走 Z 形。
 */
export const STUDIO_LIST_CARD_BODY_GRID_CLASS =
  "grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_auto_1fr] gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,46rem)_minmax(18rem,1fr)] xl:grid-rows-[auto_1fr]";
/**
 * 标题区：xl 起姓名与徽标同一行；更窄时姓名独占第一行、徽标排第二行（与 40px 头像等高），
 * 固定两行高，超出的徽标被裁掉而不是换到第三行。两行时徽标压到 22px，
 * 使 20px 姓名 + 4px 行距 + 徽标恰好等于 46px，避免上下边被裁。
 */
export const STUDIO_LIST_CARD_TITLE_ROW_CLASS =
  "flex h-[2.875rem] min-w-0 flex-1 flex-wrap content-center items-center gap-x-2 gap-y-1 overflow-hidden max-xl:[&>:not(:first-child)]:h-[1.375rem] max-xl:[&>:not(:first-child)]:py-0 xl:h-auto xl:flex-nowrap";
/** 标题区里的姓名：窄屏独占一行。 */
export const STUDIO_LIST_CARD_NAME_CLASS =
  "min-w-16 max-w-full shrink basis-full truncate text-left font-semibold text-base leading-5 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40 xl:basis-auto";
/** 元信息单行：岗位名优先截断，其余项保持宽度。 */
export const STUDIO_LIST_CARD_META_ROW_CLASS =
  "flex h-6 min-w-0 flex-nowrap items-center gap-x-4 overflow-hidden";
export const STUDIO_LIST_CARD_PROFILE_CELL_CLASS =
  "hidden min-h-0 min-w-0 overflow-hidden border-border/60 border-l border-dashed pl-8 xl:col-start-2 xl:row-start-2 xl:block";
export const STUDIO_LIST_CARD_ACTIONS_CELL_CLASS =
  "flex min-w-0 items-end justify-end self-end xl:col-start-2 xl:row-start-2 xl:pl-8";

/** 宽屏右栏最多展示的工作 / 教育条数；超出的工作经历以“…”提示，保证右栏高度有上限。 */
const COLUMN_WORK_LIMIT = 3;
const COLUMN_EDUCATION_LIMIT = 2;

function lineTitle(line: ResumeLibraryProfileSnapshotLine) {
  return [line.period, line.primary, line.secondary].filter(Boolean).join(" · ");
}

function lineText(line: ResumeLibraryProfileSnapshotLine) {
  return [line.primary, line.secondary].filter(Boolean).join(" · ");
}

function ProfileLine({
  emphasized,
  line,
}: {
  emphasized?: boolean;
  line: ResumeLibraryProfileSnapshotLine;
}) {
  return (
    <p className="flex h-6 min-w-0 items-center gap-2" title={lineTitle(line)}>
      <span className="w-[7.25rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground tabular-nums">
        {line.period ?? ""}
      </span>
      <span className={cn("min-w-0 truncate text-foreground text-sm", emphasized && "font-medium")}>
        {lineText(line)}
      </span>
    </p>
  );
}

/**
 * 宽屏（xl）右栏：工作经历在上、教育经历在下，单行截断，条数有上限，
 * 与左栏评价区并排时不撑高卡片；底部空间留给常驻操作区。
 */
export function StudioListCardProfileColumn({
  snapshot,
}: {
  snapshot: ResumeLibraryProfileSnapshot;
}) {
  const work = snapshot.work.slice(0, COLUMN_WORK_LIMIT);
  const education = snapshot.education.slice(0, COLUMN_EDUCATION_LIMIT);
  const workHasMore = snapshot.workHasMore || snapshot.work.length > work.length;
  if (work.length === 0 && education.length === 0) {
    return null;
  }

  return (
    <div
      className="grid max-w-[30rem] min-w-0 content-start"
      data-slot="studio-list-card-profile-column"
    >
      {work.map((line, index) => (
        <ProfileLine
          emphasized={index === 0}
          key={`work-${line.primary}-${line.period ?? ""}`}
          line={line}
        />
      ))}
      {workHasMore ? (
        <p aria-hidden className="h-5 pl-[7.75rem] text-muted-foreground text-xs leading-5">
          …
        </p>
      ) : null}
      {work.length > 0 && education.length > 0 ? (
        <div className="my-1.5 border-border/60 border-t" />
      ) : null}
      {education.map((line) => (
        <ProfileLine key={`education-${line.primary}-${line.period ?? ""}`} line={line} />
      ))}
    </div>
  );
}

/** 中等宽度（md–lg）单列卡片里的精简经历条：最近两段工作 + 最高学历，固定三行高。 */
export function StudioListCardProfileStrip({
  className,
  snapshot,
}: {
  className?: string;
  snapshot: ResumeLibraryProfileSnapshot;
}) {
  const lines = [
    ...snapshot.work.slice(0, 2).map((line, index) => ({ emphasized: index === 0, line })),
    ...snapshot.education.slice(0, 1).map((line) => ({ emphasized: false, line })),
  ];
  return (
    <div
      className={cn("grid h-[4.5rem] min-w-0 content-start", className)}
      data-slot="studio-list-card-profile-strip"
    >
      {lines.length > 0 ? (
        lines.map(({ emphasized, line }) => (
          <ProfileLine
            emphasized={emphasized}
            key={`${line.primary}-${line.period ?? ""}`}
            line={line}
          />
        ))
      ) : (
        <p className="flex h-6 items-center text-muted-foreground text-sm">暂无工作与教育经历</p>
      )}
    </div>
  );
}

/** 经历条占位：与正式经历条同为三行高。 */
export function StudioListCardProfileStripSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("grid h-[4.5rem] min-w-0 content-start", className)}>
      {["w-3/4", "w-2/3", "w-1/2"].map((width) => (
        <div className="flex h-6 items-center gap-2" key={width}>
          <Skeleton className="h-3 w-[7.25rem] shrink-0 group-hover/list-card:bg-foreground/10" />
          <Skeleton className={cn("h-3.5", width, "group-hover/list-card:bg-foreground/10")} />
        </div>
      ))}
    </div>
  );
}
