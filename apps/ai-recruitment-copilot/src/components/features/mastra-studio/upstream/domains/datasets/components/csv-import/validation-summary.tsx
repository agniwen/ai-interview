"use client";

import { Notice } from "@mastra/playground-ui/components/Notice";

export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

export interface ValidationSummaryProps {
  errors: ValidationError[];
}

/**
 * Displays validation errors found during CSV import.
 * Returns null if no errors.
 */
export function ValidationSummary({ errors }: ValidationSummaryProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <Notice variant="destructive" title={`发现 ${errors.length} 个验证错误`}>
      <div className="max-h-[120px] overflow-y-auto space-y-1 text-sm">
        {errors.map((error: ValidationError, index: number) => (
          <div key={index}>
            行 {error.row}: <span className="font-medium">[{error.column}]</span> - {error.message}
          </div>
        ))}
      </div>
    </Notice>
  );
}
