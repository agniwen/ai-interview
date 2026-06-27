"use client";

import {
  IconFileText,
  IconMusic,
  IconPaperclip,
  IconPhoto,
  IconVideo,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { createContext, use, useCallback, useMemo } from "react";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@arc/shared/utils";

// ============================================================================
// Types
// ============================================================================

export type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown";

export type AttachmentVariant = "grid" | "inline" | "list";

const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof IconPhoto> = {
  audio: IconMusic,
  document: IconFileText,
  image: IconPhoto,
  source: IconWorld,
  unknown: IconPaperclip,
  video: IconVideo,
};

export function PdfFileIcon({ className }: { className?: string }) {
  return <ResumeDocumentFileIcon className={className} kind="pdf" />;
}

function isPdfAttachment(data: AttachmentData) {
  if (data.type !== "file") {
    return false;
  }
  if (data.mediaType === "application/pdf") {
    return true;
  }
  return Boolean(data.filename?.toLowerCase().endsWith(".pdf"));
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getMediaCategory(data: AttachmentData): AttachmentMediaCategory {
  if (data.type === "source-document") {
    return "source";
  }

  const mediaType = data.mediaType ?? "";

  if (mediaType.startsWith("image/")) {
    return "image";
  }
  if (mediaType.startsWith("video/")) {
    return "video";
  }
  if (mediaType.startsWith("audio/")) {
    return "audio";
  }
  if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
    return "document";
  }

  return "unknown";
}

export function getAttachmentLabel(data: AttachmentData): string {
  if (data.type === "source-document") {
    return data.title || data.filename || "Source";
  }

  const category = getMediaCategory(data);
  return data.filename || (category === "image" ? "Image" : "Attachment");
}

function resolvePdfIconClassName(variant: AttachmentVariant) {
  if (variant === "inline") {
    return "size-full";
  }
  return variant === "list" ? "size-9" : "size-14";
}

function renderAttachmentImage(url: string, filename: string | undefined, isGrid: boolean) {
  return isGrid ? (
    // oxlint-disable-next-line next/no-img-element -- User-provided data URLs / blob URLs; next/image doesn't apply.
    <img
      alt={filename || "Image"}
      className="size-full object-cover"
      height={96}
      src={url}
      width={96}
    />
  ) : (
    // oxlint-disable-next-line next/no-img-element -- User-provided data URLs / blob URLs; next/image doesn't apply.
    <img
      alt={filename || "Image"}
      className="size-full rounded object-cover"
      height={20}
      src={url}
      width={20}
    />
  );
}

// ============================================================================
// Contexts
// ============================================================================

interface AttachmentsContextValue {
  variant: AttachmentVariant;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);

interface AttachmentContextValue {
  data: AttachmentData;
  mediaCategory: AttachmentMediaCategory;
  onRemove?: () => void;
  variant: AttachmentVariant;
}

const AttachmentContext = createContext<AttachmentContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

export function useAttachmentsContext() {
  return use(AttachmentsContext) ?? { variant: "grid" as const };
}

export function useAttachmentContext() {
  const ctx = use(AttachmentContext);
  if (!ctx) {
    throw new Error("Attachment components must be used within <Attachment>");
  }
  return ctx;
}

// ============================================================================
// Attachments - Container
// ============================================================================

export type AttachmentsProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AttachmentVariant;
};

export function Attachments({ variant = "grid", className, children, ...props }: AttachmentsProps) {
  const contextValue = useMemo(() => ({ variant }), [variant]);

  return (
    <AttachmentsContext value={contextValue}>
      <div
        className={cn(
          "flex items-start",
          variant === "list" ? "flex-col gap-2" : "flex-wrap gap-2",
          variant === "grid" && "ml-auto w-fit",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentsContext>
  );
}

// ============================================================================
// Attachment - Item
// ============================================================================

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: () => void;
};

export function Attachment({ data, onRemove, className, children, ...props }: AttachmentProps) {
  const { variant } = useAttachmentsContext();
  const mediaCategory = getMediaCategory(data);

  const contextValue = useMemo<AttachmentContextValue>(
    () => ({ data, mediaCategory, onRemove, variant }),
    [data, mediaCategory, onRemove, variant],
  );

  return (
    <AttachmentContext value={contextValue}>
      <div
        className={cn(
          "group relative",
          variant === "grid" && "size-24 overflow-hidden rounded-lg",
          variant === "inline" && [
            "flex h-8 cursor-pointer select-none items-center gap-1.5",
            "rounded-md border border-border px-1.5",
            "font-medium text-sm transition-all",
            "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          ],
          variant === "list" && [
            "flex w-full items-center gap-3 rounded-lg border p-3",
            "hover:bg-accent/50",
          ],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentContext>
  );
}

// ============================================================================
// AttachmentPreview - Media preview
// ============================================================================

export type AttachmentPreviewProps = HTMLAttributes<HTMLDivElement> & {
  fallbackIcon?: ReactNode;
};

export function AttachmentPreview({ fallbackIcon, className, ...props }: AttachmentPreviewProps) {
  const { data, mediaCategory, variant } = useAttachmentContext();
  const isPdf = !fallbackIcon && isPdfAttachment(data);

  const iconSize = variant === "inline" ? "size-3" : "size-4";

  const renderIcon = (Icon: typeof IconPhoto) => (
    <Icon className={cn(iconSize, "text-muted-foreground")} />
  );

  const renderContent = () => {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
      return renderAttachmentImage(data.url, data.filename, variant === "grid");
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
      return (
        <video
          aria-label={data.filename ?? "视频附件"}
          className="size-full object-cover"
          muted
          src={data.url}
        />
      );
    }

    if (isPdf) {
      return <PdfFileIcon className={resolvePdfIconClassName(variant)} />;
    }

    const Icon = mediaCategoryIcons[mediaCategory];
    return fallbackIcon ?? renderIcon(Icon);
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden",
        variant === "grid" && "size-full bg-muted",
        variant === "inline" && "size-5 rounded",
        variant === "inline" && !isPdf && "bg-background",
        variant === "list" && "size-12 rounded",
        variant === "list" && !isPdf && "bg-muted",
        className,
      )}
      {...props}
    >
      {renderContent()}
    </div>
  );
}

// ============================================================================
// AttachmentInfo - Name and type display
// ============================================================================

export type AttachmentInfoProps = HTMLAttributes<HTMLDivElement> & {
  showMediaType?: boolean;
};

export function AttachmentInfo({
  showMediaType = false,
  className,
  ...props
}: AttachmentInfoProps) {
  const { data, variant } = useAttachmentContext();
  const label = getAttachmentLabel(data);

  if (variant === "grid") {
    return null;
  }

  return (
    <div className={cn("min-w-0 flex-1", className)} {...props}>
      <span className="block truncate">{label}</span>
      {showMediaType && data.mediaType && (
        <span className="block truncate text-muted-foreground text-xs">{data.mediaType}</span>
      )}
    </div>
  );
}

// ============================================================================
// AttachmentRemove - Remove button
// ============================================================================

export type AttachmentRemoveProps = ComponentProps<typeof Button> & {
  label?: string;
};

export function AttachmentRemove({
  label = "Remove",
  className,
  children,
  ...props
}: AttachmentRemoveProps) {
  const { onRemove, variant } = useAttachmentContext();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  if (!onRemove) {
    return null;
  }

  return (
    <Button
      aria-label={label}
      className={cn(
        variant === "grid" && [
          "absolute top-2 right-2 size-6 rounded-full p-0",
          "bg-background/80 backdrop-blur-sm",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "hover:bg-background",
          "[&>svg]:size-3",
        ],
        variant === "inline" && [
          "size-5 rounded p-0",
          "opacity-0 transition-opacity group-hover:opacity-100",
          "[&>svg]:size-2.5",
        ],
        variant === "list" && ["size-8 shrink-0 rounded p-0", "[&>svg]:size-4"],
        className,
      )}
      onClick={handleClick}
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <IconX />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

// ============================================================================
// AttachmentHoverCard - Hover preview
// ============================================================================

export type AttachmentHoverCardProps = ComponentProps<typeof HoverCard>;

export function AttachmentHoverCard({
  openDelay = 0,
  closeDelay = 0,
  ...props
}: AttachmentHoverCardProps) {
  return <HoverCard closeDelay={closeDelay} openDelay={openDelay} {...props} />;
}

export type AttachmentHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export function AttachmentHoverCardTrigger(props: AttachmentHoverCardTriggerProps) {
  return <HoverCardTrigger {...props} />;
}

export type AttachmentHoverCardContentProps = ComponentProps<typeof HoverCardContent>;

export function AttachmentHoverCardContent({
  align = "start",
  className,
  ...props
}: AttachmentHoverCardContentProps) {
  return <HoverCardContent align={align} className={cn("w-auto p-2", className)} {...props} />;
}

// ============================================================================
// AttachmentEmpty - Empty state
// ============================================================================

export type AttachmentEmptyProps = HTMLAttributes<HTMLDivElement>;

export function AttachmentEmpty({ className, children, ...props }: AttachmentEmptyProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center p-4 text-muted-foreground text-sm",
        className,
      )}
      {...props}
    >
      {children ?? "No attachments"}
    </div>
  );
}
