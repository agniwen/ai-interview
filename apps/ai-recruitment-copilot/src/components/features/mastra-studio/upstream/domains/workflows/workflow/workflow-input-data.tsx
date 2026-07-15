import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@mastra/playground-ui/components/Collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ChevronRight, Loader2, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { ZodSchema } from "zod3";

import { WorkflowInputTypeToggle } from "./workflow-input-type-toggle";
import type { WorkflowInputType } from "./workflow-input-type-toggle";
import { DynamicForm } from "@/components/features/mastra-studio/upstream/lib/form/dynamic-form";

type InputType = WorkflowInputType;

type WorkflowSubmitRowProps = Pick<
  WorkflowInputDataProps,
  | "isSubmitLoading"
  | "submitButtonLabel"
  | "disableSubmit"
  | "submitActions"
  | "leftActions"
  | "submitButtonClassName"
  | "submitButtonIcon"
  | "submitButtonVariant"
> & {
  onSubmit: () => void;
};

export interface WorkflowInputDataProps {
  schema: ZodSchema;
  defaultValues?: unknown;
  isSubmitLoading: boolean;
  submitButtonLabel: string;
  onSubmit: (data: unknown) => void;
  withoutSubmit?: boolean;
  isReadOnly?: boolean;
  disableSubmit?: boolean;
  children?: React.ReactNode;
  isProcessorWorkflow?: boolean;
  submitActions?: React.ReactNode;
  leftActions?: React.ReactNode;
  heading?: string;
  headingSlot?: ReactNode;
  collapsible?: boolean;
  headingClassName?: string;
  submitButtonClassName?: string;
  submitButtonIcon?: ReactNode;
  submitButtonVariant?: React.ComponentProps<typeof Button>["variant"];
  submitButtonFullWidth?: boolean;
  hideInputTypeLabel?: boolean;
  inputTypeLabel?: string;
  hideHeading?: boolean;
}

const WorkflowSubmitRow = ({
  isSubmitLoading,
  submitButtonLabel,
  disableSubmit,
  submitActions,
  leftActions,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
  onSubmit,
}: WorkflowSubmitRowProps) => (
  <div className="flex items-center justify-between gap-1">
    {leftActions ?? <div />}
    <div className="flex items-center gap-1">
      {submitActions}
      <Button
        variant={submitButtonVariant ?? "primary"}
        onClick={onSubmit}
        disabled={isSubmitLoading || disableSubmit}
        className={submitButtonClassName}
      >
        {isSubmitLoading ? (
          <Icon>
            <Loader2 className="animate-spin" />
          </Icon>
        ) : (
          (submitButtonIcon ?? (
            <Icon>
              <Play />
            </Icon>
          ))
        )}
        {submitButtonLabel}
      </Button>
    </div>
  </div>
);

const WorkflowFormInput = ({
  schema,
  defaultValues,
  isSubmitLoading,
  submitButtonLabel,
  onSubmit,
  withoutSubmit,
  isReadOnly,
  disableSubmit,
  children,
  submitActions,
  leftActions,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
  submitButtonFullWidth,
}: WorkflowInputDataProps) => (
  <DynamicForm
    schema={schema}
    defaultValues={defaultValues}
    isSubmitLoading={isSubmitLoading}
    submitButtonLabel={submitButtonLabel}
    submitButtonClassName={submitButtonClassName}
    submitButtonIcon={submitButtonIcon}
    submitButtonVariant={submitButtonVariant}
    submitButtonFullWidth={submitButtonFullWidth}
    onSubmit={withoutSubmit ? undefined : onSubmit}
    readOnly={isReadOnly}
    disableSubmit={disableSubmit}
    submitActions={submitActions}
    leftActions={leftActions}
  >
    {children}
  </DynamicForm>
);

const WorkflowJsonInput = ({
  schema,
  defaultValues,
  isSubmitLoading,
  submitButtonLabel,
  onSubmit,
  withoutSubmit,
  isReadOnly,
  disableSubmit,
  children,
  submitActions,
  leftActions,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
}: WorkflowInputDataProps) => {
  const [errors, setErrors] = useState<string[]>([]);
  const [inputData, setInputData] = useState<string>(() =>
    JSON.stringify(defaultValues ?? {}, null, 2),
  );

  const handleSubmit = () => {
    setErrors([]);

    try {
      const result = schema.safeParse(JSON.parse(inputData));
      if (result.success) {
        onSubmit(result.data);
      } else {
        setErrors(result.error.issues.map((e) => `[${e.path.join(".")}] ${e.message}`));
      }
    } catch {
      setErrors(["提供的 JSON 无效"]);
    }
  };

  let data = {};
  try {
    data = JSON.parse(inputData);
  } catch {
    data = {};
  }

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 && (
        <div className="border border-accent2 rounded-lg p-2">
          <Txt as="p" variant="ui-md" className="text-accent2 font-semibold">
            发现 {errors.length} 个错误
          </Txt>

          <ul className="list-disc list-inside">
            {errors.map((error, idx) => (
              <li key={idx} className="text-ui-sm text-accent2">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Txt as="label" variant="ui-sm" className="text-neutral3 pb-1 block">
          输入数据
        </Txt>
        <CodeEditor data={data} onChange={setInputData} editable={!isReadOnly} />
      </div>

      {children}

      {withoutSubmit ? null : (
        <WorkflowSubmitRow
          isSubmitLoading={isSubmitLoading}
          submitButtonLabel={submitButtonLabel}
          disableSubmit={disableSubmit}
          submitActions={submitActions}
          leftActions={leftActions}
          submitButtonClassName={submitButtonClassName}
          submitButtonIcon={submitButtonIcon}
          submitButtonVariant={submitButtonVariant}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

const PROCESSOR_PHASES = [
  { label: "输入 - 在 LLM 之前处理输入消息", value: "input" },
  { label: "输入步骤 - 在每次智能体循环步骤中处理", value: "inputStep" },
  { label: "输出流 - 处理流式数据块", value: "outputStream" },
  { label: "输出结果 - 处理完整输出", value: "outputResult" },
  { label: "输出步骤 - 在每次 LLM 响应后处理", value: "outputStep" },
];

const DEFAULT_PROCESSOR_MESSAGE = "你好，这是一条测试消息。";
const DEFAULT_PROCESSOR_PHASE = "input";

function getDefaultProcessorMessage(defaultValues: unknown) {
  const values = defaultValues as
    | {
        messages?: { content?: { parts?: { type?: string; text?: unknown }[] } }[];
      }
    | null
    | undefined;
  const textPart = values?.messages?.[0]?.content?.parts?.find((part) => part.type === "text");
  return typeof textPart?.text === "string" ? textPart.text : DEFAULT_PROCESSOR_MESSAGE;
}

function getDefaultProcessorPhase(defaultValues: unknown) {
  const phase = (defaultValues as { phase?: unknown } | null)?.phase;
  return typeof phase === "string" ? phase : DEFAULT_PROCESSOR_PHASE;
}

const WorkflowProcessorInput = ({
  schema,
  defaultValues,
  isSubmitLoading,
  submitButtonLabel,
  onSubmit,
  withoutSubmit,
  isReadOnly,
  disableSubmit,
  children,
  submitActions,
  leftActions,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
}: WorkflowInputDataProps) => {
  const [message, setMessage] = useState(() => getDefaultProcessorMessage(defaultValues));
  const [phase, setPhase] = useState(() => getDefaultProcessorPhase(defaultValues));
  const [errors, setErrors] = useState<string[]>([]);

  const handleSubmit = () => {
    setErrors([]);

    // For output phases (outputStep, outputResult), use 'assistant' role
    const isOutputPhase = phase === "outputStep" || phase === "outputResult";
    const messageRole = isOutputPhase ? "assistant" : "user";

    // Construct the data in the format processor workflows expect
    const data = {
      messages: [
        {
          content: {
            format: 2,
            parts: [{ text: message, type: "text" }],
          },
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          role: messageRole,
        },
      ],
      phase,
    };

    try {
      const result = schema.safeParse(data);
      if (result.success) {
        onSubmit(result.data);
      } else {
        setErrors(result.error.issues.map((e) => `[${e.path.join(".")}] ${e.message}`));
      }
    } catch {
      setErrors(["处理输入时出错"]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 && (
        <div className="border border-accent2 rounded-lg p-2">
          <Txt as="p" variant="ui-md" className="text-accent2 font-semibold">
            发现 {errors.length} 个错误
          </Txt>
          <ul className="list-disc list-inside">
            {errors.map((error, idx) => (
              <li key={idx} className="text-ui-sm text-accent2">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <Txt as="div" variant="ui-sm" className="text-neutral3">
          阶段
        </Txt>
        <Select value={phase} onValueChange={setPhase} disabled={isReadOnly}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择阶段" />
          </SelectTrigger>
          <SelectContent>
            {PROCESSOR_PHASES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Txt variant="ui-xs" className="text-neutral4">
          {PROCESSOR_PHASES.find((p) => p.value === phase)?.label}
        </Txt>
      </div>

      <div className="space-y-2">
        <Txt as="label" variant="ui-sm" className="text-neutral3">
          测试消息
        </Txt>
        <textarea
          aria-label="测试消息"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入测试消息..."
          rows={4}
          disabled={isReadOnly}
          className="w-full bg-transparent border border-border1 rounded-md p-3 text-ui-sm text-neutral6 placeholder:text-neutral3 focus:outline-hidden focus:ring-2 focus:ring-accent1 disabled:opacity-50"
        />
      </div>

      {children}

      {withoutSubmit ? null : (
        <WorkflowSubmitRow
          isSubmitLoading={isSubmitLoading}
          submitButtonLabel={submitButtonLabel}
          disableSubmit={disableSubmit}
          submitActions={submitActions}
          leftActions={leftActions}
          submitButtonClassName={submitButtonClassName}
          submitButtonIcon={submitButtonIcon}
          submitButtonVariant={submitButtonVariant}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

function WorkflowInputControl({
  children,
  defaultValues,
  disableSubmit,
  isProcessorWorkflow,
  isReadOnly,
  isSubmitLoading,
  leftActions,
  onSubmit,
  processorInputKey,
  schema,
  submitActions,
  submitButtonClassName,
  submitButtonFullWidth,
  submitButtonIcon,
  submitButtonLabel,
  submitButtonVariant,
  type,
  withoutSubmit,
}: WorkflowInputDataProps & { processorInputKey: string; type: InputType }) {
  const sharedProps = {
    defaultValues,
    disableSubmit,
    isReadOnly,
    isSubmitLoading,
    leftActions,
    onSubmit,
    schema,
    submitActions,
    submitButtonClassName,
    submitButtonLabel,
    withoutSubmit,
  };
  if (type === "simple" && isProcessorWorkflow) {
    return (
      <WorkflowProcessorInput key={processorInputKey} {...sharedProps}>
        {children}
      </WorkflowProcessorInput>
    );
  }
  if (type === "form") {
    return (
      <WorkflowFormInput
        {...sharedProps}
        submitButtonFullWidth={submitButtonFullWidth}
        submitButtonIcon={submitButtonIcon}
        submitButtonVariant={submitButtonVariant}
      >
        {children}
      </WorkflowFormInput>
    );
  }
  return <WorkflowJsonInput {...sharedProps}>{children}</WorkflowJsonInput>;
}

export const WorkflowInputData = ({
  schema,
  defaultValues,
  withoutSubmit,
  isReadOnly,
  disableSubmit,
  isSubmitLoading,
  submitButtonLabel,
  onSubmit,
  children,
  isProcessorWorkflow,
  submitActions,
  leftActions,
  heading,
  headingSlot,
  collapsible = true,
  headingClassName,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
  submitButtonFullWidth,
  hideInputTypeLabel,
  inputTypeLabel = "运行输入",
  hideHeading,
}: WorkflowInputDataProps) => {
  const [type, setType] = useState<InputType>(isProcessorWorkflow ? "simple" : "form");
  const processorInputKey = useMemo(
    () =>
      JSON.stringify({
        message: getDefaultProcessorMessage(defaultValues),
        phase: getDefaultProcessorPhase(defaultValues),
      }),
    [defaultValues],
  );

  const defaultHeading = (
    <Txt as="span" variant="ui-md" className={cn("text-neutral5 font-semibold", headingClassName)}>
      {heading ?? (withoutSubmit ? "运行输入" : "触发运行")}
    </Txt>
  );
  const inputTypeToggle = (
    <WorkflowInputTypeToggle
      value={type}
      onChange={setType}
      disabled={isSubmitLoading}
      includeSimple={isProcessorWorkflow}
      compact={!collapsible && !hideHeading}
    />
  );

  const body = (
    <>
      {!hideInputTypeLabel && (
        <div className="flex justify-between gap-3 py-3 px-5">
          <Txt as="p" variant="ui-sm" className="text-neutral3">
            {inputTypeLabel}
          </Txt>
          {!collapsible && !hideHeading && <div className="shrink-0">{inputTypeToggle}</div>}
        </div>
      )}

      <div className="px-5">
        {(collapsible || hideHeading || hideInputTypeLabel) && (
          <div className="pb-4">{inputTypeToggle}</div>
        )}

        <div
          className={cn("pb-4", {
            "opacity-50 pointer-events-none": isSubmitLoading,
          })}
        >
          <WorkflowInputControl
            defaultValues={defaultValues}
            disableSubmit={disableSubmit}
            isProcessorWorkflow={isProcessorWorkflow}
            isReadOnly={isReadOnly}
            isSubmitLoading={isSubmitLoading}
            leftActions={leftActions}
            onSubmit={onSubmit}
            processorInputKey={processorInputKey}
            schema={schema}
            submitActions={submitActions}
            submitButtonClassName={submitButtonClassName}
            submitButtonFullWidth={submitButtonFullWidth}
            submitButtonIcon={submitButtonIcon}
            submitButtonLabel={submitButtonLabel}
            submitButtonVariant={submitButtonVariant}
            type={type}
            withoutSubmit={withoutSubmit}
          >
            {children}
          </WorkflowInputControl>
        </div>
      </div>
    </>
  );

  if (!collapsible) {
    return (
      <>
        {!hideHeading && (
          <div className="border-b border-border1/50 pb-3">{headingSlot ?? defaultHeading}</div>
        )}
        <div>{body}</div>
      </>
    );
  }

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center gap-2 pb-3 text-left">
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral3" />
        {headingSlot ?? defaultHeading}
      </CollapsibleTrigger>

      <CollapsibleContent>{body}</CollapsibleContent>
    </Collapsible>
  );
};
