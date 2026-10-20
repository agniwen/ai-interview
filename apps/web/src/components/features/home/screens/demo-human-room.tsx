"use client";

import { useRef, useState } from "react";
import {
  IconClipboardText,
  IconDeviceDesktopUp,
  IconFileDescription,
  IconInfoCircle,
  IconListDetails,
  IconMaximize,
  IconMessageCircle,
  IconMicrophone,
  IconMoon,
  IconPlayerStopFilled,
  IconSubtitles,
  IconUsers,
  IconUser,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { humanMeetingControlButtonClass } from "@/components/features/human-interview/human-meeting-stage";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@app/shared/utils";
import { DemoEvaluationSummary } from "./_parts/demo-evaluation";
import { DemoResumeProfile } from "./_parts/demo-records";
import { useDemo } from "./demo-context";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_ID } from "./demo-workflow-data";

function MeetingInfo() {
  const { humanInterview, job, meetingInfo: copy, people } = getDemoScreenCopy();
  const [open, setOpen] = useState(false);
  const details = [
    [copy.job, job.label],
    [copy.round, humanInterview.roundLabel],
    [copy.time, copy.timeValue],
    [copy.responsibleHr, people.recruiter],
  ] as const;
  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        render={
          <button
            className="-ml-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-foreground text-sm whitespace-nowrap hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => setOpen(true)}
            type="button"
          >
            <span>{copy.title}</span>
            <IconInfoCircle aria-hidden="true" className="size-4 shrink-0" />
          </button>
        }
      />
      <HoverCardContent align="start" className="w-72 p-4" sideOffset={8}>
        <h2 className="mb-3 font-medium text-sm">{copy.title}</h2>
        <dl className="space-y-3 text-sm">
          {details.map(([label, value]) => (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Evaluation timeline + resume preview + AI and HR screening notes, scoped to the demo canvas. */
function CandidateMaterials({ compact }: { compact: boolean }) {
  const demo = useDemo();
  const { job, people, resume, room } = getDemoScreenCopy();
  const viewportRef = useRef<HTMLDivElement>(null);
  const entries = [
    { id: "ai-evaluation", time: "10/08 10:00", title: room.aiEvaluation },
    { id: "hr-initial", time: "10/08 11:24", title: room.hrInitial },
  ];
  const [activeId, setActiveId] = useState(entries[0].id);
  const navigate = (id: string) => {
    setActiveId(id);
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(`[data-evaluation-id="${id}"]`);
    if (viewport && target) {
      viewport.scrollTop =
        target.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop;
    }
  };
  return (
    <ScrollArea
      className="h-full"
      scrollbars="leave"
      viewportRef={viewportRef}
      viewportProps={{ "aria-label": room.evaluationDetails }}
    >
      <div
        className={cn(
          "grid w-full grid-cols-[15rem_minmax(0,1fr)] gap-6 px-3 pt-3",
          !compact && "grid-cols-[15rem_minmax(0,1fr)_15rem]",
        )}
      >
        <aside className="sticky top-3 self-start">
          <nav aria-label={room.timeline} className="p-1" data-demo-timeline>
            <ol className="flex flex-col gap-1">
              {entries.map((entry) => (
                <li className="min-w-0" key={entry.id}>
                  <Button
                    aria-current={activeId === entry.id ? "step" : undefined}
                    className="h-auto w-full items-center justify-start gap-2 px-3 py-1.5 text-left"
                    onClick={() => navigate(entry.id)}
                    variant={activeId === entry.id ? "secondary" : "ghost"}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3 shrink-0 rounded-full border-2 border-background",
                        activeId === entry.id ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                      {entry.time}
                    </span>
                  </Button>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <div className="min-w-0 pb-8">
          <section aria-label={resume.fileName} className="mx-4 mb-4 pt-3">
            <div className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-xl border bg-background">
              <div className="min-h-0 flex-1 overflow-hidden px-10 py-6">
                <h2 className="text-xl font-semibold">
                  {people.candidate} · {job.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{resume.previewSubtitle}</p>
                <div className="mt-6">
                  <DemoResumeProfile withDetails={false} />
                </div>
              </div>
              <Button
                aria-label={room.fullscreenResume}
                className="h-auto w-full justify-start rounded-none border-0 px-4 py-3 text-left"
                data-demo-resume-fullscreen
                onClick={() =>
                  demo.setDialog({
                    kind: "resume",
                    title: getDemoScreenCopy().dialog.resumeDetails,
                  })
                }
                variant="text"
              >
                <ResumeDocumentFileIcon kind="pdf" />
                <span className="min-w-0 flex-1 truncate">{resume.fileName}</span>
                <IconMaximize />
              </Button>
            </div>
          </section>
          <section className="border-b border-border/60 py-3" data-evaluation-id="ai-evaluation">
            <h2 className="px-4 py-3 font-semibold text-lg">{room.aiEvaluation}</h2>
            <DemoEvaluationSummary className="px-4 pt-2" />
          </section>
          <section className="border-b border-border/60 py-3" data-evaluation-id="hr-initial">
            <h2 className="px-4 py-3 font-semibold text-lg">{room.hrInitial}</h2>
            <div className="flex flex-col px-4 pt-2">
              <p className="pb-3 text-muted-foreground text-sm leading-6">
                {room.historyRoundLabel}
              </p>
              {room.history.map((entry) => (
                <section className="py-3" key={entry.label}>
                  <h3 className="font-semibold text-base">{entry.label}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7">{entry.value}</p>
                </section>
              ))}
            </div>
          </section>
        </div>
      </div>
    </ScrollArea>
  );
}

/** Real meeting chrome with homepage-only materials, local participants and no LiveKit/network access. */
export default function DemoHumanRoom() {
  const demo = useDemo();
  const [materials, setMaterials] = useState(false);
  const [questions, setQuestions] = useState(false);
  const [review, setReview] = useState(false);
  const { conversation, humanEvaluation, people, room } = getDemoScreenCopy();
  return (
    <main
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
      data-slot="demo-human-room"
      data-candidate-id={DEMO_CANDIDATE_ID}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 pr-1.5 pl-4">
        <div className="flex min-w-0 flex-1 items-center">
          <MeetingInfo />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {materials && (
            <Button
              data-demo-room-questions
              aria-expanded={questions}
              size="sm"
              variant={questions ? "secondary" : "ghost"}
              onClick={() => setQuestions(!questions)}
            >
              <IconListDetails />
              {room.questions}
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled>
            <IconSubtitles />
            {room.subtitles}
          </Button>
          <output className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-destructive" />
            {room.recording}
          </output>
          <Button variant="ghost" size="icon-sm" disabled aria-label={room.toggleTheme}>
            <IconMoon />
          </Button>
          <Badge className="h-8 px-2.5" variant="secondary" aria-label={room.participants}>
            <IconUsers />2
          </Badge>
        </div>
      </header>
      <div className="relative grid min-h-0 flex-1 overflow-hidden" data-slot="meeting-workspace">
        {materials ? (
          <div
            className={cn(
              "grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200",
              questions ? "grid-cols-[minmax(0,1fr)_min(32%,30rem)]" : "grid-cols-[minmax(0,1fr)]",
            )}
          >
            <section
              className="min-h-0 min-w-0 overflow-hidden"
              aria-label={room.candidateOverview}
            >
              <CandidateMaterials compact={questions} />
            </section>
            {questions && (
              <section
                aria-label={room.questions}
                className="flex min-h-0 min-w-0 flex-col overflow-hidden pr-3"
                data-slot="demo-room-questions"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-6 pb-1">
                  <h2 className="font-semibold text-base">{room.questions}</h2>
                  <Button
                    aria-label={room.closeQuestions}
                    onClick={() => setQuestions(false)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <IconX />
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
                  <div className="space-y-5 p-5">
                    {conversation.map((turn, index) => (
                      <section className="space-y-3 border-b pb-5" key={turn.question}>
                        <div className="flex items-center gap-2">
                          <Checkbox disabled checked={index === 0} />
                          <span className="text-xs text-muted-foreground">
                            {room.referenceQuestion(index + 1)}
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-6">{turn.question}</p>
                        <p className="text-xs leading-6 text-muted-foreground">
                          {room.referenceNote}
                        </p>
                      </section>
                    ))}
                  </div>
                </ScrollArea>
              </section>
            )}
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 grid-cols-2 auto-rows-fr gap-1.5 overflow-hidden px-1.5 pb-1.5"
            data-slot="meeting-grid-layout"
          >
            {[
              { name: people.candidate, role: room.candidateRole },
              { local: true, name: people.interviewer, role: room.hostRole },
            ].map((person) => (
              <div
                className="relative isolate grid h-full min-h-0 place-items-center overflow-hidden rounded-sm border border-border/50 bg-muted/40"
                key={person.name}
              >
                {person.local ? (
                  <Avatar className="size-24" seed="demo-reviewer" label={person.name} />
                ) : (
                  <IconUser className="size-16 text-muted-foreground" />
                )}
                <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-sm">
                    {person.name}
                    {person.local && room.self}
                    <span className="text-[10px] text-muted-foreground">{person.role}</span>
                  </div>
                  <span className="rounded-md bg-background px-2 py-1 text-xs text-emerald-600">
                    ▂▄▆
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {review && (
          <section
            className="absolute inset-x-0 bottom-3 z-30 mx-auto flex h-[min(44rem,calc(100%-1.75rem))] w-[min(48rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
            data-slot="meeting-review-panel"
          >
            <header className="flex items-start justify-between gap-3 border-b p-6">
              <div>
                <h2 className="text-lg font-semibold">{room.reviewTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{room.reviewDescription}</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={room.closeReview}
                onClick={() => setReview(false)}
              >
                <IconX />
              </Button>
            </header>
            <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
              <div className="space-y-6 p-4">
                <div className="grid grid-cols-3 gap-5">
                  {[
                    {
                      label: room.reviewFields.conclusion,
                      value: getDemoScreenCopy().round.outcomePass,
                    },
                    { label: room.reviewFields.rating, value: humanEvaluation.rating },
                    {
                      label: room.reviewFields.professionalSkill,
                      value: humanEvaluation.professionalSkill,
                    },
                  ].map((field) => (
                    <div key={field.label}>
                      <Label>{field.label}</Label>
                      <Input className="mt-2" readOnly value={field.value} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    {
                      label: room.reviewFields.overall,
                      span: true,
                      value: humanEvaluation.overallEvaluation,
                    },
                    { label: room.reviewFields.rolePosition, value: humanEvaluation.rolePosition },
                    { label: room.reviewFields.strengths, value: humanEvaluation.strengths },
                    { label: room.reviewFields.risks, value: humanEvaluation.risks },
                    {
                      label: room.reviewFields.salary,
                      value: humanEvaluation.salaryRecommendation,
                    },
                  ].map((field) => (
                    <div className={field.span ? "col-span-2" : ""} key={field.label}>
                      <Label>{field.label}</Label>
                      <Textarea className="mt-2 min-h-24" readOnly value={field.value} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button disabled>{room.submitReview}</Button>
                </div>
              </div>
            </ScrollArea>
          </section>
        )}
      </div>
      <footer className="relative flex shrink-0 items-center justify-center gap-2 px-4 py-3">
        {[
          { icon: IconMicrophone, label: room.microphone },
          { icon: IconVideo, label: room.camera },
          { icon: IconDeviceDesktopUp, label: room.shareScreen },
        ].map(({ icon: Icon, label }) => (
          <button className={humanMeetingControlButtonClass} type="button" key={label}>
            <Icon className="size-4" />
            {label}
          </button>
        ))}
        <button
          className={humanMeetingControlButtonClass}
          data-demo-room-materials
          type="button"
          onClick={() => {
            setReview(false);
            setMaterials(!materials);
          }}
        >
          {materials ? (
            <IconVideo className="size-4" />
          ) : (
            <IconFileDescription className="size-4" />
          )}
          {materials ? room.meetingView : room.candidateInfo}
        </button>
        <button
          className={humanMeetingControlButtonClass}
          data-demo-room-review
          type="button"
          onClick={() => setReview(!review)}
        >
          <IconClipboardText className="size-4" />
          {room.review}
        </button>
        <button className={humanMeetingControlButtonClass} type="button">
          <IconMessageCircle className="size-4" />
          {room.chat}
        </button>
        <Button
          variant="destructive"
          data-demo-finish-human
          onClick={() => demo.setPhase("human-completed")}
        >
          <IconPlayerStopFilled className="size-4" />
          {room.endMeeting}
        </Button>
      </footer>
    </main>
  );
}
