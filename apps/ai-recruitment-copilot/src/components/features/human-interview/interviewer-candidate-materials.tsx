"use client";

import { IconAlertTriangle, IconFileDescription, IconId } from "@tabler/icons-react";
import { INTERVIEW_QUESTION_DIMENSION_LABEL } from "@arc/db-schema/interview/types";
import type { QualitativeResumeEvaluationV2 } from "@arc/db-schema/qualitative-resume-evaluation";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  QUALITATIVE_RECOMMENDATION_LABEL,
  QualitativeDimensionRadar,
  QualitativeRecommendationIndicator,
} from "@/components/features/studio/resumes/qualitative-resume-evaluation-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchHumanInterviewCandidateAiEvaluation,
  fetchHumanInterviewCandidateHrInformation,
  fetchHumanInterviewCandidateMaterialDetail,
  fetchHumanInterviewCandidateMaterials,
  fetchHumanInterviewCandidateQuestions,
  getHumanInterviewCandidatePptxPreviewUrl,
  getHumanInterviewCandidateResumeUrl,
} from "@/lib/client/api";
import { resolveEffectiveCandidateId } from "./human-meeting-materials-model";

const InlinePdfViewer = lazy(async () => {
  const mod = await import("@/components/ui/pdf-viewer");
  return { default: mod.PDFViewer };
});

const InlineDocxViewer = lazy(async () => {
  const mod = await import("@/components/ui/docx-viewer");
  return { default: mod.DocxViewerPreview };
});

const InlineXlsxViewer = lazy(async () => {
  const mod = await import("@/components/ui/xlsx-viewer");
  return { default: mod.XlsxViewerPreview };
});

const InlineImageViewer = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ImageResumePreviewContent };
});

export type CandidateMaterialsLeftTab = "ai" | "hr" | "questions";
export type CandidateMaterialsCenterTab = "detail" | "resume";

export interface InterviewerCandidateMaterialsState {
  candidateId: string | null;
  centerTab: CandidateMaterialsCenterTab;
  leftTab: CandidateMaterialsLeftTab;
}

function isCandidateMaterialsLeftTab(value: string): value is CandidateMaterialsLeftTab {
  return value === "ai" || value === "hr" || value === "questions";
}

function isCandidateMaterialsCenterTab(value: string): value is CandidateMaterialsCenterTab {
  return value === "detail" || value === "resume";
}

interface InterviewerCandidateMaterialsProps {
  active: boolean;
  inviteToken: string;
  onStateChange: (state: InterviewerCandidateMaterialsState) => void;
  state: InterviewerCandidateMaterialsState;
}

const MATERIALS_QUERY_OPTIONS = {
  gcTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
} as const;

const DIMENSION_ENTRIES = [
  ["skillMatch", "技能匹配"],
  ["experienceRelevance", "经验相关性"],
  ["projectMatch", "项目匹配"],
  ["educationBackground", "教育与背景"],
  ["potential", "潜力"],
  ["stability", "稳定性"],
] as const;

const HR_INFORMATION_ENTRIES = [
  ["jobMotivation", "求职动机"],
  ["availability", "当前状态与到岗"],
  ["overseasTravel", "个人情况与海外出差"],
  ["compensationExpectations", "薪酬情况与期望"],
  ["careerProgression", "绩效、加薪与晋升"],
  ["recentWork", "近期工作经历"],
  ["projectHighlights", "亮点项目"],
] as const;

const DIFFICULTY_LABEL = {
  easy: "基础",
  hard: "深入",
  medium: "进阶",
} as const;

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="加载中">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function ErrorBlock({ error, title }: { error: unknown; title: string }) {
  const message = error instanceof Error ? error.message : "请稍后重试。";
  return (
    <Alert className="m-4" variant="destructive">
      <IconAlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function EmptyBlock({ description, title }: { description?: string; title: string }) {
  return (
    <Empty className="min-h-52 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFileDescription />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

function AiEvaluationContent({
  data,
}: {
  data: { aiEvaluation: { evaluation: QualitativeResumeEvaluationV2; status: "ready" } };
}) {
  const { evaluation } = data.aiEvaluation;
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">综合建议</span>
          <QualitativeRecommendationIndicator level={evaluation.recommendationLevel} />
        </div>
        <p className="font-medium text-sm leading-6">{evaluation.conciseOverall}</p>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <QualitativeDimensionRadar compact evaluation={evaluation} />
      </div>
      <div className="flex flex-col gap-2">
        {DIMENSION_ENTRIES.map(([key, label]) => {
          const dimension = evaluation.dimensions[key];
          return (
            <section className="rounded-lg border bg-card p-3" key={key}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-sm">{label}</h3>
                <Badge variant="outline">{QUALITATIVE_RECOMMENDATION_LABEL[dimension.level]}</Badge>
              </div>
              <RestrictedMarkdownView
                className="mt-2 text-muted-foreground text-xs leading-5"
                content={dimension.evaluation}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CandidateAiEvaluation({ query }: { query: ReturnType<typeof useAiEvaluationQuery> }) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="AI 评价加载失败" />;
  }
  const { aiEvaluation } = query.data;
  if (aiEvaluation.status !== "ready") {
    let description: string | undefined;
    if (aiEvaluation.status === "pending") {
      description = "当前评价仍在生成中，本次进入资料页不会自动刷新。";
    } else if (aiEvaluation.status === "failed") {
      description = "最近一次 AI 评价未成功。";
    } else if (aiEvaluation.status === "legacy") {
      description = "历史数字评分不会转换成新版六维评价。";
    }
    return <EmptyBlock description={description} title="暂无可展示的六维 AI 评价" />;
  }
  return <AiEvaluationContent data={{ aiEvaluation }} />;
}

function CandidateHrInformation({ query }: { query: ReturnType<typeof useHrInformationQuery> }) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="HR 初面信息加载失败" />;
  }
  const information = query.data.hrInitialInformation;
  if (!information) {
    return <EmptyBlock title="暂无 HR 初面信息" />;
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-muted-foreground text-xs leading-5">
        {information.roundLabel ?? "AI 初面"} ·{" "}
        <LocalDateTimeText value={information.generatedAt} />
      </p>
      {HR_INFORMATION_ENTRIES.map(([key, label]) => (
        <section className="rounded-lg border bg-card p-3" key={key}>
          <h3 className="font-medium text-sm">{label}</h3>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-xs leading-5">
            {information.values[key] ?? "未收集到相关信息"}
          </p>
        </section>
      ))}
    </div>
  );
}

function CandidateQuestions({ query }: { query: ReturnType<typeof useQuestionsQuery> }) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="面试题参考加载失败" />;
  }
  if (query.data.interviewQuestions.length === 0) {
    return <EmptyBlock title="暂无面试题参考" />;
  }
  return (
    <ol className="flex flex-col gap-3 p-4">
      {query.data.interviewQuestions.map((question) => {
        const dimension = question.dimension ?? "business";
        return (
          <li
            className="rounded-lg border bg-card p-3"
            key={`${question.order}-${question.question}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-primary text-xs">{question.order}</span>
              <Badge variant="outline">{INTERVIEW_QUESTION_DIMENSION_LABEL[dimension]}</Badge>
              <Badge variant="secondary">{DIFFICULTY_LABEL[question.difficulty]}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6">{question.question}</p>
            {question.evaluationFocus ? (
              <p className="mt-2 text-muted-foreground text-xs leading-5">
                考核点：{question.evaluationFocus}
              </p>
            ) : null}
            {question.followUpDirections ? (
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                追问方向：{question.followUpDirections}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CandidateDetail({ query }: { query: ReturnType<typeof useOverviewQuery> }) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="候选人详情加载失败" />;
  }
  const { candidate } = query.data;
  return (
    <ScrollArea className="h-full" viewportClassName="h-full">
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconId className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-lg">{candidate.candidateName}</h2>
              <p className="truncate text-muted-foreground text-sm">
                {candidate.targetRole ?? "未填写目标岗位"}
              </p>
            </div>
          </div>
          <DataFields columns={3} density="compact">
            <DataField label="岗位" value={candidate.jobDescriptionName} />
            <DataField kind="email" label="邮箱" value={candidate.candidateEmail} />
            <DataField kind="phone" label="电话" value={candidate.candidatePhone} />
            <DataField label="录入人" value={candidate.creatorName} />
            <DataField label="简历文件" span={2} value={candidate.resumeFileName} />
          </DataFields>
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-semibold text-base">简历信息</h2>
          <ResumeProfileView
            profile={candidate.resumeProfile}
            showBasicInfo={false}
            showTargetRoles={false}
          />
        </section>
      </div>
    </ScrollArea>
  );
}

type InlineResumeKind = "docx" | "image" | "pdf" | "pptx" | "xlsx";

function InlineResumeDocument({
  fileName,
  isDark,
  kind,
  onIsDarkChange,
  sourceUrl,
}: {
  fileName: string | undefined;
  isDark: boolean;
  kind: InlineResumeKind;
  onIsDarkChange: (isDark: boolean) => void;
  sourceUrl: string;
}) {
  if (kind === "pdf" || kind === "pptx") {
    return (
      <InlinePdfViewer
        className="h-full"
        file={sourceUrl}
        showDownload={false}
        showUpload={false}
      />
    );
  }
  if (kind === "docx") {
    return (
      <InlineDocxViewer
        className="h-full"
        fileName={fileName}
        isDark={isDark}
        onIsDarkChange={onIsDarkChange}
        showDownload={false}
        showUpload={false}
        src={sourceUrl}
      />
    );
  }
  if (kind === "xlsx") {
    return (
      <InlineXlsxViewer
        className="h-full"
        fileName={fileName}
        isDark={isDark}
        onIsDarkChange={onIsDarkChange}
        showDownload={false}
        showUpload={false}
        src={sourceUrl}
      />
    );
  }
  return (
    <ScrollArea className="h-full" viewportClassName="h-full">
      <InlineImageViewer filename={fileName} url={sourceUrl} />
    </ScrollArea>
  );
}

function ResumePreview({
  query,
  inviteToken,
}: {
  query: ReturnType<typeof useOverviewQuery>;
  inviteToken: string;
}) {
  const [isDark, setIsDark] = useState(false);
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="简历信息加载失败" />;
  }
  const { candidate } = query.data;
  if (!candidate.hasResumeFile) {
    return <EmptyBlock title="候选人未上传简历文件" />;
  }
  const kind = getResumeDocumentKind({ fileName: candidate.resumeFileName ?? undefined });
  if (
    !(kind === "pdf" || kind === "pptx" || kind === "docx" || kind === "xlsx" || kind === "image")
  ) {
    return (
      <EmptyBlock
        description={`${candidate.resumeFileName ?? "当前文件"} 的格式暂不支持在线预览，会议资料页不提供下载。`}
        title="无法预览这份简历"
      />
    );
  }
  const sourceUrl =
    kind === "pptx"
      ? getHumanInterviewCandidatePptxPreviewUrl(inviteToken, candidate.id)
      : getHumanInterviewCandidateResumeUrl(inviteToken, candidate.id);

  return (
    <Suspense fallback={<LoadingBlock />}>
      <InlineResumeDocument
        fileName={candidate.resumeFileName ?? undefined}
        isDark={isDark}
        kind={kind}
        onIsDarkChange={setIsDark}
        sourceUrl={sourceUrl}
      />
    </Suspense>
  );
}

function useOverviewQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateMaterialDetail(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "overview"],
  });
}

function useAiEvaluationQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateAiEvaluation(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "ai-evaluation"],
  });
}

function useHrInformationQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateHrInformation(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "hr-information"],
  });
}

function useQuestionsQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateQuestions(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "questions"],
  });
}

export function InterviewerCandidateMaterials({
  active,
  inviteToken,
  onStateChange,
  state,
}: InterviewerCandidateMaterialsProps) {
  const listQuery = useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active,
    queryFn: () => fetchHumanInterviewCandidateMaterials(inviteToken),
    queryKey: ["human-interview-candidate-materials", inviteToken, "candidates"],
  });
  const candidates = listQuery.data?.candidates ?? [];
  const effectiveCandidateId = resolveEffectiveCandidateId(candidates, state.candidateId);
  const overviewQuery = useOverviewQuery(active, inviteToken, effectiveCandidateId);
  const aiQuery = useAiEvaluationQuery(active, inviteToken, effectiveCandidateId);
  const hrQuery = useHrInformationQuery(active, inviteToken, effectiveCandidateId);
  const questionsQuery = useQuestionsQuery(active, inviteToken, effectiveCandidateId);

  if (listQuery.isPending) {
    return <LoadingBlock />;
  }
  if (listQuery.isError) {
    return <ErrorBlock error={listQuery.error} title="候选人资料不可用" />;
  }
  if (!effectiveCandidateId) {
    return <EmptyBlock title="这场会议暂未关联候选人" />;
  }

  return (
    <div className="dark flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5">
        <span className="shrink-0 text-muted-foreground text-xs">当前候选人</span>
        <Select
          onValueChange={(candidateId) =>
            onStateChange({ ...state, candidateId: String(candidateId) })
          }
          value={effectiveCandidateId}
        >
          <SelectTrigger className="min-w-56 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  <span>{candidate.candidateName}</span>
                  {candidate.targetRole ? (
                    <span className="text-muted-foreground">· {candidate.targetRole}</span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="hidden truncate text-muted-foreground text-xs sm:block">
          {candidates
            .find((candidate) => candidate.id === effectiveCandidateId)
            ?.rounds.map((round) => round.label)
            .join(" · ")}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:overflow-hidden min-[1440px]:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_18rem]">
        <Tabs
          className="min-h-[32rem] min-w-0 gap-0 overflow-hidden rounded-xl border bg-card lg:min-h-0"
          onValueChange={(leftTab) => {
            if (isCandidateMaterialsLeftTab(leftTab)) {
              onStateChange({ ...state, leftTab });
            }
          }}
          value={state.leftTab}
        >
          <TabsList
            aria-label="候选人评价资料"
            className="m-2 grid h-auto w-auto shrink-0 grid-cols-3 items-stretch gap-1 data-[orientation=horizontal]:h-auto"
          >
            <TabsTrigger className="h-10! w-full px-3" value="ai">
              AI 评价
            </TabsTrigger>
            <TabsTrigger className="h-10! w-full px-3" value="hr">
              HR 初面
            </TabsTrigger>
            <TabsTrigger className="h-10! w-full px-3" value="questions">
              面试题
            </TabsTrigger>
          </TabsList>
          <TabsContent className="min-h-0 overflow-hidden" value="ai">
            <ScrollArea className="h-full" viewportClassName="h-full">
              <CandidateAiEvaluation query={aiQuery} />
            </ScrollArea>
          </TabsContent>
          <TabsContent className="min-h-0 overflow-hidden" value="hr">
            <ScrollArea className="h-full" viewportClassName="h-full">
              <CandidateHrInformation query={hrQuery} />
            </ScrollArea>
          </TabsContent>
          <TabsContent className="min-h-0 overflow-hidden" value="questions">
            <ScrollArea className="h-full" viewportClassName="h-full">
              <CandidateQuestions query={questionsQuery} />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Tabs
          className="min-h-[40rem] min-w-0 gap-0 overflow-hidden rounded-xl border bg-card lg:min-h-0"
          onValueChange={(centerTab) => {
            if (isCandidateMaterialsCenterTab(centerTab)) {
              onStateChange({ ...state, centerTab });
            }
          }}
          value={state.centerTab}
        >
          <TabsList
            aria-label="候选人简历资料"
            className="m-2 grid h-auto w-auto shrink-0 grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto"
          >
            <TabsTrigger className="h-10! w-full px-3" value="detail">
              详情
            </TabsTrigger>
            <TabsTrigger className="h-10! w-full px-3" value="resume">
              简历
            </TabsTrigger>
          </TabsList>
          <TabsContent className="min-h-0 overflow-hidden" value="detail">
            <CandidateDetail query={overviewQuery} />
          </TabsContent>
          <TabsContent className="min-h-0 overflow-hidden" value="resume">
            <ResumePreview inviteToken={inviteToken} query={overviewQuery} />
          </TabsContent>
        </Tabs>

        <aside
          aria-label="预留扩展区域"
          className="hidden min-h-0 rounded-xl border bg-card min-[1440px]:block"
        />
      </div>
    </div>
  );
}
