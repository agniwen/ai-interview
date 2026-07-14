import type { MastraDBMessage } from "@mastra/react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messageStatusRenderers } from "../status-renderers";

const message = {
  content: { format: 2, parts: [] },
  createdAt: new Date(),
  id: "m1",
  role: "assistant",
} satisfies MastraDBMessage;

describe("messageStatusRenderers", () => {
  it("renders the error notice", () => {
    const Error = messageStatusRenderers.Error!;
    const { getByText } = render(<>{Error({ message, text: "boom" })}</>);
    expect(getByText("Error")).not.toBeNull();
    expect(getByText("boom")).not.toBeNull();
  });

  it("renders the warning notice", () => {
    const Warning = messageStatusRenderers.Warning!;
    const { getByText } = render(<>{Warning({ message, text: "careful" })}</>);
    expect(getByText("Warning")).not.toBeNull();
    expect(getByText("careful")).not.toBeNull();
  });

  it("forwards tripwire metadata to the tripwire notice", () => {
    const Tripwire = messageStatusRenderers.Tripwire!;
    const { getByText } = render(
      <>
        {Tripwire({
          message,
          text: "blocked",
          tripwire: { processorId: "guard", reason: "blocked" },
        })}
      </>,
    );
    expect(getByText("blocked")).not.toBeNull();
  });
});
