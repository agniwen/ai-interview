import type { ReactNode } from "react";
import { z } from "zod";
import type { MeetingAccessRole } from "@app/shared/meeting-recording";
import type {
  MeetingIntelligencePayload,
  MeetingIntelligenceResult,
  MeetingIntelligenceTemplate,
} from "@app/shared/meeting-intelligence";
import type {
  FinalMeetingTranscriptRevision,
  FinalMeetingTranscriptTurn,
} from "@app/shared/meeting-transcription";
import { Button } from "@/components/ui/button";

const meetingIntelligenceTemplateSchema = z.enum(["general", "recruiting-interview"]);

export function canRegenerateMeetingIntelligence(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

function intelligenceTemplateLabel(template: MeetingIntelligenceTemplate): string {
  return template === "recruiting-interview" ? "招聘面试" : "通用会议";
}

export function intelligenceEvidenceTurns(
  evidenceTurnIds: string[],
  transcript: FinalMeetingTranscriptRevision | null,
): FinalMeetingTranscriptTurn[] {
  // Evidence ID 只在生成该 Intelligence 的精确 transcript revision 中解析，不能回退到当前版本。
  // Resolve evidence only against the exact transcript revision used for generation, never the current revision.
  if (!transcript) {
    return [];
  }
  const byId = new Map(transcript.turns.map((turn) => [turn.id, turn]));
  return evidenceTurnIds.flatMap((id) => {
    const turn = byId.get(id);
    return turn ? [turn] : [];
  });
}

function formatTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function EvidenceLinks({
  evidenceTurnIds,
  onSeek,
  transcript,
}: {
  evidenceTurnIds: string[];
  onSeek: (seconds: number) => void;
  transcript: FinalMeetingTranscriptRevision | null;
}) {
  const turns = intelligenceEvidenceTurns(evidenceTurnIds, transcript);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {turns.length > 0
        ? turns.map((turn) => (
            <Button
              key={turn.id}
              onClick={() => onSeek(turn.startMs / 1000)}
              size="sm"
              title={turn.text}
              type="button"
              variant="outline"
            >
              证据 {formatTime(turn.startMs)}
            </Button>
          ))
        : evidenceTurnIds.map((id) => (
            <span className="text-muted-foreground text-xs" key={id}>
              证据 {id}
            </span>
          ))}
    </div>
  );
}

function EvidenceList({
  items,
  onSeek,
  title,
  transcript,
}: {
  items: { evidenceTurnIds: string[]; text: string }[];
  onSeek: (seconds: number) => void;
  title: string;
  transcript: FinalMeetingTranscriptRevision | null;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <h4 className="mb-2 font-medium text-sm">{title}</h4>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <article className="rounded-lg bg-muted/40 px-3 py-3 text-sm" key={`${title}-${index}`}>
            <p className="whitespace-pre-wrap">{item.text}</p>
            <EvidenceLinks
              evidenceTurnIds={item.evidenceTurnIds}
              onSeek={onSeek}
              transcript={transcript}
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function intelligenceSections(content: MeetingIntelligencePayload) {
  if (content.template === "general") {
    return [
      {
        items: content.topics.map((item) => ({
          evidenceTurnIds: item.evidenceTurnIds,
          text: `${item.title}：${item.summary}`,
        })),
        title: "主题",
      },
      {
        items: content.decisions.map((item) => ({
          evidenceTurnIds: item.evidenceTurnIds,
          text: item.statement,
        })),
        title: "决定",
      },
      {
        items: content.actionItems.map((item) => ({
          evidenceTurnIds: item.evidenceTurnIds,
          text: `${item.task}${item.owner ? ` · ${item.owner}` : ""}${item.dueDate ? ` · ${item.dueDate}` : ""}`,
        })),
        title: "行动项",
      },
      {
        items: content.openQuestions.map((item) => ({
          evidenceTurnIds: item.evidenceTurnIds,
          text: item.question,
        })),
        title: "待确认问题",
      },
    ];
  }
  return [
    {
      items: content.candidateStatements.map((item) => ({
        evidenceTurnIds: item.evidenceTurnIds,
        text: `${item.statement} · ${item.attribution} · ${item.verification}`,
      })),
      title: "候选人陈述",
    },
    {
      items: content.keyExperience.map((item) => ({
        evidenceTurnIds: item.evidenceTurnIds,
        text: item.statement,
      })),
      title: "关键经历",
    },
    {
      items: content.verificationItems.map((item) => ({
        evidenceTurnIds: item.evidenceTurnIds,
        text: item.statement,
      })),
      title: "待核验信息",
    },
    {
      items: content.followUpActions.map((item) => ({
        evidenceTurnIds: item.evidenceTurnIds,
        text: `${item.task}${item.owner ? ` · ${item.owner}` : ""}${item.dueDate ? ` · ${item.dueDate}` : ""}`,
      })),
      title: "后续行动",
    },
  ];
}

export function MeetingIntelligenceView({
  onRegenerate,
  onSeek,
  onTemplateChange,
  regenerating = false,
  result,
  selectedTemplate,
  transcript,
}: {
  onRegenerate: () => void;
  onSeek: (seconds: number) => void;
  onTemplateChange?: (template: MeetingIntelligenceTemplate) => void;
  regenerating?: boolean;
  result: MeetingIntelligenceResult;
  selectedTemplate: MeetingIntelligenceTemplate;
  transcript: FinalMeetingTranscriptRevision | null;
}) {
  const generationInProgress = result.state === "pending" || result.state === "processing";
  let regenerationLabel = "重新生成";
  if (generationInProgress) {
    regenerationLabel = "正在生成…";
  } else if (regenerating) {
    regenerationLabel = "正在请求…";
  }
  let body: ReactNode;
  if (result.current) {
    body = (
      <div className="flex flex-col gap-4">
        {result.state === "pending" || result.state === "processing" ? (
          <p className="text-muted-foreground text-sm">
            正在生成新版本；下方仍显示当前已发布 revision。
          </p>
        ) : null}
        {result.state === "failed" ? (
          <p className="text-destructive text-sm">
            {result.error ?? "新版本生成失败；当前已发布 revision 未受影响。"}
          </p>
        ) : null}
        <div className="rounded-lg bg-muted/40 px-3 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {result.current.content.summary}
          </p>
          <p className="mt-2 text-muted-foreground text-xs">
            revision {result.current.revision} ·{" "}
            {intelligenceTemplateLabel(result.current.template)} · {result.current.provider}/
            {result.current.model} · {result.current.promptVersion} · transcript{" "}
            {result.current.transcriptRevisionId}
          </p>
        </div>
        {intelligenceSections(result.current.content).map((section) => (
          <EvidenceList
            items={section.items}
            key={section.title}
            onSeek={onSeek}
            title={section.title}
            transcript={transcript}
          />
        ))}
      </div>
    );
  } else if (result.state === "pending") {
    body = <p className="text-muted-foreground text-sm">等待最终转录就绪。</p>;
  } else if (result.state === "processing") {
    body = <p className="text-muted-foreground text-sm">正在生成会议洞察…</p>;
  } else if (result.state === "failed") {
    body = <p className="text-destructive text-sm">{result.error ?? "生成失败，请稍后重试。"}</p>;
  } else {
    body = <p className="text-muted-foreground text-sm">尚无会议洞察。</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {result.canRegenerate ? (
        <div className="flex flex-wrap items-end gap-2">
          <label
            className="flex min-w-52 flex-col gap-1 text-xs"
            htmlFor="meeting-intelligence-template"
          >
            模板
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              id="meeting-intelligence-template"
              onChange={(event) => {
                const template = meetingIntelligenceTemplateSchema.safeParse(event.target.value);
                if (template.success) {
                  onTemplateChange?.(template.data);
                }
              }}
              value={selectedTemplate}
            >
              <option value="general">通用会议</option>
              <option value="recruiting-interview">招聘面试</option>
            </select>
          </label>
          <Button
            disabled={regenerating || generationInProgress}
            onClick={onRegenerate}
            type="button"
            variant="outline"
          >
            {regenerationLabel}
          </Button>
          <span className="text-muted-foreground text-xs">
            建议模板：{intelligenceTemplateLabel(result.suggestedTemplate)}
          </span>
        </div>
      ) : null}
      {body}
    </div>
  );
}
