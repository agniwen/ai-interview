"use client";

import { IconBriefcase, IconLoader2 } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ResumePoolDetail } from "@app/shared/resume-pool";
import { useState } from "react";
import { createPortal } from "react-dom";

import {
  UNSUPPORTED_RESUME_DOCUMENT_PREVIEW_TOOLTIP,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { ResumeDocumentPreviewModal } from "@/components/features/resume/resume-document-preview-modal";
import { FloatingBar } from "@/components/ui/floating-bar";
import { useHydrated } from "@/hooks/use-hydrated";
import { RecruitingActionButton as Button } from "../recruiting-action-button";

import { ImportResumePoolDialog } from "./resume-pool-dialogs";
import { getResumePoolImportActionState } from "./resume-pool-page-model";

const FLOATING_BUTTON_CLASS = "max-md:h-11 max-md:flex-1 max-md:px-4 max-md:text-sm";

function getPreviewDisabledReason(detail: ResumePoolDetail) {
  if (!detail.resumeStorageKey) {
    return "暂无简历原件";
  }
  return isPreviewableResumeDocumentInput({ fileName: detail.resumeFileName })
    ? null
    : UNSUPPORTED_RESUME_DOCUMENT_PREVIEW_TOOLTIP;
}

function getEnterRecruitingDisabledReason(detail: ResumePoolDetail, canEnterRecruiting: boolean) {
  if (!canEnterRecruiting) {
    return "没有创建招聘记录的权限";
  }
  const importActionState = getResumePoolImportActionState(detail);
  return importActionState.disabled ? `简历${importActionState.label}，暂不能进入招聘流程` : null;
}

/** 已在招聘流程中的人才也走创建弹窗，便于以另一个岗位再次加入招聘台。 */
export function ResumePoolDetailFloatingBar({
  canEnterRecruiting,
  detail,
  slug,
}: {
  canEnterRecruiting: boolean;
  detail: ResumePoolDetail;
  slug: string;
}) {
  const isHydrated = useHydrated();
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importLoading = getResumePoolImportActionState(detail).loading;

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      {createPortal(
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center">
          <FloatingBar
            className="flex w-full items-center gap-1 p-1 md:w-auto"
            data-slot="resume-pool-detail-floating-bar"
          >
            <Button
              className={FLOATING_BUTTON_CLASS}
              disabledReason={getPreviewDisabledReason(detail)}
              onClick={() => setPreviewOpen(true)}
              size="sm"
              title={detail.resumeFileName ?? undefined}
              type="button"
              variant="secondary"
            >
              <ResumeDocumentFileIcon
                className="size-4"
                kind={getResumeDocumentFileIconKind({ fileName: detail.resumeFileName })}
              />
              查看简历原件
            </Button>
            <Button
              className={FLOATING_BUTTON_CLASS}
              disabledReason={getEnterRecruitingDisabledReason(detail, canEnterRecruiting)}
              isLoading={importLoading}
              onClick={() => setImportOpen(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {importLoading ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconBriefcase data-icon="inline-start" />
              )}
              进入招聘流程
            </Button>
          </FloatingBar>
        </div>,
        document.body,
      )}
      <ResumeDocumentPreviewModal
        fileName={detail.resumeFileName}
        onClose={() => setPreviewOpen(false)}
        url={
          previewOpen && detail.resumeStorageKey
            ? `/api/w/${slug}/studio/resume-pool/${detail.id}/resume`
            : null
        }
      />
      <ImportResumePoolDialog
        item={importOpen ? detail : null}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ["resume-pool"] });
          void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
        }}
        onOpenChange={setImportOpen}
      />
    </>
  );
}
