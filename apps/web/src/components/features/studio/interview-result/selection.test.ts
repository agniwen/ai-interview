import { expect, it } from "vitest";
import { isCurrentInterviewResultSelected } from "./selection";

it.each([
  [null, undefined, true],
  [null, null, true],
  ["latest", "latest", true],
  ["history", "latest", false],
  [null, "latest", false],
] as const)("selected %s, latest %s: current=%s", (selected, latest, expected) => {
  expect(isCurrentInterviewResultSelected(selected, latest)).toBe(expected);
});
