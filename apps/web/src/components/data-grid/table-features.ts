import {
  columnPinningFeature,
  columnSizingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Minimal features for the app DataGrid (server-driven pagination/sorting).
 *
 * - columnPinningFeature: sticky start/end columns + pin cell helpers
 * - columnSizingFeature: fixed widths for select/actions pin math
 * - rowSelectionFeature: bulk select
 * - rowSortingFeature: controlled sorting (manualSorting; no client sorted model)
 *
 * Intentionally omitted for bundle size:
 * - columnVisibility (we never hide columns → use getAllCells)
 * - columnOrdering (pin edges derived from getStart/EndLeafColumns)
 * - rowPagination (page state owned outside the table)
 */
export const dataGridFeatures = tableFeatures({
  columnPinningFeature,
  columnSizingFeature,
  rowSelectionFeature,
  rowSortingFeature,
});

export type DataGridFeatures = typeof dataGridFeatures;
