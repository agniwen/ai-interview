"use client";

import type { CandidateFormTemplateListRecord } from "@arc/db-schema/candidate-forms";
import type { DepartmentRecord } from "@/lib/shared/departments";
import type { InterviewerListRecord } from "@/lib/shared/interviewers";
import type { InterviewQuestionTemplateListRecord } from "@arc/db-schema/interview-question-templates";
import { jobDescriptionFormSchema } from "@/lib/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@/lib/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import {
  ClipboardListIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  LoaderCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AnimatedHeight } from "@/components/animated-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const PROMPT_MAX_LENGTH = 10_000;

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

function buildInterviewerOptions(interviewers: InterviewerListRecord[]) {
  return interviewers.map((item) => ({
    description: item.departmentName ?? "未知部门",
    label: item.name,
    value: item.id,
  }));
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
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;
  const fallbackDepartmentId = departments[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState<"basic" | "interview-questions" | "forms">("basic");

  const { data: linkedForms = [], isLoading: isFormsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio.forms.$get({
        param: { slug },
        query: {
          jobDescriptionId: record?.id ?? "",
          page: "1",
          pageSize: "100",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      const payload = (await response.json()) as {
        records?: CandidateFormTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试表单失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-forms", slug, record?.id],
  });

  const { data: linkedInterviewQuestions = [], isLoading: isInterviewQuestionsLoading } = useQuery({
    enabled: open && isEdit && !!record?.id,
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["interview-questions"].$get({
        param: { slug },
        query: {
          jobDescriptionId: record?.id ?? "",
          page: "1",
          pageSize: "100",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      const payload = (await response.json()) as {
        records?: InterviewQuestionTemplateListRecord[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.records) {
        throw new Error(payload?.error ?? "加载关联面试题失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-interview-questions", slug, record?.id],
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

      const response = isEdit
        ? await rpc.api.w[":slug"].studio["job-descriptions"][":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio["job-descriptions"].$post({
            json: body,
            param: { slug },
          });
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
    <Tabs
      onValueChange={(value) => setActiveTab(value as "basic" | "interview-questions" | "forms")}
      value={activeTab}
    >
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "编辑在招岗位" : "新建在招岗位"}
        description="为在招岗位指定部门和面试官，prompt 在面试时会传给语音 agent。"
        size="xl"
        headerExtra={
          <TabsList className="mt-2">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            {isEdit ? <TabsTrigger value="interview-questions">面试题</TabsTrigger> : null}
            {isEdit ? <TabsTrigger value="forms">面试表单</TabsTrigger> : null}
          </TabsList>
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button
              disabled={isSubmitting || missingRefs}
              form="job-description-form"
              type="submit"
            >
              {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建"}
            </Button>
          </>
        }
      >
        <form
          id="job-description-form"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <AnimatedHeight>
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
                              maxLength={NAME_MAX_LENGTH}
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
                            <SearchableSelect
                              id={field.name}
                              invalid={!!errors?.length}
                              onChange={(value) => field.handleChange(value ?? "")}
                              options={departments.map((dept) => ({
                                label: dept.name,
                                value: dept.id,
                              }))}
                              placeholder="选择部门"
                              searchPlaceholder="搜索部门…"
                              value={field.state.value || null}
                            />
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
                            <SearchableMultiSelect
                              emptyMessage="没有匹配的面试官"
                              invalid={!!errors?.length}
                              onChange={(next) => field.handleChange(next)}
                              options={buildInterviewerOptions(interviewers)}
                              placeholder="选择面试官…"
                              searchPlaceholder="搜索面试官…"
                              selectedFormat={(count) => `已选 ${count} 位面试官`}
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
                          <div className="relative">
                            <Textarea
                              aria-invalid={!!errors?.length}
                              className="min-h-20 pb-6"
                              id={field.name}
                              maxLength={DESCRIPTION_MAX_LENGTH}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="简要描述岗位职责、要求等"
                              value={field.state.value ?? ""}
                            />
                            <TextareaCounter
                              maxLength={DESCRIPTION_MAX_LENGTH}
                              value={field.state.value}
                            />
                          </div>
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
                          <MarkdownEditor
                            aria-invalid={!!errors?.length}
                            id={field.name}
                            maxLength={PROMPT_MAX_LENGTH}
                            onBlur={field.handleBlur}
                            onChange={field.handleChange}
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
          </AnimatedHeight>
        </form>
      </Modal>
    </Tabs>
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
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/forms?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

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
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联表单…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的面试表单。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <Link
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/forms?templateId=${template.id}`}
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
              </CardContent>
            </Card>
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
  const slug = useWorkspaceSlug();
  const newTemplateHref = `/w/${slug}/studio/interview-questions?jobDescriptionId=${encodeURIComponent(jobDescriptionId)}`;

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
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            正在加载关联模版…
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length === 0 ? (
        <Card className="gap-0 rounded-xl border-dashed py-0">
          <CardContent className="bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
            暂无该岗位专属的面试题。
          </CardContent>
        </Card>
      ) : null}
      {!isLoading && templates.length > 0 ? (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card className="gap-0 rounded-xl py-0" key={template.id}>
              <CardContent className="p-0">
                <Link
                  className="flex items-start justify-between gap-3 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  href={`/w/${slug}/studio/interview-questions?templateId=${template.id}`}
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
