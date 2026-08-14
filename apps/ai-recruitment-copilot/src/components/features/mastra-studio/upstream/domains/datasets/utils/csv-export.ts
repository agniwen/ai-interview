import type { DatasetItem } from "@mastra/client-js";
import Papa from "papaparse";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Export dataset items to CSV and trigger download
 * Columns: input, groundTruth, createdAt
 */
export function exportItemsToCSV(items: DatasetItem[], filename: string): void {
  // Map items to CSV rows
  const rows = items.map((item) => ({
    createdAt:
      item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt ?? ""),
    groundTruth: formatValue(item.groundTruth),
    input: formatValue(item.input),
  }));

  // Generate CSV with headers
  const csv = Papa.unparse(rows, {
    header: true,
    quotes: true,
  });

  // Create and trigger download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
