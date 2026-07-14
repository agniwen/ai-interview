import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { AgentBuilderEditFormValues } from "../../schemas";
import type { AgentTool } from "../../types/agent-tool";
import { useSaveAgent } from "../use-save-agent";
import { authDisabledCapabilities, authEnabledCapabilities } from "./fixtures/auth";
import type { AuthCapabilities } from "@/domains/auth/types";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:4111";

const renderSave = ({
  agentId,
  availableAgentTools,
  defaultValues,
  capabilities = authEnabledCapabilities,
}: {
  agentId: string;
  availableAgentTools: AgentTool[];
  defaultValues: AgentBuilderEditFormValues;
  capabilities?: AuthCapabilities;
}) => {
  const captured: { body: Record<string, unknown> | null; capabilitiesLoaded: boolean } = {
    body: null,
    capabilitiesLoaded: false,
  };

  server.use(
    http.get(`${BASE_URL}/api/auth/capabilities`, () => {
      captured.capabilitiesLoaded = true;
      return HttpResponse.json(capabilities);
    }),
    http.patch(`${BASE_URL}/api/stored/agents/${agentId}`, async ({ request }) => {
      captured.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: agentId });
    }),
  );

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<AgentBuilderEditFormValues>({ defaultValues });
    return (
      <MastraReactProvider baseUrl={BASE_URL}>
        <QueryClientProvider client={queryClient}>
          <FormProvider {...methods}>{children}</FormProvider>
        </QueryClientProvider>
      </MastraReactProvider>
    );
  };

  const { result } = renderHook(() => useSaveAgent({ agentId, availableAgentTools }), {
    wrapper: Wrapper,
  });

  return { captured, hook: result };
};

describe("useSaveAgent", () => {
  describe("when updating an agent with selected tools and agents", () => {
    it("persists the selected tools as a record", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [
          { id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
          { id: "agent-x", isChecked: true, name: "Agent X", type: "agent" },
        ],
        defaultValues: {
          agents: { "agent-x": true },
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": true },
        },
      });

      await act(async () => {
        await hook.current.save({
          agents: { "agent-x": true },
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": true },
        });
      });

      expect(captured.body?.tools).toEqual({ "tool-a": {} });
    });

    it("persists the selected agents as a record", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [
          { id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
          { id: "agent-x", isChecked: true, name: "Agent X", type: "agent" },
        ],
        defaultValues: {
          agents: { "agent-x": true },
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": true },
        },
      });

      await act(async () => {
        await hook.current.save({
          agents: { "agent-x": true },
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": true },
        });
      });

      expect(captured.body?.agents).toEqual({ "agent-x": {} });
    });
  });

  describe("when updating an agent with a selected workflow", () => {
    it("persists the workflow as a record", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [
          { id: "wf-1", isChecked: true, name: "Workflow One", type: "workflow" },
        ],
        defaultValues: {
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: { "wf-1": true },
        },
      });

      await act(async () => {
        await hook.current.save({
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: { "wf-1": true },
        });
      });

      expect(captured.body?.workflows).toEqual({ "wf-1": {} });
    });
  });

  describe("when updating an agent with a selected model", () => {
    it("persists the selected model", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [],
        defaultValues: {
          agents: {},
          description: "",
          instructions: "inst",
          model: { name: "gpt-4o", provider: "openai" },
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        },
      });

      await act(async () => {
        await hook.current.save({
          agents: {},
          description: "",
          instructions: "inst",
          model: { name: "gpt-4o", provider: "openai" },
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        });
      });

      expect(captured.body?.model).toEqual({ name: "gpt-4o", provider: "openai" });
    });
  });

  describe("when a previously-selected tool is deselected", () => {
    it("persists an empty tools record", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [
          {
            description: "Tool A desc",
            id: "tool-a",
            isChecked: false,
            name: "tool-a",
            type: "tool",
          },
        ],
        defaultValues: {
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": false },
          workflows: {},
        },
      });

      await act(async () => {
        await hook.current.save({
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: { "tool-a": false },
          workflows: {},
        });
      });

      expect(captured.body?.tools).toEqual({});
    });
  });

  describe("when auth is enabled and the form omits an explicit visibility", () => {
    it("persists the default private visibility from auth capabilities", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [],
        capabilities: authEnabledCapabilities,
        defaultValues: {
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        },
      });

      await waitFor(() => expect(captured.capabilitiesLoaded).toBe(true));

      await act(async () => {
        await hook.current.save({
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        });
      });

      expect(captured.body?.visibility).toBe("private");
    });
  });

  describe("when auth is disabled and the form omits an explicit visibility", () => {
    it("persists the default public visibility from auth capabilities", async () => {
      const { hook, captured } = renderSave({
        agentId: "existing-id",
        availableAgentTools: [],
        capabilities: authDisabledCapabilities,
        defaultValues: {
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        },
      });

      await waitFor(() => expect(captured.capabilitiesLoaded).toBe(true));

      await act(async () => {
        await hook.current.save({
          agents: {},
          description: "",
          instructions: "inst",
          name: "Existing",
          skills: {},
          tools: {},
          workflows: {},
        });
      });

      expect(captured.body?.visibility).toBe("public");
    });
  });
});
