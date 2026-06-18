import type { ResumeEducationDisplayItem } from "@arc/shared/resume-education";
import { cn } from "@arc/shared/utils";
import { Badge } from "@/components/ui/badge";

function educationLevelTagClassName(level: string | null | undefined) {
  const normalized = level?.trim();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("硕")) {
    return "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/15 dark:text-purple-300";
  }
  if (normalized.includes("本") || normalized.includes("学士")) {
    return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300";
  }
  if (normalized.includes("专")) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-300";
  }
  return "";
}

export function EducationLevelTag({ level }: { level: string | null | undefined }) {
  const label = level?.trim();
  if (!label) {
    return null;
  }
  return (
    <Badge className={cn("shrink-0", educationLevelTagClassName(label))} variant="outline">
      {label}
    </Badge>
  );
}

export function ResumeEducationDisplayLine({
  className,
  item,
}: {
  className?: string;
  item: ResumeEducationDisplayItem;
}) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <EducationLevelTag level={item.level} />
      <span className="min-w-0 break-words font-medium">{item.school}</span>
      {item.major ? (
        <span className="min-w-0 break-words text-muted-foreground">· {item.major}</span>
      ) : null}
    </span>
  );
}
