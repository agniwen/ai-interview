import type {
  ResumeLibraryProfileSnapshot,
  ResumeLibraryProfileSnapshotLine,
} from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";

function renderSnapshotLine(line: ResumeLibraryProfileSnapshotLine) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
      key={`${line.primary}-${line.secondary ?? ""}-${line.period ?? ""}`}
      title={[line.period, line.primary, line.secondary].filter(Boolean).join(" · ")}
    >
      {line.period ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.period}</span>
      ) : null}
      <span className="min-w-0 truncate text-foreground text-sm">
        {[line.primary, line.secondary].filter(Boolean).join(" · ")}
      </span>
    </p>
  );
}

function renderMoreRow(key: string) {
  return (
    <p className="flex min-w-0 items-center text-muted-foreground text-sm" key={key}>
      {"..."}
    </p>
  );
}

function SnapshotGroup({
  hasMore,
  lines,
  moreKey,
}: {
  hasMore: boolean;
  lines: ResumeLibraryProfileSnapshotLine[];
  moreKey: string;
}) {
  if (lines.length === 0 && !hasMore) {
    return null;
  }
  return (
    <>
      {lines.map(renderSnapshotLine)}
      {hasMore ? renderMoreRow(moreKey) : null}
    </>
  );
}

function Separator() {
  return <div className="my-0.5 border-border/60 border-t" />;
}

function LabeledGroup({
  hasMore,
  label,
  lines,
  moreKey,
}: {
  hasMore: boolean;
  label: string;
  lines: ResumeLibraryProfileSnapshotLine[];
  moreKey: string;
}) {
  if (lines.length === 0 && !hasMore) {
    return null;
  }
  return (
    <div className="min-w-0 space-y-1">
      <div className="font-medium text-[11px] text-muted-foreground tracking-wide">{label}</div>
      <SnapshotGroup hasMore={hasMore} lines={lines} moreKey={moreKey} />
    </div>
  );
}

/**
 * Compact work / education / project lines shared by resume library cards and
 * duplicate-match cards. Backend already limits to 3 companies, 2 education,
 * and 3 projects.
 */
export function ResumeProfileSnapshotView({
  className,
  showLabels = false,
  snapshot,
}: {
  className?: string;
  /** When true, render 公司 / 学历 / 项目 section labels (used by dedup compare UI). */
  showLabels?: boolean;
  snapshot: ResumeLibraryProfileSnapshot | null | undefined;
}) {
  if (!snapshot) {
    return null;
  }

  const hasWorkGroup = snapshot.work.length > 0 || snapshot.workHasMore;
  const hasEducationGroup = snapshot.education.length > 0 || snapshot.educationHasMore;
  const hasProjectGroup = snapshot.projects.length > 0 || snapshot.projectsHasMore;

  if (!(hasWorkGroup || hasEducationGroup || hasProjectGroup)) {
    return null;
  }

  if (showLabels) {
    return (
      <div className={cn("grid min-w-0 content-start gap-2.5 text-sm", className)}>
        <LabeledGroup
          hasMore={snapshot.workHasMore}
          label="最近公司"
          lines={snapshot.work}
          moreKey="work-more"
        />
        <LabeledGroup
          hasMore={snapshot.educationHasMore}
          label="学历"
          lines={snapshot.education}
          moreKey="education-more"
        />
        <LabeledGroup
          hasMore={snapshot.projectsHasMore}
          label="项目"
          lines={snapshot.projects}
          moreKey="projects-more"
        />
      </div>
    );
  }

  return (
    <div className={cn("grid min-w-0 content-start gap-1 text-sm", className)}>
      <SnapshotGroup hasMore={snapshot.workHasMore} lines={snapshot.work} moreKey="work-more" />
      {hasWorkGroup && (hasEducationGroup || hasProjectGroup) ? <Separator /> : null}
      <SnapshotGroup
        hasMore={snapshot.educationHasMore}
        lines={snapshot.education}
        moreKey="education-more"
      />
      {hasEducationGroup && hasProjectGroup ? <Separator /> : null}
      <SnapshotGroup
        hasMore={snapshot.projectsHasMore}
        lines={snapshot.projects}
        moreKey="projects-more"
      />
    </div>
  );
}
