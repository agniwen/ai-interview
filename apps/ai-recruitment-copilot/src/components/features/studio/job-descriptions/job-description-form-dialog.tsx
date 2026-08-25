"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { CandidateFormTemplateListRecord } from "@arc/db-schema/candidate-forms";
import type { InterviewQuestionTemplateListRecord } from "@arc/db-schema/interview-question-templates";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import { buildJobDescriptionInterviewerOptions } from "@arc/shared/job-description-interviewers";
import { jobDescriptionFormSchema } from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";
import { JobDescriptionBasicSettingsFields } from "./job-description-basic-settings-fields";
import { JobDescriptionAiSupplementModal } from "./job-description-form-modals";
import {
  emptyJobDescriptionFormValues,
  focusJobDescriptionBasicTabOnInvalidSubmit,
  toDepartmentScopedFormValues,
} from "./job-description-form-values";
import type {
  JobDescriptionFormTab,
  JobDescriptionSubmitAction,
} from "./job-description-form-values";
import {
  LinkedFormsList,
  LinkedInterviewQuestionTemplatesList,
} from "./job-description-linked-resources";
import { JobDescriptionPromptFields } from "./job-description-prompt-fields";
import { useJobDescriptionFormActions } from "./use-job-description-form-actions";

export { emptyJobDescriptionFormValues } from "./job-description-form-values";

export function isJobDescriptionFormTab(value: string): value is JobDescriptionFormTab {
  return value === "basic" || value === "interview-questions" || value === "forms";
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
  const [activeTab, setActiveTab] = useState<JobDescriptionFormTab>("basic");
  const [pendingGeneratedJobDescription, setPendingGeneratedJobDescription] = useState<{
    jobDescription: string;
    suggestedName: string;
    supplementedItems: JobDescriptionSupplementedItem[];
  } | null>(null);
  const submitRef = useRef<
    ((value: JobDescriptionFormValues, action: JobDescriptionSubmitAction) => Promise<void>) | null
  >(null);
  const resolvedInitialValues = useMemo(
    () =>
      record
        ? toDepartmentScopedFormValues(record, interviewers)
        : (initialDraft ?? emptyJobDescriptionFormValues()),
    [initialDraft, interviewers, record],
  );
  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: ({ meta, value }) => submitRef.current?.(value, meta.action),
    onSubmitInvalid: ({ formApi }) =>
      focusJobDescriptionBasicTabOnInvalidSubmit(formApi.store.state.fieldMeta, setActiveTab),
    onSubmitMeta: { action: "save" as const },
    validators: { onSubmit: jobDescriptionFormSchema },
  });
  const actions = useJobDescriptionFormActions({
    currentRecord: record,
    departments,
    form,
    onSaved: (saved) => {
      onSaved(saved);
      onOpenChange(false);
    },
    pendingGeneratedJobDescription,
    setPendingGeneratedJobDescription,
    slug,
  });

  useEffect(() => {
    submitRef.current = actions.submitJobDescription;
  }, [actions.submitJobDescription]);
  useEffect(() => {
    if (open) {
      form.reset(resolvedInitialValues);
      // oxlint-disable-next-line react/set-state-in-effect -- opening a different record resets dialog-local navigation state
      setActiveTab("basic");
      setPendingGeneratedJobDescription(null);
    }
  }, [form, open, resolvedInitialValues]);

  const { data: linkedForms = [], isLoading: isFormsLoading } = useQuery({
    enabled: open && !!record?.id,
    queryFn: async () => {
      const payload = await rpcFetch<{ records: CandidateFormTemplateListRecord[] }>(
        rpc.api.w[":slug"].studio.forms.$get({
          param: { slug },
          query: {
            jobDescriptionId: record?.id ?? "",
            page: "1",
            pageSize: "100",
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        }),
        "加载关联表单题失败",
      );
      return payload.records;
    },
    queryKey: ["job-description-linked-forms", slug, record?.id],
  });
  const { data: linkedInterviewQuestions = [], isLoading: isInterviewQuestionsLoading } = useQuery({
    enabled: open && !!record?.id,
    queryFn: async () => {
      const payload = await rpcFetch<{ records: InterviewQuestionTemplateListRecord[] }>(
        rpc.api.w[":slug"].studio["interview-questions"].$get({
          param: { slug },
          query: {
            jobDescriptionId: record?.id ?? "",
            page: "1",
            pageSize: "100",
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        }),
        "加载关联沟通题失败",
      );
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

  return (
    <Tabs
      onValueChange={(value) => isJobDescriptionFormTab(value) && setActiveTab(value)}
      value={activeTab}
    >
      <Modal
        bodyClassName="px-5 py-3"
        description="岗位 JD 是 AI 评价的唯一岗位要求来源；内容较少时仍可保存，但建议写清职责和核心要求。"
        footer={
          <>
            <Button
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={isSubmitting || missingRefs}
              form="job-description-form"
              type="submit"
            >
              {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {isSubmitting ? "保存中" : "保存"}
            </Button>
          </>
        }
        headerExtra={
          record ? (
            <TabsList className="mt-2">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="interview-questions">沟通题</TabsTrigger>
              <TabsTrigger value="forms">表单题</TabsTrigger>
            </TabsList>
          ) : null
        }
        onOpenChange={onOpenChange}
        open={open}
        size="2xl"
        title={record ? "编辑在招岗位" : "创建在招岗位"}
      >
        <form
          id="job-description-form"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TabsContent value="basic">
            <FieldGroup className="mt-2 gap-4">
              <JobDescriptionBasicSettingsFields
                allowCrossDepartmentInterviewers={allowCrossDepartmentInterviewers}
                codeLocked={Boolean(record?.code)}
                departments={departments}
                evaluationFrozen={false}
                form={form}
                handleGenerateCode={actions.handleGenerateCode}
                interviewers={interviewers}
                interviewerOptions={interviewerOptions}
                isGeneratingCode={actions.isGeneratingCode}
                selectedDepartmentId={selectedDepartmentId}
                selectedInterviewerIds={selectedInterviewerIds}
              />
              <JobDescriptionPromptFields
                form={form}
                handleGenerateJobDescription={actions.handleGenerateJobDescription}
                isGeneratingJobDescription={actions.isGeneratingJobDescription}
              />
            </FieldGroup>
          </TabsContent>
          {record ? (
            <TabsContent value="interview-questions">
              <LinkedInterviewQuestionTemplatesList
                isLoading={isInterviewQuestionsLoading}
                jobDescriptionId={record.id}
                templates={linkedInterviewQuestions}
              />
            </TabsContent>
          ) : null}
          {record ? (
            <TabsContent value="forms">
              <LinkedFormsList
                isLoading={isFormsLoading}
                jobDescriptionId={record.id}
                templates={linkedForms}
              />
            </TabsContent>
          ) : null}
        </form>
      </Modal>
      <JobDescriptionAiSupplementModal
        applyGeneratedJobDescription={actions.applyGeneratedJobDescription}
        pending={pendingGeneratedJobDescription}
        setPending={setPendingGeneratedJobDescription}
      />
    </Tabs>
  );
}
