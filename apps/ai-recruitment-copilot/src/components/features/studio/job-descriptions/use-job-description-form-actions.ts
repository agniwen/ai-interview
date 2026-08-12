import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionDeductionRules } from "@arc/db-schema/job-description-structured-config";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { withCleanup } from "@/lib/client/async-control";
import { useState } from "react";
import { toast } from "sonner";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";
import { hasUnsavedFormChanges, toDepartmentScopedFormValues } from "./job-description-form-values";
import type {
  JobDescriptionFormApi,
  JobDescriptionMutationPayload,
  JobDescriptionSubmitAction,
} from "./job-description-form-values";

interface EvaluationPreview {
  blueprint: JobEvaluationBlueprint;
  blueprintHash: string;
}

interface PendingGeneratedJobDescription {
  jobDescription: string;
  suggestedName: string;
  supplementedItems: JobDescriptionSupplementedItem[];
}

export function useJobDescriptionFormActions({
  slug,
  form,
  currentRecord,
  setWorkingRecord,
  isEdit,
  isLegacyJob,
  evaluationFrozen,
  isStructuredDraft,
  interviewers,
  departments,
  savedFormValues,
  deductionRules,
  setDeductionRules,
  preview,
  setPreview,
  ruleDraft,
  setRuleDraft,
  ruleDraftDirty,
  setRuleDraftDirty,
  pendingGeneratedJobDescription,
  setPendingGeneratedJobDescription,
  setRegenerateConfirmationOpen,
  onSaved,
  onOpenChange,
}: {
  slug: string;
  form: JobDescriptionFormApi;
  currentRecord: JobDescriptionRecord | null;
  setWorkingRecord: (record: JobDescriptionRecord | null) => void;
  isEdit: boolean;
  isLegacyJob: boolean;
  evaluationFrozen: boolean;
  isStructuredDraft: boolean;
  interviewers: InterviewerListRecord[];
  departments: DepartmentRecord[];
  savedFormValues: JobDescriptionFormValues;
  deductionRules: JobDescriptionDeductionRules;
  setDeductionRules: (rules: JobDescriptionDeductionRules) => void;
  preview: EvaluationPreview | null;
  setPreview: (preview: EvaluationPreview | null) => void;
  ruleDraft: JobEvaluationRuleDraft | null;
  setRuleDraft: (draft: JobEvaluationRuleDraft | null) => void;
  ruleDraftDirty: boolean;
  setRuleDraftDirty: (dirty: boolean) => void;
  pendingGeneratedJobDescription: PendingGeneratedJobDescription | null;
  setPendingGeneratedJobDescription: (pending: PendingGeneratedJobDescription | null) => void;
  setRegenerateConfirmationOpen: (open: boolean) => void;
  onSaved: (record: JobDescriptionRecord) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingJobDescription, setIsGeneratingJobDescription] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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

  return {
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
    submitJobDescription,
  };
}
