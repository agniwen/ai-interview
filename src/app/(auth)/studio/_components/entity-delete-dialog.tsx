"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EntityDeleteDialogProps<TRecord> {
  /** 当前待删除记录；为 null 时弹窗关闭。 */
  record: TRecord | null;
  /** 关闭弹窗（hook 通常传 `() => setDeleteRecord(null)`）。 */
  onClose: () => void;
  /** 用户确认删除时触发；通常透传 hook 返回的 `handleDelete`。 */
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  /**
   * 描述：可以是静态 ReactNode，也可以根据 record 动态渲染（用于
   * "已被引用，无法删除"等条件文案）。
   *
   * Description: static node, or a fn for record-dependent copy
   * (e.g. "still referenced, cannot delete").
   */
  description: ReactNode | ((record: TRecord) => ReactNode);
  /** 默认"删除"。 */
  confirmLabel?: ReactNode;
  /** 默认"取消"。 */
  cancelLabel?: ReactNode;
}

/**
 * 统一的"删除前确认"弹窗。description 支持函数式以便引用记录字段。
 * Shared confirm-before-delete dialog. `description` accepts a function
 * for record-dependent copy.
 */
export function EntityDeleteDialog<TRecord>({
  record,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "删除",
  cancelLabel = "取消",
}: EntityDeleteDialogProps<TRecord>) {
  let resolvedDescription: ReactNode = null;
  if (record !== null) {
    resolvedDescription =
      typeof description === "function"
        ? (description as (r: TRecord) => ReactNode)(record)
        : description;
  }

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={record !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{resolvedDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()} variant="destructive">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
