import { MarkdownView } from "@/components/features/display/markdown-view";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";
import { cn } from "@app/shared/utils";
import { JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT } from "./job-description-form-values";

export function JobDescriptionMarkdownSurface({
  "aria-label": ariaLabel,
  className,
  content,
  height = JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT,
  id,
}: {
  "aria-label"?: string;
  className?: string;
  content: string;
  height?: number | null;
  id?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(cossFieldSurfaceClass, "overflow-y-auto px-3 py-2 text-sm", className)}
      id={id}
      style={height === null ? { minHeight: JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT } : { height }}
    >
      <MarkdownView content={content} />
    </div>
  );
}
