import { Badge } from "@mastra/playground-ui/components/Badge";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mastra/playground-ui/components/InputGroup";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import { SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { useProviderTools } from "../hooks/use-provider-tools";

interface ToolListProps {
  providerId: string;
  toolkit: string | undefined;
  selectedIds?: Set<string>;
  onToggle?: (id: string, description: string) => void;
}

export function ToolList({ providerId, toolkit, selectedIds, onToggle }: ToolListProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 300);

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const { data, isLoading } = useProviderTools(providerId, {
    search: search || undefined,
    toolkit,
  });
  const tools = data?.data ?? [];
  let listContent: ReactNode;

  if (isLoading) {
    listContent = Array.from({ length: 8 }).map((_, index) => (
      <div key={index} className="flex flex-col gap-1.5 p-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    ));
  } else if (tools.length === 0) {
    listContent = (
      <div className="flex items-center justify-center py-12">
        <Txt variant="ui-sm" className="text-neutral3">
          No tools found
        </Txt>
      </div>
    );
  } else {
    listContent = tools.map((tool) => {
      const toolId = `${providerId}:${tool.slug}`;
      const isSelected = selectedIds?.has(toolId) ?? false;

      return (
        <button
          type="button"
          key={tool.slug}
          disabled={!onToggle}
          onClick={onToggle ? () => onToggle(toolId, tool.description || "") : undefined}
          className={cn(
            "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-surface4",
            onToggle && "cursor-pointer",
            isSelected && "bg-surface4",
          )}
        >
          {onToggle && (
            <div className="pt-0.5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(toolId, tool.description || "")}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <Txt variant="ui-sm" className="font-medium text-neutral6">
                {tool.name}
              </Txt>
              {toolkit === undefined && tool.toolkit && <Badge>{tool.toolkit}</Badge>}
            </div>
            {tool.description && (
              <Txt variant="ui-sm" className="line-clamp-2 text-neutral3">
                {tool.description}
              </Txt>
            )}
          </div>
        </button>
      );
    });
  }

  return (
    <div className="grid grid-rows-[auto_1fr] h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border1">
        <InputGroup variant="outline" size="sm">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search tools"
            placeholder="Search tools..."
            onChange={(event) => debouncedSearch(event.target.value)}
          />
        </InputGroup>
      </div>

      <ScrollArea className="h-full">
        <div className="flex flex-col gap-1 p-3">{listContent}</div>
      </ScrollArea>
    </div>
  );
}
