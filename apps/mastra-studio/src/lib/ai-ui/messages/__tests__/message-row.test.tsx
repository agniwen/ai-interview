import type { MastraDBMessage } from "@mastra/core/agent/message-list";
import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MessageRow } from "../message-row";
import {
  buildGlobalOmPartsByCycleId,
  convertOmPartsInMastraMessage,
} from "@/services/om-parts-converter";
import { ToolCallProvider } from "@/services/tool-call-provider";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:4111";

const mcpEmptyHandlers = [
  http.get(`${BASE_URL}/api/mcp/v0/servers`, () =>
    HttpResponse.json({ servers: [], totalCount: 0 }),
  ),
];

beforeEach(() => {
  server.use(...mcpEmptyHandlers);
});

afterEach(() => cleanup());

const Providers = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MastraReactProvider baseUrl={BASE_URL}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToolCallProvider
            approveToolcall={() => {}}
            declineToolcall={() => {}}
            approveToolcallGenerate={() => {}}
            declineToolcallGenerate={() => {}}
            approveNetworkToolcall={() => {}}
            declineNetworkToolcall={() => {}}
            isRunning={false}
            toolCallApprovals={{}}
            networkToolCallApprovals={{}}
          >
            {children}
          </ToolCallProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </MastraReactProvider>
  );
};

const renderRow = (message: MastraDBMessage) =>
  render(<MessageRow message={message} />, { wrapper: Providers });

const omPart = (name: string, data: Record<string, unknown>) => ({
  data,
  type: `data-${name}`,
});

const baseMessage = (over: Partial<MastraDBMessage>): MastraDBMessage =>
  ({
    content: { format: 2, parts: [] },
    createdAt: new Date(),
    id: "msg-1",
    role: "assistant",
    ...over,
  }) as MastraDBMessage;

describe("MessageRow", () => {
  it("renders assistant text as markdown", () => {
    renderRow(
      baseMessage({
        content: { format: 2, parts: [{ text: "Hello **world**", type: "text" }] },
        role: "assistant",
      }),
    );
    expect(screen.getByText("world")).toBeTruthy();
  });

  it("renders user text", () => {
    renderRow(
      baseMessage({
        content: { format: 2, parts: [{ text: "a user line", type: "text" }] },
        role: "user",
      }),
    );
    expect(screen.getByText("a user line")).toBeTruthy();
  });

  it("drops messages with no displayable role", () => {
    const { container } = renderRow(
      baseMessage({
        content: { format: 2, parts: [{ text: "hidden", type: "text" }] },
        role: "tool" as MastraDBMessage["role"],
      }),
    );
    expect(container.textContent).toBe("");
  });

  it("renders a signal data badge", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          parts: [
            {
              data: { contents: "signal body", metadata: { state: { id: "cart" } }, type: "state" },
              type: "data-signal",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(screen.getByText("cart")).toBeTruthy();
  });

  // Regression: a persisted reactive (non-user) `signal` row must render a
  // SignalBadge on read-back. This conversion existed at 1.41.0 and was lost
  // when the chat renderer was rewritten (PR #17774); the row was dropped.
  it("renders a persisted reactive signal row as a signal badge on read-back", () => {
    const { container } = renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { signal: { tagName: "system-reminder", type: "reactive" } },
          parts: [{ text: "reactive signal body", type: "text" }],
        } as never,
        id: "sig-1",
        role: "signal" as MastraDBMessage["role"],
        type: "reactive" as MastraDBMessage["type"],
      }),
    );
    expect(container.textContent).toContain("system-reminder");
    expect(container.textContent).toContain("reactive signal body");
  });

  // A non-user signal whose payload is not a renderable signal shape must be
  // dropped, not rendered as an empty assistant bubble.
  it("drops a non-user signal whose payload is not a renderable signal shape", () => {
    const { container } = renderRow(
      baseMessage({
        content: {
          format: 2,
          parts: [{ text: "internal signal body", type: "text" }],
        } as never,
        id: "sig-unknown",
        role: "signal" as MastraDBMessage["role"],
        type: "internal" as MastraDBMessage["type"],
      }),
    );
    expect(container.textContent).toBe("");
  });

  it("renders a persisted user signal row as a user message on read-back", () => {
    renderRow(
      baseMessage({
        content: { format: 2, parts: [{ text: "echoed user signal", type: "text" }] },
        id: "sig-user",
        role: "signal" as MastraDBMessage["role"],
        type: "user" as MastraDBMessage["type"],
      }),
    );
    expect(screen.getByText("echoed user signal")).toBeTruthy();
  });

  it("routes a tool-invocation part into ToolCard (generic tool badge)", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { mode: "stream" },
          parts: [
            {
              toolInvocation: {
                args: { q: "x" },
                result: { ok: true },
                state: "result",
                toolCallId: "call-1",
                toolName: "genericTool",
              },
              type: "tool-invocation",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(document.querySelector('[data-testid="tool-badge"]')).toBeTruthy();
  });

  it("routes an OM observation tool into the observation marker badge", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { mode: "stream" },
          parts: [
            {
              toolInvocation: {
                args: { cycleId: "cycle-1" },
                state: "call",
                toolCallId: "call-om",
                toolName: "mastra-memory-om-observation",
              },
              type: "tool-invocation",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(document.querySelector('[data-om-badge="cycle-1"]')).toBeTruthy();
  });

  it("hides updateWorkingMemory tool calls", () => {
    const { container } = renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { mode: "stream" },
          parts: [
            {
              toolInvocation: {
                args: {},
                result: "ok",
                state: "result",
                toolCallId: "call-wm",
                toolName: "updateWorkingMemory",
              },
              type: "tool-invocation",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(container.querySelector('[data-testid="tool-badge"]')).toBeNull();
  });

  it("renders approval buttons when requireApprovalMetadata is present for the tool", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: {
            mode: "stream",
            requireApprovalMetadata: {
              dangerousTool: { args: {}, toolCallId: "call-appr", toolName: "dangerousTool" },
            },
          },
          parts: [
            {
              toolInvocation: {
                args: {},
                state: "call",
                toolCallId: "call-appr",
                toolName: "dangerousTool",
              },
              type: "tool-invocation",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Decline")).toBeTruthy();
  });

  it("routes a reasoning part through MessageFactory into the reasoning body", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          parts: [{ reasoning: "thinking out loud", type: "reasoning" } as never],
        },
        role: "assistant",
      }),
    );
    expect(screen.getByText("thinking out loud")).toBeTruthy();
  });

  it("routes a dynamic-tool part into ToolCard (generic tool badge)", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { mode: "stream" },
          parts: [
            {
              input: { q: "x" },
              output: { ok: true },
              state: "output-available",
              toolCallId: "call-dyn",
              toolName: "dynamicGenericTool",
              type: "tool-dynamicGenericTool",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );
    expect(document.querySelector('[data-testid="tool-badge"]')).toBeTruthy();
  });

  it("renders live streamed OM extraction output from a dynamic-tool part", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { mode: "stream" },
          parts: [
            {
              input: { _state: "loading", cycleId: "cycle-live", operationType: "observation" },
              output: {
                omData: {
                  _state: "complete",
                  cycleId: "cycle-live",
                  extractedValues: { workingMemory: { name: "Tyler" } },
                  operationType: "observation",
                },
                status: "complete",
              },
              state: "output-available",
              toolCallId: "om-observation-cycle-live",
              toolName: "mastra-memory-om-observation",
              type: "dynamic-tool",
            } as never,
          ],
        },
        role: "assistant",
      }),
    );

    expect(screen.getByRole("button", { name: /observed/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /extractions \(1\)/i })).toBeTruthy();
  });

  it("renders buffered OM extraction output when activation and completion are both present", () => {
    const rawMessage = baseMessage({
      content: {
        format: 2,
        metadata: { mode: "stream" },
        parts: [
          omPart("om-buffering-start", {
            cycleId: "cycle-buffer-live",
            operationType: "observation",
          }),
          omPart("om-activation", {
            cycleId: "cycle-buffer-live",
            operationType: "observation",
            tokensActivated: 42,
          }),
          omPart("om-buffering-end", {
            bufferedTokens: 8,
            cycleId: "cycle-buffer-live",
            extractedValues: { workingMemory: { name: "Tyler" } },
            operationType: "observation",
            tokensBuffered: 42,
          }),
        ] as never,
      },
      role: "assistant",
    });
    const globalParts = buildGlobalOmPartsByCycleId([rawMessage]);
    const message = convertOmPartsInMastraMessage(rawMessage, globalParts);

    renderRow(message);

    expect(screen.getByRole("button", { name: /buffered observations/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /extractions \(1\)/i })).toBeTruthy();
  });

  it("routes a user file part into an in-message attachment preview", () => {
    const { container } = renderRow(
      baseMessage({
        content: {
          format: 2,
          parts: [
            { data: "https://example.com/a.png", mimeType: "image/png", type: "file" } as never,
          ],
        },
        role: "user",
      }),
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
  });

  it("renders a message-level error notice via the status.Error slot", () => {
    renderRow(
      baseMessage({
        content: {
          format: 2,
          metadata: { status: "error" },
          parts: [{ text: "boom went wrong", type: "text" }],
        },
        role: "assistant",
      }),
    );
    expect(screen.getByText("boom went wrong")).toBeTruthy();
    expect(screen.getByText("Error")).toBeTruthy();
  });

  describe("when an assistant message contains a step-start part", () => {
    it('does not render the debug "Fallback:" text and still renders the text part', () => {
      const { container } = renderRow(
        baseMessage({
          content: {
            format: 2,
            parts: [{ type: "step-start" } as never, { text: "real content", type: "text" }],
          },
          role: "assistant",
        }),
      );

      expect(screen.getByText("real content")).toBeTruthy();
      expect(container.textContent).not.toContain("Fallback:");
      expect(container.textContent).not.toContain("step-start");
    });
  });

  describe("when a task signal carries an empty task snapshot", () => {
    it("hides the signal badge (tasks render in the docked TaskPanel)", () => {
      const { container } = renderRow(
        baseMessage({
          content: {
            format: 2,
            parts: [
              {
                data: {
                  metadata: { value: { tasks: [] } },
                  tagName: "current-task-list",
                  type: "state",
                },
                type: "data-signal",
              } as never,
            ],
          },
          role: "assistant",
        }),
      );
      expect(container.textContent).toBe("");
    });
  });

  describe("when a task signal carries an item with an invalid status", () => {
    it("rejects the task shape and falls back to the generic state badge", () => {
      renderRow(
        baseMessage({
          content: {
            format: 2,
            parts: [
              {
                data: {
                  metadata: {
                    state: { id: "current-task-list" },
                    value: {
                      tasks: [
                        {
                          activeForm: "Doing thing",
                          content: "Do thing",
                          id: "t1",
                          status: "bogus",
                        },
                      ],
                    },
                  },
                  tagName: "current-task-list",
                  type: "state",
                },
                type: "data-signal",
              } as never,
            ],
          },
          role: "assistant",
        }),
      );
      expect(screen.getByText("current-task-list")).toBeTruthy();
    });
  });
});
