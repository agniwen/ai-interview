"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { Label } from "@mastra/playground-ui/components/Label";
import { Pencil } from "lucide-react";

/** Schema validation error from API */
export interface SchemaValidationError {
  field: "input" | "groundTruth" | "toolMocks";
  errors: { path: string; message: string }[];
}

/** Displays field-level validation errors */
function ValidationErrors({
  field,
  errors,
}: {
  field: string;
  errors: { path: string; message: string }[];
}) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {errors.map((err, idx) => (
        <p key={idx} className="text-xs text-destructive">
          <code className="bg-destructive/10 px-1 rounded">
            {field}
            {err.path === "/" ? "" : err.path}
          </code>
          : {err.message}
        </p>
      ))}
    </div>
  );
}

/**
 * Editable form view for updating dataset item
 */
export interface EditModeContentProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  groundTruthValue: string;
  setGroundTruthValue: (value: string) => void;
  metadataValue: string;
  setMetadataValue: (value: string) => void;
  trajectoryValue: string;
  setTrajectoryValue: (value: string) => void;
  toolMocksValue: string;
  setToolMocksValue: (value: string) => void;
  requestContextValue: string;
  setRequestContextValue: (value: string) => void;
  validationErrors: SchemaValidationError | null;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function EditModeContent({
  inputValue,
  setInputValue,
  groundTruthValue,
  setGroundTruthValue,
  metadataValue,
  setMetadataValue,
  trajectoryValue,
  setTrajectoryValue,
  toolMocksValue,
  setToolMocksValue,
  requestContextValue,
  setRequestContextValue,
  validationErrors,
  onSave,
  onCancel,
  isSaving,
}: EditModeContentProps) {
  return (
    <>
      <div className="mb-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Pencil className="w-5 h-5" /> 编辑数据项
        </h3>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label>输入（JSON）*</Label>
          <CodeEditor
            value={inputValue}
            onChange={setInputValue}
            showCopyButton={false}
            className="min-h-[120px]"
          />
          {validationErrors?.field === "input" && (
            <ValidationErrors field="input" errors={validationErrors.errors} />
          )}
        </div>

        <div className="space-y-2">
          <Label>标准答案（JSON，可选）</Label>
          <CodeEditor
            value={groundTruthValue}
            onChange={setGroundTruthValue}
            showCopyButton={false}
            className="min-h-[100px]"
          />
          {validationErrors?.field === "groundTruth" && (
            <ValidationErrors field="groundTruth" errors={validationErrors.errors} />
          )}
        </div>

        <div className="space-y-2">
          <Label>预期轨迹（JSON，可选）</Label>
          <CodeEditor
            value={trajectoryValue}
            onChange={setTrajectoryValue}
            showCopyButton={false}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label>工具模拟（JSON 数组，可选）</Label>
          <p className="text-xs text-muted-foreground">
            按顺序使用静态模拟代替实际执行工具。每个条目的格式为{" "}
            <code>{`{ "toolName", "args", "output" }`}</code>。若模拟工具的调用参数不匹配，
            数据项将失败；未模拟的工具仍会实际运行。
          </p>
          <CodeEditor
            value={toolMocksValue}
            onChange={setToolMocksValue}
            showCopyButton={false}
            className="min-h-[100px]"
          />
          {validationErrors?.field === "toolMocks" && (
            <ValidationErrors field="toolMocks" errors={validationErrors.errors} />
          )}
        </div>

        <div className="space-y-2">
          <Label>请求上下文（JSON，可选）</Label>
          <CodeEditor
            value={requestContextValue}
            onChange={setRequestContextValue}
            showCopyButton={false}
            className="min-h-[80px]"
          />
        </div>

        <div className="space-y-2">
          <Label>元数据（JSON，可选）</Label>
          <CodeEditor
            value={metadataValue}
            onChange={setMetadataValue}
            showCopyButton={false}
            className="min-h-[80px]"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? "正在保存..." : "保存更改"}
          </Button>
          <Button onClick={onCancel} disabled={isSaving}>
            取消
          </Button>
        </div>
      </div>
    </>
  );
}
