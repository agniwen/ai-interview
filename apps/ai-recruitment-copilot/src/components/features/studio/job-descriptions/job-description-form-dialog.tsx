/* oxlint-disable complexity, max-lines -- root form coordinates validation, persistence, blueprint lifecycle, and extracted subforms. */
"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { CandidateFormTemplateListRecord } from "@arc/db-schema/candidate-forms";
import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { InterviewQuestionTemplateListRecord } from "@arc/db-schema/interview-question-templates";
import type { JobDescriptionDeductionRules } from "@arc/db-schema/job-description-structured-config";
import {
  createDefaultJobDescriptionStructuredConfig,
  createDefaultResumeScreeningPolicy,
  jobDescriptionFormSchema,
} from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import {
  buildJobDescriptionInterviewerOptions,
  filterInterviewerIdsByDepartment,
  getDepartmentSyncedInterviewerSelection,
} from "@arc/shared/job-description-interviewers";
import { rpc } from "@/lib/client/rpc";
import { withCleanup } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/features/markdown-editor";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import { JobDescriptionStructuredFields } from "./job-description-structured-fields";
import { JobEvaluationBlueprintPreview } from "./job-evaluation-blueprint-preview";
import {
  LinkedFormsList,
  LinkedInterviewQuestionTemplatesList,
} from "./job-description-linked-resources";
import { SUPPLEMENTED_SECTION_LABELS } from "./ai-job-description";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";

const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 500;
const PROMPT_MAX_LENGTH = 10_000;
const JOB_SETTING_FIELD_CLASS = "px-3.5 py-2.5 @md/field-group:gap-4";
const JOB_SETTING_CONTROL_CLASS =
  "flex w-full flex-col gap-2 @md/field-group:basis-80 @md/field-group:shrink-0";

type JobDescriptionFormTab = "basic" | "interview-questions" | "forms";
type JobDescriptionSubmitAction = "preview" | "save";
type JobDescriptionMutationPayload = Partial<JobDescriptionRecord> & { error?: string };

function recordEvaluationPreview(record: JobDescriptionRecord | null) {
  if (record?.evaluationBlueprintPreview && record.evaluationBlueprintPreviewHash) {
    return {
      blueprint: record.evaluationBlueprintPreview,
      blueprintHash: record.evaluationBlueprintPreviewHash,
    };
  }
  if (record?.evaluationBlueprint && record.evaluationBlueprintHash) {
    return {
      blueprint: record.evaluationBlueprint,
      blueprintHash: record.evaluationBlueprintHash,
    };
  }
  return null;
}

export function emptyJobDescriptionFormValues(): JobDescriptionFormValues {
  return {
    allowCrossDepartmentInterviewers: false,
    code: "",
    departmentId: "",
    description: "",
    interviewerIds: [],
    name: "",
    prompt: "",
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
  };
}

function toFormValues(record: JobDescriptionRecord): JobDescriptionFormValues {
  const isStructured = record.evaluationMode === "structured";
  const description = record.description?.trim() ?? "";
  const prompt = record.prompt.trim();
  return {
    allowCrossDepartmentInterviewers: record.allowCrossDepartmentInterviewers,
    code: record.code ?? "",
    departmentId: record.departmentId,
    description: isStructured ? "" : (record.description ?? ""),
    interviewerIds: [...record.interviewerIds],
    name: record.name,
    prompt: isStructured ? prompt || description : record.prompt,
    resumeScreeningPolicy: record.resumeScreeningPolicy,
    structuredConfig: record.structuredConfig,
  };
}

function toStructuredDraftValues(values: JobDescriptionFormValues): JobDescriptionFormValues {
  const description = values.description?.trim() ?? "";
  const prompt = values.prompt.trim();
  return {
    ...values,
    description: "",
    prompt: prompt || description,
  };
}

function toDepartmentScopedFormValues(
  record: JobDescriptionRecord,
  interviewers: InterviewerListRecord[],
): JobDescriptionFormValues {
  const values = toFormValues(record);
  return {
    ...values,
    interviewerIds: filterInterviewerIdsByDepartment(
      interviewers,
      values.departmentId,
      values.interviewerIds,
      values.allowCrossDepartmentInterviewers,
    ),
  };
}

function normalizeDepartmentId(value: string | null): string {
  return value ?? "";
}

function hasUnsavedFormChanges(
  values: JobDescriptionFormValues,
  savedValues: JobDescriptionFormValues,
): boolean {
  return JSON.stringify(values) !== JSON.stringify(savedValues);
}

export function JobDescriptionFormDialog({
  initialDraft,
  open,
  onOpenChange,
  record,
  departments,
  interviewers,
  onSaved,
}: {
  initialDraft?: JobDescriptionFormValues | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  onSaved: (record: JobDescriptionRecord) => void;
}) {
  const slug = useWorkspaceSlug();
  const [workingRecord, setWorkingRecord] = useState<JobDescriptionRecord | null>(record);
  const currentRecord = workingRecord;
  const isEdit = currentRecord !== null;
  const isLegacyJob = currentRecord?.evaluationMode === "legacy";
  const evaluationFrozen = Boolean(
    currentRecord?.evaluationMode === "legacy" ||
    (currentRecord?.evaluationMode === "structured" &&
      currentRecord.lifecycleStatus === "published"),
  );
  const isStructuredDraft =
    currentRecord?.evaluationMode === "structured" && currentRecord.lifecycleStatus === "draft";
  const codeLocked = Boolean(currentRecord?.code);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingJobDescription, setIsGeneratingJobDescription] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [preview, setPreview] = useState<{
    blueprint: JobEvaluationBlueprint;
    blueprintHash: string;
  } | null>(() => recordEvaluationPreview(record));
  const [ruleDraft, setRuleDraft] = useState<JobEvaluationRuleDraft | null>(() => {
    const initialPreview = recordEvaluationPreview(record);
    return initialPreview ? toJobEvaluationRuleDraft(initialPreview.blueprint) : null;
  });
  const [ruleDraftDirty, setRuleDraftDirty] = useState(false);
  const [regenerateConfirmationOpen, setRegenerateConfirmationOpen] = useState(false);
  const [deductionRules, setDeductionRules] = useState<JobDescriptionDeductionRules>(
    () =>
      record?.structuredConfig.deductionRules ??
      createDefaultJobDescriptionStructuredConfig().deductionRules,
  );
  const [activeTab, setActiveTab] = useState<JobDescriptionFormTab>("basic");
  const [pendingGeneratedJobDescription, setPendingGeneratedJobDescription] = useState<{
    jobDescription: string;
    suggestedName: string;
    supplementedItems: JobDescriptionSupplementedItem[];
  } | null>(null);
  const resolvedInitialValues = useMemo(() => {
    if (record) {
      return toDepartmentScopedFormValues(record, interviewers);
    }
    if (initialDraft) {
      return toStructuredDraftValues(initialDraft);
    }
    return emptyJobDescriptionFormValues();
  }, [initialDraft, interviewers, record]);
  const savedFormValues = useMemo(
    () =>
      currentRecord
        ? toDepartmentScopedFormValues(currentRecord, interviewers)
        : resolvedInitialValues,
    [currentRecord, interviewers, resolvedInitialValues],
  );

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
        throw new Error(payload?.error ?? "加载关联表单题失败");
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
        throw new Error(payload?.error ?? "加载关联沟通题失败");
      }
      return payload.records;
    },
    queryKey: ["job-description-linked-interview-questions", slug, record?.id],
  });

  const form = useForm({
    defaultValues: resolvedInitialValues,
    // oxlint-disable-next-line no-use-before-define -- preview submission resets this form, so the handler closes over the initialized form instance.
    onSubmit: ({ meta, value }) => submitJobDescription(value, meta.action),
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      const basicFields = [
        "code",
        "name",
        "departmentId",
        "allowCrossDepartmentInterviewers",
        "interviewerIds",
        "description",
        "prompt",
      ];
      const hasBasicError = basicFields.some((key) => (meta[key]?.errors?.length ?? 0) > 0);
      const hasStructuredError = Object.entries(meta).some(
        ([key, fieldMeta]) =>
          (key === "structuredConfig" || key.startsWith("structuredConfig.")) &&
          (fieldMeta.errors?.length ?? 0) > 0,
      );
      if (hasBasicError || hasStructuredError) {
        setActiveTab("basic");
      }
    },
    onSubmitMeta: { action: "save" } as { action: JobDescriptionSubmitAction },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const allowCrossDepartmentInterviewers = useStore(
    form.store,
    (state) => state.values.allowCrossDepartmentInterviewers,
  );
  const selectedDepartmentId = useStore(form.store, (state) => state.values.departmentId);
  const selectedInterviewerIds = useStore(form.store, (state) => state.values.interviewerIds);
  const interviewerOptions = useMemo(
    () =>
      buildJobDescriptionInterviewerOptions(
        interviewers,
        selectedDepartmentId,
        allowCrossDepartmentInterviewers,
      ),
    [allowCrossDepartmentInterviewers, interviewers, selectedDepartmentId],
  );

  useEffect(() => setWorkingRecord(record), [record]);

  useEffect(() => {
    if (open) {
      form.reset(resolvedInitialValues);
      setActiveTab("basic");
      setPendingGeneratedJobDescription(null);
      const nextPreview = recordEvaluationPreview(record);
      setPreview(nextPreview);
      setRuleDraft(nextPreview ? toJobEvaluationRuleDraft(nextPreview.blueprint) : null);
      setRuleDraftDirty(false);
      setDeductionRules(
        record?.structuredConfig.deductionRules ??
          createDefaultJobDescriptionStructuredConfig().deductionRules,
      );
    }
  }, [
    form,
    open,
    record?.evaluationBlueprintPreview,
    record?.evaluationBlueprintPreviewHash,
    record?.evaluationBlueprint,
    record?.evaluationBlueprintHash,
    record?.structuredConfig.deductionRules,
    record,
    resolvedInitialValues,
  ]);

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  async function persistJob(value: JobDescriptionFormValues): Promise<JobDescriptionRecord | null> {
    const structuredBody = {
      allowCrossDepartmentInterviewers: value.allowCrossDepartmentInterviewers,
      code: value.code?.trim() || undefined,
      departmentId: value.departmentId,
      description: isLegacyJob ? value.description?.trim() || "" : "",
      interviewerIds: value.interviewerIds,
      name: value.name.trim(),
      prompt: value.prompt.trim(),
      structuredConfig: value.structuredConfig,
    };
    const body =
      currentRecord?.evaluationMode === "legacy"
        ? {
            ...structuredBody,
            resumeScreeningPolicy: value.resumeScreeningPolicy,
          }
        : structuredBody;

    let response;
    if (currentRecord && evaluationFrozen) {
      response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"].operational.$patch({
        json: {
          allowCrossDepartmentInterviewers: value.allowCrossDepartmentInterviewers,
          departmentId: value.departmentId,
          interviewerIds: value.interviewerIds,
        },
        param: { id: currentRecord.id, slug },
      });
    } else if (currentRecord) {
      response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"].$patch({
        json: body,
        param: { id: currentRecord.id, slug },
      });
    } else {
      response = await rpc.api.w[":slug"].studio["job-descriptions"].$post({
        json: structuredBody,
        param: { slug },
      });
    }
    const payload = (await response
      .json()
      .catch(() => null)) as JobDescriptionMutationPayload | null;
    if (!response.ok) {
      toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
      return null;
    }
    if (!payload?.id) {
      toast.error(isEdit ? "更新失败" : "创建失败");
      return null;
    }
    const savedRecord = payload as JobDescriptionRecord;
    setWorkingRecord(savedRecord);
    return savedRecord;
  }

  async function requestEvaluationBlueprintPreview(jobDescriptionId: string) {
    const response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"][
      "evaluation-blueprint-preview"
    ].$post({
      param: { id: jobDescriptionId, slug },
    });
    const payload = (await response.json().catch(() => null)) as {
      blueprint?: JobEvaluationBlueprint;
      blueprintHash?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.blueprint || !payload.blueprintHash) {
      toast.error(payload?.error ?? "生成评分规则失败");
      return null;
    }
    return {
      blueprint: payload.blueprint,
      blueprintHash: payload.blueprintHash,
    };
  }

  async function requestSaveEvaluationRuleDraft(
    jobDescriptionId: string,
    nextDeductionRules: JobDescriptionDeductionRules,
    expectedBlueprintHash: string,
    nextRuleDraft: JobEvaluationRuleDraft,
  ) {
    const response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"][
      "evaluation-rule-draft"
    ].$put({
      json: {
        deductionRules: nextDeductionRules,
        expectedBlueprintHash,
        ruleDraft: nextRuleDraft,
      },
      param: { id: jobDescriptionId, slug },
    });
    const payload = (await response.json().catch(() => null)) as {
      blueprint?: JobEvaluationBlueprint;
      blueprintHash?: string;
      error?: string;
    } | null;
    if (!response.ok || !payload?.blueprint || !payload.blueprintHash) {
      toast.error(payload?.error ?? "保存评分规则失败");
      return null;
    }
    return { blueprint: payload.blueprint, blueprintHash: payload.blueprintHash };
  }

  async function submitJobDescription(
    value: JobDescriptionFormValues,
    action: JobDescriptionSubmitAction,
  ) {
    if (action === "preview") {
      if (isLegacyJob || evaluationFrozen || (currentRecord && !isStructuredDraft)) {
        return;
      }
      setIsGeneratingPreview(true);
      await withCleanup(
        async () => {
          const submittedPrompt = value.prompt;
          const savedRecord = await persistJob({
            ...value,
            structuredConfig: { ...value.structuredConfig, deductionRules },
          });
          if (!savedRecord) {
            return;
          }
          form.reset({
            ...toDepartmentScopedFormValues(savedRecord, interviewers),
            prompt: submittedPrompt,
          });
          const generatedPreview = await requestEvaluationBlueprintPreview(savedRecord.id);
          if (!generatedPreview) {
            onSaved(savedRecord);
            return;
          }
          setPreview(generatedPreview);
          setRuleDraft(toJobEvaluationRuleDraft(generatedPreview.blueprint));
          setRuleDraftDirty(false);
          setDeductionRules(savedRecord.structuredConfig.deductionRules);
          const previewRecord = {
            ...savedRecord,
            evaluationBlueprintPreview: generatedPreview.blueprint,
            evaluationBlueprintPreviewHash: generatedPreview.blueprintHash,
            prompt: submittedPrompt,
          };
          setWorkingRecord(previewRecord);
          onSaved(previewRecord);
          toast.success("当前草稿已保存，评分规则已生成，请确认后发布");
        },
        () => setIsGeneratingPreview(false),
      );
      return;
    }
    const formDirty = hasUnsavedFormChanges(form.store.state.values, savedFormValues);
    if (ruleDraftDirty && formDirty) {
      toast.error("岗位内容与评分规则均有修改，请重新生成评分规则后再保存。");
      return;
    }
    if (ruleDraftDirty && !isLegacyJob && currentRecord && preview && ruleDraft) {
      const savedRules = await requestSaveEvaluationRuleDraft(
        currentRecord.id,
        deductionRules,
        preview.blueprintHash,
        ruleDraft,
      );
      if (!savedRules) {
        return;
      }
      setPreview(savedRules);
      setRuleDraft(toJobEvaluationRuleDraft(savedRules.blueprint));
      setRuleDraftDirty(false);
      const finalRecord = {
        ...currentRecord,
        evaluationBlueprintPreview: savedRules.blueprint,
        evaluationBlueprintPreviewHash: savedRules.blueprintHash,
        structuredConfig: { ...currentRecord.structuredConfig, deductionRules },
      };
      setWorkingRecord(finalRecord);
      toast.success("评分规则已保存");
      onSaved(finalRecord);
      return;
    }
    if (!formDirty && currentRecord) {
      return;
    }
    const savedRecord = await persistJob(value);
    if (!savedRecord) {
      return;
    }
    toast.success(isEdit ? "在招岗位已更新" : "在招岗位已创建");
    onSaved(savedRecord);
  }

  async function handleGenerateCode() {
    setIsGeneratingCode(true);
    await withCleanup(
      async () => {
        const response = await rpc.api.w[":slug"].studio["job-descriptions"]["generate-code"].$post(
          {
            param: { slug },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        if (!response.ok || !payload?.code) {
          toast.error(payload?.error ?? "生成岗位编码失败");
          return;
        }
        form.setFieldValue("code", payload.code);
      },
      () => setIsGeneratingCode(false),
    );
  }

  async function handleGenerateJobDescription() {
    const { values } = form.store.state;
    const currentJobDescription = values.prompt.trim();
    if (!currentJobDescription) {
      toast.error("请先填写岗位 JD");
      return;
    }

    setIsGeneratingJobDescription(true);
    await withCleanup(
      async () => {
        const response = await rpc.api.w[":slug"].studio["job-descriptions"]["ai-generate"].$post({
          json: {
            departmentName:
              departments.find((department) => department.id === values.departmentId)?.name ??
              undefined,
            jobName: values.name.trim() || undefined,
            prompt: currentJobDescription,
          },
          param: { slug },
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          jobDescription?: string;
          suggestedName?: string;
          supplementedItems?: JobDescriptionSupplementedItem[];
        } | null;
        if (!response.ok || !payload?.jobDescription || !payload.suggestedName) {
          toast.error(payload?.error ?? "AI 生成岗位 JD 失败");
          return;
        }
        setPendingGeneratedJobDescription({
          jobDescription: payload.jobDescription,
          suggestedName: payload.suggestedName,
          supplementedItems: payload.supplementedItems ?? [],
        });
      },
      () => setIsGeneratingJobDescription(false),
    );
  }

  function applyGeneratedJobDescription() {
    if (!pendingGeneratedJobDescription) {
      return;
    }
    form.setFieldValue("prompt", pendingGeneratedJobDescription.jobDescription);
    if (!form.store.state.values.name.trim()) {
      form.setFieldValue("name", pendingGeneratedJobDescription.suggestedName);
    }
    setPendingGeneratedJobDescription(null);
    toast.success("AI 生成内容已填入岗位 JD，请核对后保存");
  }

  function handleGeneratePreview() {
    if (ruleDraftDirty) {
      setRegenerateConfirmationOpen(true);
      return;
    }
    void form.handleSubmit({ action: "preview" });
  }

  function confirmGeneratePreview() {
    setRegenerateConfirmationOpen(false);
    void form.handleSubmit({ action: "preview" });
  }

  async function handlePublish() {
    if (!currentRecord || !preview) {
      return;
    }
    setIsPublishing(true);
    await withCleanup(
      async () => {
        const response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"].publish.$post({
          json: { confirmedBlueprintHash: preview.blueprintHash },
          param: { id: currentRecord.id, slug },
        });
        const payload = (await response
          .json()
          .catch(() => null)) as JobDescriptionMutationPayload | null;
        if (!response.ok) {
          toast.error(payload?.error ?? "发布岗位失败");
          return;
        }
        if (!payload?.id) {
          toast.error("发布岗位失败");
          return;
        }
        toast.success("岗位已发布，评估设置已冻结");
        setWorkingRecord(payload as JobDescriptionRecord);
        onSaved(payload as JobDescriptionRecord);
        onOpenChange(false);
      },
      () => setIsPublishing(false),
    );
  }

  return (
    <Tabs onValueChange={(value) => setActiveTab(value as JobDescriptionFormTab)} value={activeTab}>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "编辑在招岗位" : "新建在招岗位"}
        description={
          isLegacyJob
            ? "旧版评估配置只读；这里仅维护所属部门、跨部门范围和面试官。需要修改评估设置时，请从岗位列表发起新版升级。"
            : "岗位 JD 同时用于简历评估和 AI 面试，请确认要求清晰、分层且可量化。"
        }
        bodyClassName={isLegacyJob ? undefined : "px-5 py-3"}
        footerClassName={isLegacyJob ? undefined : "px-5 py-3"}
        headerClassName={isLegacyJob ? undefined : "px-5 pt-4 pb-3"}
        size={isLegacyJob ? "xl" : "3xl"}
        headerExtra={
          isEdit ? (
            <TabsList className="mt-2">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="interview-questions">沟通题</TabsTrigger>
              <TabsTrigger value="forms">表单题</TabsTrigger>
            </TabsList>
          ) : null
        }
        footer={
          <>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <form.Subscribe selector={(state) => state.values}>
              {(values) =>
                isStructuredDraft && preview ? (
                  <Button
                    disabled={
                      hasUnsavedFormChanges(values, savedFormValues) ||
                      ruleDraftDirty ||
                      isPublishing ||
                      isSubmitting
                    }
                    onClick={handlePublish}
                    type="button"
                  >
                    {isPublishing ? <IconLoader2 className="size-4 animate-spin" /> : null}
                    确认并发布
                  </Button>
                ) : null
              }
            </form.Subscribe>
            <Button
              disabled={isSubmitting || missingRefs}
              form="job-description-form"
              type="submit"
            >
              {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "保存" : "创建草稿"}
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
              <FieldGroup className={isLegacyJob ? "mt-4 gap-5" : "mt-2 gap-3"}>
                <div className="divide-y overflow-hidden rounded-lg border">
                  <form.Field name="name">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field
                          className={JOB_SETTING_FIELD_CLASS}
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          orientation="responsive"
                        >
                          <FieldContent className="min-w-0 gap-0.5">
                            <FieldLabel htmlFor={field.name}>
                              岗位名称 <span className="text-destructive">*</span>
                            </FieldLabel>
                            <FieldDescription className="text-xs leading-relaxed">
                              显示在岗位列表、候选人和面试记录中。
                            </FieldDescription>
                          </FieldContent>
                          <div className={JOB_SETTING_CONTROL_CLASS}>
                            <Input
                              aria-invalid={!!errors?.length}
                              id={field.name}
                              disabled={evaluationFrozen}
                              maxLength={NAME_MAX_LENGTH}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              placeholder="如：高级前端工程师"
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="code">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      const canGenerateCode = !codeLocked && !isGeneratingCode;
                      let codeButtonLabel = "生成";
                      if (codeLocked) {
                        codeButtonLabel = "已生成";
                      } else if (isGeneratingCode) {
                        codeButtonLabel = "生成中";
                      }
                      return (
                        <Field
                          className={JOB_SETTING_FIELD_CLASS}
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          orientation="responsive"
                        >
                          <FieldContent className="min-w-0 gap-0.5">
                            <FieldLabel htmlFor={field.name}>岗位编码</FieldLabel>
                            <FieldDescription className="text-xs leading-relaxed">
                              用于内部识别；保存时可自动生成。
                            </FieldDescription>
                          </FieldContent>
                          <div className={JOB_SETTING_CONTROL_CLASS}>
                            <InputGroup>
                              <InputGroupInput
                                aria-invalid={!!errors?.length}
                                className={
                                  field.state.value ? "font-mono" : "text-muted-foreground"
                                }
                                id={field.name}
                                placeholder="保存时自动生成"
                                readOnly
                                value={field.state.value ?? ""}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  disabled={!canGenerateCode}
                                  onClick={handleGenerateCode}
                                  type="button"
                                >
                                  {codeButtonLabel}
                                </InputGroupButton>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={errors} />
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="departmentId">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field
                          className={JOB_SETTING_FIELD_CLASS}
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          orientation="responsive"
                        >
                          <FieldContent className="min-w-0 gap-0.5">
                            <FieldLabel htmlFor={field.name}>
                              所属部门 <span className="text-destructive">*</span>
                            </FieldLabel>
                            <FieldDescription className="text-xs leading-relaxed">
                              决定默认可选择的面试官范围。
                            </FieldDescription>
                          </FieldContent>
                          <div className={JOB_SETTING_CONTROL_CLASS}>
                            <SearchableSelect
                              id={field.name}
                              invalid={!!errors?.length}
                              onChange={(value) => {
                                const nextDepartmentId = normalizeDepartmentId(value);
                                field.handleChange(nextDepartmentId);
                                form.setFieldValue(
                                  "interviewerIds",
                                  filterInterviewerIdsByDepartment(
                                    interviewers,
                                    nextDepartmentId,
                                    selectedInterviewerIds,
                                    allowCrossDepartmentInterviewers,
                                  ),
                                );
                              }}
                              options={departments.map((dept) => ({
                                label: dept.name,
                                value: dept.id,
                              }))}
                              placeholder="选择部门"
                              searchPlaceholder="搜索部门…"
                              value={field.state.value || null}
                            />
                            <FieldError errors={errors} />
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>

                  <form.Field name="allowCrossDepartmentInterviewers">
                    {(field) => (
                      <Field
                        className={`${JOB_SETTING_FIELD_CLASS} @md/field-group:items-center!`}
                        orientation="responsive"
                      >
                        <FieldContent className="min-w-0 gap-0.5">
                          <FieldLabel htmlFor={field.name}>允许匹配跨部门面试官</FieldLabel>
                          <FieldDescription className="text-xs leading-relaxed">
                            关闭时仅可选择所属部门面试官；开启后可选择任意部门。
                          </FieldDescription>
                        </FieldContent>
                        <div className="flex w-full justify-end @md/field-group:basis-80 @md/field-group:shrink-0">
                          <Switch
                            checked={field.state.value}
                            className="h-6! w-11! [&_[data-slot=switch-thumb]]:size-5!"
                            id={field.name}
                            onCheckedChange={(checked) => {
                              field.handleChange(checked);
                              if (!checked) {
                                form.setFieldValue(
                                  "interviewerIds",
                                  filterInterviewerIdsByDepartment(
                                    interviewers,
                                    selectedDepartmentId,
                                    selectedInterviewerIds,
                                    false,
                                  ),
                                );
                              }
                            }}
                          />
                        </div>
                      </Field>
                    )}
                  </form.Field>

                  <form.Field name="interviewerIds">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field
                          className={JOB_SETTING_FIELD_CLASS}
                          data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          orientation="responsive"
                        >
                          <FieldContent className="min-w-0 gap-0.5">
                            <FieldLabel htmlFor={field.name}>
                              面试官 <span className="text-destructive">*</span>
                            </FieldLabel>
                            <FieldDescription className="text-xs leading-relaxed">
                              选择负责该岗位的一位或多位面试官。
                            </FieldDescription>
                          </FieldContent>
                          <div className={JOB_SETTING_CONTROL_CLASS}>
                            <SearchableMultiSelect
                              emptyMessage="没有匹配的面试官"
                              id={field.name}
                              invalid={!!errors?.length}
                              onChange={(next) => {
                                const synced = getDepartmentSyncedInterviewerSelection({
                                  allowCrossDepartmentInterviewers,
                                  currentDepartmentId: selectedDepartmentId,
                                  interviewers,
                                  nextInterviewerIds: next,
                                  previousInterviewerIds: field.state.value,
                                });
                                if (synced.departmentId !== selectedDepartmentId) {
                                  form.setFieldValue("departmentId", synced.departmentId);
                                }
                                field.handleChange(synced.interviewerIds);
                              }}
                              options={interviewerOptions}
                              placeholder="选择面试官…"
                              searchPlaceholder="搜索面试官…"
                              selectedFormat={(count) => `已选 ${count} 位面试官`}
                              selectedPreviewLimit={3}
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </div>
                        </Field>
                      );
                    }}
                  </form.Field>
                </div>

                <div className="flex flex-col gap-5">
                  {isLegacyJob ? (
                    <form.Field name="description">
                      {(field) => {
                        const errors = toFieldErrors(field.state.meta.errors);
                        return (
                          <Field
                            data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                          >
                            <FieldLabel htmlFor={field.name}>描述</FieldLabel>
                            <FieldContent className="gap-1">
                              <div className="relative">
                                <Textarea
                                  aria-invalid={!!errors?.length}
                                  className="min-h-36 pb-6"
                                  id={field.name}
                                  disabled={evaluationFrozen}
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
                  ) : null}

                  <form.Field name="prompt">
                    {(field) => {
                      const errors = toFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                          <div className="flex items-center justify-between gap-3">
                            <FieldLabel htmlFor={field.name}>
                              {isLegacyJob ? "岗位 Prompt" : "岗位 JD"}{" "}
                              <span className="text-destructive">*</span>
                            </FieldLabel>
                            {!isLegacyJob && !evaluationFrozen ? (
                              <Button
                                disabled={isGeneratingJobDescription || !field.state.value.trim()}
                                onClick={() => void handleGenerateJobDescription()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {isGeneratingJobDescription ? (
                                  <IconLoader2 className="size-4 animate-spin" />
                                ) : null}
                                {isGeneratingJobDescription ? "生成中…" : "一键生成 JD"}
                              </Button>
                            ) : null}
                          </div>
                          <FieldContent className="gap-1">
                            <MarkdownEditor
                              aria-invalid={!!errors?.length}
                              id={field.name}
                              disabled={evaluationFrozen}
                              maxLength={PROMPT_MAX_LENGTH}
                              minHeight={isLegacyJob ? 112 : 192}
                              onBlur={field.handleBlur}
                              onChange={field.handleChange}
                              placeholder={
                                isLegacyJob
                                  ? "岗位关键职责、技术栈要求、期望的考察维度……"
                                  : "明确填写岗位职责、核心与辅助技能、经验、项目、学历及其他要求……"
                              }
                              showPreview
                              value={field.state.value}
                            />
                            <FieldError errors={errors} />
                          </FieldContent>
                        </Field>
                      );
                    }}
                  </form.Field>
                  {isLegacyJob ? null : (
                    <div className="flex flex-col gap-2">
                      <div className="flex min-h-8 items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">评分规则</p>
                          <p className="text-muted-foreground text-xs">
                            根据岗位 JD 和下方结构化设置生成，可继续编辑并核对后发布。
                          </p>
                        </div>
                        {evaluationFrozen ? null : (
                          <Button
                            disabled={isGeneratingPreview || isSubmitting || missingRefs}
                            onClick={handleGeneratePreview}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {isGeneratingPreview ? (
                              <IconLoader2 className="size-4 animate-spin" />
                            ) : null}
                            {isGeneratingPreview
                              ? "生成中…"
                              : `${preview ? "重新" : ""}生成评分规则`}
                          </Button>
                        )}
                      </div>
                      {preview && ruleDraft ? (
                        <div className="flex flex-col gap-2">
                          {ruleDraftDirty ? (
                            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:bg-amber-950/30 dark:text-amber-300">
                              评分规则有未保存修改，保存岗位后才可发布。
                            </p>
                          ) : null}
                          <JobEvaluationBlueprintPreview
                            deductionRules={deductionRules}
                            disabled={evaluationFrozen}
                            onDeductionRulesChange={(nextDeductionRules) => {
                              setDeductionRules(nextDeductionRules);
                              setRuleDraftDirty(true);
                            }}
                            onRuleDraftChange={(nextRuleDraft) => {
                              setRuleDraft(nextRuleDraft);
                              setRuleDraftDirty(true);
                            }}
                            ruleDraft={ruleDraft}
                          />
                        </div>
                      ) : (
                        <Card className="border-dashed">
                          <CardContent className="flex min-h-28 items-center justify-center p-4 text-center text-muted-foreground text-sm">
                            填写岗位 JD 和结构化设置后，点击“生成评分规则”查看结果。
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </FieldGroup>
              {isLegacyJob ? null : (
                <form.Field name="structuredConfig">
                  {(field) => (
                    <JobDescriptionStructuredFields
                      config={field.state.value}
                      disabled={evaluationFrozen}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              )}
            </TabsContent>
            {isEdit ? (
              <TabsContent value="interview-questions">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedInterviewQuestionTemplatesList
                  isLoading={isInterviewQuestionsLoading}
                  jobDescriptionId={currentRecord?.id ?? ""}
                  templates={linkedInterviewQuestions}
                />
              </TabsContent>
            ) : null}
            {isEdit ? (
              <TabsContent value="forms">
                {/* oxlint-disable-next-line no-use-before-define */}
                <LinkedFormsList
                  isLoading={isFormsLoading}
                  jobDescriptionId={currentRecord?.id ?? ""}
                  templates={linkedForms}
                />
              </TabsContent>
            ) : null}
          </AnimatedHeight>
        </form>
      </Modal>
      <Modal
        description="重新生成会覆盖当前尚未保存的人工评分规则修改。"
        footer={
          <>
            <Button
              onClick={() => setRegenerateConfirmationOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button onClick={confirmGeneratePreview} type="button">
              确认重新生成
            </Button>
          </>
        }
        onOpenChange={setRegenerateConfirmationOpen}
        open={regenerateConfirmationOpen}
        size="sm"
        title="覆盖人工修改？"
      >
        <p className="text-muted-foreground text-sm">
          岗位 JD、结构化设置和当前扣分配置会作为新的生成依据。
        </p>
      </Modal>
      <Modal
        description="以下内容在原岗位 JD 中不明确，AI 已在新 JD 中补充。请认真核对，确认后仍可直接编辑。"
        footer={
          <>
            <Button
              onClick={() => setPendingGeneratedJobDescription(null)}
              type="button"
              variant="outline"
            >
              返回修改
            </Button>
            <Button onClick={applyGeneratedJobDescription} type="button">
              确认并采用
            </Button>
          </>
        }
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingGeneratedJobDescription(null);
          }
        }}
        open={pendingGeneratedJobDescription !== null}
        size="lg"
        title="请核对 AI 补充内容"
      >
        {pendingGeneratedJobDescription?.supplementedItems.length ? (
          <ul className="space-y-2">
            {pendingGeneratedJobDescription.supplementedItems.map((item, index) => (
              <li
                className="rounded-md border bg-muted/30 px-3 py-2"
                key={`${item.section}-${index}`}
              >
                <span className="font-medium">{SUPPLEMENTED_SECTION_LABELS[item.section]}</span>
                <span className="text-muted-foreground">：{item.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
            未发现明显缺失信息，AI 主要优化了岗位 JD 的结构和表述。
          </div>
        )}
      </Modal>
    </Tabs>
  );
}
