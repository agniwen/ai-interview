import type { StoredSkillResponse } from "@mastra/client-js";
import { renderHook } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { z } from "zod/v4";

import type { AgentBuilderEditFormValues } from "../../schemas";
import type { AgentTool } from "../../types/agent-tool";
import { useAgentBuilderTool } from "../use-agent-builder-tool";
import type { AvailableWorkspace } from "../use-agent-builder-tool";
import { SET_AGENT_BROWSER_ENABLED_TOOL_NAME } from "../use-set-agent-browser-enabled-tool";
import { SET_AGENT_DESCRIPTION_TOOL_NAME } from "../use-set-agent-description-tool";
import { SET_AGENT_INSTRUCTIONS_TOOL_NAME } from "../use-set-agent-instructions-tool";
import { SET_AGENT_MODEL_TOOL_NAME } from "../use-set-agent-model-tool";
import { SET_AGENT_NAME_TOOL_NAME } from "../use-set-agent-name-tool";
import { SET_AGENT_SKILLS_TOOL_NAME } from "../use-set-agent-skills-tool";
import { SET_AGENT_TOOLS_TOOL_NAME } from "../use-set-agent-tools-tool";
import { SET_AGENT_WORKSPACE_ID_TOOL_NAME } from "../use-set-agent-workspace-id-tool";
import type { ModelInfo } from "@/domains/llm";

const allOnFeatures = {
  agents: true,
  avatarUpload: false,
  browser: true,
  favorites: false,
  memory: false,
  model: true,
  skills: true,
  tools: true,
  workflows: false,
};

const allOffFeatures = {
  agents: false,
  avatarUpload: false,
  browser: false,
  favorites: false,
  memory: false,
  model: false,
  skills: false,
  tools: false,
  workflows: false,
};

const buildSkill = (id: string): StoredSkillResponse =>
  ({
    createdAt: "2026-01-01T00:00:00Z",
    id,
    instructions: "inst",
    name: id,
    status: "published",
    updatedAt: "2026-01-01T00:00:00Z",
  }) as StoredSkillResponse;

const toAgentTools = (
  tools: { id: string; description?: string; type?: AgentTool["type"] }[],
): AgentTool[] =>
  tools.map((t) => ({
    description: t.description,
    id: t.id,
    isChecked: false,
    name: t.id,
    type: t.type ?? "tool",
  }));

interface RenderArgs {
  features: typeof allOnFeatures;
  availableAgentTools?: AgentTool[];
  availableWorkspaces?: AvailableWorkspace[];
  availableSkills?: StoredSkillResponse[];
  availableModels?: ModelInfo[];
}

const renderTools = (args: RenderArgs) => {
  const formRef: { current: UseFormReturn<AgentBuilderEditFormValues> | null } = { current: null };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<AgentBuilderEditFormValues>({
      defaultValues: { description: "", instructions: "", name: "", tools: {} },
    });
    formRef.current = methods;
    return <FormProvider {...methods}>{children}</FormProvider>;
  };

  const { result } = renderHook(
    () =>
      useAgentBuilderTool({
        availableAgentTools: args.availableAgentTools ?? [],
        availableModels: args.availableModels,
        availableSkills: args.availableSkills,
        availableWorkspaces: args.availableWorkspaces,
        features: args.features,
      }),
    { wrapper: Wrapper },
  );

  return { form: () => formRef.current!, record: result.current };
};

type ToolRecord = ReturnType<typeof useAgentBuilderTool>;

const toolOf = (record: ToolRecord, name: string) => {
  const tool = record[name];
  expect(tool).toBeDefined();
  return tool;
};

const toolSchema = (record: ToolRecord, name: string) => {
  const schema = toolOf(record, name).inputSchema;
  expect(schema).toBeDefined();
  return schema as z.ZodType;
};

const toolShape = (record: ToolRecord, name: string) =>
  (toolSchema(record, name) as z.ZodObject<z.ZodRawShape>).shape;

describe("useAgentBuilderTool", () => {
  describe("when every feature is on and all lists are populated", () => {
    it("returns all eight atomic tools", () => {
      const { record } = renderTools({
        availableAgentTools: toAgentTools([{ id: "tool-a" }]),
        availableModels: [{ model: "gpt-4o", provider: "openai", providerName: "OpenAI" }],
        availableSkills: [buildSkill("skill-a")],
        features: allOnFeatures,
      });

      expect(Object.keys(record).toSorted()).toEqual(
        [
          SET_AGENT_NAME_TOOL_NAME,
          SET_AGENT_DESCRIPTION_TOOL_NAME,
          SET_AGENT_INSTRUCTIONS_TOOL_NAME,
          SET_AGENT_WORKSPACE_ID_TOOL_NAME,
          SET_AGENT_TOOLS_TOOL_NAME,
          SET_AGENT_SKILLS_TOOL_NAME,
          SET_AGENT_MODEL_TOOL_NAME,
          SET_AGENT_BROWSER_ENABLED_TOOL_NAME,
        ].toSorted(),
      );
    });

    it("ids each tool with its own tool name", () => {
      const { record } = renderTools({
        availableAgentTools: toAgentTools([{ id: "tool-a" }]),
        availableModels: [{ model: "gpt-4o", provider: "openai", providerName: "OpenAI" }],
        availableSkills: [buildSkill("skill-a")],
        features: allOnFeatures,
      });

      expect(record[SET_AGENT_NAME_TOOL_NAME].id).toBe(SET_AGENT_NAME_TOOL_NAME);
      expect(record[SET_AGENT_TOOLS_TOOL_NAME].id).toBe(SET_AGENT_TOOLS_TOOL_NAME);
      expect(record[SET_AGENT_MODEL_TOOL_NAME].id).toBe(SET_AGENT_MODEL_TOOL_NAME);
    });
  });

  describe("when every feature is off", () => {
    it("returns only the always-on name/description/instructions/workspace tools", () => {
      const { record } = renderTools({ features: allOffFeatures });

      expect(Object.keys(record).toSorted()).toEqual(
        [
          SET_AGENT_NAME_TOOL_NAME,
          SET_AGENT_DESCRIPTION_TOOL_NAME,
          SET_AGENT_INSTRUCTIONS_TOOL_NAME,
          SET_AGENT_WORKSPACE_ID_TOOL_NAME,
        ].toSorted(),
      );
    });
  });

  describe("when features.tools toggles", () => {
    it("omits the set-agent-tools tool when tools is false", () => {
      const { record } = renderTools({ features: { ...allOnFeatures, tools: false } });
      expect(record[SET_AGENT_TOOLS_TOOL_NAME]).toBeUndefined();
    });

    it("includes the set-agent-tools tool when tools is true", () => {
      const { record } = renderTools({ features: { ...allOnFeatures, tools: true } });
      expect(record[SET_AGENT_TOOLS_TOOL_NAME]).toBeDefined();
    });
  });

  describe("when features.skills is on", () => {
    it("omits the skills tool when no skills are available", () => {
      const { record } = renderTools({
        availableSkills: [],
        features: { ...allOnFeatures, skills: true },
      });
      expect(record[SET_AGENT_SKILLS_TOOL_NAME]).toBeUndefined();
    });

    it("includes the skills tool when skills are available", () => {
      const { record } = renderTools({
        availableSkills: [buildSkill("skill-a")],
        features: { ...allOnFeatures, skills: true },
      });
      expect(record[SET_AGENT_SKILLS_TOOL_NAME]).toBeDefined();
    });
  });

  describe("when features.model is on", () => {
    it("omits the model tool when no models are available", () => {
      const { record } = renderTools({
        availableModels: [],
        features: { ...allOnFeatures, model: true },
      });
      expect(record[SET_AGENT_MODEL_TOOL_NAME]).toBeUndefined();
    });

    it("includes the model tool when models are available", () => {
      const { record } = renderTools({
        availableModels: [{ model: "gpt-4o", provider: "openai", providerName: "OpenAI" }],
        features: { ...allOnFeatures, model: true },
      });
      expect(record[SET_AGENT_MODEL_TOOL_NAME]).toBeDefined();
    });
  });

  describe("when features.browser toggles", () => {
    it("omits the browserEnabled tool when browser is false", () => {
      const { record } = renderTools({ features: { ...allOnFeatures, browser: false } });
      expect(record[SET_AGENT_BROWSER_ENABLED_TOOL_NAME]).toBeUndefined();
    });

    it("includes the browserEnabled tool when browser is true", () => {
      const { record } = renderTools({ features: { ...allOffFeatures, browser: true } });
      expect(record[SET_AGENT_BROWSER_ENABLED_TOOL_NAME]).toBeDefined();
    });
  });

  describe("set-agent-name / set-agent-instructions tools", () => {
    it("write name and instructions to the form on execute", async () => {
      const { record, form } = renderTools({ features: allOffFeatures });

      await toolOf(record, SET_AGENT_NAME_TOOL_NAME).execute!(
        { name: "New name" } as never,
        {} as never,
      );
      await toolOf(record, SET_AGENT_INSTRUCTIONS_TOOL_NAME).execute!(
        { instructions: "New instructions" } as never,
        {} as never,
      );

      expect(form().getValues("name")).toBe("New name");
      expect(form().getValues("instructions")).toBe("New instructions");
    });
  });

  describe("set-agent-tools tool", () => {
    it("writes selected tools to the form on execute", async () => {
      const { record, form } = renderTools({
        availableAgentTools: toAgentTools([{ id: "web-search" }]),
        features: { ...allOffFeatures, tools: true },
      });

      await toolOf(record, SET_AGENT_TOOLS_TOOL_NAME).execute!(
        { tools: [{ id: "web-search", name: "Web Search" }] } as never,
        {} as never,
      );

      expect(form().getValues("tools")).toEqual({ "web-search": true });
    });

    it("drops agent and workflow ids when those features are gated off", async () => {
      const { record, form } = renderTools({
        availableAgentTools: toAgentTools([{ id: "web-search", type: "tool" }]),
        features: { ...allOffFeatures, tools: true },
      });

      await toolOf(record, SET_AGENT_TOOLS_TOOL_NAME).execute!(
        {
          tools: [
            { id: "web-search", name: "Web Search" },
            { id: "some-agent", name: "Some Agent" },
            { id: "some-workflow", name: "Some Workflow" },
          ],
        } as never,
        {} as never,
      );

      expect(form().getValues("tools")).toEqual({ "web-search": true });
      expect(form().getValues("agents")).toEqual({});
      expect(form().getValues("workflows")).toEqual({});
    });

    it("lists available tool ids and descriptions in the tool description", () => {
      const { record } = renderTools({
        availableAgentTools: toAgentTools([
          { description: "Search the web", id: "web-search" },
          { description: "Fetch a URL", id: "http-fetch" },
        ]),
        features: { ...allOffFeatures, tools: true },
      });
      const tool = toolOf(record, SET_AGENT_TOOLS_TOOL_NAME);

      expect(tool.description).toContain("web-search");
      expect(tool.description).toContain("Search the web");
      expect(tool.description).toContain("http-fetch");
      expect(tool.description).toContain("Fetch a URL");
    });

    it("requires both id and name for each entry", () => {
      const { record } = renderTools({
        availableAgentTools: toAgentTools([{ description: "Search the web", id: "web-search" }]),
        features: { ...allOffFeatures, tools: true },
      });
      const schema = toolSchema(record, SET_AGENT_TOOLS_TOOL_NAME);

      expect(schema.safeParse({ tools: [{ id: "web-search", name: "Web Search" }] }).success).toBe(
        true,
      );
      expect(schema.safeParse({ tools: [{ id: "web-search" }] }).success).toBe(false);
      expect(schema.safeParse({ tools: [{ id: "web-search", name: "" }] }).success).toBe(false);
      expect(schema.safeParse({ tools: ["web-search"] }).success).toBe(false);
    });

    it("constrains the id field to the provided ids", () => {
      const { record } = renderTools({
        availableAgentTools: toAgentTools([{ id: "web-search" }]),
        features: { ...allOffFeatures, tools: true },
      });
      const schema = toolSchema(record, SET_AGENT_TOOLS_TOOL_NAME);

      expect(schema.safeParse({ tools: [{ id: "web-search", name: "Web Search" }] }).success).toBe(
        true,
      );
      expect(schema.safeParse({ tools: [{ id: "unknown-tool", name: "Unknown" }] }).success).toBe(
        false,
      );
    });
  });

  describe("set-agent-workspace-id tool", () => {
    it("exposes a workspaceId field in the schema", () => {
      const { record } = renderTools({ features: allOffFeatures });
      expect(toolShape(record, SET_AGENT_WORKSPACE_ID_TOOL_NAME).workspaceId).toBeDefined();
      expect(
        toolSchema(record, SET_AGENT_WORKSPACE_ID_TOOL_NAME).safeParse({ workspaceId: "any-id" })
          .success,
      ).toBe(true);
    });

    it("lists available workspaces in the description", () => {
      const { record } = renderTools({
        availableWorkspaces: [
          { id: "ws-1", name: "Primary" },
          { id: "ws-2", name: "Secondary" },
        ],
        features: allOffFeatures,
      });
      const tool = record[SET_AGENT_WORKSPACE_ID_TOOL_NAME];

      expect(tool.description).toContain("ws-1");
      expect(tool.description).toContain("Primary");
      expect(tool.description).toContain("ws-2");
      expect(tool.description).toContain("Secondary");
    });

    it("constrains workspaceId to the provided ids when workspaces are available", () => {
      const { record } = renderTools({
        availableWorkspaces: [{ id: "ws-1", name: "Primary" }],
        features: allOffFeatures,
      });
      const schema = toolSchema(record, SET_AGENT_WORKSPACE_ID_TOOL_NAME);

      expect(schema.safeParse({ workspaceId: "ws-1" }).success).toBe(true);
      expect(schema.safeParse({ workspaceId: "unknown-workspace" }).success).toBe(false);
    });

    it("writes workspaceId to the form when provided", async () => {
      const { record, form } = renderTools({
        availableWorkspaces: [{ id: "ws-1", name: "Primary" }],
        features: allOffFeatures,
      });

      await record[SET_AGENT_WORKSPACE_ID_TOOL_NAME].execute!(
        { workspaceId: "ws-1" } as never,
        {} as never,
      );

      expect(form().getValues("workspaceId")).toBe("ws-1");
    });

    it("does not set workspaceId when omitted", async () => {
      const { record, form } = renderTools({
        availableWorkspaces: [{ id: "ws-1", name: "Primary" }],
        features: allOffFeatures,
      });

      await record[SET_AGENT_WORKSPACE_ID_TOOL_NAME].execute!({} as never, {} as never);

      expect(form().getValues("workspaceId")).toBeUndefined();
    });
  });

  describe("set-agent-model tool", () => {
    it("lists only the allowed models in the description", () => {
      const { record } = renderTools({
        availableModels: [{ model: "gpt-4o", provider: "openai", providerName: "OpenAI" }],
        features: { ...allOffFeatures, model: true },
      });
      const tool = record[SET_AGENT_MODEL_TOOL_NAME];

      expect(tool.description).toContain("Available models");
      expect(tool.description).toContain("provider: openai (OpenAI), name: gpt-4o");
      expect(tool.description).not.toContain("anthropic");
    });

    it("accepts only allowed provider/name pairs in the schema", () => {
      const { record } = renderTools({
        availableModels: [{ model: "gpt-4o", provider: "openai", providerName: "OpenAI" }],
        features: { ...allOffFeatures, model: true },
      });
      expect(toolShape(record, SET_AGENT_MODEL_TOOL_NAME).model).toBeDefined();
      const schema = toolSchema(record, SET_AGENT_MODEL_TOOL_NAME);
      expect(schema.safeParse({ model: { name: "gpt-4o", provider: "openai" } }).success).toBe(
        true,
      );
      expect(
        schema.safeParse({ model: { name: "claude-opus-4-7", provider: "anthropic" } }).success,
      ).toBe(false);
    });

    it("respects a combined provider-wildcard + specific-model allowlist in the description", () => {
      const { record } = renderTools({
        availableModels: [
          { model: "gpt-4o", provider: "openai", providerName: "OpenAI" },
          { model: "gpt-4o-mini", provider: "openai", providerName: "OpenAI" },
          { model: "claude-opus-4-7", provider: "anthropic", providerName: "Anthropic" },
        ],
        features: { ...allOffFeatures, model: true },
      });
      const tool = record[SET_AGENT_MODEL_TOOL_NAME];

      expect(tool.description).toContain("provider: openai (OpenAI), name: gpt-4o");
      expect(tool.description).toContain("provider: openai (OpenAI), name: gpt-4o-mini");
      expect(tool.description).toContain("provider: anthropic (Anthropic), name: claude-opus-4-7");
      expect(tool.description).not.toContain("claude-haiku-4-5");
      expect(tool.description).not.toContain("mistral");
    });

    it("respects a combined provider-wildcard + specific-model allowlist in the schema", () => {
      const { record } = renderTools({
        availableModels: [
          { model: "gpt-4o", provider: "openai", providerName: "OpenAI" },
          { model: "gpt-4o-mini", provider: "openai", providerName: "OpenAI" },
          { model: "claude-opus-4-7", provider: "anthropic", providerName: "Anthropic" },
        ],
        features: { ...allOffFeatures, model: true },
      });
      const schema = toolSchema(record, SET_AGENT_MODEL_TOOL_NAME);

      expect(schema.safeParse({ model: { name: "gpt-4o", provider: "openai" } }).success).toBe(
        true,
      );
      expect(schema.safeParse({ model: { name: "gpt-4o-mini", provider: "openai" } }).success).toBe(
        true,
      );
      expect(
        schema.safeParse({ model: { name: "claude-opus-4-7", provider: "anthropic" } }).success,
      ).toBe(true);
      expect(
        schema.safeParse({ model: { name: "claude-haiku-4-5", provider: "anthropic" } }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ model: { name: "mistral-large", provider: "mistral" } }).success,
      ).toBe(false);
    });
  });
});
