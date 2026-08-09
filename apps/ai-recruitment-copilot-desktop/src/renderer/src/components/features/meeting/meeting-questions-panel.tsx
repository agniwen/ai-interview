import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { MeetingQuestionExchange, MeetingQuestionThread } from "@arc/shared/meeting-answer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  askMeetingQuestion,
  createMeetingQuestionThread,
  desktopMeetingKeys,
  fetchMeetingQuestionThread,
  fetchMeetingQuestionThreads,
} from "@/lib/client/meetings";

export function meetingAnswerSeekSeconds(startMs: number): number {
  return Math.max(0, startMs / 1000);
}

export function hasActiveMeetingQuestion(thread: MeetingQuestionThread | undefined): boolean {
  return Boolean(
    thread?.exchanges.some(
      (exchange) => exchange.status === "pending" || exchange.status === "processing",
    ),
  );
}

function formatTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function MeetingQuestionAnswer({
  exchange,
  onSeek,
}: {
  exchange: MeetingQuestionExchange;
  onSeek: (seconds: number) => void;
}) {
  if (exchange.status === "pending" || exchange.status === "processing") {
    return <p className="text-muted-foreground">正在从当前会议资料中查找证据…</p>;
  }
  if (exchange.status === "failed") {
    return <p className="text-destructive">{exchange.error ?? "回答生成失败，请重新提问。"}</p>;
  }
  if (!exchange.answer) {
    return null;
  }
  return (
    <>
      {exchange.answer.kind === "insufficient-evidence" ? (
        <p className="mb-1 font-medium text-amber-700 dark:text-amber-400">证据不足</p>
      ) : null}
      <p className="whitespace-pre-wrap leading-relaxed">{exchange.answer.text}</p>
      {exchange.answer.citations.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {exchange.answer.citations.map((citation) => (
            <Button
              key={citation.turnId}
              onClick={() => onSeek(meetingAnswerSeekSeconds(citation.startMs))}
              size="sm"
              type="button"
              variant="outline"
            >
              证据 {formatTime(citation.startMs)}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function MeetingQuestionThreadView({
  onSeek,
  thread,
}: {
  onSeek: (seconds: number) => void;
  thread: MeetingQuestionThread;
}) {
  if (thread.exchanges.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">在下方输入问题开始提问。</p>
    );
  }
  return (
    <div className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto pr-1">
      {thread.exchanges.map((exchange) => (
        <div className="flex flex-col gap-2" key={exchange.id}>
          <div className="ml-8 self-end rounded-xl bg-primary px-3 py-2 text-primary-foreground text-sm">
            {exchange.question}
          </div>
          <div className="mr-8 rounded-xl border bg-background px-3 py-3 text-sm">
            <MeetingQuestionAnswer exchange={exchange} onSeek={onSeek} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MeetingQuestionThreadState({
  onSeek,
  selectedThreadId,
  thread,
}: {
  onSeek: (seconds: number) => void;
  selectedThreadId: string | null;
  thread: MeetingQuestionThread | undefined;
}) {
  if (thread) {
    return <MeetingQuestionThreadView onSeek={onSeek} thread={thread} />;
  }
  if (selectedThreadId) {
    return <p className="py-6 text-center text-muted-foreground text-sm">正在加载提问内容…</p>;
  }
  return (
    <p className="py-6 text-center text-muted-foreground text-sm">新建一个只属于你的提问线程。</p>
  );
}

export function MeetingQuestionsPanel({
  meetingId,
  onSeek,
  slug,
}: {
  meetingId: string;
  onSeek: (seconds: number) => void;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const threadsKey = desktopMeetingKeys.questions(slug, meetingId);
  const threadsQuery = useQuery({
    queryFn: () => fetchMeetingQuestionThreads(slug, meetingId),
    queryKey: threadsKey,
  });
  useEffect(() => {
    if (!selectedThreadId && threadsQuery.data?.[0]) {
      setSelectedThreadId(threadsQuery.data[0].id);
    }
  }, [selectedThreadId, threadsQuery.data]);
  const threadKey = selectedThreadId
    ? desktopMeetingKeys.questionThread(slug, meetingId, selectedThreadId)
    : [...threadsKey, "none"];
  const threadQuery = useQuery({
    enabled: Boolean(selectedThreadId),
    queryFn: () => fetchMeetingQuestionThread(slug, meetingId, selectedThreadId ?? ""),
    queryKey: threadKey,
    refetchInterval: (query) =>
      query.state.data?.exchanges.some(
        (exchange) => exchange.status === "pending" || exchange.status === "processing",
      )
        ? 2000
        : false,
  });
  const hasActiveQuestion = hasActiveMeetingQuestion(threadQuery.data);
  const createMutation = useMutation({
    mutationFn: () => createMeetingQuestionThread(slug, meetingId),
    onSuccess: async (thread) => {
      setSelectedThreadId(thread.id);
      await queryClient.invalidateQueries({ queryKey: threadsKey });
    },
  });
  const askMutation = useMutation({
    mutationFn: () =>
      askMeetingQuestion(slug, meetingId, selectedThreadId ?? "", {
        question: question.trim(),
        requestId,
      }),
    onSuccess: async () => {
      setQuestion("");
      setRequestId(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: threadKey }),
        queryClient.invalidateQueries({ queryKey: threadsKey }),
      ]);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selectedThreadId && question.trim() && !askMutation.isPending && !hasActiveQuestion) {
      askMutation.mutate();
    }
  }

  const error =
    threadsQuery.error ?? threadQuery.error ?? createMutation.error ?? askMutation.error;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">针对本次会议提问</h2>
          <p className="text-muted-foreground text-xs">
            回答只使用当前会议的转录、Notes 和 Meeting Intelligence，并附可播放的转录证据。
          </p>
        </div>
        <Button
          disabled={createMutation.isPending}
          onClick={() => createMutation.mutate()}
          size="sm"
          type="button"
          variant="outline"
        >
          新建提问
        </Button>
      </div>
      {error ? (
        <p className="mb-3 text-destructive text-sm">
          {error instanceof Error ? error.message : "会议提问操作失败"}
        </p>
      ) : null}
      {(threadsQuery.data?.length ?? 0) > 0 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {threadsQuery.data?.map((thread) => (
            <Button
              key={thread.id}
              onClick={() => setSelectedThreadId(thread.id)}
              size="sm"
              type="button"
              variant={thread.id === selectedThreadId ? "default" : "outline"}
            >
              {thread.title}
            </Button>
          ))}
        </div>
      ) : null}
      <MeetingQuestionThreadState
        onSeek={onSeek}
        selectedThreadId={selectedThreadId}
        thread={threadQuery.data}
      />
      <form className="mt-4 flex flex-col gap-2" onSubmit={submit}>
        <Textarea
          disabled={!selectedThreadId || hasActiveQuestion}
          maxLength={2000}
          onChange={(event) => {
            if (askMutation.isError) {
              setRequestId(crypto.randomUUID());
              askMutation.reset();
            }
            setQuestion(event.target.value);
          }}
          placeholder={
            hasActiveQuestion
              ? "请等待上一条问题回答完成"
              : "例如：候选人提到的主要项目和职责是什么？"
          }
          value={question}
        />
        <Button
          className="self-end"
          disabled={
            !selectedThreadId || !question.trim() || askMutation.isPending || hasActiveQuestion
          }
          type="submit"
        >
          {askMutation.isPending ? "提交中…" : "提问"}
        </Button>
      </form>
    </section>
  );
}
