/* oxlint-disable complexity -- dialog coordinates form state, linked queries, and extracted subforms. */
"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { CandidateFormTemplateListRecord } from "@arc/db-schema/candidate-forms";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { InterviewQuestionTemplateListRecord } from "@arc/db-schema/interview-question-templates";
import { jobDescriptionFormSchema } from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { buildJobDescriptionInterviewerOptions } from "@arc/shared/job-description-interviewers";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";

import { useMemo, useRef } from "react";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobDescriptionBasicSettingsFields } from "./job-description-basic-settings-fields";
import { JobDescriptionEvaluationSection } from "./job-description-evaluation-section";
import {
  JobDescriptionAiSupplementModal,
  JobDescriptionRegeneratePreviewModal,
} from "./job-description-form-modals";
import { JobDescriptionPromptFields } from "./job-description-prompt-fields";
import { JobDescriptionStructuredFields } from "./job-description-structured-fields";
import {
  LinkedFormsList,
  LinkedInterviewQuestionTemplatesList,
} from "./job-description-linked-resources";
import {
  emptyJobDescriptionFormValues,
  focusJobDescriptionBasicTabOnInvalidSubmit,
  hasUnsavedFormChanges,
  toDepartmentScopedFormValues,
  toStructuredDraftValues,
} from "./job-description-form-values";
import type {
  JobDescriptionFormTab,
  JobDescriptionSubmitAction,
} from "./job-description-form-values";
import { useJobDescriptionFormActions } from "./use-job-description-form-actions";
import { useJobDescriptionFormState } from "./use-job-description-form-state";

export { emptyJobDescriptionFormValues } from "./job-description-form-values";

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
  const submitRef = useRef<
    ((value: JobDescriptionFormValues, action: JobDescriptionSubmitAction) => Promise<void>) | null
  >(null);
  const setActiveTabRef = useRef<((tab: JobDescriptionFormTab) => void) | null>(null);
  const resolvedInitialValues = useMemo(() => {
    if (record) {
      return toDepartmentScopedFormValues(record, interviewers);
    }
    if (initialDraft) {
      return toStructuredDraftValues(initialDraft);
    }
    return emptyJobDescriptionFormValues();
  }, [initialDraft, interviewers, record]);

  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: ({ meta, value }) => submitRef.current?.(value, meta.action),
    onSubmitInvalid: ({ formApi }) =>
      focusJobDescriptionBasicTabOnInvalidSubmit(
        formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>,
        (tab) => {
          setActiveTabRef.current?.(tab);
        },
      ),
    onSubmitMeta: { action: "save" } as { action: JobDescriptionSubmitAction },
    validators: { onSubmit: jobDescriptionFormSchema },
  });

  const formState = useJobDescriptionFormState({
    form,
    interviewers,
    open,
    record,
    resolvedInitialValues,
  });
  setActiveTabRef.current = formState.setActiveTab;
  const {
    activeTab,
    codeLocked,
    currentRecord,
    deductionRules,
    evaluationFrozen,
    isEdit,
    isLegacyJob,
    isStructuredDraft,
    pendingGeneratedJobDescription,
    preview,
    regenerateConfirmationOpen,
    ruleDraft,
    ruleDraftDirty,
    savedFormValues,
    setActiveTab,
    setDeductionRules,
    setPendingGeneratedJobDescription,
    setPreview,
    setRegenerateConfirmationOpen,
    setRuleDraft,
    setRuleDraftDirty,
    setWorkingRecord,
  } = formState;

  const {
    applyGeneratedJobDescription,
    confirmGeneratePreview,
    handleGenerateCode,
    handleGenerateJobDescription,
    handleGeneratePreview,
    handlePublish,
    isGeneratingCode,
    isGeneratingJobDescription,
    isGeneratingPreview,
    isPublishing,
    streamingRuleDraft,
    submitJobDescription,
  } = useJobDescriptionFormActions({
    currentRecord,
    deductionRules,
    departments,
    evaluationFrozen,
    form,
    interviewers,
    isEdit,
    isLegacyJob: Boolean(isLegacyJob),
    isStructuredDraft: Boolean(isStructuredDraft),
    onOpenChange,
    onSaved,
    pendingGeneratedJobDescription,
    preview,
    ruleDraft,
    ruleDraftDirty,
    savedFormValues,
    setDeductionRules,
    setPendingGeneratedJobDescription,
    setPreview,
    setRegenerateConfirmationOpen,
    setRuleDraft,
    setRuleDraftDirty,
    setWorkingRecord,
    slug,
  });

  submitRef.current = submitJobDescription;

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

  const missingRefs = departments.length === 0 || interviewers.length === 0;
  const isBusy = isGeneratingPreview || isSubmitting || isPublishing;
  let submitLabel = isEdit ? "保存" : "创建草稿";
  if (isSubmitting) {
    submitLabel = isEdit ? "保存中" : "创建中";
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
            <Button
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {isBusy ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {isBusy ? "处理中" : "取消"}
            </Button>
            <form.Subscribe selector={(state) => state.values}>
              {(values) => {
                const isPreparingPublish = !preview && (isGeneratingPreview || isSubmitting);
                const publishDisabled =
                  isBusy ||
                  missingRefs ||
                  Boolean(
                    preview && (hasUnsavedFormChanges(values, savedFormValues) || ruleDraftDirty),
                  );
                let publishLabel = preview ? "确认并发布" : "生成评分规则并继续";
                if (isPreparingPublish) {
                  publishLabel = "生成中";
                } else if (isPublishing) {
                  publishLabel = "发布中";
                }
                return isStructuredDraft ? (
                  <Button
                    disabled={publishDisabled}
                    onClick={preview ? handlePublish : handleGeneratePreview}
                    type="button"
                  >
                    {isPreparingPublish || isPublishing ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : null}
                    {publishLabel}
                  </Button>
                ) : null;
              }}
            </form.Subscribe>
            <Button disabled={isBusy || missingRefs} form="job-description-form" type="submit">
              {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {submitLabel}
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
                <JobDescriptionBasicSettingsFields
                  allowCrossDepartmentInterviewers={allowCrossDepartmentInterviewers}
                  codeLocked={codeLocked}
                  departments={departments}
                  evaluationFrozen={evaluationFrozen}
                  form={form}
                  handleGenerateCode={() => void handleGenerateCode()}
                  interviewers={interviewers}
                  interviewerOptions={interviewerOptions}
                  isGeneratingCode={isGeneratingCode}
                  selectedDepartmentId={selectedDepartmentId}
                  selectedInterviewerIds={selectedInterviewerIds}
                />

                <div
                  className={
                    isLegacyJob ? "flex flex-col gap-5" : "grid items-start gap-3 xl:grid-cols-2"
                  }
                >
                  <JobDescriptionPromptFields
                    evaluationFrozen={evaluationFrozen}
                    form={form}
                    handleGenerateJobDescription={handleGenerateJobDescription}
                    isGeneratingJobDescription={isGeneratingJobDescription}
                    isLegacyJob={Boolean(isLegacyJob)}
                  />
                  {isLegacyJob ? null : (
                    <JobDescriptionEvaluationSection
                      deductionRules={deductionRules}
                      evaluationFrozen={evaluationFrozen}
                      handleGeneratePreview={handleGeneratePreview}
                      isGeneratingPreview={isGeneratingPreview}
                      isSubmitting={isSubmitting}
                      missingRefs={missingRefs}
                      preview={preview}
                      ruleDraft={ruleDraft}
                      streamingRuleDraft={streamingRuleDraft}
                    />
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
                <LinkedInterviewQuestionTemplatesList
                  isLoading={isInterviewQuestionsLoading}
                  jobDescriptionId={currentRecord?.id ?? ""}
                  templates={linkedInterviewQuestions}
                />
              </TabsContent>
            ) : null}
            {isEdit ? (
              <TabsContent value="forms">
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
      <JobDescriptionRegeneratePreviewModal
        confirmGeneratePreview={confirmGeneratePreview}
        open={regenerateConfirmationOpen}
        setOpen={setRegenerateConfirmationOpen}
      />
      <JobDescriptionAiSupplementModal
        applyGeneratedJobDescription={applyGeneratedJobDescription}
        pending={pendingGeneratedJobDescription}
        setPending={setPendingGeneratedJobDescription}
      />
    </Tabs>
  );
}
