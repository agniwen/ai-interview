import type { MeetingQuestionExchange, MeetingQuestionThread } from "@app/shared/meeting-answer";
import { Button } from "@/components/ui/button";

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

/**
 * 当前用户的私有问答线程视图；引用只跳向服务端已验证的 transcript turn。
 * Private per-user Q&A thread view; citations seek only to server-validated transcript turns.
 */
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
