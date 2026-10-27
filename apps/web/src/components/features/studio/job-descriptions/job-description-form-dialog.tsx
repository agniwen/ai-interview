"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { DepartmentRecord } from "@app/shared/departments";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import {
  buildJobDescriptionInterviewerOptions,
  filterInterviewerIdsByDepartment,
} from "@app/shared/job-description-interviewers";
import { jobDescriptionFormSchema } from "@app/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@app/shared/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { DepartmentFormDialog } from "@/components/features/studio/departments/department-form-dialog";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { EditorPageSurface } from "../editor-page-surface";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";
import { JobDescriptionBasicSettingsFields } from "./job-description-basic-settings-fields";
import { JobDescriptionAiSupplementModal } from "./job-description-form-modals";
import {
  emptyJobDescriptionFormValues,
  focusJobDescriptionBasicTabOnInvalidSubmit,
  toDepartmentScopedFormValues,
} from "./job-description-form-values";
import type { JobDescriptionFormTab } from "./job-description-form-values";
import {
  LinkedFormsList,
  LinkedInterviewQuestionTemplatesList,
} from "./job-description-linked-resources";
import { JobDescriptionPromptFields } from "./job-description-prompt-fields";
import { useJobDescriptionFormActions } from "./use-job-description-form-actions";

export function isJobDescriptionFormTab(value: string): value is JobDescriptionFormTab {
  return value === "basic" || value === "interview-questions" || value === "forms";
}

// oxlint-disable-next-line complexity -- Shared editor retains existing tabs, creation dependencies, and page/dialog presentation.
export function JobDescriptionFormDialog({
  presentation = "dialog",
  defaultDepartmentId = "",
  initialDraft,
  open,
  onOpenChange,
  record,
  departments,
  interviewers,
  onDepartmentCreated,
  onSaved,
  onCreated,
}: {
  /** 新建岗位时预选的部门（如当前部门栏选中的部门）。Department preselected for a new job. */
  defaultDepartmentId?: string;
  presentation?: "dialog" | "page";
  initialDraft?: JobDescriptionFormValues | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  /** 表单内新建部门后刷新部门列表。Refreshes the department list after an inline create. */
  onDepartmentCreated?: () => Promise<void> | void;
  onSaved: (record: JobDescriptionRecord) => void;
  onCreated?: (id: string) => void;
}) {
  const Surface = presentation === "page" ? EditorPageSurface : Modal;
  const slug = useWorkspaceSlug();
  const canCreateDepartment = useHasPermission("department", "create");
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<JobDescriptionFormTab>("basic");
  const [pendingGeneratedJobDescription, setPendingGeneratedJobDescription] = useState<{
    jobDescription: string;
    suggestedName: string;
    supplementedItems: JobDescriptionSupplementedItem[];
  } | null>(null);
  const submitRef = useRef<((value: JobDescriptionFormValues) => Promise<void>) | null>(null);
  const resolvedInitialValues = useMemo(
    () =>
      record
        ? toDepartmentScopedFormValues(record, interviewers)
        : (initialDraft ?? {
            ...emptyJobDescriptionFormValues(),
            departmentId: defaultDepartmentId,
          }),
    [defaultDepartmentId, initialDraft, interviewers, record],
  );
  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: ({ value }) => submitRef.current?.(value),
    onSubmitInvalid: ({ formApi }) =>
      focusJobDescriptionBasicTabOnInvalidSubmit(formApi.store.state.fieldMeta, setActiveTab),
    validators: { onSubmit: jobDescriptionFormSchema },
  });
  const actions = useJobDescriptionFormActions({
    currentRecord: record,
    departments,
    form,
    onSaved: (saved) => {
      onSaved(saved);
      if (!record && onCreated) {
        onCreated(saved.id);
      } else {
        onOpenChange(false);
      }
    },
    pendingGeneratedJobDescription,
    setPendingGeneratedJobDescription,
    slug,
  });

  useEffect(() => {
    submitRef.current = actions.submitJobDescription;
  }, [actions.submitJobDescription]);
  // 只在打开或切换记录时重置；打开期间部门/面试官列表刷新（如表单内新建部门）不能清掉正在编辑的内容。
  // Reset only on open or a record switch; list refreshes while open (e.g. an inline department
  // create) must not wipe in-progress edits.
  const resetOnOpen = useEffectEvent(() => {
    form.reset(resolvedInitialValues);
    setActiveTab("basic");
    setPendingGeneratedJobDescription(null);
  });
  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/set-state-in-effect -- opening a different record resets dialog-local navigation state
      resetOnOpen();
    }
  }, [defaultDepartmentId, initialDraft, open, record]);

  const { data: workspaceMembers } = useQuery({
    enabled: open,
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.options.$get({ param: { slug } }),
        "加载工作区成员失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
  const reportingManagerOptions = useMemo(
    () =>
      (workspaceMembers?.records ?? []).map((member) => ({
        avatarUrl: member.image,
        label: member.name,
        value: member.id,
      })),
    [workspaceMembers?.records],
  );

  const { data: linkedForms = [], isLoading: isFormsLoading } = useQuery({
    enabled: open && !!record?.id,
    queryFn: async () => {
      const payload = await rpcFetch(
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
      const payload = await rpcFetch(
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
  // 部门可在表单内新建，只有面试官缺失时才无法保存。Departments can be created inline.
  const missingRefs = interviewers.length === 0;

  async function handleDepartmentCreated({ id }: { id: string }) {
    await onDepartmentCreated?.();
    form.setFieldValue("departmentId", id);
    form.setFieldValue(
      "interviewerIds",
      filterInterviewerIdsByDepartment(
        interviewers,
        id,
        form.getFieldValue("interviewerIds"),
        form.getFieldValue("allowCrossDepartmentInterviewers"),
      ),
    );
  }

  return (
    <Tabs
      onValueChange={(value) => isJobDescriptionFormTab(value) && setActiveTab(value)}
      value={activeTab}
    >
      <Surface
        bodyClassName="px-5 py-3"
        description="岗位 JD 用于描述职责和核心要求；内部标准可补充仅供招聘端使用的评价依据。"
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
          className="relative"
          id="job-description-form"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TabsContent motion="page" value="basic">
            <div
              className={
                presentation === "page" ? "mx-auto w-full max-w-4xl space-y-6" : "mt-2 space-y-4"
              }
            >
              <FieldGroup className="min-w-0">
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
                  onCreateDepartment={
                    canCreateDepartment ? () => setDepartmentDialogOpen(true) : undefined
                  }
                  reportingManagerOptions={reportingManagerOptions}
                  selectedDepartmentId={selectedDepartmentId}
                  selectedInterviewerIds={selectedInterviewerIds}
                />
              </FieldGroup>
              <FieldGroup className="min-w-0 gap-6">
                <JobDescriptionPromptFields
                  form={form}
                  handleGenerateJobDescription={actions.handleGenerateJobDescription}
                  isGeneratingJobDescription={actions.isGeneratingJobDescription}
                />
              </FieldGroup>
            </div>
          </TabsContent>
          {record ? (
            <TabsContent motion="page" value="interview-questions">
              <LinkedInterviewQuestionTemplatesList
                isLoading={isInterviewQuestionsLoading}
                jobDescriptionId={record.id}
                templates={linkedInterviewQuestions}
              />
            </TabsContent>
          ) : null}
          {record ? (
            <TabsContent motion="page" value="forms">
              <LinkedFormsList
                isLoading={isFormsLoading}
                jobDescriptionId={record.id}
                templates={linkedForms}
              />
            </TabsContent>
          ) : null}
        </form>
      </Surface>
      {/* 只有具备部门创建权限时才会出现打开入口。Only reachable through the permission-gated button. */}
      <DepartmentFormDialog
        onOpenChange={setDepartmentDialogOpen}
        onSaved={handleDepartmentCreated}
        open={departmentDialogOpen}
        record={null}
      />
      <JobDescriptionAiSupplementModal
        applyGeneratedJobDescription={actions.applyGeneratedJobDescription}
        pending={pendingGeneratedJobDescription}
        setPending={setPendingGeneratedJobDescription}
      />
    </Tabs>
  );
}
