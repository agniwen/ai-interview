'use client';

import type { ChatStatus, DynamicToolUIPart, FileUIPart, ToolUIPart, UIMessage } from 'ai';
import type { ConversationMessage } from '@/components/ai-elements/conversation';
import { useChat } from '@ai-sdk/react';
import {

  DefaultChatTransport,

} from 'ai';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  LogOutIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  RefreshCcwIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,

  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputActionAddAttachments,
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
} from '@/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useHydrated } from '@/hooks/use-hydrated';
import { authClient } from '@/lib/auth-client';
import {
  chatHistoryDB,
} from '@/lib/chat-history-db';
import { isMobileSidebarOpenAtom } from '../atoms/sidebar';
import { ResourceNoticeDialog } from './resource-notice-dialog';

type MessagePart = UIMessage['parts'][number];

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

const QUICK_SUGGESTIONS = [
  '列出候选人的优点、缺点、风险关键项，团队定位、职级定级。',
  '这份简历是否建议进入面试？请给出理由和建议的面试重点。',
  '针对这份简历，生成一组面试追问问题，侧重验证项目真实性。',
  '帮我提炼候选人的核心竞争力和岗位匹配度分析。',
  '对比这几份简历，按综合匹配度排序并说明推荐理由。',
];

const NEW_CHAT_TITLE = '新对话';
const GENERATING_CHAT_TITLE = '生成中...';
const MAX_CHAT_TITLE_LENGTH = 28;
const WHITESPACE_REGEX = /\s+/;
const INPUT_APPEND_PUNCTUATION_REGEX = /[，。,.]$/;

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? '').trim();

  if (!source) {
    return 'U';
  }

  const words = source.split(WHITESPACE_REGEX).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function appendSuggestionToInput(currentInput: string, suggestion: string) {
  const normalizedInput = currentInput.trimEnd();

  if (!normalizedInput) {
    return suggestion;
  }

  const separator = INPUT_APPEND_PUNCTUATION_REGEX.test(normalizedInput)
    ? ''
    : '，';

  return `${normalizedInput}${separator}${suggestion}`;
}

function isTextPart(part: MessagePart): part is Extract<MessagePart, { type: 'text' }> {
  return part.type === 'text';
}

function isFilePart(part: MessagePart): part is Extract<MessagePart, { type: 'file' }> {
  return part.type === 'file';
}

function isReasoningPart(part: MessagePart): part is Extract<MessagePart, { type: 'reasoning' }> {
  return part.type === 'reasoning';
}

function isSourceUrlPart(part: MessagePart): part is Extract<MessagePart, { type: 'source-url' }> {
  return part.type === 'source-url';
}

function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function toDownloadMessage(message: UIMessage) {
  const text = message.parts
    .filter(isTextPart)
    .map(part => part.text)
    .join('\n\n')
    .trim();

  if (text) {
    return { content: text, role: message.role };
  }

  const hasFiles = message.parts.some(isFilePart);
  const hasTools = message.parts.some(isToolPart);
  const fallback = hasFiles
    ? '[Attachment]'
    : hasTools
      ? '[Tool Call]'
      : '[Empty Message]';

  return {
    content: fallback,
    role: message.role,
  };
}

function getMessageTimeText(message: UIMessage): string | null {
  const createdAt = (message as UIMessage & {
    createdAt?: Date | string | number
  }).createdAt;

  if (!createdAt) {
    return null;
  }

  const parsed
    = createdAt instanceof Date ? createdAt : new Date(createdAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return timeFormatter.format(parsed);
}

function getConversationTitleFromMessages(messages: UIMessage[], fallbackTitle: string = NEW_CHAT_TITLE) {
  const firstUserMessage = messages.find(message => message.role === 'user');

  if (!firstUserMessage) {
    return fallbackTitle;
  }

  const text = firstUserMessage.parts
    .filter(isTextPart)
    .map(part => part.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (text.length > 0) {
    return text.slice(0, MAX_CHAT_TITLE_LENGTH);
  }

  if (firstUserMessage.parts.some(isFilePart)) {
    return '含附件对话';
  }

  return fallbackTitle;
}

function ComposerAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments className='w-full' variant='inline'>
      {attachments.files.map(file => (
        <Attachment
          data={file}
          key={file.id}
          onRemove={() => attachments.remove(file.id)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove />
        </Attachment>
      ))}
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

function ToolPartView({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const defaultOpen
    = part.state === 'output-available' || part.state === 'output-error';

  return (
    <Tool defaultOpen={defaultOpen}>
      {part.type === 'dynamic-tool'
        ? (
            <ToolHeader
              state={part.state}
              toolName={part.toolName}
              type='dynamic-tool'
            />
          )
        : (
            <ToolHeader state={part.state} type={part.type} />
          )}

      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

function ComposerFooter({
  downloadableMessages,
  input,
  hasJobDescription,
  onClearJobDescription,
  onOpenJobDescriptionSettings,
  status,
  stop,
}: {
  downloadableMessages: ConversationMessage[]
  input: string
  hasJobDescription: boolean
  onClearJobDescription: () => void
  onOpenJobDescriptionSettings: () => void
  status: ChatStatus
  stop: () => void
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit
    = input.trim().length > 0 || attachments.files.length > 0;

  return (
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputActionMenu>
          <PromptInputActionMenuTrigger
            id='prompt-actions-menu-trigger'
            tooltip='更多输入操作'
          />
          <PromptInputActionMenuContent>
            <PromptInputActionAddAttachments label='上传 PDF 简历' />

            <PromptInputActionMenuItem
              onSelect={(event) => {
                event.preventDefault();
                attachments.clear();
              }}
            >
              <Trash2Icon className='mr-2 size-4' />
              清空附件
            </PromptInputActionMenuItem>
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>

        <PromptInputActionMenu>
          <PromptInputActionMenuTrigger
            id='prompt-job-settings-menu-trigger'
            tooltip='岗位设置'
          >
            <SettingsIcon className='size-4' />
          </PromptInputActionMenuTrigger>
          <PromptInputActionMenuContent>
            <PromptInputActionMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onOpenJobDescriptionSettings();
              }}
            >
              <FileTextIcon className='mr-2 size-4' />
              设置岗位描述（JD）
            </PromptInputActionMenuItem>

            <PromptInputActionMenuItem
              disabled={!hasJobDescription}
              onSelect={(event) => {
                event.preventDefault();
                onClearJobDescription();
              }}
            >
              <Trash2Icon className='mr-2 size-4' />
              清空岗位描述
            </PromptInputActionMenuItem>
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <ConversationDownload
              aria-label='导出聊天记录'
              className='static rounded-md border-0 bg-transparent shadow-none hover:bg-accent'
              disabled={downloadableMessages.length === 0}
              messages={downloadableMessages}
              size='icon-sm'
              variant='ghost'
            />
          </TooltipTrigger>
          <TooltipContent side='top'>
            导出聊天记录
          </TooltipContent>
        </Tooltip>
      </PromptInputTools>

      <div className='flex items-center gap-2'>
        <span className='hidden text-muted-foreground text-xs sm:inline'>
          {status === 'streaming'
            ? '正在分析简历内容…'
            : hasJobDescription
              ? '已配置岗位描述（JD）'
              : '未配置岗位描述（可在岗位设置中配置）'}
        </span>
        <PromptInputSubmit
          disabled={status === 'ready' ? !canSubmit : false}
          onStop={stop}
          status={status}
        />
      </div>
    </PromptInputFooter>
  );
}

export default function ChatPageClient() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const initialSessionId = sessionId ?? null;
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const isHydrated = useHydrated();
  const isMobileSidebarOpen = useAtomValue(isMobileSidebarOpenAtom);
  const setIsMobileSidebarOpen = useSetAtom(isMobileSidebarOpenAtom);
  const [input, setInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [shouldNormalizeSessionPath, setShouldNormalizeSessionPath]
    = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(
    null,
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isJobDescriptionDialogOpen, setIsJobDescriptionDialogOpen]
    = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState('');
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null,
  );
  const userName = session?.user?.name ?? '用户';
  const userEmail = session?.user?.email ?? '';
  const userInitials = getInitials(session?.user?.name, session?.user?.email);
  const showSessionLoadingState = !isHydrated || isSessionPending;

  const handleSignIn = useCallback(() => {
    authClient.signIn.social({
      provider: 'google',
      callbackURL: '/chat',
    });
  }, []);

  const handleSignOut = useCallback(() => {
    authClient.signOut();
  }, []);

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    regenerate,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (input, init) => {
        const timeoutController = new AbortController();
        const timeoutId = window.setTimeout(() => {
          timeoutController.abort('Chat request timed out after 8 minutes.');
        }, CHAT_REQUEST_TIMEOUT_MS);

        if (init?.signal) {
          if (init.signal.aborted) {
            timeoutController.abort(init.signal.reason);
          }
          else {
            init.signal.addEventListener(
              'abort',
              () => timeoutController.abort(init.signal?.reason),
              { once: true },
            );
          }
        }

        try {
          return await fetch(input, {
            ...init,
            signal: timeoutController.signal,
          });
        }
        finally {
          window.clearTimeout(timeoutId);
        }
      },
    }),
  });

  const downloadableMessages = useMemo(
    () => messages.map(toDownloadMessage),
    [messages],
  );

  const normalizedJobDescription = jobDescription.trim();
  const hasJobDescription = normalizedJobDescription.length > 0;

  const isStreaming = status === 'submitted' || status === 'streaming';
  const lastMessage = messages.at(-1);
  const showAssistantThinkingBubble
    = isStreaming && lastMessage?.role === 'user';

  const updateSessionInUrl = useCallback(
    (sessionId: string | null) => {
      const nextUrl = sessionId
        ? `/chat/${encodeURIComponent(sessionId)}`
        : '/chat';

      if (window.location.pathname === nextUrl) {
        return;
      }

      window.history.replaceState(window.history.state, '', nextUrl);
      window.dispatchEvent(
        new CustomEvent('chat:session-path-updated', {
          detail: {
            pathname: nextUrl,
            sessionId,
          },
        }),
      );
    },
    [],
  );

  const persistConversation = useCallback(async ({
    id,
    nextMessages,
    nextJobDescription,
    createdAt,
    forcedTitle,
    forcedIsTitleGenerating,
  }: {
    id: string
    nextMessages: UIMessage[]
    nextJobDescription: string
    createdAt?: number
    forcedTitle?: string
    forcedIsTitleGenerating?: boolean
  }) => {
    const existing = await chatHistoryDB.conversations.get(id);
    const now = Date.now();
    const derivedTitle = getConversationTitleFromMessages(
      nextMessages,
      existing?.title ?? NEW_CHAT_TITLE,
    );
    const shouldKeepExistingTitle
      = typeof existing?.title === 'string' && existing.title !== NEW_CHAT_TITLE;
    const shouldKeepGeneratingTitle
      = existing?.isTitleGenerating === true && !forcedTitle;
    const resolvedTitle = forcedTitle || (shouldKeepGeneratingTitle
      ? existing?.title ?? GENERATING_CHAT_TITLE
      : shouldKeepExistingTitle
        ? existing.title
        : derivedTitle);
    const isTitleGenerating
      = typeof forcedIsTitleGenerating === 'boolean'
        ? forcedIsTitleGenerating
        : existing?.isTitleGenerating ?? false;

    await chatHistoryDB.conversations.put({
      id,
      createdAt: createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
      title: resolvedTitle,
      isTitleGenerating,
      messages: nextMessages,
      jobDescription: nextJobDescription.trim(),
    });
  }, []);

  const updateConversationTitle = useCallback(
    async (id: string, title: string) => {
      const conversation = await chatHistoryDB.conversations.get(id);

      if (!conversation) {
        return;
      }

      const normalizedTitle = title.trim().slice(0, MAX_CHAT_TITLE_LENGTH);

      if (!normalizedTitle) {
        return;
      }

      await chatHistoryDB.conversations.put({
        ...conversation,
        title: normalizedTitle,
        isTitleGenerating: false,
      });
    },
    [],
  );

  const ensureConversation = async ({
    withGeneratingTitle,
  }: {
    withGeneratingTitle?: boolean
  } = {}) => {
    if (activeConversationId) {
      return activeConversationId;
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await persistConversation({
      id,
      nextMessages: messages,
      nextJobDescription: jobDescription,
      createdAt: now,
      forcedTitle: withGeneratingTitle ? GENERATING_CHAT_TITLE : undefined,
      forcedIsTitleGenerating: withGeneratingTitle,
    });

    updateSessionInUrl(id);
    setActiveConversationId(id);
    return id;
  };

  const sendMessageToChat = async ({
    files,
    text,
  }: {
    text: string
    files?: FileUIPart[]
  }) => {
    const isFirstMessageForNewConversation
      = !activeConversationId && messages.length === 0;
    let conversationId: string | null = activeConversationId;

    try {
      conversationId = await ensureConversation({
        withGeneratingTitle: isFirstMessageForNewConversation,
      });
      setHistoryErrorMessage(null);
    }
    catch {
      setHistoryErrorMessage('本地聊天记录保存失败，请检查浏览器存储权限。');
    }

    if (isFirstMessageForNewConversation && conversationId) {
      const firstMessageText = text.trim();

      if (firstMessageText.length > 0) {
        void fetch('/api/chat-title', {
          body: JSON.stringify({
            hasFiles: Boolean(files?.length),
            text: firstMessageText,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        })
          .then(async (response) => {
            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as {
              title?: string
            };

            return payload.title?.trim() ?? null;
          })
          .then(async (title) => {
            if (title) {
              await updateConversationTitle(conversationId, title);
              return;
            }

            await updateConversationTitle(conversationId, NEW_CHAT_TITLE);
          })
          .catch(() => {
            void updateConversationTitle(conversationId, NEW_CHAT_TITLE);
            setHistoryErrorMessage('会话已创建，但智能标题生成失败。已使用默认标题。');
          });
      }
    }

    sendMessage(
      {
        files,
        text,
      },
      hasJobDescription
        ? {
            body: {
              jobDescription: normalizedJobDescription,
            },
          }
        : undefined,
    );
  };

  const openConversation = useCallback(
    async (
      id: string,
      {
        shouldSyncUrl = true,
      }: {
        shouldSyncUrl?: boolean
      } = {},
    ) => {
      const conversation = await chatHistoryDB.conversations.get(id);

      if (!conversation) {
        if (shouldSyncUrl) {
          updateSessionInUrl(null);
        }
        else {
          setShouldNormalizeSessionPath(true);
        }
        setHistoryErrorMessage('未找到对应的会话记录，已回到新对话。');
        return false;
      }

      stop();
      if (shouldSyncUrl) {
        updateSessionInUrl(id);
      }
      setActiveConversationId(id);
      setMessages(conversation.messages);
      setInput('');
      setHistoryErrorMessage(null);
      setJobDescription(conversation.jobDescription);
      setJobDescriptionDraft(conversation.jobDescription);
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
    setInput('');
    setJobDescription('');
    setJobDescriptionDraft('');
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
      }
      catch {
        setHistoryErrorMessage('本地聊天记录不可用，侧边栏将不显示历史记录。');
      }
      finally {
        setIsHistoryReady(true);
      }
    };

    void bootstrap();
  }, [initialSessionId, openConversation, resetToNewConversation]);

  useEffect(() => {
    const handleStartNewConversation = () => {
      startNewConversation();
    };

    window.addEventListener('chat:start-new-conversation', handleStartNewConversation);

    return () => {
      window.removeEventListener('chat:start-new-conversation', handleStartNewConversation);
    };
  }, [startNewConversation]);

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

  useEffect(() => {
    if (!isHistoryReady || !activeConversationId) {
      return;
    }

    const saveTimer = window.setTimeout(() => {
      void persistConversation({
        id: activeConversationId,
        nextMessages: messages,
        nextJobDescription: jobDescription,
      }).catch(() => {
        setHistoryErrorMessage('聊天已继续，但本地记录更新失败。');
      });
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [
    activeConversationId,
    isHistoryReady,
    jobDescription,
    messages,
    persistConversation,
  ]);

  const openJobDescriptionDialog = () => {
    setJobDescriptionDraft(jobDescription);
    setIsJobDescriptionDialogOpen(true);
  };

  const saveJobDescription = () => {
    setJobDescription(jobDescriptionDraft.trim());
    setIsJobDescriptionDialogOpen(false);
  };

  const clearJobDescription = () => {
    setJobDescription('');
    setJobDescriptionDraft('');
  };

  const regenerateLastReply = () => {
    regenerate(
      hasJobDescription
        ? {
            body: {
              jobDescription: normalizedJobDescription,
            },
          }
        : undefined,
    );
  };

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(setCopiedMessageId, 1200, null);
    }
    catch {
      setCopiedMessageId(null);
    }
  };

  return (
    <div className='mx-auto flex h-full w-full max-w-5xl flex-col px-1 pt-4 pb-2 sm:pb-4 sm:px-2 sm:pt-6'>
      <header className='mb-4 px-1 '>
        <div className='mb-2 flex items-center justify-between gap-2 sm:hidden'>
          <div className='flex items-center gap-2'>
            {showSessionLoadingState
              ? (
                  <div className='h-9 w-9 animate-pulse rounded-md bg-muted' />
                )
              : session?.user
                ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-label='用户菜单' size='icon-sm' className='rounded-full' type='button' variant='outline'>
                          <Avatar size='sm'>
                            <AvatarImage alt={userName} src={session.user.image ?? undefined} />
                            <AvatarFallback>{userInitials}</AvatarFallback>
                          </Avatar>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='start' className='w-56'>
                        <DropdownMenuLabel className='space-y-0.5'>
                          <p className='truncate font-medium text-sm'>{userName}</p>
                          <p className='truncate text-muted-foreground text-xs'>{userEmail}</p>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut} variant='destructive'>
                          <LogOutIcon className='mr-2 size-4' />
                          退出登录
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                : (
                    <Button onClick={handleSignIn} size='sm' type='button' variant='outline'>
                      <UserIcon className='mr-1 size-4' />
                      登录
                    </Button>
                  )}

            <Button
              aria-controls='chat-history-sidebar'
              aria-expanded={isMobileSidebarOpen}
              onClick={() => setIsMobileSidebarOpen(true)}
              size='sm'
              type='button'
              variant='outline'
            >
              <PanelLeftOpenIcon className='mr-1 size-4' />
              聊天记录
            </Button>
          </div>
          <Button onClick={startNewConversation} size='sm' type='button' variant='ghost'>
            <PlusIcon className='mr-1 size-4' />
            新建
          </Button>
        </div>
        <h1 className='pixel-title text-balance font-bold tracking-tight text-2xl sm:text-3xl'>
          简历筛选助手
        </h1>
        <p className='mt-2 max-w-3xl font-serif!  text-xs text-muted-foreground sm:text-sm'>
          支持多份简历上传、初筛评分、风险识别与面试推进建议
        </p>
      </header>

      <section className='mb-3'>
        <p className='mb-2 px-1 font-medium text-muted-foreground text-xs'>
          快速提问
        </p>
        <Suggestions className='gap-2.5 pb-1'>
          {QUICK_SUGGESTIONS.map(suggestion => (
            <Suggestion
              className='h-auto rounded-lg border-border/70 bg-card/70 px-4 py-2 text-left text-xs leading-relaxed whitespace-normal hover:bg-accent'
              disabled={isStreaming}
              key={suggestion}
              onClick={(text) => {
                setInput(currentInput => appendSuggestionToInput(currentInput, text));
              }}
              suggestion={suggestion}
            />
          ))}
        </Suggestions>
      </section>

      <div className='relative min-h-0 flex-1 overflow-hidden'>
        <Conversation className='h-full'>
          <ConversationContent className='py-4 px-0 sm:py-6'>
            {messages.length === 0
              ? (
                  <ConversationEmptyState
                    className='my-10 rounded-lg border border-dashed border-border/70 bg-background/70'
                    description='上传候选人简历（最多 8 份）或输入筛选要求，助手会给出评分与推荐结论。'
                    icon={<SparklesIcon className='size-5' />}
                    title='开始筛选简历'
                  />
                )
              : (
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
                        .filter((part): part is FileUIPart & { id: string } =>
                          Boolean(part),
                        );
                      const sourceParts = message.parts.filter(isSourceUrlPart);
                      const reasoningParts = message.parts.filter(isReasoningPart);
                      const reasoningText = reasoningParts
                        .map(part => part.text)
                        .join('\n\n')
                        .trim();
                      const isLastMessage = messageIndex === messages.length - 1;
                      const isReasoningStreaming
                        = isLastMessage
                          && isStreaming
                          && message.parts.at(-1)?.type === 'reasoning';
                      const assistantText = textParts
                        .map(part => part.text)
                        .join('\n\n')
                        .trim();
                      const isChatRole
                        = message.role === 'user' || message.role === 'assistant';
                      const messageAuthor
                        = message.role === 'assistant' ? '简历筛选助手' : '你';
                      const messageTime = getMessageTimeText(message);

                      return (
                        <div key={message.id}>
                          {isChatRole
                            ? (
                                <p
                                  className={`mb-1 text-muted-foreground text-xs ${message.role === 'user' ? 'text-right' : 'text-left'}`}
                                >
                                  {messageAuthor}
                                  {messageTime ? ` · ${messageTime}` : ''}
                                </p>
                              )
                            : null}

                          {message.role === 'assistant' && sourceParts.length > 0
                            ? (
                                <Sources className='mb-2'>
                                  <SourcesTrigger count={sourceParts.length} />
                                  <SourcesContent>
                                    {sourceParts.map((part, index) => {
                                      const title
                                        = 'title' in part && typeof part.title === 'string'
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
                              )
                            : null}

                          <Message from={message.role}>
                            <MessageContent>
                              {reasoningText
                                ? (
                                    <Reasoning
                                      className='w-full'
                                      isStreaming={isReasoningStreaming}
                                    >
                                      <ReasoningTrigger />
                                      <ReasoningContent>{reasoningText}</ReasoningContent>
                                    </Reasoning>
                                  )
                                : null}

                              {fileParts.length > 0
                                ? (
                                    <Attachments
                                      className='mb-2'
                                      variant={message.role === 'user' ? 'inline' : 'grid'}
                                    >
                                      {fileParts.map(part => (
                                        <Attachment data={part} key={part.id}>
                                          <AttachmentPreview />
                                          {message.role === 'user'
                                            ? (
                                                <AttachmentInfo />
                                              )
                                            : null}
                                        </Attachment>
                                      ))}
                                    </Attachments>
                                  )
                                : null}

                              {message.parts.map((part, index) => {
                                if (part.type === 'text') {
                                  return (
                                    <MessageResponse key={`${message.id}-${index}`}>
                                      {part.text}
                                    </MessageResponse>
                                  );
                                }

                                if (isToolPart(part)) {
                                  return (
                                    <ToolPartView
                                      key={`${message.id}-${part.type}-${index}`}
                                      part={part}
                                    />
                                  );
                                }

                                if (part.type === 'step-start') {
                                  return (
                                    <div
                                      className='my-3 border-border border-t opacity-50'
                                      key={`${message.id}-step-${index}`}
                                    />
                                  );
                                }

                                return null;
                              })}
                            </MessageContent>
                          </Message>

                          {message.role === 'assistant'
                            && isLastMessage
                            && assistantText
                            ? (
                                <MessageActions className='mt-2'>
                                  <MessageAction
                                    disabled={isStreaming}
                                    label='重新生成'
                                    onClick={regenerateLastReply}
                                    tooltip='重新生成'
                                  >
                                    <RefreshCcwIcon className='size-3' />
                                  </MessageAction>

                                  <MessageAction
                                    label='复制内容'
                                    onClick={() => handleCopy(message.id, assistantText)}
                                    tooltip='复制'
                                  >
                                    {copiedMessageId === message.id
                                      ? (
                                          <CheckIcon className='size-3' />
                                        )
                                      : (
                                          <CopyIcon className='size-3' />
                                        )}
                                  </MessageAction>
                                </MessageActions>
                              )
                            : null}
                        </div>
                      );
                    })}

                    {showAssistantThinkingBubble
                      ? (
                          <div>
                            <p className='mb-1 text-left text-muted-foreground text-xs'>
                              简历筛选助手 ·
                              {' '}
                              {timeFormatter.format(new Date())}
                            </p>
                            <Message from='assistant'>
                              <MessageContent className='px-0 py-1'>
                                <div
                                  aria-label='简历筛选助手正在思考'
                                  className='text-muted-foreground/80'
                                  role='status'
                                >
                                  <Shimmer duration={1.2}>思考中...</Shimmer>
                                </div>
                              </MessageContent>
                            </Message>
                          </div>
                        )
                      : null}
                  </>
                )}
          </ConversationContent>

          <ConversationScrollButton />
        </Conversation>
      </div>

      {error
        ? (
            <p aria-live='polite' className='mt-3 text-destructive text-sm'>
              请求失败。请检查 API 配置后重试。
            </p>
          )
        : null}

      {uploadErrorMessage
        ? (
            <p aria-live='polite' className='mt-2 text-destructive text-sm'>
              {uploadErrorMessage}
            </p>
          )
        : null}

      {historyErrorMessage
        ? (
            <p aria-live='polite' className='mt-2 text-destructive text-sm'>
              {historyErrorMessage}
            </p>
          )
        : null}

      <PromptInput
        accept='application/pdf'
        className='mt-1  **:data-[slot=input-group]:cursor-text **:data-[slot=input-group]:rounded-lg **:data-[slot=input-group]:border-border/65 **:data-[slot=input-group]:bg-white **:data-[slot=input-group]:shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]'
        onClick={(event) => {
          const target = event.target as HTMLElement;

          if (target.closest('button, a, input[type="file"], [role="menuitem"], [data-slot="select"]')) {
            return;
          }

          const textarea = event.currentTarget.querySelector('textarea');
          textarea?.focus();
        }}
        dragOverlay={(
          <div className='flex h-full w-full items-center justify-center rounded-[1.15rem] border-2 border-dashed border-primary/60 bg-white px-6 py-8 text-center transition-colors'>
            <div className='flex flex-col items-center gap-2'>
              <UploadIcon className='size-8 text-primary/50' />
              <p className='font-medium text-sm'>拖拽 PDF 简历到这里</p>
              <p className='text-muted-foreground text-xs'>支持多个文件，系统只会加入 PDF 格式的文件</p>
            </div>
          </div>
        )}
        dragOverlayClassName='bg-white rounded-lg'
        globalDrop
        maxFiles={8}
        maxFileSize={10 * 1024 * 1024}
        multiple
        onGlobalDropOutside={() => {
          toast.warning('请将简历拖拽到上传区域后再松开。');
        }}
        onError={({ code }) => {
          if (code === 'accept') {
            setUploadErrorMessage('仅支持上传 PDF 文件。');
            return;
          }

          if (code === 'max_file_size') {
            setUploadErrorMessage('单个 PDF 文件不能超过 10 MB。');
            return;
          }

          setUploadErrorMessage('最多上传 8 个 PDF 文件。');
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
            text: hasText ? trimmed : '请结合岗位要求分析这份简历并给出筛选建议。',
          });
          setInput('');
        }}
      >
        <UploadErrorReset onReset={() => setUploadErrorMessage(null)} />

        <PromptInputHeader>
          <ComposerAttachments />
        </PromptInputHeader>

        <PromptInputBody>
          <PromptInputTextarea
            autoComplete='off'
            className='min-h-20'
            onChange={event => setInput(event.currentTarget.value)}
            placeholder='输入岗位与筛选要求，或上传候选人 PDF 简历（支持多文件）…'
            value={input}
          />
        </PromptInputBody>

        <ComposerFooter
          downloadableMessages={downloadableMessages}
          hasJobDescription={hasJobDescription}
          input={input}
          onClearJobDescription={clearJobDescription}
          onOpenJobDescriptionSettings={openJobDescriptionDialog}
          status={status}
          stop={stop}
        />
      </PromptInput>

      <Dialog
        onOpenChange={setIsJobDescriptionDialogOpen}
        open={isJobDescriptionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>岗位描述（JD）设置</DialogTitle>
            <DialogDescription>
              这里填写的 JD 会作为简历评估的辅助上下文；若你在对话中明确给出 JD，模型会优先使用你在对话中提供的版本。
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2'>
            <label className='font-medium text-sm' htmlFor='job-description'>
              岗位描述内容
            </label>
            <textarea
              autoComplete='off'
              className='min-h-40 w-full mt-2 rounded-lg border border-border/70 bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
              id='job-description'
              name='jobDescription'
              onChange={event =>
                setJobDescriptionDraft(event.currentTarget.value)}
              placeholder='例如：前端开发岗位，要求 React/TypeScript 基础，有完整项目经历或相关工作/实习经验…'
              spellCheck={false}
              value={jobDescriptionDraft}
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                clearJobDescription();
                setIsJobDescriptionDialogOpen(false);
              }}
              type='button'
              variant='outline'
            >
              清空
            </Button>
            <Button onClick={saveJobDescription} type='button'>
              保存 JD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className='mt-2  hidden sm:flex items-center gap-1 px-1 text-muted-foreground text-xs'>
        <SparklesIcon className='size-3' />
        受限于当前服务器资源，目前连接仅能持续300秒，注意上传简历的文件大小。
      </p>

      <ResourceNoticeDialog />
    </div>
  );
}
