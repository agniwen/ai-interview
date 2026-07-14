import type { BuilderSettingsResponse, ListToolProvidersResponse } from "@mastra/client-js";
import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentBuilderEditFormValues } from "../../schemas";
import { useAvailableAgentTools } from "../use-available-agent-tools";
import { currentUser } from "./fixtures/auth";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:4111";

const noProviders: ListToolProvidersResponse = { providers: [] };

/**
 * Builder settings whose `picker` field drives `useBuilderPickerVisibility`.
 * Omitting `picker` (or passing `null` per kind) leaves the picker
 * unrestricted; passing a `string[]` is an explicit allowlist.
 */
function builderSettings(picker?: BuilderSettingsResponse["picker"]): BuilderSettingsResponse {
  return { enabled: true, picker };
}

/**
 * Registers the network handlers the real hook path needs:
 * - `/api/editor/builder/settings` drives picker visibility.
 * - `/api/tool-providers` is empty, so the integration fan-out (provider
 *   toolkits/tools/connections) short-circuits and no integration rows append.
 * - `/api/auth/me` feeds `useAllConnections({ scopeToSelf: true })`.
 */
function seedHandlers(settings: BuilderSettingsResponse) {
  server.use(
    http.get(`${BASE_URL}/api/editor/builder/settings`, () => HttpResponse.json(settings)),
    http.get(`${BASE_URL}/api/tool-providers`, () => HttpResponse.json(noProviders)),
    http.get(`${BASE_URL}/api/auth/me`, () => HttpResponse.json(currentUser)),
  );
}

const baseFormValues: AgentBuilderEditFormValues = {
  agents: {},
  description: "",
  instructions: "",
  name: "",
  skills: {},
  toolProviders: {},
  tools: {},
  workflows: {},
};

function renderAvailableTools(args: Parameters<typeof useAvailableAgentTools>[0]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<AgentBuilderEditFormValues>({ defaultValues: baseFormValues });
    return (
      <MastraReactProvider baseUrl={BASE_URL}>
        <QueryClientProvider client={queryClient}>
          <FormProvider {...methods}>{children}</FormProvider>
        </QueryClientProvider>
      </MastraReactProvider>
    );
  };

  return renderHook(() => useAvailableAgentTools(args), { wrapper: Wrapper });
}

describe("useAvailableAgentTools", () => {
  beforeEach(() => {
    seedHandlers(builderSettings());
  });

  describe("when the picker is unrestricted", () => {
    it("builds a tool row from tools data", async () => {
      const { result } = renderAvailableTools({
        agentsData: { "agent-x": { name: "Agent X" } },
        selectedAgents: {},
        selectedTools: { "tool-a": true },
        toolsData: { "tool-a": { description: "Tool A" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(2));
      expect(result.current.find((t) => t.id === "tool-a")).toMatchObject({
        description: "Tool A",
        isChecked: true,
        type: "tool",
      });
    });

    it("builds an agent row from agents data", async () => {
      const { result } = renderAvailableTools({
        agentsData: { "agent-x": { name: "Agent X" } },
        selectedAgents: {},
        selectedTools: { "tool-a": true },
        toolsData: { "tool-a": { description: "Tool A" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(2));
      expect(result.current.find((t) => t.id === "agent-x")).toMatchObject({
        isChecked: false,
        name: "Agent X",
        type: "agent",
      });
    });

    it('builds a workflow row typed "workflow"', async () => {
      const { result } = renderAvailableTools({
        agentsData: {},
        selectedAgents: {},
        selectedTools: {},
        selectedWorkflows: { "wf-1": true },
        toolsData: {},
        workflowsData: { "wf-1": { description: "wf desc", name: "Workflow One" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0]).toMatchObject({
        description: "wf desc",
        id: "wf-1",
        isChecked: true,
        name: "Workflow One",
        type: "workflow",
      });
    });

    it("excludes the agent matching excludeAgentId", async () => {
      const { result } = renderAvailableTools({
        agentsData: { "agent-other": { name: "Other" }, "agent-self": { name: "Self" } },
        excludeAgentId: "agent-self",
        selectedAgents: {},
        selectedTools: {},
        toolsData: {},
      });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].id).toBe("agent-other");
    });

    it("returns an equal list when inputs are unchanged across renders", async () => {
      // Under the real React Query stack `useQueries` hands back a fresh array
      // each render, so the memoized output is value-stable rather than
      // reference-identical. Equal inputs must still yield an equal list.
      const toolsData = { "tool-a": { description: "Tool A" } };
      const agentsData = { "agent-x": { name: "Agent X" } };
      const selectedTools = { "tool-a": true };
      const selectedAgents = {};

      const { result, rerender } = renderAvailableTools({
        agentsData,
        selectedAgents,
        selectedTools,
        toolsData,
      });

      await waitFor(() => expect(result.current).toHaveLength(2));
      const first = result.current;
      rerender();

      expect(result.current).toStrictEqual(first);
    });
  });

  describe("when the picker restricts the tools allowlist", () => {
    beforeEach(() => {
      seedHandlers(
        builderSettings({ visibleAgents: null, visibleTools: ["tool-a"], visibleWorkflows: null }),
      );
    });

    it("keeps only allowlisted tools", async () => {
      const { result } = renderAvailableTools({
        agentsData: {},
        selectedAgents: {},
        selectedTools: {},
        toolsData: { "tool-a": { description: "A" }, "tool-b": { description: "B" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].id).toBe("tool-a");
    });
  });

  describe("when the picker restricts agents and workflows independently", () => {
    beforeEach(() => {
      seedHandlers(
        builderSettings({
          visibleAgents: ["agent-x"],
          visibleTools: null,
          visibleWorkflows: ["wf-1"],
        }),
      );
    });

    it("filters agents and workflows without affecting tools", async () => {
      const { result } = renderAvailableTools({
        agentsData: { "agent-x": { name: "X" }, "agent-y": { name: "Y" } },
        selectedAgents: {},
        selectedTools: {},
        selectedWorkflows: {},
        toolsData: { "tool-a": {} },
        workflowsData: { "wf-1": { name: "WF1" }, "wf-2": { name: "WF2" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(3));
      const ids = result.current.map((t) => t.id).toSorted();
      expect(ids).toEqual(["agent-x", "tool-a", "wf-1"]);
    });
  });

  describe("when the picker allowlist is empty", () => {
    beforeEach(() => {
      seedHandlers(
        builderSettings({ visibleAgents: null, visibleTools: [], visibleWorkflows: null }),
      );
    });

    it("returns no tools", async () => {
      const { result } = renderAvailableTools({
        agentsData: {},
        selectedAgents: {},
        selectedTools: {},
        toolsData: { "tool-a": {}, "tool-b": {} },
      });

      // Tools are gated to empty; the unrestricted-by-default agents/workflows
      // are also empty here, so the list settles at zero rows.
      await waitFor(() => expect(result.current).toHaveLength(0));
    });
  });

  describe("when the picker allowlist matches response keys (server normalizes IDs)", () => {
    beforeEach(() => {
      seedHandlers(
        builderSettings({
          visibleAgents: null,
          visibleTools: ["weatherKey", "fallback-key"],
          visibleWorkflows: null,
        }),
      );
    });

    it("matches the allowlist against the raw response key", async () => {
      const { result } = renderAvailableTools({
        agentsData: {},
        selectedAgents: {},
        selectedTools: {},
        toolsData: {
          "fallback-key": { description: "F" },
          otherKey: { description: "O", id: "other-id" },
          weatherKey: { description: "W", id: "weather-id" },
        },
      });

      await waitFor(() => expect(result.current).toHaveLength(2));
      const ids = result.current.map((t) => t.id).toSorted();
      expect(ids).toEqual(["fallback-key", "weatherKey"]);
    });

    it("ignores allowlist IDs not present in raw data", async () => {
      const { result } = renderAvailableTools({
        agentsData: {},
        selectedAgents: {},
        selectedTools: {},
        toolsData: { weatherKey: { id: "weather-id" } },
      });

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].id).toBe("weatherKey");
    });
  });
});
