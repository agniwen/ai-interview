import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";

interface CodeDisplayProps {
  content: string;
  height?: string;
  isCopied?: boolean;
  isDraft?: boolean;
  onCopy?: () => void;
  className?: string;
}

export function CodeDisplay({
  content,
  height = "150px",
  isCopied = false,
  isDraft = false,
  onCopy,
  className = "",
}: CodeDisplayProps) {
  return (
    <div className={`rounded-md border ${className}`} style={{ height }}>
      <ScrollArea className="h-full">
        <div
          className={`p-2 transition-colors group relative ${onCopy ? "cursor-pointer hover:bg-surface4/50" : ""}`}
        >
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              aria-label="复制代码"
              className="absolute inset-0 z-10 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent1"
            />
          )}
          <pre className="text-ui-xs whitespace-pre-wrap font-mono pointer-events-none">
            {content}
          </pre>
          {isDraft && (
            <div className="mt-1.5">
              <span className="text-ui-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500">
                草稿——保存更改后生效
              </span>
            </div>
          )}
          {isCopied && (
            <span className="absolute top-2 right-2 z-20 text-ui-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-500 pointer-events-none">
              已复制！
            </span>
          )}
          {onCopy && (
            <span className="absolute top-2 right-2 z-20 text-ui-xs px-1.5 py-0.5 rounded-full bg-surface4 text-neutral4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              点击复制
            </span>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
