"use client";

import { lazy, Suspense } from "react";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
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

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

export function ResumeLibraryDeleteDialogs({
  bulkDeleteOpen,
  deleteRecord,
  isBulkDeleting,
  onBulkDelete,
  onBulkOpenChange,
  onDelete,
  onDeleteRecordChange,
  selectedCount,
}: {
  bulkDeleteOpen: boolean;
  deleteRecord: ResumeLibraryListRecord | null;
  isBulkDeleting: boolean;
  onBulkDelete: () => Promise<void>;
  onBulkOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
  onDeleteRecordChange: (record: ResumeLibraryListRecord | null) => void;
  selectedCount: number;
}) {
  return (
    <>
      <AlertDialog
        onOpenChange={(open) => !open && onDeleteRecordChange(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条简历？</AlertDialogTitle>
            <AlertDialogDescription>
              将一并删除该候选人下所有关联数据（包括已发起的 AI 面试轮次与对话记录）。当前记录：
              {deleteRecord?.candidateName ?? "未知候选人"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
              }}
              variant="destructive"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={onBulkOpenChange} open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除 {selectedCount} 条简历？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。所选记录及其关联面试数据将一并级联删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              onClick={(event) => {
                event.preventDefault();
                void onBulkDelete();
              }}
              variant="destructive"
            >
              {isBulkDeleting ? "正在删除…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ResumeLibraryPreviewDialog({
  onClose,
  record,
  slug,
}: {
  onClose: () => void;
  record: ResumeLibraryListRecord | null;
  slug: string;
}) {
  if (!record) {
    return null;
  }
  const kind = getPreviewableResumeDocumentKind({ fileName: record.resumeFileName });
  return kind ? (
    <Suspense fallback={null}>
      <ResumeDocumentPreviewDialog
        filename={record.resumeFileName ?? undefined}
        kind={kind}
        onOpenChange={(open) => !open && onClose()}
        open
        url={`/api/w/${slug}/studio/resumes/${record.id}/resume`}
      />
    </Suspense>
  ) : null;
}
