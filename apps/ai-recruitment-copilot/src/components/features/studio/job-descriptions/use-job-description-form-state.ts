import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionDeductionRules } from "@arc/db-schema/job-description-structured-config";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import {
  recordEvaluationPreview,
  toDepartmentScopedFormValues,
} from "./job-description-form-values";
import type { JobDescriptionFormApi, JobDescriptionFormTab } from "./job-description-form-values";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";
import { useEffect, useMemo, useState } from "react";

export function useJobDescriptionFormState({
  open,
  record,
  interviewers,
  form,
  resolvedInitialValues,
}: {
  open: boolean;
  record: JobDescriptionRecord | null;
  interviewers: InterviewerListRecord[];
  form: JobDescriptionFormApi;
  resolvedInitialValues: JobDescriptionFormValues;
}) {
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
  const savedFormValues = useMemo(
    () =>
      currentRecord
        ? toDepartmentScopedFormValues(currentRecord, interviewers)
        : resolvedInitialValues,
    [currentRecord, interviewers, resolvedInitialValues],
  );

  // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
  useEffect(() => setWorkingRecord(record), [record]);

  useEffect(() => {
    if (open) {
      form.reset(resolvedInitialValues);
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
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

  return {
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
    workingRecord,
  };
}
