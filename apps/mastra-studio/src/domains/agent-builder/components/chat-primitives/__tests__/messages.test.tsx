import type { MastraDBMessage, MastraMessagePart } from "@mastra/core/agent/message-list";
import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageRow } from "../messages";
import type { AgentBuilderEditFormValues } from "@/domains/agent-builder/schemas";
import {
  SET_AGENT_BROWSER_ENABLED_TOOL_NAME,
  SET_AGENT_DESCRIPTION_TOOL_NAME,
  SET_AGENT_INSTRUCTIONS_TOOL_NAME,
  SET_AGENT_MODEL_TOOL_NAME,
  SET_AGENT_NAME_TOOL_NAME,
  SET_AGENT_SKILLS_TOOL_NAME,
  SET_AGENT_TOOLS_TOOL_NAME,
  SET_AGENT_WORKSPACE_ID_TOOL_NAME,
} from "@/domains/agent-builder/services/tool-constants";
import { server } from "@/test/msw-server";

type ToolPart = MastraMessagePart;

interface BuilderToolInput {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  output?: unknown;
}

const builderToolPart = (toolInput: BuilderToolInput): ToolPart =>
  ({
    toolInvocation: {
      args: toolInput.input,
      result: "output" in toolInput ? toolInput.output : { success: true },
      state: "result",
      step: 0,
      toolCallId: toolInput.toolCallId,
      toolName: toolInput.toolName,
    },
    type: "tool-invocation",
  }) as unknown as ToolPart;

interface PrimitivesMock {
  agentId: string;
  toolsData: Record<string, { description?: string }>;
  agentsData: Record<string, { name?: string; description?: string }>;
  workflowsData: Record<string, { name?: string; description?: string }>;
  availableSkills: { id: string; name: string }[];
}

let primitivesMock: PrimitivesMock = {
  agentId: "agent-1",
  agentsData: {},
  availableSkills: [],
  toolsData: {},
  workflowsData: {},
};

vi.mock("../../../contexts/agent-primitives-context", () => ({
  useAgentPrimitives: () => primitivesMock,
}));

const BASE_URL = "http://localhost:4111";

// Builder settings with no `picker` → `useBuilderPickerVisibility` resolves to
// unrestricted (all visible* null), matching the prior stubbed behavior.
const builderSettingsHandler = http.get(`${BASE_URL}/api/editor/builder/settings`, () =>
  HttpResponse.json({ enabled: true }),
);

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
});

const FormWrapper = ({
  children,
  defaultValues,
}: {
  children: ReactNode;
  defaultValues?: Partial<AgentBuilderEditFormValues>;
}) => {
  const methods = useForm<AgentBuilderEditFormValues>({
    defaultValues: { description: "", instructions: "", name: "", ...defaultValues },
  });
  return (
    <MastraReactProvider baseUrl={BASE_URL}>
      <QueryClientProvider client={queryClient}>
        <FormProvider {...methods}>{children}</FormProvider>
      </QueryClientProvider>
    </MastraReactProvider>
  );
};

const renderMessage = (
  message: MastraDBMessage,
  defaultValues?: Partial<AgentBuilderEditFormValues>,
) =>
  render(
    <FormWrapper defaultValues={defaultValues}>
      <MessageRow message={message} />
    </FormWrapper>,
  );

const renderRow = (parts: ToolPart[], defaultValues?: Partial<AgentBuilderEditFormValues>) =>
  renderMessage(buildMessage(parts), defaultValues);

const buildMessage = (parts: ToolPart[]): MastraDBMessage =>
  ({
    content: {
      format: 2,
      parts,
    },
    createdAt: new Date(),
    id: "msg-1",
    role: "assistant",
  }) as unknown as MastraDBMessage;

describe("MessageRow dynamic-tool rendering", () => {
  beforeAll(() => {
    server.use(builderSettingsHandler);
  });

  beforeEach(() => {
    primitivesMock = {
      agentId: "agent-1",
      agentsData: {},
      availableSkills: [],
      toolsData: {},
      workflowsData: {},
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders persisted signal user text as a user message", () => {
    const prompt =
      "Build an agent that reviews TypeScript pull requests on GitHub. Look for type-safety issues, missing tests, and inconsistent patterns. Leave inline review comments with concrete suggestions.";

    const { container } = renderMessage({
      content: {
        format: 2,
        metadata: {
          signal: {
            acceptedAt: "2026-06-02T16:18:41.295Z",
            createdAt: "2026-06-02T16:18:41.310Z",
            id: "user-1780417120014-jvuzgio",
            tagName: "user",
            type: "user",
          },
        },
        parts: [
          {
            createdAt: 1_780_417_121_310,
            text: prompt,
            type: "text",
          },
        ],
      },
      createdAt: new Date("2026-06-02T16:18:41.310Z"),
      id: "user-1780417120014-jvuzgio",
      resourceId: "builder-agent",
      role: "signal",
      threadId: "agent-builder-rgyY_adhrsPtX7KSaaCsU",
      type: "user",
    });

    expect(container.textContent).toContain(prompt);
    expect(container.querySelector(".justify-end")).not.toBeNull();
  });

  // An unrecognized signal type (not state/notification/reactive) produces no
  // SignalBadge, so its raw text is never shown.
  it("does not render unrecognized signal text messages", () => {
    const { container } = renderMessage({
      content: {
        format: 2,
        parts: [{ text: "Internal signal", type: "text" }],
      },
      createdAt: new Date("2026-06-02T16:18:41.310Z"),
      id: "signal-1",
      role: "signal",
      type: "internal",
    });

    expect(container.textContent).not.toContain("Internal signal");
    // The row is dropped entirely rather than left as an empty assistant bubble.
    expect(container.textContent).toBe("");
  });

  // Regression: a persisted reactive signal must render as a SignalBadge on
  // read-back. This conversion existed at 1.41.0 and was lost when the renderer
  // was rewritten (PR #17774), which dropped the row entirely.
  it("renders a persisted reactive signal row as a signal badge on read-back", () => {
    const { container } = renderMessage({
      content: {
        format: 2,
        metadata: { signal: { tagName: "system-reminder", type: "reactive" } },
        parts: [{ text: "reactive signal body", type: "text" }],
      },
      createdAt: new Date("2026-06-02T16:18:41.310Z"),
      id: "signal-reactive-1",
      role: "signal",
      type: "reactive",
    });

    expect(container.textContent).toContain("system-reminder");
    expect(container.textContent).toContain("reactive signal body");
  });

  it("renders user text through the shared MarkdownRenderer in a right-aligned bubble", () => {
    const { container } = renderMessage({
      content: {
        format: 2,
        parts: [{ text: "hello **world**", type: "text" }],
      },
      createdAt: new Date(),
      id: "user-md-1",
      role: "user",
    } as unknown as MastraDBMessage);

    expect(container.querySelector(".justify-end")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("world");
  });

  it("renders assistant text through the shared MarkdownRenderer", () => {
    const { container } = renderMessage(
      buildMessage([{ text: "reply **bold**", type: "text" } as ToolPart]),
    );

    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("routes assistant text through the shared MessageText error-prefix handling", () => {
    const { container } = renderMessage(
      buildMessage([{ text: "Error: it broke", type: "text" } as ToolPart]),
    );

    // The shared MessageText turns an `Error:`-prefixed body into a destructive notice.
    expect(container.textContent).toContain("it broke");
    expect(container.querySelector('[class*="destructive"]')).not.toBeNull();
  });

  it("renders a tripwire-status message through the shared TripwireNotice", () => {
    const { container } = renderMessage({
      content: {
        format: 2,
        metadata: { mode: "stream", status: "tripwire" },
        parts: [{ text: "blocked for safety", type: "text" }],
      },
      createdAt: new Date(),
      id: "assistant-tripwire-1",
      role: "assistant",
    } as unknown as MastraDBMessage);

    expect(container.textContent).toContain("Content Blocked");
    expect(container.textContent).toContain("blocked for safety");
  });

  it("renders a warning-status message through the shared warning notice", () => {
    const { container } = renderMessage({
      content: {
        format: 2,
        metadata: { mode: "stream", status: "warning" },
        parts: [{ text: "heads up about this", type: "text" }],
      },
      createdAt: new Date(),
      id: "assistant-warning-1",
      role: "assistant",
    } as unknown as MastraDBMessage);

    expect(container.textContent).toContain("Warning");
    expect(container.textContent).toContain("heads up about this");
  });

  it("renders the generic fallback for non-builder dynamic tools", () => {
    const { container, getByRole } = renderRow([
      builderToolPart({
        input: { tools: [{ id: "web-search", name: "Web Search" }] },
        output: { success: true },
        toolCallId: "call-5",
        toolName: "some-other-tool",
      }),
    ]);

    // Unknown dynamic tools render as a GenericTool ToolCard showing "Executing <toolName>".
    expect(container.textContent).toContain("Executing");
    expect(container.textContent).toContain("some-other-tool");
    expect(container.textContent).not.toContain("Web Search");

    fireEvent.click(getByRole("button"));

    expect(container.textContent).toContain("Input");
    expect(container.textContent).toContain('"web-search"');
    expect(container.textContent).toContain("Output");
    expect(container.textContent).toContain('"success": true');
  });

  it("omits the generic fallback output panel when there is no output", () => {
    const { container, getByRole } = renderRow([
      builderToolPart({
        input: { a: 1 },
        output: undefined,
        toolCallId: "call-5",
        toolName: "some-other-tool",
      }),
    ]);

    fireEvent.click(getByRole("button"));

    expect(container.textContent).toContain("Input");
    expect(container.textContent).not.toContain("Output");
  });

  it("renders signal data parts in agent-builder chat messages", () => {
    const { container } = renderRow([
      {
        data: {
          attributes: { pending: 2, priority: "high" },
          contents: [{ text: "github: 2", type: "text" }],
          tagName: "notification-summary",
          type: "notification",
        },
        type: "data-signal",
      } as ToolPart,
    ]);

    expect(container.textContent).toContain("Notification summary");
    expect(container.textContent).toContain("github: 2");
    expect(container.textContent).toContain("2 pending");
    expect(container.textContent).toContain("high");
  });

  it("renders MessageSetAgentName for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { name: "Acme Bot" },
          output: { success: true },
          toolCallId: "call-name",
          toolName: SET_AGENT_NAME_TOOL_NAME,
        }),
      ],
      { name: "Acme Bot" },
    );
    expect(container.textContent).toContain("Setting the agent name:");
    expect(container.textContent).toContain("Acme Bot");
  });

  it("renders MessageSetAgentName for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { name: "Acme Bot" },
          output: { success: true },
          toolCallId: "call-name-r",
          toolName: SET_AGENT_NAME_TOOL_NAME,
        }),
      ],
      { name: "Acme Bot" },
    );
    expect(container.textContent).toContain("Setting the agent name:");
    expect(container.textContent).toContain("Acme Bot");
  });

  it("renders MessageSetAgentDescription for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { description: "A helpful research assistant." },
          output: { success: true },
          toolCallId: "call-desc",
          toolName: SET_AGENT_DESCRIPTION_TOOL_NAME,
        }),
      ],
      { description: "A helpful research assistant." },
    );
    expect(container.textContent).toContain("Setting the agent description:");
    expect(container.textContent).toContain("A helpful research assistant.");
  });

  it("renders MessageSetAgentDescription for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { description: "A helpful research assistant." },
          output: { success: true },
          toolCallId: "call-desc-r",
          toolName: SET_AGENT_DESCRIPTION_TOOL_NAME,
        }),
      ],
      { description: "A helpful research assistant." },
    );
    expect(container.textContent).toContain("Setting the agent description:");
    expect(container.textContent).toContain("A helpful research assistant.");
  });

  it("renders MessageSetAgentInstructions for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { instructions: "Always answer in French." },
          output: { success: true },
          toolCallId: "call-instr",
          toolName: SET_AGENT_INSTRUCTIONS_TOOL_NAME,
        }),
      ],
      { instructions: "Always answer in French." },
    );
    expect(container.textContent).toContain("Setting the agent instructions:");
    expect(container.textContent).toContain("Always answer in French.");
  });

  it("renders MessageSetAgentInstructions for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { instructions: "Always answer in French." },
          output: { success: true },
          toolCallId: "call-instr-r",
          toolName: SET_AGENT_INSTRUCTIONS_TOOL_NAME,
        }),
      ],
      { instructions: "Always answer in French." },
    );
    expect(container.textContent).toContain("Setting the agent instructions:");
    expect(container.textContent).toContain("Always answer in French.");
  });

  // MVP follow-up: MessageSetAgentTools now reads integration tools via React
  // Query (`useAvailableAgentTools` → `useAllProviderTools`). The render
  // harness here does not wrap in QueryClientProvider + MSW. Re-enable as part
  // of the ToolProvider Connections follow-up.
  it.skip("MessageSetAgentTools shows only the checked tools/agents/workflows from the form", () => {
    primitivesMock = {
      ...primitivesMock,
      agentsData: { "my-agent": { name: "My Agent" } },
      toolsData: { "web-search": { description: "Search" } },
      workflowsData: { "my-workflow": { name: "My Workflow" } },
    };

    const { container } = renderRow(
      [
        builderToolPart({
          input: { tools: [] },
          output: { success: true },
          toolCallId: "call-tools-mixed",
          toolName: SET_AGENT_TOOLS_TOOL_NAME,
        }),
      ],
      {
        agents: { "my-agent": true },
        tools: {},
        workflows: { "my-workflow": true },
      } as Partial<AgentBuilderEditFormValues>,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Enabling tools:");
    expect(text).toContain("My Agent");
    expect(text).toContain("My Workflow");
    expect(text).not.toContain("web-search");
  });

  // MVP follow-up: same React Query gap as the previous test.
  it.skip('MessageSetAgentTools renders "none" when nothing is selected', () => {
    primitivesMock = {
      ...primitivesMock,
      toolsData: { "web-search": { description: "Search" } },
    };

    const { container } = renderRow(
      [
        builderToolPart({
          input: { tools: [] },
          output: { success: true },
          toolCallId: "call-tools-none",
          toolName: SET_AGENT_TOOLS_TOOL_NAME,
        }),
      ],
      { agents: {}, tools: {}, workflows: {} } as Partial<AgentBuilderEditFormValues>,
    );

    expect(container.textContent).toContain("Enabling tools: none");
  });

  it("MessageSetAgentSkills shows only the checked skills from the form", () => {
    primitivesMock = {
      ...primitivesMock,
      availableSkills: [
        { id: "sk-1", name: "Summarize" },
        { id: "sk-2", name: "Translate" },
      ],
    };

    const { container } = renderRow(
      [
        builderToolPart({
          input: { skills: [] },
          output: { success: true },
          toolCallId: "call-skills",
          toolName: SET_AGENT_SKILLS_TOOL_NAME,
        }),
      ],
      { skills: { "sk-1": true, "sk-2": true } } as Partial<AgentBuilderEditFormValues>,
    );

    expect(container.textContent).toContain("Enabling skills:");
    expect(container.textContent).toContain("Summarize");
    expect(container.textContent).toContain("Translate");
  });

  it('MessageSetAgentSkills renders "none" when no skill is checked', () => {
    primitivesMock = {
      ...primitivesMock,
      availableSkills: [{ id: "sk-1", name: "Summarize" }],
    };

    const { container } = renderRow(
      [
        builderToolPart({
          input: { skills: [] },
          output: { success: true },
          toolCallId: "call-skills-none",
          toolName: SET_AGENT_SKILLS_TOOL_NAME,
        }),
      ],
      { skills: {} } as Partial<AgentBuilderEditFormValues>,
    );

    expect(container.textContent).toContain("Enabling skills: none");
  });

  it("renders MessageSetAgentModel for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { model: { name: "gpt-4o", provider: "openai" } },
          output: { success: true },
          toolCallId: "call-model",
          toolName: SET_AGENT_MODEL_TOOL_NAME,
        }),
      ],
      { model: { name: "gpt-4o", provider: "openai" } },
    );
    expect(container.textContent).toContain("Setting agent model to");
    expect(container.textContent).toContain("openai/gpt-4o");
  });

  it("renders MessageSetAgentModel for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { model: { name: "gpt-4o", provider: "openai" } },
          output: { success: true },
          toolCallId: "call-model-r",
          toolName: SET_AGENT_MODEL_TOOL_NAME,
        }),
      ],
      { model: { name: "gpt-4o", provider: "openai" } },
    );
    expect(container.textContent).toContain("Setting agent model to");
    expect(container.textContent).toContain("openai/gpt-4o");
  });

  it("renders MessageSetAgentBrowserEnabled (enabled) for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { browserEnabled: true },
          output: { success: true },
          toolCallId: "call-browser",
          toolName: SET_AGENT_BROWSER_ENABLED_TOOL_NAME,
        }),
      ],
      { browserEnabled: true },
    );
    expect(container.textContent).toContain("Browser access");
    expect(container.textContent).toContain("enabled");
  });

  it("renders MessageSetAgentBrowserEnabled (disabled) for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { browserEnabled: false },
          output: { success: true },
          toolCallId: "call-browser-r",
          toolName: SET_AGENT_BROWSER_ENABLED_TOOL_NAME,
        }),
      ],
      { browserEnabled: false },
    );
    expect(container.textContent).toContain("Browser access");
    expect(container.textContent).toContain("disabled");
  });

  it("renders MessageSetAgentWorkspaceId for streaming dynamic-tool", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { workspaceId: "ws-123" },
          output: { success: true },
          toolCallId: "call-ws",
          toolName: SET_AGENT_WORKSPACE_ID_TOOL_NAME,
        }),
      ],
      { workspaceId: "ws-123" },
    );
    expect(container.textContent).toContain("ws-123");
  });

  it("renders MessageSetAgentWorkspaceId for persisted tool part", () => {
    const { container } = renderRow(
      [
        builderToolPart({
          input: { workspaceId: "ws-123" },
          output: { success: true },
          toolCallId: "call-ws-r",
          toolName: SET_AGENT_WORKSPACE_ID_TOOL_NAME,
        }),
      ],
      { workspaceId: "ws-123" },
    );
    expect(container.textContent).toContain("ws-123");
  });
});
