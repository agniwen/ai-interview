"use client";

import type { ChatStatus, DynamicToolUIPart, FileUIPart, ToolUIPart, UIMessage } from "ai";
import type { ConversationMessage } from "@/components/ai-elements/conversation";
import type { JobDescriptionConfig } from "@/lib/job-description-config";
import { deriveJobDescriptionText, getJobDescriptionLabel } from "@/lib/job-description-config";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { useAtom, useAtomValue } from "jotai";
import {
  AlertCircleIcon,
  CheckIcon,
  CircleHelpIcon,
  CopyIcon,
  FileTextIcon,
  ImageIcon,
  LogOutIcon,
  PlusIcon,
  RefreshCcwIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import type { ManagedAttachment } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AssistantMessageGroups } from "@/components/assistant-message-groups";
import { ResumeImportButton } from "@/components/resume-import-button";
import { ThinkingBlock } from "@/components/thinking-block";
import { TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { ApplyJobDescriptionCard } from "@/components/tool-call/apply-job-description-card";
import { ToolCall } from "@/components/tool-call/tool-call";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import {
  fetchConversation,
  patchConversation,
  upsertChatMessageOnServer,
  upsertConversation as upsertConversationOnServer,
} from "@/lib/chat-api";
import { thinkingModeAtom } from "../_atoms/thinking";
import { tutorialStepAtom } from "../_atoms/tutorial";
import { TUTORIAL_MOCK_ATTACHMENTS, TUTORIAL_MOCK_INPUT_TEXT } from "../constants/tutorial-mock";
import { useChatTutorial } from "./chat-tutorial";

type MessagePart = UIMessage["parts"][number];

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

const QUICK_SUGGESTIONS = [
  "列出候选人的优点、缺点、风险关键项，团队定位、职级定级。",
  "这份简历是否建议进入面试？请给出理由和建议的面试重点。",
  "针对这份简历，生成一组面试追问问题，侧重验证项目真实性。",
  "帮我提炼候选人的核心竞争力和岗位匹配度分析。",
  "对比这几份简历，按综合匹配度排序并说明推荐理由。",
];

const NEW_CHAT_TITLE = "新对话";
const GENERATING_CHAT_TITLE = "生成中...";
const MAX_CHAT_TITLE_LENGTH = 28;
const WHITESPACE_REGEX = /\s+/;
const INPUT_APPEND_PUNCTUATION_REGEX = /[，。,.]$/;

const noop = () => {
  // intentionally empty — used to force controlled-open menus
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

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();

  if (!source) {
    return "U";
  }

  const words = source.split(WHITESPACE_REGEX).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function notifyConversationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat:conversations-changed"));
  }
}

function appendSuggestionToInput(currentInput: string, suggestion: string) {
  const normalizedInput = currentInput.trimEnd();

  if (!normalizedInput) {
    return suggestion;
  }

  const separator = INPUT_APPEND_PUNCTUATION_REGEX.test(normalizedInput) ? "" : "，";

  return `${normalizedInput}${separator}${suggestion}`;
}

function isTextPart(part: MessagePart): part is Extract<MessagePart, { type: "text" }> {
  return part.type === "text";
}

function isFilePart(part: MessagePart): part is Extract<MessagePart, { type: "file" }> {
  return part.type === "file";
}

function isSourceUrlPart(part: MessagePart): part is Extract<MessagePart, { type: "source-url" }> {
  return part.type === "source-url";
}

function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toDownloadMessage(message: UIMessage) {
  const text = message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();

  if (text) {
    return { content: text, role: message.role };
  }

  const hasFiles = message.parts.some(isFilePart);
  const hasTools = message.parts.some(isToolPart);
  let fallback = "[Empty Message]";
  if (hasFiles) {
    fallback = "[Attachment]";
  } else if (hasTools) {
    fallback = "[Tool Call]";
  }

  return {
    content: fallback,
    role: message.role,
  };
}

function getMessageTimeValue(message: UIMessage): Date | null {
  const { createdAt } = message as UIMessage & {
    createdAt?: Date | string | number;
  };

  if (!createdAt) {
    return null;
  }

  const parsed = createdAt instanceof Date ? createdAt : new Date(createdAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getConversationTitleFromMessages(
  messages: UIMessage[],
  fallbackTitle: string = NEW_CHAT_TITLE,
) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return fallbackTitle;
  }

  const text = firstUserMessage.parts
    .filter(isTextPart)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (text.length > 0) {
    return text.slice(0, MAX_CHAT_TITLE_LENGTH);
  }

  if (firstUserMessage.parts.some(isFilePart)) {
    return "含附件对话";
  }

  return fallbackTitle;
}

/**
 * Auto-submit predicate for the agent loop.
 * When the server runs one step at a time (stepCountIs(1)),
 * the client auto-submits to continue the loop when all tools
 * in the current step reach terminal state.
 */
function shouldAutoSubmit({ messages }: { messages: UIMessage[] }): boolean {
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") {
    return false;
  }

  let lastStepStartIndex = -1;
  for (let index = 0; index < lastMessage.parts.length; index += 1) {
    if (lastMessage.parts[index]?.type === "step-start") {
      lastStepStartIndex = index;
    }
  }

  // Get tool invocations from the last step (non-provider-executed)
  const lastStepToolInvocations = lastMessage.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart)
    .filter((part) => !part.providerExecuted);

  // If no tool invocations, don't auto-submit
  if (lastStepToolInvocations.length === 0) {
    return false;
  }

  // Auto-submit only if ALL tools are in terminal state
  return lastStepToolInvocations.every(
    (part) =>
      part.state === "output-available" ||
      part.state === "output-error" ||
      part.state === "approval-responded",
  );
}

type SessionData = ReturnType<typeof authClient.useSession>["data"];

interface MobileUserMenuArgs {
  handleSignIn: () => void;
  handleSignOut: () => void;
  session: SessionData;
  showSessionLoadingState: boolean;
  userEmail: string;
  userInitials: string;
  userName: string;
}

function renderMobileUserMenu({
  handleSignIn,
  handleSignOut,
  session,
  showSessionLoadingState,
  userEmail,
  userInitials,
  userName,
}: MobileUserMenuArgs) {
  if (showSessionLoadingState) {
    return <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />;
  }

  if (!session?.user) {
    return (
      <Button className="mt-4" onClick={handleSignIn} size="sm" type="button" variant="outline">
        <UserIcon className="mr-1 size-4" />
        登录
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="用户菜单"
          className="rounded-full"
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Avatar size="sm">
            <AvatarImage alt={userName} src={session.user.image ?? undefined} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate font-medium text-sm">{userName}</p>
          <p className="truncate text-muted-foreground text-xs">{userEmail}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} variant="destructive">
          <LogOutIcon className="mr-2 size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComposerAttachments() {
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

function UploadErrorReset({ onReset }: { onReset: () => void }) {
  const attachments = usePromptInputAttachments();

  useEffect(() => {
    if (attachments.files.length > 0) {
      onReset();
    }
  }, [attachments.files.length, onReset]);

  return null;
}

function ThinkingModeSwitch() {
  const [enabled, setEnabled] = useAtom(thinkingModeAtom);
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const isHydrated = useHydrated();
  // Atom is persisted in localStorage; before hydration the client has no
  // access to it, so always render the fallback (false) to match SSR output.
  const displayEnabled = isHydrated ? enabled || tutorialStep === 5 : false;

  return (
    <div className="hidden items-center gap-1.5 sm:flex" data-tour="thinking-toggle">
      <Switch
        checked={displayEnabled}
        id="thinking-mode"
        size="default"
        onCheckedChange={setEnabled}
        onMouseDown={(e) => e.preventDefault()}
        className="scale-75"
      />
      <Label
        className="cursor-pointer text-muted-foreground text-xs select-none"
        htmlFor="thinking-mode"
      >
        深度思考
      </Label>
    </div>
  );
}
// Override Radix's default "focus trigger on close" — send focus back to
// the composer textarea so typing can resume without an extra click.
const focusTextareaOnMenuClose = (event: Event) => {
  event.preventDefault();
  document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
};

function ComposerFooter({
  downloadableMessages,
  input,
  hasJobDescription,
  jobDescriptionLabel,
  onClearJobDescription,
  onOpenJobDescriptionSettings,
  status,
  stop,
}: {
  downloadableMessages: ConversationMessage[];
  input: string;
  hasJobDescription: boolean;
  jobDescriptionLabel: string | null;
  onClearJobDescription: () => void;
  onOpenJobDescriptionSettings: () => void;
  status: ChatStatus;
  stop: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const hasPendingUploads = attachments.files.some(
    (f) => (f as Partial<ManagedAttachment>).uploadStatus === "uploading",
  );
  const canSubmit = (input.trim().length > 0 || attachments.files.length > 0) && !hasPendingUploads;
  const displayHasJD = hasJobDescription || tutorialStep === 4;
  const forceUploadMenuOpen = tutorialStep === 3;
  const forceJDMenuOpen = tutorialStep === 4;
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
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <ConversationDownload
              aria-label="导出聊天记录"
              className="static rounded-md border-0 bg-transparent shadow-none hover:bg-accent"
              disabled={downloadableMessages.length === 0}
              messages={downloadableMessages}
              size="icon-sm"
              variant="ghost"
            />
          </TooltipTrigger>
          <TooltipContent side="top">导出聊天记录</TooltipContent>
        </Tooltip>

        <ThinkingModeSwitch />
      </PromptInputTools>

      <div className="flex items-center gap-2">
        <span className="hidden text-muted-foreground select-none pointer-events-none text-xs sm:inline">
          {getComposerStatusLabel(status, displayHasJD, jobDescriptionLabel)}
        </span>
        <PromptInputSubmit
          data-tour="send-button"
          disabled={status === "ready" ? !canSubmit : false}
          onStop={stop}
          variant="outline"
          status={status}
        />
      </div>
    </PromptInputFooter>
  );
}

// eslint-disable-next-line complexity -- Top-level page component owns many pieces of UI state that belong together.
export default function ChatPageClient({ initialSessionId }: { initialSessionId: string | null }) {
  const { startTutorial } = useChatTutorial();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isHydrated = useHydrated();
  const thinkingMode = useAtomValue(thinkingModeAtom);
  const tutorialStep = useAtomValue(tutorialStepAtom);
  const [input, setInput] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [shouldNormalizeSessionPath, setShouldNormalizeSessionPath] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isJobDescriptionDialogOpen, setIsJobDescriptionDialogOpen] = useState(false);
  const [jobDescriptionConfig, setJobDescriptionConfig] = useState<JobDescriptionConfig | null>(
    null,
  );
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState("");
  const [jobDescriptionMode, setJobDescriptionMode] = useState<"select" | "custom">("select");
  const [selectedJobDescriptionId, setSelectedJobDescriptionId] = useState<string>("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [resumeImports, setResumeImports] = useState<Record<string, string>>({});
  // Tracks whether we expect a model response right now. Set optimistically in
  // the submit path (before the SDK status transitions) and kept in sync via
  // the effect below so that the send/stop button stays stable during the
  // agent loop's brief `ready` gaps between auto-submitted steps.
  const [hasPendingResponse, setHasPendingResponse] = useState(false);
  // Explicit user stop — lets us force the UI back to idle even if the SDK
  // status gets stuck (some abort paths on iOS/Safari leave it on `streaming`).
  const [userStopped, setUserStopped] = useState(false);
  const userName = session?.user?.name ?? "用户";
  const userEmail = session?.user?.email ?? "";
  const userInitials = getInitials(session?.user?.name, session?.user?.email);
  const showSessionLoadingState = !isHydrated || isSessionPending;

  const handleSignIn = useCallback(() => {
    authClient.signIn.oauth2({
      callbackURL: "/chat",
      providerId: "feishu",
    });
  }, []);

  const handleSignOut = useCallback(() => {
    authClient.signOut();
  }, []);

  const jobDescriptionText = deriveJobDescriptionText(jobDescriptionConfig);
  const hasJobDescription = jobDescriptionText.length > 0;
  const jobDescriptionLabel = getJobDescriptionLabel(jobDescriptionConfig);

  // Refs for dynamic body values — the transport body function reads these
  // so that auto-submit requests always carry the latest values.
  const jobDescriptionRef = useRef<string>("");
  const thinkingModeRef = useRef(thinkingMode);
  const activeConversationIdRef = useRef(activeConversationId);
  // Guards `sendMessageToChat` from re-entry on rapid double-clicks. Released
  // after a short delay — by then the SDK status has moved to submitted and
  // the submit button is disabled.
  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (submitDebounceRef.current !== null) {
        clearTimeout(submitDebounceRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    jobDescriptionRef.current = jobDescriptionText;
  }, [jobDescriptionText]);
  useEffect(() => {
    thinkingModeRef.current = thinkingMode;
  }, [thinkingMode]);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/resume",
        body: () => {
          const jd = jobDescriptionRef.current.trim();
          const chatId = activeConversationIdRef.current;
          return {
            ...(jd && { jobDescription: jd }),
            ...(chatId && { chatId }),
            enableThinking: thinkingModeRef.current,
          };
        },
        fetch: async (fetchInput, init) => {
          const timeoutController = new AbortController();
          const timeoutId = window.setTimeout(() => {
            timeoutController.abort("Chat request timed out after 8 minutes.");
          }, CHAT_REQUEST_TIMEOUT_MS);

          if (init?.signal) {
            if (init.signal.aborted) {
              timeoutController.abort(init.signal.reason);
            } else {
              init.signal.addEventListener(
                "abort",
                () => timeoutController.abort(init.signal?.reason),
                { once: true },
              );
            }
          }

          try {
            return await fetch(fetchInput, {
              ...init,
              signal: timeoutController.signal,
            });
          } finally {
            window.clearTimeout(timeoutId);
          }
        },
      }),
    [],
  );

  const {
    addToolOutput,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    regenerate,
    clearError,
  } = useChat({
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      if (message.role !== "assistant") {
        return;
      }
      notifyConversationsChanged();

      // The server's /api/resume onFinish only fires on a clean finish. For
      // aborts, disconnects, or upstream errors we persist what's in memory
      // so the partial assistant reply is not lost on refresh.
      if (!(isAbort || isDisconnect || isError)) {
        return;
      }
      const conversationId = activeConversationIdRef.current;
      if (!conversationId) {
        return;
      }
      void (async () => {
        try {
          await upsertChatMessageOnServer(conversationId, message);
        } catch (persistError) {
          console.error("[chat] client-side persist failed", persistError);
        }
      })();
    },
    sendAutomaticallyWhen: shouldAutoSubmit,
    transport,
  });

  const downloadableMessages = useMemo(() => messages.map(toDownloadMessage), [messages]);

  const displayInput =
    tutorialStep !== null && tutorialStep >= 2 && input === "" ? TUTORIAL_MOCK_INPUT_TEXT : input;

  const isChatInFlight = (status === "submitted" || status === "streaming") && !userStopped;
  // Treat the loop as still running while `hasPendingResponse` is true so that
  // the brief `ready` between auto-submitted steps doesn't flip UI state.
  let effectiveStatus: ChatStatus = status;
  if (userStopped) {
    effectiveStatus = "ready";
  } else if (hasPendingResponse) {
    effectiveStatus = "streaming";
  }
  const isStreaming = effectiveStatus === "submitted" || effectiveStatus === "streaming";
  const latestMessage = messages.at(-1);
  const showAssistantThinkingBubble = isStreaming && latestMessage?.role === "user";

  // Sync `hasPendingResponse` with the SDK status. Intentionally omitted from
  // deps: the submit handler sets it to true optimistically while status is
  // still `ready`, so including it here would immediately clear it.

  useEffect(() => {
    if (isChatInFlight) {
      setHasPendingResponse(true);
      return;
    }
    if (status === "ready" || status === "error") {
      setHasPendingResponse(false);
      setUserStopped(false);
    }
  }, [isChatInFlight, status]);

  const handleStop = useCallback(() => {
    stop();
    setHasPendingResponse(false);
    setUserStopped(true);
  }, [stop]);

  const updateSessionInUrl = useCallback((sessionId: string | null) => {
    const nextUrl = sessionId ? `/chat/${encodeURIComponent(sessionId)}` : "/chat";

    if (window.location.pathname === nextUrl) {
      return;
    }

    window.history.replaceState(window.history.state, "", nextUrl);
    window.dispatchEvent(
      new CustomEvent("chat:session-path-updated", {
        detail: {
          pathname: nextUrl,
          sessionId,
        },
      }),
    );
  }, []);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    const normalizedTitle = title.trim().slice(0, MAX_CHAT_TITLE_LENGTH);

    if (!normalizedTitle) {
      return;
    }

    try {
      await patchConversation(id, {
        isTitleGenerating: false,
        title: normalizedTitle,
      });
      notifyConversationsChanged();
    } catch {
      // ignore — the derived title fallback on the server remains
    }
  }, []);

  const ensureConversation = async ({
    withGeneratingTitle,
  }: {
    withGeneratingTitle?: boolean;
  } = {}) => {
    if (activeConversationId) {
      return activeConversationId;
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const derivedTitle = withGeneratingTitle
      ? GENERATING_CHAT_TITLE
      : getConversationTitleFromMessages(messages);

    await upsertConversationOnServer({
      createdAt: now,
      id,
      isTitleGenerating: withGeneratingTitle ?? false,
      jobDescription: jobDescriptionText,
      jobDescriptionConfig,
      resumeImports,
      title: derivedTitle,
    });
    notifyConversationsChanged();

    updateSessionInUrl(id);
    setActiveConversationId(id);
    return id;
  };

  const sendMessageToChat = async ({ files, text }: { text: string; files?: FileUIPart[] }) => {
    if (submitDebounceRef.current !== null) {
      return;
    }
    submitDebounceRef.current = setTimeout(() => {
      submitDebounceRef.current = null;
    }, 300);

    const isFirstMessageForNewConversation = !activeConversationId && messages.length === 0;
    let conversationId: string | null = activeConversationId;

    try {
      conversationId = await ensureConversation({
        withGeneratingTitle: isFirstMessageForNewConversation,
      });
      setHistoryErrorMessage(null);
    } catch {
      setHistoryErrorMessage("聊天记录保存失败，请稍后重试。");
    }

    if (isFirstMessageForNewConversation && conversationId) {
      const firstMessageText = text.trim();
      const titleConversationId = conversationId;

      if (firstMessageText.length > 0) {
        void (async () => {
          try {
            const response = await fetch("/api/resume/title", {
              body: JSON.stringify({
                hasFiles: Boolean(files?.length),
                text: firstMessageText,
              }),
              headers: {
                "Content-Type": "application/json",
              },
              method: "POST",
            });

            let title: string | null = null;
            if (response.ok) {
              const payload = (await response.json()) as { title?: string };
              title = payload.title?.trim() ?? null;
            }

            await updateConversationTitle(titleConversationId, title || NEW_CHAT_TITLE);
          } catch {
            await updateConversationTitle(titleConversationId, NEW_CHAT_TITLE);
            setHistoryErrorMessage("会话已创建，但智能标题生成失败。已使用默认标题。");
          }
        })();
      }
    }

    // Optimistically flip UI into the "responding" state before `sendMessage`
    // touches the SDK status — this is what masks the `ready → submitted`
    // flicker at the start of each turn.
    setHasPendingResponse(true);
    setUserStopped(false);
    sendMessage(
      {
        files,
        text,
      },
      // Pass chatId explicitly: on a fresh conversation, setState from
      // ensureConversation has not yet committed, so activeConversationIdRef
      // is still null when transport.body() runs for this request.
      conversationId ? { body: { chatId: conversationId } } : undefined,
    );
  };

  const openConversation = useCallback(
    async (
      id: string,
      {
        shouldSyncUrl = true,
      }: {
        shouldSyncUrl?: boolean;
      } = {},
    ) => {
      let conversation: Awaited<ReturnType<typeof fetchConversation>> = null;
      try {
        conversation = await fetchConversation(id);
      } catch {
        setHistoryErrorMessage("无法加载聊天记录，请稍后重试。");
        return false;
      }

      if (!conversation) {
        if (shouldSyncUrl) {
          updateSessionInUrl(null);
        } else {
          setShouldNormalizeSessionPath(true);
        }
        setHistoryErrorMessage("未找到对应的会话记录，已回到新对话。");
        return false;
      }

      stop();
      if (shouldSyncUrl) {
        updateSessionInUrl(id);
      }
      setActiveConversationId(id);
      setMessages(conversation.messages);
      setInput("");
      setHistoryErrorMessage(null);
      // Prefer structured config; fall back to legacy text-only conversations by treating them as custom mode.
      const legacyText = conversation.jobDescription.trim();
      let hydratedConfig: JobDescriptionConfig | null = null;
      if (conversation.jobDescriptionConfig) {
        hydratedConfig = conversation.jobDescriptionConfig;
      } else if (legacyText) {
        hydratedConfig = { mode: "custom", text: conversation.jobDescription };
      }
      setJobDescriptionConfig(hydratedConfig);
      let hydratedDraft = "";
      if (hydratedConfig?.mode === "custom") {
        hydratedDraft = hydratedConfig.text;
      }
      setJobDescriptionDraft(hydratedDraft);
      setSelectedJobDescriptionId(
        hydratedConfig?.mode === "select" ? hydratedConfig.jobDescriptionId : "",
      );
      setResumeImports(conversation.resumeImports ?? {});
      setUploadErrorMessage(null);
      setIsJobDescriptionDialogOpen(false);
      return true;
    },
    [stop, updateSessionInUrl, setMessages],
  );

  const resetToNewConversation = useCallback(() => {
    stop();
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setJobDescriptionConfig(null);
    setJobDescriptionDraft("");
    setSelectedJobDescriptionId("");
    setResumeImports({});
    setUploadErrorMessage(null);
    setHistoryErrorMessage(null);
    setIsJobDescriptionDialogOpen(false);
  }, [stop, setMessages]);

  const startNewConversation = useCallback(() => {
    resetToNewConversation();
    updateSessionInUrl(null);
  }, [resetToNewConversation, updateSessionInUrl]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (initialSessionId) {
          await openConversation(initialSessionId, { shouldSyncUrl: false });
          return;
        }

        resetToNewConversation();
      } catch {
        setHistoryErrorMessage("加载历史聊天失败，请稍后重试。");
      } finally {
        setIsHistoryReady(true);
      }
    };

    void bootstrap();
  }, [initialSessionId, openConversation, resetToNewConversation]);

  useEffect(() => {
    const handleStartNewConversation = () => {
      startNewConversation();
    };

    window.addEventListener("chat:start-new-conversation", handleStartNewConversation);

    return () => {
      window.removeEventListener("chat:start-new-conversation", handleStartNewConversation);
    };
  }, [startNewConversation]);

  useEffect(() => {
    const handleStartTutorial = () => startTutorial();

    window.addEventListener("chat:start-tutorial", handleStartTutorial);

    return () => {
      window.removeEventListener("chat:start-tutorial", handleStartTutorial);
    };
  }, [startTutorial]);

  useEffect(() => {
    if (!shouldNormalizeSessionPath || activeConversationId) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!activeConversationId) {
        updateSessionInUrl(null);
      }
      setShouldNormalizeSessionPath(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeConversationId, shouldNormalizeSessionPath, updateSessionInUrl]);

  // Persist JD / resumeImports changes (user actions, not message stream).
  // The message stream is persisted server-side via /api/resume's onFinish
  // plus a backup client write in useChat's onFinish.
  useEffect(() => {
    if (!isHistoryReady || !activeConversationId) {
      return;
    }

    const saveTimer = window.setTimeout(() => {
      void (async () => {
        try {
          await patchConversation(activeConversationId, {
            jobDescription: jobDescriptionText,
            jobDescriptionConfig,
            resumeImports,
          });
        } catch {
          setHistoryErrorMessage("岗位描述或简历导入保存失败，请稍后重试。");
        }
      })();
    }, 400);

    return () => window.clearTimeout(saveTimer);
  }, [
    activeConversationId,
    isHistoryReady,
    jobDescriptionConfig,
    jobDescriptionText,
    resumeImports,
  ]);

  const { data: jobDescriptionOptions = [], refetch: refetchJobDescriptionOptions } = useQuery({
    queryFn: async (): Promise<JobDescriptionListRecord[]> => {
      const response = await fetch("/api/studio/job-descriptions/all");
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all"],
    staleTime: 60_000,
  });

  const openJobDescriptionDialog = () => {
    if (jobDescriptionConfig?.mode === "select") {
      setJobDescriptionMode("select");
      setSelectedJobDescriptionId(jobDescriptionConfig.jobDescriptionId);
      setJobDescriptionDraft("");
    } else if (jobDescriptionConfig?.mode === "custom") {
      setJobDescriptionMode("custom");
      setSelectedJobDescriptionId("");
      setJobDescriptionDraft(jobDescriptionConfig.text);
    } else {
      setJobDescriptionMode("select");
      setSelectedJobDescriptionId("");
      setJobDescriptionDraft("");
    }
    setIsJobDescriptionDialogOpen(true);
  };

  const saveJobDescription = () => {
    if (jobDescriptionMode === "select") {
      const selected = jobDescriptionOptions.find((item) => item.id === selectedJobDescriptionId);
      if (selected) {
        setJobDescriptionConfig({
          departmentName: selected.departmentName,
          jobDescriptionId: selected.id,
          mode: "select",
          name: selected.name,
          prompt: selected.prompt,
        });
      } else {
        setJobDescriptionConfig(null);
      }
    } else {
      const text = jobDescriptionDraft.trim();
      setJobDescriptionConfig(text ? { mode: "custom", text } : null);
    }
    setIsJobDescriptionDialogOpen(false);
  };

  const clearJobDescription = () => {
    setJobDescriptionConfig(null);
    setJobDescriptionDraft("");
    setSelectedJobDescriptionId("");
  };

  const selectedJobDescriptionPreview = jobDescriptionOptions.find(
    (item) => item.id === selectedJobDescriptionId,
  );

  const handleApplyJobDescriptionConfirm = useCallback(
    async (toolCallId: string, jobDescriptionId: string) => {
      if (!toolCallId) {
        return;
      }
      // Ensure we have the full posting record to extract prompt/departmentName.
      let record = jobDescriptionOptions.find((item) => item.id === jobDescriptionId) ?? null;
      if (!record) {
        const result = await refetchJobDescriptionOptions();
        record = result.data?.find((item) => item.id === jobDescriptionId) ?? null;
      }
      if (!record) {
        setHistoryErrorMessage("未找到该在招岗位，可能已被删除，请重新选择。");
        await addToolOutput({
          output: { action: "ignore" as const },
          tool: "apply_job_description",
          toolCallId,
        });
        return;
      }
      setJobDescriptionConfig({
        departmentName: record.departmentName,
        jobDescriptionId: record.id,
        mode: "select",
        name: record.name,
        prompt: record.prompt,
      });
      await addToolOutput({
        output: { action: "confirm" as const, jobDescriptionId },
        tool: "apply_job_description",
        toolCallId,
      });
    },
    [addToolOutput, jobDescriptionOptions, refetchJobDescriptionOptions],
  );

  const handleApplyJobDescriptionIgnore = useCallback(
    async (toolCallId: string) => {
      if (!toolCallId) {
        return;
      }
      await addToolOutput({
        output: { action: "ignore" as const },
        tool: "apply_job_description",
        toolCallId,
      });
    },
    [addToolOutput],
  );

  // Override the transport ref for explicit re-runs: on the first send of a
  // new conversation, `activeConversationIdRef` hasn't committed yet, so we
  // pass chatId directly. For auto-submitted agent steps the transport's
  // body() still reads the ref.
  const buildRegenerateOptions = () => {
    const conversationId = activeConversationIdRef.current;
    return conversationId ? { body: { chatId: conversationId } } : {};
  };

  const regenerateLastReply = () => {
    void regenerate(buildRegenerateOptions());
  };

  const handleResumeImported = useCallback((partId: string, interviewId: string) => {
    setResumeImports((prev) => ({ ...prev, [partId]: interviewId }));
  }, []);

  const handleResumeImportMissing = useCallback((partId: string) => {
    setResumeImports((prev) => {
      if (!(partId in prev)) {
        return prev;
      }
      const { [partId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // When the agent loop errors mid-way, drop the failed step's half-written
  // parts while keeping every previously completed step, then re-run.
  // `clearError` alone only flips status to `ready` — it does not trigger
  // `sendAutomaticallyWhen`, so we must call `regenerate` explicitly.
  const handleContinueAfterError = useCallback(() => {
    const lastMessage = messages.at(-1);
    const regenerateOptions = buildRegenerateOptions();

    // No assistant message to trim — just retry from the last user message.
    if (!lastMessage || lastMessage.role !== "assistant") {
      clearError();
      void regenerate(regenerateOptions);
      return;
    }

    let lastStepStartIndex = -1;
    for (let i = lastMessage.parts.length - 1; i >= 0; i -= 1) {
      if (lastMessage.parts[i]?.type === "step-start") {
        lastStepStartIndex = i;
        break;
      }
    }

    // The first step itself failed (no earlier step-start to keep) — fall back
    // to `regenerate`, which discards the half-written message and starts over.
    if (lastStepStartIndex <= 0) {
      clearError();
      void regenerate(regenerateOptions);
      return;
    }

    const trimmedParts = lastMessage.parts.slice(0, lastStepStartIndex);
    setMessages((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const next = [...prev];
      const lastIndex = next.length - 1;
      const lastEntry = next[lastIndex];
      if (!lastEntry) {
        return prev;
      }
      next[lastIndex] = { ...lastEntry, parts: trimmedParts };
      return next;
    });
    clearError();
    void regenerate(regenerateOptions);
  }, [messages, clearError, regenerate, setMessages]);

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(setCopiedMessageId, 1200, null);
    } catch {
      setCopiedMessageId(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col pt-4 pb-2 sm:pb-4 sm:pt-6">
      <header className="mx-auto w-full max-w-5xl mb-4 px-2 sm:px-3">
        <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
          <div className="flex items-center gap-2">
            {renderMobileUserMenu({
              handleSignIn,
              handleSignOut,
              session,
              showSessionLoadingState,
              userEmail,
              userInitials,
              userName,
            })}

            <SidebarTrigger aria-label="打开聊天记录侧边栏" />
          </div>
          <Button onClick={startNewConversation} size="sm" type="button" variant="outline">
            <PlusIcon className="mr-1 size-4" />
            新建
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="pixel-title text-balance font-bold tracking-tight text-2xl sm:text-3xl">
            简历筛选助手
          </h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="使用教程"
                className="size-7 rounded-full text-muted-foreground"
                onClick={startTutorial}
                size="icon"
                type="button"
                variant="ghost"
              >
                <CircleHelpIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>使用教程</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl mb-0.5 px-2 sm:px-3" data-tour="suggestions">
        <p className="mb-2 px-1 font-medium text-muted-foreground text-xs">快速提问</p>
        <Suggestions className="gap-2.5 pb-1">
          {QUICK_SUGGESTIONS.map((suggestion) => (
            <Suggestion
              className="h-auto rounded-2xl border-border/70 bg-card/70 px-4 py-2 text-left text-xs leading-relaxed whitespace-normal hover:bg-accent"
              disabled={isStreaming}
              key={suggestion}
              onClick={(text) => {
                setInput((currentInput) => appendSuggestionToInput(currentInput, text));
                document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
              }}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </section>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Conversation className="h-full">
          <ConversationContent className="mx-auto w-full max-w-5xl py-4 px-2 md:px-6 sm:py-6">
            {messages.length === 0 ? (
              <ConversationEmptyState
                className="my-10 rounded-2xl border border-dashed border-border/70 bg-background/70"
                description="上传候选人简历（最多 8 份）或输入筛选要求，助手会给出评分与推荐结论。"
                icon={<SparklesIcon className="size-5" />}
                title="开始筛选简历"
              />
            ) : (
              <>
                {messages.map((message, messageIndex) => {
                  const textParts = message.parts.filter(isTextPart);
                  const fileParts = message.parts
                    .map((part, index) => {
                      if (!isFilePart(part)) {
                        return null;
                      }

                      return {
                        ...part,
                        id: `${message.id}-file-${index}`,
                      };
                    })
                    .filter((part): part is FileUIPart & { id: string } => part !== null);
                  const sourceParts = message.parts.filter(isSourceUrlPart);
                  const isLastMessage = messageIndex === messages.length - 1;
                  const isMessageStreaming = isLastMessage && isStreaming;
                  const assistantText = textParts
                    .map((part) => part.text)
                    .join("\n\n")
                    .trim();
                  const isChatRole = message.role === "user" || message.role === "assistant";
                  const messageAuthor = message.role === "assistant" ? "简历筛选助手" : userName;
                  const messageTime = getMessageTimeValue(message);

                  // Compute startedAt for summary bar timer
                  const prevUserMessage =
                    messageIndex > 0
                      ? messages
                          .slice(0, messageIndex)
                          .toReversed()
                          .find((m) => m.role === "user")
                      : null;
                  const startedAt = prevUserMessage
                    ? (getMessageTimeValue(prevUserMessage)?.toISOString() ?? null)
                    : null;

                  return (
                    <div key={message.id}>
                      {isChatRole ? (
                        <p
                          className={`mb-2.5 text-muted-foreground text-xs ${message.role === "user" ? "text-right" : "text-left"}`}
                        >
                          {messageAuthor}
                          {messageTime ? (
                            <>
                              {" · "}
                              <TimeDisplay
                                as="span"
                                options={TIME_DISPLAY_OPTIONS}
                                value={messageTime}
                              />
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
                                "title" in part && typeof part.title === "string"
                                  ? part.title
                                  : part.url;

                              return (
                                <Source
                                  href={part.url}
                                  key={`${message.id}-source-${index}`}
                                  title={title}
                                />
                              );
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
                                    {showImportButton ? (
                                      <ResumeImportButton
                                        filePart={part}
                                        importedInterviewId={importedId}
                                        onImported={handleResumeImported}
                                        onMissing={handleResumeImportMissing}
                                      />
                                    ) : null}
                                  </Attachment>
                                );
                              })}
                            </Attachments>
                          ) : null}

                          {message.role === "assistant" ? (
                            <AssistantMessageGroups
                              message={message}
                              isStreaming={isMessageStreaming}
                              durationMs={null}
                              startedAt={startedAt}
                            >
                              {(isExpanded) => (
                                <>
                                  {message.parts.map((part, index) => {
                                    if (part.type === "text") {
                                      return (
                                        <MessageResponse key={`${message.id}-${index}`}>
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
                                            onConfirm={handleApplyJobDescriptionConfirm}
                                            onIgnore={handleApplyJobDescriptionIgnore}
                                            part={part}
                                          />
                                        );
                                      }
                                      if (isExpanded) {
                                        return (
                                          <ToolCall
                                            key={`${message.id}-${part.type}-${index}`}
                                            isStreaming={isMessageStreaming}
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
                                          key={`${message.id}-reasoning-${index}`}
                                          text={part.text}
                                          isStreaming={isReasoningStreaming}
                                        />
                                      );
                                    }

                                    if (part.type === "step-start" && isExpanded) {
                                      return (
                                        <div
                                          className=" border-border border-t opacity-50"
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
                                  <MessageResponse key={`${message.id}-${index}`}>
                                    {part.text}
                                  </MessageResponse>
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
                            onClick={regenerateLastReply}
                            tooltip="重新生成"
                          >
                            <RefreshCcwIcon className="size-3" />
                          </MessageAction>

                          <MessageAction
                            label="复制内容"
                            onClick={() => handleCopy(message.id, assistantText)}
                            tooltip="复制"
                          >
                            {copiedMessageId === message.id ? (
                              <CheckIcon className="size-3" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                          </MessageAction>
                        </MessageActions>
                      ) : null}
                    </div>
                  );
                })}

                {showAssistantThinkingBubble ? (
                  <div>
                    <p className="mb-2 text-left text-muted-foreground text-xs">
                      简历筛选助手 ·{" "}
                      <TimeDisplay as="span" options={TIME_DISPLAY_OPTIONS} value={Date.now()} />
                    </p>
                    <Message from="assistant">
                      <MessageContent className="px-0 py-1">
                        <div
                          aria-label="简历筛选助手正在思考"
                          className="text-muted-foreground/80"
                          role="status"
                        >
                          <Shimmer duration={1.2}>思考中...</Shimmer>
                        </div>
                      </MessageContent>
                    </Message>
                  </div>
                ) : null}
              </>
            )}
          </ConversationContent>

          <ConversationScrollButton />
        </Conversation>
      </div>

      {error || uploadErrorMessage || historyErrorMessage ? (
        <div className="mx-auto mb-2 flex w-full max-w-5xl flex-col gap-2 px-2  sm:px-3">
          {error ? (
            <div
              aria-live="polite"
              className="flex flex-col gap-2 rounded-xl border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:flex-row sm:items-center sm:gap-3 sm:px-4"
            >
              <div className="flex min-w-0 items-start gap-2">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                <span className="leading-relaxed">
                  请求失败，这一步没有完成。可以继续跑完剩下的步骤，或从头重新生成。
                </span>
              </div>
              <Button
                className="shrink-0 sm:ml-auto"
                onClick={handleContinueAfterError}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCcwIcon className="size-3.5" />
                继续
              </Button>
            </div>
          ) : null}

          {uploadErrorMessage ? (
            <div
              aria-live="polite"
              className="flex  gap-2 rounded-md items-center mb-2 border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:px-4"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <p className="leading-relaxed">{uploadErrorMessage}</p>
            </div>
          ) : null}

          {historyErrorMessage ? (
            <div
              aria-live="polite"
              className="flex  gap-2 rounded-md items-center mb-2 border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:px-4"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <p className="leading-relaxed">{historyErrorMessage}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <PromptInput
        data-tour="prompt-input"
        accept="application/pdf"
        className="mx-auto w-full max-w-5xl px-2 sm:px-3 **:data-[slot=input-group]:cursor-text **:data-[slot=input-group]:rounded-[1.3rem] **:data-[slot=input-group]:border-border/65 **:data-[slot=input-group]:bg-white **:data-[slot=input-group]:shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]"
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
        maxFiles={8}
        maxFileSize={10 * 1024 * 1024}
        multiple
        onGlobalDropOutside={() => {
          toast.warning("请将简历拖拽到上传区域后再松开。");
        }}
        onError={({ code, message }) => {
          if (code === "accept") {
            setUploadErrorMessage("仅支持上传 PDF 文件。");
            return;
          }
          if (code === "max_file_size") {
            setUploadErrorMessage("单个 PDF 文件不能超过 10 MB。");
            return;
          }
          if (code === "max_files") {
            setUploadErrorMessage("最多上传 8 个 PDF 文件。");
            return;
          }
          setUploadErrorMessage(message);
        }}
        onSubmit={({ files, text }) => {
          const trimmed = text.trim();
          const hasText = trimmed.length > 0;
          const hasFiles = files.length > 0;

          if (!hasText && !hasFiles) {
            return;
          }

          setUploadErrorMessage(null);

          void sendMessageToChat({
            files,
            text: hasText ? trimmed : "请结合岗位要求分析这份简历并给出筛选建议。",
          });
          setInput("");
        }}
      >
        <UploadErrorReset onReset={() => setUploadErrorMessage(null)} />

        <PromptInputHeader>
          <ComposerAttachments />
        </PromptInputHeader>

        <PromptInputBody>
          <PromptInputTextarea
            autoComplete="off"
            className="min-h-20"
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="输入岗位与筛选要求，或上传候选人 PDF 简历（支持多文件）…"
            value={displayInput}
          />
        </PromptInputBody>

        <ComposerFooter
          downloadableMessages={downloadableMessages}
          hasJobDescription={hasJobDescription}
          input={input}
          jobDescriptionLabel={jobDescriptionLabel}
          onClearJobDescription={clearJobDescription}
          onOpenJobDescriptionSettings={openJobDescriptionDialog}
          status={effectiveStatus}
          stop={handleStop}
        />
      </PromptInput>

      <Dialog onOpenChange={setIsJobDescriptionDialogOpen} open={isJobDescriptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>在招岗位信息设置</DialogTitle>
            <DialogDescription>
              选择后台已配置的在招岗位，或手动填写 JD 作为简历评估的上下文。若你在对话中明确给出
              JD，模型会优先使用对话中提供的版本。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
            <div className="space-y-0.5">
              <div className="font-medium text-sm">从在招岗位中选择</div>
              <div className="text-muted-foreground text-xs">关闭则手动填写自定义 JD</div>
            </div>
            <Switch
              checked={jobDescriptionMode === "select"}
              onCheckedChange={(next) => setJobDescriptionMode(next ? "select" : "custom")}
            />
          </div>

          {jobDescriptionMode === "select" ? (
            <div className="space-y-2">
              <Label htmlFor="job-description-select">选择在招岗位</Label>
              <Select
                onValueChange={(next) => setSelectedJobDescriptionId(next)}
                value={selectedJobDescriptionId || undefined}
              >
                <SelectTrigger className="w-full h-13!" id="job-description-select">
                  <SelectValue
                    placeholder={
                      jobDescriptionOptions.length === 0 ? "暂无已配置的在招岗位" : "请选择在招岗位"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {jobDescriptionOptions.map((jd) => (
                    <SelectItem key={jd.id} value={jd.id}>
                      <div className="flex w-full flex-col items-start text-left">
                        <span>
                          {jd.departmentName ? `${jd.departmentName} / ` : ""}
                          {jd.name}
                        </span>
                        {jd.description ? (
                          <span className="line-clamp-1 text-muted-foreground text-xs">
                            {jd.description}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedJobDescriptionPreview ? (
                <div className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-muted-foreground text-xs">
                  <div className="mb-1 font-medium text-foreground">
                    {selectedJobDescriptionPreview.name}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans">
                    {selectedJobDescriptionPreview.prompt}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  选中后会把岗位名称与 prompt 作为评估上下文传给 Agent。
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor="job-description">
                自定义 JD 内容
              </label>
              <textarea
                autoComplete="off"
                className="min-h-40 mt-2 w-full rounded-xl border border-border/70 bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="job-description"
                name="jobDescription"
                onChange={(event) => setJobDescriptionDraft(event.currentTarget.value)}
                placeholder="例如：前端开发岗位，要求 React/TypeScript 基础，有完整项目经历或相关工作/实习经验…"
                spellCheck={false}
                value={jobDescriptionDraft}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                clearJobDescription();
                setIsJobDescriptionDialogOpen(false);
              }}
              type="button"
              variant="outline"
            >
              清空
            </Button>
            <Button
              disabled={jobDescriptionMode === "select" && !selectedJobDescriptionId}
              onClick={saveJobDescription}
              type="button"
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
