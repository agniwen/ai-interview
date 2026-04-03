'use client';

import type { Conversation as ElevenConversationType } from '@elevenlabs/client';
import type { InterviewConversationSnapshot } from '@/lib/interview-session';
import type { CandidateInterviewView } from '@/lib/interview/interview-record';
import { Conversation as VoiceConversation } from '@elevenlabs/client';
import {
  AudioLinesIcon,
  CalendarDaysIcon,
  HouseIcon,
  LoaderCircleIcon,
  MicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PhoneOffIcon,
  SparklesIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputBody, PromptInputFooter } from '@/components/ai-elements/prompt-input';
import { ElevenLabsQuota } from '@/components/interview/elevenlabs-quota';
import { InterviewQuotaNotice } from '@/components/interview/interview-quota-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Turn {
  id: string
  eventId?: number
  role: 'agent' | 'user'
  text: string
  createdAt: number
  source: string
  timeInCallSecs?: number
}

interface AudioDeviceOption {
  deviceId: string
  label: string
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const persistedEventIdPattern = /:event:(\d+)$/;

function compareTurns(a: Turn, b: Turn) {
  if (typeof a.eventId === 'number' && typeof b.eventId === 'number' && a.eventId !== b.eventId) {
    return a.eventId - b.eventId;
  }

  if (typeof a.eventId === 'number' && typeof b.eventId === 'number') {
    if (a.role !== b.role) {
      return a.role === 'user' ? -1 : 1;
    }

    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
  }

  if (typeof a.timeInCallSecs === 'number' && typeof b.timeInCallSecs === 'number' && a.timeInCallSecs !== b.timeInCallSecs) {
    return a.timeInCallSecs - b.timeInCallSecs;
  }

  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }

  return a.id.localeCompare(b.id);
}

function buildTurnEventKey(turn: Pick<Turn, 'role' | 'source' | 'eventId'>) {
  if (typeof turn.eventId !== 'number') {
    return null;
  }

  return `${turn.role}:${turn.source}:${turn.eventId}`;
}

function buildTurnId(turn: Pick<Turn, 'role' | 'source' | 'eventId'>, fallbackId: string) {
  return buildTurnEventKey(turn)
    ? `${turn.role}:${turn.source}:event:${turn.eventId}`
    : fallbackId;
}

function formatInterviewStage(statusText: string, modeText: string) {
  if (statusText === 'connecting') {
    return '正在接通';
  }

  if (statusText === 'disconnecting') {
    return '正在结束';
  }

  if (statusText !== 'connected') {
    return '等待开始';
  }

  return modeText === 'speaking' ? 'AI 追问中' : '候选人作答中';
}

function formatStatusSummary(statusText: string) {
  switch (statusText) {
    case 'connected':
      return '通话进行中';
    case 'connecting':
      return '正在建立连接';
    case 'disconnecting':
      return '正在结束面试';
    default:
      return '尚未开始';
  }
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return '待定';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function LevelBar({
  label,
  value,
  colorClassName,
  isActive,
}: {
  label: string
  value: number
  colorClassName: string
  isActive: boolean
}) {
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between text-muted-foreground text-xs'>
        <span>{label}</span>
        <span>{isActive ? `${Math.round(value * 100)}%` : '--'}</span>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-muted/70'>
        <div
          className={cn('h-full rounded-full transition-[width] duration-150', colorClassName)}
          style={{ width: isActive ? `${Math.max(6, value * 100)}%` : '0%' }}
        />
      </div>
    </div>
  );
}

function formatMessageTime(createdAt: number) {
  return timeFormatter.format(new Date(createdAt));
}

function formatResumeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || '未发现信息';
}

function formatResumeList(values: string[], limit?: number) {
  const normalized = values
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, limit);

  return normalized.length > 0 ? normalized.join('、') : '未发现信息';
}

function buildCandidateProfileVariable(interviewRecord: CandidateInterviewView) {
  const { resumeProfile } = interviewRecord;

  if (!resumeProfile) {
    return `姓名：${interviewRecord.candidateName}\n目标岗位：${formatResumeText(interviewRecord.targetRole)}`;
  }

  const workHighlights = resumeProfile.workExperiences
    .slice(0, 3)
    .map((experience, index) => `${index + 1}. ${formatResumeText(experience.company)}｜${formatResumeText(experience.role)}｜${formatResumeText(experience.summary)}`)
    .join('\n');
  const projectHighlights = resumeProfile.projectExperiences
    .slice(0, 3)
    .map((experience, index) => `${index + 1}. ${formatResumeText(experience.name)}｜${formatResumeText(experience.role)}｜${formatResumeText(experience.summary)}`)
    .join('\n');

  return `姓名：${formatResumeText(resumeProfile.name)}
目标岗位：${formatResumeList(resumeProfile.targetRoles, 4)}
工作年限：${resumeProfile.workYears ?? '未发现信息'}
年龄：${resumeProfile.age ?? '未发现信息'}
性别：${formatResumeText(resumeProfile.gender)}
核心技能：${formatResumeList(resumeProfile.skills, 10)}
毕业院校：${formatResumeList(resumeProfile.schools, 4)}
个人优势：${formatResumeList(resumeProfile.personalStrengths, 6)}

工作经历：
${workHighlights || '未发现信息'}

项目经历：
${projectHighlights || '未发现信息'}`;
}

function buildInterviewQuestionsVariable(interviewRecord: CandidateInterviewView) {
  return interviewRecord.interviewQuestions
    .map(question => `${question.order}. [${question.difficulty}] ${question.question}`)
    .join('\n');
}

function toClientTurn(turn: InterviewConversationSnapshot['turns'][number]): Turn {
  const eventIdMatch = turn.id.match(persistedEventIdPattern);

  return {
    id: turn.id,
    ...(eventIdMatch ? { eventId: Number(eventIdMatch[1]) } : {}),
    role: turn.role,
    text: turn.message,
    createdAt: new Date(turn.createdAt).getTime(),
    source: turn.source,
    ...(typeof turn.timeInCallSecs === 'number' ? { timeInCallSecs: turn.timeInCallSecs } : {}),
  };
}

function pickMessage(event: unknown): Omit<Turn, 'id' | 'createdAt'> | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const value = event as Record<string, unknown>;

  if (typeof value.source === 'string' && typeof value.message === 'string') {
    return {
      role: value.source === 'user' ? 'user' : 'agent',
      source: 'conversation_message',
      text: value.message,
      ...(typeof value.event_id === 'number' ? { eventId: value.event_id } : {}),
    };
  }

  if (value.type === 'user_transcript') {
    const transcript = (value.user_transcription_event as { user_transcript?: unknown } | undefined)?.user_transcript;

    if (typeof transcript === 'string' && transcript.trim()) {
      return {
        role: 'user',
        source: 'user_transcript',
        text: transcript,
        ...(typeof (value.user_transcription_event as { event_id?: unknown }).event_id === 'number'
          ? { eventId: (value.user_transcription_event as { event_id: number }).event_id }
          : {}),
        ...(typeof value.user_transcription_event === 'object' && value.user_transcription_event
          ? {
              timeInCallSecs:
                typeof (value.user_transcription_event as { time_in_call_secs?: unknown }).time_in_call_secs === 'number'
                  ? (value.user_transcription_event as { time_in_call_secs: number }).time_in_call_secs
                  : undefined,
            }
          : {}),
      };
    }
  }

  if (value.type === 'agent_response') {
    const response = (value.agent_response_event as { agent_response?: unknown } | undefined)?.agent_response;

    if (typeof response === 'string' && response.trim()) {
      return {
        role: 'agent',
        source: 'agent_response',
        text: response,
        ...(typeof (value.agent_response_event as { event_id?: unknown }).event_id === 'number'
          ? { eventId: (value.agent_response_event as { event_id: number }).event_id }
          : {}),
      };
    }
  }

  return null;
}

export default function InterviewPageClient() {
  const { id: interviewId } = useParams<{ id: string }>();
  const conversationRef = useRef<ElevenConversationType | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const seenEventKeysRef = useRef<Set<string>>(new Set());
  const sessionStorageKey = `interview-session:${interviewId}`;
  const [interviewRecord, setInterviewRecord] = useState<CandidateInterviewView | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [statusText, setStatusText] = useState('disconnected');
  const [modeText, setModeText] = useState('listening');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.sessionStorage.getItem(sessionStorageKey);
  });
  const [sessionSnapshot, setSessionSnapshot] = useState<InterviewConversationSnapshot | null>(null);
  const [isPollingSessionSnapshot, setIsPollingSessionSnapshot] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('default');
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [inputLevel, setInputLevel] = useState(0.08);
  const [outputLevel, setOutputLevel] = useState(0.08);

  const isConnected = statusText === 'connected';
  const showExpandedSidebar = !isSidebarCollapsed || isMobileSidebarOpen;
  const interviewStage = formatInterviewStage(statusText, modeText);
  const connectionSummary = formatStatusSummary(statusText);
  const analysisStatusText = useMemo(() => {
    if (!activeConversationId) {
      return '未开始';
    }

    if (sessionSnapshot?.webhookReceivedAt || sessionSnapshot?.status === 'done') {
      return '分析完成';
    }

    if (statusText === 'disconnected') {
      return isPollingSessionSnapshot ? '正在等待分析结果' : '等待同步';
    }

    return '通话中';
  }, [activeConversationId, isPollingSessionSnapshot, sessionSnapshot, statusText]);

  const selectedDeviceLabel = useMemo(() => {
    if (selectedInputDeviceId === 'default') {
      return '系统默认麦克风';
    }

    return audioDevices.find(device => device.deviceId === selectedInputDeviceId)?.label ?? '已选设备';
  }, [audioDevices, selectedInputDeviceId]);

  const orderedTurns = useMemo(
    () => turns.toSorted(compareTurns),
    [turns],
  );

  const latestAgentTurn = useMemo(
    () => orderedTurns.toReversed().find(turn => turn.role === 'agent') ?? null,
    [orderedTurns],
  );

  const latestUserTurn = useMemo(
    () => orderedTurns.toReversed().find(turn => turn.role === 'user') ?? null,
    [orderedTurns],
  );

  const resumeSummary = useMemo(() => {
    if (!interviewRecord?.resumeProfile) {
      return '本次面试将基于后台维护的候选人信息进行。';
    }

    return `${interviewRecord.resumeProfile.name} · ${interviewRecord.resumeProfile.targetRoles[0] ?? interviewRecord.targetRole ?? '待识别岗位'} · ${interviewRecord.interviewQuestions.length} 道题`;
  }, [interviewRecord]);

  const latestSummaryText = sessionSnapshot?.transcriptSummary ?? '面试结束后，这里会显示通话总结。';

  const setPersistedConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);

    if (typeof window === 'undefined') {
      return;
    }

    if (conversationId) {
      window.sessionStorage.setItem(sessionStorageKey, conversationId);
    }
    else {
      window.sessionStorage.removeItem(sessionStorageKey);
    }
  }, [sessionStorageKey]);

  const applySessionSnapshot = useCallback((snapshot: InterviewConversationSnapshot | null) => {
    setSessionSnapshot(snapshot);

    if (!snapshot) {
      seenEventKeysRef.current = new Set();
      setTurns([]);
      return;
    }

    const nextTurns = snapshot.turns.map(toClientTurn);
    seenEventKeysRef.current = new Set(
      nextTurns
        .map(turn => buildTurnEventKey(turn))
        .filter((eventKey): eventKey is string => typeof eventKey === 'string'),
    );
    setTurns(nextTurns);
  }, []);

  const fetchSessionSnapshot = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/interview/${interviewId}/session/${conversationId}`, { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as (InterviewConversationSnapshot & { error?: string }) | null;

    if (!response.ok || !payload || 'error' in payload) {
      throw new Error(payload?.error ?? '会话记录暂不可用');
    }

    applySessionSnapshot(payload);
    return payload;
  }, [applySessionSnapshot, interviewId]);

  const syncSession = useCallback(async (payload: {
    conversationId?: string | null
    status?: string
    mode?: string
    error?: string
    turn?: {
      id: string
      eventId?: number
      role: 'agent' | 'user'
      text: string
      source: string
      createdAt: number
      timeInCallSecs?: number
    }
  }) => {
    const conversationId = payload.conversationId ?? activeConversationIdRef.current;

    if (!conversationId) {
      return null;
    }

    try {
      const response = await fetch(`/api/interview/${interviewId}/session-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.mode ? { mode: payload.mode } : {}),
          ...(payload.error ? { error: payload.error } : {}),
          ...(payload.turn ? { turn: payload.turn } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error('会话同步失败');
      }

      const body = (await response.json().catch(() => null)) as { snapshot?: InterviewConversationSnapshot | null } | null;

      if (body?.snapshot) {
        setSessionSnapshot(body.snapshot);
      }

      return body?.snapshot ?? null;
    }
    catch (error) {
      console.error(error);
      return null;
    }
  }, [interviewId]);

  const stopMeterLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startMeterLoop = useCallback((session: ElevenConversationType) => {
    stopMeterLoop();

    const tick = () => {
      const nextInputLevel = Math.min(1, Math.max(0.06, session.getInputVolume() ** 0.65 * 2.2));
      const nextOutputLevel = Math.min(1, Math.max(0.06, session.getOutputVolume() ** 0.65 * 2.2));

      setInputLevel(nextInputLevel);
      setOutputLevel(nextOutputLevel);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [stopMeterLoop]);

  const loadAudioDevices = useCallback(async (requestPermission: boolean) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true);
        stream.getTracks().forEach(track => track.stop());
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextAudioDevices = devices
        .filter(device => device.kind === 'audioinput' && Boolean(device.deviceId))
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `麦克风 ${index + 1}`,
        }));

      setAudioDevices(nextAudioDevices);

      if (
        selectedInputDeviceId !== 'default'
        && !nextAudioDevices.some(device => device.deviceId === selectedInputDeviceId)
      ) {
        setSelectedInputDeviceId('default');
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '无法读取麦克风设备';
      setErrorText(message);
    }
  }, [selectedInputDeviceId]);

  useEffect(() => {
    let isMounted = true;

    async function loadInterviewRecord() {
      setIsLoadingRecord(true);
      setErrorText(null);

      try {
        const response = await fetch(`/api/interview/${interviewId}`, { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as (CandidateInterviewView & { error?: string }) | null;

        if (!response.ok || !payload || 'error' in payload) {
          throw new Error(payload?.error ?? '面试记录不可用');
        }

        if (isMounted) {
          setInterviewRecord(payload);
        }
      }
      catch (error) {
        if (isMounted) {
          setInterviewRecord(null);
          setErrorText(error instanceof Error ? (error.message === 'Interview not available.' ? '当前面试链接不可用。' : error.message) : '面试记录不可用');
        }
      }
      finally {
        if (isMounted) {
          setIsLoadingRecord(false);
        }
      }
    }

    void loadInterviewRecord();
    return () => {
      isMounted = false;
    };
  }, [interviewId]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || sessionSnapshot || turns.length > 0) {
      return;
    }

    void fetchSessionSnapshot(activeConversationId).catch(() => {
      setPersistedConversationId(null);
      applySessionSnapshot(null);
    });
  }, [activeConversationId, applySessionSnapshot, fetchSessionSnapshot, sessionSnapshot, setPersistedConversationId, turns.length]);

  useEffect(() => {
    void loadAudioDevices(false);

    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void loadAudioDevices(false);
    };

    mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadAudioDevices]);

  useEffect(() => {
    return () => {
      stopMeterLoop();
      conversationRef.current?.endSession().catch(() => undefined);
    };
  }, [stopMeterLoop]);

  useEffect(() => {
    if (!activeConversationId || statusText !== 'disconnected') {
      return;
    }

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollSnapshot = async () => {
      if (isCancelled) {
        return;
      }

      setIsPollingSessionSnapshot(true);

      try {
        const snapshot = await fetchSessionSnapshot(activeConversationId);

        if (snapshot.webhookReceivedAt || snapshot.status === 'done' || snapshot.status === 'failed') {
          setIsPollingSessionSnapshot(false);
          return;
        }
      }
      catch {
      }

      if (!isCancelled) {
        timer = setTimeout(pollSnapshot, 3000);
      }
    };

    void pollSnapshot();

    return () => {
      isCancelled = true;
      setIsPollingSessionSnapshot(false);

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeConversationId, fetchSessionSnapshot, statusText]);

  async function startInterview() {
    if (conversationRef.current) {
      return;
    }

    if (!interviewRecord) {
      toast.warning('当前面试链接不可用，无法开始面试。');
      return;
    }

    setErrorText(null);
    setTurns([]);
    seenEventKeysRef.current = new Set();
    applySessionSnapshot(null);
    setPersistedConversationId(null);
    setStatusText('connecting');
    setInputLevel(0.08);
    setOutputLevel(0.08);

    try {
      const constraints = selectedInputDeviceId !== 'default'
        ? { audio: { deviceId: { exact: selectedInputDeviceId } } }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setHasMicPermission(true);
      stream.getTracks().forEach(track => track.stop());
      await loadAudioDevices(false);

      const tokenResponse = await fetch(`/api/interview/${interviewId}/token`, { cache: 'no-store' });

      if (!tokenResponse.ok) {
        const payload = (await tokenResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? '无法开始面试');
      }

      const tokenPayload = (await tokenResponse.json()) as { token: string };
      let connectedDuringSetup = false;
      const candidateProfileVariable = buildCandidateProfileVariable(interviewRecord);
      const interviewQuestionsVariable = buildInterviewQuestionsVariable(interviewRecord);

      const session = await VoiceConversation.startSession({
        connectionType: 'webrtc',
        conversationToken: tokenPayload.token,
        dynamicVariables: {
          user_name: interviewRecord.candidateName,
          interview_record_id: interviewRecord.id,
          candidate_profile: candidateProfileVariable,
          interview_questions: interviewQuestionsVariable,
        },
        inputDeviceId: selectedInputDeviceId === 'default' ? undefined : selectedInputDeviceId,
        onConnect: () => {
          setStatusText('connected');
          connectedDuringSetup = true;

          if (conversationRef.current) {
            startMeterLoop(conversationRef.current);
          }
        },
        onDisconnect: () => {
          setStatusText('disconnected');
          conversationRef.current = null;
          stopMeterLoop();
          setInputLevel(0.08);
          setOutputLevel(0.08);
          void syncSession({ status: 'disconnected' });
        },
        onError: (error) => {
          const message = typeof error === 'string' ? error : '会话异常';
          setErrorText(message);
          void syncSession({ error: message });
        },
        onMessage: (event) => {
          const picked = pickMessage(event);

          if (!picked || !picked.text.trim()) {
            return;
          }

          const eventKey = buildTurnEventKey(picked);

          if (eventKey) {
            if (seenEventKeysRef.current.has(eventKey)) {
              return;
            }

            seenEventKeysRef.current.add(eventKey);
          }

          const nextTurn = {
            id: buildTurnId(picked, `${Date.now()}-${crypto.randomUUID()}`),
            createdAt: Date.now(),
            ...picked,
          } satisfies Turn;

          setTurns(previous => [
            ...previous,
            nextTurn,
          ]);

          void syncSession({
            turn: {
              id: nextTurn.id,
              ...(typeof nextTurn.eventId === 'number' ? { eventId: nextTurn.eventId } : {}),
              role: nextTurn.role,
              text: nextTurn.text,
              source: nextTurn.source,
              createdAt: nextTurn.createdAt,
              ...(typeof nextTurn.timeInCallSecs === 'number' ? { timeInCallSecs: nextTurn.timeInCallSecs } : {}),
            },
          });
        },
        onModeChange: ({ mode }) => {
          setModeText(mode);
          void syncSession({ mode });
        },
        onStatusChange: ({ status }) => {
          setStatusText(status);
          void syncSession({ status });
        },
      });

      conversationRef.current = session;
      const nextConversationId = session.getId();
      setPersistedConversationId(nextConversationId);

      await syncSession({
        conversationId: nextConversationId,
        status: connectedDuringSetup || session.isOpen() ? 'connected' : 'connecting',
        mode: modeText,
      });

      if (connectedDuringSetup || session.isOpen()) {
        startMeterLoop(session);
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '启动面试失败';
      setErrorText(message);
      setStatusText('disconnected');
      stopMeterLoop();
    }
  }

  async function stopInterview() {
    const activeConversation = conversationRef.current;

    if (!activeConversation) {
      return;
    }

    setStatusText('disconnecting');
    void syncSession({ status: 'disconnecting' });

    try {
      await activeConversation.endSession();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '结束面试失败';
      setErrorText(message);
    }
    finally {
      conversationRef.current = null;
      setStatusText('disconnected');
      stopMeterLoop();
      setInputLevel(0.08);
      setOutputLevel(0.08);
      void syncSession({ status: 'disconnected' });
    }
  }

  return (
    <div className='flex h-screen min-h-screen w-full min-w-0 flex-col overflow-hidden bg-transparent'>
      <div className='grid min-h-0 flex-1 overflow-hidden bg-transparent sm:grid-cols-[auto_minmax(0,1fr)]'>
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-[min(82vw,20rem)] shrink-0 flex-col overflow-hidden border-r border-border/75 bg-card/95 shadow-[0_14px_36px_-32px_rgba(52,96,168,0.6)] backdrop-blur-sm transition-transform duration-200 sm:static sm:z-auto sm:bg-card/80 sm:transition-[width]',
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
            isSidebarCollapsed ? 'sm:w-14' : 'sm:w-72',
          )}
          id='interview-sidebar'
        >
          <div className='flex items-center gap-1 border-border/65 border-b px-2 py-2'>
            <Button
              aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
              className='hidden sm:inline-flex'
              onClick={() => setIsSidebarCollapsed(value => !value)}
              size='icon'
              type='button'
              variant='ghost'
            >
              {isSidebarCollapsed
                ? <PanelLeftOpenIcon className='size-4' />
                : <PanelLeftCloseIcon className='size-4' />}
            </Button>

            {showExpandedSidebar
              ? (
                  <>
                    <p className='truncate font-medium text-sm'>候选人信息</p>
                    <Button asChild className='ml-auto' size='icon' type='button' variant='ghost'>
                      <Link aria-label='返回首页' href='/'>
                        <HouseIcon className='size-4' />
                      </Link>
                    </Button>
                    <Button
                      className='hidden sm:flex'
                      onClick={() => void loadAudioDevices(true)}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      <AudioLinesIcon className='mr-1 size-3.5' />
                      检测
                    </Button>
                  </>
                )
              : null}

            <Button
              aria-label='关闭侧边栏'
              className={cn(showExpandedSidebar ? 'sm:hidden' : 'ml-auto sm:hidden')}
              onClick={() => setIsMobileSidebarOpen(false)}
              size='icon'
              type='button'
              variant='ghost'
            >
              <PanelLeftCloseIcon className='size-4' />
            </Button>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto px-3 py-3'>
            {!showExpandedSidebar
              ? null
              : (
                  <>
                    <section className='border-border/60 border-b py-3'>
                      <p className='mb-3 font-medium text-sm'>候选人概览</p>

                      {isLoadingRecord
                        ? <div className='h-28 animate-pulse rounded-xl bg-muted' />
                        : interviewRecord
                          ? (
                              <div className='grid gap-2 text-xs'>
                                <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                                  <p className='truncate font-medium text-sm'>{interviewRecord.candidateName}</p>
                                  <p className='mt-1 text-muted-foreground'>
                                    {interviewRecord.targetRole ?? '待识别岗位'}
                                  </p>
                                </div>
                                <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                                  <p className='text-muted-foreground'>当前轮次</p>
                                  <p className='mt-1 font-medium text-sm'>{interviewRecord.currentRoundLabel ?? '待安排'}</p>
                                  <p className='mt-1 text-muted-foreground'>{formatDateTime(interviewRecord.currentRoundTime)}</p>
                                </div>
                                <div className='rounded-lg border border-border/60 bg-background/60 px-3 py-2'>
                                  <p className='text-muted-foreground'>候选人摘要</p>
                                  <p className='mt-1 text-sm leading-relaxed'>{resumeSummary}</p>
                                </div>
                              </div>
                            )
                          : (
                              <div className='rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive'>
                                当前链接对应的面试记录不可用。
                              </div>
                            )}
                    </section>

                    <section className='border-border/60 border-b py-3'>
                      <p className='mb-3 font-medium text-sm'>音频设备</p>

                      <Select onValueChange={setSelectedInputDeviceId} value={selectedInputDeviceId}>
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder='选择麦克风' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='default'>系统默认麦克风</SelectItem>
                          {audioDevices.map(device => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <p className='mt-3 text-muted-foreground text-xs leading-relaxed'>
                        开始面试时会自动请求麦克风权限；如果设备名没有刷新出来，重新点一次“检测”即可。
                      </p>
                    </section>

                    <ElevenLabsQuota />

                    <section className='border-border/60 border-b py-3'>
                      <p className='mb-3 font-medium text-sm'>当前状态</p>
                      <div className='grid gap-2'>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>面试阶段</p>
                          <p className='mt-1 font-medium text-sm'>{interviewStage}</p>
                        </div>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>通话状态</p>
                          <p className='mt-1 font-medium text-sm'>{connectionSummary}</p>
                        </div>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>分析状态</p>
                          <p className='mt-1 font-medium text-sm'>{analysisStatusText}</p>
                        </div>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>当前设备</p>
                          <p className='mt-1 truncate font-medium text-sm'>{selectedDeviceLabel}</p>
                        </div>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>权限状态</p>
                          <p className='mt-1 font-medium text-sm'>{hasMicPermission ? '已获取麦克风权限' : '开始时请求权限'}</p>
                        </div>
                        <div className='px-1 py-1'>
                          <p className='text-muted-foreground text-[11px]'>记录条数</p>
                          <p className='mt-1 font-medium text-sm'>
                            {turns.length}
                            {' '}
                            条
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className='py-3'>
                      <p className='mb-3 font-medium text-sm'>对话摘要</p>
                      <div className='space-y-3'>
                        <div>
                          <p className='text-muted-foreground text-[11px]'>会话编号</p>
                          <p className='mt-1 break-all text-sm leading-6'>
                            {activeConversationId ?? '开始面试后自动生成'}
                          </p>
                        </div>
                        <div>
                          <p className='text-muted-foreground text-[11px]'>最终总结</p>
                          <p className='mt-1 text-sm leading-6'>
                            {latestSummaryText}
                          </p>
                        </div>
                        {sessionSnapshot?.callSuccessful
                          ? (
                              <div>
                                <p className='text-muted-foreground text-[11px]'>通话判定</p>
                                <p className='mt-1 text-sm leading-6'>{sessionSnapshot.callSuccessful}</p>
                              </div>
                            )
                          : null}
                        <div>
                          <p className='text-muted-foreground text-[11px]'>最近一条追问</p>
                          <p className='mt-1 text-sm leading-6'>
                            {latestAgentTurn?.text ?? '开始后这里会显示最近一条面试官追问。'}
                          </p>
                        </div>
                        <div>
                          <p className='text-muted-foreground text-[11px]'>最近一条作答</p>
                          <p className='mt-1 text-sm leading-6'>
                            {latestUserTurn?.text ?? '候选人开口后，这里会显示最近一条回答。'}
                          </p>
                        </div>
                      </div>
                    </section>
                  </>
                )}
          </div>

          <div className='border-border/65 border-t px-3 py-3'>
            {showExpandedSidebar
              ? <p className='text-muted-foreground text-xs leading-relaxed'>本页面已直接加载后台维护的候选人信息，无需重新上传简历。</p>
              : null}
          </div>
        </aside>

        <section className='flex min-h-0 flex-col bg-transparent'>
          <div className='mx-auto flex h-full w-full max-w-5xl min-w-0 flex-col px-1 pb-2 pt-4 sm:px-2 sm:pb-4 sm:pt-6'>
            <header className='px-1'>
              <div className='mb-2 flex items-center gap-2 sm:hidden'>
                <Button
                  aria-controls='interview-sidebar'
                  aria-expanded={isMobileSidebarOpen}
                  onClick={() => setIsMobileSidebarOpen(true)}
                  size='sm'
                  type='button'
                  variant='outline'
                >
                  <PanelLeftOpenIcon className='mr-1 size-4' />
                  设置
                </Button>
              </div>

              <div className='flex flex-wrap items-center gap-3'>
                <h1 className='pixel-title text-balance font-bold tracking-tight text-2xl sm:text-3xl'>AI 面试</h1>
                {interviewRecord ? <Badge variant='secondary'>{interviewRecord.currentRoundLabel ?? '待安排轮次'}</Badge> : null}
              </div>
              <p className='mt-2 max-w-3xl font-serif! text-xs text-muted-foreground sm:text-sm'>
                {interviewRecord
                  ? `${interviewRecord.candidateName} · ${interviewRecord.targetRole ?? '待识别岗位'} · ${formatDateTime(interviewRecord.currentRoundTime)}`
                  : isLoadingRecord
                    ? '系统正在确认当前面试链接对应的候选人信息。'
                    : '当前链接对应的面试记录不可用。'}
              </p>
            </header>

            <div className='relative mt-4 min-h-0 flex-1 overflow-hidden'>
              <Conversation className='h-full'>
                <ConversationContent className='gap-6 px-0 py-4 sm:py-6'>
                  {turns.length === 0
                    ? (
                        <ConversationEmptyState
                          className='my-10 rounded-2xl border border-dashed border-border/70 bg-background/70'
                          description={interviewRecord ? '点击下方“开始面试”后，这里会依次显示面试官追问与候选人回答。' : '当前链接不可用时无法开始面试。'}
                          icon={isLoadingRecord ? <LoaderCircleIcon className='size-5 animate-spin' /> : <SparklesIcon className='size-5' />}
                          title={interviewRecord ? '准备开始一轮面试' : isLoadingRecord ? '正在加载面试信息' : '面试链接不可用'}
                        />
                      )
                    : orderedTurns.map(turn => (
                        <div key={turn.id}>
                          <p
                            className={cn(
                              'mb-1 text-muted-foreground text-xs',
                              turn.role === 'user' ? 'text-right' : 'text-left',
                            )}
                          >
                            {turn.role === 'agent' ? '面试官' : '候选人'}
                            {' · '}
                            {formatMessageTime(turn.createdAt)}
                          </p>

                          <Message from={turn.role === 'agent' ? 'assistant' : 'user'}>
                            <MessageContent>
                              <MessageResponse>{turn.text}</MessageResponse>
                            </MessageContent>
                          </Message>
                        </div>
                      ))}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>

            <div className='mt-4 px-1'>
              <PromptInput
                className='**:data-[slot=input-group]:rounded-lg **:data-[slot=input-group]:border-border/65 **:data-[slot=input-group]:bg-white **:data-[slot=input-group]:shadow-[0_8px_18px_-20px_rgba(60,44,23,0.5)]'
                onSubmit={() => undefined}
              >
                <PromptInputBody>
                  <div className='w-full px-3 pb-2 pt-3'>
                    <div className='grid gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm sm:grid-cols-3'>
                      <div>
                        <p className='text-muted-foreground text-xs'>候选人</p>
                        <p className='mt-1 font-medium'>{interviewRecord?.candidateName ?? '加载中'}</p>
                      </div>
                      <div>
                        <p className='text-muted-foreground text-xs'>岗位方向</p>
                        <p className='mt-1 font-medium'>{interviewRecord?.targetRole ?? '待识别岗位'}</p>
                      </div>
                      <div>
                        <p className='flex items-center gap-1 text-muted-foreground text-xs'>
                          <CalendarDaysIcon className='size-3.5' />
                          当前轮次时间
                        </p>
                        <p className='mt-1 font-medium'>{formatDateTime(interviewRecord?.currentRoundTime)}</p>
                      </div>
                    </div>

                    <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                      <LevelBar colorClassName='bg-sky-500' isActive={isConnected} label='候选人音量' value={inputLevel} />
                      <LevelBar colorClassName='bg-amber-500' isActive={isConnected} label='面试官音量' value={outputLevel} />
                    </div>
                  </div>
                </PromptInputBody>

                <PromptInputFooter className='px-3 pb-3 pt-1'>
                  <p className='text-muted-foreground text-xs'>开始后系统会自动监听发言节奏，并把内容同步整理到上方记录区。</p>

                  <div className='flex items-center gap-2'>
                    <Button
                      disabled={!interviewRecord || isConnected || statusText === 'connecting' || isLoadingRecord}
                      onClick={startInterview}
                      type='button'
                    >
                      <MicIcon className='size-4' />
                      开始面试
                    </Button>
                    <Button
                      disabled={!isConnected}
                      onClick={stopInterview}
                      type='button'
                      variant='outline'
                    >
                      <PhoneOffIcon className='size-4' />
                      结束面试
                    </Button>
                  </div>
                </PromptInputFooter>
              </PromptInput>

              {errorText
                ? (
                    <p aria-live='polite' className='mt-2 px-1 text-destructive text-sm'>
                      {errorText}
                    </p>
                  )
                : null}
            </div>
          </div>
        </section>
      </div>

      <InterviewQuotaNotice />
    </div>
  );
}
