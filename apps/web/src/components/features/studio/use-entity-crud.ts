"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const deleteErrorPayloadSchema = z.object({ error: z.string().optional() });

interface UseEntityCrudOptions<TList, TFull> {
  /** 调用 RPC 删除接口；返回原始 Response 由 hook 解析 error。 */
  deleteEntity: (record: TList) => Promise<Response>;
  /** 编辑前若需要异步拉详情（如 interviewer），传入这个；否则用 detailFromList。 */
  loadDetail?: (record: TList) => Promise<TFull | null>;
  /**
   * 为 true 时先打开编辑弹窗、再异步拉详情，加载期间 `detailLoading` 为 true，弹窗可显示骨架屏。
   * Open the edit dialog first and load the detail behind it, exposing `detailLoading`.
   */
  openBeforeLoad?: boolean;
  /** 列表行 → 编辑表单值同步映射；如果列表本身已经是完整记录，直接 `(r) => r as TFull`。 */
  detailFromList?: (record: TList) => TFull;
  /** Toast 文案。 */
  messages: {
    deleteSuccess: string;
    deleteFallbackError?: string;
    loadDetailError?: string;
  };
  /** 删除成功后失效缓存。 */
  invalidate: () => void;
}

/**
 * 抽出 Studio management page 共用的 dialog 状态机：
 *  - 创建 / 编辑表单弹窗的 open + 当前记录
 *  - 删除确认弹窗的 deleteRecord + 提交逻辑
 *  - openCreate / openEdit / handleDelete 三个 handler
 *
 * 调用方仍负责渲染 FormDialog / AlertDialog（或用 {@link EntityDeleteDialog}），
 * 把这里 expose 的 state + handlers 接进去即可。
 *
 * Captures the dialog/delete state machine shared across simple Studio
 * management pages. Caller still renders the dialogs themselves and wires
 * the returned state + handlers in.
 */
export function useEntityCrud<TList, TFull>(options: UseEntityCrudOptions<TList, TFull>) {
  const {
    deleteEntity,
    loadDetail,
    detailFromList,
    openBeforeLoad = false,
    messages: { deleteSuccess, deleteFallbackError = "删除失败", loadDetailError = "加载失败" },
    invalidate,
  } = options;

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TFull | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<TList | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 每次打开/关闭都递增，丢弃已过期的详情响应。Bumped on every open/close to drop stale detail responses.
  const detailRequestRef = useRef(0);

  const onFormOpenChange = useCallback((next: boolean) => {
    setFormDialogOpen(next);
    if (!next) {
      detailRequestRef.current += 1;
      setDetailLoading(false);
      setEditingRecord(null);
    }
  }, []);

  const openCreate = useCallback(() => {
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setEditingRecord(null);
    setFormDialogOpen(true);
  }, []);

  const openEdit = useCallback(
    async (record: TList) => {
      if (loadDetail && openBeforeLoad) {
        detailRequestRef.current += 1;
        const requestId = detailRequestRef.current;
        setEditingRecord(null);
        setDetailLoading(true);
        setFormDialogOpen(true);
        const full = await loadDetail(record).catch(() => null);
        if (requestId !== detailRequestRef.current) {
          return;
        }
        setDetailLoading(false);
        if (!full) {
          toast.error(loadDetailError);
          setFormDialogOpen(false);
          return;
        }
        setEditingRecord(full);
        return;
      }
      if (loadDetail) {
        const full = await loadDetail(record);
        if (!full) {
          toast.error(loadDetailError);
          return;
        }
        setEditingRecord(full);
      } else if (detailFromList) {
        setEditingRecord(detailFromList(record));
      } else {
        // 既没有 loadDetail 也没有 detailFromList：仅适合"先 open 再让 form 自己 fetch"场景。
        // Neither loader provided: caller is expected to populate editingRecord through
        // a side channel before opening; keep null and just open.
      }
      setFormDialogOpen(true);
    },
    [loadDetail, detailFromList, loadDetailError, openBeforeLoad],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteRecord) {
      return;
    }
    const response = await deleteEntity(deleteRecord);
    const payload = deleteErrorPayloadSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok) {
      toast.error((payload.success ? payload.data.error : undefined) ?? deleteFallbackError);
      return;
    }
    setDeleteRecord(null);
    toast.success(deleteSuccess);
    invalidate();
  }, [deleteRecord, deleteEntity, deleteSuccess, deleteFallbackError, invalidate]);

  return {
    deleteRecord,
    detailLoading,
    editingRecord,
    formDialogOpen,
    handleDelete,
    onFormOpenChange,
    openCreate,
    openEdit,
    setDeleteRecord,
    /** Escape hatch — only use it for non-button-driven openings (e.g. URL sync). */
    setEditingRecord,
    /** Escape hatch — for direct control over the form-open flag (rare). */
    setFormDialogOpen,
  };
}
