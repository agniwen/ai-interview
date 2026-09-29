"use client";

import { IconAlertTriangle, IconFileDescription, IconListDetails } from "@tabler/icons-react";
import type { QualitativeResumeEvaluationV2 } from "@app/db-schema/qualitative-resume-evaluation";
import { INTERVIEW_QUESTION_DIMENSION_LABEL } from "@app/db-schema/interview/types";
import { getResumeDocumentKind } from "@app/shared/resume-documents";
import { cn } from "@app/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  QUALITATIVE_RECOMMENDATION_LABEL,
  QualitativeDimensionRadar,
  QualitativeRecommendationIndicator,
} from "@/components/features/studio/resumes/qualitative-resume-evaluation-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { CandidateInterviewHistory } from "./candidate-interview-history";

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

export type CandidateMaterialsTab = "resume" | "evaluation" | "questions";

export interface InterviewerCandidateMaterialsState {
  candidateId: string | null;
  tab: CandidateMaterialsTab;
}

function isCandidateMaterialsTab(value: string): value is CandidateMaterialsTab {
  return value === "resume" || value === "evaluation" || value === "questions";
}

interface InterviewerCandidateMaterialsProps {
  showQuestions?: boolean;
  active: boolean;
  desktopTabsContainer?: HTMLElement | null;
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

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="加载中">
      <Skeleton className="h-24 w-full" variant="subtle" />
      <Skeleton className="h-16 w-full" variant="subtle" />
      <Skeleton className="h-16 w-full" variant="subtle" />
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
    <div className="@container">
      <section className="grid items-center gap-3 border-b pb-3 @min-[40rem]:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-60">
          <QualitativeDimensionRadar compact evaluation={evaluation} />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-base">综合建议</h3>
            <QualitativeRecommendationIndicator
              className="text-sm"
              level={evaluation.recommendationLevel}
            />
          </div>
          <RestrictedMarkdownView
            className="text-base leading-7"
            content={evaluation.detailedOverall.judgment}
          />
        </div>
      </section>
      <div className="grid gap-x-6 @min-[48rem]:grid-cols-2">
        {DIMENSION_ENTRIES.map(([key, label]) => {
          const dimension = evaluation.dimensions[key];
          return (
            <section
              className="min-w-0 border-b py-3 last:border-b-0 @min-[48rem]:nth-last-2:border-b-0"
              key={key}
            >
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-base">{label}</h3>
                <Badge className="text-sm" variant="outline">
                  {QUALITATIVE_RECOMMENDATION_LABEL[dimension.level]}
                </Badge>
              </div>
              <RestrictedMarkdownView
                className="mt-2 text-base leading-7"
                content={dimension.evaluation}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CandidateEvaluations({
  query,
  aiQuery,
}: {
  query: ReturnType<typeof useHrInformationQuery>;
  aiQuery: ReturnType<typeof useAiEvaluationQuery>;
}) {
  const aiEvaluation =
    aiQuery.data?.aiEvaluation.status === "ready" ? (
      <AiEvaluationContent data={{ aiEvaluation: aiQuery.data.aiEvaluation }} />
    ) : null;
  const aiStatus = (
    <>
      {aiQuery.isPending ? <LoadingBlock /> : null}
      {aiQuery.isError ? <ErrorBlock error={aiQuery.error} title="AI 评价加载失败" /> : null}
    </>
  );
  if (query.isPending || query.isError) {
    return (
      <>
        {query.isPending ? (
          <LoadingBlock />
        ) : (
          <ErrorBlock error={query.error} title="历史评价加载失败" />
        )}
        {aiStatus}
        {aiEvaluation}
      </>
    );
  }
  return (
    <>
      <CandidateInterviewHistory
        aiEvaluation={aiEvaluation}
        aiEvaluationGeneratedAt={aiQuery.data?.generatedAt}
        data={query.data}
      />
      {aiStatus}
    </>
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
    <ol className="divide-y px-6 pb-4 md:px-7">
      {query.data.interviewQuestions.map((question) => {
        const dimension = question.dimension ?? "business";
        return (
          <li className="space-y-3 py-5" key={`${question.order}-${question.question}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-medium text-muted-foreground text-sm">
                第 {question.order} 题
              </span>
              <Badge className="text-sm" variant="outline">
                {INTERVIEW_QUESTION_DIMENSION_LABEL[dimension]}
              </Badge>
            </div>
            <h3 className="whitespace-pre-wrap break-words font-semibold text-foreground text-lg leading-7">
              {question.question}
            </h3>
            {question.evaluationFocus || question.followUpDirections ? (
              <dl className="space-y-3 border-l-2 border-border pl-3">
                {question.evaluationFocus ? (
                  <div className="space-y-1">
                    <dt className="font-medium text-muted-foreground text-sm">考核点</dt>
                    <dd className="whitespace-pre-wrap break-words text-foreground text-base leading-7">
                      {question.evaluationFocus}
                    </dd>
                  </div>
                ) : null}
                {question.followUpDirections ? (
                  <div className="space-y-1">
                    <dt className="font-medium text-muted-foreground text-sm">追问方向</dt>
                    <dd className="whitespace-pre-wrap break-words text-foreground text-base leading-7">
                      {question.followUpDirections}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ResumeViewToggle({ onClick, structured }: { onClick: () => void; structured: boolean }) {
  const label = structured ? "查看简历原件" : "展示结构化数据";
  return (
    <Button
      aria-label={label}
      aria-pressed={structured}
      className="h-8 shrink-0 px-2 has-[>svg]:px-2"
      onClick={onClick}
      size="sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {structured ? (
        <IconFileDescription className="size-4" />
      ) : (
        <IconListDetails className="size-4" />
      )}
      <span className="hidden xl:inline">{label}</span>
    </Button>
  );
}

function CandidateDetail({
  query,
  toolbarAction,
}: {
  query: ReturnType<typeof useOverviewQuery>;
  toolbarAction: ReactNode;
}) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="候选人详情加载失败" />;
  }
  const { candidate } = query.data;
  const candidateName = candidate.candidateName.trim() || "未命名候选人";
  const avatarLabel =
    candidate.candidateName.trim() || candidate.candidateEmail?.trim() || "候选人";
  const avatarValue = avatarLabel.slice(0, 1).toUpperCase();
  return (
    <ScrollArea className="h-full" scrollFade scrollbars="leave">
      <div className="flex flex-col gap-8 p-5 lg:p-7">
        <header className="flex min-w-0 items-center gap-3">
          <Avatar
            className="size-14 shrink-0"
            generatedSize={56}
            label={`${avatarLabel}的头像`}
            seed={candidateName}
          >
            <AvatarFallback>{avatarValue}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <h2 className="truncate font-semibold text-2xl tracking-normal">{candidateName}</h2>
              <span className="font-normal text-[14px] text-muted-foreground/60">
                ({formatResumeRecordDisplayId(candidate.id)})
              </span>
            </div>
            <p className="mt-2 truncate text-muted-foreground text-sm">
              {candidate.jobDescriptionName ?? candidate.targetRole ?? "未关联岗位"}
            </p>
          </div>
          <div className="ml-auto shrink-0 self-start">{toolbarAction}</div>
        </header>

        <section className="border-border/50 border-t pt-6">
          <h3 className="mb-3 font-medium text-sm">候选人信息</h3>
          <DataFields columns={3} density="compact">
            <DataField label="姓名" value={candidateName} />
            <DataField label="关联岗位" value={candidate.jobDescriptionName} />
            <DataField label="求职意向" value={candidate.targetRole} />
            <DataField kind="email" label="邮箱" value={candidate.candidateEmail} />
            <DataField kind="phone" label="电话" value={candidate.candidatePhone} />
            <DataField label="创建人" value={candidate.creatorName} />
          </DataFields>
        </section>

        <section className="border-border/50 border-t pt-6">
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
  toolbarAction,
}: {
  fileName: string | undefined;
  isDark: boolean;
  kind: InlineResumeKind;
  onIsDarkChange: (isDark: boolean) => void;
  sourceUrl: string;
  toolbarAction: ReactNode;
}) {
  if (kind === "pdf" || kind === "pptx") {
    return (
      <InlinePdfViewer
        className="h-full"
        enableModifierWheelZoom
        enableTouchPinchZoom
        file={sourceUrl}
        fitWidthOnMobile
        scrollFade
        showDownload={false}
        showRotateControlsOnMobile={false}
        showSearchOnMobile={false}
        showUpload={false}
        toolbarActions={toolbarAction}
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
        toolbarActions={toolbarAction}
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
        toolbarActions={toolbarAction}
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end p-2">{toolbarAction}</div>
      <ScrollArea className="min-h-0 flex-1" scrollFade scrollbars="leave">
        <InlineImageViewer filename={fileName} url={sourceUrl} />
      </ScrollArea>
    </div>
  );
}

function ResumePreviewFallback({
  children,
  toolbarAction,
}: {
  children: ReactNode;
  toolbarAction: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end p-2">{toolbarAction}</div>
      {children}
    </div>
  );
}

function ResumePreview({
  query,
  inviteToken,
  toolbarAction,
}: {
  query: ReturnType<typeof useOverviewQuery>;
  inviteToken: string;
  toolbarAction: ReactNode;
}) {
  const [isDark, setIsDark] = useState(false);
  if (query.isPending) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <LoadingBlock />
      </ResumePreviewFallback>
    );
  }
  if (query.isError) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <ErrorBlock error={query.error} title="简历信息加载失败" />
      </ResumePreviewFallback>
    );
  }
  const { candidate } = query.data;
  if (!candidate.hasResumeFile) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <EmptyBlock title="候选人未上传简历文件" />
      </ResumePreviewFallback>
    );
  }
  const kind = getResumeDocumentKind({ fileName: candidate.resumeFileName ?? undefined });
  if (
    !(kind === "pdf" || kind === "pptx" || kind === "docx" || kind === "xlsx" || kind === "image")
  ) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <EmptyBlock
          description={`${candidate.resumeFileName ?? "当前文件"} 的格式暂不支持在线预览，会议资料页不提供下载。`}
          title="无法预览这份简历"
        />
      </ResumePreviewFallback>
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
        toolbarAction={toolbarAction}
      />
    </Suspense>
  );
}

function MaterialTab({
  value,
  children,
}: {
  value: InterviewerCandidateMaterialsState["tab"];
  children: ReactNode;
}) {
  return (
    <TabsContent
      keepMounted
      motion="page"
      className="relative min-h-0 overflow-hidden [--distance-base:4rem]"
      value={value}
    >
      {children}
    </TabsContent>
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
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "history"],
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
  showQuestions = false,
  active,
  desktopTabsContainer,
  inviteToken,
  onStateChange,
  state,
}: InterviewerCandidateMaterialsProps) {
  const isMobile = useIsMobile();
  const [showStructuredResume, setShowStructuredResume] = useState(false);
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
  const questionsQuery = useQuestionsQuery(
    active && showQuestions,
    inviteToken,
    effectiveCandidateId,
  );
  if (listQuery.isPending) {
    return <LoadingBlock />;
  }
  if (listQuery.isError) {
    return <ErrorBlock error={listQuery.error} title="候选人资料不可用" />;
  }
  if (!effectiveCandidateId) {
    return <EmptyBlock title="这场会议暂未关联候选人" />;
  }

  const candidateSelector =
    candidates.length > 1 ? (
      <Select
        onValueChange={(candidateId) =>
          onStateChange({ ...state, candidateId: String(candidateId) })
        }
        value={effectiveCandidateId}
      >
        <SelectTrigger aria-label="切换候选人" className="mx-2 mt-2 w-auto max-w-full">
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
    ) : null;
  const activeTab = !showQuestions && state.tab === "questions" ? "resume" : state.tab;
  const tabsInHeader = !isMobile && desktopTabsContainer !== undefined;
  const tabsList = (
    <TabsList
      aria-label="候选人资料"
      className={cn(
        "mx-2 w-auto shrink-0 self-stretch md:mx-3",
        tabsInHeader && "mx-0 w-full self-auto md:mx-0",
      )}
    >
      <TabsTrigger className="h-8 min-w-0 flex-1 px-3 text-sm" value="resume">
        简历
      </TabsTrigger>
      <TabsTrigger className="h-8 min-w-0 flex-1 px-3 text-sm" value="evaluation">
        评价
      </TabsTrigger>
      {showQuestions ? (
        <TabsTrigger className="h-8 min-w-0 flex-1 px-3 text-sm" value="questions">
          面试题
        </TabsTrigger>
      ) : null}
    </TabsList>
  );
  const resumeViewToggle = (
    <ResumeViewToggle
      onClick={() => setShowStructuredResume((current) => !current)}
      structured={showStructuredResume}
    />
  );
  return (
    <Tabs
      className="h-full min-h-0 gap-0 overflow-hidden bg-background text-foreground"
      value={activeTab}
      onValueChange={(tab) => {
        if (isCandidateMaterialsTab(tab) && tab !== activeTab) {
          onStateChange({ ...state, tab });
        }
      }}
    >
      {candidateSelector}
      {tabsInHeader
        ? desktopTabsContainer && createPortal(tabsList, desktopTabsContainer)
        : tabsList}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MaterialTab value="resume">
          <div className="h-full min-h-0">
            {showStructuredResume ? (
              <CandidateDetail query={overviewQuery} toolbarAction={resumeViewToggle} />
            ) : (
              <ResumePreview
                inviteToken={inviteToken}
                query={overviewQuery}
                toolbarAction={resumeViewToggle}
              />
            )}
          </div>
        </MaterialTab>
        <MaterialTab value="evaluation">
          <ScrollArea className="h-full" scrollFade scrollbars="leave">
            <CandidateEvaluations key={effectiveCandidateId} aiQuery={aiQuery} query={hrQuery} />
          </ScrollArea>
        </MaterialTab>
        {showQuestions ? (
          <MaterialTab value="questions">
            <ScrollArea className="h-full" scrollFade scrollbars="leave">
              <CandidateQuestions query={questionsQuery} />
            </ScrollArea>
          </MaterialTab>
        ) : null}
      </div>
    </Tabs>
  );
}
