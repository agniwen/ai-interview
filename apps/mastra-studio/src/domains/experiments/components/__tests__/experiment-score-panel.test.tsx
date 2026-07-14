import type { ClientScoreRowData } from "@mastra/client-js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperimentScorePanel } from "../experiment-score-panel";

// Minimal fixture covering only the fields the panel reads. `hasJudge: false`
// marks it a code-based scorer so only the score section renders.
const score = {
  reason: "Looks correct",
  score: 0.92,
  scorer: { hasJudge: false },
  scorerId: "accuracy",
  traceId: undefined,
} as unknown as ClientScoreRowData;

describe("ExperimentScorePanel", () => {
  afterEach(cleanup);

  it("shows the scorer id and score when expanded", () => {
    render(<ExperimentScorePanel score={score} onClose={vi.fn()} />);

    expect(screen.getByText("accuracy")).toBeDefined();
    expect(screen.getByText(/Score: 0\.92/)).toBeDefined();
  });

  it("hides the score content when collapsed", () => {
    render(<ExperimentScorePanel score={score} onClose={vi.fn()} collapsed />);

    expect(screen.queryByText(/Score: 0\.92/)).toBeNull();
  });
});
