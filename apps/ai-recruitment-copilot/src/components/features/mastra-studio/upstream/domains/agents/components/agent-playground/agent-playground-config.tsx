import { Badge } from "@mastra/playground-ui/components/Badge";
import {
  HoverPopover,
  PopoverTrigger,
  PopoverContent,
} from "@mastra/playground-ui/components/Popover";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Tab, TabContent, TabList, Tabs } from "@mastra/playground-ui/components/Tabs";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import { Braces, Wrench, Cpu } from "lucide-react";
import { useMemo } from "react";

import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import { InstructionBlocksPage } from "../agent-cms-pages/instruction-blocks-page";
import { ToolsPage } from "../agent-cms-pages/tools-page";
import {
  ReadOnlyConfigWithDiff,
  ReadOnlyInstructions,
  VariableProperty,
} from "./agent-playground-config-sections";

type AgentConfigTab = "variables" | "instructions" | "tools";

function ConfigTabLabel({
  title,
  icon,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <>
      <Icon size="sm" className="text-inherit">
        {icon}
      </Icon>
      <Txt as="span" variant="ui-sm" className="text-inherit">
        {title}
      </Txt>
      {badge}
    </>
  );
}

// ---------------------------------------------------------------------------
// Read-only variable property renderer (recursive for nested objects)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AgentPlaygroundConfigProps {
  agentId: string;
  selectedVersionId?: string;
  latestVersionId?: string;
}

export function AgentPlaygroundConfig({
  agentId,
  selectedVersionId,
  latestVersionId,
}: AgentPlaygroundConfigProps) {
  const { form, readOnly } = useAgentEditFormContext();
  const tools = form.watch("tools");
  const instructionBlocks = form.watch("instructionBlocks");
  const variables = form.watch("variables") as JsonSchema | undefined;
  const toolCount = tools ? Object.keys(tools).length : 0;

  const variableEntries = useMemo(() => Object.entries(variables?.properties ?? {}), [variables]);

  const showDiff =
    readOnly && !!selectedVersionId && !!latestVersionId && selectedVersionId !== latestVersionId;

  return (
    <div className={cn("flex flex-col h-full")}>
      <div className="px-4 py-3 border-b border-border1" />

      <ScrollArea className="flex-1 min-h-0">
        {showDiff ? (
          <ReadOnlyConfigWithDiff
            agentId={agentId}
            selectedVersionId={selectedVersionId}
            latestVersionId={latestVersionId}
          />
        ) : (
          <Tabs<AgentConfigTab>
            defaultTab="variables"
            className="flex min-h-full flex-col overflow-visible"
          >
            <TabList variant="pill-ghost" className="shrink-0">
              <Tab value="variables">
                <ConfigTabLabel title="变量" icon={<Braces />} />
              </Tab>
              <Tab value="instructions">
                <ConfigTabLabel title="系统提示词" icon={<Cpu />} />
              </Tab>
              <Tab value="tools">
                <ConfigTabLabel
                  title="工具"
                  icon={<Wrench />}
                  badge={
                    toolCount > 0 ? (
                      <Badge variant="default" size="sm">{`${toolCount}`}</Badge>
                    ) : undefined
                  }
                />
              </Tab>
            </TabList>

            <TabContent value="variables" className="py-0">
              <div className="flex flex-col gap-1 px-4 py-4">
                {variableEntries.length > 0 ? (
                  <div className="flex flex-col">
                    {variableEntries.map(([name, prop]) => (
                      <VariableProperty key={name} name={name} prop={prop} depth={0} />
                    ))}
                  </div>
                ) : null}
                <Txt variant="ui-xs" className="text-neutral3 mt-1">
                  {variableEntries.length > 0
                    ? "通过代码中的 requestContextSchema 定义。"
                    : "尚未定义变量。请为智能体添加 requestContextSchema 以定义变量。"}
                </Txt>
              </div>
            </TabContent>

            <TabContent value="instructions" className="px-4 py-0 pb-4">
              <div className="flex flex-col gap-3 pt-4 pb-2">
                <Txt variant="ui-sm" className="font-normal text-neutral3">
                  为智能体添加指令块。各个块会按顺序组合为系统提示词。你可以在指令块中{" "}
                  <HoverPopover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="text-neutral3 underline decoration-dotted hover:text-neutral5 cursor-pointer inline"
                      >
                        使用变量
                      </button>
                    </PopoverTrigger>{" "}
                    。
                    <PopoverContent side="bottom" align="start">
                      <p className="text-ui-sm text-neutral5">
                        使用 <code className="text-accent1 font-medium">{"{{variableName}}"}</code>{" "}
                        语法将动态值插入指令块。
                      </p>
                    </PopoverContent>
                  </HoverPopover>
                </Txt>
              </div>

              {readOnly ? (
                <ReadOnlyInstructions blocks={instructionBlocks} />
              ) : (
                <InstructionBlocksPage />
              )}
            </TabContent>

            <TabContent value="tools" className="px-4 py-0 pb-4">
              <ToolsPage />
            </TabContent>
          </Tabs>
        )}
      </ScrollArea>
    </div>
  );
}
