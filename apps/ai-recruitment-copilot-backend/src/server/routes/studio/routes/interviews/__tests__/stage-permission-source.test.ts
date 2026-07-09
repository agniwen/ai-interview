import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");

describe("late-stage route permissions", () => {
  it("splits human interview routes by CRUD permissions", () => {
    expect(routeSource).toContain(
      '"/human-interview-meetings",\n    requirePermission("humanInterview", "read")',
    );
    expect(routeSource).toContain(
      '"/human-interview-meetings",\n    requirePermission("humanInterview", "create")',
    );
    expect(routeSource).toContain(
      '.post(\n    "/:id/human-interview-rounds",\n    requirePermission("humanInterview", "create")',
    );
    expect(routeSource).toContain(
      '.patch(\n    "/:id/human-interview-rounds/:roundId",\n    requirePermission("humanInterview", "update")',
    );
    expect(routeSource).toContain(
      '.delete(\n    "/human-interview-meetings/:meetingId",\n    requirePermission("humanInterview", "delete")',
    );
    expect(routeSource).toContain(
      '.post(\n    "/:id/human-interview-rounds/:roundId/cancel",\n    requirePermission("humanInterview", "delete")',
    );
    expect(routeSource).not.toContain('requirePermission("humanInterview", "manage")');
  });

  it("splits offer routes by CRUD permissions", () => {
    expect(routeSource).toContain('.get("/:id/offer-drafts", requirePermission("offer", "read")');
    expect(routeSource).toContain(
      '.post(\n    "/:id/offer-drafts",\n    requirePermission("offer", "create")',
    );
    expect(routeSource).toContain(
      '.patch(\n    "/:id/offer-drafts/:draftId",\n    requirePermission("offer", "update")',
    );
    expect(routeSource).toContain(
      '.post("/:id/offer-drafts/:draftId/send", requirePermission("offer", "update")',
    );
    expect(routeSource).toContain(
      '.post(\n    "/:id/offer-drafts/:draftId/respond",\n    requirePermission("offer", "update")',
    );
    expect(routeSource).toContain(
      '.post("/:id/offer-drafts/:draftId/cancel", requirePermission("offer", "delete")',
    );
    expect(routeSource).not.toContain('requirePermission("offer", "manage")');
  });

  it("records candidate activity for human interview and offer mutations", () => {
    expect(routeSource).toContain("function recordCandidateActivity(");
    expect(routeSource).toContain('action: "human_interview_round_created"');
    expect(routeSource).toContain('action: "human_interview_round_updated"');
    expect(routeSource).toContain('action: "human_interview_round_completed"');
    expect(routeSource).toContain('action: "human_interview_round_cancelled"');
    expect(routeSource).toContain('action: "offer_draft_created"');
    expect(routeSource).toContain('action: "offer_draft_updated"');
    expect(routeSource).toContain('action: "offer_draft_sent"');
    expect(routeSource).toContain('action: "offer_draft_responded"');
    expect(routeSource).toContain('action: "offer_draft_cancelled"');
  });
});
