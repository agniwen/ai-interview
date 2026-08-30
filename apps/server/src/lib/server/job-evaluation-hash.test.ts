import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  computeJobEvaluationDraftInputHash,
  computeJobEvaluationPayloadHash,
} from "./job-evaluation-hash";

describe("job evaluation hashes", () => {
  it("ignores operational fields and canonicalizes condition ordering", () => {
    const config = createDefaultJobDescriptionStructuredConfig();
    config.priorityConditions = [
      { condition: "B", id: "b", points: 2 },
      { condition: "A", id: "a", points: 1 },
    ];
    const first = computeJobEvaluationDraftInputHash({
      description: "JD",
      prompt: "Prompt",
      structuredConfig: config,
    });
    config.priorityConditions.reverse();
    const second = computeJobEvaluationDraftInputHash({
      description: "JD",
      prompt: "Prompt",
      structuredConfig: config,
    });

    expect(first).toBe(second);
    expect(computeJobEvaluationPayloadHash({ a: 1, b: 2 })).toBe(
      computeJobEvaluationPayloadHash({ a: 1, b: 2 }),
    );
  });
});
