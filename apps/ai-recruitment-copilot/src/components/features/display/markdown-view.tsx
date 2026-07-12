import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@arc/shared/utils";

const markdownComponents = {
  table({ children, className, ...props }: ComponentProps<"table">) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-md border" data-not-typeset>
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
    <div className={cn("typeset typeset-compact min-w-0 max-w-full", className)}>
      <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </Markdown>
    </div>
  );
}
