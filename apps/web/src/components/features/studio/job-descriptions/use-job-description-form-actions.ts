import type { DepartmentRecord } from "@app/shared/departments";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@app/shared/job-descriptions";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { runAsyncAction } from "@/lib/client/async-control";
import { useState } from "react";
import { toast } from "sonner";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";
import type {
  JobDescriptionFormApi,
  JobDescriptionSubmitAction,
} from "./job-description-form-values";

interface PendingGeneratedJobDescription {
  jobDescription: string;
  suggestedName: string;
  supplementedItems: JobDescriptionSupplementedItem[];
}

export function useJobDescriptionFormActions({
  slug,
  form,
  currentRecord,
  departments,
  pendingGeneratedJobDescription,
  setPendingGeneratedJobDescription,
  onSaved,
}: {
  slug: string;
  form: JobDescriptionFormApi;
  currentRecord: JobDescriptionRecord | null;
  departments: DepartmentRecord[];
  pendingGeneratedJobDescription: PendingGeneratedJobDescription | null;
  setPendingGeneratedJobDescription: (pending: PendingGeneratedJobDescription | null) => void;
  onSaved: (record: JobDescriptionRecord) => void;
}) {
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isGeneratingJobDescription, setIsGeneratingJobDescription] = useState(false);

  async function submitJobDescription(
    value: JobDescriptionFormValues,
    _action: JobDescriptionSubmitAction,
  ) {
    const body = {
      allowCrossDepartmentInterviewers: value.allowCrossDepartmentInterviewers,
      code: value.code?.trim() || undefined,
      departmentId: value.departmentId,
      interviewerIds: value.interviewerIds,
      name: value.name.trim(),
      prompt: value.prompt.trim(),
    };
    await runAsyncAction({
      onError: (error) => toast.error(error.message),
      operation: async () => {
        const saved = currentRecord
          ? await rpcFetch(
              rpc.api.w[":slug"].studio["job-descriptions"][":id"].$patch({
                json: body,
                param: { id: currentRecord.id, slug },
              }),
              "更新失败",
            )
          : await rpcFetch(
              rpc.api.w[":slug"].studio["job-descriptions"].$post({
                json: body,
                param: { slug },
              }),
              "创建失败",
            );
        toast.success(currentRecord ? "在招岗位已更新" : "在招岗位已创建");
        onSaved(saved);
      },
    });
  }

  async function handleGenerateCode() {
    setIsGeneratingCode(true);
    await runAsyncAction({
      cleanup: () => setIsGeneratingCode(false),
      onError: (error) => toast.error(error.message),
      operation: async () => {
        const payload = await rpcFetch(
          rpc.api.w[":slug"].studio["job-descriptions"]["generate-code"].$post({
            param: { slug },
          }),
          "生成岗位编码失败",
        );
        form.setFieldValue("code", payload.code);
      },
    });
  }

  async function handleGenerateJobDescription() {
    const { values } = form.store.state;
    if (!values.prompt.trim()) {
      toast.error("请先填写岗位 JD");
      return;
    }
    setIsGeneratingJobDescription(true);
    await runAsyncAction({
      cleanup: () => setIsGeneratingJobDescription(false),
      onError: (error) => toast.error(error.message),
      operation: async () => {
        const payload = await rpcFetch(
          rpc.api.w[":slug"].studio["job-descriptions"]["ai-generate"].$post({
            json: {
              departmentName:
                departments.find((department) => department.id === values.departmentId)?.name ??
                undefined,
              jobName: values.name.trim() || undefined,
              prompt: values.prompt.trim(),
            },
            param: { slug },
          }),
          "AI 生成岗位 JD 失败",
        );
        setPendingGeneratedJobDescription({
          jobDescription: payload.jobDescription,
          suggestedName: payload.suggestedName,
          supplementedItems: payload.supplementedItems ?? [],
        });
      },
    });
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

  return {
    applyGeneratedJobDescription,
    handleGenerateCode,
    handleGenerateJobDescription,
    isGeneratingCode,
    isGeneratingJobDescription,
    submitJobDescription,
  };
}
