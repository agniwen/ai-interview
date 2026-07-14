import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNetworkChoiceMetadataDialogTrigger = vi.fn(() => null);
const mockToolApprovalButtons = vi.fn(() => null);

vi.mock("../badges/network-choice-metadata-dialog", () => ({
  NetworkChoiceMetadataDialogTrigger: mockNetworkChoiceMetadataDialogTrigger,
}));

vi.mock("../badges/tool-approval-buttons", () => ({
  ToolApprovalButtons: mockToolApprovalButtons,
}));

vi.mock("@mastra/playground-ui/components/CodeEditor", () => ({
  CodeEditor: () => null,
}));

vi.mock("@mastra/playground-ui/icons/AgentIcon", () => ({
  AgentIcon: () => null,
}));

vi.mock("../badges/badge-wrapper", () => ({
  BadgeWrapper: ({ extraInfo }: { extraInfo: ReactNode }) => extraInfo,
}));

vi.mock("../badges/background-task-metadata-dialog", () => ({
  BackgroundTaskMetadataDialogTrigger: () => null,
}));

vi.mock("../tool-card", () => ({
  ToolCard: () => null,
}));

vi.mock("react-markdown", () => ({
  default: () => null,
}));

describe("AgentBadge routing decision", () => {
  beforeEach(() => {
    mockNetworkChoiceMetadataDialogTrigger.mockClear();
    mockToolApprovalButtons.mockClear();
  });

  it("prefers routingDecision.selectionReason and passes the parsed decision as input", async () => {
    const { AgentBadge } = await import("../badges/agent-badge");

    const routingDecision = {
      agentId: "weather",
      isNetwork: true,
      selectionReason: "User asked about weather",
    };

    renderToStaticMarkup(
      AgentBadge({
        agentId: "weather",
        isNetwork: true,
        messages: [],
        metadata: {
          agentInput: "fallback input",
          mode: "network",
          routingDecision,
          selectionReason: "fallback reason",
        },
        toolApprovalMetadata: undefined,
        toolCallId: "tool-call-1",
        toolName: "agent-call",
      }),
    );

    expect(mockNetworkChoiceMetadataDialogTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        input: routingDecision,
        selectionReason: "User asked about weather",
      }),
      undefined,
    );
  });

  it("falls back to metadata.selectionReason when no routingDecision is present", async () => {
    const { AgentBadge } = await import("../badges/agent-badge");

    renderToStaticMarkup(
      AgentBadge({
        agentId: "weather",
        isNetwork: true,
        messages: [],
        metadata: {
          agentInput: { foo: "bar" },
          mode: "network",
          selectionReason: "fallback reason",
        },
        toolApprovalMetadata: undefined,
        toolCallId: "tool-call-1",
        toolName: "agent-call",
      }),
    );

    expect(mockNetworkChoiceMetadataDialogTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { foo: "bar" },
        selectionReason: "fallback reason",
      }),
      undefined,
    );
  });
});
