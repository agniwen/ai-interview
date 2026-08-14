import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { FileJson, FormInput } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentProps } from "react";

import { useOptionalAgentEditFormContext } from "../context/agent-edit-form-context";
import { RequestContext } from "./request-context";
import { RequestContextLabel } from "@/components/features/mastra-studio/upstream/domains/request-context/components/request-context-label";
import { RequestContextSchemaForm } from "@/components/features/mastra-studio/upstream/domains/request-context/components/request-context-schema-form";
import { useSchemaRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";
import { DynamicForm } from "@/components/features/mastra-studio/upstream/lib/form/dynamic-form";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";

interface AgentRequestContextRunOptionsProps {
  requestContextSchema?: string;
  freeformEditorClassName?: string;
  requestContextTooltip?: string;
}

type InputMode = "form" | "json";

function hasSchemaProperties(
  schema: Record<string, unknown> | undefined,
): schema is Record<string, unknown> {
  const properties = schema?.properties;
  return Boolean(
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.keys(properties).length > 0,
  );
}

/**
 * Renders a schema-driven form from the agent editor variables JSON schema.
 * Used when the agent has editor-defined variables but no code-level requestContextSchema.
 */
function VariablesRequestContextForm({
  labelTooltip,
  variablesSchema,
}: {
  labelTooltip?: string;
  variablesSchema: Record<string, unknown>;
}) {
  const { setSchemaValues, schemaValues } = useSchemaRequestContext();
  const localFormValuesStr = JSON.stringify(schemaValues);

  const zodSchema = useMemo(() => {
    try {
      return resolveSerializedZodOutput(
        variablesSchema as Parameters<typeof resolveSerializedZodOutput>[0],
      );
    } catch (error) {
      console.error("Failed to parse variables schema:", error);
      return null;
    }
  }, [variablesSchema]);

  if (!zodSchema) {
    return (
      <div className="p-4">
        <Txt variant="ui-sm" className="text-red-400">
          无法解析请求上下文 Schema
        </Txt>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <RequestContextLabel tooltip={labelTooltip}>请求上下文</RequestContextLabel>
        <CopyButton content={localFormValuesStr} />
      </div>

      <DynamicForm
        schema={zodSchema as ComponentProps<typeof DynamicForm>["schema"]}
        onSubmit={(values) => setSchemaValues(values as Record<string, unknown>)}
        submitButtonLabel="保存"
        defaultValues={schemaValues}
      />
    </div>
  );
}

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border1 p-0.5">
      <button
        type="button"
        aria-pressed={mode === "form"}
        onClick={() => onModeChange("form")}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
          mode === "form" ? "bg-surface3 text-neutral5" : "text-neutral3 hover:text-neutral5",
        )}
      >
        <Icon size="sm">
          <FormInput />
        </Icon>
        表单
      </button>
      <button
        type="button"
        aria-pressed={mode === "json"}
        onClick={() => onModeChange("json")}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
          mode === "json" ? "bg-surface3 text-neutral5" : "text-neutral3 hover:text-neutral5",
        )}
      >
        <Icon size="sm">
          <FileJson />
        </Icon>
        JSON
      </button>
    </div>
  );
}

export function AgentRequestContextRunOptionsBody({
  requestContextSchema,
  freeformEditorClassName,
  requestContextTooltip,
}: AgentRequestContextRunOptionsProps) {
  const formCtx = useOptionalAgentEditFormContext();
  const variables = formCtx?.form.watch("variables") as Record<string, unknown> | undefined;
  const [mode, setMode] = useState<InputMode>("form");

  const hasVariables = hasSchemaProperties(variables);
  const hasSchemaForm = Boolean(requestContextSchema) || hasVariables;
  let formContent = null;
  if (requestContextSchema) {
    formContent = (
      <RequestContextSchemaForm
        requestContextSchema={requestContextSchema}
        labelTooltip={requestContextTooltip}
      />
    );
  } else if (hasVariables) {
    formContent = (
      <VariablesRequestContextForm
        variablesSchema={variables}
        labelTooltip={requestContextTooltip}
      />
    );
  }

  return (
    <div className="space-y-4">
      {hasSchemaForm ? (
        <>
          <div className="flex items-center justify-end">
            <ModeSwitcher mode={mode} onModeChange={setMode} />
          </div>

          {mode === "form" ? (
            formContent
          ) : (
            <RequestContext
              editorClassName={freeformEditorClassName}
              labelTooltip={requestContextTooltip}
            />
          )}
        </>
      ) : (
        <RequestContext
          editorClassName={freeformEditorClassName}
          labelTooltip={requestContextTooltip}
        />
      )}
    </div>
  );
}

export function AgentRequestContextRunOptions({
  requestContextSchema,
}: AgentRequestContextRunOptionsProps) {
  return (
    <ScrollArea className="max-h-[500px]">
      <div className="p-4">
        <AgentRequestContextRunOptionsBody requestContextSchema={requestContextSchema} />
      </div>
    </ScrollArea>
  );
}
