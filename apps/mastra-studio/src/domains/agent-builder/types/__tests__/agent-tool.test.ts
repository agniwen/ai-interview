import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentTools, splitAgentTools } from "../agent-tool";

describe("buildAgentTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges tools and agents into a single AgentTool array", () => {
    const result = buildAgentTools({
      agents: { "agent-x": { description: "Useful agent", name: "Agent X" } },
      tools: { "tool-a": { description: "Tool A" } },
    });

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === "tool-a")).toMatchObject({
      description: "Tool A",
      id: "tool-a",
      isChecked: false,
      name: "tool-a",
      type: "tool",
    });
    expect(result.find((r) => r.id === "agent-x")).toMatchObject({
      description: "Useful agent",
      id: "agent-x",
      isChecked: false,
      name: "Agent X",
      type: "agent",
    });
  });

  it('merges workflows into the AgentTool array with type "workflow"', () => {
    const result = buildAgentTools({
      agents: {},
      tools: {},
      workflows: { "wf-1": { description: "Does workflow things", name: "Workflow One" } },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      description: "Does workflow things",
      id: "wf-1",
      isChecked: false,
      name: "Workflow One",
      type: "workflow",
    });
  });

  it("derives isChecked from the selected maps", () => {
    const result = buildAgentTools({
      agents: { "agent-x": { name: "Agent X" } },
      selected: {
        agents: { "agent-x": true },
        tools: { "tool-a": true },
        workflows: { "wf-1": true },
      },
      tools: { "tool-a": {} },
      workflows: { "wf-1": { name: "Workflow" } },
    });

    expect(result.find((r) => r.id === "tool-a")?.isChecked).toBe(true);
    expect(result.find((r) => r.id === "agent-x")?.isChecked).toBe(true);
    expect(result.find((r) => r.id === "wf-1")?.isChecked).toBe(true);
  });

  it("treats falsy/missing entries in selected maps as unchecked", () => {
    const result = buildAgentTools({
      agents: { "agent-x": { name: "Agent X" } },
      selected: {
        agents: {},
        tools: { "tool-a": false },
        workflows: { "wf-1": false },
      },
      tools: { "tool-a": {} },
      workflows: { "wf-1": { name: "Workflow" } },
    });

    expect(result.find((r) => r.id === "tool-a")?.isChecked).toBe(false);
    expect(result.find((r) => r.id === "agent-x")?.isChecked).toBe(false);
    expect(result.find((r) => r.id === "wf-1")?.isChecked).toBe(false);
  });

  it("warns and lets the agent win when an id collides between tool and agent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = buildAgentTools({
      agents: { collide: { description: "agent description", name: "Collide Agent" } },
      tools: { collide: { description: "tool description" } },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      description: "agent description",
      id: "collide",
      name: "Collide Agent",
      type: "agent",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("lets the agent win and warns when an id collides between agent and workflow", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = buildAgentTools({
      agents: { collide: { description: "agent description", name: "Collide Agent" } },
      tools: {},
      workflows: { collide: { description: "workflow description", name: "Collide Workflow" } },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "collide",
      type: "agent",
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it("lets the workflow win over a tool with the same id and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = buildAgentTools({
      agents: {},
      tools: { collide: { description: "tool description" } },
      workflows: { collide: { description: "workflow description", name: "Collide Workflow" } },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "collide",
      name: "Collide Workflow",
      type: "workflow",
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("splitAgentTools", () => {
  it("routes checked items to tools, agents, or workflows based on type", () => {
    const result = splitAgentTools([
      { id: "tool-a", isChecked: true, name: "tool-a", type: "tool" },
      { id: "tool-b", isChecked: false, name: "tool-b", type: "tool" },
      { id: "agent-x", isChecked: true, name: "Agent X", type: "agent" },
      { id: "agent-y", isChecked: false, name: "Agent Y", type: "agent" },
      { id: "wf-1", isChecked: true, name: "Workflow", type: "workflow" },
      { id: "wf-2", isChecked: false, name: "Workflow 2", type: "workflow" },
    ]);

    expect(result).toEqual({
      agents: { "agent-x": true },
      tools: { "tool-a": true },
      workflows: { "wf-1": true },
    });
  });

  it("round-trips with buildAgentTools", () => {
    const items = buildAgentTools({
      agents: { "agent-x": { name: "Agent X" } },
      selected: {
        agents: { "agent-x": true },
        tools: { "tool-a": true },
        workflows: { "wf-1": true },
      },
      tools: { "tool-a": {} },
      workflows: { "wf-1": { name: "Workflow" } },
    });

    expect(splitAgentTools(items)).toEqual({
      agents: { "agent-x": true },
      tools: { "tool-a": true },
      workflows: { "wf-1": true },
    });
  });
});
