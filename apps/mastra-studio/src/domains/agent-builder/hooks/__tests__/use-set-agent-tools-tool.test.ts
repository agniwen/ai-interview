import { renderHook } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { AgentBuilderEditFormValues } from "../../schemas";
import type { AgentTool } from "../../types/agent-tool";
import { SET_AGENT_TOOLS_TOOL_NAME, useSetAgentToolsTool } from "../use-set-agent-tools-tool";

const availableAgentTools: AgentTool[] = [
  { id: "web-search", isChecked: false, name: "web-search", type: "tool" },
  { id: "agent-helper", isChecked: false, name: "Helper Agent", type: "agent" },
  { id: "wf-build", isChecked: false, name: "Build Workflow", type: "workflow" },
  {
    id: "composio:GMAIL_SEND_EMAIL",
    isChecked: false,
    name: "GMAIL_SEND_EMAIL",
    providerId: "composio",
    toolkit: "gmail",
    type: "integration",
  },
];

const renderTool = (defaultValues?: Partial<AgentBuilderEditFormValues>) => {
  const formRef: { current: ReturnType<typeof useForm<AgentBuilderEditFormValues>> | null } = {
    current: null,
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<AgentBuilderEditFormValues>({
      defaultValues: {
        agents: {},
        description: "",
        instructions: "",
        name: "",
        tools: {},
        workflows: {},
        ...defaultValues,
      },
    });
    formRef.current = methods;
    return React.createElement(FormProvider, methods, children);
  };

  const { result } = renderHook(() => useSetAgentToolsTool({ availableAgentTools }), {
    wrapper: Wrapper,
  });
  return { form: () => formRef.current!, tool: result.current };
};

describe("useSetAgentToolsTool", () => {
  it("exposes the canonical tool id", () => {
    const { tool } = renderTool();
    expect(tool.id).toBe(SET_AGENT_TOOLS_TOOL_NAME);
    expect(tool.id).toBe("set-agent-tools");
  });

  it("routes tools/agents/workflows into the correct form keys", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({
      tools: [
        { id: "web-search", name: "Web Search" },
        { id: "agent-helper", name: "Helper" },
        { id: "wf-build", name: "Build" },
      ],
    } as any);

    expect(form().getValues("tools")).toEqual({ "web-search": true });
    expect(form().getValues("agents")).toEqual({ "agent-helper": true });
    expect(form().getValues("workflows")).toEqual({ "wf-build": true });
  });

  it("clears all three maps when given an empty array", async () => {
    const { tool, form } = renderTool();
    form().setValue("tools", { "web-search": true });
    form().setValue("agents", { "agent-helper": true });
    form().setValue("workflows", { "wf-build": true });

    await tool.execute!({ tools: [] } as any);

    expect(form().getValues("tools")).toEqual({});
    expect(form().getValues("agents")).toEqual({});
    expect(form().getValues("workflows")).toEqual({});
  });

  it("ignores ids not present in availableAgentTools", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({
      tools: [
        { id: "web-search", name: "Web Search" },
        { id: "unknown", name: "Unknown" },
      ],
    } as any);

    expect(form().getValues("tools")).toEqual({ "web-search": true });
    expect(form().getValues("agents")).toEqual({});
    expect(form().getValues("workflows")).toEqual({});
  });

  it("does nothing when input is missing or not an array", async () => {
    const { tool, form } = renderTool();
    form().setValue("tools", { "web-search": true });
    await tool.execute!({} as any);
    expect(form().getValues("tools")).toEqual({ "web-search": true });
  });

  it("sets integration tools on the provider while preserving connections", async () => {
    const gmailConnections = [
      { connectionId: "conn-1", kind: "author" as const, toolkit: "gmail" },
    ];
    const { tool, form } = renderTool({
      toolProviders: { composio: { connections: { gmail: gmailConnections }, tools: {} } },
    });

    await tool.execute!({
      tools: [{ id: "composio:GMAIL_SEND_EMAIL", name: "Send Email" }],
    } as any);

    expect(form().getValues("toolProviders")).toEqual({
      composio: {
        connections: { gmail: gmailConnections },
        tools: { GMAIL_SEND_EMAIL: { toolkit: "gmail" } },
      },
    });
  });

  it("clears stale integration selections when the call omits them", async () => {
    const gmailConnections = [
      { connectionId: "conn-1", kind: "author" as const, toolkit: "gmail" },
    ];
    const { tool, form } = renderTool({
      toolProviders: {
        composio: {
          connections: { gmail: gmailConnections },
          tools: { GMAIL_FETCH_EMAILS: { toolkit: "gmail" } },
        },
      },
    });

    await tool.execute!({ tools: [{ id: "web-search", name: "Web Search" }] } as any);

    expect(form().getValues("tools")).toEqual({ "web-search": true });
    expect(form().getValues("toolProviders")).toEqual({
      composio: { connections: { gmail: gmailConnections }, tools: {} },
    });
  });
});
