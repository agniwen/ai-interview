import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { useMemo } from "react";
import { parse } from "superjson";
import { useSchemaRequestContext } from "../context/schema-request-context";
import { RequestContextLabel } from "./request-context-label";
import { DynamicForm } from "@/components/features/mastra-studio/upstream/lib/form/dynamic-form";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";

export interface RequestContextSchemaFormProps {
  /**
   * Serialized JSON schema for request context validation.
   * This component should only be rendered when a schema is provided.
   */
  requestContextSchema: string;
  labelTooltip?: string;
}

/**
 * Component that displays a schema-driven form for request context.
 * Only rendered when an agent/workflow defines a requestContextSchema.
 *
 * This component syncs form values to the SchemaRequestContext on explicit "Save" click,
 * allowing the agent chat to use these values (which override global context).
 * Empty strings in form fields will override global values intentionally.
 */
export const RequestContextSchemaForm = ({
  labelTooltip,
  requestContextSchema,
}: RequestContextSchemaFormProps) => {
  const { setSchemaValues, schemaValues } = useSchemaRequestContext();
  // Local state for schema-driven form (does NOT update global store)

  const localFormValuesStr = JSON.stringify(schemaValues);

  // Parse the schema
  const zodSchema = useMemo(() => {
    try {
      const jsonSchema = parse(requestContextSchema) as Parameters<
        typeof resolveSerializedZodOutput
      >[0];
      return resolveSerializedZodOutput(jsonSchema);
    } catch (error) {
      console.error("Failed to parse requestContextSchema:", error);
      return null;
    }
  }, [requestContextSchema]);

  if (!zodSchema) {
    return (
      <div className="text-neutral3">
        <Txt variant="ui-sm">解析请求上下文 Schema 失败</Txt>
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
        schema={zodSchema}
        onSubmit={(values) => setSchemaValues(values as Record<string, unknown>)}
        submitButtonLabel="保存"
        defaultValues={schemaValues}
      />
    </div>
  );
};
