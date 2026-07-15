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
import type { ColumnMapping, FieldType } from "../../hooks/use-column-mapping";
import { useColumnMapping } from "../../hooks/use-column-mapping";
import type { ParsedCSV } from "../../hooks/use-csv-parser";
import { useCSVParser } from "../../hooks/use-csv-parser";
import { useDatasetMutations } from "../../hooks/use-dataset-mutations";
import { useDataset } from "../../hooks/use-datasets";
import type { CsvValidationResult } from "../../utils/csv-validation";
import { validateCsvRows } from "../../utils/csv-validation";
import { ColumnMappingStep } from "./column-mapping-step";
import { CSVPreviewTable } from "./csv-preview-table";
import { CSVUploadStep } from "./csv-upload-step";
import { ValidationReport } from "./validation-report";
import type { ValidationError } from "./validation-summary";
import { ValidationSummary } from "./validation-summary";

export interface CSVImportDialogProps {
  datasetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ImportStep = "upload" | "preview" | "mapping" | "validation" | "importing" | "complete";

interface ImportResult {
  success: number;
  errors: number;
}

function CSVValidationStep({
  result,
  hasSchema,
}: {
  result: CsvValidationResult;
  hasSchema: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-neutral4">
        {hasSchema ? "已按照数据集 Schema 验证各行。" : "已准备导入，无需进行 Schema 验证。"}
      </div>
      {result.invalidCount > 0 ? (
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-md">
          <div className="flex items-center gap-2 text-warning font-medium">
            <span className="text-lg">⚠</span>
            将跳过 {result.invalidCount} 行
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            将导入 {result.totalRows} 行中的 {result.validCount} 行
          </p>
        </div>
      ) : (
        <div className="p-3 bg-success/10 border border-success/30 rounded-md">
          <div className="flex items-center gap-2 text-success font-medium">
            <span className="text-lg">✓</span>
            全部 {result.totalRows} 行均有效
          </div>
        </div>
      )}
      {result.validCount === 0 && (
        <p className="text-sm text-destructive">没有可导入的有效行，请修复数据或调整 Schema。</p>
      )}
      {result.invalidCount > 0 && <ValidationReport result={result} />}
    </div>
  );
}

function ImportCompleteStep({ result }: { result: ImportResult | null }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="text-4xl">{result && result.errors === 0 ? "✓" : "⚠"}</div>
      <div className="text-center">
        <div className="text-lg font-medium text-neutral1">导入完成</div>
        <div className="text-sm text-neutral4 mt-1">
          已导入 {result?.success ?? 0} 个数据项
          {result && result.errors > 0 && (
            <span className="text-accent2"> （{result.errors} 个错误）</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-step dialog for importing CSV data into a dataset.
 * Flow: upload -> preview -> mapping -> import -> complete
 */
export function CSVImportDialog({
  datasetId,
  open,
  onOpenChange,
  onSuccess,
}: CSVImportDialogProps) {
  // State machine for steps
  const [step, setStep] = useState<ImportStep>("upload");

  // Parsed CSV data
  const [parsedCSV, setParsedCSV] = useState<ParsedCSV | null>(null);

  // Validation errors from mapping
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Import progress
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Schema validation result
  const [schemaValidation, setSchemaValidation] = useState<CsvValidationResult | null>(null);

  // Hooks
  const { parseFile, isParsing, error: parseError } = useCSVParser();
  const { batchInsertItems } = useDatasetMutations();
  const { data: dataset } = useDataset(datasetId);

  // Column mapping - initialize with empty headers, update when CSV is parsed
  const columnMapping = useColumnMapping(parsedCSV?.headers ?? []);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      try {
        const result = await parseFile(file);
        setParsedCSV(result);
        // Reset column mapping when new file is selected
        columnMapping.resetMapping();
        setStep("preview");
      } catch {
        // Error is handled in useCSVParser
      }
    },
    [parseFile, columnMapping],
  );

  // Validate mapped data before import
  const validateMappedData = useCallback((): ValidationError[] => {
    if (!parsedCSV) {
      return [];
    }

    const errors: ValidationError[] = [];
    const { data, headers } = parsedCSV;
    const { mapping } = columnMapping;

    // Find columns mapped to input
    const inputColumns = headers.filter((h) => mapping[h] === "input");

    if (inputColumns.length === 0) {
      errors.push({
        column: "输入",
        message: "至少需要将一列映射到输入",
        row: 0,
      });
      return errors;
    }

    // Check each row for missing input values
    for (const [index, row] of data.entries()) {
      // 1-indexed + header row
      const rowNum = index + 2;

      // Check if all input columns have values
      for (const col of inputColumns) {
        const value = row[col];
        if (value === null || value === undefined || value === "") {
          errors.push({
            column: col,
            message: "输入值为必填项",
            row: rowNum,
          });
        }
      }
    }

    return errors;
  }, [parsedCSV, columnMapping]);

  // Build item from row using mapping
  const buildItemFromRow = useCallback(
    (row: Record<string, unknown>, mapping: ColumnMapping, headers: string[]) => {
      // Get input value(s)
      const inputColumns = headers.filter((h) => mapping[h] === "input");
      const selectColumns = (columns: string[]) => {
        const selected: Record<string, unknown> = {};
        for (const column of columns) {
          selected[column] = row[column];
        }
        return selected;
      };
      const [inputColumn] = inputColumns;
      const input = inputColumns.length === 1 ? row[inputColumn] : selectColumns(inputColumns);

      // Get ground truth value(s)
      const groundTruthColumns = headers.filter((h) => mapping[h] === "groundTruth");
      let groundTruth: unknown | undefined;
      if (groundTruthColumns.length === 1) {
        groundTruth = row[groundTruthColumns[0]];
      } else if (groundTruthColumns.length > 1) {
        groundTruth = selectColumns(groundTruthColumns);
      }

      // Get metadata value(s)
      const metadataColumns = headers.filter((h) => mapping[h] === "metadata");
      let metadata: Record<string, unknown> | undefined;
      if (metadataColumns.length > 0) {
        metadata = selectColumns(metadataColumns);
      }

      return { groundTruth, input, metadata };
    },
    [],
  );

  // Handle validate mapping and proceed to schema validation
  const handleValidateMapping = useCallback(() => {
    const errors = validateMappedData();
    setValidationErrors(errors);

    if (errors.length > 0) {
      return;
    }

    if (!parsedCSV) {
      return;
    }

    const { data, headers } = parsedCSV;
    const { mapping } = columnMapping;

    // Build mapped rows for schema validation
    const mappedRows = data.map((row: Record<string, unknown>) =>
      buildItemFromRow(row, mapping, headers),
    );

    // Perform schema validation if dataset has schemas
    const hasSchemas = dataset?.inputSchema || dataset?.groundTruthSchema;

    if (hasSchemas) {
      const result = validateCsvRows(
        mappedRows,
        dataset?.inputSchema as Record<string, unknown> | null | undefined,
        dataset?.groundTruthSchema as Record<string, unknown> | null | undefined,
        10,
      );
      setSchemaValidation(result);

      // If no valid rows, stay on mapping step with error
      if (result.validCount === 0) {
        setValidationErrors([
          {
            column: "",
            message: "所有行均未通过 Schema 验证，请检查数据。",
            row: 0,
          },
        ]);
        return;
      }

      // Show validation step
      setStep("validation");
    } else {
      // No schemas, proceed directly to import
      setSchemaValidation({
        invalidCount: 0,
        invalidRows: [],
        totalRows: mappedRows.length,
        validCount: mappedRows.length,
        validRows: mappedRows.map(
          (
            row: { input: unknown; groundTruth?: unknown; metadata?: Record<string, unknown> },
            i: number,
          ) => ({
            rowNumber: i + 2,
            ...row,
          }),
        ),
      });
      setStep("validation");
    }
  }, [validateMappedData, parsedCSV, columnMapping, buildItemFromRow, dataset]);

  // Handle import (only valid rows from schema validation)
  const handleImport = useCallback(async () => {
    if (!schemaValidation || schemaValidation.validCount === 0) {
      return;
    }

    setStep("importing");
    setIsImporting(true);

    const rowsToImport = schemaValidation.validRows;

    setImportProgress({ current: 0, total: rowsToImport.length });

    const items = rowsToImport.map((row) => {
      const { input, groundTruth } = row;

      let metadata: Record<string, unknown> | undefined;
      if (parsedCSV) {
        const originalRowIndex = row.rowNumber - 2;
        const { headers } = parsedCSV;
        const { mapping } = columnMapping;
        const originalRow = parsedCSV.data[originalRowIndex];
        if (originalRow) {
          const metadataColumns = headers.filter((h) => mapping[h] === "metadata");
          if (metadataColumns.length > 0) {
            metadata = {};
            for (const column of metadataColumns) {
              metadata[column] = originalRow[column];
            }
          }
        }
      }

      return { groundTruth, input, metadata };
    });

    try {
      await batchInsertItems.mutateAsync({ datasetId, items });
      setImportResult({ errors: 0, success: items.length });
    } catch {
      setImportResult({ errors: items.length, success: 0 });
    }

    setImportProgress({ current: rowsToImport.length, total: rowsToImport.length });
    setIsImporting(false);
    setStep("complete");
  }, [schemaValidation, batchInsertItems, datasetId, parsedCSV, columnMapping]);

  // Handle done - close dialog and notify
  const handleDone = useCallback(() => {
    // Show success toast with counts
    if (importResult) {
      const skipped = schemaValidation?.invalidCount ?? 0;
      if (skipped > 0) {
        toast.success(`已导入 ${importResult.success} 行（跳过 ${skipped} 行）`);
      } else {
        toast.success(`已导入 ${importResult.success} 行`);
      }
    }

    onOpenChange(false);
    onSuccess?.();

    // Reset state after close animation
    setTimeout(() => {
      setStep("upload");
      setParsedCSV(null);
      setValidationErrors([]);
      setSchemaValidation(null);
      setImportProgress({ current: 0, total: 0 });
      setImportResult(null);
    }, 150);
  }, [onOpenChange, onSuccess, importResult, schemaValidation]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    if (isImporting) {
      return;
    }

    onOpenChange(false);

    // Reset state after close animation
    setTimeout(() => {
      setStep("upload");
      setParsedCSV(null);
      setValidationErrors([]);
      setSchemaValidation(null);
      setImportProgress({ current: 0, total: 0 });
      setImportResult(null);
    }, 150);
  }, [isImporting, onOpenChange]);

  // Handle mapping change
  const handleMappingChange = useCallback(
    (column: string, field: FieldType) => {
      columnMapping.setColumnField(column, field);
      // Clear validation errors when mapping changes
      setValidationErrors([]);
    },
    [columnMapping],
  );

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case "upload": {
        return (
          <CSVUploadStep
            onFileSelect={handleFileSelect}
            isParsing={isParsing}
            error={parseError?.message}
          />
        );
      }

      case "preview": {
        return parsedCSV ? (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-neutral4">预览 CSV 数据。点击“下一步”映射列。</div>
            <CSVPreviewTable headers={parsedCSV.headers} data={parsedCSV.data} maxRows={5} />
          </div>
        ) : null;
      }

      case "mapping": {
        return parsedCSV ? (
          <div className="flex flex-col gap-4">
            <ColumnMappingStep
              headers={parsedCSV.headers}
              mapping={columnMapping.mapping}
              onMappingChange={handleMappingChange}
            />

            {validationErrors.length > 0 && <ValidationSummary errors={validationErrors} />}

            {/* Compact preview */}
            <div className="border-t border-border1 pt-4">
              <div className="text-xs text-neutral4 mb-2">数据预览</div>
              <CSVPreviewTable headers={parsedCSV.headers} data={parsedCSV.data} maxRows={3} />
            </div>
          </div>
        ) : null;
      }

      case "validation": {
        return schemaValidation ? (
          <CSVValidationStep
            result={schemaValidation}
            hasSchema={Boolean(dataset?.inputSchema || dataset?.groundTruthSchema)}
          />
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
        return <ImportCompleteStep result={importResult} />;
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
            <Button variant="primary" onClick={() => setStep("mapping")}>
              下一步
            </Button>
          </>
        );
      }

      case "mapping": {
        return (
          <>
            <Button onClick={() => setStep("preview")}>返回</Button>
            <Button
              variant="primary"
              onClick={handleValidateMapping}
              disabled={!columnMapping.isInputMapped}
            >
              {dataset?.inputSchema || dataset?.groundTruthSchema ? "验证" : "下一步"}
            </Button>
          </>
        );
      }

      case "validation": {
        return (
          <>
            <Button onClick={() => setStep("mapping")}>返回</Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={!schemaValidation || schemaValidation.validCount === 0}
            >
              {schemaValidation?.invalidCount
                ? `导入 ${schemaValidation.validCount} 个有效行`
                : `导入 ${schemaValidation?.totalRows ?? 0} 行`}
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
    mapping: "映射列",
    preview: "预览数据",
    upload: "导入 CSV",
    validation: "检查验证结果",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>从 CSV 文件导入数据项。</DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-[200px] max-h-[50vh] overflow-y-auto">
          {renderStepContent()}
        </DialogBody>

        <DialogFooter className="px-6 pt-4 flex justify-end gap-2">{renderFooter()}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
