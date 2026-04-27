"use client";

import { useAtomValue } from "jotai";
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
import { tutorialStepAtom } from "../../_atoms/tutorial";
import { TUTORIAL_MOCK_ATTACHMENTS } from "../../constants/tutorial-mock";

export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const showMock = tutorialStep !== null && tutorialStep >= 3 && attachments.files.length === 0;
  const files = showMock ? TUTORIAL_MOCK_ATTACHMENTS : attachments.files;

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
            onRemove={showMock ? undefined : () => attachments.remove(file.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            {isUploading ? (
              <Spinner aria-label="上传中" className="size-3 text-muted-foreground" />
            ) : null}
            {isError ? (
              <AlertCircleIcon aria-label="上传失败" className="size-3 text-destructive" />
            ) : null}
            {!showMock && <AttachmentRemove />}
          </Attachment>
        );
      })}
    </Attachments>
  );
}
