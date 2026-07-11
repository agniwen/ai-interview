import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@arc/shared/utils";

// 这个通用 MarkdownView 需要保持紧凑排版，所以这里继续直接给 markdown
// 渲染出的子元素打一份最小排版补丁（间距、heading 尺寸、list 符号、
// code/blockquote 等），通过 child 选择器作用到 Markdown 输出的元素上。
//
// Minimal typographic rules for compact react-markdown output. Keep this view
// independent from the broader `prose` defaults used by richer components.
const MARKDOWN_BODY_CLASS = cn(
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:font-semibold [&_h1]:text-lg [&_h1]:text-foreground",
  "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-base [&_h2]:text-foreground",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-[15px] [&_h3]:text-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_em]:italic",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
);

const markdownComponents = {
  table({ children, className, ...props }: ComponentProps<"table">) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-md border">
        <table className={cn("w-max min-w-full border-collapse text-sm", className)} {...props}>
          {children}
        </table>
      </div>
    );
  },
  tbody({ className, ...props }: ComponentProps<"tbody">) {
    return <tbody className={className} {...props} />;
  },
  td({ className, ...props }: ComponentProps<"td">) {
    return (
      <td
        className={cn("border px-3 py-2 align-top leading-6 whitespace-normal", className)}
        {...props}
      />
    );
  },
  th({ className, ...props }: ComponentProps<"th">) {
    return (
      <th
        className={cn(
          "border px-3 py-2 text-left font-medium text-foreground leading-6 whitespace-nowrap",
          className,
        )}
        {...props}
      />
    );
  },
  thead({ className, ...props }: ComponentProps<"thead">) {
    return <thead className={cn("bg-muted/70", className)} {...props} />;
  },
  tr({ className, ...props }: ComponentProps<"tr">) {
    return <tr className={cn("even:bg-muted/30", className)} {...props} />;
  },
};

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(MARKDOWN_BODY_CLASS, "min-w-0 max-w-full", className)}>
      <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </Markdown>
    </div>
  );
}
