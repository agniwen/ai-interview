"use client";

import { IconFileSpreadsheet, IconPhoto, IconUpload, type TablerIcon } from "@tabler/icons-react";
import * as React from "react";

import { BorderBeam } from "border-beam";

import { cn } from "@app/shared/utils";
import { FileThumbnail } from "@/components/ui/file-thumbnail";

type FileUploadItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
};

type AcceptedFileType = {
  label: string;
  icon: TablerIcon;
};

type FileUploadProps = {
  accept?: string;
  acceptedFileTypes?: AcceptedFileType[];
  ariaLabel?: string;
  borderBeamTheme?: React.ComponentProps<typeof BorderBeam>["theme"];
  browseLabel?: string;
  className?: string;
  description?: string;
  disabled?: boolean;
  draggingLabel?: string;
  inputId?: string;
  maxFiles?: number;
  multiple?: boolean;
  resetKey?: React.Key;
  rejectionLabel?: string;
  showBorderBeam?: boolean;
  showFileList?: boolean;
  title?: string;
  onFilesAccepted?: (files: File[]) => void;
  onFilesChange?: (files: FileUploadItem[]) => void;
  onFileLimitExceeded?: (files: File[], maxFiles: number) => void;
  onFilesSelected?: (files: File[]) => boolean | void;
};

const ACCEPTED_FILE_TYPES: AcceptedFileType[] = [
  { label: "Image", icon: IconPhoto },
  { label: "PDF", icon: IconUpload },
  { label: "Sheet", icon: IconFileSpreadsheet },
];

const ICON_TRANSFORMS = [
  {
    active: "translate(-108%, -50%) rotate(-10deg) scale(1.04)",
    idle: "translate(-78%, -50%) rotate(-8deg)",
  },
  {
    active: "translate(-50%, -50%) rotate(0deg) scale(1.08)",
    idle: "translate(-50%, -50%) rotate(0deg)",
  },
  {
    active: "translate(8%, -50%) rotate(10deg) scale(1.04)",
    idle: "translate(-22%, -50%) rotate(8deg)",
  },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true;

  return accept.split(",").some((rawToken) => {
    const token = rawToken.trim().toLowerCase();

    if (!token) return false;
    if (token.startsWith(".")) return file.name.toLowerCase().endsWith(token);
    if (token.endsWith("/*")) {
      return file.type.toLowerCase().startsWith(token.slice(0, -1));
    }

    return file.type.toLowerCase() === token;
  });
}

function toUploadItems(files: FileList | File[]): FileUploadItem[] {
  return Array.from(files).map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
    type: file.type || "Unknown type",
    url: URL.createObjectURL(file),
  }));
}

function UploadIconCluster({
  acceptedFileTypes,
  isDragging,
}: {
  acceptedFileTypes: AcceptedFileType[];
  isDragging: boolean;
}) {
  const singleIcon = acceptedFileTypes.length === 1;

  if (singleIcon) {
    return (
      <div className="grid h-14 w-14 place-items-center">
        <div
          className={cn(
            "grid size-12 place-items-center rounded-xl border bg-background text-muted-foreground transition-[transform,color,background-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
            "motion-reduce:transition-none",
            isDragging && "scale-[1.08] bg-popover text-foreground shadow-sm",
          )}
        >
          <IconUpload className="size-5" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-14 w-36">
      {acceptedFileTypes.map((item, index) => {
        const AcceptedIcon = item.icon;

        return (
          <div
            className={cn(
              "absolute top-1/2 left-1/2 grid size-12 place-items-center rounded-xl border bg-background text-muted-foreground transition-[transform,color,background-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
              "motion-reduce:transition-none",
              index === 1 && "z-10",
              isDragging && "bg-popover text-foreground shadow-sm",
            )}
            key={item.label}
            style={{
              transform: isDragging ? ICON_TRANSFORMS[index]?.active : ICON_TRANSFORMS[index]?.idle,
            }}
          >
            <AcceptedIcon className="block size-5" />
          </div>
        );
      })}
    </div>
  );
}

export function FileUpload({
  accept,
  acceptedFileTypes = ACCEPTED_FILE_TYPES,
  ariaLabel,
  borderBeamTheme = "light",
  browseLabel = "Browse files",
  className,
  description = "PDF, DOCX, XLSX, CSV, PNG, or JPG",
  disabled = false,
  draggingLabel = "Drop to add",
  inputId,
  maxFiles,
  multiple = true,
  resetKey,
  rejectionLabel = "This file type is not supported here.",
  showBorderBeam = true,
  showFileList = true,
  title = "Click to upload or drop files",
  onFilesAccepted,
  onFilesChange,
  onFileLimitExceeded,
  onFilesSelected,
}: FileUploadProps) {
  const dragDepthRef = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const generatedInputId = React.useId();
  const resolvedInputId = inputId ?? generatedInputId;
  const [isDragging, setIsDragging] = React.useState(false);
  const [files, setFiles] = React.useState<FileUploadItem[]>([]);
  const [rejectionMessage, setRejectionMessage] = React.useState<string | null>(null);

  const clearFiles = React.useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
    setRejectionMessage(null);
    setFiles((previousFiles) => {
      previousFiles.forEach((file) => URL.revokeObjectURL(file.url));
      return [];
    });
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const commitFiles = React.useCallback(
    (nextFiles: FileList | File[]) => {
      if (disabled) return;

      const incomingFiles = Array.from(nextFiles);
      const fileLimit = maxFiles ?? (multiple ? undefined : 1);

      if (fileLimit && incomingFiles.length > fileLimit) {
        clearFiles();
        setRejectionMessage(`最多选择 ${fileLimit} 份文件。`);
        onFileLimitExceeded?.(incomingFiles, fileLimit);
        return;
      }

      if (onFilesSelected?.(incomingFiles) === false) {
        clearFiles();
        return;
      }

      const acceptedFiles = incomingFiles.filter((file) => matchesAccept(file, accept));

      if (acceptedFiles.length === 0) {
        clearFiles();
        setRejectionMessage(rejectionLabel);
        return;
      }

      setRejectionMessage(null);
      const items = showFileList || onFilesChange ? toUploadItems(acceptedFiles) : [];
      setFiles((previousFiles) => {
        previousFiles.forEach((file) => URL.revokeObjectURL(file.url));
        return showFileList ? items : [];
      });
      onFilesChange?.(items);
      onFilesAccepted?.(acceptedFiles);
    },
    [
      accept,
      clearFiles,
      disabled,
      maxFiles,
      multiple,
      onFileLimitExceeded,
      onFilesAccepted,
      onFilesChange,
      onFilesSelected,
      rejectionLabel,
      showFileList,
    ],
  );

  React.useEffect(() => {
    return () => {
      files.forEach((file) => URL.revokeObjectURL(file.url));
    };
  }, [files]);

  React.useEffect(() => {
    clearFiles();
  }, [clearFiles, resetKey]);

  const openFileDialog = React.useCallback(() => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;

    input.multiple = multiple;
    if (multiple) {
      input.setAttribute("multiple", "");
    } else {
      input.removeAttribute("multiple");
    }
    input.click();
  }, [disabled, multiple]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      commitFiles(event.target.files);
      event.currentTarget.value = "";
    }
  }

  const fileInput = multiple ? (
    <input
      accept={accept}
      className="hidden"
      disabled={disabled}
      id={resolvedInputId}
      key="multiple"
      multiple
      onChange={handleInputChange}
      ref={inputRef}
      type="file"
    />
  ) : (
    <input
      accept={accept}
      className="hidden"
      disabled={disabled}
      id={resolvedInputId}
      key="single"
      onChange={handleInputChange}
      ref={inputRef}
      type="file"
    />
  );

  const dropzone = (
    <label
      aria-disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative flex min-h-52 cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-[1.125rem] border border-dashed bg-background px-6 py-8 text-center transition-[border-color,background-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)]",
        "motion-reduce:transition-none",
        disabled
          ? "pointer-events-none cursor-not-allowed opacity-60"
          : isDragging
            ? "border-foreground/40 bg-accent/35"
            : "border-foreground/20 hover:border-foreground/35 hover:bg-muted/35 dark:border-foreground/25 dark:hover:border-foreground/40",
      )}
      htmlFor={resolvedInputId}
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        if (event.dataTransfer.files.length > 0) {
          commitFiles(event.dataTransfer.files);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openFileDialog();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <UploadIconCluster acceptedFileTypes={acceptedFileTypes} isDragging={isDragging} />
      <div className="space-y-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-muted-foreground text-xs">{description}</div>
        {rejectionMessage ? (
          <div className="text-destructive text-xs">{rejectionMessage}</div>
        ) : null}
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground text-xs">
        {/* <IconUpload className="size-3.5" /> */}
        <span>{isDragging ? draggingLabel : browseLabel}</span>
      </div>
      {fileInput}
    </label>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {showBorderBeam ? (
        <BorderBeam
          active={isDragging}
          borderRadius={18}
          brightness={2.4}
          className="rounded-[1.125rem]"
          colorVariant="ocean"
          duration={2.4}
          size="md"
          strength={1}
          theme={borderBeamTheme}
        >
          {dropzone}
        </BorderBeam>
      ) : (
        dropzone
      )}
      {showFileList && files.length > 0 ? (
        <div className="rounded-xl border bg-background">
          {files.map((file) => (
            <div
              className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
              key={file.id}
            >
              <FileThumbnail
                className="size-10 shrink-0 rounded-lg"
                file={{
                  name: file.name,
                  type: file.type,
                }}
                previewImageUrl={file.type.startsWith("image/") ? file.url : null}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{file.name}</div>
                <div className="truncate text-muted-foreground text-xs">
                  {file.type} - {formatBytes(file.size)}
                </div>
              </div>
              <div className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                已选择
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
