import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import type {
  CreateMeetingTranscriptCorrectionInput,
  FinalMeetingTranscriptRevision,
  FinalMeetingTranscriptTurn,
  MeetingTranscriptResult,
} from "@arc/shared/meeting-transcription";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FrameHeading,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/client/api-error";
import {
  createMeetingTranscriptCorrection,
  desktopMeetingKeys,
  fetchMeetingTranscript,
  fetchMeetingTranscriptHistory,
  fetchMeetingTranscriptRevision,
  retryMeetingTranscript,
} from "@/lib/client/meetings";
import { formatAppDateTime } from "@/lib/client/datetime";

export function transcriptSeekSeconds(startMs: number): number {
  return Math.max(0, startMs / 1000);
}

function formatTranscriptTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (hours > 0 ? [hours, minutes, seconds] : [minutes, seconds])
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function speakerLabel(speakerKey: string, speakerDisplayName?: string | null): string {
  if (speakerDisplayName) {
    return speakerDisplayName;
  }
  if (speakerKey === "local") {
    return "本机";
  }
  const remoteNumber = speakerKey.match(/^remote-(\d+)$/)?.[1];
  return remoteNumber ? `远端 ${remoteNumber}` : "远端";
}

function SavedLiveTranscriptDraft({
  draft,
}: {
  draft: NonNullable<MeetingTranscriptResult["draft"]>;
}) {
  return (
    <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-3">
      <p className="font-medium text-sm">已保存的实时字幕草稿</p>
      <p className="mb-3 text-muted-foreground text-xs">
        这是录制结束时保留的临时识别结果，最终转写完成后仍会保留但不作为权威版本。
      </p>
      {draft.turns.length === 0 ? (
        <p className="text-muted-foreground text-sm">实时字幕没有识别到文字。</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {draft.turns.map((turn) => (
            <article className="border-b pb-3 last:border-b-0" key={turn.id}>
              <p className="mb-1 text-muted-foreground text-xs">
                {turn.track === "microphone" ? "本机" : "系统/远端"}
                {turn.final ? "" : " · 未完成片段"}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
            </article>
          ))}
        </div>
      )}
      {draft.error || draft.droppedPcmFrames > 0 ? (
        <p className="mt-3 text-amber-700 text-xs dark:text-amber-400">
          此草稿可能有遗漏；完整录音不受影响。
        </p>
      ) : null}
    </div>
  );
}

export function canCorrectMeetingTranscript(role: MeetingAccessRole): boolean {
  return role !== "viewer";
}

export function isTranscriptCorrectionConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409;
}

export function splitTranscriptTurn(
  turn: FinalMeetingTranscriptTurn,
): [FinalMeetingTranscriptTurn, FinalMeetingTranscriptTurn] | null {
  const midpointMs = Math.floor((turn.startMs + turn.endMs) / 2);
  const text = turn.text.trim();
  if (midpointMs <= turn.startMs || midpointMs >= turn.endMs || text.length < 2) {
    return null;
  }
  const midpointText = Math.ceil(text.length / 2);
  const firstText = text.slice(0, midpointText).trim();
  const secondText = text.slice(midpointText).trim();
  if (!(firstText && secondText)) {
    return null;
  }
  return [
    { ...turn, endMs: midpointMs, id: crypto.randomUUID(), text: firstText },
    { ...turn, id: crypto.randomUUID(), startMs: midpointMs, text: secondText },
  ];
}

/**
 * 虚拟化权威转录列表，避免最长会议的全部 turn 同时进入 Electron DOM。
 * Virtualizes authoritative turns so long meetings do not mount the entire transcript in Electron's DOM.
 */
function VirtualTranscriptTurns({
  onSeek,
  turns,
}: {
  onSeek: (seconds: number) => void;
  turns: FinalMeetingTranscriptTurn[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: turns.length,
    estimateSize: () => 96,
    getItemKey: (index) => turns[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 448, width: 720 },
    overscan: 6,
  });
  return (
    <div className="max-h-[28rem] overflow-y-auto" ref={scrollRef}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const turn = turns[virtualItem.index];
          return turn ? (
            <article
              className="absolute left-0 top-0 grid w-full grid-cols-[auto_1fr] gap-3 border-b p-3"
              data-index={virtualItem.index}
              key={turn.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <Button
                aria-label={`跳转到 ${formatTranscriptTime(turn.startMs)}`}
                onClick={() => onSeek(transcriptSeekSeconds(turn.startMs))}
                size="sm"
                type="button"
                variant="outline"
              >
                {formatTranscriptTime(turn.startMs)}
              </Button>
              <div className="min-w-0">
                <p className="mb-1 text-muted-foreground text-xs">
                  {speakerLabel(turn.speakerKey, turn.speakerDisplayName)}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
              </div>
            </article>
          ) : null;
        })}
      </div>
    </div>
  );
}

/**
 * 人工修订编辑器只提交新的 append-only revision，不在客户端原地覆盖机器版本。
 * Human corrections create an append-only revision instead of mutating the machine revision in place.
 */
function MeetingTranscriptCorrectionEditor({
  error,
  onCancel,
  onSave,
  revision,
  saving,
}: {
  error: Error | null;
  onCancel: () => void;
  onSave: (correction: CreateMeetingTranscriptCorrectionInput) => void;
  revision: FinalMeetingTranscriptRevision;
  saving: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [turns, setTurns] = useState(() => revision.turns.map((turn) => ({ ...turn })));
  const selected = turns[selectedIndex] ?? null;
  const valid = turns.every(
    (turn, index) =>
      turn.text.trim() &&
      turn.startMs >= 0 &&
      turn.endMs > turn.startMs &&
      (index === 0 || turn.startMs >= (turns[index - 1]?.startMs ?? 0)),
  );

  function updateSelected(patch: Partial<FinalMeetingTranscriptTurn>) {
    setTurns((current) =>
      current.map((turn, index) => (index === selectedIndex ? { ...turn, ...patch } : turn)),
    );
  }

  function updateSpeakerDisplayName(speakerKey: string, displayName: string) {
    const speakerDisplayName = displayName.length === 0 ? null : displayName;
    setTurns((current) =>
      current.map((turn) =>
        turn.speakerKey === speakerKey ? { ...turn, speakerDisplayName } : turn,
      ),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      return;
    }
    onSave({
      language: revision.language,
      sourceRevisionId: revision.id,
      turns: turns.map(({ endMs, speakerDisplayName, speakerKey, startMs, text, track }) => ({
        confidence: null,
        endMs,
        speakerDisplayName: speakerDisplayName?.trim() || null,
        speakerKey,
        startMs,
        text: text.trim(),
        track,
      })),
    });
  }

  const next = turns[selectedIndex + 1] ?? null;
  const canSplit = Boolean(
    selected && selected.endMs - selected.startMs > 1 && selected.text.trim().length > 1,
  );
  const canMerge = Boolean(
    selected && next && selected.speakerKey === next.speakerKey && selected.track === next.track,
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-medium">基于 revision {revision.revision} 创建新的人工修订</p>
        <p className="mt-1 text-muted-foreground text-xs">
          speaker 展示名只用于这份转录的阅读，不代表声纹或生物识别身份验证。
        </p>
      </div>
      {error ? <p className="text-destructive text-sm">{error.message}</p> : null}
      {selected ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              片段 {selectedIndex + 1} / {turns.length} · stable key: {selected.speakerKey}
            </span>
            <div className="flex gap-1">
              <Button
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
                size="sm"
                type="button"
                variant="ghost"
              >
                上一段
              </Button>
              <Button
                disabled={selectedIndex >= turns.length - 1}
                onClick={() => setSelectedIndex((index) => Math.min(turns.length - 1, index + 1))}
                size="sm"
                type="button"
                variant="ghost"
              >
                下一段
              </Button>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm" htmlFor="transcript-speaker-name">
            <span>speaker 展示名</span>
            <Input
              id="transcript-speaker-name"
              onChange={(event) =>
                updateSpeakerDisplayName(selected.speakerKey, event.target.value)
              }
              placeholder={speakerLabel(selected.speakerKey)}
              value={selected.speakerDisplayName ?? ""}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm" htmlFor="transcript-start-time">
              <span>开始（秒）</span>
              <Input
                id="transcript-start-time"
                min={0}
                onChange={(event) =>
                  updateSelected({
                    startMs: Math.max(0, Math.round(event.target.valueAsNumber * 1000)),
                  })
                }
                step="0.1"
                type="number"
                value={selected.startMs / 1000}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm" htmlFor="transcript-end-time">
              <span>结束（秒）</span>
              <Input
                id="transcript-end-time"
                min={0}
                onChange={(event) =>
                  updateSelected({
                    endMs: Math.max(0, Math.round(event.target.valueAsNumber * 1000)),
                  })
                }
                step="0.1"
                type="number"
                value={selected.endMs / 1000}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm" htmlFor="transcript-turn-text">
            <span>转录文字</span>
            <Textarea
              id="transcript-turn-text"
              onChange={(event) => updateSelected({ text: event.target.value })}
              value={selected.text}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canSplit}
              onClick={() => {
                const split = splitTranscriptTurn(selected);
                if (split) {
                  setTurns((current) => [
                    ...current.slice(0, selectedIndex),
                    ...split,
                    ...current.slice(selectedIndex + 1),
                  ]);
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              拆分片段
            </Button>
            <Button
              disabled={!canMerge}
              onClick={() => {
                if (!(selected && next && canMerge)) {
                  return;
                }
                setTurns((current) => [
                  ...current.slice(0, selectedIndex),
                  {
                    ...selected,
                    endMs: next.endMs,
                    text: `${selected.text.trim()} ${next.text.trim()}`.trim(),
                  },
                  ...current.slice(selectedIndex + 2),
                ]);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              与下一段合并
            </Button>
            <Button
              onClick={() => {
                setTurns((current) => current.filter((_, index) => index !== selectedIndex));
                setSelectedIndex((index) => Math.max(0, Math.min(index, turns.length - 2)));
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              删除片段
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">这份人工修订将不包含任何语音片段。</p>
      )}
      {valid ? null : (
        <p className="text-destructive text-sm">每个片段都需要有效文字和时间范围。</p>
      )}
      <div className="flex gap-2">
        <Button disabled={!valid || saving} type="submit">
          {saving ? "正在保存…" : "保存为新的人工修订"}
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          取消
        </Button>
      </div>
    </form>
  );
}

export function MeetingTranscriptView({
  canCorrect = false,
  canRetry,
  onEdit,
  onRetry,
  onSeek,
  result,
  retrying = false,
}: {
  canCorrect?: boolean;
  canRetry: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
  onSeek: (seconds: number) => void;
  result: MeetingTranscriptResult;
  retrying?: boolean;
}) {
  const savedDraft = result.draft ? <SavedLiveTranscriptDraft draft={result.draft} /> : null;
  if (result.state === "pending") {
    return (
      <>
        <p className="text-muted-foreground text-sm">
          等待 Workspace 管理员配置并选择转录服务，或等待进入处理队列。
        </p>
        {savedDraft}
      </>
    );
  }
  if (result.state === "processing") {
    return (
      <>
        <p className="text-muted-foreground text-sm">正在生成最终转录…</p>
        {savedDraft}
      </>
    );
  }
  if (result.state === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-destructive text-sm">{result.error ?? "最终会议转录失败"}</p>
        {canRetry && onRetry ? (
          <Button disabled={retrying} onClick={onRetry} type="button">
            {retrying ? "正在重试…" : "重试最终转录"}
          </Button>
        ) : null}
        {savedDraft}
      </div>
    );
  }
  if (!result.revision) {
    return <p className="text-muted-foreground text-sm">最终转录暂不可用。</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {result.revision.kind === "human" ? "人工修订" : "机器生成"} revision{" "}
          {result.revision.revision} · {result.revision.provider} · {result.revision.model}
          {result.revision.createdBy ? ` · ${result.revision.createdBy.name}` : ""}
        </p>
        {canCorrect && onEdit ? (
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            修正转录
          </Button>
        ) : null}
      </div>
      {savedDraft}
      {result.revision.turns.length === 0 ? (
        <p className="text-muted-foreground text-sm">此录音没有识别到语音。</p>
      ) : (
        <VirtualTranscriptTurns onSeek={onSeek} turns={result.revision.turns} />
      )}
    </div>
  );
}

function transcriptRefetchInterval(result: MeetingTranscriptResult | undefined): number | false {
  return result?.state === "pending" || result?.state === "processing" ? 5000 : false;
}

function transcriptStageEmptyHint(
  result: MeetingTranscriptResult | undefined,
  error: unknown,
  hasTurns: boolean,
): string {
  if (error) {
    return error instanceof Error ? error.message : "加载会议字幕失败";
  }
  if (result?.state === "processing" || result?.state === "pending") {
    return "录音已保存，正在生成最终字幕…";
  }
  if (result?.state === "failed") {
    return result.error ?? "最终字幕生成失败";
  }
  if (result && !hasTurns) {
    return "这次录制没有识别到文字";
  }
  return "正在加载字幕…";
}

type MeetingTranscriptStageTurn = Pick<FinalMeetingTranscriptTurn, "id" | "text"> &
  Partial<Pick<FinalMeetingTranscriptTurn, "speakerDisplayName" | "speakerKey">>;

export function MeetingTranscriptStageTurns({ turns }: { turns: MeetingTranscriptStageTurn[] }) {
  return (
    <div className="grid select-text" aria-live="polite">
      {turns.map((turn) => (
        <article
          className="grid cursor-text gap-1 rounded-sm p-1 hover:bg-foreground/4"
          key={turn.id}
        >
          {turn.speakerKey ? (
            <p className="text-muted-foreground text-xs">
              {speakerLabel(turn.speakerKey, turn.speakerDisplayName)}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
        </article>
      ))}
    </div>
  );
}

/** Read-only transcript stage used by the session landing page. */
export function MeetingTranscriptStage({
  error,
  result,
}: {
  error?: unknown;
  result: MeetingTranscriptResult | undefined;
}) {
  const draftTurns = result?.draft?.turns ?? [];
  const finalTurns = result?.revision?.turns ?? [];
  const turns = draftTurns.length > 0 ? draftTurns : finalTurns;
  const emptyHint = transcriptStageEmptyHint(result, error, turns.length > 0);

  return turns.length > 0 ? (
    <MeetingTranscriptStageTurns turns={turns} />
  ) : (
    <div className="flex flex-1 items-center justify-center py-16">
      <p className="text-center text-muted-foreground text-sm">{emptyHint}</p>
    </div>
  );
}

/**
 * 协调当前/历史转录、轮询、重试和人工修订；409 表示基线已变化，必须退出陈旧编辑器并刷新。
 * Coordinates current/history queries, polling, retries, and corrections; a 409 exits stale editing and refetches the baseline.
 */
export function MeetingTranscriptPanel({
  accessRole,
  meetingId,
  onSeek,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  onSeek: (seconds: number) => void;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const transcriptKey = desktopMeetingKeys.transcript(slug, meetingId);
  const historyKey = desktopMeetingKeys.transcriptHistory(slug, meetingId);
  const transcriptQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchMeetingTranscript(slug, meetingId),
    queryKey: transcriptKey,
    refetchInterval: (query) => transcriptRefetchInterval(query.state.data),
  });
  const retryMutation = useMutation({
    mutationFn: () => retryMeetingTranscript(slug, meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transcriptKey }),
  });
  const historyQuery = useQuery({
    enabled: historyOpen,
    queryFn: () => fetchMeetingTranscriptHistory(slug, meetingId),
    queryKey: historyKey,
  });
  const historicalRevisionQuery = useQuery({
    enabled: Boolean(selectedRevisionId),
    queryFn: () => fetchMeetingTranscriptRevision(slug, meetingId, selectedRevisionId as string),
    queryKey: desktopMeetingKeys.transcriptRevision(slug, meetingId, selectedRevisionId ?? ""),
  });
  const correctionMutation = useMutation({
    mutationFn: (correction: CreateMeetingTranscriptCorrectionInput) =>
      createMeetingTranscriptCorrection(slug, meetingId, correction),
    onError: (error) => {
      if (!isTranscriptCorrectionConflict(error)) {
        return;
      }
      setConflictNotice(error.message);
      setEditing(false);
      setSelectedRevisionId(null);
      void queryClient.invalidateQueries({ queryKey: transcriptKey });
    },
    onSuccess: async () => {
      setConflictNotice(null);
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transcriptKey }),
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.searchRoot(slug) }),
      ]);
    },
  });
  const canRetry = accessRole === "administrator" || accessRole === "owner";
  const canCorrect = canCorrectMeetingTranscript(accessRole);
  const historyRevisionNumbers = useMemo(
    () =>
      new Map(
        (historyQuery.data?.records ?? []).map((revision) => [revision.id, revision.revision]),
      ),
    [historyQuery.data],
  );
  const activeRevision = transcriptQuery.data?.revision ?? null;
  let transcriptContent: ReactNode = null;
  if (transcriptQuery.data) {
    transcriptContent =
      editing && activeRevision ? (
        <MeetingTranscriptCorrectionEditor
          error={correctionMutation.error}
          key={activeRevision.id}
          onCancel={() => {
            correctionMutation.reset();
            setEditing(false);
          }}
          onSave={(correction) => correctionMutation.mutate(correction)}
          revision={activeRevision}
          saving={correctionMutation.isPending}
        />
      ) : (
        <MeetingTranscriptView
          canCorrect={canCorrect}
          canRetry={canRetry}
          onEdit={() => {
            setConflictNotice(null);
            correctionMutation.reset();
            setEditing(true);
          }}
          onRetry={() => retryMutation.mutate()}
          onSeek={onSeek}
          result={transcriptQuery.data}
          retrying={retryMutation.isPending}
        />
      );
  }
  return (
    <Frame>
      <FrameHeader>
        <FrameHeading>
          <FrameTitle>最终转录</FrameTitle>
          <FrameDescription>
            实时字幕草稿会单独保留；最终版本仍由已验证的双轨录音生成。
          </FrameDescription>
        </FrameHeading>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        {transcriptQuery.isPending ? (
          <p className="text-muted-foreground text-sm">正在加载最终转录…</p>
        ) : null}
        {transcriptQuery.error ? (
          <p className="text-destructive text-sm">
            {transcriptQuery.error instanceof Error
              ? transcriptQuery.error.message
              : "加载最终会议转录失败"}
          </p>
        ) : null}
        {conflictNotice ? <p className="text-destructive text-sm">{conflictNotice}</p> : null}
        {transcriptContent}
      </FramePanel>
      {transcriptQuery.data?.state === "ready" ? (
        <FramePanel>
          <Button
            onClick={() => setHistoryOpen((open) => !open)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {historyOpen ? "收起修订历史" : "查看修订历史"}
          </Button>
          {historyOpen ? (
            <div className="mt-3 flex flex-col gap-2">
              {historyQuery.isPending ? (
                <p className="text-muted-foreground text-sm">正在加载修订历史…</p>
              ) : null}
              {historyQuery.error ? (
                <p className="text-destructive text-sm">
                  {historyQuery.error instanceof Error
                    ? historyQuery.error.message
                    : "加载修订历史失败"}
                </p>
              ) : null}
              {historyQuery.data?.records.map((revision) => (
                <article className="rounded-lg bg-muted/40 px-3 py-3 text-sm" key={revision.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      版本 {revision.revision} ·{" "}
                      {revision.kind === "human" ? "人工修订" : "机器生成"}
                      {revision.id === activeRevision?.id ? " · 当前权威版本" : ""}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatAppDateTime(revision.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {revision.createdBy?.name ?? "自动转录服务"}
                    {revision.basedOnRevisionId
                      ? ` · 基于版本 ${historyRevisionNumbers.get(revision.basedOnRevisionId) ?? "?"}`
                      : ""}
                  </p>
                  <Button
                    className="mt-2"
                    onClick={() =>
                      setSelectedRevisionId((selected) =>
                        selected === revision.id ? null : revision.id,
                      )
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {selectedRevisionId === revision.id ? "收起版本" : "查看版本"}
                  </Button>
                  {selectedRevisionId === revision.id ? (
                    <div className="mt-3 border-t pt-3">
                      {historicalRevisionQuery.isPending ? (
                        <p className="text-muted-foreground text-sm">正在加载版本…</p>
                      ) : null}
                      {historicalRevisionQuery.error ? (
                        <p className="text-destructive text-sm">
                          {historicalRevisionQuery.error instanceof Error
                            ? historicalRevisionQuery.error.message
                            : "加载版本失败"}
                        </p>
                      ) : null}
                      {historicalRevisionQuery.data ? (
                        <MeetingTranscriptView
                          canRetry={false}
                          onSeek={onSeek}
                          result={{
                            error: null,
                            revision: historicalRevisionQuery.data,
                            state: "ready",
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </FramePanel>
      ) : null}
    </Frame>
  );
}
