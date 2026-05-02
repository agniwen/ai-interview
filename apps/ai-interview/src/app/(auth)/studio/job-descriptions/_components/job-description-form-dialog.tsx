"use client";

import type { CandidateFormTemplateListRecord } from "@/lib/candidate-forms";
import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord } from "@/lib/interviewers";
import type { InterviewQuestionTemplateListRecord } from "@/lib/interview-question-templates";
import { jobDescriptionFormSchema } from "@/lib/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@/lib/job-descriptions";
import { useQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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

function InterviewerMultiSelect({
  interviewers,
  value,
  onChange,
  invalid,
}: {
  interviewers: InterviewerListRecord[];
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(value);
  const selectedItems = interviewers.filter((item) => selectedSet.has(item.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string) {
    onChange(value.filter((item) => item !== id));
  }

  return (
    <div className="space-y-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:bg-input/30",
            )}
            data-invalid={invalid ? true : undefined}
            type="button"
          >
            <span className={selectedItems.length === 0 ? "text-muted-foreground" : ""}>
              {selectedItems.length === 0 ? "选择面试官…" : `已选 ${selectedItems.length} 位面试官`}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="搜索面试官…" />
            <CommandList>
              <CommandEmpty>没有匹配的面试官</CommandEmpty>
              <CommandGroup>
                {interviewers.map((item) => {
                  const isSelected = selectedSet.has(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => toggle(item.id)}
                      value={`${item.name} ${item.departmentName ?? ""}`}
                    >
                      <CheckIcon
                        className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate">{item.name}</span>
                        <span className="truncate text-muted-foreground text-xs">
                          {item.departmentName ?? "未知部门"}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge className="gap-1 pr-0.5" key={item.id} variant="secondary">
              {item.name}
              <button
                aria-label={`移除 ${item.name}`}
                className="inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:bg-background/70 hover:opacity-100"
                onClick={() => remove(item.id)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// oxlint-disable-next-line complexity -- Dialog hosts tabs, queries, validation, and form submission together.
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
  const [activeTab, setActiveTab] = useState<"basic" | "interview-questions" | "forms">("basic");

  const { data: linkedForms = [], isLoading: isFormsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const qs = new URLSearchParams({
        jobDescriptionId: record?.id ?? "",
        page: "1",
        pageSize: "100",
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      const response = await fetch(`/api/studio/forms?${qs.toString()}`);
      const payload = (await response.json()) as {
        records?: CandidateFormTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试表单失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-forms", record?.id],
  });

  const { data: linkedInterviewQuestions = [], isLoading: isInterviewQuestionsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const qs = new URLSearchParams({
        jobDescriptionId: record?.id ?? "",
        page: "1",
        pageSize: "100",
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      const response = await fetch(`/api/studio/interview-questions?${qs.toString()}`);
      const payload = (await response.json()) as {
        records?: InterviewQuestionTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试题失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-interview-questions", record?.id],
  });

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
      toast.success(isEdit ? "在招岗位已更新" : "在招岗位已创建");
      onSaved();
      onOpenChange(false);
    },
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      const basicFields = ["name", "departmentId", "interviewerIds", "description", "prompt"];
      const hasBasicError = basicFields.some((key) => (meta[key]?.errors?.length ?? 0) > 0);
      if (hasBasicError) {
        setActiveTab("basic");
      }
    },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues(fallbackDepartmentId));
      setActiveTab("basic");
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
            <DialogTitle>{isEdit ? "编辑在招岗位" : "新建在招岗位"}</DialogTitle>
            <DialogDescription>
              为在招岗位指定部门和面试官，prompt 在面试时会传给语音 agent。
            </DialogDescription>
          </DialogHeader>

          <Tabs
            className="mt-4"
            onValueChange={(value) =>
              setActiveTab(value as "basic" | "interview-questions" | "forms")
            }
            value={activeTab}
          >
            <TabsList>
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              {isEdit ? <TabsTrigger value="interview-questions">面试题</TabsTrigger> : null}
              {isEdit ? <TabsTrigger value="forms">面试表单</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="basic">
              <FieldGroup className="mt-4 gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="name">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <FieldLabel htmlFor={field.name}>
                            岗位名称 <span className="text-destructive">*</span>
                          </FieldLabel>
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
                          <FieldLabel htmlFor={field.name}>
                            所属部门 <span className="text-destructive">*</span>
                          </FieldLabel>
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
                      return (
                        <Field
                          className="md:col-span-2"
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                        >
                          <FieldLabel>
                            面试官 <span className="text-destructive">*</span>
                            <span className="ml-2 font-normal text-muted-foreground text-xs">
                              （可多选，面试时会随机挑选一位；不限定部门）
                            </span>
                          </FieldLabel>
                          <FieldContent className="gap-2">
                            <InterviewerMultiSelect
                              interviewers={interviewers}
                              invalid={!!errors?.length}
                              onChange={(next) => field.handleChange(next)}
                              value={field.state.value}
                            />
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
                        <FieldLabel htmlFor={field.name}>
                          岗位 Prompt <span className="text-destructive">*</span>
                        </FieldLabel>
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
            </TabsContent>
            {isEdit ? (
              <TabsContent value="interview-questions">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedInterviewQuestionTemplatesList
                  isLoading={isInterviewQuestionsLoading}
                  jobDescriptionId={record?.id ?? ""}
                  templates={linkedInterviewQuestions}
                />
              </TabsContent>
            ) : null}
            {isEdit ? (
              <TabsContent value="forms">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedFormsList
                  isLoading={isFormsLoading}
                  jobDescriptionId={record?.id ?? ""}
                  templates={linkedForms}
                />
              </TabsContent>
            ) : null}
          </Tabs>

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

function LinkedFormsList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: CandidateFormTemplateListRecord[];
}) {
  const newTemplateHref = `/studio/forms?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的面试表单</p>
          <p className="mt-1 text-muted-foreground text-xs">
            候选人进入面试前需要填写下列表单；全局面试表单在「面试表单」菜单中维护。
          </p>
        </div>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={newTemplateHref} target="_blank">
            <ExternalLinkIcon className="size-3.5" />
            管理表单
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          正在加载关联表单…
        </p>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          暂无该岗位专属的面试表单。
        </p>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="space-y-2">
          {templates.map((template) => (
            <Link
              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
              href={`/studio/forms?templateId=${template.id}`}
              key={template.id}
              target="_blank"
            >
              <div className="flex min-w-0 items-start gap-3">
                <ClipboardListIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{template.title}</p>
                  {template.description ? (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                      {template.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-muted-foreground text-xs">
                    {template.questionCount} 题 · {template.submissionCount} 份答复
                  </p>
                </div>
              </div>
              <Badge variant="outline">岗位专属</Badge>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkedInterviewQuestionTemplatesList({
  isLoading,
  jobDescriptionId,
  templates,
}: {
  isLoading: boolean;
  jobDescriptionId: string;
  templates: InterviewQuestionTemplateListRecord[];
}) {
  const newTemplateHref = `/studio/interview-questions?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">岗位关联的面试题</p>
          <p className="mt-1 text-muted-foreground text-xs">
            面试创建时会自动绑定到下列面试题的最新版本；全局面试题在「面试题」菜单中维护。
          </p>
        </div>
        <Button asChild size="sm" type="button" variant="outline">
          <Link href={newTemplateHref} target="_blank">
            <ExternalLinkIcon className="size-3.5" />
            管理模版
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          正在加载关联模版…
        </p>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          暂无该岗位专属的面试题。
        </p>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="space-y-2">
          {templates.map((template) => (
            <Link
              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
              href={`/studio/interview-questions?templateId=${template.id}`}
              key={template.id}
              target="_blank"
            >
              <div className="flex min-w-0 items-start gap-3">
                <ListChecksIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{template.title}</p>
                  {template.description ? (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                      {template.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-muted-foreground text-xs">
                    {template.questionCount} 题 · {template.bindingCount} 个面试已绑定
                  </p>
                </div>
              </div>
              <Badge variant="outline">岗位专属</Badge>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
