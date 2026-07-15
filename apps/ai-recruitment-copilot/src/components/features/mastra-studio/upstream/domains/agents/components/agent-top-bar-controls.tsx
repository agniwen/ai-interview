import { Button } from "@mastra/playground-ui/components/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@mastra/playground-ui/components/Popover";
import { Settings2 } from "lucide-react";

import { AgentRunOptionsContent } from "./agent-run-options";

interface AgentTopBarRunOptionsProps {
  requestContextSchema?: string;
}

export function AgentTopBarRunOptions({ requestContextSchema }: AgentTopBarRunOptionsProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          tooltip="运行选项"
          data-testid="agent-top-bar-run-options-trigger"
        >
          <Settings2 />
          运行选项
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(760px,calc(100vw-2rem))] p-0">
        <AgentRunOptionsContent requestContextSchema={requestContextSchema} />
      </PopoverContent>
    </Popover>
  );
}

export const AgentTopBarControls = AgentTopBarRunOptions;
