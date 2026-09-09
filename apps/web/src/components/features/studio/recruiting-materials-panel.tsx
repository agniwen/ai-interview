import { RecruitingMaterialThumbnail } from "./recruiting-material-thumbnail";
import { useRef, useState } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDownload, IconEye, IconFile, IconUpload, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  validateRecruitingMaterialFiles,
  RECRUITING_MATERIAL_MAX_COUNT,
} from "@app/shared/recruiting-materials";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  deleteRecruitingMaterial,
  listRecruitingMaterials,
  materialFileUrl,
  uploadRecruitingMaterial,
} from "@/lib/client/recruiting-materials";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageResumePreviewContent } from "@/components/features/resume/resume-document-preview-dialog";
import { Modal } from "@/components/ui/modal";
import type { RecruitingNodeStateRecord } from "@app/shared/studio-resumes";

type IncomeProofReview = Pick<RecruitingNodeStateRecord, "reason" | "result" | "status">;

function UploadAttachmentCard({
  busy,
  ready,
  count,
  onClick,
}: {
  busy: boolean;
  ready: boolean;
  count: number;
  onClick: () => void;
}) {
  const atLimit = count >= RECRUITING_MATERIAL_MAX_COUNT;
  return (
    <Attachment state="idle" className="w-72 flex-nowrap">
      <AttachmentTrigger
        aria-label="上传附件"
        disabled={busy || !ready || atLimit}
        onClick={onClick}
      />
      <AttachmentMedia>
        <IconUpload />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>上传附件</AttachmentTitle>
        <AttachmentDescription>
          {atLimit ? "附件数量已达上限" : "选择文件上传"}
        </AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  );
}

function getIncomeProofReviewMeta(review?: IncomeProofReview) {
  if (review?.status === "completed" && review.result === "pass") {
    return { label: "审核通过", variant: "success" as const };
  }
  if (review?.status === "completed" && review.result === "fail") {
    return { label: "已驳回", variant: "destructive" as const };
  }
  if (review?.status === "completed" && review.result === "withdrawn") {
    return { label: "候选人放弃", variant: "warning" as const };
  }
  if (review?.status === "skipped") {
    return { label: "已跳过", variant: "outline" as const };
  }
  return { label: "待审核", variant: "warning" as const };
}

function IncomeProofReviewSummary({ review }: { review?: IncomeProofReview }) {
  const meta = getIncomeProofReviewMeta(review);
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2" aria-label="流水审核结果">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">审核结果</span>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
      {review?.reason ? (
        <p aria-label="流水审核说明" className="mt-2 text-xs leading-relaxed whitespace-pre-wrap">
          <span className="font-medium">审核说明：</span>
          {review.reason}
        </p>
      ) : null}
    </div>
  );
}

export function RecruitingMaterialsPanel({
  candidateId,
  canCreate,
  canDelete,
  disabled,
  review,
}: {
  candidateId: string;
  canCreate: boolean;
  canDelete: boolean;
  disabled?: boolean;
  review?: IncomeProofReview;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; fileName: string } | null>(null);
  const queryKey = ["recruiting-materials", slug, candidateId];
  const materials = useQuery({
    queryFn: () => listRecruitingMaterials(slug, candidateId),
    queryKey,
  });
  const files = materials.data ?? [];
  const upload = useMutation({
    mutationFn: async (selected: File[]) => {
      const validationError = validateRecruitingMaterialFiles(selected, files.length);
      if (validationError) {
        throw new Error(validationError);
      }
      let completed = 0;
      for (const file of selected) {
        setUploadingName(file.name);
        try {
          await uploadRecruitingMaterial(slug, candidateId, file);
          completed += 1;
        } catch (error) {
          throw new Error(
            `已上传 ${completed}/${selected.length} 个；${file.name} 上传失败：${error instanceof Error ? error.message : "请重试"}`,
            { cause: error },
          );
        }
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: async () => {
      setUploadingName(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: () => toast.success("附件已上传"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRecruitingMaterial(slug, candidateId, id),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("附件已删除");
    },
  });
  const busy = upload.isPending || remove.isPending;
  const showUpload = canCreate && !disabled;
  return (
    <section aria-label="流水文件" className="flex flex-col gap-3">
      <Frame className="min-w-0">
        <FrameHeader>
          <FrameTitle>流水文件{materials.isSuccess ? `（${files.length}/10）` : ""}</FrameTitle>
        </FrameHeader>
        <FramePanel className="flex min-w-0 flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            上传候选人的薪资流水、个税记录等薪酬证明。请按公司规范脱敏；单个不超过 20 MB，最多 10
            个。
          </p>
          <IncomeProofReviewSummary review={review} />
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            aria-label="上传流水文件"
            disabled={busy || disabled || !canCreate}
            onChange={(event) => {
              const selected = [...(event.currentTarget.files ?? [])];
              event.currentTarget.value = "";
              if (selected.length > 0) {
                upload.mutate(selected);
              }
            }}
          />
          {materials.isPending ? <Skeleton className="h-20 w-full" /> : null}
          {materials.isError ? (
            <div role="alert" className="flex items-center gap-2 text-sm">
              <span>附件加载失败</span>
              <Button size="sm" variant="ghost" onClick={() => materials.refetch()}>
                重试
              </Button>
            </div>
          ) : null}
          {materials.isSuccess && files.length === 0 && !uploadingName && !showUpload ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无流水文件</EmptyTitle>
                <EmptyDescription>候选人提供材料后，可在此上传留存。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          <ScrollArea
            scrollbars="leave"
            options={{
              overflow: { x: "scroll", y: "hidden" },
              scrollbars: { autoHide: "leave", autoHideDelay: 300, theme: "os-theme-app" },
            }}
            events={{
              initialized: (instance: OverlayScrollbars) => {
                const { viewport } = instance.elements();
                viewport.classList.add("scroll-fade-x");
                viewport.setAttribute("aria-label", "流水文件列表");
                viewport.tabIndex = 0;
              },
            }}
          >
            <div className="flex w-max min-w-full flex-nowrap gap-3 py-1">
              {files.map((file) => (
                <Attachment key={file.id} className="w-72 flex-nowrap">
                  {file.contentType.startsWith("image/") ? (
                    <AttachmentTrigger
                      aria-label={`预览 ${file.fileName}`}
                      onClick={() => setPreviewTarget(file)}
                    />
                  ) : null}
                  {file.contentType.startsWith("image/") ? (
                    <RecruitingMaterialThumbnail
                      url={materialFileUrl(slug, candidateId, file.id)}
                      filename={file.fileName}
                    />
                  ) : (
                    <AttachmentMedia>
                      <IconFile />
                    </AttachmentMedia>
                  )}
                  <AttachmentContent>
                    <AttachmentTitle title={file.fileName}>{file.fileName}</AttachmentTitle>
                    <AttachmentDescription>
                      {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    {file.contentType.startsWith("image/") ? (
                      <AttachmentAction
                        aria-label={`查看大图 ${file.fileName}`}
                        onClick={() => setPreviewTarget(file)}
                      >
                        <IconEye />
                      </AttachmentAction>
                    ) : null}
                    <AttachmentAction
                      nativeButton={false}
                      render={
                        <a
                          aria-label={`下载 ${file.fileName}`}
                          href={materialFileUrl(slug, candidateId, file.id)}
                          download={file.fileName}
                        />
                      }
                      aria-label={`下载 ${file.fileName}`}
                    >
                      <IconDownload />
                    </AttachmentAction>
                    {canDelete && !disabled ? (
                      <AttachmentAction
                        disabled={busy}
                        aria-label={`删除 ${file.fileName}`}
                        onClick={() => setDeleteTarget(file)}
                      >
                        <IconTrash />
                      </AttachmentAction>
                    ) : null}
                  </AttachmentActions>
                </Attachment>
              ))}
              {uploadingName ? (
                <Attachment state="uploading" className="w-72 flex-nowrap">
                  <AttachmentMedia>
                    <IconFile />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{uploadingName}</AttachmentTitle>
                    <AttachmentDescription>上传中…</AttachmentDescription>
                  </AttachmentContent>
                </Attachment>
              ) : null}
              {showUpload ? (
                <UploadAttachmentCard
                  busy={busy}
                  ready={materials.isSuccess}
                  count={files.length}
                  onClick={() => input.current?.click()}
                />
              ) : null}
            </div>
          </ScrollArea>
        </FramePanel>
      </Frame>
      {previewTarget ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) {
              setPreviewTarget(null);
            }
          }}
          title={previewTarget.fileName}
          description="图片预览"
          size="full"
          className="h-[92dvh]"
          bodyClassName="min-h-0 overflow-auto bg-muted/30 p-0"
          footer={
            <Button
              nativeButton={false}
              variant="outline"
              render={
                <a
                  href={materialFileUrl(slug, candidateId, previewTarget.id)}
                  download={previewTarget.fileName}
                  aria-label="下载原图片"
                />
              }
            >
              <IconDownload data-icon="inline-start" />
              下载原图片
            </Button>
          }
        >
          <ImageResumePreviewContent
            key={previewTarget.id}
            filename={previewTarget.fileName}
            url={materialFileUrl(slug, candidateId, previewTarget.id)}
          />
        </Modal>
      ) : null}
      <Modal
        open={deleteTarget !== null && !disabled && canDelete}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) {
            setDeleteTarget(null);
          }
        }}
        title="删除附件"
        description={`确定删除“${deleteTarget?.fileName ?? ""}”？删除后无法恢复。`}
        footer={
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (deleteTarget) {
                remove.mutate(deleteTarget.id);
              }
            }}
          >
            确认删除
          </Button>
        }
      >
        <p className="text-muted-foreground text-sm">删除后可重新上传其他材料。</p>
      </Modal>
    </section>
  );
}
