import { useId, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import {
  CANDIDATE_MATERIAL_FILE_ACCEPT,
  CANDIDATE_MATERIAL_FILE_LABEL,
  CANDIDATE_MATERIAL_MAX_COUNT,
  createCandidateMaterialLinkSchema,
  getCandidateMaterialBadgeLabel,
  inferCandidateMaterialCategory,
  validateCandidateMaterialFiles,
} from "@app/shared/candidate-materials";
import type {
  CandidateMaterialCategory,
  CandidateMaterialKind,
  CreateCandidateMaterialLinkInput,
} from "@app/shared/candidate-materials";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export interface PendingCandidateMaterialFile {
  category: CandidateMaterialCategory;
  error?: string;
  file: File;
  id: string;
  notes: string;
  title: string;
}

function formatSizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

function FileMaterialTabContent({
  busy,
  existingCount,
  fileNotes,
  fileSelectionError,
  formId,
  onFileNotesChange,
  onSelectFiles,
  onRemoveFile,
  onSingleTitleChange,
  onSubmit,
  pendingFiles,
  resetKey,
  singleTitle,
}: {
  busy: boolean;
  existingCount: number;
  fileNotes: string;
  fileSelectionError: string | null;
  formId: string;
  onFileNotesChange: (value: string) => void;
  onRemoveFile: (id: string) => void;
  onSelectFiles: (files: File[]) => void;
  onSingleTitleChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  pendingFiles: PendingCandidateMaterialFile[];
  resetKey: number;
  singleTitle: string;
}) {
  const id = useId();
  const isSingleFile = pendingFiles.length === 1;
  const remainingSlots = Math.max(0, CANDIDATE_MATERIAL_MAX_COUNT - existingCount);

  return (
    <form id={formId} className="space-y-4" onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={fileSelectionError ? "true" : undefined}>
          <FieldLabel>附件文件</FieldLabel>
          <FileUpload
            accept={CANDIDATE_MATERIAL_FILE_ACCEPT}
            ariaLabel="选择或拖放附件文件"
            browseLabel="选择文件"
            description={`仅支持 ${CANDIDATE_MATERIAL_FILE_LABEL}；单个不超过 100 MB，当前还可添加 ${remainingSlots} 份。`}
            disabled={busy}
            multiple
            onFilesSelected={(incoming) => {
              onSelectFiles(incoming);
              return false;
            }}
            resetKey={resetKey}
            showFileList={false}
            title="点击或拖放文件到此处"
          />
          {fileSelectionError ? <FieldError>{fileSelectionError}</FieldError> : null}
        </Field>

        {pendingFiles.length > 0 ? (
          <ScrollArea
            className="max-h-40 rounded-lg border border-border/70 p-2"
            scrollbars="leave"
          >
            <ul className="divide-border divide-y">
              {pendingFiles.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatSizeLabel(entry.file.size)} ·{" "}
                      {getCandidateMaterialBadgeLabel({
                        category: entry.category,
                        kind: "file",
                      })}
                    </p>
                    {entry.error ? (
                      <p className="mt-1 text-destructive text-xs">{entry.error}</p>
                    ) : null}
                  </div>
                  <Button
                    aria-label={`移除待上传文件 ${entry.file.name}`}
                    disabled={busy}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    onClick={() => onRemoveFile(entry.id)}
                  >
                    <IconTrash />
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : null}

        {isSingleFile ? (
          <Field>
            <FieldLabel htmlFor={`${id}-single-title`}>标题</FieldLabel>
            <Input
              id={`${id}-single-title`}
              disabled={busy}
              maxLength={200}
              placeholder="留空默认使用文件名"
              value={singleTitle}
              onChange={(event) => onSingleTitleChange(event.target.value)}
            />
          </Field>
        ) : null}

        {pendingFiles.length > 1 ? (
          <p className="text-muted-foreground text-xs">
            已选 {pendingFiles.length} 个文件，将分别使用各自文件名作为标题（上传后可单独编辑）。
          </p>
        ) : null}

        <Field>
          <FieldLabel htmlFor={`${id}-file-notes`}>说明</FieldLabel>
          <Textarea
            id={`${id}-file-notes`}
            rows={3}
            className="field-sizing-fixed resize-none"
            disabled={busy}
            maxLength={500}
            placeholder="填写资料说明，如作品背景、重点查看内容等（选填）"
            value={fileNotes}
            onChange={(event) => onFileNotesChange(event.target.value)}
          />
        </Field>
      </FieldGroup>
    </form>
  );
}

function LinkMaterialTabContent({
  busy,
  formId,
  notes,
  onNotesChange,
  onSubmit,
  onTitleChange,
  onUrlChange,
  title,
  url,
  urlError,
}: {
  busy: boolean;
  formId: string;
  notes: string;
  onNotesChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  title: string;
  url: string;
  urlError: string | null;
}) {
  const id = useId();
  return (
    <form id={formId} className="space-y-4" onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={urlError ? "true" : undefined}>
          <FieldLabel htmlFor={`${id}-url`}>链接地址</FieldLabel>
          <Input
            id={`${id}-url`}
            type="url"
            required
            disabled={busy}
            placeholder="https://example.com/portfolio"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
          />
          {urlError ? <FieldError>{urlError}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-link-title`}>标题</FieldLabel>
          <Input
            id={`${id}-link-title`}
            disabled={busy}
            maxLength={200}
            placeholder="例如：个人作品集（留空自动生成）"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-link-notes`}>说明</FieldLabel>
          <Textarea
            id={`${id}-link-notes`}
            rows={3}
            className="field-sizing-fixed resize-none"
            disabled={busy}
            maxLength={500}
            placeholder="填写资料说明、访问密码或重点查看内容（选填）"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </Field>
      </FieldGroup>
    </form>
  );
}

function getFileSubmitLabel(busy: boolean, fileCount: number): string {
  if (busy) {
    return "上传中…";
  }
  if (fileCount > 0) {
    return `确认上传（${fileCount}）`;
  }
  return "确认上传";
}

export function AddCandidateMaterialDialog({
  busy,
  existingCount,
  onClose,
  onSubmitFiles,
  onSubmitLink,
  open,
  pendingFiles,
  setPendingFiles,
}: {
  busy: boolean;
  existingCount: number;
  onClose: () => void;
  onSubmitFiles: (files: PendingCandidateMaterialFile[]) => void;
  onSubmitLink: (input: CreateCandidateMaterialLinkInput) => Promise<void> | void;
  open: boolean;
  pendingFiles: PendingCandidateMaterialFile[];
  setPendingFiles: React.Dispatch<React.SetStateAction<PendingCandidateMaterialFile[]>>;
}) {
  const id = useId();
  const fileFormId = `${id}-file-form`;
  const linkFormId = `${id}-link-form`;

  const [kind, setKind] = useState<CandidateMaterialKind>("file");
  const [resetKey, setResetKey] = useState(0);
  const [fileSelectionError, setFileSelectionError] = useState<string | null>(null);
  const [singleTitle, setSingleTitle] = useState("");
  const [fileNotes, setFileNotes] = useState("");

  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  function resetAll() {
    setKind("file");
    setFileSelectionError(null);
    setSingleTitle("");
    setFileNotes("");
    setLinkUrl("");
    setLinkTitle("");
    setLinkNotes("");
    setLinkError(null);
    setResetKey((key) => key + 1);
  }

  function handleClose() {
    if (busy) {
      return;
    }
    resetAll();
    onClose();
  }

  function handleSelectFiles(incoming: File[]) {
    const error = validateCandidateMaterialFiles(incoming, existingCount + pendingFiles.length);
    if (error) {
      setFileSelectionError(error);
      setResetKey((key) => key + 1);
      return;
    }
    setFileSelectionError(null);
    const added = incoming.map((file) => ({
      category: inferCandidateMaterialCategory(file.name, file.type),
      file,
      id: crypto.randomUUID(),
      notes: fileNotes,
      title: file.name,
    }));
    const next = [...pendingFiles, ...added];
    if (next.length === 1 && next[0]) {
      setSingleTitle(next[0].title);
    }
    setPendingFiles(next);
    setResetKey((key) => key + 1);
  }

  function handleRemoveFile(fileId: string) {
    const next = pendingFiles.filter((item) => item.id !== fileId);
    if (next.length === 1 && next[0]) {
      setSingleTitle(next[0].title);
    }
    setPendingFiles(next);
    setFileSelectionError(null);
  }

  function handleSubmitFiles(event: React.FormEvent) {
    event.preventDefault();
    if (pendingFiles.length === 0) {
      setFileSelectionError("请选择需要上传的文件");
      return;
    }
    const prepared = pendingFiles.map((entry, index) => {
      if (pendingFiles.length === 1 && index === 0) {
        return {
          ...entry,
          notes: fileNotes,
          title: singleTitle.trim() || entry.file.name,
        };
      }
      return {
        ...entry,
        notes: fileNotes,
      };
    });
    setPendingFiles(prepared);
    onSubmitFiles(prepared);
  }

  async function handleSubmitLink(event: React.FormEvent) {
    event.preventDefault();
    const parsed = createCandidateMaterialLinkSchema.safeParse({
      notes: linkNotes,
      title: linkTitle.trim() ? linkTitle : undefined,
      url: linkUrl,
    });
    if (!parsed.success) {
      setLinkError(parsed.error.issues[0]?.message ?? "请检查填写内容");
      return;
    }
    setLinkError(null);
    try {
      await onSubmitLink(parsed.data);
      resetAll();
    } catch {
      // Mutation error toast is handled by the caller; keep dialog inputs intact.
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
      title="新增资料"
      description="选择新增附件或外部链接，并填写说明。"
      size="lg"
      dismissible={!busy}
      showCloseButton={!busy}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={handleClose}>
            取消
          </Button>
          {kind === "file" ? (
            <Button type="submit" form={fileFormId} disabled={busy || pendingFiles.length === 0}>
              {getFileSubmitLabel(busy, pendingFiles.length)}
            </Button>
          ) : (
            <Button type="submit" form={linkFormId} disabled={busy}>
              {busy ? "添加中…" : "确认添加"}
            </Button>
          )}
        </div>
      }
    >
      <Tabs
        value={kind}
        onValueChange={(next) => {
          if (next === "file" || next === "link") {
            setKind(next);
            setFileSelectionError(null);
            setLinkError(null);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTab disabled={busy} value="file">
            附件
          </TabsTab>
          <TabsTab disabled={busy} value="link">
            链接
          </TabsTab>
        </TabsList>
        <TabsPanel value="file" className="pt-3">
          <FileMaterialTabContent
            busy={busy}
            existingCount={existingCount}
            fileNotes={fileNotes}
            fileSelectionError={fileSelectionError}
            formId={fileFormId}
            pendingFiles={pendingFiles}
            resetKey={resetKey}
            singleTitle={singleTitle}
            onFileNotesChange={setFileNotes}
            onRemoveFile={handleRemoveFile}
            onSelectFiles={handleSelectFiles}
            onSingleTitleChange={setSingleTitle}
            onSubmit={handleSubmitFiles}
          />
        </TabsPanel>
        <TabsPanel value="link" className="pt-3">
          <LinkMaterialTabContent
            busy={busy}
            formId={linkFormId}
            notes={linkNotes}
            title={linkTitle}
            url={linkUrl}
            urlError={linkError}
            onNotesChange={setLinkNotes}
            onSubmit={(event) => handleSubmitLink(event)}
            onTitleChange={setLinkTitle}
            onUrlChange={(value) => {
              setLinkUrl(value);
              if (linkError) {
                setLinkError(null);
              }
            }}
          />
        </TabsPanel>
      </Tabs>
    </Modal>
  );
}
