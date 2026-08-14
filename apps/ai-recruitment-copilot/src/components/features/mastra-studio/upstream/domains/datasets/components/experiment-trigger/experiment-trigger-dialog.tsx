import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@mastra/playground-ui/components/Dialog";
import { Label } from "@mastra/playground-ui/components/Label";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { format } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDatasetMutations } from "../../hooks/use-dataset-mutations";
import { ScorerSelector } from "./scorer-selector";
import type { TargetType } from "./target-selector";
import { TargetSelector } from "./target-selector";
import { DynamicForm } from "@/components/features/mastra-studio/upstream/lib/form/dynamic-form";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";

export interface ExperimentTriggerDialogProps {
  datasetId: string;
  version?: number;
  requestContextSchema?: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (experimentId: string) => void;
}

/**
 * Schema-driven request context form. Converts the dataset's plain JSON Schema
 * into a zod schema and surfaces values via onChange (no global store coupling).
 */
function RequestContextForm({
  requestContextSchema,
  onChange,
}: {
  requestContextSchema: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const zodSchema = useMemo(() => {
    try {
      return resolveSerializedZodOutput(
        requestContextSchema as Parameters<typeof resolveSerializedZodOutput>[0],
      );
    } catch (error) {
      console.error("Failed to parse requestContextSchema:", error);
      return null;
    }
  }, [requestContextSchema]);

  if (!zodSchema) {
    return <p className="text-sm text-destructive">解析请求上下文 Schema 失败</p>;
  }

  const handleValuesChange = (values: unknown) => {
    if (typeof values === "object" && values !== null && !Array.isArray(values)) {
      onChange(values as Record<string, unknown>);
    }
  };

  return (
    <div className="space-y-2">
      <Label>请求上下文</Label>
      <DynamicForm
        schema={zodSchema}
        onValuesChange={handleValuesChange}
        className="[&_button[type=submit]]:hidden"
      />
    </div>
  );
}

export function ExperimentTriggerDialog({
  datasetId,
  version,
  requestContextSchema,
  open,
  onOpenChange,
  onSuccess,
}: ExperimentTriggerDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [targetType, setTargetType] = useState<TargetType | "">("");
  const [targetId, setTargetId] = useState<string>("");
  const [selectedScorers, setSelectedScorers] = useState<string[]>([]);
  const [requestContextValues, setRequestContextValues] = useState<Record<string, unknown>>({});
  const [requestContextRaw, setRequestContextRaw] = useState("");

  const { triggerExperiment } = useDatasetMutations();

  const hasSchema = Boolean(requestContextSchema && Object.keys(requestContextSchema).length > 0);

  const canRun = targetType && targetId;
  const isRunning = triggerExperiment.isPending;

  const resetState = () => {
    setTargetType("");
    setTargetId("");
    setSelectedScorers([]);
    setRequestContextValues({});
    setRequestContextRaw("");
  };

  const resolveRequestContext = (): Record<string, unknown> | undefined => {
    if (hasSchema) {
      const entries = Object.entries(requestContextValues).filter(
        ([, v]) => v !== undefined && v !== "",
      );
      return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    if (requestContextRaw.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(requestContextRaw);
      } catch {
        throw new Error("请求上下文必须是有效的 JSON");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("请求上下文必须是 JSON 对象");
      }
      return parsed as Record<string, unknown>;
    }
    return undefined;
  };

  const handleRun = async () => {
    if (!canRun) {
      return;
    }

    let requestContext: Record<string, unknown> | undefined;
    try {
      requestContext = resolveRequestContext();
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求上下文必须是有效的 JSON";
      toast.error(message);
      return;
    }

    try {
      const result = await triggerExperiment.mutateAsync({
        datasetId,
        requestContext,
        scorerIds: selectedScorers.length > 0 ? selectedScorers : undefined,
        targetId,
        targetType,
        version,
      });

      toast.success("实验触发成功");
      onOpenChange(false);
      onSuccess?.(result.experimentId);

      resetState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "触发实验失败";
      toast.error(message);
    }
  };

  const handleClose = () => {
    if (!isRunning) {
      onOpenChange(false);
      resetState();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent ref={contentRef}>
        <DialogHeader>
          <DialogTitle>运行实验</DialogTitle>
          <DialogDescription>
            {version
              ? `使用 ${format(new Date(version), "yyyy/MM/dd")} 版本中的数据项运行目标。`
              : "使用此数据集中的所有数据项运行目标。"}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-6">
          <TargetSelector
            targetType={targetType}
            setTargetType={setTargetType}
            targetId={targetId}
            setTargetId={setTargetId}
            container={contentRef}
          />

          {/* Only show scorer selector for agent/workflow targets */}
          {targetType && targetType !== "scorer" && (
            <ScorerSelector
              selectedScorers={selectedScorers}
              setSelectedScorers={setSelectedScorers}
              disabled={isRunning}
              container={contentRef}
            />
          )}

          {requestContextSchema ? (
            <RequestContextForm
              requestContextSchema={requestContextSchema}
              onChange={setRequestContextValues}
            />
          ) : (
            <div className="space-y-2">
              <Label>请求上下文（JSON，可选）</Label>
              <CodeEditor
                value={requestContextRaw}
                onChange={setRequestContextRaw}
                showCopyButton={false}
                className="min-h-[80px]"
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter className="px-6 pt-4">
          <Button onClick={handleClose} disabled={isRunning}>
            取消
          </Button>
          <Button variant="primary" onClick={handleRun} disabled={!canRun || isRunning}>
            {isRunning ? (
              <>
                <Spinner className="w-4 h-4" />
                正在运行...
              </>
            ) : (
              "运行"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
