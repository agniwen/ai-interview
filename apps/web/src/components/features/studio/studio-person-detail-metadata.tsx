"use client";
import { IconInfoCircle } from "@tabler/icons-react";
// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";

import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DetailRow } from "./interviews/interview-detail/detail-row";

import type { ReportFullTextInput, ReportSnapshotMetadata } from "./studio-person-detail-model";
export function ReportMetadataButton({
  disabled,
  label,
  onClick,
  visible,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Button disabled={disabled} onClick={onClick} size="sm" type="button" variant="outline">
      <IconInfoCircle className="size-3.5" />
      {label}
    </Button>
  );
}

function InterviewReportMetadataSnapshotSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium text-sm">快照</h4>
        {metadata.contextSnapshot ? (
          <Badge variant="outline">v{metadata.contextSnapshot.version}</Badge>
        ) : null}
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <DetailRow
          label="Context Snapshot"
          value={
            metadata.contextSnapshot ? (
              <span className="break-all">{metadata.contextSnapshot.id}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence Snapshot"
          value={
            metadata.evidenceSnapshot ? (
              <span className="break-all">{metadata.evidenceSnapshot.id}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Context Hash"
          value={
            metadata.contextSnapshot ? (
              <span className="break-all">{metadata.contextSnapshot.contentHash}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence Hash"
          value={
            metadata.evidenceSnapshot ? (
              <span className="break-all">{metadata.evidenceSnapshot.contentHash}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Context 创建时间"
          value={
            metadata.contextSnapshot ? (
              <TimeDisplay
                options={DATE_TIME_DISPLAY_OPTIONS}
                value={metadata.contextSnapshot.createdAt}
              />
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence 生成时间"
          value={
            metadata.evidenceSnapshot?.generatedAt ? (
              <TimeDisplay
                options={DATE_TIME_DISPLAY_OPTIONS}
                value={metadata.evidenceSnapshot.generatedAt}
              />
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow label="原因" value={metadata.contextSnapshot?.reason ?? "暂无"} />
        <DetailRow label="状态" value={metadata.contextSnapshot?.status ?? "暂无"} />
      </div>
    </section>
  );
}

function InterviewReportMetadataFrozenInputSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <h4 className="font-medium text-sm">冻结输入</h4>
      {metadata.frozenInput ? (
        <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
          <DetailRow label="候选人" value={metadata.frozenInput.candidateName ?? "暂无"} />
          <DetailRow label="邮箱" value={metadata.frozenInput.candidateEmail ?? "暂无"} />
          <DetailRow label="目标岗位" value={metadata.frozenInput.targetRole ?? "暂无"} />
          <DetailRow label="JD" value={metadata.frozenInput.jobDescriptionName ?? "未绑定"} />
          <DetailRow label="面试官数" value={metadata.frozenInput.interviewerCount} />
          <DetailRow label="表单模板数" value={metadata.frozenInput.formCount} />
          <DetailRow label="表单问题数" value={metadata.frozenInput.formQuestionCount} />
          <DetailRow label="表单提交数" value={metadata.frozenInput.formSubmissionCount} />
          <DetailRow label="面试题模板数" value={metadata.frozenInput.questionTemplateCount} />
          <DetailRow
            label="模板题目数"
            value={metadata.frozenInput.questionTemplateQuestionCount}
          />
          <DetailRow
            label="候选人专属题数"
            value={metadata.frozenInput.personalizedQuestionCount}
          />
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm">
          暂无冻结输入摘要，可能需要先执行快照回填。
        </p>
      )}
    </section>
  );
}

function InterviewReportMetadataSessionSection({ metadata }: { metadata: ReportSnapshotMetadata }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <h4 className="font-medium text-sm">会话</h4>
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <DetailRow
          label="轮次 ID"
          value={
            metadata.session.scheduleEntryId ? (
              <span className="break-all">{metadata.session.scheduleEntryId}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow label="对话轮次" value={metadata.session.transcriptTurnCount} />
        <DetailRow label="录制状态" value={metadata.session.recordingStatus ?? "未录制"} />
        <DetailRow
          label="录制时长"
          value={
            metadata.session.recordingDurationSecs === null
              ? "暂无"
              : `${metadata.session.recordingDurationSecs} 秒`
          }
        />
      </div>
    </section>
  );
}

export function joinTextLines(lines: (string | null | undefined)[]) {
  return lines
    .flatMap((line) => {
      const trimmed = line?.trim();
      return trimmed ? [trimmed] : [];
    })
    .join("\n");
}

export function joinTextBlocks(blocks: string[]) {
  return blocks
    .flatMap((block) => {
      const trimmed = block.trim();
      return trimmed ? [trimmed] : [];
    })
    .join("\n\n");
}

export function formatCandidateFullTextInput(input: ReportFullTextInput) {
  return joinTextLines([
    `候选人：${input.candidate.candidateName ?? "暂无"}`,
    `邮箱：${input.candidate.candidateEmail ?? "暂无"}`,
    `电话：${input.candidate.candidatePhone ?? "暂无"}`,
    `目标岗位：${input.candidate.targetRole ?? "暂无"}`,
    input.candidate.resumeProfileJson
      ? `简历画像 JSON：\n${input.candidate.resumeProfileJson}`
      : null,
  ]);
}

export function formatJobFullTextInput(input: ReportFullTextInput) {
  return joinTextLines([
    input.jobDescription ? `JD：${input.jobDescription.name}` : "JD：未绑定",
    input.jobDescription?.prompt ? `JD 原文：\n${input.jobDescription.prompt}` : "JD 原文：暂无",
    input.globalConfig.companyContext
      ? `公司上下文：\n${input.globalConfig.companyContext}`
      : "公司上下文：暂无",
    input.globalConfig.openingInstructions
      ? `开场指令：\n${input.globalConfig.openingInstructions}`
      : "开场指令：暂无",
    input.globalConfig.closingInstructions
      ? `结束指令：\n${input.globalConfig.closingInstructions}`
      : "结束指令：暂无",
  ]);
}

export function formatInterviewersFullTextInput(input: ReportFullTextInput) {
  return joinTextBlocks(
    input.interviewers.map((interviewer, index) =>
      joinTextLines([
        `${index + 1}. ${interviewer.name}`,
        interviewer.voice ? `声音：${interviewer.voice}` : null,
        interviewer.prompt ? `Prompt：\n${interviewer.prompt}` : "Prompt：暂无",
      ]),
    ),
  );
}

export function formatFormsFullTextInput(input: ReportFullTextInput) {
  const templates = input.forms.map((form) =>
    joinTextLines([
      `表单：${form.title} v${form.version}`,
      form.description ? `描述：${form.description}` : null,
      ...form.questions.map((question, index) =>
        joinTextLines([
          `${index + 1}. ${question.label}`,
          `类型：${question.type}${question.required ? " · 必填" : ""}`,
          question.helperText ? `提示：${question.helperText}` : null,
          question.optionsText ? `选项：\n${question.optionsText}` : null,
        ]),
      ),
    ]),
  );
  const submissions = input.formSubmissions.map((submission) =>
    joinTextLines([
      `提交：${submission.title} v${submission.version}`,
      `提交时间：${submission.submittedAt}`,
      ...submission.answers.map(
        (answer, index) => `${index + 1}. ${answer.label}\n${answer.valueText || "暂无回答"}`,
      ),
    ]),
  );

  return joinTextBlocks([...templates, ...submissions]);
}

export function formatQuestionsFullTextInput(input: ReportFullTextInput) {
  const templates = input.questionTemplates.map((template) =>
    joinTextLines([
      `题库模板：${template.title} v${template.version}`,
      template.description ? `描述：${template.description}` : null,
      ...template.questions.map(
        (question, index) => `${index + 1}. [${question.difficulty}] ${question.content}`,
      ),
    ]),
  );
  const personalized = input.personalizedQuestions.length
    ? joinTextLines([
        "候选人专属题：",
        ...input.personalizedQuestions.map(
          (question) => `${question.order}. [${question.difficulty}] ${question.question}`,
        ),
      ])
    : "";

  return joinTextBlocks([...templates, personalized]);
}

export function formatTranscriptFullTextInput(input: ReportFullTextInput) {
  return input.transcript
    .map((turn, index) => {
      const timeLabel =
        turn.timeInCallSecs !== null && turn.timeInCallSecs !== undefined
          ? ` @ ${turn.timeInCallSecs}s`
          : "";
      return `${index + 1}. ${turn.role}${timeLabel}\n${turn.message}`;
    })
    .join("\n\n");
}

function MetadataTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-muted/50 p-3 text-foreground text-xs leading-5">
        {value.trim() || "暂无"}
      </pre>
    </div>
  );
}

function InterviewReportMetadataFullTextInputSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  const input = metadata.fullTextInput;
  if (!input) {
    return (
      <section className="rounded-xl border border-border/60 bg-background p-4">
        <h4 className="font-medium text-sm">完整输入</h4>
        <p className="mt-3 text-muted-foreground text-sm">
          当前快照缺少完整输入文本，可能需要重新生成快照或执行回填。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <h4 className="font-medium text-sm">完整输入</h4>
      <Accordion
        className="mt-3 rounded-xl border border-border/60"
        defaultValue={["job", "questions", "transcript"]}
        multiple
      >
        <AccordionItem value="candidate">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            候选人与简历画像
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="候选人输入" value={formatCandidateFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="job">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            JD 原文与全局指令
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="JD 原文" value={formatJobFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="interviewers">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">面试官</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock
              label="面试官 Prompt"
              value={formatInterviewersFullTextInput(input)}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="forms">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            表单与候选人回答
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="表单输入" value={formatFormsFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="questions">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">面试题</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="题目输入" value={formatQuestionsFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem className="border-b-0" value="transcript">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">Transcript</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="完整对话文本" value={formatTranscriptFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function InterviewReportMetadataJsonSection({ metadata }: { metadata: ReportSnapshotMetadata }) {
  return (
    <Accordion className="rounded-xl border border-border/60 bg-background">
      <AccordionItem className="border-0" value="raw">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">结构化 JSON</AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-5">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function InterviewReportMetadataDialog({
  onOpenChange,
  report,
}: {
  onOpenChange: (open: boolean) => void;
  report: StudioInterviewConversationReport | null;
}) {
  const metadata = report?.snapshotMetadata ?? null;

  return (
    <Modal
      bodyClassName="space-y-5"
      description={
        report ? <span className="break-all text-xs">会话 {report.conversationId}</span> : undefined
      }
      onOpenChange={onOpenChange}
      open={report !== null}
      size="xl"
      title="面试元信息"
    >
      {metadata ? (
        <>
          <InterviewReportMetadataSnapshotSection metadata={metadata} />
          <InterviewReportMetadataFrozenInputSection metadata={metadata} />
          <InterviewReportMetadataSessionSection metadata={metadata} />
          <InterviewReportMetadataFullTextInputSection metadata={metadata} />
          <InterviewReportMetadataJsonSection metadata={metadata} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
          暂无快照元信息，可能需要先执行数据库迁移和快照回填。
        </div>
      )}
    </Modal>
  );
}

// oxlint-disable-next-line complexity -- Panel orchestrates many conditional sections driven by record state and mode; flattening adds noise.
