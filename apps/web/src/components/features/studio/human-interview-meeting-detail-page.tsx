import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import type { ReactNode } from "react";
import type { HumanInterviewMeetingDetail } from "@app/shared/human-interview-meeting-detail";
import { fetchHumanInterviewMeetingDetail } from "@/lib/client/api/endpoints/human-interview-meeting-detail";
import { humanInterviewKeys } from "@/lib/client/api/query-keys";
import { isApiError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeDisplay } from "@/components/features/display/time-display";
import { RoundEvaluation } from "./human-interview-evaluation-summary";

const returnStateSchema = z.object({ fromHumanInterviewCandidate: z.string().optional() });

function Notice({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-6">
      {children}
    </p>
  );
}

function formatTranscriptTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function evaluationEmptyMessage(status: HumanInterviewMeetingDetail["evaluationStatus"]) {
  if (status === "generating") {
    return "评价正在生成，完成后会自动更新。";
  }
  if (status === "failed") {
    return "评价生成失败。";
  }
  return "尚未提交面试评价。";
}

function MeetingTranscript({ detail }: { detail: HumanInterviewMeetingDetail }) {
  return (
    <>
      {detail.recordingNotice ? <Notice>{detail.recordingNotice}</Notice> : null}
      {detail.transcriptNotice ? <Notice>{detail.transcriptNotice}</Notice> : null}
      {detail.transcript ? (
        <>
          <p className="text-sm text-muted-foreground">
            共 {detail.transcript.turns.length} 段发言
            {detail.transcriptBasis === "evaluation" ? " · 评价对应转录" : ""}
          </p>
          {detail.transcript.turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可展示的发言。</p>
          ) : (
            <ol className="space-y-3" aria-label="转录对话">
              {detail.transcript.turns.map((turn) => (
                <li
                  key={turn.id}
                  className="space-y-2 rounded-lg border p-4 [content-visibility:auto] [contain-intrinsic-size:auto_100px]"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {turn.speakerDisplayName?.replace(/^候选人\s*·\s*/, "") || "未命名发言人"}
                    </span>
                    <Badge variant="outline">
                      {
                        { candidate: "候选人", interviewer: "面试官", unknown: "身份未确认" }[
                          turn.attribution?.role ?? "unknown"
                        ]
                      }
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTranscriptTime(turn.startMs)} – {formatTranscriptTime(turn.endMs)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">{turn.text}</p>
                </li>
              ))}
            </ol>
          )}
        </>
      ) : (
        <output className="block rounded-lg border p-6 text-sm text-muted-foreground">
          {
            {
              failed: "转录未能生成，已有评价仍可查看。",
              pending: "转录尚未就绪，生成后会自动更新。",
              processing: "正在整理转录，完成后会自动更新。",
              ready: "暂无可用转录。",
              unavailable: "暂无可用转录。",
            }[detail.transcriptionState]
          }
        </output>
      )}
      {detail.transcriptionError && detail.transcriptionError !== detail.recordingNotice ? (
        <Notice>{detail.transcriptionError}</Notice>
      ) : null}
    </>
  );
}

export function HumanInterviewMeetingDetailContent({
  detail,
}: {
  detail: HumanInterviewMeetingDetail;
}) {
  return (
    <>
      <header className="space-y-3 border-b pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">会议详情 · {detail.candidateName}</h1>
          <Badge variant="secondary">会议已结束</Badge>
          {detail.outcome ? (
            <Badge variant="outline">
              {{ fail: "未通过", inconclusive: "待定", pass: "通过" }[detail.outcome]}
            </Badge>
          ) : null}
        </div>
        <p className="font-medium">{detail.roundLabel}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>
            面试官：{detail.interviewers.map((person) => person.name).join("、") || "未记录"}
          </span>
          <span>
            {detail.startedAt ? "开始" : "计划时间"}：
            <TimeDisplay value={detail.startedAt ?? detail.scheduledAt} />
          </span>
          <span>
            结束：
            <TimeDisplay value={detail.endedAt} />
          </span>
        </div>
      </header>
      <Tabs defaultValue="transcript">
        <TabsList variant="underline" aria-label="会议详情内容">
          <TabsTrigger value="transcript">完整转录</TabsTrigger>
          <TabsTrigger value="evaluation">面试评价</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript" className="space-y-4 pt-3">
          <MeetingTranscript detail={detail} />
        </TabsContent>
        <TabsContent value="evaluation" className="space-y-4 pt-3">
          {detail.transcriptBasis === "unlinked" && detail.transcriptNotice ? (
            <Notice>{detail.transcriptNotice}</Notice>
          ) : null}
          <Card>
            <CardContent>
              {detail.evaluation ? (
                <RoundEvaluation
                  evaluation={detail.evaluation}
                  round={detail}
                  className="border-t-0 pt-0 text-sm"
                />
              ) : (
                <output className="block text-sm text-muted-foreground">
                  {evaluationEmptyMessage(detail.evaluationStatus)}
                </output>
              )}
              {!detail.evaluation && detail.feedback ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{detail.feedback}</p>
              ) : null}
              {detail.evaluationSubmittedAt ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  提交时间：
                  <TimeDisplay value={detail.evaluationSubmittedAt} />
                </p>
              ) : null}
            </CardContent>
          </Card>
          {detail.evaluationError ? <Notice>{detail.evaluationError}</Notice> : null}
        </TabsContent>
      </Tabs>
    </>
  );
}

export function HumanInterviewMeetingDetailPage(input: {
  slug: string;
  candidateId: string;
  roundId: string;
  meetingId: string;
}) {
  const router = useRouter();
  const query = useQuery({
    queryFn: ({ signal }) => fetchHumanInterviewMeetingDetail(input, signal),
    queryKey: humanInterviewKeys.meetingDetail(
      input.slug,
      input.candidateId,
      input.roundId,
      input.meetingId,
    ),
    refetchInterval: (state) => {
      if (state.state.error) {
        return false;
      }
      const detail = state.state.data;
      return detail &&
        (detail.transcriptionState === "pending" ||
          detail.transcriptionState === "processing" ||
          detail.evaluationStatus === "generating")
        ? 5000
        : false;
    },
    refetchIntervalInBackground: false,
    retry: (failureCount, error) =>
      failureCount < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
  });
  let content: ReactNode = (
    <output className="block p-6 text-muted-foreground text-sm">正在加载会议详情…</output>
  );
  if (query.isError) {
    content = (
      <p role="alert" className="rounded-lg border p-6 text-sm">
        {query.error.message}
      </p>
    );
  } else if (query.data) {
    content = <HumanInterviewMeetingDetailContent detail={query.data} />;
  }
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/w/$slug/studio/resumes/$recordId"
              params={{ recordId: input.candidateId, slug: input.slug }}
              search={{ tab: "human-interview" }}
              onClick={(event) => {
                const from = returnStateSchema.safeParse(router.state.location.state).data
                  ?.fromHumanInterviewCandidate;
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  from === input.candidateId &&
                  router.history.canGoBack()
                ) {
                  event.preventDefault();
                  router.history.back();
                }
              }}
            />
          }
        >
          <IconArrowLeft className="size-4" />
          返回真人复面
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            query.refetch();
          }}
        >
          <IconRefresh className="size-4" />
          刷新
        </Button>
      </div>
      {content}
    </main>
  );
}
