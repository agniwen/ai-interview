"use client";

import type { FileUIPart, SourceDocumentUIPart } from "ai";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { createContext, use, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

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

const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof ImageIcon> = {
  audio: Music2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  source: GlobeIcon,
  unknown: PaperclipIcon,
  video: VideoIcon,
};

export function PdfFileIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Icon from VSCode Icons by Roberto Huertas — https://github.com/vscode-icons/vscode-icons/blob/master/LICENSE */}
      <path d="m24.1 2.072l5.564 5.8v22.056H8.879V30h20.856V7.945z" fill="#909090" />
      <path d="M24.031 2H8.808v27.928h20.856V7.873z" fill="#f4f4f4" />
      <path d="M8.655 3.5h-6.39v6.827h20.1V3.5z" fill="#7a7b7c" />
      <path d="M22.472 10.211H2.395V3.379h20.077z" fill="#dd2025" />
      <path
        d="M9.052 4.534H7.745v4.8h1.028V7.715L9 7.728a2 2 0 0 0 .647-.117a1.4 1.4 0 0 0 .493-.291a1.2 1.2 0 0 0 .335-.454a2.1 2.1 0 0 0 .105-.908a2.2 2.2 0 0 0-.114-.644a1.17 1.17 0 0 0-.687-.65a2 2 0 0 0-.409-.104a2 2 0 0 0-.319-.026m-.189 2.294h-.089v-1.48h.193a.57.57 0 0 1 .459.181a.92.92 0 0 1 .183.558c0 .246 0 .469-.222.626a.94.94 0 0 1-.524.114m3.671-2.306c-.111 0-.219.008-.295.011L12 4.538h-.78v4.8h.918a2.7 2.7 0 0 0 1.028-.175a1.7 1.7 0 0 0 .68-.491a1.9 1.9 0 0 0 .373-.749a3.7 3.7 0 0 0 .114-.949a4.4 4.4 0 0 0-.087-1.127a1.8 1.8 0 0 0-.4-.733a1.6 1.6 0 0 0-.535-.4a2.4 2.4 0 0 0-.549-.178a1.3 1.3 0 0 0-.228-.017m-.182 3.937h-.1V5.392h.013a1.06 1.06 0 0 1 .6.107a1.2 1.2 0 0 1 .324.4a1.3 1.3 0 0 1 .142.526c.009.22 0 .4 0 .549a3 3 0 0 1-.033.513a1.8 1.8 0 0 1-.169.5a1.1 1.1 0 0 1-.363.36a.67.67 0 0 1-.416.106m5.08-3.915H15v4.8h1.028V7.434h1.3v-.892h-1.3V5.43h1.4v-.892"
        fill="#464648"
      />
      <path
        d="M21.781 20.255s3.188-.578 3.188.511s-1.975.646-3.188-.511m-2.357.083a7.5 7.5 0 0 0-1.473.489l.4-.9c.4-.9.815-2.127.815-2.127a14 14 0 0 0 1.658 2.252a13 13 0 0 0-1.4.288Zm-1.262-6.5c0-.949.307-1.208.546-1.208s.508.115.517.939a10.8 10.8 0 0 1-.517 2.434a4.4 4.4 0 0 1-.547-2.162Zm-4.649 10.516c-.978-.585 2.051-2.386 2.6-2.444c-.003.001-1.576 3.056-2.6 2.444M25.9 20.895c-.01-.1-.1-1.207-2.07-1.16a14 14 0 0 0-2.453.173a12.5 12.5 0 0 1-2.012-2.655a11.8 11.8 0 0 0 .623-3.1c-.029-1.2-.316-1.888-1.236-1.878s-1.054.815-.933 2.013a9.3 9.3 0 0 0 .665 2.338s-.425 1.323-.987 2.639s-.946 2.006-.946 2.006a9.6 9.6 0 0 0-2.725 1.4c-.824.767-1.159 1.356-.725 1.945c.374.508 1.683.623 2.853-.91a23 23 0 0 0 1.7-2.492s1.784-.489 2.339-.623s1.226-.24 1.226-.24s1.629 1.639 3.2 1.581s1.495-.939 1.485-1.035"
        fill="#dd2025"
      />
      <path d="M23.954 2.077V7.95h5.633z" fill="#909090" />
      <path d="M24.031 2v5.873h5.633z" fill="#f4f4f4" />
      <path
        d="M8.975 4.457H7.668v4.8H8.7V7.639l.228.013a2 2 0 0 0 .647-.117a1.4 1.4 0 0 0 .493-.291a1.2 1.2 0 0 0 .332-.454a2.1 2.1 0 0 0 .105-.908a2.2 2.2 0 0 0-.114-.644a1.17 1.17 0 0 0-.687-.65a2 2 0 0 0-.411-.105a2 2 0 0 0-.319-.026m-.189 2.294h-.089v-1.48h.194a.57.57 0 0 1 .459.181a.92.92 0 0 1 .183.558c0 .246 0 .469-.222.626a.94.94 0 0 1-.524.114m3.67-2.306c-.111 0-.219.008-.295.011l-.235.006h-.78v4.8h.918a2.7 2.7 0 0 0 1.028-.175a1.7 1.7 0 0 0 .68-.491a1.9 1.9 0 0 0 .373-.749a3.7 3.7 0 0 0 .114-.949a4.4 4.4 0 0 0-.087-1.127a1.8 1.8 0 0 0-.4-.733a1.6 1.6 0 0 0-.535-.4a2.4 2.4 0 0 0-.549-.178a1.3 1.3 0 0 0-.228-.017m-.182 3.937h-.1V5.315h.013a1.06 1.06 0 0 1 .6.107a1.2 1.2 0 0 1 .324.4a1.3 1.3 0 0 1 .142.526c.009.22 0 .4 0 .549a3 3 0 0 1-.033.513a1.8 1.8 0 0 1-.169.5a1.1 1.1 0 0 1-.363.36a.67.67 0 0 1-.416.106m5.077-3.915h-2.43v4.8h1.028V7.357h1.3v-.892h-1.3V5.353h1.4v-.892"
        fill="#fff"
      />
    </svg>
  );
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

  const renderIcon = (Icon: typeof ImageIcon) => (
    <Icon className={cn(iconSize, "text-muted-foreground")} />
  );

  const renderContent = () => {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
      return renderAttachmentImage(data.url, data.filename, variant === "grid");
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
      return <video className="size-full object-cover" muted src={data.url} />;
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
      {children ?? <XIcon />}
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
