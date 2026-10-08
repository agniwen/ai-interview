import { expect, it } from "vitest";
import { getDemoTourSteps } from "./demo-tour-steps";

it("follows one candidate from invitation through AI and human interviews to Offer", () => {
  const targets = getDemoTourSteps().map((step) => step.target);
  expect(targets.filter((target) => target.includes("data-demo-candidate="))).toEqual([
    '[data-demo-candidate="01842"]',
  ]);
  const actions = [
    "launch",
    "enter-interview",
    "next-turn",
    "finish-ai",
    "transition-human",
    "enter-human-room",
    "room-materials",
    "room-questions",
    "room-review",
    "finish-human",
    "transition-offer",
    "detail-back",
  ];
  let previous = -1;
  for (const action of actions) {
    const index = targets.indexOf(`[data-demo-${action}]`);
    expect(index).toBeGreaterThan(previous);
    previous = index;
  }
  expect(targets.some((target) => /save|delete|confirm|data-demo-page/.test(target))).toBe(false);
});
