"use client";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@mastra/playground-ui/components/Collapsible";
import { Notice } from "@mastra/playground-ui/components/Notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import type { JSONSchema7 } from "json-schema";
import { ChevronRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAgentSchema } from "../hooks/use-agent-schema";
import { useScorerSchema } from "../hooks/use-scorer-schema";
import { useWorkflowSchema } from "../hooks/use-workflow-schema";
import { SchemaField } from "./schema-settings/schema-field";
import { useWorkflows } from "@/components/features/mastra-studio/upstream/domains/workflows/hooks/use-workflows";

type SourceType = "custom" | "agent" | "workflow" | "scorer";
type ScorerTargetType = "agent" | "custom";

function getSourceKey(
  sourceType: SourceType,
  selectedWorkflow: string | null,
  scorerTargetType: ScorerTargetType,
): string {
  if (sourceType === "workflow") {
    return `workflow:${selectedWorkflow}`;
  }
  if (sourceType === "scorer") {
    return `scorer:${scorerTargetType}`;
  }
  return sourceType;
}

function isSchemaEnabled(schema: Record<string, unknown> | null | undefined): boolean {
  return schema !== null && schema !== undefined;
}

function isEmptyObjectSchema(schema: Record<string, unknown> | null | undefined): boolean {
  if (!schema || schema.type !== "object") {
    return false;
  }
  return Object.keys((schema.properties as Record<string, unknown> | undefined) ?? {}).length === 0;
}

function shouldPopulateSchema(
  sourceSchema: JSONSchema7 | null,
  isEnabled: boolean,
  sourceChanged: boolean,
  isEmpty: boolean,
): boolean {
  return Boolean(sourceSchema) && isEnabled && (sourceChanged || isEmpty);
}

interface SchemaConfigSectionProps {
  inputSchema: Record<string, unknown> | null | undefined;
  outputSchema: Record<string, unknown> | null | undefined;
  requestContextSchema: Record<string, unknown> | null | undefined;
  onChange: (schemas: {
    inputSchema: Record<string, unknown> | null;
    outputSchema: Record<string, unknown> | null;
    requestContextSchema: Record<string, unknown> | null;
  }) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
}

/**
 * Collapsible section for configuring dataset schemas.
 * Supports source-based auto-population from Agent, Workflow, or Scorer schemas.
 */
export function SchemaConfigSection({
  inputSchema,
  outputSchema,
  requestContextSchema,
  onChange,
  disabled = false,
  defaultOpen = false,
}: SchemaConfigSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [sourceType, setSourceType] = useState<SourceType>("custom");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [scorerTargetType, setScorerTargetType] = useState<ScorerTargetType>("agent");

  // Fetch workflows for workflow source selection
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const workflowOptions = workflows ? Object.entries(workflows) : [];

  // Fetch workflow schema when workflow selected
  const { data: workflowSchema, isLoading: workflowSchemaLoading } = useWorkflowSchema(
    sourceType === "workflow" ? selectedWorkflow : null,
  );

  // Static schemas for agent and scorer
  const agentSchema = useAgentSchema();
  const scorerSchema = useScorerSchema();

  // Get source schemas based on source type
  const getSourceSchemas = (): {
    inputSchema: JSONSchema7 | null;
    outputSchema: JSONSchema7 | null;
  } => {
    switch (sourceType) {
      case "agent": {
        return {
          inputSchema: agentSchema.inputSchema,
          outputSchema: agentSchema.outputSchema,
        };
      }
      case "workflow": {
        if (!workflowSchema) {
          return { inputSchema: null, outputSchema: null };
        }
        return {
          inputSchema: (workflowSchema.inputSchema as JSONSchema7) ?? null,
          outputSchema: (workflowSchema.outputSchema as JSONSchema7) ?? null,
        };
      }
      case "scorer": {
        return {
          inputSchema:
            scorerTargetType === "agent"
              ? scorerSchema.agentInputSchema
              : scorerSchema.customInputSchema,
          outputSchema: scorerSchema.outputSchema,
        };
      }
      default: {
        return { inputSchema: null, outputSchema: null };
      }
    }
  };

  const sourceSchemas = getSourceSchemas();
  // Auto-populate when not custom (scorer always auto-populates with agent or custom schema)
  const isAutoPopulate = sourceType !== "custom";

  // Track previous source key to detect source changes
  const prevSourceKeyRef = useRef<string | null>(null);

  // Auto-populate when source changes
  // - When source/workflow changes: re-populate all ENABLED schemas (even if not empty)
  // - When toggling on a schema: populate if empty (handled by SchemaField)
  useEffect(() => {
    if (sourceType === "custom") {
      return;
    }
    if (sourceSchemas.inputSchema === null && sourceSchemas.outputSchema === null) {
      return;
    }

    // Create a key representing the current source selection
    const currentSourceKey = getSourceKey(sourceType, selectedWorkflow, scorerTargetType);

    // Check if source changed (not just initial render)
    const sourceChanged =
      prevSourceKeyRef.current !== null && prevSourceKeyRef.current !== currentSourceKey;
    prevSourceKeyRef.current = currentSourceKey;

    // For workflow, also need to wait for schema to load
    if (sourceType === "workflow" && !workflowSchema) {
      return;
    }

    const isInputEnabled = isSchemaEnabled(inputSchema);
    const isOutputEnabled = isSchemaEnabled(outputSchema);

    // Check if schemas are empty (for initial population when toggling on)
    const isInputEmpty = isEmptyObjectSchema(inputSchema);
    const isOutputEmpty = isEmptyObjectSchema(outputSchema);

    // Populate if: source changed and schema is enabled, OR schema is enabled but empty
    const shouldPopulateInput = shouldPopulateSchema(
      sourceSchemas.inputSchema,
      isInputEnabled,
      sourceChanged,
      isInputEmpty,
    );
    const shouldPopulateOutput = shouldPopulateSchema(
      sourceSchemas.outputSchema,
      isOutputEnabled,
      sourceChanged,
      isOutputEmpty,
    );

    if (shouldPopulateInput || shouldPopulateOutput) {
      onChange({
        inputSchema: shouldPopulateInput
          ? (sourceSchemas.inputSchema as Record<string, unknown>)
          : (inputSchema ?? null),
        outputSchema: shouldPopulateOutput
          ? (sourceSchemas.outputSchema as Record<string, unknown>)
          : (outputSchema ?? null),
        requestContextSchema: requestContextSchema ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, selectedWorkflow, workflowSchema, scorerTargetType]);

  const handleInputSchemaChange = (schema: Record<string, unknown> | null) => {
    onChange({
      inputSchema: schema,
      outputSchema: outputSchema ?? null,
      requestContextSchema: requestContextSchema ?? null,
    });
  };

  const handleOutputSchemaChange = (schema: Record<string, unknown> | null) => {
    onChange({
      inputSchema: inputSchema ?? null,
      outputSchema: schema,
      requestContextSchema: requestContextSchema ?? null,
    });
  };

  const handleRequestContextSchemaChange = (schema: Record<string, unknown> | null) => {
    onChange({
      inputSchema: inputSchema ?? null,
      outputSchema: outputSchema ?? null,
      requestContextSchema: schema,
    });
  };

  const handleSourceChange = (value: SourceType) => {
    setSourceType(value);
    // Reset workflow selection when switching away from workflow
    if (value !== "workflow") {
      setSelectedWorkflow(null);
    }
  };

  let workflowItems = workflowOptions.map(([id, wf]) => (
    <SelectItem key={id} value={id}>
      {wf.name || id}
    </SelectItem>
  ));
  if (workflowsLoading) {
    workflowItems = [
      <SelectItem key="loading" value="__loading__" disabled>
        正在加载...
      </SelectItem>,
    ];
  } else if (workflowOptions.length === 0) {
    workflowItems = [
      <SelectItem key="empty" value="__empty__" disabled>
        暂无工作流
      </SelectItem>,
    ];
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-neutral4 hover:text-neutral5 w-full py-2">
        <ChevronRight className="w-4 h-4" />
        Schema 配置（可选）
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-4 space-y-4">
        {/* JSON Schema info notification */}
        <Notice variant="info" title="JSON Schema 格式">
          <Notice.Message>
            Schema 使用{" "}
            <a
              href="https://json-schema.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-accent5Lighter"
            >
              JSON Schema
            </a>{" "}
            进行验证和类型检查。
          </Notice.Message>
        </Notice>

        {/* Source selector */}
        <div className="space-y-2">
          <label htmlFor="schema-import-source" className="text-sm font-medium text-neutral4">
            导入来源
          </label>
          <div className="flex items-center gap-2">
            <Select
              value={sourceType}
              onValueChange={(v) => handleSourceChange(v as SourceType)}
              disabled={disabled}
            >
              <SelectTrigger id="schema-import-source" size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">自定义</SelectItem>
                <SelectItem value="agent">智能体</SelectItem>
                <SelectItem value="workflow">工作流</SelectItem>
                <SelectItem value="scorer">评分器</SelectItem>
              </SelectContent>
            </Select>

            {/* Workflow picker when workflow source selected */}
            {sourceType === "workflow" && (
              <Select
                value={selectedWorkflow ?? ""}
                onValueChange={setSelectedWorkflow}
                disabled={disabled}
              >
                <SelectTrigger size="sm" className="w-48">
                  <SelectValue placeholder="选择工作流..." />
                </SelectTrigger>
                <SelectContent>{workflowItems}</SelectContent>
              </Select>
            )}

            {/* Loading indicator for workflow schema */}
            {sourceType === "workflow" && selectedWorkflow && workflowSchemaLoading && (
              <span className="text-xs text-neutral3">正在加载 Schema...</span>
            )}

            {/* Scorer target type picker */}
            {sourceType === "scorer" && (
              <Select
                value={scorerTargetType}
                onValueChange={(v) => setScorerTargetType(v as ScorerTargetType)}
                disabled={disabled}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">智能体</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Helper text for scorer */}
          {sourceType === "scorer" && (
            <p className="text-xs text-neutral3">
              {scorerTargetType === "agent"
                ? "用于校准智能体类型评分器"
                : "用于校准自定义评分器（输入/输出为任意类型）"}
            </p>
          )}
        </div>

        {/* Schema fields */}
        <SchemaField
          label="输入 Schema"
          schemaType="input"
          value={inputSchema}
          onChange={handleInputSchemaChange}
          sourceSchema={isAutoPopulate ? sourceSchemas.inputSchema : undefined}
          autoPopulate={isAutoPopulate}
        />

        <SchemaField
          label="标准答案 Schema"
          schemaType="output"
          value={outputSchema}
          onChange={handleOutputSchemaChange}
          sourceSchema={isAutoPopulate ? sourceSchemas.outputSchema : undefined}
          autoPopulate={isAutoPopulate}
        />

        <SchemaField
          label="请求上下文 Schema"
          schemaType="requestContext"
          value={requestContextSchema}
          onChange={handleRequestContextSchemaChange}
          autoPopulate={false}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
