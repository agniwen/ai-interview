import type { StoredSkillResponse } from "@mastra/client-js";
import { describe, expect, it } from "vitest";
import type { AgentTool } from "../../types/agent-tool";
import { formValuesToSaveParams } from "../form-values-to-save-params";

const buildSkill = (id: string, description?: string): StoredSkillResponse => ({
  createdAt: "2026-01-01T00:00:00Z",
  description,
  id,
  instructions: "inst",
  name: id,
  status: "published",
  updatedAt: "2026-01-01T00:00:00Z",
});

const baseValues = {
  agents: {},
  description: "",
  instructions: "Do things",
  name: "My agent",
  tools: {},
  workflows: {},
};

describe("formValuesToSaveParams", () => {
  it("builds a tool entry with description when the available tool has one", () => {
    const availableAgentTools: AgentTool[] = [
      { description: "Tool A desc", id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, tools: { "tool-a": true } },
      availableAgentTools,
    );

    expect(result.tools).toEqual({ "tool-a": { description: "Tool A desc" } });
  });

  it("builds a tool entry with an empty record when the available tool has no description", () => {
    const availableAgentTools: AgentTool[] = [
      { id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, tools: { "tool-a": true } },
      availableAgentTools,
    );

    expect(result.tools).toEqual({ "tool-a": {} });
  });

  it("omits disabled tools from the resulting record", () => {
    const availableAgentTools: AgentTool[] = [
      { id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
      { id: "tool-b", isChecked: false, name: "tool-b", type: "tool" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, tools: { "tool-a": true, "tool-b": false } },
      availableAgentTools,
    );

    expect(result.tools).toEqual({ "tool-a": {} });
  });

  it("routes agent ids the same way and uses agent descriptions", () => {
    const availableAgentTools: AgentTool[] = [
      {
        description: "Agent X desc",
        id: "agent-x",
        isChecked: true,
        name: "Agent X",
        type: "agent",
      },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, agents: { "agent-x": true } },
      availableAgentTools,
    );

    expect(result.agents).toEqual({ "agent-x": { description: "Agent X desc" } });
  });

  it("returns empty records for tools/agents/workflows when their resolved record is empty", () => {
    const result = formValuesToSaveParams(baseValues, []);

    expect(result.tools).toEqual({});
    expect(result.agents).toEqual({});
    expect(result.workflows).toEqual({});
  });

  it("returns an empty tools record when a previously-selected tool is toggled off", () => {
    const availableAgentTools: AgentTool[] = [
      { description: "Tool A desc", id: "tool-a", isChecked: false, name: "Tool A", type: "tool" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, tools: { "tool-a": false } },
      availableAgentTools,
    );

    expect(result.tools).toEqual({});
  });

  it("builds a workflow entry with description when the available workflow has one", () => {
    const availableAgentTools: AgentTool[] = [
      {
        description: "Workflow desc",
        id: "wf-1",
        isChecked: true,
        name: "Workflow One",
        type: "workflow",
      },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, workflows: { "wf-1": true } },
      availableAgentTools,
    );

    expect(result.workflows).toEqual({ "wf-1": { description: "Workflow desc" } });
  });

  it("builds a workflow entry with an empty record when the available workflow has no description", () => {
    const availableAgentTools: AgentTool[] = [
      { id: "wf-1", isChecked: true, name: "Workflow One", type: "workflow" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, workflows: { "wf-1": true } },
      availableAgentTools,
    );

    expect(result.workflows).toEqual({ "wf-1": {} });
  });

  it("omits disabled workflows from the resulting record", () => {
    const availableAgentTools: AgentTool[] = [
      { id: "wf-1", isChecked: true, name: "Workflow One", type: "workflow" },
      { id: "wf-2", isChecked: false, name: "Workflow Two", type: "workflow" },
    ];

    const result = formValuesToSaveParams(
      { ...baseValues, workflows: { "wf-1": true, "wf-2": false } },
      availableAgentTools,
    );

    expect(result.workflows).toEqual({ "wf-1": {} });
  });

  it("returns undefined workspace when workspaceId is missing or empty", () => {
    expect(
      formValuesToSaveParams({ ...baseValues, workspaceId: undefined }, []).workspace,
    ).toBeUndefined();
    expect(
      formValuesToSaveParams({ ...baseValues, workspaceId: "" }, []).workspace,
    ).toBeUndefined();
  });

  it('returns an "id" workspace ref when workspaceId is set', () => {
    const result = formValuesToSaveParams({ ...baseValues, workspaceId: "ws-1" }, []);

    expect(result.workspace).toEqual({ type: "id", workspaceId: "ws-1" });
  });

  it("returns undefined description when the input is empty or whitespace only", () => {
    expect(
      formValuesToSaveParams({ ...baseValues, description: "" }, []).description,
    ).toBeUndefined();
    expect(
      formValuesToSaveParams({ ...baseValues, description: "   " }, []).description,
    ).toBeUndefined();
  });

  it("trims and returns description when the input has content", () => {
    const result = formValuesToSaveParams({ ...baseValues, description: "  Hello  " }, []);

    expect(result.description).toBe("Hello");
  });

  it("builds a skill entry with description when the available skill has one", () => {
    const availableSkills = [buildSkill("skill-a", "Skill A desc")];

    const result = formValuesToSaveParams(
      { ...baseValues, skills: { "skill-a": true } },
      [],
      availableSkills,
    );

    expect(result.skills).toEqual({ "skill-a": { description: "Skill A desc" } });
  });

  it("builds a skill entry with an empty record when the available skill has no description", () => {
    const availableSkills = [buildSkill("skill-a")];

    const result = formValuesToSaveParams(
      { ...baseValues, skills: { "skill-a": true } },
      [],
      availableSkills,
    );

    expect(result.skills).toEqual({ "skill-a": {} });
  });

  it("returns an empty skills record when nothing is selected", () => {
    const result = formValuesToSaveParams(baseValues, [], [buildSkill("skill-a", "Skill A desc")]);

    expect(result.skills).toEqual({});
  });

  it("omits disabled skills from the resulting record", () => {
    const availableSkills = [buildSkill("skill-a"), buildSkill("skill-b")];

    const result = formValuesToSaveParams(
      { ...baseValues, skills: { "skill-a": true, "skill-b": false } },
      [],
      availableSkills,
    );

    expect(result.skills).toEqual({ "skill-a": {} });
  });

  it("returns metadata with avatarUrl when values.avatarUrl is set", () => {
    const result = formValuesToSaveParams(
      { ...baseValues, avatarUrl: "https://cdn.example/a.png" },
      [],
    );

    expect(result.metadata).toEqual({ avatarUrl: "https://cdn.example/a.png" });
  });

  it("returns undefined metadata when avatarUrl is missing", () => {
    const result = formValuesToSaveParams(baseValues, []);

    expect(result.metadata).toBeUndefined();
  });

  it("returns browser=true when browserEnabled is true", () => {
    const result = formValuesToSaveParams({ ...baseValues, browserEnabled: true }, []);

    expect(result.browser).toBe(true);
  });

  it("returns browser=false when browserEnabled is false", () => {
    const result = formValuesToSaveParams({ ...baseValues, browserEnabled: false }, []);

    expect(result.browser).toBe(false);
  });

  it("returns browser=false when browserEnabled is undefined", () => {
    const result = formValuesToSaveParams(baseValues, []);

    expect(result.browser).toBe(false);
  });

  it("passes visibility through unchanged for private, public, and undefined", () => {
    expect(formValuesToSaveParams({ ...baseValues, visibility: "private" }, []).visibility).toBe(
      "private",
    );
    expect(formValuesToSaveParams({ ...baseValues, visibility: "public" }, []).visibility).toBe(
      "public",
    );
    expect(formValuesToSaveParams(baseValues, []).visibility).toBeUndefined();
  });

  it("passes model through unchanged when set and undefined when unset", () => {
    const result = formValuesToSaveParams(
      { ...baseValues, model: { name: "gpt-4o", provider: "openai" } },
      [],
    );

    expect(result.model).toEqual({ name: "gpt-4o", provider: "openai" });
    expect(formValuesToSaveParams(baseValues, []).model).toBeUndefined();
  });

  it("passes name and instructions through unchanged", () => {
    const result = formValuesToSaveParams(
      { ...baseValues, instructions: "Do things", name: "My agent" },
      [],
    );

    expect(result.name).toBe("My agent");
    expect(result.instructions).toBe("Do things");
  });
});
