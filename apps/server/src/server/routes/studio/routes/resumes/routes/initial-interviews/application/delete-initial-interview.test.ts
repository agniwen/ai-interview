import { describe, expect, it, vi } from "vitest";
import { canDeleteInitialInterview } from "./delete-initial-interview";

describe("人工初面删除的历史限制", () => {
  it.each([
    {
      allowed: true,
      events: [],
      name: "从未进入复面",
      nodes: [],
      rounds: [],
      stage: "ai_interview",
    },
    {
      allowed: false,
      events: [{ id: "history" }],
      name: "进入复面后又退回",
      nodes: [],
      rounds: [],
      stage: "ai_interview",
    },
    {
      allowed: false,
      events: [],
      name: "保留复面进入时间",
      nodes: [{ node: "second_interview" }],
      rounds: [],
      stage: "ai_interview",
    },
    {
      allowed: false,
      events: [],
      name: "保留真人轮次",
      nodes: [],
      rounds: [{ id: "round" }],
      stage: "ai_interview",
    },
    {
      allowed: false,
      events: [],
      name: "当前在真人复面",
      nodes: [],
      rounds: [],
      stage: "second_interview",
    },
    { allowed: false, events: [], name: "当前已到 Offer", nodes: [], rounds: [], stage: "offer" },
  ])("$name", async ({ stage, events, nodes, rounds, allowed }) => {
    const select = vi.fn();
    for (const rows of [events, nodes, rounds, [{ closedFromNode: null, stage }]]) {
      select.mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
      });
    }
    // SAFETY: this read-only fixture implements the four select/from/where/limit queries used by the guard.
    const database = { select } as Parameters<typeof canDeleteInitialInterview>[1];
    expect(
      await canDeleteInitialInterview(
        { organizationId: "org", recruitingRecordId: "record" },
        database,
      ),
    ).toBe(allowed);
  });
});
