import { jsonLanguage } from "@codemirror/lang-json";
import type { TimeTravelParams } from "@mastra/client-js";
import { useCodemirrorTheme } from "@mastra/playground-ui/components/CodeEditor";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@mastra/playground-ui/components/Collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mastra/playground-ui/components/Tooltip";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { formatJSON, isValidJson } from "@mastra/playground-ui/utils/formatting";
import CodeMirror from "@uiw/react-codemirror";
import { Braces, ChevronDown, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { parse } from "superjson";
import { z } from "zod3";
import { WorkflowRunContext } from "../context/workflow-run-context";
import { WorkflowInputData } from "./workflow-input-data";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";

const buttonClass = "text-neutral3 hover:text-neutral6";

export interface WorkflowTimeTravelFormProps {
  stepKey: string;
  closeModal: () => void;
  isPerStepRun?: boolean;
  isContinueRun?: boolean;
  buttonText?: string;
  inputData?: unknown;
}

const prettyJson = (value: unknown) => {
  try {
    if (value === undefined || value === null) {
      return "{}";
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
};

function parseOptionalJsonValue<T>(value: string): T | undefined {
  const parsed: unknown = value.trim() ? JSON.parse(value) : {};
  return Object.keys(parsed as object).length > 0 ? (parsed as T) : undefined;
}

const JsonField = ({
  label,
  value,
  onChange,
  helperText,
  exampleCode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  exampleCode?: string;
}) => {
  const theme = useCodemirrorTheme();
  const { handleCopy } = useCopyToClipboard({ text: value });
  const { handleCopy: handleCopyExample } = useCopyToClipboard({ text: exampleCode ?? "{}" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExampleOpen, setIsExampleOpen] = useState(false);

  const handleFormat = async () => {
    setFieldError(null);
    if (!value.trim()) {
      onChange("{}");
      return;
    }
    if (!isValidJson(value)) {
      setFieldError("JSON 无效");
      return;
    }

    try {
      const formatted = await formatJSON(value);
      onChange(formatted);
    } catch {
      setFieldError("无法格式化 JSON");
    }
  };

  return (
    <>
      {isExampleOpen && (
        <div className="border border-border1 rounded-lg bg-surface3 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Txt as="p" variant="ui-sm" className="text-neutral3">
              {label}示例
            </Txt>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopyExample}
                  className={buttonClass}
                  aria-label="复制示例 JSON"
                >
                  <Icon>
                    <CopyIcon />
                  </Icon>
                </button>
              </TooltipTrigger>
              <TooltipContent>复制示例 JSON</TooltipContent>
            </Tooltip>
          </div>
          <CodeMirror
            value={exampleCode}
            theme={theme}
            extensions={[jsonLanguage]}
            className="h-[150px] w-full overflow-y-scroll bg-surface3 rounded-lg overflow-scroll p-3"
          />
        </div>
      )}
      <Collapsible
        className="border border-border1 rounded-lg bg-surface3"
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <div className="flex items-center justify-between w-full px-3">
          <div>
            <Txt as="label" variant="ui-md" className="text-neutral3">
              {label}
            </Txt>
            {helperText && (
              <Txt variant="ui-xs" className="text-neutral3">
                {helperText}
              </Txt>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleFormat}
                  className={buttonClass}
                  aria-label="格式化 JSON"
                >
                  <Icon>
                    <Braces />
                  </Icon>
                </button>
              </TooltipTrigger>
              <TooltipContent>格式化 JSON</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={buttonClass}
                  aria-label="复制 JSON"
                >
                  <Icon>
                    <CopyIcon />
                  </Icon>
                </button>
              </TooltipTrigger>
              <TooltipContent>复制 JSON</TooltipContent>
            </Tooltip>
            {exampleCode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setIsExampleOpen(!isExampleOpen)}
                    className={buttonClass}
                    aria-label={isExampleOpen ? "隐藏示例 JSON" : "查看示例 JSON"}
                  >
                    <Icon>{isExampleOpen ? <EyeOffIcon /> : <EyeIcon />}</Icon>
                  </button>
                </TooltipTrigger>
                <TooltipContent>查看示例 JSON</TooltipContent>
              </Tooltip>
            )}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={buttonClass}
                aria-label={isOpen ? `收起${label}` : `展开${label}`}
              >
                <Icon className={cn("transition-transform", isOpen ? "rotate-0" : "-rotate-90")}>
                  <ChevronDown />
                </Icon>
              </button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="space-y-2">
          <CodeMirror
            value={value}
            onChange={onChange}
            theme={theme}
            extensions={[jsonLanguage]}
            className="h-[260px] overflow-y-scroll bg-surface3 rounded-lg overflow-hidden p-3"
          />

          {fieldError && (
            <Txt variant="ui-sm" className="text-accent2">
              {fieldError}
            </Txt>
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
};

export const WorkflowTimeTravelForm = ({
  stepKey,
  closeModal,
  isPerStepRun,
  isContinueRun,
  buttonText = "开始时间回溯",
  inputData,
}: WorkflowTimeTravelFormProps) => {
  const {
    result,
    workflow,
    timeTravelWorkflowStream,
    runId: prevRunId,
    workflowId,
    setDebugMode,
  } = useContext(WorkflowRunContext);

  const requestContext = useMergedRequestContext();
  const stepResult = inputData ? { payload: inputData } : result?.steps?.[stepKey];
  const [resumeData, setResumeData] = useState(() => "{}");
  const [contextValue, setContextValue] = useState(() => "{}");
  const [nestedContextValue, setNestedContextValue] = useState(() => "{}");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepDefinition = workflow?.allSteps?.[stepKey];

  const { schema: stepSchema } = useMemo(() => {
    if (!stepDefinition?.inputSchema) {
      return { schema: z.record(z.string(), z.any()) };
    }

    try {
      const parsed = parse(stepDefinition.inputSchema);
      const zodStateSchema = workflow?.stateSchema
        ? resolveSerializedZodOutput(
            parse(workflow.stateSchema) as Parameters<typeof resolveSerializedZodOutput>[0],
          )
        : null;

      const zodStepSchema = resolveSerializedZodOutput(
        parsed as Parameters<typeof resolveSerializedZodOutput>[0],
      );

      const schemaToUse = zodStateSchema
        ? z.object({
            initialState: zodStateSchema.optional(),
            inputData: zodStepSchema,
          })
        : zodStepSchema;
      return { schema: schemaToUse, schemaError: null };
    } catch (error) {
      console.error("Failed to parse step schema", error);
      return { schema: z.record(z.string(), z.any()) };
    }
  }, [stepDefinition?.inputSchema, workflow?.stateSchema]);

  const handleSubmit = (submittedData: unknown) => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const parsedResume = parseOptionalJsonValue<TimeTravelParams["resumeData"]>(resumeData);
      const parsedContext = parseOptionalJsonValue<TimeTravelParams["context"]>(contextValue);
      const parsedNestedContext =
        parseOptionalJsonValue<TimeTravelParams["nestedStepsContext"]>(nestedContextValue);
      const submittedRecord = (submittedData ?? {}) as Record<string, unknown>;
      const { initialState, inputData: dataInputData } = submittedRecord;
      const submittedInputData = workflow?.stateSchema ? dataInputData : submittedData;

      const payload = {
        context: parsedContext,
        initialState: initialState as TimeTravelParams["initialState"],
        inputData: submittedInputData as TimeTravelParams["inputData"],
        nestedStepsContext: parsedNestedContext,
        requestContext,
        resumeData: parsedResume,
        runId: prevRunId,
        step: stepKey,
        workflowId,
        ...(isContinueRun ? { perStep: false } : {}),
      };

      if (isContinueRun) {
        setDebugMode(false);
      }

      void timeTravelWorkflowStream(payload);

      closeModal();
    } catch (error) {
      console.error("Invalid JSON provided", error);
      setFormError(error instanceof Error ? error.message : "工作流时间回溯时出错");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Txt as="p" variant="ui-lg" className="text-neutral3">
            输入数据
          </Txt>
          <Txt variant="ui-xs" className="text-neutral3">
            步骤：{stepKey}
          </Txt>
        </div>

        <WorkflowInputData
          schema={stepSchema}
          defaultValues={stepResult?.payload}
          isSubmitLoading={isSubmitting}
          submitButtonLabel={buttonText}
          onSubmit={handleSubmit}
        >
          <div className="space-y-4 pb-4">
            {isPerStepRun || isContinueRun ? null : (
              <>
                <JsonField
                  label="恢复数据（JSON）"
                  value={resumeData}
                  onChange={setResumeData}
                  helperText="提供需要传递给该步骤的恢复数据。"
                />
                <JsonField
                  label="上下文（JSON）"
                  value={contextValue}
                  onChange={setContextValue}
                  helperText="仅包含时间回溯执行所需的顶层步骤，不含嵌套工作流步骤。"
                  exampleCode={prettyJson({
                    stepId: {
                      output: {
                        value: "test output",
                      },
                      payload: {
                        value: "test value",
                      },
                      status: "success",
                    },
                  })}
                />
                <JsonField
                  label="嵌套步骤上下文（JSON）"
                  value={nestedContextValue}
                  onChange={setNestedContextValue}
                  helperText="包含时间回溯执行所需的嵌套工作流步骤。"
                  exampleCode={prettyJson({
                    nestedWorkflowId: {
                      stepId: {
                        output: {
                          value: "test output",
                        },
                        payload: {
                          value: "test value",
                        },
                        status: "success",
                      },
                    },
                  })}
                />
              </>
            )}
            {formError && (
              <Txt variant="ui-sm" className="text-accent2">
                {formError}
              </Txt>
            )}
          </div>
        </WorkflowInputData>
      </div>
    </TooltipProvider>
  );
};
