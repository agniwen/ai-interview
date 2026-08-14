/**
 * CSV validation utilities for dataset import
 * Validates mapped data before import, including schema validation
 */

import type { ZodSchema, ZodError, ZodIssue } from "zod3";
import { resolveSerializedZodOutput } from "@/components/features/mastra-studio/upstream/lib/form/utils";

/** Column mapping configuration */
export type ColumnMapping = Record<string, "input" | "groundTruth" | "metadata" | "ignore">;

/** Validation error for a specific row/column */
export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

/** Result of validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Field-level validation error from schema validation */
export interface FieldError {
  path: string;
  code: string;
  message: string;
}

/** Validation result for a single row */
export interface RowValidationResult {
  // 1-indexed, +1 for header
  rowNumber: number;
  field: "input" | "groundTruth";
  errors: FieldError[];
  data: unknown;
}

/** Overall CSV schema validation result */
export interface CsvValidationResult {
  validCount: number;
  invalidCount: number;
  validRows: { rowNumber: number; input: unknown; groundTruth?: unknown }[];
  invalidRows: RowValidationResult[];
  totalRows: number;
}

/**
 * Convert JSON Schema to runtime Zod schema.
 * Uses existing resolveSerializedZodOutput from lib/form/utils.
 */
function compileSchema(jsonSchema: Record<string, unknown>): ZodSchema {
  return resolveSerializedZodOutput(
    jsonSchema as Parameters<typeof resolveSerializedZodOutput>[0],
  ) as ZodSchema;
}

/**
 * Format Zod errors into FieldError array (max 5 per row).
 */
function formatErrors(error: ZodError): FieldError[] {
  return error.issues.slice(0, 5).map((issue: ZodIssue) => ({
    // Convert Zod path array to JSON Pointer string
    code: issue.code,
    message: issue.message,
    path: issue.path.length > 0 ? `/${issue.path.join("/")}` : "/",
  }));
}

/**
 * Validate CSV rows against dataset schemas.
 *
 * @param rows Mapped rows from CSV (with input/groundTruth fields)
 * @param inputSchema JSON Schema for input field (null = skip validation)
 * @param groundTruthSchema JSON Schema for groundTruth field (null = skip validation)
 * @param maxErrors Maximum number of invalid rows to collect details for (default 10)
 */
export function validateCsvRows(
  rows: { input: unknown; groundTruth?: unknown }[],
  inputSchema: Record<string, unknown> | null | undefined,
  groundTruthSchema: Record<string, unknown> | null | undefined,
  maxErrors = 10,
): CsvValidationResult {
  // No schemas = all rows valid
  if (!inputSchema && !groundTruthSchema) {
    return {
      invalidCount: 0,
      invalidRows: [],
      totalRows: rows.length,
      validCount: rows.length,
      validRows: rows.map((row, i) => ({ rowNumber: i + 2, ...row })),
    };
  }

  // Pre-compile schemas for performance
  const inputValidator = inputSchema ? compileSchema(inputSchema) : null;
  const outputValidator = groundTruthSchema ? compileSchema(groundTruthSchema) : null;

  const validRows: CsvValidationResult["validRows"] = [];
  const invalidRows: CsvValidationResult["invalidRows"] = [];
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    // +1 for 0-index, +1 for header row
    const rowNumber = i + 2;
    let isValid = true;
    let rowInvalidDetails: RowValidationResult | null = null;

    // Validate input
    if (inputValidator) {
      const result = inputValidator.safeParse(row.input);
      if (!result.success) {
        isValid = false;
        // Only collect details up to maxErrors
        if (invalidRows.length < maxErrors) {
          rowInvalidDetails = {
            data: row.input,
            errors: formatErrors(result.error),
            field: "input",
            rowNumber,
          };
        }
      }
    }

    // Validate groundTruth (only if schema enabled, value provided, and input was valid)
    if (isValid && outputValidator && row.groundTruth !== undefined) {
      const result = outputValidator.safeParse(row.groundTruth);
      if (!result.success) {
        isValid = false;
        // Only collect details up to maxErrors
        if (invalidRows.length < maxErrors) {
          rowInvalidDetails = {
            data: row.groundTruth,
            errors: formatErrors(result.error),
            field: "groundTruth",
            rowNumber,
          };
        }
      }
    }

    if (isValid) {
      validRows.push({ rowNumber, ...row });
    } else {
      invalidCount += 1;
      if (rowInvalidDetails) {
        invalidRows.push(rowInvalidDetails);
      }
    }
  }

  return {
    invalidCount,
    invalidRows,
    totalRows: rows.length,
    validCount: validRows.length,
    validRows,
  };
}

/**
 * Validate mapped CSV data before import (basic validation without schemas).
 * Checks that input columns are mapped and values are present.
 * @param data - Parsed CSV rows
 * @param mapping - Column mapping configuration
 * @returns Validation result with errors
 */
export function validateMappedData(
  data: Record<string, unknown>[],
  mapping: ColumnMapping,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Find input columns
  const inputColumns = Object.entries(mapping)
    .filter(([, role]) => role === "input")
    .map(([col]) => col);

  // Check: at least one column mapped to 'input'
  if (inputColumns.length === 0) {
    errors.push({
      column: "",
      message: "至少需要将一列映射到输入",
      // Header-level error,
      row: 0,
    });
    return { errors, valid: false };
  }

  // Validate each row
  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    // Row numbers: 1-indexed + 1 for header (first data row is 2)
    const rowNumber = i + 2;

    // Check each input column has a value
    for (const col of inputColumns) {
      const value = row[col];

      if (value === null || value === undefined || value === "") {
        errors.push({
          column: col,
          message: `输入列“${col}”不能为空`,
          row: rowNumber,
        });
      }
    }
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}
