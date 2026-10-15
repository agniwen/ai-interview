import { describe, expect, it } from "vitest";
import { parseQwenHeadshotAnswer } from "../qwen-headshot";

describe("parseQwenHeadshotAnswer", () => {
  it("converts fenced 0–1000 boxes into page-relative boxes", () => {
    const answer = `\`\`\`json
{"has_photo": 0.97,
 "photo": {"bbox_2d": [796, 70, 918, 199], "confidence": 0.9},
 "person": {"bbox_2d": [800, 78, 915, 198], "confidence": 0.88}}
\`\`\``;

    expect(parseQwenHeadshotAnswer(answer, "qwen3-vl-plus")).toEqual({
      model: "qwen3-vl-plus",
      person: { box: { bottom: 0.198, left: 0.8, right: 0.915, top: 0.078 }, confidence: 0.88 },
      photo: { box: { bottom: 0.199, left: 0.796, right: 0.918, top: 0.07 }, confidence: 0.9 },
      photoProbability: 0.97,
    });
  });

  it("falls back to the photo probability when a box omits its confidence", () => {
    const location = parseQwenHeadshotAnswer(
      '{"has_photo": 0.8, "photo": null, "person": {"bbox_2d": [100, 100, 300, 400]}}',
      "qwen3-vl-plus",
    );

    expect(location.person?.confidence).toBe(0.8);
    expect(location.photo).toBeNull();
  });

  it("reports a resume without a photo as having no boxes", () => {
    expect(
      parseQwenHeadshotAnswer('{"has_photo": 0, "photo": null, "person": null}', "qwen3-vl-plus"),
    ).toEqual({ model: "qwen3-vl-plus", person: null, photo: null, photoProbability: 0 });
  });

  it.each([
    ["non-JSON text", "这页简历没有照片。"],
    ["out-of-range coordinates", '{"has_photo": 0.9, "person": {"bbox_2d": [0, 0, 1200, 400]}}'],
    ["a missing photo probability", '{"person": null, "photo": null}'],
  ])("rejects %s so the attempt is recorded as failed", (_label, answer) => {
    expect(() => parseQwenHeadshotAnswer(answer, "qwen3-vl-plus")).toThrow();
  });
});
