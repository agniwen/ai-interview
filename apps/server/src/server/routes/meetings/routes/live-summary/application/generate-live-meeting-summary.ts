import { createHash } from "node:crypto";
import { z } from "zod";
import {
  MEETING_LIVE_SUMMARY_MAX_POINTS_PER_TOPIC,
  MEETING_LIVE_SUMMARY_MAX_EVIDENCE_TURNS,
  MEETING_LIVE_SUMMARY_MAX_TOPICS,
  meetingLiveSummarySnapshotSchema,
} from "@app/shared/meeting-live-summary";
import type {
  MeetingLiveSummaryPoint,
  MeetingLiveSummaryRequest,
  MeetingLiveSummarySnapshot,
  MeetingLiveSummaryTopic,
} from "@app/shared/meeting-live-summary";

const candidatePointSchema = z
  .object({
    evidenceTurnIds: z.array(z.string().min(1).max(512)).min(1).max(30),
    id: z.string().min(1).max(128),
    kind: z.enum(["fact", "question"]),
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

const candidateTopicSchema = z
  .object({
    evidenceTurnIds: z.array(z.string().min(1).max(512)).min(1).max(30),
    id: z.string().min(1).max(128),
    points: z.array(candidatePointSchema).max(MEETING_LIVE_SUMMARY_MAX_POINTS_PER_TOPIC),
    summary: z.string().trim().min(1).max(2000),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const meetingLiveSummaryCandidateSchema = z
  .object({
    activeTopicId: z.string().min(1).max(128).nullable(),
    summary: z.string().trim().min(1).max(4000),
    topics: z.array(candidateTopicSchema).min(1).max(MEETING_LIVE_SUMMARY_MAX_TOPICS),
  })
  .strict();

export type MeetingLiveSummaryCandidate = z.infer<typeof meetingLiveSummaryCandidateSchema>;

export interface LiveMeetingSummaryGeneratorSnapshot {
  model: string;
  provider: string;
}

export interface GenerateLiveMeetingSummaryDependencies {
  generateCandidate: (input: {
    request: MeetingLiveSummaryRequest;
  }) => Promise<MeetingLiveSummaryCandidate>;
  getGeneratorSnapshot: () => LiveMeetingSummaryGeneratorSnapshot;
  now: () => Date;
}

interface EvidenceRange {
  endMs: number;
  startMs: number;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, "");
}

function stableNodeId(input: {
  captureId: string;
  evidenceTurnId: string;
  kind: "point" | "topic";
  modelId: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.captureId}\0${input.kind}\0${input.evidenceTurnId}\0${input.modelId}`)
    .digest("hex")
    .slice(0, 24);
  return `${input.kind}-${digest}`;
}

function evidenceRanges(request: MeetingLiveSummaryRequest): Map<string, EvidenceRange> {
  const ranges = new Map<string, EvidenceRange>();
  for (const topic of request.baseSnapshot?.topics ?? []) {
    for (const id of topic.evidenceTurnIds) {
      ranges.set(id, { endMs: topic.endMs, startMs: topic.startMs });
    }
    for (const point of topic.points) {
      for (const id of point.evidenceTurnIds) {
        ranges.set(id, { endMs: point.endMs, startMs: point.startMs });
      }
    }
  }
  for (const turn of request.turns) {
    ranges.set(turn.id, { endMs: turn.endMs, startMs: turn.startMs });
  }
  return ranges;
}

function rangeFor(ids: string[], ranges: ReadonlyMap<string, EvidenceRange>): EvidenceRange {
  const selected = ids.map((id) => ranges.get(id)).filter((value) => value !== undefined);
  if (selected.length !== ids.length) {
    throw new Error("实时总结引用了不属于输入字幕的证据");
  }
  return {
    endMs: Math.max(...selected.map((range) => range.endMs)),
    startMs: Math.min(...selected.map((range) => range.startMs)),
  };
}

function uniqueEvidence(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

function boundedEvidence(input: {
  groups: string[][];
  max: number;
  required?: string[];
}): string[] {
  const ids = uniqueEvidence(...input.groups);
  if (ids.length <= input.max) {
    return ids;
  }
  const first = ids.at(0);
  const latest = ids.at(-1);
  const selected = new Set(
    uniqueEvidence(first ? [first] : [], input.required ?? [], latest ? [latest] : []),
  );
  for (let index = ids.length - 1; index >= 0 && selected.size < input.max; index -= 1) {
    const id = ids[index];
    if (id) {
      selected.add(id);
    }
  }
  return ids.filter((id) => selected.has(id));
}

function firstEvidenceId(ids: string[]): string {
  const [first] = ids;
  if (!first) {
    throw new Error("实时总结节点缺少字幕证据");
  }
  return first;
}

function capTopics(topics: MeetingLiveSummaryTopic[]): void {
  while (topics.length > MEETING_LIVE_SUMMARY_MAX_TOPICS) {
    const removable = topics.findIndex((topic) => topic.status === "completed");
    topics.splice(removable === -1 ? 0 : removable, 1);
  }
}

function resolvePoint(input: {
  candidate: MeetingLiveSummaryCandidate["topics"][number]["points"][number];
  captureId: string;
  existing: MeetingLiveSummaryPoint | undefined;
  ranges: ReadonlyMap<string, EvidenceRange>;
}): MeetingLiveSummaryPoint {
  const evidenceTurnIds = boundedEvidence({
    groups: [input.existing?.evidenceTurnIds ?? [], input.candidate.evidenceTurnIds],
    max: 3,
  });
  return {
    ...rangeFor(evidenceTurnIds, input.ranges),
    evidenceTurnIds,
    id:
      input.existing?.id ??
      stableNodeId({
        captureId: input.captureId,
        evidenceTurnId: firstEvidenceId(evidenceTurnIds),
        kind: "point",
        modelId: input.candidate.id,
      }),
    kind: input.candidate.kind,
    text: input.candidate.text,
  };
}

function resolveTopic(input: {
  candidate: MeetingLiveSummaryCandidate["topics"][number];
  captureId: string;
  existing: MeetingLiveSummaryTopic | undefined;
  ranges: ReadonlyMap<string, EvidenceRange>;
}): MeetingLiveSummaryTopic {
  const existingPointsById = new Map(input.existing?.points.map((point) => [point.id, point]));
  const existingPointsByText = new Map(
    input.existing?.points.map((point) => [`${point.kind}:${normalized(point.text)}`, point]),
  );
  const resolvedPoints = input.candidate.points.map((point) =>
    resolvePoint({
      candidate: point,
      captureId: input.captureId,
      existing:
        existingPointsById.get(point.id) ??
        existingPointsByText.get(`${point.kind}:${normalized(point.text)}`),
      ranges: input.ranges,
    }),
  );
  const resolvedPointIds = new Set(resolvedPoints.map((point) => point.id));
  for (const point of input.existing?.points ?? []) {
    if (
      !resolvedPointIds.has(point.id) &&
      resolvedPoints.length < MEETING_LIVE_SUMMARY_MAX_POINTS_PER_TOPIC
    ) {
      resolvedPoints.push(point);
    }
  }
  const pointEvidence = uniqueEvidence(...resolvedPoints.map((point) => point.evidenceTurnIds));
  const evidenceTurnIds = boundedEvidence({
    groups: [input.existing?.evidenceTurnIds ?? [], input.candidate.evidenceTurnIds, pointEvidence],
    max: MEETING_LIVE_SUMMARY_MAX_EVIDENCE_TURNS,
    required: pointEvidence,
  });
  return {
    ...rangeFor(evidenceTurnIds, input.ranges),
    evidenceTurnIds,
    id:
      input.existing?.id ??
      stableNodeId({
        captureId: input.captureId,
        evidenceTurnId: firstEvidenceId(evidenceTurnIds),
        kind: "topic",
        modelId: input.candidate.id,
      }),
    points: resolvedPoints,
    status: "completed",
    summary: input.candidate.summary,
    title: input.candidate.title,
  };
}

export async function generateLiveMeetingSummary(
  request: MeetingLiveSummaryRequest,
  dependencies: GenerateLiveMeetingSummaryDependencies,
): Promise<MeetingLiveSummarySnapshot> {
  const candidate = meetingLiveSummaryCandidateSchema.parse(
    await dependencies.generateCandidate({ request }),
  );
  const ranges = evidenceRanges(request);
  const previous = request.baseSnapshot?.topics ?? [];
  const previousById = new Map(previous.map((topic) => [topic.id, topic]));
  const previousByTitle = new Map(previous.map((topic) => [normalized(topic.title), topic]));
  const resolvedCandidateIds = new Map<string, string>();
  const updatedById = new Map<string, MeetingLiveSummaryTopic>();
  const newTopics: MeetingLiveSummaryTopic[] = [];
  for (const topic of candidate.topics) {
    const existing = previousById.get(topic.id) ?? previousByTitle.get(normalized(topic.title));
    const resolved = resolveTopic({
      candidate: topic,
      captureId: request.captureId,
      existing,
      ranges,
    });
    resolvedCandidateIds.set(topic.id, resolved.id);
    if (existing) {
      updatedById.set(existing.id, resolved);
    } else {
      newTopics.push(resolved);
    }
  }
  const topics: MeetingLiveSummaryTopic[] = previous.map(
    (topic) => updatedById.get(topic.id) ?? { ...topic, status: "completed" },
  );
  topics.push(...newTopics);
  const activeTopicId = candidate.activeTopicId
    ? resolvedCandidateIds.get(candidate.activeTopicId)
    : undefined;
  for (const topic of topics) {
    topic.status = topic.id === activeTopicId ? "active" : "completed";
  }
  capTopics(topics);
  const lastTurn = request.turns.at(-1);
  if (!lastTurn) {
    throw new Error("实时总结请求缺少字幕");
  }
  const advancesCursor = lastTurn.endMs >= (request.baseSnapshot?.coveredThroughMs ?? -1);
  const generator = dependencies.getGeneratorSnapshot();
  return meetingLiveSummarySnapshotSchema.parse({
    captureId: request.captureId,
    coveredThroughMs: advancesCursor
      ? lastTurn.endMs
      : (request.baseSnapshot?.coveredThroughMs ?? lastTurn.endMs),
    coveredThroughTurnId: advancesCursor
      ? lastTurn.id
      : (request.baseSnapshot?.coveredThroughTurnId ?? lastTurn.id),
    generatedAt: dependencies.now().toISOString(),
    model: generator.model,
    provider: generator.provider,
    revision: (request.baseSnapshot?.revision ?? 0) + 1,
    summary: candidate.summary,
    template: request.template,
    topics,
  });
}
