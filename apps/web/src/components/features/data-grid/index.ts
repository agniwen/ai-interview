// src/components/features/data-grid/index.ts
// Public API for the DataGrid component family.
// Filled in as each part is built.

export { getPinningStyles } from "./parts/pinned-cell";
export { selectColumn } from "./columns/select-column";
export { textColumn, type TextColumnOptions } from "./columns/text-column";
export { dateColumn, type DateColumnOptions } from "./columns/date-column";
export { badgeColumn, type BadgeColumnOptions } from "./columns/badge-column";
export { customColumn, type CustomColumnOptions } from "./columns/custom-column";
export { MemberCell, getMemberInitials, type MemberCellProps } from "./cells/member-cell";
export {
  ActionsColumnHeader,
  TABLE_ACTION_BUTTON_CLASS,
  actionsColumn,
  estimateActionsColumnSize,
  type ActionInline,
  type ActionMenuItem,
  type ActionsColumnOptions,
} from "./columns/actions-column";
export {
  useDataGridState,
  type DataGridFetchParams,
  type DataGridFetchResult,
  type UseDataGridStateOptions,
} from "./use-data-grid-state";
export {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
  type DataGridQueryState,
  type DataGridSortOrder,
} from "./query-contract";
export {
  DataGrid,
  DataGridContentSkeleton,
  type BulkActionContext,
  type DataGridColumnDef,
  type DataGridProps,
} from "./data-grid";
export type {
  DataGridCellEditRequest,
  DataGridCellsChangeDetails,
  DataGridColumnCellEdit,
} from "@/components/reui/data-grid/data-grid";
export { dataGridFeatures, type DataGridFeatures } from "./table-features";
export { type ToolbarFilterConfig } from "./parts/toolbar";
