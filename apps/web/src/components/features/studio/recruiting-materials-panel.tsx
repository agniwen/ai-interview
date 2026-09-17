import {
  UploadMaterialsDialog,
  EditMaterialDialog,
  DeleteMaterialDialog,
} from "./recruiting-material-dialogs";
import { RecruitingMaterialThumbnail } from "./recruiting-material-thumbnail";
import { useRef, useState } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconPencil,
  IconDownload,
  IconEye,
  IconFile,
  IconUpload,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  incomeProofTypeLabels,
  validateRecruitingMaterialFiles,
  RECRUITING_MATERIAL_MAX_COUNT,
} from "@app/shared/recruiting-materials";
import type { RecruitingMaterialMetadata } from "@app/shared/recruiting-materials";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  deleteRecruitingMaterial,
  listRecruitingMaterials,
  materialFileUrl,
  uploadRecruitingMaterial,
  updateRecruitingMaterial,
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
import { RecruitingMaterialPreview } from "./recruiting-material-preview";
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
    <div className="flex flex-col gap-2" aria-label="流水审核结果">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">审核结果</span>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
      {review?.reason ? (
        <p aria-label="流水审核说明" className="text-xs leading-relaxed whitespace-pre-wrap">
          <span className="font-medium">审核说明：</span>
          {review.reason}
        </p>
      ) : null}
    </div>
  );
}

type MaterialFile = Awaited<ReturnType<typeof listRecruitingMaterials>>[number];
function MaterialAttachment({
  file,
  slug,
  candidateId,
  canUpdate,
  canDelete,
  disabled,
  busy,
  onPreview,
  onEdit,
  onDelete,
}: {
  file: MaterialFile;
  slug: string;
  candidateId: string;
  canUpdate: boolean;
  canDelete: boolean;
  disabled?: boolean;
  busy: boolean;
  onPreview: (file: MaterialFile) => void;
  onEdit: (file: MaterialFile) => void;
  onDelete: (file: MaterialFile) => void;
}) {
  return (
    <div className="grid w-max min-w-72 max-w-md shrink-0 gap-2">
      <Attachment className="w-full flex-nowrap">
        {file.contentType.startsWith("image/") || file.contentType.startsWith("video/") ? (
          <AttachmentTrigger aria-label={`预览 ${file.fileName}`} onClick={() => onPreview(file)} />
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
        <AttachmentContent className="min-h-10 py-0.5">
          <AttachmentTitle title={file.fileName}>{file.fileName}</AttachmentTitle>
          <AttachmentDescription>
            {file.incomeType ? incomeProofTypeLabels[file.incomeType] : "未标记"} ·{" "}
            {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions className="min-h-10">
          {canUpdate && !disabled ? (
            <AttachmentAction
              disabled={busy}
              aria-label={`编辑 ${file.fileName} 的类型和备注`}
              onClick={() =>
                onEdit({
                  ...file,
                  incomeType: file.incomeType ?? null,
                  notes: file.notes ?? "",
                })
              }
            >
              <IconPencil />
            </AttachmentAction>
          ) : null}
          {file.contentType.startsWith("image/") || file.contentType.startsWith("video/") ? (
            <AttachmentAction
              aria-label={`${file.contentType.startsWith("video/") ? "播放视频" : "查看大图"} ${file.fileName}`}
              onClick={() => onPreview(file)}
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
              onClick={() => onDelete(file)}
            >
              <IconTrash />
            </AttachmentAction>
          ) : null}
        </AttachmentActions>
      </Attachment>
      {file.notes ? (
        <p
          className="text-muted-foreground line-clamp-2 px-2.5 text-xs wrap-anywhere whitespace-pre-wrap"
          title={file.notes}
        >
          {file.notes}
        </p>
      ) : null}
    </div>
  );
}

function MaterialsEmptyState({
  ready,
  count,
  uploading,
  canUpload,
}: {
  ready: boolean;
  count: number;
  uploading: boolean;
  canUpload: boolean;
}) {
  if (!ready || count > 0 || uploading || canUpload) {
    return null;
  }
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>暂无流水文件</EmptyTitle>
        <EmptyDescription>候选人提供材料后，可在此上传留存。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function RecruitingMaterialsPanel({
  candidateId,
  canCreate,
  canDelete,
  canUpdate = false,
  disabled,
  review,
}: {
  candidateId: string;
  canCreate: boolean;
  canDelete: boolean;
  canUpdate?: boolean;
  disabled?: boolean;
  review?: IncomeProofReview;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; metadata: RecruitingMaterialMetadata }[]
  >([]);
  const [editTarget, setEditTarget] = useState<
    ({ id: string; fileName: string } & RecruitingMaterialMetadata) | null
  >(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<MaterialFile | null>(null);
  const queryKey = ["recruiting-materials", slug, candidateId];
  const materials = useQuery({
    queryFn: () => listRecruitingMaterials(slug, candidateId),
    queryKey,
  });
  const files = materials.data ?? [];
  const previewIndex = files.findIndex((file) => file.id === previewTarget?.id);
  const upload = useMutation({
    mutationFn: async (selected: typeof pendingFiles) => {
      const validationError = validateRecruitingMaterialFiles(
        selected.map(({ file }) => file),
        files.length,
      );
      if (validationError) {
        throw new Error(validationError);
      }
      let completed = 0;
      for (const { file, metadata } of selected) {
        setUploadingName(file.name);
        try {
          await uploadRecruitingMaterial(slug, candidateId, file, metadata);
          setPendingFiles((pending) => pending.filter((item) => item.file !== file));
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
  const update = useMutation({
    mutationFn: (target: NonNullable<typeof editTarget>) =>
      updateRecruitingMaterial(slug, candidateId, target.id, {
        incomeType: target.incomeType,
        notes: target.notes,
      }),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setEditTarget(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("附件信息已保存");
    },
  });
  const busy = upload.isPending || remove.isPending || update.isPending;
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
            disabled={busy || !showUpload}
            onChange={(event) => {
              const selected = [...(event.currentTarget.files ?? [])];
              event.currentTarget.value = "";
              if (selected.length > 0) {
                const error = validateRecruitingMaterialFiles(selected, files.length);
                if (error) {
                  toast.error(error);
                  return;
                }
                setPendingFiles(
                  selected.map((file) => ({ file, metadata: { incomeType: null, notes: "" } })),
                );
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
          <MaterialsEmptyState
            ready={materials.isSuccess}
            count={files.length}
            uploading={uploadingName !== null}
            canUpload={showUpload}
          />
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
            <div className="flex w-max min-w-full flex-nowrap items-start gap-3 py-1">
              {files.map((file) => (
                <MaterialAttachment
                  key={file.id}
                  file={file}
                  slug={slug}
                  candidateId={candidateId}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  disabled={disabled}
                  busy={busy}
                  onPreview={setPreviewTarget}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
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
      {showUpload ? (
        <UploadMaterialsDialog
          pendingFiles={pendingFiles}
          setPendingFiles={setPendingFiles}
          busy={busy}
          onSubmit={() => upload.mutate(pendingFiles)}
          onClose={() => setPendingFiles([])}
        />
      ) : null}
      {canUpdate && !disabled ? (
        <EditMaterialDialog
          editTarget={editTarget}
          setEditTarget={setEditTarget}
          busy={busy}
          onSubmit={(value) => update.mutate(value)}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
      {previewTarget ? (
        <RecruitingMaterialPreview
          file={previewTarget}
          url={materialFileUrl(slug, candidateId, previewTarget.id)}
          onClose={() => setPreviewTarget(null)}
          navigation={{
            index: previewIndex,
            onNext: () => {
              const file = files[previewIndex + 1];
              if (file) {
                setPreviewTarget(file);
              }
            },
            onPrevious: () => {
              const file = files[previewIndex - 1];
              if (file) {
                setPreviewTarget(file);
              }
            },
            total: files.length,
          }}
        />
      ) : null}
      {canDelete && !disabled ? (
        <DeleteMaterialDialog
          deleteTarget={deleteTarget}
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onSubmit={(id) => remove.mutate(id)}
        />
      ) : null}
    </section>
  );
}
