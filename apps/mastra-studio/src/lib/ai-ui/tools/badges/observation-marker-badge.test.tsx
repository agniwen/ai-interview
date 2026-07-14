// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationMarkerBadge } from "./observation-marker-badge";

afterEach(() => cleanup());

describe("ObservationMarkerBadge extraction rendering", () => {
  it("shows scalar and structured extracted values from completed observation markers", () => {
    render(
      <ObservationMarkerBadge
        toolName="mastra-memory-om-observation"
        args={{}}
        metadata={{
          omData: {
            _state: "complete",
            completedAt: "2026-05-29T00:00:00.000Z",
            cycleId: "cycle-1",
            extractedValues: {
              mood: "focused",
              profile: { plan: "rewrite", priority: 1 },
            },
            observationTokens: 300,
            operationType: "observation",
            tokensObserved: 1200,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /extractions \(2\)/i }));

    expect(screen.getByText("mood")).toBeTruthy();
    expect(screen.getByText("focused")).toBeTruthy();
    expect(screen.getByText("profile")).toBeTruthy();
    expect(screen.getByText(/"plan": "rewrite"/)).toBeTruthy();
    expect(screen.getByText(/"priority": 1/)).toBeTruthy();
  });

  it("shows extraction failures from buffered reflection markers", () => {
    render(
      <ObservationMarkerBadge
        toolName="mastra-memory-om-observation"
        args={{}}
        metadata={{
          omData: {
            _state: "buffering-complete",
            bufferedTokens: 400,
            completedAt: "2026-05-29T00:00:00.000Z",
            cycleId: "cycle-2",
            extractionFailures: [{ error: "Expected object, received string", slug: "profile" }],
            operationType: "reflection",
            tokensBuffered: 1600,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /extractions \(0\).*1 failed/i }));

    expect(screen.getByText("profile")).toBeTruthy();
    expect(screen.getByText("Expected object, received string")).toBeTruthy();
  });
});
