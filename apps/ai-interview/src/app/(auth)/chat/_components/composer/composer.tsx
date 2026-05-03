"use client";

import { UploadIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  PromptInput,
  PromptInputBody,
  PromptInputHeader,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { useChatActionsContext, useChatStreamingContext } from "../chat-runtime-context";
import { useComposerInputContext } from "../composer-input-context";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerFooter } from "./composer-footer";
import { DarkModeBeam } from "./dark-mode-beam";

const DEFAULT_PROMPT_FOR_PDF_ONLY = "请结合岗位要求分析这份简历并给出筛选建议。";

interface ComposerProps {
  hasJobDescription: boolean;
  jobDescriptionLabel: string | null;
  uploadErrorMessage: string | null;
  onUploadErrorChange: (message: string | null) => void;
  onClearJobDescription: () => void;
  onOpenJobDescriptionSettings: () => void;
}

/**
 * Resets the shell's `uploadErrorMessage` whenever the user adds a file,
 * so a previous error doesn't linger after a successful retry.
 */
function UploadErrorReset({ onReset }: { onReset: () => void }) {
  const attachments = usePromptInputAttachments();
  useEffect(() => {
    if (attachments.files.length > 0) {
      onReset();
    }
  }, [attachments.files.length, onReset]);
  return null;
}

export function Composer({
  hasJobDescription,
  jobDescriptionLabel,
  uploadErrorMessage: _uploadErrorMessage,
  onUploadErrorChange,
  onClearJobDescription,
  onOpenJobDescriptionSettings,
}: ComposerProps) {
  const { input, setInput, resetInput } = useComposerInputContext();
  const { sendMessage } = useChatActionsContext();
  const { isStreaming } = useChatStreamingContext();

  return (
    <div className="mx-auto w-full max-w-5xl px-3">
      <DarkModeBeam active={isStreaming} className="w-full">
        <PromptInput
          accept="application/pdf"
          className="**:data-[slot=input-group]:cursor-text **:data-[slot=input-group]:rounded-[1.3rem] **:data-[slot=input-group]:border-border/65 **:data-[slot=input-group]:bg-white **:data-[slot=input-group]:shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]"
          dragOverlay={
            <div className="flex h-full w-full items-center justify-center rounded-[1.15rem] border-2 border-dashed border-primary/60 bg-background px-6 py-8 text-center transition-colors">
              <div className="flex flex-col items-center gap-2">
                <UploadIcon className="size-8 text-primary/50" />
                <p className="font-medium text-sm">拖拽 PDF 简历到这里</p>
                <p className="text-muted-foreground text-xs">
                  支持多个文件，系统只会加入 PDF 格式的文件
                </p>
              </div>
            </div>
          }
          dragOverlayClassName="bg-background rounded-[1.3rem]"
          globalDrop
          maxFileSize={10 * 1024 * 1024}
          maxFiles={8}
          multiple
          onError={({ code, message }) => {
            if (code === "accept") {
              onUploadErrorChange("仅支持上传 PDF 文件。");
              return;
            }
            if (code === "max_file_size") {
              onUploadErrorChange("单个 PDF 文件不能超过 10 MB。");
              return;
            }
            if (code === "max_files") {
              onUploadErrorChange("最多上传 8 个 PDF 文件。");
              return;
            }
            onUploadErrorChange(message);
          }}
          onGlobalDropOutside={() => {
            toast.warning("请将简历拖拽到上传区域后再松开。");
          }}
          onMouseDown={(event) => {
            const target = event.target as HTMLElement;
            // Clicks on interactive descendants manage their own focus.
            if (
              target.closest(
                'button, a, input, textarea, [role="menuitem"], [role="dialog"], [data-slot="select"]',
              )
            ) {
              return;
            }
            // Keep focus on the textarea when clicking blank areas so the
            // `:focus-visible` shadow variant doesn't flicker on blur/refocus.
            event.preventDefault();
            const textarea = event.currentTarget.querySelector("textarea");
            if (textarea && document.activeElement !== textarea) {
              textarea.focus();
            }
          }}
          onSubmit={({ files, text }) => {
            const trimmed = text.trim();
            const hasText = trimmed.length > 0;
            const hasFiles = files.length > 0;
            if (!hasText && !hasFiles) {
              return;
            }
            onUploadErrorChange(null);
            void sendMessage({
              files,
              text: hasText ? trimmed : DEFAULT_PROMPT_FOR_PDF_ONLY,
            });
            resetInput();
          }}
        >
          <UploadErrorReset onReset={() => onUploadErrorChange(null)} />

          <PromptInputHeader>
            <ComposerAttachments />
          </PromptInputHeader>

          <PromptInputBody>
            <PromptInputTextarea
              autoComplete="off"
              className="min-h-20"
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder="输入岗位与筛选要求，或上传候选人 PDF 简历（支持多文件）…"
              value={input}
            />
          </PromptInputBody>

          <ComposerFooter
            hasJobDescription={hasJobDescription}
            jobDescriptionLabel={jobDescriptionLabel}
            onClearJobDescription={onClearJobDescription}
            onOpenJobDescriptionSettings={onOpenJobDescriptionSettings}
          />
        </PromptInput>
      </DarkModeBeam>
    </div>
  );
}
