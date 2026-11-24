import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFile,
  IconFileText,
  IconFileZip,
  IconLink,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react";
import { toast } from "sonner";
import {
  CANDIDATE_MATERIAL_MAX_COUNT,
  getCandidateMaterialBadgeLabel,
  isPreviewableCandidateMaterial,
  validateCandidateMaterialFiles,
} from "@app/shared/candidate-materials";
import type {
  CandidateMaterialItem,
  CandidateMaterialOwnerType,
  CreateCandidateMaterialLinkInput,
  UpdateCandidateMaterialInput,
} from "@app/shared/candidate-materials";
import type { CandidateMaterialsClient } from "@/lib/client/candidate-materials";
import {
  candidateMaterialFileUrl,
  createCandidateMaterialLink,
  deleteCandidateMaterial,
  listCandidateMaterials,
  updateCandidateMaterial,
  uploadCandidateMaterialFile,
} from "@/lib/client/candidate-materials";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { RecruitingMaterialThumbnail } from "../recruiting-material-thumbnail";
import { AddCandidateMaterialDialog } from "./add-candidate-material-dialog";
import type { PendingCandidateMaterialFile } from "./add-candidate-material-dialog";
import {
  DeleteCandidateMaterialDialog,
  EditCandidateMaterialDialog,
} from "./candidate-material-dialogs";
import { CandidateMaterialPreview } from "./candidate-material-preview";

export type { CandidateMaterialsClient } from "@/lib/client/candidate-materials";

const defaultClient: CandidateMaterialsClient = {
  candidateMaterialFileUrl,
  createCandidateMaterialLink,
  deleteCandidateMaterial,
  listCandidateMaterials,
  updateCandidateMaterial,
  uploadCandidateMaterialFile,
};

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return "";
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

function MaterialCategoryIcon({ item }: { item: CandidateMaterialItem }) {
  if (item.kind === "link") {
    return <IconLink />;
  }
  switch (item.category) {
    case "video": {
      return <IconVideo />;
    }
    case "image": {
      return <IconPhoto />;
    }
    case "archive": {
      return <IconFileZip />;
    }
    case "document": {
      return <IconFileText />;
    }
    default: {
      return <IconFile />;
    }
  }
}

function CandidateMaterialCard({
  busy,
  canEdit,
  fileUrl,
  item,
  onDelete,
  onEdit,
  onPreview,
}: {
  busy: boolean;
  canEdit: boolean;
  fileUrl: string | null;
  item: CandidateMaterialItem;
  onDelete: (item: CandidateMaterialItem) => void;
  onEdit: (item: CandidateMaterialItem) => void;
  onPreview: (item: CandidateMaterialItem) => void;
}) {
  const isImage = item.kind === "file" && Boolean(item.contentType?.startsWith("image/"));
  const previewable = isPreviewableCandidateMaterial(item);
  const description =
    item.kind === "link"
      ? (item.url ?? "")
      : [item.fileName, formatFileSize(item.sizeBytes)].filter(Boolean).join(" · ");

  return (
    <div className="min-w-0 space-y-1.5">
      <Attachment className="w-full flex-nowrap">
        {previewable ? (
          <AttachmentTrigger aria-label={`预览 ${item.title}`} onClick={() => onPreview(item)} />
        ) : null}
        {item.kind === "link" && item.url ? (
          <AttachmentTrigger
            render={
              <a
                aria-label={`打开链接 ${item.title}`}
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              />
            }
          />
        ) : null}
        {isImage && fileUrl ? (
          <RecruitingMaterialThumbnail filename={item.fileName ?? item.title} url={fileUrl} />
        ) : (
          <AttachmentMedia>
            <MaterialCategoryIcon item={item} />
          </AttachmentMedia>
        )}
        <AttachmentContent className="min-h-10 py-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <AttachmentTitle title={item.title}>{item.title}</AttachmentTitle>
            <Badge className="h-5 shrink-0 px-1.5 text-[11px]" variant="secondary">
              {getCandidateMaterialBadgeLabel(item)}
            </Badge>
          </div>
          <AttachmentDescription title={description}>{description}</AttachmentDescription>
        </AttachmentContent>
        <AttachmentActions className="min-h-10">
          {item.kind === "link" && item.url ? (
            <AttachmentAction
              nativeButton={false}
              render={
                <a
                  aria-label={`新窗口打开 ${item.title}`}
                  href={item.url}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
              aria-label={`新窗口打开 ${item.title}`}
            >
              <IconExternalLink />
            </AttachmentAction>
          ) : null}
          {previewable ? (
            <AttachmentAction aria-label={`查看预览 ${item.title}`} onClick={() => onPreview(item)}>
              <IconEye />
            </AttachmentAction>
          ) : null}
          {item.kind === "file" && fileUrl ? (
            <AttachmentAction
              nativeButton={false}
              render={
                <a
                  aria-label={`下载 ${item.title}`}
                  download={item.fileName ?? item.title}
                  href={fileUrl}
                />
              }
              aria-label={`下载 ${item.title}`}
            >
              <IconDownload />
            </AttachmentAction>
          ) : null}
          {canEdit ? (
            <>
              <AttachmentAction
                aria-label={`编辑 ${item.title}`}
                disabled={busy}
                onClick={() => onEdit(item)}
              >
                <IconPencil />
              </AttachmentAction>
              <AttachmentAction
                aria-label={`删除 ${item.title}`}
                disabled={busy}
                onClick={() => onDelete(item)}
              >
                <IconTrash />
              </AttachmentAction>
            </>
          ) : null}
        </AttachmentActions>
      </Attachment>
      {item.notes ? (
        <p
          className="text-muted-foreground line-clamp-2 px-2 text-xs wrap-anywhere whitespace-pre-wrap"
          title={item.notes}
        >
          {item.notes}
        </p>
      ) : null}
    </div>
  );
}

function useCandidateMaterialsMutations({
  client,
  existingCount,
  ownerId,
  ownerType,
  previewTargetId,
  queryClient,
  queryKey,
  setAddOpen,
  setDeleteTarget,
  setEditTarget,
  setPendingFiles,
  setPreviewTarget,
  slug,
}: {
  client: CandidateMaterialsClient;
  existingCount: number;
  ownerId: string;
  ownerType: CandidateMaterialOwnerType;
  previewTargetId: string | null;
  queryClient: ReturnType<typeof useQueryClient>;
  queryKey: readonly ["candidate-materials", CandidateMaterialOwnerType, string, string];
  setAddOpen: (open: boolean) => void;
  setDeleteTarget: (item: CandidateMaterialItem | null) => void;
  setEditTarget: (item: CandidateMaterialItem | null) => void;
  setPendingFiles: React.Dispatch<React.SetStateAction<PendingCandidateMaterialFile[]>>;
  setPreviewTarget: (item: CandidateMaterialItem | null) => void;
  slug: string;
}) {
  const uploadMutation = useMutation({
    mutationFn: async (selected: PendingCandidateMaterialFile[]) => {
      const validationError = validateCandidateMaterialFiles(
        selected.map((entry) => entry.file),
        existingCount,
      );
      if (validationError) {
        throw new Error(validationError);
      }
      let completed = 0;
      for (const entry of selected) {
        try {
          await client.uploadCandidateMaterialFile(ownerType, slug, ownerId, entry.file, {
            notes: entry.notes,
            title: entry.title,
          });
          setPendingFiles((current) => current.filter((item) => item.id !== entry.id));
          completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "上传失败，请重试";
          setPendingFiles((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, error: message } : item)),
          );
          throw new Error(
            `已上传 ${completed}/${selected.length} 份；${entry.file.name}：${message}`,
            { cause: error },
          );
        }
      }
      return completed;
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (count) => {
      setAddOpen(false);
      setPendingFiles([]);
      toast.success(`已上传 ${count} 份补充资料`);
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: (input: CreateCandidateMaterialLinkInput) =>
      client.createCandidateMaterialLink(ownerType, slug, ownerId, input),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "添加资料链接失败");
    },
    onSuccess: async () => {
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("已添加资料链接");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      materialId,
      patch,
    }: {
      materialId: string;
      patch: UpdateCandidateMaterialInput;
    }) => client.updateCandidateMaterial(ownerType, slug, ownerId, materialId, patch),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "保存补充资料失败");
    },
    onSuccess: async () => {
      setEditTarget(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("补充资料已更新");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: string) =>
      client.deleteCandidateMaterial(ownerType, slug, ownerId, materialId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除补充资料失败");
    },
    onSuccess: async (_result, materialId) => {
      if (previewTargetId === materialId) {
        setPreviewTarget(null);
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("补充资料已删除");
    },
  });

  return {
    busy:
      uploadMutation.isPending ||
      createLinkMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
    createLinkMutation,
    deleteMutation,
    updateMutation,
    uploadMutation,
  };
}

export function CandidateMaterialsPanel({
  canEdit,
  client = defaultClient,
  emptyDescription = "可补充作品集压缩包或链接、视频、图片等材料；从人才库进入招聘台时会自动携带关联。",
  ownerId,
  ownerType,
  slug,
}: {
  canEdit: boolean;
  client?: CandidateMaterialsClient;
  emptyDescription?: string;
  ownerId: string;
  ownerType: CandidateMaterialOwnerType;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["candidate-materials", ownerType, slug, ownerId] as const;

  const [addOpen, setAddOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingCandidateMaterialFile[]>([]);
  const [editTarget, setEditTarget] = useState<CandidateMaterialItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CandidateMaterialItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<CandidateMaterialItem | null>(null);

  const materialsQuery = useQuery({
    queryFn: () => client.listCandidateMaterials(ownerType, slug, ownerId),
    queryKey,
  });
  const items = materialsQuery.data ?? [];
  const atLimit = items.length >= CANDIDATE_MATERIAL_MAX_COUNT;
  const previewableFiles = items.filter((item) => item.kind === "file");
  const previewIndex = previewTarget
    ? previewableFiles.findIndex((item) => item.id === previewTarget.id)
    : -1;

  const { busy, createLinkMutation, deleteMutation, updateMutation, uploadMutation } =
    useCandidateMaterialsMutations({
      client,
      existingCount: items.length,
      ownerId,
      ownerType,
      previewTargetId: previewTarget?.id ?? null,
      queryClient,
      queryKey,
      setAddOpen,
      setDeleteTarget,
      setEditTarget,
      setPendingFiles,
      setPreviewTarget,
      slug,
    });

  return (
    <section aria-label="补充资料" className="flex flex-col gap-3">
      <Frame className="min-w-0">
        <FrameHeader className="h-auto min-h-11 flex-wrap items-center justify-between gap-3 py-2">
          <FrameTitle>
            补充资料
            {materialsQuery.isSuccess ? `（${items.length}/${CANDIDATE_MATERIAL_MAX_COUNT}）` : ""}
          </FrameTitle>
          {canEdit ? (
            <Button
              disabled={busy || !materialsQuery.isSuccess || atLimit}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setAddOpen(true)}
            >
              <IconPlus data-icon="inline-start" />
              新增资料
            </Button>
          ) : null}
        </FrameHeader>
        <FramePanel className="flex min-w-0 flex-col gap-3">
          {materialsQuery.isPending ? <Skeleton className="h-20 w-full" /> : null}
          {materialsQuery.isError ? (
            <div role="alert" className="flex items-center gap-2 text-sm">
              <span>补充资料加载失败</span>
              <Button size="sm" variant="ghost" onClick={() => materialsQuery.refetch()}>
                重试
              </Button>
            </div>
          ) : null}
          {materialsQuery.isSuccess && items.length === 0 ? (
            <Empty className="py-4">
              <EmptyHeader>
                <EmptyTitle>暂无补充资料</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {items.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <CandidateMaterialCard
                  key={item.id}
                  busy={busy}
                  canEdit={canEdit}
                  fileUrl={
                    item.kind === "file"
                      ? client.candidateMaterialFileUrl(ownerType, slug, ownerId, item.id)
                      : null
                  }
                  item={item}
                  onDelete={setDeleteTarget}
                  onEdit={setEditTarget}
                  onPreview={setPreviewTarget}
                />
              ))}
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      {canEdit ? (
        <>
          <AddCandidateMaterialDialog
            busy={uploadMutation.isPending || createLinkMutation.isPending}
            existingCount={items.length}
            open={addOpen}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            onClose={() => {
              setAddOpen(false);
              setPendingFiles([]);
            }}
            onSubmitFiles={(files) => uploadMutation.mutate(files)}
            onSubmitLink={async (input) => {
              await createLinkMutation.mutateAsync(input);
            }}
          />
          <EditCandidateMaterialDialog
            busy={updateMutation.isPending}
            item={editTarget}
            onClose={() => setEditTarget(null)}
            onSubmit={async (materialId, patch) => {
              await updateMutation.mutateAsync({ materialId, patch });
            }}
          />
          <DeleteCandidateMaterialDialog
            busy={deleteMutation.isPending}
            item={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={(materialId) => deleteMutation.mutate(materialId)}
          />
        </>
      ) : null}

      {previewTarget && previewTarget.kind === "file" ? (
        <CandidateMaterialPreview
          item={previewTarget}
          url={client.candidateMaterialFileUrl(ownerType, slug, ownerId, previewTarget.id)}
          onClose={() => setPreviewTarget(null)}
          navigation={{
            index: previewIndex,
            onNext: () => {
              const nextItem = previewableFiles[previewIndex + 1];
              if (nextItem) {
                setPreviewTarget(nextItem);
              }
            },
            onPrevious: () => {
              const prevItem = previewableFiles[previewIndex - 1];
              if (prevItem) {
                setPreviewTarget(prevItem);
              }
            },
            total: previewableFiles.length,
          }}
        />
      ) : null}
    </section>
  );
}
