import { cn } from "@app/shared/utils";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message-primitives";
import { IconArrowLeft, IconRefresh, IconInfoCircle, IconMessage } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useStudioHeaderOverride } from "./studio-header-context";
import type { HumanInterviewMeetingDetail } from "@app/shared/human-interview-meeting-detail";
import { fetchHumanInterviewMeetingDetail } from "@/lib/client/api/endpoints/human-interview-meeting-detail";
import { humanInterviewKeys } from "@/lib/client/api/query-keys";
import { isApiError } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeDisplay } from "@/components/features/display/time-display";
import { RoundEvaluation } from "./human-interview-evaluation-summary";

const returnStateSchema = z.object({ fromHumanInterviewCandidate: z.string().optional() });

function Notice({ children }: { children: string }) {
  return (
    <Alert>
      <IconInfoCircle />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
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
        <Frame>
          <FrameHeader className="h-auto min-h-11 flex-wrap justify-between gap-2 py-2">
            <FrameTitle>对话记录</FrameTitle>
            <span className="text-xs text-muted-foreground">
              共 {detail.transcript.turns.length} 段发言
              {detail.transcriptBasis === "evaluation" ? " · 评价对应转录" : ""}
            </span>
          </FrameHeader>
          <FramePanel className="overflow-hidden p-0">
            {detail.transcript.turns.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>暂无可展示的发言。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Conversation
                className="h-[min(65dvh,44rem)] min-h-64"
                initial={false}
                aria-label="转录对话"
              >
                <ConversationContent className="gap-6 px-4 py-5">
                  {detail.transcript.turns.map((turn) => {
                    const isCandidate = turn.attribution?.role === "candidate";
                    const speakerName =
                      turn.speakerDisplayName?.replace(/^候选人\s*·\s*/, "") || "未命名发言人";
                    const roleLabel = {
                      candidate: "候选人",
                      interviewer: "面试官",
                      unknown: "身份未确认",
                    }[turn.attribution?.role ?? "unknown"];
                    return (
                      <Message from={isCandidate ? "user" : "assistant"} key={turn.id}>
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-2 text-muted-foreground text-xs",
                            isCandidate ? "justify-end" : "justify-start",
                          )}
                        >
                          <span className="font-medium text-foreground">{speakerName}</span>
                          {speakerName === roleLabel ? null : <span>· {roleLabel}</span>}
                          <span className="tabular-nums">
                            {formatTranscriptTime(turn.startMs)} –{" "}
                            {formatTranscriptTime(turn.endMs)}
                          </span>
                        </div>
                        <MessageContent
                          className={cn(
                            !isCandidate &&
                              "group-[.is-assistant]:w-fit group-[.is-assistant]:max-w-[88%] group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:border-muted/60 group-[.is-assistant]:bg-muted/30 group-[.is-assistant]:px-3 group-[.is-assistant]:py-2",
                          )}
                        >
                          <p className="whitespace-pre-wrap wrap-anywhere">{turn.text}</p>
                        </MessageContent>
                      </Message>
                    );
                  })}
                </ConversationContent>
                <ConversationScrollButton aria-label="滚动到最新发言" />
              </Conversation>
            )}
          </FramePanel>
        </Frame>
      ) : (
        <Frame>
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconMessage />
                </EmptyMedia>
                <EmptyTitle>转录暂不可用</EmptyTitle>
                <EmptyDescription>
                  <output>
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
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </FramePanel>
        </Frame>
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
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold wrap-anywhere">面试详情 · {detail.candidateName}</h1>
          <span className="text-muted-foreground text-xs">会议已结束</span>
        </div>
        <Frame>
          <FrameHeader className="h-auto min-h-11 flex-wrap justify-between gap-2 py-2">
            <FrameTitle>{detail.roundLabel}</FrameTitle>
            {detail.outcome ? (
              <Badge
                variant={
                  ({ fail: "danger", inconclusive: "warning", pass: "success" } as const)[
                    detail.outcome
                  ]
                }
              >
                {{ fail: "未通过", inconclusive: "待定", pass: "通过" }[detail.outcome]}
              </Badge>
            ) : null}
          </FrameHeader>
          <FramePanel>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">面试官</dt>
                <dd className="wrap-anywhere">
                  {detail.interviewers.map((person) => person.name).join("、") || "未记录"}
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">
                  {detail.startedAt ? "开始时间" : "计划时间"}
                </dt>
                <dd>
                  <TimeDisplay value={detail.startedAt ?? detail.scheduledAt} />
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">结束时间</dt>
                <dd>
                  <TimeDisplay value={detail.endedAt} />
                </dd>
              </div>
            </dl>
          </FramePanel>
        </Frame>
      </header>
      <Tabs defaultValue="transcript" className="gap-4">
        <TabsList aria-label="面试详情内容">
          <TabsTrigger value="transcript">完整转录</TabsTrigger>
          <TabsTrigger value="evaluation">面试评价</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript" className="flex flex-col gap-4">
          <MeetingTranscript detail={detail} />
        </TabsContent>
        <TabsContent value="evaluation" className="flex flex-col gap-4">
          {detail.transcriptBasis === "unlinked" && detail.transcriptNotice ? (
            <Notice>{detail.transcriptNotice}</Notice>
          ) : null}
          <Frame>
            <FrameHeader className="h-auto min-h-11 flex-wrap justify-between gap-2 py-2">
              <FrameTitle>评价结果</FrameTitle>
              {detail.evaluationSubmittedAt ? (
                <span className="text-xs text-muted-foreground">
                  提交时间：
                  <TimeDisplay value={detail.evaluationSubmittedAt} />
                </span>
              ) : null}
            </FrameHeader>
            <FramePanel>
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
            </FramePanel>
          </Frame>
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
  const header = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-2">
        <Button
          aria-label="返回真人面试"
          className="-ml-1 h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
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
          <span className="hidden sm:inline">返回真人面试</span>
        </Button>
      </div>
    ),
    [input.candidateId, input.slug, router],
  );
  useStudioHeaderOverride(header);
  let content: ReactNode = (
    <output aria-label="正在加载面试详情" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-60" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </output>
  );
  if (query.isError) {
    content = (
      <Alert variant="destructive">
        <IconInfoCircle />
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    );
  } else if (query.data) {
    content = <HumanInterviewMeetingDetailContent detail={query.data} />;
  }
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 pb-6">
      <div className="flex items-center justify-end gap-3">
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
