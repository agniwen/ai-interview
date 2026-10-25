"use client";

import { IconCopy, IconDownload, IconMessage2, IconPlayerPlayFilled } from "@tabler/icons-react";
import type { PersistedInterviewTurn } from "@app/db-schema/interview-session";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { RecruitmentCopilotMark } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyTextToClipboard } from "@/lib/client/clipboard";
import { coalescePersistedInterviewTurns } from "@app/shared/interview-transcript-turns";
import type { DisplayInterviewTurn } from "@app/shared/interview-transcript-turns";
import { cn } from "@app/shared/utils";
import { CandidateAvatarImage } from "../../candidate-avatar-image";
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
import { useRecordingPlayback, useRecordingPlaybackStore } from "./recording-playback";
import { buildTranscriptText, findPlaybackTurnId, formatCallTime } from "./transcript-format";
import type { TranscriptSpeakerLabels } from "./transcript-format";

const INTERVIEWER_LABEL = "AI 面试官";
const CANDIDATE_ROLE_LABEL = "候选人";
// 与详情页头部一致：没有姓名时用同一个种子生成人像。
// Matches the detail header: the same seed picks the portrait when there is no name.
const UNNAMED_CANDIDATE_AVATAR_SEED = "未命名候选人";

/** 招聘台简历记录的候选人头像来源；没有时显示按姓名生成的人像。 */
export interface TranscriptCandidateAvatar {
  recordId: string;
  version: string | null;
}
// 用户手动滚动后的这段时间内，播放不再自动把当前句滚入视野。
// After a manual scroll, playback stops auto-following for this long.
const MANUAL_SCROLL_FOLLOW_PAUSE_MS = 4000;

function resolveSpeakerLabels(candidateName?: string | null): TranscriptSpeakerLabels {
  return {
    candidate: candidateName?.trim() || CANDIDATE_ROLE_LABEL,
    interviewer: INTERVIEWER_LABEL,
  };
}

function TurnTime({
  onSeek,
  turn,
}: {
  onSeek?: (secs: number) => void;
  turn: DisplayInterviewTurn;
}) {
  const secs = turn.timeInCallSecs;
  const absoluteTime = <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={turn.createdAt} />;

  if (secs === null || secs === undefined) {
    return <span className="ml-auto shrink-0 text-muted-foreground text-xs">{absoluteTime}</span>;
  }

  const callTime = formatCallTime(secs);
  const trigger = onSeek ? (
    <Button
      aria-label={`从 ${callTime} 开始播放录像`}
      className="ml-auto shrink-0 text-muted-foreground tabular-nums hover:text-foreground"
      onClick={() => onSeek(secs)}
      size="xs"
      variant="ghost"
    >
      <IconPlayerPlayFilled className="size-3" />
      {callTime}
    </Button>
  ) : (
    <span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">{callTime}</span>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{absoluteTime}</TooltipContent>
    </Tooltip>
  );
}

function TranscriptTurn({
  candidateAvatar,
  candidateAvatarSeed,
  enabledCategories,
  isEvidenceActive,
  isPlaybackActive,
  labels,
  onSeek,
  rowRef,
  turn,
}: {
  candidateAvatar?: TranscriptCandidateAvatar | null;
  candidateAvatarSeed: string;
  enabledCategories: ReturnType<typeof useKeywordHighlight>["enabledCategories"];
  isEvidenceActive: boolean;
  isPlaybackActive: boolean;
  labels: TranscriptSpeakerLabels;
  onSeek?: (secs: number) => void;
  rowRef: (node: HTMLDivElement | null) => void;
  turn: DisplayInterviewTurn;
}) {
  const isCandidate = turn.role === "user";
  const speaker = isCandidate ? labels.candidate : labels.interviewer;
  const showRoleTag = isCandidate && speaker !== CANDIDATE_ROLE_LABEL;

  return (
    <div
      aria-current={isPlaybackActive ? "time" : undefined}
      className={cn(
        "relative flex gap-3 rounded-lg px-2 py-2.5 transition-colors",
        isPlaybackActive && "bg-primary/5",
        isEvidenceActive && "ring-2 ring-primary/40 ring-inset",
      )}
      data-playback-active={isPlaybackActive || undefined}
      ref={rowRef}
    >
      {isPlaybackActive ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      {isCandidate ? (
        <Avatar
          aria-hidden="true"
          className="mt-0.5 ring-1 ring-border"
          seed={candidateAvatarSeed}
          size="sm"
        >
          {candidateAvatar ? (
            <CandidateAvatarImage
              recordId={candidateAvatar.recordId}
              source="resumes"
              version={candidateAvatar.version}
            />
          ) : null}
        </Avatar>
      ) : (
        <RecruitmentCopilotMark className="mt-0.5 size-6" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-2">
          <span className="truncate font-medium text-foreground text-sm">{speaker}</span>
          {showRoleTag ? (
            <span className="shrink-0 text-muted-foreground text-xs">{CANDIDATE_ROLE_LABEL}</span>
          ) : null}
          <TurnTime onSeek={onSeek} turn={turn} />
        </div>
        <div className="mt-0.5 text-foreground/90 text-sm leading-relaxed">
          {isCandidate ? (
            <HighlightedText enabledCategories={enabledCategories} text={turn.message} />
          ) : (
            <MarkdownView content={turn.message} />
          )}
        </div>
      </div>
    </div>
  );
}

interface ConversationTranscriptProps {
  turns: PersistedInterviewTurn[];
  activeTurnIndex?: number | null;
  candidateAvatar?: TranscriptCandidateAvatar | null;
  candidateName?: string | null;
  className?: string;
  /**
   * "contained"：自带滚动区（需外层给定高度）；"flow"：随外层容器一起滚动，避免出现两条滚动条。
   * "contained" scrolls itself (needs a bounded height); "flow" scrolls with its container so
   * there is only one scrollbar.
   */
  scroll?: "contained" | "flow";
}

export function ConversationTranscript({
  turns,
  activeTurnIndex,
  candidateAvatar,
  candidateName,
  className,
  scroll = "contained",
}: ConversationTranscriptProps) {
  const turnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const turnRefsById = useRef<Record<string, HTMLDivElement | null>>({});
  const lastManualScrollAtRef = useRef(0);
  const displayTurns = useMemo(() => coalescePersistedInterviewTurns(turns), [turns]);
  const { enabledCategories } = useKeywordHighlight();
  const playbackStore = useRecordingPlaybackStore();
  const canSeek = useRecordingPlayback((state) => state.available);
  const isPlaying = useRecordingPlayback((state) => state.playing);
  const playbackTurnId = useRecordingPlayback((state) =>
    findPlaybackTurnId(displayTurns, state.currentTimeSecs),
  );
  const labels = resolveSpeakerLabels(candidateName);
  const candidateAvatarSeed = candidateName?.trim() || UNNAMED_CANDIDATE_AVATAR_SEED;

  useEffect(() => {
    if (activeTurnIndex === null || activeTurnIndex === undefined) {
      return;
    }
    turnRefs.current[activeTurnIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTurnIndex]);

  useEffect(() => {
    if (!isPlaying || !playbackTurnId) {
      return;
    }
    if (Date.now() - lastManualScrollAtRef.current < MANUAL_SCROLL_FOLLOW_PAUSE_MS) {
      return;
    }
    turnRefsById.current[playbackTurnId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isPlaying, playbackTurnId]);

  if (displayTurns.length === 0) {
    return (
      <ConversationEmptyState
        className={className}
        description="本次面试还未收到对话内容。"
        icon={<IconMessage2 className="size-6" />}
        title="暂无对话记录"
      />
    );
  }

  const markManualScroll = () => {
    lastManualScrollAtRef.current = Date.now();
  };

  const rows = displayTurns.map((turn) => (
    <TranscriptTurn
      candidateAvatar={candidateAvatar}
      candidateAvatarSeed={candidateAvatarSeed}
      enabledCategories={enabledCategories}
      isEvidenceActive={
        activeTurnIndex !== null &&
        activeTurnIndex !== undefined &&
        turn.rawTurnIndexes.includes(activeTurnIndex)
      }
      isPlaybackActive={turn.id === playbackTurnId}
      key={turn.id}
      labels={labels}
      onSeek={canSeek && playbackStore ? playbackStore.requestSeek : undefined}
      rowRef={(node) => {
        turnRefsById.current[turn.id] = node;
        for (const turnIndex of turn.rawTurnIndexes) {
          turnRefs.current[turnIndex] = node;
        }
      }}
      turn={turn}
    />
  ));

  if (scroll === "flow") {
    return (
      <div
        className={cn("flex flex-col gap-1 pb-4", className)}
        onTouchMove={markManualScroll}
        onWheel={markManualScroll}
      >
        {rows}
      </div>
    );
  }

  return (
    <Conversation
      className={cn("min-h-0", className)}
      initial={false}
      onTouchMove={markManualScroll}
      onWheel={markManualScroll}
    >
      <ConversationContent className="gap-1 px-0 pt-0 pb-4">{rows}</ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/**
 * 对话记录标题栏操作：复制全文、下载 .txt。
 * Transcript header actions: copy the full text or download it as .txt.
 */
export function TranscriptExportActions({
  candidateName,
  fileName,
  turns,
}: {
  candidateName?: string | null;
  fileName: string;
  turns: PersistedInterviewTurn[];
}) {
  if (turns.length === 0) {
    return null;
  }

  const buildText = () =>
    buildTranscriptText(
      coalescePersistedInterviewTurns(turns),
      resolveSpeakerLabels(candidateName),
    );

  const handleCopy = async () => {
    const result = await copyTextToClipboard(buildText());
    if (result === "copied") {
      toast.success("已复制对话全文");
    } else if (result === "failed") {
      toast.error("复制失败，请稍后重试");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName.endsWith(".txt") ? fileName : `${fileName}.txt`;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex items-center gap-1">
      <Button aria-label="复制对话全文" onClick={handleCopy} size="icon-sm" variant="ghost">
        <IconCopy className="size-4" />
      </Button>
      <Button aria-label="下载对话全文" onClick={handleDownload} size="icon-sm" variant="ghost">
        <IconDownload className="size-4" />
      </Button>
    </div>
  );
}
