"use client";

import type { FileUIPart, SourceUrlUIPart, UIMessage } from "ai";
import { CheckIcon, CopyIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { AssistantMessageGroups } from "@/components/assistant-message-groups";
import { PdfPreviewButton } from "@/components/pdf-preview-button";
import { ResumeImportButton } from "@/components/resume-import-button";
import { ThinkingBlock } from "@/components/thinking-block";
import { TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { ApplyJobDescriptionCard } from "@/components/tool-call/apply-job-description-card";
import { ToolCall } from "@/components/tool-call/tool-call";
import {
  getMessageTimeValue,
  isFilePart,
  isSourceUrlPart,
  isTextPart,
  isToolPart,
} from "../_lib/chat-message-utils";

const ASSISTANT_AUTHOR_LABEL = "简历筛选助手";

interface ChatMessageItemProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  startedAt: string | null;
  userName: string;
  resumeImports: Record<string, string>;
  onResumeImported: (partId: string, interviewId: string) => void;
  onResumeImportMissing: (partId: string) => void;
  onApplyJDConfirm: (toolCallId: string, jobDescriptionId: string) => Promise<void>;
  onApplyJDIgnore: (toolCallId: string) => Promise<void>;
  onRegenerate: (messageId: string) => void;
}

/**
 * Renders one message and its parts. Kept as its own component so React
 * Compiler memoizes the JSX per-message — older messages skip re-render
 * when only the streaming tail changes (their object refs stay stable).
 */
// eslint-disable-next-line complexity -- mirrors the inline rendering in the previous monolithic component; splitting further would obscure the message → parts mapping.
export function ChatMessageItem({
  message,
  isLastMessage,
  isStreaming,
  startedAt,
  userName,
  resumeImports,
  onResumeImported,
  onResumeImportMissing,
  onApplyJDConfirm,
  onApplyJDIgnore,
  onRegenerate,
}: ChatMessageItemProps) {
  const [hasCopied, setHasCopied] = useState(false);

  const isMessageStreaming = isLastMessage && isStreaming;
  const isChatRole = message.role === "user" || message.role === "assistant";
  const messageAuthor = message.role === "assistant" ? ASSISTANT_AUTHOR_LABEL : userName;
  const messageTime = getMessageTimeValue(message);

  const fileParts: (FileUIPart & { id: string })[] = [];
  const sourceParts: SourceUrlUIPart[] = [];
  let assistantText = "";

  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];
    if (!part) {
      continue;
    }
    if (isTextPart(part)) {
      assistantText = assistantText ? `${assistantText}\n\n${part.text}` : part.text;
    } else if (isFilePart(part)) {
      fileParts.push({ ...part, id: `${message.id}-file-${index}` });
    } else if (isSourceUrlPart(part)) {
      sourceParts.push(part);
    }
  }
  assistantText = assistantText.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(assistantText);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 1200);
    } catch {
      setHasCopied(false);
    }
  };

  return (
    <div>
      {isChatRole ? (
        <p
          className={`mb-2.5 text-muted-foreground text-xs ${message.role === "user" ? "text-right" : "text-left"}`}
        >
          {messageAuthor}
          {messageTime ? (
            <>
              {" · "}
              <TimeDisplay as="span" options={TIME_DISPLAY_OPTIONS} value={messageTime} />
            </>
          ) : null}
        </p>
      ) : null}

      {message.role === "assistant" && sourceParts.length > 0 ? (
        <Sources className="mb-2">
          <SourcesTrigger count={sourceParts.length} />
          <SourcesContent>
            {sourceParts.map((part, index) => {
              const title =
                "title" in part && typeof part.title === "string" ? part.title : part.url;
              return <Source href={part.url} key={`${message.id}-source-${index}`} title={title} />;
            })}
          </SourcesContent>
        </Sources>
      ) : null}

      <Message from={message.role}>
        <MessageContent>
          {fileParts.length > 0 ? (
            <Attachments className="mb-2 min-w-65" variant="list">
              {fileParts.map((part) => {
                const isPdf =
                  part.mediaType === "application/pdf" ||
                  part.filename?.toLowerCase().endsWith(".pdf");
                const showImportButton = message.role === "user" && isPdf;
                const importedId = resumeImports[part.id] ?? null;
                return (
                  <Attachment data={part} key={part.id}>
                    <AttachmentPreview />
                    <AttachmentInfo showMediaType />
                    {isPdf && part.url ? (
                      <PdfPreviewButton filename={part.filename} url={part.url} />
                    ) : null}
                    {showImportButton ? (
                      <ResumeImportButton
                        filePart={part}
                        importedInterviewId={importedId}
                        onImported={onResumeImported}
                        onMissing={onResumeImportMissing}
                      />
                    ) : null}
                  </Attachment>
                );
              })}
            </Attachments>
          ) : null}

          {message.role === "assistant" ? (
            <AssistantMessageGroups
              durationMs={null}
              isStreaming={isMessageStreaming}
              message={message}
              startedAt={startedAt}
            >
              {(isExpanded) => (
                <>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse
                          isStreaming={isMessageStreaming}
                          key={`${message.id}-${index}`}
                        >
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    if (isToolPart(part)) {
                      const toolName =
                        part.type === "dynamic-tool"
                          ? part.toolName
                          : part.type.replace(/^tool-/, "");
                      if (toolName === "apply_job_description") {
                        return (
                          <ApplyJobDescriptionCard
                            key={`${message.id}-${part.type}-${index}`}
                            onConfirm={onApplyJDConfirm}
                            onIgnore={onApplyJDIgnore}
                            part={part}
                          />
                        );
                      }
                      if (isExpanded) {
                        return (
                          <ToolCall
                            isStreaming={isMessageStreaming}
                            key={`${message.id}-${part.type}-${index}`}
                            part={part}
                          />
                        );
                      }
                      return null;
                    }
                    if (part.type === "reasoning" && isExpanded) {
                      const isReasoningStreaming =
                        isMessageStreaming &&
                        message.parts.at(-1)?.type === "reasoning" &&
                        index === message.parts.length - 1;
                      return (
                        <ThinkingBlock
                          isStreaming={isReasoningStreaming}
                          key={`${message.id}-reasoning-${index}`}
                          text={part.text}
                        />
                      );
                    }
                    if (part.type === "step-start" && isExpanded) {
                      return (
                        <div
                          className="border-border border-t opacity-50"
                          key={`${message.id}-step-${index}`}
                        />
                      );
                    }
                    return null;
                  })}
                </>
              )}
            </AssistantMessageGroups>
          ) : (
            message.parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                );
              }
              return null;
            })
          )}
        </MessageContent>
      </Message>

      {message.role === "assistant" && isLastMessage && assistantText ? (
        <MessageActions className="mt-2">
          <MessageAction
            disabled={isStreaming}
            label="重新生成"
            onClick={() => onRegenerate(message.id)}
            tooltip="重新生成"
          >
            <RefreshCcwIcon className="size-3" />
          </MessageAction>
          <MessageAction label="复制内容" onClick={handleCopy} tooltip="复制">
            {hasCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          </MessageAction>
        </MessageActions>
      ) : null}
    </div>
  );
}
