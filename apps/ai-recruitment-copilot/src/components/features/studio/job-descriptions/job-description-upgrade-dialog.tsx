/* oxlint-disable complexity -- coordinates the persisted upgrade draft, preview, rule draft, and confirmation state machine. */
"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionDeductionRules,
  JobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { JobDescriptionStructuredFields } from "./job-description-structured-fields";
import { JobEvaluationBlueprintPreview } from "./job-evaluation-blueprint-preview";
import {
  canPublishJobDescriptionUpgrade,
  hasUnsavedJobDescriptionUpgradeChanges,
  saveDraftBeforeGeneratingUpgradePreview,
} from "./job-description-upgrade-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const PROMPT_MAX_LENGTH = 10_000;

interface JobEvaluationUpgradeDraftDto {
  blueprintPreview: JobEvaluationBlueprint | null;
  blueprintPreviewGeneratedAt: string | null;
  blueprintPreviewHash: string | null;
  blueprintPreviewInputHash: string | null;
  createdAt: string;
  createdBy: string | null;
  id: string;
  jobDescriptionId: string;
  organizationId: string;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
  updatedAt: string;
  updatedBy: string | null;
  version: number;
}

function LegacyEvaluationReference({ record }: { record: JobDescriptionRecord }) {
  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="text-base">旧版评估配置（只读参考）</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <p className="font-medium text-sm">旧岗位描述</p>
          <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
            {record.description?.trim() || "未填写"}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-sm">旧筛选规则</p>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">
            {JSON.stringify(record.resumeScreeningPolicy, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function JobDescriptionUpgradeDialogLayout({
  jobDescription,
  scoringRules,
  structuredFields,
}: {
  jobDescription: ReactNode;
  scoringRules: ReactNode;
  structuredFields: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <div className="space-y-2">{jobDescription}</div>
        <div className="space-y-2">{scoringRules}</div>
      </div>
      {structuredFields}
    </div>
  );
}

export function JobDescriptionUpgradeDialog({
  onChanged,
  onOpenChange,
  open,
  record,
}: {
  onChanged: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  record: JobDescriptionRecord | null;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [structuredConfig, setStructuredConfig] = useState<JobDescriptionStructuredConfig | null>(
    null,
  );
  const [deductionRules, setDeductionRules] = useState<JobDescriptionDeductionRules | null>(null);
  const [ruleDraft, setRuleDraft] = useState<JobEvaluationRuleDraft | null>(null);
  const [ruleDraftDirty, setRuleDraftDirty] = useState(false);
  const [publishConfirmationOpen, setPublishConfirmationOpen] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const draftCreationNotifiedRef = useRef<string | null>(null);
  const queryKey = useMemo(
    () => ["job-descriptions", slug, record?.id, "upgrade"] as const,
    [record?.id, slug],
  );

  const draftQuery = useQuery({
    enabled: open && record?.evaluationMode === "legacy",
    queryFn: () => {
      if (!record) {
        throw new Error("岗位不存在");
      }
      const request = record.hasEvaluationUpgradeDraft
        ? rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade.$get({
            param: { id: record.id, slug },
          })
        : rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade.$post({
            param: { id: record.id, slug },
          });
      return rpcFetch<JobEvaluationUpgradeDraftDto>(request, "加载岗位升级草稿失败");
    },
    queryKey,
    retry: false,
  });

  const draft = draftQuery.data ?? null;

  useEffect(() => {
    if (!draft) {
      return;
    }
    setPrompt(draft.prompt);
    setStructuredConfig(draft.structuredConfig);
    setDeductionRules(draft.structuredConfig.deductionRules);
    setRuleDraft(draft.blueprintPreview ? toJobEvaluationRuleDraft(draft.blueprintPreview) : null);
    setRuleDraftDirty(false);
  }, [draft]);

  useEffect(() => {
    if (
      draft &&
      record &&
      !record.hasEvaluationUpgradeDraft &&
      draftCreationNotifiedRef.current !== draft.id
    ) {
      draftCreationNotifiedRef.current = draft.id;
      onChanged();
    }
  }, [draft, onChanged, record]);

  const hasUnsavedChanges = Boolean(
    draft &&
    structuredConfig &&
    hasUnsavedJobDescriptionUpgradeChanges({
      draftPrompt: draft.prompt,
      draftStructuredConfig: draft.structuredConfig,
      prompt,
      structuredConfig,
    }),
  );

  function acceptDraft(nextDraft: JobEvaluationUpgradeDraftDto) {
    queryClient.setQueryData(queryKey, nextDraft);
  }

  function saveDraftRequest(currentDraft: JobEvaluationUpgradeDraftDto) {
    if (!structuredConfig || !prompt.trim()) {
      throw new Error("请填写新版岗位 JD");
    }
    return rpcFetch<JobEvaluationUpgradeDraftDto>(
      rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade.$put({
        json: {
          expectedVersion: currentDraft.version,
          prompt: prompt.trim(),
          structuredConfig,
        },
        param: { id: currentDraft.jobDescriptionId, slug },
      }),
      "保存岗位升级草稿失败",
    );
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) {
        throw new Error("升级草稿尚未加载完成");
      }
      return saveDraftRequest(draft);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
    onSuccess: (nextDraft) => {
      acceptDraft(nextDraft);
      onChanged();
      toast.success("升级草稿已保存");
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!draft) {
        throw new Error("升级草稿尚未加载完成");
      }
      return saveDraftBeforeGeneratingUpgradePreview({
        acceptDraft,
        currentDraft: draft,
        generatePreview: (savedDraft) =>
          rpcFetch<JobEvaluationUpgradeDraftDto>(
            rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade[
              "evaluation-blueprint-preview"
            ].$post({
              json: { expectedVersion: savedDraft.version },
              param: { id: savedDraft.jobDescriptionId, slug },
            }),
            "生成新版评分规则失败",
          ),
        hasUnsavedChanges,
        saveDraft: saveDraftRequest,
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "生成新版评分规则失败"),
    onSuccess: (nextDraft) => {
      acceptDraft(nextDraft);
      onChanged();
      toast.success("新版评分规则已生成，请核对后发布");
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: () => {
      if (!draft || !draft.blueprintPreviewHash || !deductionRules || !ruleDraft) {
        throw new Error("评分规则尚未生成");
      }
      return rpcFetch<JobEvaluationUpgradeDraftDto>(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade["evaluation-rule-draft"].$put({
          json: {
            deductionRules,
            expectedBlueprintHash: draft.blueprintPreviewHash,
            expectedVersion: draft.version,
            ruleDraft,
          },
          param: { id: draft.jobDescriptionId, slug },
        }),
        "保存新版评分规则失败",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "保存新版评分规则失败"),
    onSuccess: (nextDraft) => {
      acceptDraft(nextDraft);
      onChanged();
      toast.success("新版评分规则已保存");
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!draft?.blueprintPreviewHash) {
        throw new Error("请先生成新版评分规则");
      }
      return rpcFetch<{
        invalidatedLegacyAttemptCount: number;
        jobId: string;
        status: "published";
      }>(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade.publish.$post({
          json: {
            confirmedBlueprintHash: draft.blueprintPreviewHash,
            expectedVersion: draft.version,
            explicitConfirmation: true,
          },
          param: { id: draft.jobDescriptionId, slug },
        }),
        "发布新版岗位失败",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "发布新版岗位失败"),
    onSuccess: () => {
      setPublishConfirmationOpen(false);
      queryClient.removeQueries({ queryKey });
      onChanged();
      onOpenChange(false);
      toast.success("岗位已升级为新版，评估设置已冻结");
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => {
      if (!draft) {
        throw new Error("升级草稿尚未加载完成");
      }
      return rpcFetch<{ success: true }>(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].upgrade.$delete({
          param: { id: draft.jobDescriptionId, slug },
          query: { expectedVersion: String(draft.version) },
        }),
        "放弃岗位升级失败",
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "放弃岗位升级失败"),
    onSuccess: () => {
      setDiscardConfirmationOpen(false);
      queryClient.removeQueries({ queryKey });
      onChanged();
      onOpenChange(false);
      toast.success("升级草稿已放弃，岗位仍保持旧版");
    },
  });

  const isBusy =
    saveMutation.isPending ||
    previewMutation.isPending ||
    saveRulesMutation.isPending ||
    publishMutation.isPending ||
    discardMutation.isPending;
  const canPublish = Boolean(
    draft &&
    canPublishJobDescriptionUpgrade({
      blueprintPreviewHash: draft.blueprintPreviewHash,
      blueprintPreviewInputHash: draft.blueprintPreviewInputHash,
      hasUnsavedChanges: hasUnsavedChanges || ruleDraftDirty,
    }),
  );
  const draftQueryErrorMessage =
    draftQuery.error instanceof Error ? draftQuery.error.message : "加载岗位升级草稿失败";

  return (
    <>
      <Modal
        description="升级草稿独立保存；只有确认发布后才会切换到新版，发布后评估设置不可修改。"
        dismissible={!isBusy}
        footer={
          <>
            <Button
              disabled={!draft || isBusy}
              onClick={() => setDiscardConfirmationOpen(true)}
              type="button"
              variant="destructive"
            >
              放弃升级
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              关闭
            </Button>
            <Button
              disabled={!draft || !hasUnsavedChanges || isBusy || !prompt.trim()}
              onClick={() => saveMutation.mutate()}
              type="button"
              variant="outline"
            >
              {saveMutation.isPending ? <IconLoader2 className="size-4 animate-spin" /> : null}
              保存草稿
            </Button>
            <Button
              disabled={!canPublish || isBusy}
              onClick={() => setPublishConfirmationOpen(true)}
              type="button"
            >
              确认并发布新版
            </Button>
          </>
        }
        onOpenChange={onOpenChange}
        open={open}
        size="3xl"
        title={record ? `升级岗位：${record.name}` : "升级岗位"}
      >
        {draftQuery.isLoading && (
          <div className="flex min-h-72 items-center justify-center text-muted-foreground text-sm">
            <IconLoader2 className="mr-2 size-4 animate-spin" />
            正在加载升级草稿…
          </div>
        )}
        {draftQuery.isError && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
            <p className="text-destructive text-sm">{draftQueryErrorMessage}</p>
            <Button onClick={() => draftQuery.refetch()} type="button" variant="outline">
              重试
            </Button>
          </div>
        )}
        {!draftQuery.isLoading &&
          !draftQuery.isError &&
          record &&
          draft &&
          structuredConfig &&
          deductionRules && (
            <div className="space-y-5">
              <LegacyEvaluationReference record={record} />

              <JobDescriptionUpgradeDialogLayout
                jobDescription={
                  <>
                    <div>
                      <h2 className="font-semibold text-base">新版岗位 JD</h2>
                      <p className="text-muted-foreground text-sm">
                        只使用这段 Prompt 初始化新版结构化配置；旧描述和旧筛选规则不会自动转换。
                      </p>
                    </div>
                    <div className="relative">
                      <Textarea
                        aria-label="新版岗位 JD"
                        className="min-h-48 resize-y whitespace-pre-wrap pb-6 leading-relaxed"
                        disabled={isBusy}
                        maxLength={PROMPT_MAX_LENGTH}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="明确填写岗位职责、核心与辅助技能、经验、项目、学历及其他要求……"
                        value={prompt}
                      />
                      <TextareaCounter maxLength={PROMPT_MAX_LENGTH} value={prompt} />
                    </div>
                  </>
                }
                scoringRules={
                  <>
                    <div className="flex min-h-8 items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-base">新版评分规则</h2>
                        <p className="text-muted-foreground text-sm">
                          生成后可核对；评分规则和岗位 JD 都保存后才允许发布。
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {ruleDraftDirty ? (
                          <Button
                            disabled={isBusy || hasUnsavedChanges}
                            onClick={() => saveRulesMutation.mutate()}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {saveRulesMutation.isPending ? (
                              <IconLoader2 className="size-4 animate-spin" />
                            ) : null}
                            保存评分规则
                          </Button>
                        ) : null}
                        <Button
                          disabled={isBusy || ruleDraftDirty || !prompt.trim()}
                          onClick={() => previewMutation.mutate()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {previewMutation.isPending ? (
                            <IconLoader2 className="size-4 animate-spin" />
                          ) : null}
                          {draft.blueprintPreview ? "重新生成评分规则" : "生成评分规则"}
                        </Button>
                      </div>
                    </div>
                    {draft.blueprintPreview && ruleDraft ? (
                      <JobEvaluationBlueprintPreview
                        deductionRules={deductionRules}
                        ruleDraft={ruleDraft}
                      />
                    ) : (
                      <Card className="border-dashed">
                        <CardContent className="flex min-h-28 items-center justify-center p-4 text-center text-muted-foreground text-sm">
                          保存岗位 JD 与结构化设置后，生成新版评分规则并核对。
                        </CardContent>
                      </Card>
                    )}
                  </>
                }
                structuredFields={
                  <JobDescriptionStructuredFields
                    config={structuredConfig}
                    disabled={isBusy}
                    onChange={setStructuredConfig}
                  />
                }
              />
            </div>
          )}
      </Modal>

      <AlertDialog onOpenChange={setPublishConfirmationOpen} open={publishConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认将岗位永久升级为新版？</AlertDialogTitle>
            <AlertDialogDescription>
              发布后无法退回旧版，也不能再修改评估设置。
            </AlertDialogDescription>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
              <li>岗位 ID 与原发布时间保持不变。</li>
              <li>已有候选人的旧版结果会保留，不会自动重新评估。</li>
              <li>新候选人和之后手动重新评估的候选人使用新版规则。</li>
              <li>新旧分数口径不同，列表会分组展示，不做直接横向比较。</li>
            </ul>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? <IconLoader2 className="size-4 animate-spin" /> : null}
              确认升级并发布
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setDiscardConfirmationOpen} open={discardConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃这份升级草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              新版岗位 JD、结构化设置和评分规则都会被删除；原岗位继续保持旧版。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={discardMutation.isPending}
              onClick={() => discardMutation.mutate()}
              variant="destructive"
            >
              {discardMutation.isPending ? <IconLoader2 className="size-4 animate-spin" /> : null}
              放弃升级
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
