import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import type {
  MeetingIntelligencePayload,
  MeetingIntelligenceResult,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
import type {
  FinalMeetingTranscriptRevision,
  FinalMeetingTranscriptTurn,
} from "@arc/shared/meeting-transcription";
import { Button } from "@/components/ui/button";
import {
  desktopMeetingKeys,
  fetchMeetingIntelligence,
  fetchMeetingTranscriptRevision,
  regenerateMeetingIntelligence,
} from "@/lib/client/meetings";

export function canRegenerateMeetingIntelligence(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
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
          <article
            className="rounded-lg border bg-background p-3 text-sm"
            key={`${title}-${index}`}
          >
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
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {result.current.content.summary}
          </p>
          <p className="mt-2 text-muted-foreground text-xs">
            revision {result.current.revision} · {result.current.template} ·{" "}
            {result.current.provider}/{result.current.model} · prompt {result.current.promptVersion}{" "}
            · transcript {result.current.transcriptRevisionId}
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
    body = <p className="text-muted-foreground text-sm">等待 Final Meeting Transcript 就绪。</p>;
  } else if (result.state === "processing") {
    body = <p className="text-muted-foreground text-sm">正在生成 Meeting Intelligence…</p>;
  } else if (result.state === "failed") {
    body = <p className="text-destructive text-sm">{result.error ?? "生成失败，请稍后重试。"}</p>;
  } else {
    body = <p className="text-muted-foreground text-sm">尚无 Meeting Intelligence revision。</p>;
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
              onChange={(event) =>
                onTemplateChange?.(event.target.value as MeetingIntelligenceTemplate)
              }
              value={selectedTemplate}
            >
              <option value="general">General Meeting</option>
              <option value="recruiting-interview">Recruiting Interview</option>
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
            建议模板：{result.suggestedTemplate}
          </span>
        </div>
      ) : null}
      {body}
    </div>
  );
}

function intelligenceRefetchInterval(result: MeetingIntelligenceResult | undefined) {
  return result?.state === "pending" || result?.state === "processing" ? 5000 : false;
}

/**
 * 展示版本化 Intelligence，并为所选历史版本加载其绑定的 transcript revision 以保证证据跳转一致。
 * Renders versioned intelligence and loads the transcript revision bound to the selected history item for stable evidence links.
 */
export function MeetingIntelligencePanel({
  accessRole,
  meetingId,
  onSeek,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  onSeek: (seconds: number) => void;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const intelligenceKey = desktopMeetingKeys.intelligence(slug, meetingId);
  const intelligenceQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchMeetingIntelligence(slug, meetingId),
    queryKey: intelligenceKey,
    refetchInterval: (query) => intelligenceRefetchInterval(query.state.data),
  });
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<MeetingIntelligenceTemplate>("general");
  const displayedRevision = useMemo(
    () =>
      selectedRevisionId
        ? (intelligenceQuery.data?.history.find((item) => item.id === selectedRevisionId) ?? null)
        : (intelligenceQuery.data?.current ?? null),
    [intelligenceQuery.data, selectedRevisionId],
  );
  const suggestedTemplate = intelligenceQuery.data?.suggestedTemplate;
  useEffect(() => {
    if (suggestedTemplate) {
      setSelectedTemplate(suggestedTemplate);
    }
  }, [suggestedTemplate]);
  const transcriptQuery = useQuery({
    enabled: Boolean(displayedRevision),
    queryFn: () =>
      fetchMeetingTranscriptRevision(
        slug,
        meetingId,
        displayedRevision?.transcriptRevisionId ?? "",
      ),
    queryKey: desktopMeetingKeys.transcriptRevision(
      slug,
      meetingId,
      displayedRevision?.transcriptRevisionId ?? "",
    ),
  });
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateMeetingIntelligence(slug, meetingId, selectedTemplate),
    onSuccess: async () => {
      setSelectedRevisionId(null);
      await queryClient.invalidateQueries({ queryKey: intelligenceKey });
    },
  });
  if (intelligenceQuery.isPending) {
    return null;
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <h2 className="font-medium">Meeting Intelligence</h2>
        <p className="text-muted-foreground text-xs">
          每个版本绑定精确的 transcript revision、模板、模型和 prompt；证据可跳回录音。
        </p>
      </div>
      {intelligenceQuery.error ? (
        <p className="text-destructive text-sm">
          {intelligenceQuery.error instanceof Error
            ? intelligenceQuery.error.message
            : "加载 Meeting Intelligence 失败"}
        </p>
      ) : null}
      {regenerateMutation.error ? (
        <p className="mb-3 text-destructive text-sm">
          {regenerateMutation.error instanceof Error
            ? regenerateMutation.error.message
            : "重新生成失败"}
        </p>
      ) : null}
      {intelligenceQuery.data ? (
        <MeetingIntelligenceView
          onRegenerate={() => regenerateMutation.mutate()}
          onSeek={onSeek}
          onTemplateChange={setSelectedTemplate}
          regenerating={regenerateMutation.isPending}
          result={{
            ...intelligenceQuery.data,
            canRegenerate:
              intelligenceQuery.data.canRegenerate && canRegenerateMeetingIntelligence(accessRole),
            current: displayedRevision,
          }}
          selectedTemplate={selectedTemplate}
          transcript={transcriptQuery.data ?? null}
        />
      ) : null}
      {(intelligenceQuery.data?.history.length ?? 0) > 0 ? (
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 font-medium text-sm">版本历史</p>
          <div className="flex flex-wrap gap-2">
            {intelligenceQuery.data?.history.map((revision) => (
              <Button
                key={revision.id}
                onClick={() =>
                  setSelectedRevisionId(
                    revision.id === intelligenceQuery.data?.current?.id ? null : revision.id,
                  )
                }
                size="sm"
                type="button"
                variant={revision.id === displayedRevision?.id ? "default" : "outline"}
              >
                revision {revision.revision} · {revision.template}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
