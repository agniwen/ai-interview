"use client";

import type { DepartmentRecord } from "@/lib/departments";
import { interviewerFormSchema } from "@/lib/interviewers";
import type { InterviewerFormValues, InterviewerRecord } from "@/lib/interviewers";
import { useForm, useStore } from "@tanstack/react-form";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { DEFAULT_MINIMAX_VOICE_ID, MINIMAX_VOICES } from "@/lib/minimax-voices";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

function defaultValues(departmentId: string): InterviewerFormValues {
  return {
    departmentId,
    description: "",
    name: "",
    prompt: "",
    voice: DEFAULT_MINIMAX_VOICE_ID,
  };
}

function toFormValues(record: InterviewerRecord): InterviewerFormValues {
  return {
    departmentId: record.departmentId,
    description: record.description ?? "",
    name: record.name,
    prompt: record.prompt,
    voice: record.voice,
  };
}

export function InterviewerFormDialog({
  open,
  onOpenChange,
  record,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewerRecord | null;
  departments: DepartmentRecord[];
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
        name: value.name.trim(),
        prompt: value.prompt.trim(),
        voice: value.voice,
      };

      const response = await fetch(
        isEdit ? `/api/studio/interviewers/${record.id}` : "/api/studio/interviewers",
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
      toast.success(isEdit ? "面试官已更新" : "面试官已创建");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: interviewerFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues(fallbackDepartmentId));
    }
  }, [open, record, form, fallbackDepartmentId]);

  const noDepartments = departments.length === 0;

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
            <DialogTitle>{isEdit ? "编辑面试官" : "新建面试官"}</DialogTitle>
            <DialogDescription>
              面试官 prompt 与音色会在开始面试时传给语音 agent。
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="mt-4 gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <form.Field name="name">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                      <FieldLabel htmlFor={field.name}>名称</FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          aria-invalid={!!errors?.length}
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="如：技术面试官 · 后端方向"
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
                          disabled={noDepartments}
                          onValueChange={(value) => field.handleChange(value)}
                          value={field.state.value || undefined}
                        >
                          <SelectTrigger
                            aria-invalid={!!errors?.length}
                            className="w-full"
                            id={field.name}
                          >
                            <SelectValue
                              placeholder={noDepartments ? "请先创建部门" : "选择部门"}
                            />
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

              <form.Field name="voice">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field
                      className="md:col-span-2"
                      data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                    >
                      <FieldLabel htmlFor={field.name}>音色（TTS）</FieldLabel>
                      <FieldContent className="gap-2">
                        <Select
                          onValueChange={(value) =>
                            field.handleChange(value as typeof field.state.value)
                          }
                          value={field.state.value}
                        >
                          <SelectTrigger
                            aria-invalid={!!errors?.length}
                            className="w-full"
                            id={field.name}
                          >
                            <SelectValue placeholder="选择音色" />
                          </SelectTrigger>
                          <SelectContent>
                            {MINIMAX_VOICES.map((voice) => (
                              <SelectItem key={voice.id} value={voice.id}>
                                <div className="flex flex-col">
                                  <span>{voice.label}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {voice.description}
                                  </span>
                                </div>
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
                        placeholder="简要说明该面试官的定位或擅长领域"
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
                    <FieldLabel htmlFor={field.name}>Prompt</FieldLabel>
                    <FieldContent className="gap-2">
                      <Textarea
                        aria-invalid={!!errors?.length}
                        className="min-h-44 font-mono text-sm"
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="你是一位资深的后端技术面试官……（描述面试官人设、风格、关注点）"
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
            <Button disabled={isSubmitting || noDepartments} type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
