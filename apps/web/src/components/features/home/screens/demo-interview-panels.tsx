"use client";

import { useState } from "react";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { DemoDimensionRadar, DemoEvaluationDetails } from "./_parts/demo-evaluation";
import {
  DemoCandidateBasicInfo,
  DemoOfferFields,
  DemoOfferProgress,
  DemoRoundCard,
} from "./_parts/demo-records";
import { useDemo } from "./demo-context";
import { getDemoScreenCopy } from "./demo-screen-copy";

function SummaryMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate font-medium text-sm leading-6">{value}</p>
    </div>
  );
}

function AiInterviewResult() {
  const [transcript, setTranscript] = useState(false);
  const { aiInterview: copy, conversation, people } = getDemoScreenCopy();
  return (
    <div className="space-y-6" data-slot="demo-ai-result">
      <div className="flex items-center gap-3 text-sm">
        <Button variant="outline">{copy.roundButton}</Button>
        <Badge variant="success">{copy.completed}</Badge>
      </div>
      <div className="grid grid-cols-2 items-stretch gap-4">
        <Frame className="h-full">
          <FrameHeader className="justify-between">
            <FrameTitle>{copy.resultTitle}</FrameTitle>
            <Badge variant="success">{copy.completed}</Badge>
          </FrameHeader>
          <FramePanel className="flex-1">
            <div className="grid grid-cols-2 gap-8">
              <SummaryMetric label={copy.startTime} value="2026/10/08 11:00" />
              <SummaryMetric label={copy.endTime} value="2026/10/08 11:24" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-8 border-t border-border/50 pt-5">
              <SummaryMetric label={copy.scoreLabel} value="86 / 100" />
              <SummaryMetric
                label={copy.suggestionLabel}
                value={<Badge variant="success">{copy.recommendBadge}</Badge>}
              />
              <SummaryMetric label={copy.conversationLabel} value={copy.conversationValue} />
            </div>
            <MarkdownView
              className="mt-5 border-t border-border/50 pt-5 text-sm leading-6"
              content={copy.resultMarkdown}
            />
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/50 pt-5">
              <Button variant="outline" disabled>
                {copy.viewQuestions}
              </Button>
              <Button variant="outline" disabled>
                {copy.copyLink}
              </Button>
            </div>
          </FramePanel>
        </Frame>
        <Frame className="h-full">
          <FrameHeader>
            <FrameTitle>{copy.candidateInfo}</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex-1">
            <DemoCandidateBasicInfo />
          </FramePanel>
        </Frame>
        <Frame className="h-full">
          <FrameHeader className="justify-between">
            <FrameTitle>{copy.formQuestions}</FrameTitle>
            <Badge variant="outline">{copy.itemCount(copy.formAnswers.length)}</Badge>
          </FrameHeader>
          <FramePanel className="flex-1">
            <DataFields columns={2}>
              {copy.formAnswers.map((answer) => (
                <DataField key={answer.label} label={answer.label} value={answer.value} />
              ))}
            </DataFields>
          </FramePanel>
        </Frame>
        <Frame className="h-full">
          <FrameHeader className="justify-between">
            <FrameTitle>{copy.conversationQuestions}</FrameTitle>
            <Badge variant="outline">{copy.itemCount(conversation.length)}</Badge>
          </FrameHeader>
          <FramePanel className="flex-1">
            <p className="text-sm font-medium">{copy.contributionTitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.contributionBody}</p>
          </FramePanel>
        </Frame>
      </div>
      <Frame>
        <FrameHeader className="justify-between">
          <FrameTitle>{copy.transcriptTitle}</FrameTitle>
          <Button
            data-demo-ai-transcript
            size="sm"
            variant="ghost"
            onClick={() => setTranscript(!transcript)}
          >
            {transcript ? copy.hideTranscript : copy.showTranscript}
          </Button>
        </FrameHeader>
        {transcript && (
          <FramePanel data-demo-reveal="ai-transcript">
            <ScrollArea className="max-h-[320px]" scrollbars="leave">
              <div className="space-y-5">
                {conversation.map((turn, i) => (
                  <div key={turn.question}>
                    <p className="text-xs text-muted-foreground">
                      {String(i * 6).padStart(2, "0")}:12 · {copy.aiInterviewer}
                    </p>
                    <p className="mt-1 text-sm font-medium">{turn.question}</p>
                    <p className="mt-3 text-xs text-primary">{people.candidate}</p>
                    <p className="mt-1 text-sm leading-6">{turn.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </FramePanel>
        )}
      </Frame>
    </div>
  );
}

function HumanInterview() {
  const demo = useDemo();
  const completed = demo.phase === "human-completed" || demo.phase === "offer";
  const { humanInterview: copy } = getDemoScreenCopy();
  return (
    <div className="space-y-6" data-slot="demo-human-interview">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-medium">{copy.progressTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.progressDescription}</p>
        </div>
        <Button variant="outline" disabled>
          {copy.schedule}
        </Button>
      </header>
      <h3 className="text-sm font-medium">{completed ? copy.history : copy.pending}</h3>
      <div data-demo-human-analysis>
        <DemoRoundCard completed={completed} />
      </div>
      {!completed && (
        <Frame>
          <FrameHeader>
            <FrameTitle>{copy.focusTitle}</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
              {copy.focusItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">{copy.focusNote}</p>
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}

function OfferInterview() {
  const { offer } = getDemoScreenCopy();
  return (
    <div className="space-y-6" data-slot="demo-offer">
      <DemoOfferProgress />
      <Frame>
        <FrameHeader>
          <FrameTitle>{offer.expectationsTitle}</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="mb-3 text-xs text-muted-foreground">{offer.expectationsNote}</p>
          <DataFields columns={3}>
            {offer.expectations.map((field) => (
              <DataField key={field.label} label={field.label} value={field.value} />
            ))}
          </DataFields>
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader className="justify-between">
          <FrameTitle>{offer.title}</FrameTitle>
          <Badge variant="info">{offer.sent}</Badge>
        </FrameHeader>
        <FramePanel>
          <DemoOfferFields />
          <div className="mt-4 flex gap-2 border-t pt-4">
            <Button variant="outline" disabled>
              {offer.edit}
            </Button>
            <Button variant="outline" disabled>
              {offer.copyLink}
            </Button>
            <Button disabled>{offer.recordResponse}</Button>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

export default function DemoInterviewPanels({ tab }: { tab: string }) {
  if (tab === "evaluation") {
    return (
      <DemoEvaluationDetails
        summaryAction={
          <Button size="sm" variant="ghost" disabled>
            {getDemoScreenCopy().offer.reEvaluate}
          </Button>
        }
      />
    );
  }
  if (tab === "interviews") {
    return <AiInterviewResult />;
  }
  if (tab === "human") {
    return <HumanInterview />;
  }
  if (tab === "offer") {
    return <OfferInterview />;
  }
  return <DemoDimensionRadar compact />;
}
