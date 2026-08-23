// 用途：以近景插画和单一焦点 UI 讲清招聘链路中的三个关键动作。
// Purpose: explains three recruiting actions with close-up editorial scenes and focused UI.

import { IconBriefcase, IconSparkles } from "@tabler/icons-react";
import { RESUME_REVIEW_DIMENSIONS } from "@arc/shared/resume-review";
import { cn } from "@arc/shared/utils";
import type { ReactNode } from "react";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { DimensionRadarChart } from "@/components/ui/chart-radar";
import * as messages from "@/paraglide/messages";
import { getHomeDemoCopy } from "./home-demo-copy";
import { ModernArtwork } from "./modern-artwork";
import { Section, SectionLead, SectionTitle } from "./section";

interface Story {
  darkImage: string;
  description: string;
  id: "calibration" | "evidence" | "interview";
  image: string;
  imagePosition: string;
  optimizedDarkImage: string;
  optimizedImage: string;
  points: [string, string];
  title: string;
  visual: ReactNode;
  visualPosition: "bottom-left" | "bottom-right" | "top-right";
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
const STORY_SCENE_HEIGHTS = {
  calibration: "min-h-[22rem] sm:min-h-[30rem]",
  evidence: "min-h-[24rem] sm:min-h-[32rem]",
  interview: "min-h-[28rem] sm:min-h-[34rem]",
} satisfies Record<Story["id"], string>;
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
      className="w-[min(96%,32rem)] overflow-hidden rounded-xl border-border/70 bg-background/95 shadow-[0_22px_56px_-34px_rgba(15,23,42,0.55)]"
      data-density="compact"
      data-slot="candidate-score-card"
    >
      <CardHeader className="grid grid-rows-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar generatedSize={36} label={copy.avatarLabel} seed="candidate:李晗">
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

function CandidateAgentChat() {
  const copy = getHomeDemoCopy().feature;

  return (
    <div className="flex w-full max-w-[31rem] flex-col gap-2.5">
      <div className="flex flex-col gap-2" data-slot="interview-messages">
        {copy.agentMessages.map((message, index) => (
          <Message
            className="gap-0"
            data-message-role={message.role}
            from={message.role}
            key={`${message.role}-${index}`}
          >
            <MessageContent
              className={cn(
                "max-w-[88%] rounded-md px-3 py-2 text-[11px] leading-relaxed shadow-[0_12px_36px_-26px_rgba(15,23,42,0.7)]",
                message.role === "assistant" && "bg-background/82 text-foreground/80",
              )}
            >
              {message.role === "assistant" ? (
                <div className="flex items-start gap-2">
                  <IconSparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium text-[10px] text-primary leading-none">Agent</p>
                    <p className="mt-1">{message.content}</p>
                  </div>
                </div>
              ) : (
                message.content
              )}
            </MessageContent>
          </Message>
        ))}
      </div>
      <div
        className="w-full rounded-lg bg-background/95 p-2 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.5)]"
        data-density="compact"
        data-slot="interview-composer"
      >
        <div className="rounded-md bg-muted/70 px-3 py-2.5">
          <p className="min-h-8 text-[12px] text-foreground/45 leading-relaxed">
            {copy.placeholder}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] text-foreground/45">{copy.send}</span>
            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
              <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
                <path
                  d="M6 9.5V2.5M3.25 5.25 6 2.5l2.75 2.75"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.4"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCalibrationCard() {
  const copy = getHomeDemoCopy().feature;

  return (
    <div className="flex w-full max-w-[36rem] flex-col">
      <div
        className="rounded-lg bg-background/95 p-3 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.5)] dark:bg-background/92"
        data-density="compact"
        data-layout="horizontal"
        data-slot="team-calibration-card"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(10rem,1.15fr)_minmax(11rem,1.35fr)_auto] sm:gap-x-5">
          <div className="order-1 min-w-0">
            <p className="font-medium text-foreground text-sm">{copy.calibrationTitle}</p>
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

        <div className="mt-3 flex items-center gap-2 border-t border-border/55 pt-2.5">
          <Avatar generatedSize={24} label={copy.interviewerAvatar} seed="interviewer:郭" size="sm">
            <AvatarFallback>郭</AvatarFallback>
          </Avatar>
          <p className="text-[11px] text-foreground/70 leading-relaxed">
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
      darkImage: "/landing/feature-scenes/evidence-review-dark-v2.jpg",
      description: messages.home_feature_evidence_description(),
      id: "evidence",
      image: "/landing/feature-scenes/evidence-review-v2.jpg",
      imagePosition: "object-center",
      optimizedDarkImage: "/landing/optimized/feature-scenes/evidence-review-dark-v2",
      optimizedImage: "/landing/optimized/feature-scenes/evidence-review-v2",
      points: [
        messages.home_feature_evidence_point_one(),
        messages.home_feature_evidence_point_two(),
      ],
      title: messages.home_feature_evidence_title(),
      visual: <CandidateScoreCard />,
      visualPosition: "top-right",
    },
    {
      darkImage: "/landing/feature-scenes/interview-conversation-dark.jpg",
      description: messages.home_feature_chat_description(),
      id: "interview",
      image: "/landing/feature-scenes/interview-conversation.jpg",
      imagePosition: "object-center",
      optimizedDarkImage: "/landing/optimized/feature-scenes/interview-conversation-dark",
      optimizedImage: "/landing/optimized/feature-scenes/interview-conversation",
      points: [messages.home_feature_chat_point_one(), messages.home_feature_chat_point_two()],
      title: messages.home_feature_chat_title(),
      visual: <CandidateAgentChat />,
      visualPosition: "bottom-right",
    },
    {
      darkImage: "/landing/feature-scenes/team-calibration-dark.jpg",
      description: messages.home_feature_team_description(),
      id: "calibration",
      image: "/landing/feature-scenes/team-calibration.jpg",
      imagePosition: "object-center",
      optimizedDarkImage: "/landing/optimized/feature-scenes/team-calibration-dark",
      optimizedImage: "/landing/optimized/feature-scenes/team-calibration",
      points: [messages.home_feature_team_point_one(), messages.home_feature_team_point_two()],
      title: messages.home_feature_team_title(),
      visual: <TeamCalibrationCard />,
      visualPosition: "bottom-left",
    },
  ];
}

function StoryCard({ story, index }: { index: number; story: Story }) {
  const isMirrored = index % 2 === 1;

  return (
    <article
      className={cn(
        "grid bg-transparent lg:gap-16",
        isMirrored
          ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.72fr)]"
          : "lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.55fr)]",
      )}
      data-feature-story={story.id}
      data-layout={isMirrored ? "visual-copy" : "copy-visual"}
    >
      <div
        className={cn(
          "flex flex-col justify-center py-14 sm:py-16 lg:min-h-[38rem] lg:py-20",
          isMirrored ? "lg:order-2 lg:pr-4 xl:pr-8" : "lg:pl-4 xl:pl-8",
        )}
      >
        <h3 className="max-w-md text-balance font-medium text-3xl text-foreground leading-[1.16] tracking-tight sm:text-4xl">
          {story.title}
        </h3>
        <p className="mt-5 max-w-md text-base text-foreground/62 leading-relaxed dark:text-white/70">
          {story.description}
        </p>
        <ul className="mt-10 space-y-3">
          {story.points.map((point, pointIndex) => (
            <li className="flex items-center gap-3 text-foreground/70 text-sm" key={point}>
              <span className="font-mono text-[10px] text-primary tabular-nums">
                0{index * 2 + pointIndex + 1}
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          "relative overflow-hidden bg-transparent lg:my-12 lg:min-h-0",
          STORY_SCENE_HEIGHTS[story.id],
          isMirrored && "lg:order-1",
        )}
        data-mobile-height={story.id === "interview" ? "default" : "compact"}
      >
        <ModernArtwork
          assetPath={story.optimizedImage}
          className={cn(
            "absolute inset-0 size-full object-cover contrast-[0.94] saturate-[0.82] dark:hidden",
            story.imagePosition,
          )}
          dataAttributes={{ "data-artwork-theme": "light" }}
          fallbackPath={story.image}
          height={941}
          width={1672}
        />
        <ModernArtwork
          assetPath={story.optimizedDarkImage}
          className={cn(
            "absolute inset-0 hidden size-full object-cover contrast-[0.96] saturate-[0.88] dark:block",
            story.imagePosition,
          )}
          dataAttributes={{ "data-artwork-theme": "dark" }}
          fallbackPath={story.darkImage}
          height={941}
          width={1672}
        />
        <div
          className={cn(
            "absolute inset-0 flex",
            story.id === "evidence" ? "p-3 sm:p-4" : "p-[6px]",
            story.visualPosition === "top-right" ? "items-start" : "items-end",
            story.visualPosition === "bottom-left" ? "justify-start" : "justify-end",
          )}
          data-visual-inset={story.id === "evidence" ? "relaxed" : "edge"}
          data-visual-position={story.visualPosition}
        >
          {story.visual}
        </div>
      </div>
    </article>
  );
}

export function FeatureBlocks() {
  const stories = getStories();

  return (
    <Section className="pt-10 sm:pt-14 lg:pt-20" width="wide">
      <SectionTitle className="mt-0">{messages.home_features_title()}</SectionTitle>
      <SectionLead>{messages.home_features_lead()}</SectionLead>

      <div className="mt-12 space-y-20 sm:mt-16 sm:space-y-28 lg:space-y-32">
        {stories.map((story, index) => (
          <StoryCard index={index} key={story.id} story={story} />
        ))}
      </div>
    </Section>
  );
}
