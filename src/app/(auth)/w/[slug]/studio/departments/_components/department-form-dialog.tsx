"use client";

import type { DepartmentFormValues, DepartmentRecord } from "@/lib/shared/departments";
import { departmentFormSchema } from "@/lib/shared/departments";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { toast } from "sonner";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntityFormDialog } from "@/app/(auth)/w/[slug]/studio/_components/entity-form-dialog";
import { useEntityForm } from "@/app/(auth)/w/[slug]/studio/_components/entity-form";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

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

  const { form, isSubmitting } = useEntityForm<DepartmentFormValues>({
    buildValues: () => (record ? toFormValues(record) : defaultValues()),
    onSubmit: async (value) => {
      const body = {
        description: value.description?.trim() || "",
        name: value.name.trim(),
      };

      const response = isEdit
        ? await rpc.api.w[":slug"].studio.departments[":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio.departments.$post({ json: body, param: { slug } });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

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
      description="部门用于对面试官和在招岗位进行组织分组。"
      formId="department-form"
      isEdit={isEdit}
      isSubmitting={isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={() => void form.handleSubmit()}
      open={open}
      size="md"
      title={isEdit ? "编辑部门" : "新建部门"}
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
                <Textarea
                  aria-invalid={!!errors?.length}
                  className="max-h-48 min-h-24 resize-none"
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="简要说明该部门的职责或定位"
                  rows={3}
                  value={field.state.value ?? ""}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
    </EntityFormDialog>
  );
}
