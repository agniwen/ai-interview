// 用途：以近景插画和单一焦点 UI 讲清招聘链路中的三个关键动作。
// Purpose: explains three recruiting actions with close-up editorial scenes and focused UI.

import { IconBriefcase, IconMicrophone, IconSparkles } from "@tabler/icons-react";
import { RESUME_REVIEW_DIMENSIONS } from "@app/shared/resume-review";
import { cn } from "@app/shared/utils";
import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import * as messages from "@/paraglide/messages";
import { getHomeCalibrationCopy } from "./home-calibration-copy";
import { getHomeDemoCopy } from "./home-demo-copy";
import { getDemoScreenCopy } from "./screens/demo-screen-copy";
import { Section, SectionHeader } from "./section";
import type { StageArtworkTone } from "./stage-artwork";
import { StageArtwork } from "./stage-artwork";

interface Story {
  description: string;
  id: "calibration" | "evidence" | "human" | "interview";
  /** 标签页与卡片标题用的短名。 Short name for the tab and card title. */
  label: string;
  points: [string, string];
  title: string;
  visual: ReactNode;
}

const CANDIDATE_REVIEW_SCORE = 87;
const CANDIDATE_REVIEW_VALUES = {
  educationBackground: 80,
  experienceRelevance: 88,
  potential: 82,
  projectMatch: 86,
  skillMatch: 92,
  stability: 78,
} as const;
// 三个故事面板用相邻色调错开，和首屏舞台同一色系。 Neighbouring tones keep the panels distinct.
const STORY_TONES = {
  calibration: "azure",
  evidence: "indigo",
  human: "blue",
  interview: "sky",
} satisfies Record<Story["id"], StageArtworkTone>;
function CandidateScoreCard() {
  const copy = getHomeDemoCopy().feature;
  const reviewDimensions = RESUME_REVIEW_DIMENSIONS.map(({ key, weight }) => ({
    key,
    label: copy.dimensionLabels[key],
    score: CANDIDATE_REVIEW_VALUES[key],
    weight: Math.round(weight * 100),
  }));
  const radarDimensions = reviewDimensions.map((dimension) => ({
    ...dimension,
    label: copy.radarLabels[dimension.key],
  }));

  return (
    <Card
      className="w-[min(96%,32rem)] overflow-hidden rounded-[10px] before:rounded-[9px] border-transparent bg-card shadow-large"
      data-density="compact"
      data-slot="candidate-score-card"
    >
      <CardHeader className="grid grid-rows-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar label={copy.avatarLabel} seed="candidate:明日香">
            <AvatarFallback>{copy.candidateName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h4 className="truncate font-semibold text-sm">{copy.candidateName}</h4>
              <Badge variant="success">{copy.recommendInterview}</Badge>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground text-[11px]">
              <IconBriefcase aria-hidden className="size-3.5 shrink-0" />
              {copy.candidateRole}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <p className="font-semibold text-2xl tabular-nums leading-none">
            {CANDIDATE_REVIEW_SCORE}
          </p>
          <p className="text-[10px] text-muted-foreground">{copy.overallScore}</p>
        </div>
      </CardHeader>

      <CardPanel
        className=" mx-auto grid min-h-16! w-full max-w-116 min-w-0 content-center gap-2 px-2.5 py-2.5 min-[360px]:grid-cols-[8.75rem_minmax(0,1fr)] min-[360px]:items-center sm:grid-cols-[9.75rem_minmax(0,1fr)] sm:px-3"
        data-alignment="centered"
        data-mobile-layout="radar-scores"
      >
        <div className="min-w-0" data-slot="candidate-score-radar">
          <DimensionRadarChart
            ariaLabel={copy.radarAria}
            className="h-[9.75rem] min-h-[9.75rem] max-w-[8.75rem] sm:max-w-[9.75rem]"
            compact
            dimensions={radarDimensions}
            height={156}
          />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-2 sm:gap-x-3">
          {reviewDimensions.map((dimension) => (
            <div
              className="flex min-w-0 items-baseline justify-between gap-2 border-b py-1.5"
              data-score-dimension={dimension.key}
              key={dimension.key}
            >
              <span className="truncate text-muted-foreground text-[11px]">{dimension.label}</span>
              <span className="shrink-0 font-medium text-xs tabular-nums">{dimension.score}</span>
            </div>
          ))}
        </div>
      </CardPanel>

      <CardFooter className="gap-2 border-t px-3 py-2 text-[11px] leading-relaxed">
        <IconSparkles aria-hidden className="size-3.5 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{copy.matchLead}</span>
          {copy.matchBody}
        </p>
      </CardFooter>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-foreground text-base tabular-nums leading-none">{value}</p>
      <p className="mt-1 truncate text-[10px] text-foreground/45">{label}</p>
    </div>
  );
}

/**
 * 麦克风两侧的音频谱线高度（相对值）。两侧各取一段不规则的起伏，不做镜像对称，读起来更像真实的人声。
 * Spectrum heights either side of the mic; each side is its own irregular run rather than a mirror, like real speech.
 */
const VOICE_SPECTRUM_LEFT = [
  0.15, 0.2, 0.35, 0.25, 0.5, 0.3, 0.2, 0.45, 0.7, 0.4, 0.55, 0.3, 0.65, 0.85, 0.5, 0.35, 0.6,
];
const VOICE_SPECTRUM_RIGHT = [
  0.55, 0.8, 0.45, 0.3, 0.6, 0.4, 0.25, 0.5, 0.35, 0.2, 0.4, 0.3, 0.45, 0.25, 0.2, 0.3, 0.15,
];

function VoiceSpectrum({ bars }: { bars: readonly number[] }) {
  return (
    <div aria-hidden="true" className="flex h-7 flex-1 items-center justify-center gap-[3px]">
      {bars.map((height, index) => (
        <span
          className="home-voice-bar w-[2px] rounded-full bg-white/85"
          // 谱线条是固定位置。 Spectrum bars are fixed positions.
          key={`${index}-${height}`}
          style={{
            animationDelay: `${((index * 7) % 11) * 70}ms`,
            height: `${height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

/** 一轮语音对话：名字在气泡外，两种角色的气泡圆角与留白一致，只靠左右对齐区分。 */
// One spoken turn: the name sits outside the bubble; both roles share radius and padding, differing only by side.
function VoiceTurn({
  align = "start",
  name,
  text,
}: {
  align?: "end" | "start";
  name: string;
  text: string;
}) {
  const end = align === "end";
  return (
    <div
      className={cn("flex max-w-[88%] flex-col gap-1", end ? "items-end self-end" : "items-start")}
    >
      <span className="px-1 text-[10px] text-white/85 leading-none">{name}</span>
      <p className="line-clamp-3 rounded-[10px] bg-card px-3 py-2 text-[11px] text-foreground/80 leading-relaxed shadow-large">
        {text}
      </p>
    </div>
  );
}

/** AI 面试：AI 面试官语音提问、候选人语音作答，底部是通话中的语音条而不是文字输入框。 */
// AI interview: the AI interviewer asks by voice and the candidate answers; the footer is a live voice bar, not a text composer.
function AiInterviewVoiceChat() {
  const { agentState, aiInterview, conversation, people } = getDemoScreenCopy();
  const [first, second] = conversation;

  return (
    <div className="flex w-full max-w-[31rem] flex-col gap-2.5">
      <div className="flex flex-col gap-2.5" data-slot="interview-messages">
        <VoiceTurn name={aiInterview.aiInterviewer} text={first.question} />
        <VoiceTurn align="end" name={people.candidate} text={first.answer} />
        <VoiceTurn name={aiInterview.aiInterviewer} text={second.question} />
      </div>
      {/* 语音条直接落在舞台上：白色麦克风居中，两侧是白色谱线，不再套卡片。
          The voice bar sits straight on the stage: a white mic with white spectrum lines, no card. */}
      <div className="mt-2 flex w-full flex-col items-center gap-2" data-slot="interview-voice-bar">
        <div className="flex w-full items-center gap-4">
          <VoiceSpectrum bars={VOICE_SPECTRUM_LEFT} />
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-primary shadow-[0_6px_18px_-8px_rgba(15,23,42,0.45)]">
            <IconMicrophone aria-hidden className="size-5" />
          </span>
          <VoiceSpectrum bars={VOICE_SPECTRUM_RIGHT} />
        </div>
        <p className="text-[11px] text-white/85 leading-none">
          {agentState.listening}
          <span className="ml-2 font-mono tabular-nums">04:32</span>
        </p>
      </div>
    </div>
  );
}

function PersonAvatar({ kind, name, size = 20 }: { kind: string; name: string; size?: number }) {
  return (
    <Avatar
      className="ring-2 ring-background"
      label={name}
      seed={`${kind}:${name}`}
      size="sm"
      style={{ height: size, width: size }}
    >
      <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * 真人面试进行中的信息协同：左侧候选人画面，右侧同屏共享 AI 初面结论、当前追问，以及面试官实时记下的评价。
 * Human interview in progress: candidate video on the left; on the right, the shared AI-interview
 * verdict, the question being asked now, and evaluation notes the interviewers write live.
 */
function HumanInterviewRoundCard() {
  const { humanEvaluation, humanInterview, people, room, round } = getDemoScreenCopy();
  const notes = [
    {
      label: room.reviewFields.strengths,
      name: people.interviewer,
      text: humanEvaluation.strengths,
    },
    { label: room.reviewFields.risks, name: people.recruiter, text: humanEvaluation.risks },
  ];

  return (
    <div className="w-full max-w-[34rem] overflow-hidden rounded-[10px] bg-card shadow-large">
      <div className="flex items-center justify-between gap-3 border-border/60 border-b px-3.5 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-[12px]">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/50 motion-reduce:animate-none" />
            <span className="relative size-2 rounded-full bg-red-500" />
          </span>
          <span className="truncate font-medium text-foreground">
            {round.title(1, humanInterview.roundLabel)}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {room.recording} · <span className="font-mono tabular-nums">18:24</span>
          </span>
        </p>
        <div className="flex shrink-0 -space-x-1.5">
          <PersonAvatar name={people.interviewer} kind="interviewer" />
          <PersonAvatar name={people.recruiter} kind="recruiter" />
          <PersonAvatar name={people.candidate} kind="candidate" />
        </div>
      </div>

      <div className="grid grid-cols-[10.5rem_minmax(0,1fr)]">
        {/* 候选人画面。 Candidate video tile. */}
        <div className="border-border/60 border-r p-3">
          <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-[8px] bg-[linear-gradient(160deg,#1e293b,#0f172a)]">
            <PersonAvatar name={people.candidate} kind="candidate" size={52} />
            <span className="absolute bottom-2 left-2 rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
              {people.candidate} · {room.candidateRole}
            </span>
            <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-black/45 text-white/90">
              <IconMicrophone aria-hidden className="size-3" />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <PersonAvatar name={people.interviewer} kind="interviewer" size={16} />
            <span className="truncate">
              {people.interviewer} · {room.hostRole}
            </span>
          </div>
        </div>

        {/* 同屏共享的材料与实时笔记。 Shared materials and live notes. */}
        <div className="flex min-w-0 flex-col gap-2.5 p-3">
          <div className="rounded-[8px] bg-primary/[0.06] px-2.5 py-2">
            <p className="flex items-center gap-1.5 font-medium text-[11px] text-primary">
              <IconSparkles aria-hidden className="size-3" />
              {room.historyRoundLabel}
            </p>
          </div>
          <div className="rounded-[8px] bg-muted/60 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">{room.referenceQuestion(2)}</p>
            <p className="mt-0.5 font-medium text-[12px] text-foreground">
              {humanInterview.focusItems[1]}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground">{room.review}</p>
            {notes.map((note) => (
              <div className="flex items-start gap-2" key={note.label}>
                <PersonAvatar name={note.name} kind="interviewer" size={18} />
                <p className="min-w-0 text-[11px] text-foreground/80 leading-relaxed">
                  <span className="font-medium text-foreground">{note.label}</span>
                  <span className="text-muted-foreground"> · {note.name}</span>
                  <span className="mt-0.5 line-clamp-2 block">{note.text}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCalibrationCard() {
  const copy = getHomeDemoCopy().feature;
  const calibration = getHomeCalibrationCopy();

  return (
    <div className="flex w-full max-w-[36rem] flex-col">
      <div
        className="overflow-hidden rounded-[10px] border border-transparent bg-card p-4 shadow-large sm:p-5"
        data-density="compact"
        data-layout="review-summary"
        data-slot="team-calibration-card"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(10rem,1.15fr)_minmax(11rem,1.35fr)_auto] sm:gap-x-5">
          <div className="order-1 min-w-0">
            <p className="font-medium text-foreground text-sm">{calibration.calibrationTitle}</p>
            <p className="mt-0.5 text-foreground/50 text-xs">{copy.calibrationComplete}</p>
          </div>
          <Badge className="order-2 justify-self-end sm:order-3" variant="success">
            {copy.recommendNext}
          </Badge>
          <div
            className="order-3 col-span-2 grid grid-cols-3 gap-3 sm:order-2 sm:col-span-1 sm:gap-4"
            data-slot="team-calibration-metrics"
          >
            <Metric label={copy.metrics.fit} value="88" />
            <Metric label={copy.metrics.evidence} value="84" />
            <Metric label={copy.metrics.risk} value={copy.low} />
          </div>
        </div>

        <div className="mt-5 rounded-[8px] bg-primary/[0.045] p-3.5">
          <p className="font-medium text-xs text-primary">{calibration.calibrationEvidence}</p>
          <p className="mt-2 text-foreground text-xs leading-relaxed">
            {calibration.calibrationEvidenceBody}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">{calibration.calibrationSource}</p>
        </div>

        <ul className="mt-2 flex flex-col divide-y divide-border/60">
          {calibration.calibrationReviewers.map((reviewer, index) => (
            <li className="flex items-start gap-2.5 py-3.5" key={reviewer.name}>
              <Avatar label={reviewer.name} seed={`interviewer:${reviewer.name}`} size="sm">
                <AvatarFallback>{reviewer.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="font-medium text-xs">{reviewer.name}</p>
                  <p className="text-[10px] text-muted-foreground">{reviewer.role}</p>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  {reviewer.note}
                </p>
              </div>
              <Badge variant={index === 2 ? "warning" : "success"}>{reviewer.judgment}</Badge>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2 border-t border-border/60 pt-3">
          <IconSparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {copy.calibrationComment}
          </p>
        </div>
      </div>
    </div>
  );
}

function getStories(): Story[] {
  return [
    {
      description: messages.home_feature_evidence_description(),
      id: "evidence",
      label: messages.home_feature_evidence_label(),
      points: [
        messages.home_feature_evidence_point_one(),
        messages.home_feature_evidence_point_two(),
      ],
      title: messages.home_feature_evidence_title(),
      visual: <CandidateScoreCard />,
    },
    {
      description: messages.home_feature_chat_description(),
      id: "interview",
      label: messages.home_feature_chat_label(),
      points: [messages.home_feature_chat_point_one(), messages.home_feature_chat_point_two()],
      title: messages.home_feature_chat_title(),
      visual: <AiInterviewVoiceChat />,
    },
    {
      description: messages.home_feature_human_description(),
      id: "human",
      label: messages.home_feature_human_label(),
      points: [messages.home_feature_human_point_one(), messages.home_feature_human_point_two()],
      title: messages.home_feature_human_title(),
      visual: <HumanInterviewRoundCard />,
    },
    {
      description: messages.home_feature_team_description(),
      id: "calibration",
      label: messages.home_feature_team_label(),
      points: [messages.home_feature_team_point_one(), messages.home_feature_team_point_two()],
      title: messages.home_feature_team_title(),
      visual: <TeamCalibrationCard />,
    },
  ];
}

/**
 * 对齐 qoder 产品展示卡：左侧标签 + 标题 + 副标题 + 说明，右侧内嵌预览面板。
 * Mirrors qoder's showcase card: tags, title, subtitle and copy on the left, inset preview on the right.
 */
/**
 * 预览画布固定 720×517（qoder 预览槽的 1.39 比例），按容器宽度整体缩放，各断点内容一致；
 * 画布比实际槽位略大，片段 UI 缩小后四周留出呼吸空间。
 */
// Fixed 720x517 preview canvas (qoder's 1.39 slot ratio) scaled to the slot width; slightly larger
// than the slot so fragment UI shrinks a little and keeps breathing room at every breakpoint.
const PREVIEW_WIDTH = 720;
const PREVIEW_HEIGHT = 517;

/**
 * 对齐 qoder 产品展示卡：≥1280 左文右图（1040×480）；更窄时预览在上、文案在下。
 * Mirrors qoder's showcase card: copy left / preview right at ≥1280, preview above copy below that.
 */
function StoryCard({ story }: { story: Story }) {
  return (
    <article
      // 外圆角 18 = 内边距 10 + 预览圆角 8，内外同心。 Outer 18 = 10 padding + 8 inner radius, so corners stay concentric.
      className="flex h-full select-none flex-col overflow-hidden rounded-[18px] border border-transparent bg-card shadow-default px-2.5 pt-2.5 pb-5 xl:grid xl:h-[30rem] xl:grid-cols-[minmax(0,1fr)_40.5rem] xl:gap-7 xl:py-2.5 xl:pr-2.5 xl:pl-8"
      data-feature-story={story.id}
    >
      <div
        className="relative w-full select-none overflow-hidden rounded-[8px] xl:order-2 xl:self-center [&_[data-slot=badge]]:rounded-[8px]"
        style={{
          aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`,
          containerType: "inline-size",
        }}
      >
        <StageArtwork composition="panel" tone={STORY_TONES[story.id]} />
        <div
          className="absolute top-0 left-0 flex items-center justify-center p-8"
          style={{
            height: PREVIEW_HEIGHT,
            transform: `scale(calc(100cqi / ${PREVIEW_WIDTH}px))`,
            transformOrigin: "top left",
            width: PREVIEW_WIDTH,
          }}
        >
          {story.visual}
        </div>
      </div>

      {/* 文案区可拖选文字，不触发轮播拖拽（见 watchDrag）。 Copy stays selectable and never starts a carousel drag. */}
      <div
        className="flex cursor-text select-text flex-col justify-center px-1.5 pt-5 xl:order-1 xl:px-0 xl:pt-0"
        data-carousel-text
      >
        <h3 className="font-medium text-[1.375rem] text-foreground leading-7 xl:text-[1.625rem] xl:leading-8">
          {story.label}
        </h3>
        <p className="mt-1 text-pretty font-medium text-[1.0625rem] text-foreground/62 leading-6 xl:text-xl xl:leading-7">
          {story.title}
        </p>
        <p className="mt-4 max-w-[21rem] text-[13px] text-muted-foreground leading-[1.65] max-xl:max-w-none">
          {story.description}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {story.points.map((point) => (
            <span
              className="rounded-full border border-border px-3 py-1 font-medium text-[13px] text-muted-foreground leading-[18px]"
              key={point}
            >
              {point}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function FeatureBlocks() {
  const stories = getStories();
  // 拖拽、惯性吸附、无限循环交给 embla；居中对齐、邻卡露出。duration 稍大让换页更从容。
  // Embla owns drag, snapping and looping; center-aligned with peeking neighbours.
  const [viewportRef, embla] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    duration: 32,
    loop: true,
    // 在文案上按下时交给浏览器选中文字；其他区域才拖动轮播。
    // Pressing on copy selects text; anywhere else drags the carousel.
    watchDrag: (_api, event) =>
      !(event.target instanceof Element && event.target.closest("[data-carousel-text]")),
  });
  const [activeStory, setActiveStory] = useState(0);

  useEffect(() => {
    if (!embla) {
      return;
    }
    const onSelect = () => setActiveStory(embla.selectedScrollSnap());
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onSelect);
    };
  }, [embla]);

  // 循环模式下 embla 会走最短方向。 In loop mode embla takes the shortest direction.
  const select = (index: number) => embla?.scrollTo(index);

  return (
    <Section>
      <SectionHeader
        align="center"
        lead={messages.home_features_lead()}
        title={messages.home_features_title()}
      />

      <div
        aria-label={messages.home_features_title()}
        className="mt-8 flex flex-wrap justify-center gap-3 sm:gap-4"
        role="tablist"
      >
        {stories.map((story, index) => {
          const selected = index === activeStory;
          return (
            <button
              aria-controls={`feature-story-${story.id}`}
              aria-selected={selected}
              className={cn(
                "h-9 rounded-full border px-5 font-medium text-sm transition-colors duration-300",
                selected
                  ? "border-transparent bg-card text-foreground shadow-default"
                  : "border-transparent bg-home-canvas text-muted-foreground hover:text-foreground dark:bg-white/[0.06]",
              )}
              key={story.id}
              onClick={() => select(index)}
              role="tab"
              type="button"
            >
              {story.label}
            </button>
          );
        })}
      </div>

      {/* 通栏视口：当前卡居中，两侧露出相邻卡。 Full-bleed viewport: active card centered, neighbours peek. */}
      <div
        className="relative left-1/2 mt-6 w-screen -translate-x-1/2 cursor-grab overflow-hidden py-2 active:cursor-grabbing lg:mt-8"
        ref={viewportRef}
      >
        {/* Embla 推荐的间距写法：slide 只留左侧内边距，容器用等量负边距抵消。 Embla's leading-padding spacing. */}
        <div className="-ml-4 flex items-stretch md:-ml-8">
          {stories.map((story, slot) => {
            const isActive = slot === activeStory;
            return (
              // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 键盘走上方标签。 Keyboard users use the tabs.
              <div
                // 卡宽对齐 qoder：手机 视口-2.5rem / 间距 1rem，≥768 42rem，≥1280 65rem，间距 2rem。
                // Card widths follow qoder: viewport-2.5rem on phones, 42rem from 768px, 65rem from 1280px.
                className="min-w-0 shrink-0 grow-0 basis-[calc(100vw-1.5rem)] pl-4 md:basis-[calc(42rem+2rem)] md:pl-8 xl:basis-[calc(65rem+2rem)]"
                key={story.id}
                // 点击露出的邻卡切换过去；embla 会吞掉拖拽结束时的点击。
                // Clicking a peeking card moves to it; embla swallows the click that ends a drag.
                onClick={() => {
                  if (!isActive) {
                    embla?.scrollTo(slot);
                  }
                }}
              >
                <div
                  aria-hidden={!isActive}
                  className="h-full"
                  id={isActive ? `feature-story-${story.id}` : undefined}
                  inert={!isActive}
                  role={isActive ? "tabpanel" : undefined}
                >
                  <StoryCard story={story} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}
