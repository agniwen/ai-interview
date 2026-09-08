import { meetingLiveSummarySnapshotSchema } from "@app/shared/meeting-live-summary";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import type { MeetingIntelligencePayload } from "@app/shared/meeting-intelligence";

/** Reuse completed background intelligence for the desktop document and mind map. No extra model call. */
export function completedIntelligenceSummary(input: {
  captureId: string;
  content: MeetingIntelligencePayload;
  model: string;
  now: Date;
  previous: unknown;
  provider: string;
  turns: { id: string; startMs: number; endMs: number }[];
}): MeetingLiveSummarySnapshot | null {
  const previous = meetingLiveSummarySnapshotSchema.safeParse(input.previous).data;
  const ranges = new Map(input.turns.map((turn) => [turn.id, turn]));
  const range = (ids: string[]) => {
    const turns = ids.flatMap((id) => ranges.get(id) ?? []);
    return {
      endMs: Math.max(0, ...turns.map((turn) => turn.endMs)),
      startMs: Math.min(...turns.map((turn) => turn.startMs)),
    };
  };
  const { content } = input;
  const items =
    content.template === "general"
      ? content.topics
      : [
          ...content.keyExperience.map((item) => ({
            ...item,
            summary: item.statement,
            title: "经历与项目",
          })),
          ...content.candidateStatements.map((item) => ({
            ...item,
            summary: item.statement,
            title: "沟通要点",
          })),
          ...content.verificationItems.map((item) => ({
            ...item,
            summary: item.statement,
            title: "待核实事项",
          })),
        ];
  const notes =
    content.template === "general"
      ? [
          ...content.decisions.map((item) => ({
            evidenceTurnIds: item.evidenceTurnIds,
            kind: "fact" as const,
            text: item.statement,
          })),
          ...content.openQuestions.map((item) => ({
            evidenceTurnIds: item.evidenceTurnIds,
            kind: "question" as const,
            text: item.question,
          })),
          ...content.actionItems.map((item) => ({
            evidenceTurnIds: item.evidenceTurnIds,
            kind: "fact" as const,
            text: [item.task, item.owner, item.dueDate].filter(Boolean).join(" · "),
          })),
        ]
      : [];
  const last = input.turns.toSorted((a, b) => a.endMs - b.endMs).at(-1);
  if (!last) {
    return null;
  }
  if (!items.length) {
    items.push({ evidenceTurnIds: [last.id], summary: content.summary, title: "沟通总结" });
  }
  // Preserve every completed topic and note; the live request's 12-topic budget is not a document limit.
  const documentItems = [
    ...items,
    ...notes.map((note) => ({
      evidenceTurnIds: note.evidenceTurnIds,
      summary: note.text,
      title: note.kind === "question" ? "待明确问题" : "决定与行动",
    })),
    ...(content.template === "recruiting-interview"
      ? content.followUpActions.map((item) => ({
          evidenceTurnIds: item.evidenceTurnIds,
          summary: [item.task, item.owner, item.dueDate].filter(Boolean).join(" · "),
          title: "后续行动",
        }))
      : []),
  ];
  const topics = documentItems.flatMap((item, index) => {
    const evidenceTurnIds = item.evidenceTurnIds.slice(0, 30);
    const sections = item.summary.match(/[\s\S]{1,2000}/gu) ?? [];
    return sections.map((summary, section) => ({
      ...range(evidenceTurnIds),
      evidenceTurnIds,
      id: `final-topic-${index}-${section}`,
      points: [],
      status: "completed" as const,
      summary,
      title: item.title.slice(0, 200),
    }));
  });
  const result = meetingLiveSummarySnapshotSchema.safeParse({
    captureId: input.captureId,
    coveredThroughMs: last.endMs,
    coveredThroughTurnId: last.id,
    generatedAt: input.now.toISOString(),
    model: input.model,
    pendingThoughts: [],
    provider: input.provider,
    revision: (previous?.revision ?? 0) + 1,
    summary: content.summary.slice(0, 4000),
    template: content.template,
    topics,
  });
  return result.success ? result.data : null;
}
