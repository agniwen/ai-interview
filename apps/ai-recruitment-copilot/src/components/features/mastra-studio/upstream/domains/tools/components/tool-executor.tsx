import { jsonLanguage } from "@codemirror/lang-json";
import type { MCPToolType } from "@mastra/core/mcp";
import { useCodemirrorTheme } from "@mastra/playground-ui/components/CodeEditor";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { MainContentContent } from "@mastra/playground-ui/components/MainContent";
import { Tabs, Tab, TabList } from "@mastra/playground-ui/components/Tabs";
import { cn } from "@mastra/playground-ui/utils/cn";
import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";
import type { ZodType } from "zod3";
import { RequestContextSchemaForm } from "@/components/features/mastra-studio/upstream/domains/request-context/components/request-context-schema-form";
import {
  SchemaRequestContextProvider,
  useSchemaRequestContext,
} from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";
import { ToolInformation } from "@/components/features/mastra-studio/upstream/domains/tools/components/tool-information";
import { DynamicForm } from "@/components/features/mastra-studio/upstream/lib/form/dynamic-form";

interface ToolExecutorProps {
  isExecutingTool: boolean;
  zodInputSchema: ZodType;
  handleExecuteTool: (
    data: Record<string, unknown>,
    schemaRequestContext?: Record<string, unknown>,
  ) => void;
  executionResult: unknown;
  errorString?: string;
  toolDescription: string;
  toolId: string;
  toolType?: MCPToolType;
  requestContextSchema?: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Inner component that can access SchemaRequestContext */
const ToolExecutorContent = ({
  isExecutingTool,
  zodInputSchema,
  handleExecuteTool,
  result,
  errorString,
  toolDescription,
  toolId,
  toolType,
  requestContextSchema,
}: Omit<ToolExecutorProps, "executionResult"> & { result: unknown }) => {
  const theme = useCodemirrorTheme();
  const code = JSON.stringify(result ?? {}, null, 2);
  const [selectedTab, setSelectedTab] = useState("input-data");
  const { schemaValues } = useSchemaRequestContext();

  return (
    <MainContentContent hasLeftServiceColumn={true} className="relative">
      <div className="bg-surface2 border-r border-border1 w-80 flex flex-col">
        <ToolInformation toolDescription={toolDescription} toolId={toolId} toolType={toolType} />
        <div className="flex-1 overflow-hidden border-t border-border1 flex flex-col">
          <Tabs defaultTab="input-data" value={selectedTab} onValueChange={setSelectedTab}>
            <TabList>
              <Tab value="input-data">输入数据</Tab>
              {requestContextSchema && <Tab value="request-context">请求上下文</Tab>}
            </TabList>
          </Tabs>
          <div className={cn("p-5 overflow-y-auto", selectedTab !== "input-data" && "hidden")}>
            <DynamicForm
              isSubmitLoading={isExecutingTool}
              schema={zodInputSchema}
              onSubmit={(data) => {
                handleExecuteTool(toRecord(data), schemaValues);
              }}
              className="h-auto pb-7"
            />
          </div>
          {requestContextSchema && (
            <div
              className={cn("p-5 overflow-y-auto", selectedTab !== "request-context" && "hidden")}
            >
              <RequestContextSchemaForm requestContextSchema={requestContextSchema} />
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <CopyButton content={code} tooltip="复制 JSON 结果到剪贴板" />
      </div>
      <div className="p-5 h-full relative overflow-x-auto overflow-y-auto">
        <CodeMirror
          value={errorString || code}
          editable={true}
          theme={theme}
          extensions={[jsonLanguage]}
        />
      </div>
    </MainContentContent>
  );
};

const ToolExecutor = ({
  isExecutingTool,
  zodInputSchema,
  handleExecuteTool,
  executionResult: result,
  errorString,
  toolDescription,
  toolId,
  toolType,
  requestContextSchema,
}: ToolExecutorProps) => (
  <SchemaRequestContextProvider>
    <ToolExecutorContent
      isExecutingTool={isExecutingTool}
      zodInputSchema={zodInputSchema}
      handleExecuteTool={handleExecuteTool}
      result={result}
      errorString={errorString}
      toolDescription={toolDescription}
      toolId={toolId}
      toolType={toolType}
      requestContextSchema={requestContextSchema}
    />
  </SchemaRequestContextProvider>
);

export default ToolExecutor;
