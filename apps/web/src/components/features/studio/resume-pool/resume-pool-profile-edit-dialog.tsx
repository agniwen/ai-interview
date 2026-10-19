"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { ResumePoolDetail, ResumePoolListRecord } from "@app/shared/resume-pool";
import { resumeProfileEditSchema } from "@app/shared/resume-profile-edit";
import { useState } from "react";
import { toast } from "sonner";

import {
  getResumeProfileDraftError,
  ResumeProfileEditor,
} from "@/components/features/resume/profile-editor/resume-profile-editor";
import {
  createResumeProfileDraft,
  isResumeProfileDraftChanged,
  toResumeProfileEditInput,
} from "@/components/features/resume/profile-editor/resume-profile-draft";
import type { ResumeProfileDraft } from "@/components/features/resume/profile-editor/resume-profile-draft";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fetchResumePoolItem, updateResumePoolItemProfile } from "@/lib/client/api";

/** 仅上传者可修正人才库简历信息。Only the uploader may correct a pool item's profile. */
export function canEditResumePoolProfile(input: {
  canCreateResumePool: boolean;
  currentUserId: string | null;
  record: Pick<ResumePoolListRecord, "createdBy">;
}): boolean {
  return (
    input.canCreateResumePool &&
    input.currentUserId !== null &&
    input.record.createdBy === input.currentUserId
  );
}

/** 返回编辑按钮的禁用原因或 null；列表卡片与详情页共用。 */
export function getResumePoolProfileEditDisabledReason(input: {
  canCreateResumePool: boolean;
  currentUserId: string | null;
  record: Pick<ResumePoolListRecord, "createdBy" | "resumeParseStatus">;
}): string | null {
  if (!canEditResumePoolProfile(input)) {
    return "仅简历上传者可以编辑";
  }
  if (input.record.resumeParseStatus !== "ready") {
    return "简历解析完成后才能编辑";
  }
  return null;
}

function ResumePoolProfileEditForm({
  onClose,
  onSave,
  resumeProfile,
  saving,
}: {
  onClose: () => void;
  onSave: (draft: ResumeProfileDraft) => void;
  resumeProfile: ResumeProfile;
  saving: boolean;
}) {
  const [initialDraft] = useState(() => createResumeProfileDraft(resumeProfile));
  const [draft, setDraft] = useState<ResumeProfileDraft>(initialDraft);

  function handleSubmit() {
    if (!isResumeProfileDraftChanged(initialDraft, draft)) {
      onClose();
      return;
    }
    const draftError = getResumeProfileDraftError(draft, { requireName: true });
    const parsed = resumeProfileEditSchema.safeParse(toResumeProfileEditInput(draft));
    if (draftError || !parsed.success) {
      toast.error(draftError ?? parsed.error?.issues[0]?.message ?? "请检查简历信息后再保存");
      return;
    }
    onSave(draft);
  }

  return (
    <form
      className="flex flex-col gap-6"
      id="resume-pool-profile-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <ResumeProfileEditor disabled={saving} onChange={setDraft} showIdentityFields value={draft} />
    </form>
  );
}

/**
 * 人才库简历信息编辑抽屉：复用简历画像编辑器，并直接编辑姓名、联系方式与求职意向。
 * Resume pool profile edit drawer: reuses the profile editor, including identity fields.
 */
export function ResumePoolProfileEditDialog({
  detail,
  onOpenChange,
  open,
  slug,
}: {
  detail: ResumePoolDetail | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}) {
  const resumeProfile = detail?.resumeProfile ?? null;
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ draft, id }: { draft: ResumeProfileDraft; id: string }) =>
      await updateResumePoolItemProfile(slug, id, toResumeProfileEditInput(draft)),
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
    onSuccess: (updated) => {
      queryClient.setQueryData(["resume-pool", "detail", slug, updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["resume-pool"] });
      toast.success("已保存，AI 评价将基于新信息重新生成");
      onOpenChange(false);
    },
  });
  return (
    <Modal
      footer={
        <>
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending || !resumeProfile}
            form="resume-pool-profile-edit-form"
            type="submit"
          >
            {mutation.isPending ? <IconLoader2 className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="xl"
      title="编辑人才信息"
    >
      {open && detail && resumeProfile ? (
        <ResumePoolProfileEditForm
          key={`${detail.id}:${detail.updatedAt}`}
          onClose={() => onOpenChange(false)}
          onSave={(draft) => mutation.mutate({ draft, id: detail.id })}
          resumeProfile={resumeProfile}
          saving={mutation.isPending}
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center text-muted-foreground text-sm">
          <IconLoader2 aria-hidden className="mr-2 size-4 animate-spin" />
          正在加载…
        </div>
      )}
    </Modal>
  );
}

/**
 * 列表卡片入口：卡片只有列表投影，按 ID 拉取详情后再编辑（与详情页共享查询缓存）。
 * List-card entry: cards only hold the list projection, so load the detail by id first
 * (sharing the detail page's query cache).
 */
export function ResumePoolProfileEditByIdDialog({
  onOpenChange,
  recordId,
  slug,
}: {
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  slug: string;
}) {
  const detailQuery = useQuery({
    enabled: recordId !== null,
    queryFn: async () => (recordId ? await fetchResumePoolItem(slug, recordId) : null),
    queryKey: ["resume-pool", "detail", slug, recordId] as const,
    staleTime: 0,
  });
  return (
    <ResumePoolProfileEditDialog
      detail={recordId ? (detailQuery.data ?? null) : null}
      onOpenChange={onOpenChange}
      open={recordId !== null}
      slug={slug}
    />
  );
}
