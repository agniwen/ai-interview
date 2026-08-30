import { describe, expect, it } from "vitest";
import { scoreMeetingTranscription } from "./metrics";

const reference = {
  language: "zh",
  turns: [
    {
      confidence: null,
      endMs: 2000,
      speakerKey: "remote-1",
      startMs: 0,
      text: "我们使用 TypeScript 和 Kubernetes。",
      track: "remote" as const,
    },
    {
      confidence: null,
      endMs: 3000,
      speakerKey: "remote-2",
      startMs: 1000,
      text: "Yes, Kubernetes on AWS.",
      track: "remote" as const,
    },
  ],
};

describe("Meeting transcription benchmark metrics", () => {
  it("scores canonical text, entities, speakers, timestamps, and overlap", () => {
    const score = scoreMeetingTranscription({
      entities: [
        { category: "english", text: "TypeScript" },
        { category: "technical", text: "Kubernetes" },
        { category: "technical", text: "AWS" },
      ],
      evaluationDurationMs: 3000,
      overlapIntervals: [
        { endMs: 2000, referenceTexts: reference.turns.map((turn) => turn.text), startMs: 1000 },
      ],
      prediction: reference,
      reference,
    });

    expect(score.chineseCharacterErrorRate).toBe(0);
    expect(score.englishEntityRecall).toBe(1);
    expect(score.technicalEntityRecall).toBe(1);
    expect(score.speakerErrorRate).toBe(0);
    expect(score.meanTimestampDriftMs).toBe(0);
    expect(score.overlapSpeechLossRate).toBe(0);
  });

  it("reports deterministic degradation without depending on provider-native fields", () => {
    const [firstTurn] = reference.turns;
    if (!firstTurn) {
      throw new Error("expected reference turn");
    }
    const score = scoreMeetingTranscription({
      entities: [
        { category: "english", text: "TypeScript" },
        { category: "technical", text: "Kubernetes" },
        { category: "technical", text: "AWS" },
      ],
      evaluationDurationMs: 3000,
      overlapIntervals: [
        { endMs: 2000, referenceTexts: reference.turns.map((turn) => turn.text), startMs: 1000 },
      ],
      prediction: {
        language: "zh",
        turns: [
          {
            ...firstTurn,
            endMs: 2300,
            speakerKey: "remote-9",
            startMs: 200,
            text: "我们使用 Java。",
          },
        ],
      },
      reference,
    });

    expect(score.chineseCharacterErrorRate).toBeGreaterThan(0);
    expect(score.englishEntityRecall).toBe(0);
    expect(score.technicalEntityRecall).toBe(0);
    expect(score.speakerErrorRate).toBeGreaterThan(0);
    expect(score.meanTimestampDriftMs).toBeGreaterThan(0);
    expect(score.overlapSpeechLossRate).toBeGreaterThan(0.9);
  });

  it("uses an optimal speaker mapping and penalizes false-alarm speakers", () => {
    const [baseTurn] = reference.turns;
    if (!baseTurn) {
      throw new Error("expected reference turn");
    }
    const optimal = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 2000,
      overlapIntervals: [],
      prediction: {
        language: "zh",
        turns: [
          { ...baseTurn, endMs: 900, speakerKey: "x", text: "甲" },
          {
            ...baseTurn,
            endMs: 1600,
            speakerKey: "y",
            startMs: 900,
            text: "乙",
          },
        ],
      },
      reference: {
        language: "zh",
        turns: [
          { ...baseTurn, endMs: 1600, speakerKey: "a", text: "甲乙" },
          { ...baseTurn, endMs: 800, speakerKey: "b", text: "丙" },
        ],
      },
    });
    const falseAlarm = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 3000,
      overlapIntervals: [],
      prediction: {
        ...reference,
        turns: [...reference.turns, { ...baseTurn, speakerKey: "extra", text: "噪声" }],
      },
      reference,
    });

    expect(optimal.speakerErrorRate).toBeLessThan(0.5);
    expect(falseAlarm.speakerErrorRate).toBeGreaterThan(0);
  });

  it("aligns split turns by content and measures overlap content loss", () => {
    const split = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 2100,
      overlapIntervals: [],
      prediction: {
        language: "en",
        turns: [
          {
            confidence: null,
            endMs: 900,
            speakerKey: "remote-x",
            startMs: 100,
            text: "hello",
            track: "remote",
          },
          {
            confidence: null,
            endMs: 2100,
            speakerKey: "remote-x",
            startMs: 1000,
            text: "world",
            track: "remote",
          },
        ],
      },
      reference: {
        language: "en",
        turns: [
          {
            confidence: null,
            endMs: 2000,
            speakerKey: "remote-1",
            startMs: 0,
            text: "hello world",
            track: "remote",
          },
        ],
      },
    });
    const overlap = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 3000,
      overlapIntervals: [
        { endMs: 2000, referenceTexts: reference.turns.map((turn) => turn.text), startMs: 1000 },
      ],
      prediction: {
        language: "zh",
        turns: reference.turns.map((turn, index) => ({
          ...turn,
          speakerKey: `fake-${index}`,
          text: "完全无关内容",
        })),
      },
      reference,
    });

    expect(split.meanTimestampDriftMs).toBe(100);
    expect(overlap.overlapSpeechLossRate).toBe(1);
  });

  it("keeps exact CER for long identical text across timestamp windows", () => {
    const text = "中".repeat(2100);
    const [baseTurn] = reference.turns;
    if (!baseTurn) {
      throw new Error("expected base turn");
    }
    const longReference = {
      language: "zh",
      turns: [
        { ...baseTurn, endMs: 299_999, text: text.slice(0, 1050) },
        { ...baseTurn, endMs: 301_000, startMs: 300_001, text: text.slice(1050) },
      ],
    };
    const prediction = {
      ...longReference,
      turns: longReference.turns.map((turn, index) => ({
        ...turn,
        endMs: turn.endMs + (index === 0 ? 2 : 0),
      })),
    };

    expect(
      scoreMeetingTranscription({
        entities: [],
        evaluationDurationMs: 301_002,
        overlapIntervals: [],
        prediction,
        reference: longReference,
      }).chineseCharacterErrorRate,
    ).toBe(0);

    const [, secondTurn] = prediction.turns;
    if (!secondTurn) {
      throw new Error("expected second turn");
    }
    prediction.turns[1] = { ...secondTurn, text: `${"中".repeat(1049)}错` };
    expect(
      scoreMeetingTranscription({
        entities: [],
        evaluationDurationMs: 301_002,
        overlapIntervals: [],
        prediction,
        reference: longReference,
      }).chineseCharacterErrorRate,
    ).toBeCloseTo(1 / 2100, 10);
  });

  it("does not let non-overlap text hide missing overlap speech", () => {
    const longOutsideText = "无关内容".repeat(200);
    const score = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 60_000,
      overlapIntervals: [
        { endMs: 31_000, referenceTexts: ["第一位说重叠甲", "第二位说重叠乙"], startMs: 30_000 },
      ],
      prediction: {
        language: "zh",
        turns: [
          {
            confidence: null,
            endMs: 60_000,
            speakerKey: "remote-1",
            startMs: 0,
            text: `${longOutsideText}第一位说重叠甲`,
            track: "remote",
          },
        ],
      },
      reference: {
        language: "zh",
        turns: [
          {
            confidence: null,
            endMs: 60_000,
            speakerKey: "remote-1",
            startMs: 0,
            text: longOutsideText,
            track: "remote",
          },
        ],
      },
    });

    expect(score.overlapSpeechLossRate).toBeGreaterThan(0.4);
  });

  it("counts overlapping turns by the same speaker and false alarms across the full audio", () => {
    const baseTurn = {
      confidence: null,
      speakerKey: "speaker-1",
      text: "内容",
      track: "remote" as const,
    };
    const sameSpeakerOverlap = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 3000,
      overlapIntervals: [],
      prediction: {
        language: "zh",
        turns: [{ ...baseTurn, endMs: 3000, startMs: 0 }],
      },
      reference: {
        language: "zh",
        turns: [
          { ...baseTurn, endMs: 2000, startMs: 0 },
          { ...baseTurn, endMs: 3000, startMs: 1000 },
        ],
      },
    });
    const outsideFalseAlarm = scoreMeetingTranscription({
      entities: [],
      evaluationDurationMs: 3000,
      overlapIntervals: [],
      prediction: {
        language: "zh",
        turns: [
          { ...baseTurn, endMs: 900, speakerKey: "extra", startMs: 0 },
          { ...baseTurn, endMs: 2000, startMs: 1000 },
        ],
      },
      reference: {
        language: "zh",
        turns: [{ ...baseTurn, endMs: 2000, startMs: 1000 }],
      },
    });

    expect(sameSpeakerOverlap.speakerErrorRate).toBe(0);
    expect(outsideFalseAlarm.speakerErrorRate).toBeGreaterThan(0);
  });
});
