"use client";
import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@mastra/playground-ui/components/Dialog";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useCallback, useState } from "react";
import { useDatasetMutations } from "../../hooks/use-dataset-mutations";
import { useJSONParser } from "../../hooks/use-json-parser";
import type { ParsedJSON } from "../../hooks/use-json-parser";
import { JSONPreviewTable } from "./json-preview-table";
import { JSONUploadStep } from "./json-upload-step";
import { JSONValidationSummary } from "./json-validation-summary";

export interface JSONImportDialogProps {
  datasetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "complete";

interface ImportResult {
  success: number;
  errors: number;
}

/**
 * Multi-step dialog for importing JSON data into a dataset.
 * Flow: upload -> preview -> import -> complete
 */
export function JSONImportDialog({
  datasetId,
  open,
  onOpenChange,
  onSuccess,
}: JSONImportDialogProps) {
  // State machine for steps
  const [step, setStep] = useState<ImportStep>("upload");

  // Parsed JSON data
  const [parsedJSON, setParsedJSON] = useState<ParsedJSON | null>(null);

  // Import progress
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Hooks
  const { parseFile, isParsing, error: parseError } = useJSONParser();
  const { batchInsertItems } = useDatasetMutations();

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      try {
        const result = await parseFile(file);
        setParsedJSON(result);
        setStep("preview");
      } catch {
        // Error is handled in useJSONParser
      }
    },
    [parseFile],
  );

  // Handle import
  const handleImport = useCallback(async () => {
    if (!parsedJSON || parsedJSON.items.length === 0) {
      return;
    }

    setStep("importing");
    setIsImporting(true);

    const { items } = parsedJSON;

    setImportProgress({ current: 0, total: items.length });

    try {
      await batchInsertItems.mutateAsync({
        datasetId,
        items: items.map((item) => ({
          groundTruth: item.groundTruth,
          input: item.input,
          metadata: item.metadata,
        })),
      });
      setImportResult({ errors: 0, success: items.length });
    } catch {
      setImportResult({ errors: items.length, success: 0 });
    }

    setImportProgress({ current: items.length, total: items.length });
    setIsImporting(false);
    setStep("complete");
  }, [parsedJSON, batchInsertItems, datasetId]);

  // Handle done - close dialog and notify
  const handleDone = useCallback(() => {
    onOpenChange(false);
    onSuccess?.();

    if (importResult && importResult.success > 0) {
      toast.success(`已导入 ${importResult.success} 个数据项`);
    }

    // Reset state after close animation
    setTimeout(() => {
      setStep("upload");
      setParsedJSON(null);
      setImportProgress({ current: 0, total: 0 });
      setImportResult(null);
    }, 150);
  }, [onOpenChange, onSuccess, importResult]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    if (isImporting) {
      return;
    }

    onOpenChange(false);

    // Reset state after close animation
    setTimeout(() => {
      setStep("upload");
      setParsedJSON(null);
      setImportProgress({ current: 0, total: 0 });
      setImportResult(null);
    }, 150);
  }, [isImporting, onOpenChange]);

  // Check if import is possible (has valid items with no errors)
  const canImport = parsedJSON && parsedJSON.items.length > 0 && parsedJSON.errors.length === 0;

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case "upload": {
        return (
          <JSONUploadStep
            onFileSelect={handleFileSelect}
            isParsing={isParsing}
            error={parseError?.message}
          />
        );
      }

      case "preview": {
        return parsedJSON ? (
          <div className="flex flex-col gap-4">
            {parsedJSON.errors.length > 0 ? (
              <>
                <JSONValidationSummary errors={parsedJSON.errors} />
                <div className="text-sm text-neutral4">请修复 JSON 文件中的错误后重试。</div>
              </>
            ) : (
              <>
                <div className="text-sm text-neutral4">
                  找到 {parsedJSON.items.length} 个可导入的有效数据项。
                </div>
                <JSONPreviewTable items={parsedJSON.items} maxRows={5} />
              </>
            )}
          </div>
        ) : null;
      }

      case "importing": {
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Spinner />
            <div className="text-center">
              <div className="text-lg font-medium text-neutral1">正在导入数据项...</div>
              <div className="text-sm text-neutral4 mt-1">
                {importProgress.current} / {importProgress.total}
              </div>
            </div>
          </div>
        );
      }

      case "complete": {
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-4xl">{importResult && importResult.errors === 0 ? "✓" : "⚠"}</div>
            <div className="text-center">
              <div className="text-lg font-medium text-neutral1">导入完成</div>
              <div className="text-sm text-neutral4 mt-1">
                已导入 {importResult?.success ?? 0} 个数据项
                {importResult && importResult.errors > 0 && (
                  <span className="text-accent2"> （{importResult.errors} 个错误）</span>
                )}
              </div>
            </div>
          </div>
        );
      }
      default: {
        return null;
      }
    }
  };

  // Render footer buttons based on step
  const renderFooter = () => {
    switch (step) {
      case "upload": {
        return <Button onClick={handleClose}>取消</Button>;
      }

      case "preview": {
        return (
          <>
            <Button onClick={() => setStep("upload")}>返回</Button>
            <Button variant="primary" onClick={handleImport} disabled={!canImport}>
              导入 {parsedJSON?.items.length ?? 0} 个数据项
            </Button>
          </>
        );
      }

      case "importing": {
        return null;
        // Cancel button is in the content
      }

      case "complete": {
        return (
          <Button variant="primary" onClick={handleDone}>
            完成
          </Button>
        );
      }
      default: {
        return null;
      }
    }
  };

  // Step titles
  const stepTitles: Record<ImportStep, string> = {
    complete: "导入完成",
    importing: "正在导入",
    preview: "预览数据",
    upload: "导入 JSON",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>从 JSON 文件导入数据项。</DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-[200px] max-h-[50vh] overflow-y-auto">
          {renderStepContent()}
        </DialogBody>

        <DialogFooter className="px-6 pt-4 flex justify-end gap-2">{renderFooter()}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
