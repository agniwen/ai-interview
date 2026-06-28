"use client";

import { IconCheck, IconCopy, IconRefresh } from "@tabler/icons-react";
import type { FileUIPart, SourceUrlUIPart, UIMessage } from "ai";

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
import { AssistantMessageGroups } from "@/components/features/chat/assistant-message-groups";
import { ParsedResumeButton } from "@/components/features/resume/parsed-resume-button";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
import { ResumeImportButton } from "@/components/features/resume-import/resume-import-button";
import { attachmentTextSourceValues } from "@arc/db-schema/db-enums";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import {
  getResumeDocumentKind,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";
import { ThinkingBlock } from "@/components/features/chat/thinking-block";
import { TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { ApplyJobDescriptionCard } from "@/components/features/chat/tool-call/apply-job-description-card";
import { ToolCall } from "@/components/features/chat/tool-call/tool-call";
import {
  getChatAttachmentIdFromUrl,
  getMessageTimeValue,
  isFilePart,
  isSourceUrlPart,
  isTextPart,
  isToolPart,
} from "./lib/chat-message-utils";

const ASSISTANT_AUTHOR_LABEL = "简历筛选助手";

interface ChatMessageItemProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  startedAt: string | null;
  userName: string;
  resumeImports: Record<string, string>;
  /**
   * 透传给 ResumeImportButton：用作一键入库弹窗的 JD 下拉默认值。
   * Forwarded to ResumeImportButton — preselects the import dialog's JD dropdown.
   */
  activeJobDescriptionId: string | null;
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
  activeJobDescriptionId,
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
  const parsedByAttachmentId = new Map<
    string,
    {
      filename: string;
      // OCR-only 上传后 structured 可能为 null —— UI 在该形态下仅展示原文 tab。
      // After OCR-only upload, structured may be null — the UI degrades to the
      // raw-text tab only in that case.
      parsedStructured: ResumeParserStructured | null;
      parsedText: string | null;
      parsedPageCount: number | null;
      parsedTextSource: AttachmentTextSource;
    }
  >();
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
    } else if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "data-resume-parsed"
    ) {
      const { data } = part as { data: Record<string, unknown> };
      // 只要拿到 attachmentId 就尝试收下：structured 可能为 null（chat 切到
      // OCR-only 之后的常态），但 parsedText 通常在；只要至少有一种内容，UI
      // 都能让用户看（"结构化"按钮内部会按存在性禁用对应 tab）。
      // Accept entries as long as attachmentId is present. structured may be
      // null (the post-OCR-only norm); the button itself disables the unmet
      // tabs based on what data is available.
      if (data && typeof data.attachmentId === "string") {
        const structured =
          data.parsedStructured && typeof data.parsedStructured === "object"
            ? (data.parsedStructured as ResumeParserStructured)
            : null;
        const text = typeof data.parsedText === "string" ? data.parsedText : null;
        if (!(structured || text)) {
          continue;
        }
        const parsedTextSource = attachmentTextSourceValues.includes(
          data.parsedTextSource as AttachmentTextSource,
        )
          ? (data.parsedTextSource as AttachmentTextSource)
          : "qwen-ocr";
        parsedByAttachmentId.set(data.attachmentId, {
          filename: typeof data.filename === "string" ? data.filename : "resume.pdf",
          parsedPageCount: typeof data.parsedPageCount === "number" ? data.parsedPageCount : null,
          parsedStructured: structured,
          parsedText: text,
          parsedTextSource,
        });
      }
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
                const documentKind = getResumeDocumentKind({
                  fileName: part.filename,
                  mediaType: part.mediaType,
                });
                const isResumeDocument = isSupportedResumeDocumentInput({
                  fileName: part.filename,
                  mediaType: part.mediaType,
                });
                const showImportButton = message.role === "user" && isResumeDocument;
                const importedId = resumeImports[part.id] ?? null;
                const attachmentId = getChatAttachmentIdFromUrl(part.url);
                const parsed = attachmentId ? parsedByAttachmentId.get(attachmentId) : null;

                if (isResumeDocument) {
                  return (
                    <div
                      className="flex w-full flex-col gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30"
                      key={part.id}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded">
                          <ResumeDocumentFileIcon className="size-9" kind={documentKind ?? "pdf"} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {part.filename || `resume.${documentKind ?? "pdf"}`}
                          </p>
                          <p className="truncate text-muted-foreground text-xs">{part.mediaType}</p>
                        </div>
                      </div>
                      <div className="flex items-stretch gap-2 border-t pt-3">
                        {part.url ? (
                          <ResumeDocumentPreviewButton
                            className="flex-1 basis-0"
                            filename={part.filename}
                            mediaType={part.mediaType}
                            url={part.url}
                          />
                        ) : null}
                        {parsed ? (
                          <ParsedResumeButton
                            className="flex-1 basis-0"
                            filename={parsed.filename || part.filename || "resume.pdf"}
                            pageCount={parsed.parsedPageCount}
                            parsedText={parsed.parsedText}
                            structured={parsed.parsedStructured}
                            textSource={parsed.parsedTextSource}
                          />
                        ) : null}
                        {showImportButton ? (
                          <ResumeImportButton
                            activeJobDescriptionId={activeJobDescriptionId}
                            attachmentId={attachmentId}
                            className="flex-1 basis-0"
                            filePart={part}
                            importedInterviewId={importedId}
                            onImported={onResumeImported}
                            onMissing={onResumeImportMissing}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                }

                return (
                  <Attachment data={part} key={part.id}>
                    <AttachmentPreview />
                    <AttachmentInfo showMediaType />
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
            <IconRefresh className="size-3" />
          </MessageAction>
          <MessageAction label="复制内容" onClick={handleCopy} tooltip="复制">
            {hasCopied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
          </MessageAction>
        </MessageActions>
      ) : null}
    </div>
  );
}
