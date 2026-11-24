import { MAX_RESUME_FILE_SIZE_BYTES } from "@app/shared/bulk-resume-upload";
import { validateCandidateMaterialFiles } from "@app/shared/candidate-materials";
import { externalApplicationFormSchema } from "@app/shared/external-applications";
import {
  externalApplicationResumeLabel,
  isExternalApplicationResume,
} from "@app/shared/resume-documents";
import { IconPaperclip } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { InterviewEntryShell } from "@/components/features/human-interview/interview-entry-shell";
import { CandidateMaterialsPanel } from "@/components/features/studio/candidate-materials/candidate-materials-panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/client/api/client";
import { ApiError } from "@/lib/client/api/errors";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { createExternalApplicationMaterialsClient } from "@/lib/client/candidate-materials";
import type { CandidateMaterialsClient } from "@/lib/client/candidate-materials";
import { rpc } from "@/lib/client/rpc";
import { ExternalApplicationForm } from "./application-form";
import { JobDescriptionContent } from "./application-form-fields";
import type {
  ExternalApplicationDraft,
  ExternalApplicationErrorKey,
  ExternalApplicationFormErrors,
  PendingPortfolioFile,
} from "./application-form-fields";

const receiptSchema = z.array(z.object({ id: z.string(), name: z.string() }));
type Receipt = z.infer<typeof receiptSchema>[number];

const FORM_ERROR_KEY_MAP = new Map<string, ExternalApplicationErrorKey>([
  ["alternateJobDescriptionId", "alternateJobDescriptionId"],
  ["batch", "batch"],
  ["candidateName", "candidateName"],
  ["className", "className"],
  ["contact", "contact"],
  ["jobDescriptionId", "jobDescriptionId"],
  ["portfolioContribution", "portfolioContribution"],
  ["portfolioFiles", "portfolioFiles"],
  ["portfolioUrl", "portfolioUrl"],
  ["resume", "resume"],
  ["trainingInstitution", "trainingInstitution"],
  ["workMode", "workMode"],
]);

function createEmptyDraft(): ExternalApplicationDraft {
  return {
    alternateJobDescriptionId: "",
    batch: "",
    candidateName: "",
    className: "",
    contact: "",
    jobDescriptionId: "",
    portfolioContribution: "",
    portfolioUrl: "",
    trainingInstitution: "",
    workMode: "onsite",
  };
}

function readReceipts(key: string): Receipt[] {
  try {
    return receiptSchema.parse(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return [];
  }
}

function appendAndPersistReceipt(
  historyKey: string,
  receipt: Receipt,
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>,
) {
  const merge = (previous: Receipt[]) => [
    ...new Map<string, Receipt>([
      [receipt.id, receipt],
      ...previous.map((item): [string, Receipt] => [item.id, item]),
    ]).values(),
  ];
  try {
    localStorage.setItem(historyKey, JSON.stringify(merge(readReceipts(historyKey))));
  } catch {
    toast.warning("浏览器无法保存投递历史。");
  }
  setReceipts(merge);
}

function omitFormError(
  errors: ExternalApplicationFormErrors,
  key: ExternalApplicationErrorKey,
): ExternalApplicationFormErrors {
  if (!errors[key]) {
    return errors;
  }
  return Object.fromEntries(Object.entries(errors).filter(([entryKey]) => entryKey !== key));
}

function validateResumeSelection(file: File | null): string | null {
  if (!file) {
    return "请上传简历文件";
  }
  if (file.size <= 0) {
    return "简历文件不能为空";
  }
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    return "简历文件不能超过 20 MB";
  }
  if (!isExternalApplicationResume({ fileName: file.name, mediaType: file.type })) {
    return `仅支持 ${externalApplicationResumeLabel}`;
  }
  return null;
}

function validateApplicationForm(
  draft: ExternalApplicationDraft,
  resumeFile: File | null,
  portfolioFiles: PendingPortfolioFile[],
): ExternalApplicationFormErrors {
  const nextErrors: ExternalApplicationFormErrors = {};
  const parsed = externalApplicationFormSchema.safeParse({
    ...draft,
    alternateJobDescriptionId: draft.alternateJobDescriptionId || null,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const mappedKey = FORM_ERROR_KEY_MAP.get(String(issue.path[0] ?? ""));
      if (mappedKey && !nextErrors[mappedKey]) {
        nextErrors[mappedKey] = issue.message;
      }
    }
  }
  const resumeError = validateResumeSelection(resumeFile);
  if (resumeError) {
    nextErrors.resume = resumeError;
  }
  if (portfolioFiles.length > 0) {
    const existingCount = draft.portfolioUrl.trim() ? 1 : 0;
    const filesError = validateCandidateMaterialFiles(
      portfolioFiles.map((entry) => entry.file),
      existingCount,
    );
    if (filesError) {
      nextErrors.portfolioFiles = filesError;
    }
  }
  return nextErrors;
}

function buildSubmissionFormData(
  draft: ExternalApplicationDraft,
  resumeFile: File,
  requestId: string,
): FormData {
  const body = new FormData();
  body.set("resume", resumeFile);
  body.set("requestId", requestId);
  body.set("candidateName", draft.candidateName.trim());
  body.set("jobDescriptionId", draft.jobDescriptionId);
  body.set("workMode", draft.workMode);
  body.set("trainingInstitution", draft.trainingInstitution.trim());
  body.set("className", draft.className.trim());
  body.set("batch", draft.batch.trim());
  if (
    draft.alternateJobDescriptionId &&
    draft.alternateJobDescriptionId !== draft.jobDescriptionId
  ) {
    body.set("alternateJobDescriptionId", draft.alternateJobDescriptionId);
  }
  body.set("contact", draft.contact.trim());
  body.set("portfolioUrl", draft.portfolioUrl.trim());
  body.set("portfolioContribution", draft.portfolioContribution.trim());
  return body;
}

async function submitFullApplication({
  draft,
  materialsClient,
  portfolioFiles,
  requestId,
  resumeFile,
  token,
}: {
  draft: ExternalApplicationDraft;
  materialsClient: CandidateMaterialsClient;
  portfolioFiles: PendingPortfolioFile[];
  requestId: string;
  resumeFile: File;
  token: string;
}) {
  const body = buildSubmissionFormData(draft, resumeFile, requestId);
  await apiFetch(`/api/public/external-applications/${encodeURIComponent(token)}/resumes`, {
    body,
    method: "POST",
  });

  let failedAttachmentCount = 0;
  for (const entry of portfolioFiles) {
    try {
      await materialsClient.uploadCandidateMaterialFile(
        "resume_pool_item",
        token,
        requestId,
        entry.file,
        { notes: "" },
      );
    } catch {
      failedAttachmentCount += 1;
    }
  }

  return {
    failedAttachmentCount,
    receipt: {
      id: requestId,
      name: `${draft.candidateName.trim()} · ${resumeFile.name}`,
    },
    uploadedAttachmentCount: portfolioFiles.length - failedAttachmentCount,
  };
}

function notifySubmissionResult(failedAttachmentCount: number, uploadedAttachmentCount: number) {
  if (failedAttachmentCount > 0) {
    toast.warning(
      `简历已提交，但有 ${failedAttachmentCount} 份作品附件上传失败，可在「已投递」中点击「关联附件」重新上传。`,
    );
    return;
  }
  if (uploadedAttachmentCount > 0) {
    toast.success(`投递成功，已同步上传 ${uploadedAttachmentCount} 份作品附件。`);
    return;
  }
  toast.success("投递成功，感谢你的申请。");
}

function SentApplicationsPanel({
  onManageMaterials,
  receipts,
}: {
  onManageMaterials: (receipt: Receipt) => void;
  receipts: Receipt[];
}) {
  return (
    <ScrollArea className="h-64" scrollFade>
      <ul className="space-y-1 text-sm">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="flex min-h-10 items-center justify-between gap-2 py-1">
            <span className="min-w-0 flex-1 truncate" title={receipt.name}>
              {receipt.name}
            </span>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onManageMaterials(receipt)}
            >
              <IconPaperclip data-icon="inline-start" />
              关联附件
            </Button>
          </li>
        ))}
      </ul>
      {receipts.length ? null : (
        <p className="py-2 text-sm text-muted-foreground">暂无已投递申请</p>
      )}
    </ScrollArea>
  );
}

export function ExternalApplicationPage({ token }: { token: string }) {
  // Each workspace has one stable external application token.
  const historyKey = `external-application-history:${token}`;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tab, setTab] = useState("form");
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Read browser storage after hydration.
    setReceipts(readReceipts(historyKey));
  }, [historyKey]);

  const [draft, setDraft] = useState<ExternalApplicationDraft>(createEmptyDraft);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<PendingPortfolioFile[]>([]);
  const [resumeResetKey, setResumeResetKey] = useState(0);
  const [portfolioResetKey, setPortfolioResetKey] = useState(0);
  const [draftRequestId, setDraftRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<ExternalApplicationFormErrors>({});
  const [materialsReceipt, setMaterialsReceipt] = useState<Receipt | null>(null);

  const externalMaterialsClient = useMemo(
    () => createExternalApplicationMaterialsClient(token),
    [token],
  );

  const preview = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.public["external-applications"][":token"].$get({ param: { token } }),
        "加载投递页面失败",
      ),
    queryKey: ["external-application", token],
    retry: false,
  });

  function updateDraftField<K extends keyof ExternalApplicationDraft>(
    key: K,
    value: ExternalApplicationDraft[K],
  ) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "jobDescriptionId" && value === current.alternateJobDescriptionId) {
        return { ...next, alternateJobDescriptionId: "" };
      }
      return next;
    });
    if (key === "jobDescriptionId") {
      setDraftRequestId(crypto.randomUUID());
    }
    setErrors((current) => omitFormError(current, key));
  }

  function resetApplicationForm() {
    setDraft(createEmptyDraft());
    setResumeFile(null);
    setPortfolioFiles([]);
    setResumeResetKey((key) => key + 1);
    setPortfolioResetKey((key) => key + 1);
    setDraftRequestId(crypto.randomUUID());
    setErrors({});
  }

  const submitMutation = useMutation({
    mutationFn: (validatedResume: File) =>
      submitFullApplication({
        draft,
        materialsClient: externalMaterialsClient,
        portfolioFiles,
        requestId: draftRequestId,
        resumeFile: validatedResume,
        token,
      }),
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await preview.refetch();
      }
      toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试。");
    },
    onSuccess: ({ failedAttachmentCount, receipt, uploadedAttachmentCount }) => {
      appendAndPersistReceipt(historyKey, receipt, setReceipts);
      notifySubmissionResult(failedAttachmentCount, uploadedAttachmentCount);
      resetApplicationForm();
      setTab("sent");
    },
  });

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationErrors = validateApplicationForm(draft, resumeFile, portfolioFiles);
    if (Object.keys(validationErrors).length > 0 || !resumeFile) {
      setErrors(validationErrors);
      toast.error("请先完善必填项并检查格式后提交。");
      return;
    }
    setErrors({});
    submitMutation.mutate(resumeFile);
  }

  function handleSelectResume(incoming: File[]) {
    const [nextFile] = incoming;
    setResumeResetKey((key) => key + 1);
    if (!nextFile) {
      return;
    }
    const resumeError = validateResumeSelection(nextFile);
    if (resumeError) {
      setErrors((current) => ({ ...current, resume: resumeError }));
      return;
    }
    setResumeFile(nextFile);
    setDraftRequestId(crypto.randomUUID());
    setErrors((current) => omitFormError(current, "resume"));
  }

  function handleSelectPortfolioFiles(incoming: File[]) {
    setPortfolioResetKey((key) => key + 1);
    if (incoming.length === 0) {
      return;
    }
    const existingCount = portfolioFiles.length + (draft.portfolioUrl.trim() ? 1 : 0);
    const validationError = validateCandidateMaterialFiles(incoming, existingCount);
    if (validationError) {
      setErrors((current) => ({ ...current, portfolioFiles: validationError }));
      return;
    }
    const added = incoming.map((file) => ({ file, id: crypto.randomUUID() }));
    setPortfolioFiles((current) => [...current, ...added]);
    setErrors((current) => omitFormError(current, "portfolioFiles"));
  }

  if (preview.isPending) {
    return (
      <InterviewEntryShell hideMobileTheme>
        <Skeleton className="h-56 w-full max-w-5xl" />
      </InterviewEntryShell>
    );
  }
  if (preview.isError) {
    return (
      <InterviewEntryShell hideMobileTheme>
        <h1 className="text-2xl font-semibold">投递链接不可用</h1>
      </InterviewEntryShell>
    );
  }

  const { jobs, workspaceName } = preview.data;
  const selectedPrimaryJob = jobs.find((job) => job.id === draft.jobDescriptionId) ?? null;
  const alternateJobs = jobs.filter((job) => job.id !== draft.jobDescriptionId);
  const selectedAlternateJob =
    alternateJobs.find((job) => job.id === draft.alternateJobDescriptionId) ?? null;
  const showSideJd = tab === "form" && selectedPrimaryJob !== null;

  return (
    <InterviewEntryShell hideMobileTheme>
      <div
        className={
          showSideJd
            ? "grid w-full max-w-2xl items-start gap-8 md:max-w-5xl md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-10"
            : "mx-auto flex w-full max-w-2xl flex-col gap-6"
        }
      >
        <section className="flex min-w-0 flex-col gap-6">
          <header className="space-y-2">
            <p className="text-sm leading-5 text-muted-foreground">{workspaceName}</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">岗位投递</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              请选择首选岗位，填写真实信息并上传简历。作品集链接、作品附件及个人分工均为选填，提交后也可在「已投递」中随时补充或修改附件。
            </p>
          </header>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="line">
              <TabsTab value="form">填写投递</TabsTab>
              <TabsTab value="sent">已投递（{receipts.length}）</TabsTab>
            </TabsList>

            <TabsPanel value="form" className="pt-4">
              <ExternalApplicationForm
                alternateJobs={alternateJobs}
                draft={draft}
                errors={errors}
                jobs={jobs}
                onDraftChange={updateDraftField}
                onRemovePortfolioFile={(id) =>
                  setPortfolioFiles((current) => current.filter((entry) => entry.id !== id))
                }
                onRemoveResume={() => {
                  setResumeFile(null);
                  setDraftRequestId(crypto.randomUUID());
                }}
                onSelectPortfolioFiles={handleSelectPortfolioFiles}
                onSelectResume={handleSelectResume}
                onSubmit={handleFormSubmit}
                portfolioFiles={portfolioFiles}
                portfolioResetKey={portfolioResetKey}
                resumeFile={resumeFile}
                resumeResetKey={resumeResetKey}
                selectedAlternateJob={selectedAlternateJob}
                selectedPrimaryJob={selectedPrimaryJob}
                submitting={submitMutation.isPending}
              />
            </TabsPanel>

            <TabsPanel value="sent" className="pt-4">
              <SentApplicationsPanel onManageMaterials={setMaterialsReceipt} receipts={receipts} />
            </TabsPanel>
          </Tabs>
        </section>

        {showSideJd ? (
          <section className="hidden min-w-0 flex-col gap-4 md:sticky md:top-[clamp(3rem,10dvh,6rem)] md:flex">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold leading-5">首选岗位 JD</h2>
              <p className="text-xs text-muted-foreground">{selectedPrimaryJob.name}</p>
            </div>
            <JobDescriptionContent jd={selectedPrimaryJob.jd} />
          </section>
        ) : null}
      </div>

      <Modal
        open={materialsReceipt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMaterialsReceipt(null);
          }
        }}
        size="2xl"
        title={materialsReceipt ? `关联附件 · ${materialsReceipt.name}` : "关联附件"}
        description="可为该份申请补充作品集压缩包、PDF、视频、图片或外部链接。"
      >
        {materialsReceipt ? (
          <CandidateMaterialsPanel
            canEdit
            client={externalMaterialsClient}
            emptyDescription="可补充作品集压缩包、PDF、视频、图片或外部链接。"
            ownerId={materialsReceipt.id}
            ownerType="resume_pool_item"
            slug={token}
          />
        ) : null}
      </Modal>
    </InterviewEntryShell>
  );
}
