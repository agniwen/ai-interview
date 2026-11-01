"use client";

// 首页首屏专用的候选人资料、面试轮次与 Offer 展示：视觉对齐 Studio，文案全部来自演示文案。
// Homepage-only candidate, round and offer views mirroring Studio, fully localized.
import { IconBriefcase, IconCheck, IconSchool, IconTool } from "@tabler/icons-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@app/shared/utils";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { getDemoScreenCopy } from "../demo-screen-copy";
import { DEMO_CANDIDATE_EMAIL, DEMO_CANDIDATE_PHONE } from "../demo-workflow-data";

function ProfileSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: typeof IconBriefcase;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function TimelineEntry({
  detail,
  period,
  primary,
  secondary,
}: {
  detail?: string;
  period: string;
  primary: string;
  secondary: string;
}) {
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 wrap-break-word font-medium text-sm">{primary}</p>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">{period}</span>
      </div>
      <p className="mt-1 min-w-0 wrap-break-word text-muted-foreground text-xs">{secondary}</p>
      {detail ? <p className="mt-2 text-sm leading-6">{detail}</p> : null}
    </li>
  );
}

/** Structured resume body used by the detail overview, resume dialog and meeting preview. */
export function DemoResumeProfile({ withDetails = true }: { withDetails?: boolean }) {
  const { resume } = getDemoScreenCopy();
  return (
    <div className="flex min-w-0 flex-col gap-7" data-slot="demo-resume-profile">
      <ProfileSection icon={IconBriefcase} title={resume.workTitle}>
        <ol className="flex flex-col gap-4">
          {resume.work.map((entry) => (
            <TimelineEntry
              detail={withDetails ? entry.summary : undefined}
              key={entry.period}
              {...entry}
            />
          ))}
        </ol>
      </ProfileSection>
      <ProfileSection icon={IconSchool} title={resume.educationTitle}>
        <ol className="flex flex-col gap-4">
          {resume.education.map((entry) => (
            <TimelineEntry key={entry.period} {...entry} />
          ))}
        </ol>
      </ProfileSection>
      <ProfileSection icon={IconTool} title={resume.skillsTitle}>
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.map((skill) => (
            <Badge key={skill} variant="outline">
              {skill}
            </Badge>
          ))}
        </div>
      </ProfileSection>
    </div>
  );
}

export function DemoCandidateBasicInfo() {
  const { basicInfo, job, people, resume } = getDemoScreenCopy();
  return (
    <DataFields columns={2} density="relaxed">
      <DataField label={basicInfo.name} value={people.candidate} />
      <DataField kind="email" label={basicInfo.email} value={DEMO_CANDIDATE_EMAIL} />
      <DataField label={basicInfo.phone} value={DEMO_CANDIDATE_PHONE} />
      <DataField label={basicInfo.targetRole} value={job.title} />
      <DataField label={basicInfo.relatedJob} value={job.label} />
      <DataField label={basicInfo.creator} value={people.recruiter} />
      <DataField
        label={basicInfo.resumeFile}
        span="full"
        value={
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-muted/60 bg-muted/30 px-3 py-2">
            <ResumeDocumentFileIcon className="size-7 shrink-0" kind="pdf" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm leading-5">{resume.fileName}</div>
              <div className="text-muted-foreground text-xs leading-4">
                {basicInfo.resumeAttachment}
              </div>
            </div>
          </div>
        }
      />
    </DataFields>
  );
}

function EvaluationField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{value}</p>
    </div>
  );
}

function RoundEvaluation() {
  const { humanEvaluation: evaluation, room, round } = getDemoScreenCopy();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-4 border-border/40 border-t pt-4 text-sm wrap-anywhere">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{round.evaluationTitle}</span>
        <Badge variant="success">{round.outcomePass}</Badge>
        <span className="text-muted-foreground text-xs">{round.evaluationStatus}</span>
      </div>
      <div className="grid grid-cols-4 gap-x-6 gap-y-4">
        <EvaluationField label={room.reviewFields.rating} value={evaluation.rating} />
        <EvaluationField
          label={room.reviewFields.professionalSkill}
          value={evaluation.professionalSkill}
        />
        <EvaluationField label={room.reviewFields.rolePosition} value={evaluation.rolePosition} />
        <EvaluationField label={room.reviewFields.salary} value={evaluation.salaryRecommendation} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">{room.reviewFields.overall}</span>
        <MarkdownView
          className="text-foreground/90 leading-relaxed"
          content={evaluation.overallEvaluation}
        />
      </div>
      <Button
        aria-expanded={expanded}
        className="self-start"
        onClick={() => setExpanded(!expanded)}
        size="sm"
        variant="outline"
      >
        {expanded ? round.hideDetails : round.showDetails}
      </Button>
      {expanded ? (
        <div className="flex flex-col gap-4">
          <EvaluationField label={room.reviewFields.strengths} value={evaluation.strengths} />
          <EvaluationField label={room.reviewFields.risks} value={evaluation.risks} />
          <EvaluationField label={round.detailedAnalysis} value={evaluation.detailedAnalysis} />
        </div>
      ) : null}
    </div>
  );
}

export function DemoRoundCard({ completed }: { completed: boolean }) {
  const { humanInterview, people, room, round } = getDemoScreenCopy();
  return (
    <Frame data-slot="demo-round-card">
      <FrameHeader className="h-auto min-h-10 py-2">
        <FrameTitle>
          <h4>{round.title(1, humanInterview.roundLabel)}</h4>
        </FrameTitle>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span className="tabular-nums">{round.scheduledAt}</span>
          <span>{round.format}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">{round.interviewer}</span>
            <Avatar className="size-[18px]" label={people.interviewer} seed="demo-reviewer" />
            {people.interviewer}
          </span>
          <dl className="flex items-center gap-2">
            <dt className="text-muted-foreground">{round.status}</dt>
            <dd>
              <Badge variant={completed ? "success" : "info"}>
                {completed ? round.statusCompleted : round.statusScheduled}
              </Badge>
            </dd>
          </dl>
        </div>
        {completed ? (
          <section className="flex flex-col gap-2 border-border/40 border-t pt-4">
            <h5 className="font-medium text-sm">{round.attendance}</h5>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                { name: people.candidate, role: room.candidateRole },
                { name: people.interviewer, role: room.hostRole },
              ].map((person) => (
                <div className="flex items-center justify-between gap-3 py-1" key={person.name}>
                  <span>
                    <span className="font-medium text-foreground">{person.name}</span>
                    <span className="ml-2 text-muted-foreground">{person.role}</span>
                  </span>
                  <Badge variant="outline">14:00 – 15:00</Badge>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {completed ? <RoundEvaluation /> : null}
      </FramePanel>
    </Frame>
  );
}

export function DemoOfferProgress() {
  const { progress } = getDemoScreenCopy().offer;
  const currentIndex = 2;
  return (
    <section aria-label={progress.label} className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-sm">{progress.label}</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            {progress.step(currentIndex + 1, progress.steps.length)}
          </p>
        </div>
        <Badge variant="outline">{progress.current(progress.steps[currentIndex])}</Badge>
      </div>
      <ol className="mx-4 mt-4 flex pb-6">
        {progress.steps.map((label, index) => {
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex;
          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="relative min-w-0 flex-1 last:flex-none"
              key={label}
            >
              <div className="flex items-center">
                <span
                  className={cn(
                    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background font-medium text-[11px]",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isDone && "border-primary/40 bg-primary/10 text-primary",
                  )}
                >
                  {isDone ? <IconCheck className="size-3.5" /> : index + 1}
                </span>
                {index < progress.steps.length - 1 ? (
                  <span className={cn("mx-2 h-px flex-1 bg-border", isDone && "bg-primary/35")} />
                ) : null}
              </div>
              <p
                className={cn(
                  "absolute top-6 left-3 mt-1.5 -translate-x-1/2 whitespace-nowrap text-center text-muted-foreground text-xs",
                  isCurrent && "font-medium text-foreground",
                )}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm">{progress.task}</p>
    </section>
  );
}

export function DemoOfferFields() {
  const { offer } = getDemoScreenCopy();
  return (
    <dl className="grid grid-cols-4 gap-x-8 gap-y-3 text-sm">
      {offer.fields.map((field) => (
        <div className="min-w-0" key={field.label}>
          <dt className="text-muted-foreground text-xs">{field.label}</dt>
          <dd className="mt-1 wrap-break-word">{field.value}</dd>
        </div>
      ))}
      <div className="col-span-4 min-w-0">
        <dt className="text-muted-foreground text-xs">{offer.notesLabel}</dt>
        <dd className="mt-1">{offer.notes}</dd>
      </div>
    </dl>
  );
}
