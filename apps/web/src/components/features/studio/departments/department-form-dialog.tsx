"use client";
import { apiResponse } from "@/lib/client/api/rpc-fetch";
import { createWorkspaceDepartment, updateWorkspaceDepartment } from "@/lib/client/backend-api";

import type { DepartmentFormValues, DepartmentRecord } from "@arc/shared/departments";
import { departmentFormSchema } from "@arc/shared/departments";

import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { toast } from "sonner";
import { useCallback } from "react";
import { z } from "zod";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { EntityFormDialog } from "@/components/features/studio/entity-form-dialog";
import { useEntityForm } from "@/components/features/studio/entity-form";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const errorPayloadSchema = z.object({ error: z.string().optional() }).nullable();

function defaultValues(): DepartmentFormValues {
  return { description: "", name: "" };
}

function toFormValues(record: DepartmentRecord): DepartmentFormValues {
  return {
    description: record.description ?? "",
    name: record.name,
  };
}

export function DepartmentFormDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DepartmentRecord | null;
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;
  const buildValues = useCallback(
    () => (record ? toFormValues(record) : defaultValues()),
    [record],
  );

  const { form, isSubmitting } = useEntityForm<DepartmentFormValues>({
    buildValues,
    onSubmit: async (value) => {
      const body = {
        description: value.description?.trim() || "",
        name: value.name.trim(),
      };

      const response = isEdit
        ? await apiResponse(
            updateWorkspaceDepartment({ body, path: { id: record.id, workspaceSlug: slug } }),
          )
        : await apiResponse(createWorkspaceDepartment({ body, path: { workspaceSlug: slug } }));

      const rawPayload = await response.json().catch(() => null);
      const parsedPayload = errorPayloadSchema.safeParse(rawPayload);
      const payload = parsedPayload.success ? parsedPayload.data : null;

      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }

      toast.success(isEdit ? "部门已更新" : "部门已创建");
      onSaved();
      onOpenChange(false);
    },
    open,
    schema: departmentFormSchema,
  });

  return (
    <EntityFormDialog
      formId="department-form"
      isEdit={isEdit}
      isSubmitting={isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={async () => {
        await form.handleSubmit();
      }}
      open={open}
      size="md"
      title={isEdit ? "编辑部门" : "创建部门"}
    >
      <form.Field name="name">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>
                部门名称 <span className="text-destructive">*</span>
              </FieldLabel>
              <FieldContent className="gap-2">
                <Input
                  aria-invalid={!!errors?.length}
                  id={field.name}
                  maxLength={NAME_MAX_LENGTH}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="如：研发部、产品部"
                  value={field.state.value}
                />

                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="description">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>描述（可选）</FieldLabel>
              <FieldContent className="gap-2">
                <div className="relative">
                  <Textarea
                    aria-invalid={!!errors?.length}
                    className="max-h-48 min-h-24 resize-none pb-6"
                    id={field.name}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="简要说明该部门的职责或定位"
                    rows={3}
                    value={field.state.value ?? ""}
                  />

                  <TextareaCounter maxLength={DESCRIPTION_MAX_LENGTH} value={field.state.value} />
                </div>
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
    </EntityFormDialog>
  );
}
