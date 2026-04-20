"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord } from "@/lib/interviewers";
import { jobDescriptionFormSchema } from "@/lib/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@/lib/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

function defaultValues(departmentId: string): JobDescriptionFormValues {
  return {
    departmentId,
    description: "",
    interviewerIds: [],
    name: "",
    prompt: "",
  };
}

function toFormValues(record: JobDescriptionRecord): JobDescriptionFormValues {
  return {
    departmentId: record.departmentId,
    description: record.description ?? "",
    interviewerIds: [...record.interviewerIds],
    name: record.name,
    prompt: record.prompt,
  };
}

export function JobDescriptionFormDialog({
  open,
  onOpenChange,
  record,
  departments,
  interviewers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  onSaved: () => void;
}) {
  const isEdit = record !== null;
  const fallbackDepartmentId = departments[0]?.id ?? "";

  const form = useForm({
    defaultValues: record ? toFormValues(record) : defaultValues(fallbackDepartmentId),
    onSubmit: async ({ value }) => {
      const body = {
        departmentId: value.departmentId,
        description: value.description?.trim() || "",
        interviewerIds: value.interviewerIds,
        name: value.name.trim(),
        prompt: value.prompt.trim(),
      };

      const response = await fetch(
        isEdit ? `/api/studio/job-descriptions/${record.id}` : "/api/studio/job-descriptions",
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: isEdit ? "PATCH" : "POST",
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "JD 已更新" : "JD 已创建");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues(fallbackDepartmentId));
    }
  }, [open, record, form, fallbackDepartmentId]);

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? "编辑 JD" : "新建 JD"}</DialogTitle>
            <DialogDescription>
              JD 指定部门和面试官，prompt 在面试时会传给语音 agent。
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-4 gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <form.Field name="name">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                      <FieldLabel htmlFor={field.name}>JD 名称</FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          aria-invalid={!!errors?.length}
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="如：高级前端工程师"
                          value={field.state.value}
                        />
                        <FieldError errors={errors} />
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="departmentId">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                      <FieldLabel htmlFor={field.name}>所属部门</FieldLabel>
                      <FieldContent className="gap-2">
                        <Select
                          onValueChange={(value) => field.handleChange(value)}
                          value={field.state.value || undefined}
                        >
                          <SelectTrigger
                            aria-invalid={!!errors?.length}
                            className="w-full"
                            id={field.name}
                          >
                            <SelectValue placeholder="选择部门" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError errors={errors} />
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="interviewerIds">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  const selected = new Set(field.state.value);
                  const toggle = (id: string, checked: boolean) => {
                    const next = new Set(selected);
                    if (checked) {
                      next.add(id);
                    } else {
                      next.delete(id);
                    }
                    field.handleChange([...next]);
                  };

                  return (
                    <Field
                      className="md:col-span-2"
                      data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                    >
                      <FieldLabel>
                        面试官
                        <span className="ml-2 font-normal text-muted-foreground text-xs">
                          （可多选，面试时会随机挑选一位；不限定部门）
                        </span>
                      </FieldLabel>
                      <FieldContent className="gap-2">
                        <div
                          aria-invalid={!!errors?.length}
                          className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-input p-3 sm:grid-cols-2"
                        >
                          {interviewers.map((item) => {
                            const id = `jd-interviewer-${item.id}`;
                            return (
                              <label
                                className="flex cursor-pointer items-start gap-2 text-sm"
                                htmlFor={id}
                                key={item.id}
                              >
                                <Checkbox
                                  checked={selected.has(item.id)}
                                  id={id}
                                  onCheckedChange={(checked) => toggle(item.id, checked === true)}
                                />
                                <span className="flex min-w-0 flex-col leading-tight">
                                  <span className="truncate">{item.name}</span>
                                  <span className="truncate text-muted-foreground text-xs">
                                    {item.departmentName ?? "未知部门"}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          已选 {selected.size} 位
                        </span>
                        <FieldError errors={errors} />
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>
            </div>

            <form.Field name="description">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                    <FieldLabel htmlFor={field.name}>描述（可选）</FieldLabel>
                    <FieldContent className="gap-2">
                      <Textarea
                        aria-invalid={!!errors?.length}
                        className="min-h-20"
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="简要描述岗位职责、要求等"
                        value={field.state.value ?? ""}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="prompt">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                    <FieldLabel htmlFor={field.name}>JD Prompt</FieldLabel>
                    <FieldContent className="gap-2">
                      <Textarea
                        aria-invalid={!!errors?.length}
                        className="min-h-44 font-mono text-sm"
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="岗位关键职责、技术栈要求、期望的考察维度……"
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isSubmitting || missingRefs} type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
