import { describe, expect, it } from "vitest";
import { readRecruitingCard } from "../card-result";
import { listCard } from "./fixtures";

describe("readRecruitingCard", () => {
  it("accepts structuredContent that matches the card contract", () => {
    expect(readRecruitingCard({ structuredContent: listCard })).toEqual({ card: listCard });
  });

  it("surfaces the server's message for error results", () => {
    expect(
      readRecruitingCard({
        content: [{ text: "候选人不存在或不可访问。", type: "text" }],
        isError: true,
      }),
    ).toEqual({ error: "候选人不存在或不可访问。" });
  });

  it("refuses to render structuredContent outside the contract", () => {
    const result = readRecruitingCard({ structuredContent: { kind: "candidate_list" } });
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("card");
  });
});
