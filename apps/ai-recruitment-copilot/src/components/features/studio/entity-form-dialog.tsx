"use client";

import { LoaderCircleIcon } from "@/components/icons/hugeicons";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /** 表单元素的 DOM id；提交按钮通过 `form={formId}` 关联。 */
  formId: string;
  /** 影响标题/按钮的「创建 vs 保存」文案。 */
  isEdit: boolean;
  /** TanStack Form 的 isSubmitting；用于按钮 loading + disable。 */
  isSubmitting: boolean;
  /** 业务额外禁用条件（如 noDepartments）—— 与 isSubmitting 取或。 */
  submitDisabled?: boolean;
  /** 表单 onSubmit；通常包一层：`() => void form.handleSubmit()`。 */
  onSubmit: () => void;
  /** Field 列；通常是若干 `<form.Field name="X">…</form.Field>`。 */
  children: ReactNode;
  /** 覆盖默认按钮文案。 */
  submitLabel?: { create: string; update: string };
}

/**
 * 简单 Studio 表单弹窗的统一外壳：Modal + footer + form 元素。
 * Field 内容由调用方通过 children 传入，搭配 {@link useEntityForm} 使用。
 *
 * Shared shell for simple Studio form dialogs (Modal + footer + form element).
 * Field rendering stays with the caller; pair with {@link useEntityForm}.
 */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "lg",
  formId,
  isEdit,
  isSubmitting,
  submitDisabled = false,
  onSubmit,
  children,
  submitLabel = { create: "创建", update: "保存" },
}: EntityFormDialogProps) {
  return (
    <Modal
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isSubmitting || submitDisabled} form={formId} type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            {isEdit ? submitLabel.update : submitLabel.create}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size={size}
      title={title}
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }}
      >
        <FieldGroup className="gap-5">{children}</FieldGroup>
      </form>
    </Modal>
  );
}
