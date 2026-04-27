"use client";

import type { ChatStatus } from "ai";
import { useAtom, useAtomValue } from "jotai";
import { FileTextIcon, ImageIcon, SettingsIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConversationDownload } from "@/components/ai-elements/conversation";
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import type { ManagedAttachment } from "@/components/ai-elements/prompt-input";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";
import { thinkingModeAtom } from "../../_atoms/thinking";
import { tutorialStepAtom } from "../../_atoms/tutorial";
import { toDownloadMessage } from "../../_lib/chat-message-utils";
import { useChatActionsContext, useChatMessagesContext } from "../chat-runtime-context";
import { useComposerInputContext } from "../composer-input-context";

const noop = () => {
  // intentionally empty — used to force controlled-open menus
};

const focusTextareaOnMenuClose = (event: Event) => {
  event.preventDefault();
  document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
};

function getComposerStatusLabel(
  status: ChatStatus,
  hasJobDescription: boolean,
  jobDescriptionLabel: string | null,
) {
  if (status === "streaming") {
    return "正在分析简历内容…";
  }
  if (!hasJobDescription) {
    return "未配置在招岗位信息（可在岗位设置中配置）";
  }
  return jobDescriptionLabel ? `在招岗位：${jobDescriptionLabel}` : "已配置在招岗位信息";
}

function ThinkingModeMenuItem() {
  const [enabled, setEnabled] = useAtom(thinkingModeAtom);
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const isHydrated = useHydrated();
  // Hydration-safe: SSR sees `false`, the persisted atom value applies after
  // hydration. Tutorial step 5 force-checks the switch for the demo.
  const displayChecked = isHydrated ? enabled || tutorialStep === 5 : false;

  return (
    <PromptInputActionMenuItem
      data-tour="thinking-toggle"
      onSelect={(event) => {
        // Toggle on click but keep the menu open so the user can see the new
        // state without re-opening.
        event.preventDefault();
        setEnabled(!enabled);
      }}
    >
      <SparklesIcon className="mr-2 size-4" />
      深度思考
      <Switch
        // Purely presentational — the parent menu item owns the click.
        // pointer-events-none so the switch never intercepts focus / clicks.
        checked={displayChecked}
        className="pointer-events-none ml-auto scale-75"
        size="default"
        tabIndex={-1}
      />
    </PromptInputActionMenuItem>
  );
}

/**
 * Reads `messages` and materializes the markdown payload only when the user
 * actually clicks. Isolated so the rest of the footer doesn't subscribe to
 * the high-frequency MessagesContext.
 */
function ConversationDownloadButton() {
  const { messages } = useChatMessagesContext();
  const downloadable = messages.map(toDownloadMessage);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ConversationDownload
          aria-label="导出聊天记录"
          className="static rounded-md border-0 bg-transparent shadow-none hover:bg-accent"
          disabled={downloadable.length === 0}
          messages={downloadable}
          size="icon-sm"
          variant="ghost"
        />
      </TooltipTrigger>
      <TooltipContent side="top">导出聊天记录</TooltipContent>
    </Tooltip>
  );
}

interface ComposerFooterProps {
  hasJobDescription: boolean;
  jobDescriptionLabel: string | null;
  onClearJobDescription: () => void;
  onOpenJobDescriptionSettings: () => void;
}

export function ComposerFooter({
  hasJobDescription,
  jobDescriptionLabel,
  onClearJobDescription,
  onOpenJobDescriptionSettings,
}: ComposerFooterProps) {
  const attachments = usePromptInputAttachments();
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const { input } = useComposerInputContext();
  const { effectiveStatus, stop } = useChatActionsContext();

  const hasPendingUploads = attachments.files.some(
    (f) => (f as Partial<ManagedAttachment>).uploadStatus === "uploading",
  );
  const canSubmit = (input.trim().length > 0 || attachments.files.length > 0) && !hasPendingUploads;
  const displayHasJD = hasJobDescription || tutorialStep === 4;
  const forceUploadMenuOpen = tutorialStep === 3;
  // Step 4 = JD config; step 5 = thinking-mode toggle (now nested in this menu).
  const forceJDMenuOpen = tutorialStep === 4 || tutorialStep === 5;
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);

  // After the file picker closes with one or more files selected, close the
  // upload menu and return focus to the textarea so the user can keep typing.
  const prevFilesCountRef = useRef(attachments.files.length);
  useEffect(() => {
    const current = attachments.files.length;
    if (current > prevFilesCountRef.current) {
      setUploadMenuOpen(false);
      document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
    }
    prevFilesCountRef.current = current;
  }, [attachments.files.length]);

  return (
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputActionMenu
          {...(forceUploadMenuOpen
            ? { onOpenChange: noop, open: true }
            : { onOpenChange: setUploadMenuOpen, open: uploadMenuOpen })}
        >
          <PromptInputActionMenuTrigger
            data-tour="file-upload"
            id="prompt-actions-menu-trigger"
            tooltip="更多输入操作"
          />
          <PromptInputActionMenuContent
            onCloseAutoFocus={focusTextareaOnMenuClose}
            {...(forceUploadMenuOpen && { className: "tutorial-forced-menu" })}
          >
            <PromptInputActionMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setUploadMenuOpen(false);
                attachments.openFileDialog();
              }}
            >
              <ImageIcon className="mr-2 size-4" />
              上传 PDF 简历
            </PromptInputActionMenuItem>
            <PromptInputActionMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setUploadMenuOpen(false);
                attachments.clear();
              }}
            >
              <Trash2Icon className="mr-2 size-4" />
              清空附件
            </PromptInputActionMenuItem>
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>

        <PromptInputActionMenu {...(forceJDMenuOpen && { onOpenChange: noop, open: true })}>
          <PromptInputActionMenuTrigger
            data-tour="jd-settings"
            id="prompt-job-settings-menu-trigger"
            tooltip="岗位设置"
          >
            <SettingsIcon className="size-4" />
          </PromptInputActionMenuTrigger>
          <PromptInputActionMenuContent
            onCloseAutoFocus={focusTextareaOnMenuClose}
            {...(forceJDMenuOpen && { className: "tutorial-forced-menu" })}
          >
            <PromptInputActionMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onOpenJobDescriptionSettings();
              }}
            >
              <FileTextIcon className="mr-2 size-4" />
              设置在招岗位信息
            </PromptInputActionMenuItem>
            <PromptInputActionMenuItem
              disabled={!hasJobDescription}
              onSelect={(event) => {
                event.preventDefault();
                onClearJobDescription();
              }}
            >
              <Trash2Icon className="mr-2 size-4" />
              清空在招岗位信息
            </PromptInputActionMenuItem>
            <DropdownMenuSeparator />
            <ThinkingModeMenuItem />
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>

        <ConversationDownloadButton />
      </PromptInputTools>

      <div className="flex items-center gap-2">
        <span className="pointer-events-none hidden select-none text-muted-foreground text-xs sm:inline">
          {getComposerStatusLabel(effectiveStatus, displayHasJD, jobDescriptionLabel)}
        </span>
        <PromptInputSubmit
          data-tour="send-button"
          disabled={effectiveStatus === "ready" ? !canSubmit : false}
          onStop={stop}
          status={effectiveStatus}
          variant="outline"
        />
      </div>
    </PromptInputFooter>
  );
}
