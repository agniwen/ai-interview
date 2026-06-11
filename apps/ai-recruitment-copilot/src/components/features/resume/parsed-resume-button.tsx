"use client";

import { FileTextIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import { cn } from "@arc/shared/utils";

export interface ParsedResumeButtonProps {
  filename: string;
  // chat 上传切到 OCR-only 之后，结构化是 lazy 跑的，烤入消息时可能仍为 null。
  // 此组件需要兼容这种"只有 OCR 原文"的形态：概览 / JSON 两个 tab 自动禁用，
  // 默认落到"原文"tab。
  // structured may be null when chat upload only ran OCR — structured
  // extraction is lazy. The component handles this by disabling the summary /
  // JSON tabs and defaulting to the "raw text" tab.
  structured: ResumeParserStructured | null;
  parsedText?: string | null;
  pageCount?: number | null;
  textSource?: AttachmentTextSource | null;
  className?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 font-semibold text-foreground text-sm">{title}</h4>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">{children}</div>;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim();
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className={cn("truncate", display ? "text-foreground" : "text-muted-foreground/60")}>
        {display || "—"}
      </span>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <span
          className="rounded-full border bg-muted/40 px-2 py-0.5 text-foreground text-xs"
          key={`chip-${idx}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function EmptyHint() {
  return <p className="text-muted-foreground/70 text-xs">暂无</p>;
}

function ExperienceCard({
  title,
  role,
  period,
  summary,
  extra,
}: {
  title: string;
  role: string | null;
  period: string | null;
  summary: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-md py-0">
      <CardContent className="p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h5 className="font-medium text-foreground text-sm">{title}</h5>
          {period ? <span className="text-muted-foreground text-xs">{period}</span> : null}
        </div>
        {role ? <p className="mt-0.5 text-muted-foreground text-xs">{role}</p> : null}
        {summary ? (
          <p className="mt-2 whitespace-pre-wrap text-foreground text-sm leading-normal">
            {summary}
          </p>
        ) : null}
        {extra ? <div className="mt-2">{extra}</div> : null}
      </CardContent>
    </Card>
  );
}

function SummaryView({ structured }: { structured: ResumeParserStructured }) {
  return (
    <div className="space-y-5">
      <Section title="基本信息">
        <FieldGrid>
          <Field label="姓名" value={structured.name} />
          <Field label="性别" value={structured.gender} />
          <Field label="年龄" value={structured.age === null ? null : `${structured.age}`} />
          <Field label="邮箱" value={structured.email} />
          <Field label="电话" value={structured.phone} />
          <Field
            label="工作年限"
            value={structured.workYears === null ? null : `${structured.workYears} 年`}
          />
        </FieldGrid>
      </Section>

      <Section title="教育">
        <FieldGrid>
          <Field label="院校" value={structured.schools.join("、") || null} />
          <Field label="学历" value={structured.degree} />
          <Field label="专业" value={structured.major} />
          <Field label="毕业" value={structured.graduationYear} />
        </FieldGrid>
        {structured.education ? (
          <p className="mt-2 text-foreground text-sm">{structured.education}</p>
        ) : null}
      </Section>

      <Section title="求职意向 / 技能">
        <FieldGrid>
          <Field label="目标岗位" value={structured.targetRoles.join("、") || null} />
        </FieldGrid>
        {structured.skills.length > 0 ? <ChipList items={structured.skills} /> : <EmptyHint />}
      </Section>

      {structured.personalStrengths.length > 0 ? (
        <Section title="个人优势">
          <ul className="list-disc space-y-1 pl-5 text-foreground text-sm">
            {structured.personalStrengths.map((item, idx) => (
              <li key={`strength-${idx}`}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {structured.workExperiences.length > 0 ? (
        <Section title="工作经历">
          <div className="space-y-3">
            {structured.workExperiences.map((work, idx) => (
              <ExperienceCard
                key={`work-${idx}`}
                period={work.period}
                role={work.role}
                summary={work.summary}
                title={work.company ?? "未命名公司"}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {structured.projectExperiences.length > 0 ? (
        <Section title="项目经历">
          <div className="space-y-3">
            {structured.projectExperiences.map((project, idx) => (
              <ExperienceCard
                extra={project.techStack.length > 0 ? <ChipList items={project.techStack} /> : null}
                key={`project-${idx}`}
                period={project.period}
                role={project.role}
                summary={project.summary}
                title={project.name ?? "未命名项目"}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="时间线分析">
        <FieldGrid>
          <Field label="当前状态" value={structured.timelineSummary.currentStatus} />
          <Field
            label="估算经验"
            value={
              structured.timelineSummary.estimatedExperienceYears === null
                ? null
                : `${structured.timelineSummary.estimatedExperienceYears} 年`
            }
          />
        </FieldGrid>
        {structured.timelineSummary.dateRanges.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1 text-muted-foreground text-xs">原文时间区间</p>
            <ChipList items={structured.timelineSummary.dateRanges} />
          </div>
        ) : null}
        {structured.timelineSummary.riskSignals.length > 0 ? (
          <div className="mt-2 rounded-md border border-amber-200/60 bg-amber-50/60 p-2.5 text-amber-800 text-xs dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="mb-1 font-medium">风险信号</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {structured.timelineSummary.riskSignals.map((signal, idx) => (
                <li key={`risk-${idx}`}>{signal}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {structured.links.length > 0 ? (
        <Section title="链接">
          <ul className="space-y-1 text-sm">
            {structured.links.map((link, idx) => (
              <li key={`link-${idx}`}>
                <a
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  href={`#${link}`}
                  rel="noopener noreferrer"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

export function ParsedResumeButton({
  filename,
  structured,
  parsedText,
  pageCount,
  textSource,
  className,
}: ParsedResumeButtonProps) {
  const [open, setOpen] = useState(false);
  // 没有结构化数据时直接落到"原文"tab —— 概览 / JSON 都依赖 structured。
  // Default to the "text" tab when structured is missing; summary/json need it.
  const [tab, setTab] = useState<"summary" | "json" | "text">(structured ? "summary" : "text");

  let sourceLabel: string | null = null;
  if (textSource === "qwen-ocr") {
    sourceLabel = "Qwen-VL OCR";
  } else if (textSource === "pdf-parse") {
    sourceLabel = "pdf-parse";
  }

  return (
    <>
      <Button
        className={cn("h-8 shrink-0 gap-1.5", className)}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <SparklesIcon className="size-3.5" />
        结构化
      </Button>
      <Modal
        bodyClassName="px-6 py-5"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="truncate">{filename}</span>
            {pageCount ? (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>{pageCount} 页</span>
              </>
            ) : null}
            {sourceLabel ? (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>来源 {sourceLabel}</span>
              </>
            ) : null}
          </span>
        }
        headerExtra={
          <Tabs className="mt-2" onValueChange={(value) => setTab(value as typeof tab)} value={tab}>
            <TabsList>
              <TabsTrigger className="min-w-20 px-4" disabled={!structured} value="summary">
                概览
              </TabsTrigger>
              <TabsTrigger className="min-w-20 px-4" disabled={!structured} value="json">
                JSON
              </TabsTrigger>
              <TabsTrigger className="min-w-20 px-4" disabled={!parsedText} value="text">
                原文
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
        headerLayout="stack"
        onOpenChange={setOpen}
        open={open}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <FileTextIcon className="size-4" />
            简历结构化解析
          </span>
        }
      >
        <AnimatedHeight>
          {tab === "summary" && structured ? <SummaryView structured={structured} /> : null}
          {tab === "json" && structured ? (
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">
              {JSON.stringify(structured, null, 2)}
            </pre>
          ) : null}
          {tab === "text" && parsedText ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">
              {parsedText}
            </pre>
          ) : null}
        </AnimatedHeight>
      </Modal>
    </>
  );
}
