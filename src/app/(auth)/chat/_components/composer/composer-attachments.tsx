"use client";

import { AlertCircleIcon } from "lucide-react";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import type { ManagedAttachment } from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  const { files } = attachments;

  if (files.length === 0) {
    return null;
  }

  return (
    <Attachments className="w-full" variant="inline">
      {files.map((file) => {
        const uploadStatus = (file as Partial<ManagedAttachment>).uploadStatus ?? "uploaded";
        const isUploading = uploadStatus === "uploading";
        const isError = uploadStatus === "error";
        return (
          <Attachment
            className={cn(isUploading && "opacity-70", isError && "border-destructive")}
            data={file}
            key={file.id}
            onRemove={() => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            {isUploading ? (
              <Spinner aria-label="上传中" className="size-3 text-muted-foreground" />
            ) : null}
            {isError ? (
              <AlertCircleIcon aria-label="上传失败" className="size-3 text-destructive" />
            ) : null}
            <AttachmentRemove />
          </Attachment>
        );
      })}
    </Attachments>
  );
}
