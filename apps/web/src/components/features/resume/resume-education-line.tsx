import type { ResumeEducationDisplayItem } from "@app/shared/resume-education";
import { cn } from "@app/shared/utils";
import { Badge } from "@/components/ui/badge";

function educationLevelTagClassName(level: string | null | undefined) {
  const normalized = level?.trim();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("硕")) {
    return "border-transparent bg-purple-tint text-purple-ink";
  }
  if (normalized.includes("本") || normalized.includes("学士")) {
    return "border-transparent bg-blue-tint text-blue-ink";
  }
  if (normalized.includes("专")) {
    return "border-transparent bg-green-tint text-green-ink";
  }
  return "";
}

function EducationLevelTag({ level }: { level: string | null | undefined }) {
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
  levelDisplay = "badge",
  majorLayout = "inline",
}: {
  className?: string;
  item: ResumeEducationDisplayItem;
  levelDisplay?: "badge" | "suffix";
  majorLayout?: "block" | "inline";
}) {
  const levelLabel = item.level?.trim();
  const levelSuffix =
    levelDisplay === "suffix" && levelLabel ? (
      <span className="font-normal text-muted-foreground">（{levelLabel}）</span>
    ) : null;

  if (majorLayout === "block") {
    return (
      <span className={cn("inline-flex min-w-0 flex-col items-start gap-1.5", className)}>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {levelDisplay === "badge" ? <EducationLevelTag level={item.level} /> : null}
          <span className="min-w-0 wrap-break-word font-medium">
            {item.school}
            {levelSuffix}
          </span>
        </span>
        {item.major ? (
          <span className="min-w-0 wrap-break-word text-muted-foreground">{item.major}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {levelDisplay === "badge" ? <EducationLevelTag level={item.level} /> : null}
      <span className="min-w-0 wrap-break-word font-medium">
        {item.school}
        {levelSuffix}
      </span>
      {item.major ? (
        <span className="min-w-0 wrap-break-word text-muted-foreground">· {item.major}</span>
      ) : null}
    </span>
  );
}
