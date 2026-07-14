import type { DataPart } from "@mastra/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataPartRenderer } from "../data-part-renderer";

describe("DataPartRenderer", () => {
  it("renders a SignalBadge for a valid data-signal part", () => {
    const part = {
      data: { contents: "signal body", metadata: { state: { id: "cart" } }, type: "state" },
      type: "data-signal",
    } satisfies DataPart;

    render(<DataPartRenderer part={part} />);

    expect(screen.getByText("cart")).toBeTruthy();
  });

  it("renders nothing for a non-signal data part", () => {
    const part = { data: { foo: "bar" }, type: "data-other" } satisfies DataPart;

    const { container } = render(<DataPartRenderer part={part} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the signal data is not a recognized signal shape", () => {
    const part = { data: { type: "unknown" }, type: "data-signal" } satisfies DataPart;

    const { container } = render(<DataPartRenderer part={part} />);

    expect(container.firstChild).toBeNull();
  });
});
