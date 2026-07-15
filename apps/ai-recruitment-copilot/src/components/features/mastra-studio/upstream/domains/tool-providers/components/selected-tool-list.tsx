import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import { useMemo } from "react";

interface SelectedToolListProps {
  providerId: string;
  selectedTools: Map<string, string>;
  onToggle?: (id: string, description: string) => void;
}

export function SelectedToolList({ providerId, selectedTools, onToggle }: SelectedToolListProps) {
  const tools = useMemo(() => {
    const result: { id: string; slug: string; description: string }[] = [];
    for (const [id, description] of selectedTools) {
      const sep = id.indexOf(":");
      if (sep === -1) {
        continue;
      }
      if (id.slice(0, sep) !== providerId) {
        continue;
      }
      result.push({ description, id, slug: id.slice(sep + 1) });
    }
    return result;
  }, [selectedTools, providerId]);

  if (tools.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Txt variant="ui-sm" className="text-neutral3">
          尚未选择工具
        </Txt>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-3">
        {tools.map((tool) => (
          <button
            type="button"
            key={tool.id}
            disabled={!onToggle}
            onClick={onToggle ? () => onToggle(tool.id, tool.description) : undefined}
            className={cn(
              "flex w-full items-start gap-3 rounded-md bg-surface4 px-3 py-2.5 text-left",
              onToggle && "cursor-pointer",
            )}
          >
            {onToggle && (
              <div className="pt-0.5">
                <Checkbox
                  checked
                  onCheckedChange={() => onToggle(tool.id, tool.description)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <div className="flex flex-col gap-1 min-w-0">
              <Txt variant="ui-sm" className="text-neutral6 font-medium">
                {tool.slug}
              </Txt>
              {tool.description && (
                <Txt variant="ui-sm" className="text-neutral3 line-clamp-2">
                  {tool.description}
                </Txt>
              )}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
