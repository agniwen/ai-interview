"use client";

import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@/lib/interview-question-templates";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
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
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { Textarea } from "@/components/ui/textarea";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { interviewQuestionTemplateSchema } from "@/lib/interview-question-templates";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

function defaultValues(): InterviewQuestionTemplateInput {
  return {
    description: "",
    jobDescriptionId: null,
    questions: [{ content: "", id: crypto.randomUUID(), sortOrder: 0 }],
    scope: "global",
    title: "",
  };
}

function toFormValues(record: InterviewQuestionTemplateRecord): InterviewQuestionTemplateInput {
  return {
    description: record.description ?? "",
    jobDescriptionId: record.jobDescriptionId,
    questions: record.questions.map((question, index) => ({
      content: question.content,
      id: question.id,
      sortOrder: index,
    })),
    scope: record.scope,
    title: record.title,
  };
}

// oxlint-disable-next-line complexity -- Dialog orchestrates schema, mode, and question array state together.
export function InterviewQuestionTemplateEditorDialog({
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewQuestionTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
}) {
  const isEdit = record !== null;

  const form = useForm({
    defaultValues: record ? toFormValues(record) : defaultValues(),
    onSubmit: async ({ value }) => {
      const body = {
        description: value.description?.trim() || "",
        jobDescriptionId: value.scope === "job_description" ? value.jobDescriptionId : null,
        questions: value.questions.map((question, index) => ({
          content: question.content.trim(),
          id: question.id,
          sortOrder: index,
        })),
        scope: value.scope,
        title: value.title.trim(),
      };

      const response = await fetch(
        isEdit ? `/api/studio/interview-questions/${record.id}` : "/api/studio/interview-questions",
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
      toast.success(isEdit ? "问题模版已更新" : "问题模版已创建");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: interviewQuestionTemplateSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const currentScope = useStore(form.store, (state) => state.values.scope);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues());
    }
  }, [open, record, form]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? "编辑面试中问题模版" : "新建面试中问题模版"}</DialogTitle>
            <DialogDescription>
              面试官在面试时按顺序向候选人必问的题目；面试创建瞬间的题目内容会被冻结为快照。
            </DialogDescription>
          </DialogHeader>

          {/* -mx-1/px-1 + py-1.5 leaves room for focus rings that would otherwise be clipped by overflow-y-auto. */}
          <div className="-mx-1 mt-4 max-h-[70vh] space-y-6 overflow-y-auto px-1 py-1.5">
            <FieldGroup className="gap-5">
              <form.Field name="title">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                      <FieldLabel htmlFor={field.name}>
                        模版标题 <span className="text-destructive">*</span>
                      </FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          aria-invalid={!!errors?.length}
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="例如：通用沟通题、前端深度题"
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
                      <FieldLabel htmlFor={field.name}>说明（可选）</FieldLabel>
                      <FieldContent className="gap-2">
                        <Textarea
                          aria-invalid={!!errors?.length}
                          className="min-h-16"
                          id={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="给团队的备注，例如这套题适用于哪种候选人"
                          value={field.state.value ?? ""}
                        />
                        <FieldError errors={errors} />
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              <div className="grid gap-5 md:grid-cols-2">
                <form.Field name="scope">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        作用范围 <span className="text-destructive">*</span>
                      </FieldLabel>
                      <FieldContent className="gap-2">
                        <Select
                          onValueChange={(value) => {
                            field.handleChange(value as InterviewQuestionTemplateScope);
                            if (value === "global") {
                              form.setFieldValue("jobDescriptionId", null);
                            }
                          }}
                          value={field.state.value}
                        >
                          <SelectTrigger className="w-full" id={field.name}>
                            <SelectValue placeholder="选择作用范围" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="global">全局（所有面试）</SelectItem>
                            <SelectItem value="job_description">指定在招岗位</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                {currentScope === "job_description" ? (
                  <form.Field name="jobDescriptionId">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>
                            绑定岗位 <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <Select
                              onValueChange={(value) => field.handleChange(value)}
                              value={field.state.value ?? undefined}
                            >
                              <SelectTrigger
                                aria-invalid={!!errors?.length}
                                className="w-full"
                                id={field.name}
                              >
                                <SelectValue placeholder="选择岗位" />
                              </SelectTrigger>
                              <SelectContent>
                                {jobDescriptions.map((jd) => (
                                  <SelectItem key={jd.id} value={jd.id}>
                                    {jd.name}
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
                ) : null}
              </div>
            </FieldGroup>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">题目列表</h3>
                <form.Subscribe selector={(state) => state.values.questions.length}>
                  {(len) => <span className="text-muted-foreground text-xs">共 {len} 道</span>}
                </form.Subscribe>
              </div>
              <form.Field mode="array" name="questions">
                {/* oxlint-disable-next-line no-explicit-any */}
                {(field: any) => (
                  // oxlint-disable-next-line no-use-before-define
                  <QuestionList field={field} form={form} resetKey={record?.id ?? "new"} />
                )}
              </form.Field>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionList({
  field,
  form,
  resetKey,
}: {
  // oxlint-disable-next-line no-explicit-any
  field: any;
  // oxlint-disable-next-line no-explicit-any
  form: any;
  resetKey: string;
}) {
  const items = (field.state.value ?? []) as { id?: string; content: string; sortOrder: number }[];
  const {
    ids,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, resetKey);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          暂无题目，点击下方按钮添加。
        </p>
      ) : null}
      <SortableList
        ids={ids}
        onReorder={(from, to) => {
          field.moveValue(from, to);
          moveId(from, to);
        }}
      >
        {items.map((_item, index) => {
          const id = ids[index];
          if (!id) {
            return null;
          }
          return (
            <SortableItem id={id} key={id}>
              {({ handleProps }) => (
                <div className="flex items-start gap-2">
                  <SortableDragHandle
                    {...handleProps}
                    aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
                    className="mt-1"
                  />
                  <span className="mt-2.5 w-6 shrink-0 text-right text-muted-foreground text-sm">
                    {index + 1}.
                  </span>
                  <div className="flex-1">
                    <form.Field name={`questions[${index}].content`}>
                      {/* oxlint-disable-next-line no-explicit-any */}
                      {(subField: any) => {
                        const errors = toFieldErrors(subField.state.meta.errors);
                        return (
                          <>
                            <Textarea
                              aria-invalid={!!errors?.length}
                              className="min-h-16"
                              onBlur={subField.handleBlur}
                              onChange={(event) => subField.handleChange(event.target.value)}
                              placeholder="请输入一道必问题目…"
                              value={subField.state.value ?? ""}
                            />
                            <FieldError errors={errors} />
                          </>
                        );
                      }}
                    </form.Field>
                  </div>
                  <Button
                    aria-label={`删除第 ${index + 1} 题`}
                    className="mt-1"
                    onClick={() => {
                      field.removeValue(index);
                      removeId(index);
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              )}
            </SortableItem>
          );
        })}
      </SortableList>
      <Button
        className="self-start"
        onClick={() => {
          field.pushValue({
            content: "",
            id: crypto.randomUUID(),
            sortOrder: items.length,
          });
          pushId();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        添加题目
      </Button>
    </div>
  );
}
