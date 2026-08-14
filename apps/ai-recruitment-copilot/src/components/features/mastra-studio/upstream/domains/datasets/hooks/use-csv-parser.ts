"use client";

import Papa from "papaparse";
import { useCallback, useState } from "react";
import { parseRow } from "../utils/json-cell-parser";

/** Result of parsing a CSV file */
export interface ParsedCSV {
  headers: string[];
  data: Record<string, unknown>[];
  errors: Papa.ParseError[];
  warnings: string[];
}

/** Size threshold for using web worker (1MB) */
const WORKER_THRESHOLD = 1_000_000;

/**
 * Hook for parsing CSV files with JSON cell handling
 * Uses web worker for large files (>1MB)
 */
export function useCSVParser() {
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const parseFile = useCallback(async (file: File): Promise<ParsedCSV> => {
    setIsParsing(true);
    setError(null);

    try {
      const useWorker = file.size > WORKER_THRESHOLD;

      const { promise, reject, resolve } = Promise.withResolvers<ParsedCSV>();
      Papa.parse<Record<string, string>>(file, {
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          // Extract headers from first row fields or meta
          const headers = results.meta.fields ?? [];

          // Process each row through JSON cell parser
          const allWarnings: string[] = [];
          const processedData = results.data.map((row: Record<string, string>, index: number) => {
            const parsed = parseRow(row);

            // Prefix warnings with row number
            for (const w of parsed.warnings) {
              allWarnings.push(`Row ${index + 2}: ${w}`);
            }

            return parsed.data;
          });

          resolve({
            data: processedData,
            errors: results.errors,
            headers,
            warnings: allWarnings,
          });
        },
        dynamicTyping: false,
        error: (err: Error) => {
          reject(new Error(err.message));
        },
        header: true,
        skipEmptyLines: "greedy",
        worker: useWorker,
      });
      return await promise;
    } catch (caughtError) {
      const parseError = caughtError instanceof Error ? caughtError : new Error("解析 CSV 失败");
      setError(parseError);
      throw parseError;
    } finally {
      setIsParsing(false);
    }
  }, []);

  return {
    error,
    isParsing,
    parseFile,
  };
}
