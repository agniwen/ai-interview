import "client-only";

import { useState } from "react";

// 用于在 Modal / Drawer 等局部弹窗里管理 page/pageSize state，
// 不参与 URL 同步（避免和外层 useDataGridState 的 nuqs key 冲突）。
// setPageSize 会自动把 page 拉回 1，与 DataGrid 的 onPageSizeChange 语义对齐。
//
// Local page/pageSize state for modals/drawers that intentionally stay out of
// the URL — useDataGridState would otherwise collide on bare `page` / `pageSize`
// query keys when both the host page and the modal live on the same route.
// setPageSize resets page to 1 to match DataGrid's onPageSizeChange contract.
export function useModalPagination(initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const setPageSize = (next: number) => {
    setPageSizeState(next);
    setPage(1);
  };

  return { page, pageSize, setPage, setPageSize };
}
