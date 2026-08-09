import { z } from "zod";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";

export const MEETING_TRANSCRIPTION_BENCHMARK_MAX_TRANSCRIPT_CHARS = 200_000;
const MAX_OVERLAP_REFERENCE_CHARS = 100_000;
const MAX_CORPUS_ANNOTATION_CHARS = 15_000_000;

const localPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => !/([?&](X-Amz-|Signature=|Credential=)|Bearer\s|api[_-]?key)/i.test(value), {
    message: "语料 manifest 不得包含签名 URL 或凭证",
  })
  .refine(
    (value) =>
      !(
        value.startsWith("/") ||
        /^[a-z]:[\\/]/i.test(value) ||
        value.split(/[\\/]/).includes("..")
      ),
    {
      message: "语料音频必须使用 manifest 目录内的相对路径",
    },
  )
  .refine((value) => !value.includes("\0"), {
    message: "语料音频路径无效",
  });

const benchmarkCaseSchema = z
  .object({
    assets: z
      .array(
        z
          .object({
            contentType: z.string().min(1).max(128),
            durationMs: z
              .number()
              .int()
              .positive()
              .max(4 * 60 * 60 * 1000),
            path: localPathSchema,
            sha256: z.string().regex(/^[a-f\d]{64}$/i),
            sizeBytes: z
              .number()
              .int()
              .positive()
              .max(2 * 1024 * 1024 * 1024),
            track: z.enum(["microphone", "system"]),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    consent: z
      .object({
        confirmed: z.literal(true),
        scope: z.literal("provider-benchmark-v1"),
      })
      .strict(),
    entities: z
      .array(
        z
          .object({
            category: z.enum(["english", "technical"]),
            text: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .max(500),
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
    overlapIntervals: z
      .array(
        z
          .object({
            endMs: z.number().int().positive(),
            referenceTexts: z.array(z.string().trim().min(1).max(4000)).min(2).max(8),
            startMs: z.number().int().nonnegative(),
          })
          .strict()
          .refine((value) => value.endMs > value.startMs, "重叠区间结束时间必须晚于开始时间"),
      )
      .max(1000),
    reference: canonicalMeetingTranscriptSchema,
    tags: z.array(z.string().trim().min(1).max(64)).max(30),
  })
  .strict()
  .superRefine((input, context) => {
    const durationByTrack = new Map(
      input.assets.map((asset) => [
        asset.track === "microphone" ? "local" : "remote",
        asset.durationMs,
      ]),
    );
    const caseDurationMs = Math.max(...input.assets.map((asset) => asset.durationMs));
    if (new Set(input.assets.map((asset) => asset.track)).size !== input.assets.length) {
      context.addIssue({ code: "custom", message: "同一语料音轨不能重复", path: ["assets"] });
    }
    if (
      input.assets.reduce((total, asset) => total + asset.sizeBytes, 0) >
      2 * 1024 * 1024 * 1024
    ) {
      context.addIssue({
        code: "custom",
        message: "同一语料源音频总大小超过 2 GiB",
        path: ["assets"],
      });
    }
    if (input.reference.turns.some((turn) => turn.text.length > 2000)) {
      context.addIssue({
        code: "custom",
        message: "评测 reference turn 文本过长，请按真实发言边界拆分",
        path: ["reference", "turns"],
      });
    }
    if (
      input.reference.turns.reduce((total, turn) => total + turn.text.length, 0) >
      MEETING_TRANSCRIPTION_BENCHMARK_MAX_TRANSCRIPT_CHARS
    ) {
      context.addIssue({
        code: "custom",
        message: "评测 reference 文本超过单场资源预算",
        path: ["reference", "turns"],
      });
    }
    if (
      input.overlapIntervals.reduce(
        (total, interval) =>
          total + interval.referenceTexts.reduce((subtotal, text) => subtotal + text.length, 0),
        0,
      ) > MAX_OVERLAP_REFERENCE_CHARS
    ) {
      context.addIssue({
        code: "custom",
        message: "评测 overlap 标注超过单场资源预算",
        path: ["overlapIntervals"],
      });
    }
    const outOfBoundsTurn = input.reference.turns.find(
      (turn) => turn.endMs > (durationByTrack.get(turn.track) ?? 0),
    );
    if (outOfBoundsTurn) {
      context.addIssue({
        code: "custom",
        message: "评测 reference turn 超出对应源音轨时长",
        path: ["reference", "turns"],
      });
    }
    if (input.overlapIntervals.some((interval) => interval.endMs > caseDurationMs)) {
      context.addIssue({
        code: "custom",
        message: "评测重叠区间超出源音频时长",
        path: ["overlapIntervals"],
      });
    }
    if (
      new Set(input.reference.turns.map((turn) => `${turn.track}:${turn.speakerKey}`)).size > 64
    ) {
      context.addIssue({
        code: "custom",
        message: "评测 reference speaker 数量超过 64",
        path: ["reference", "turns"],
      });
    }
  });

export const meetingTranscriptionEvalDatasetSchema = z
  .object({
    cases: z.array(benchmarkCaseSchema).min(20).max(50),
    corpusId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,127}$/),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.cases.map((item) => item.id)).size !== input.cases.length) {
      context.addIssue({ code: "custom", message: "语料 case id 不能重复", path: ["cases"] });
    }
    const annotationCharacters = input.cases.reduce(
      (corpusTotal, item) =>
        corpusTotal +
        item.reference.turns.reduce((total, turn) => total + turn.text.length, 0) +
        item.overlapIntervals.reduce(
          (total, interval) =>
            total + interval.referenceTexts.reduce((subtotal, text) => subtotal + text.length, 0),
          0,
        ),
      0,
    );
    if (annotationCharacters > MAX_CORPUS_ANNOTATION_CHARS) {
      context.addIssue({
        code: "custom",
        message: "评测语料标注超过全局资源预算",
        path: ["cases"],
      });
    }
  });

export type MeetingTranscriptionEvalDataset = z.infer<typeof meetingTranscriptionEvalDatasetSchema>;
export type MeetingTranscriptionEvalCase = MeetingTranscriptionEvalDataset["cases"][number];
