import { describe, expect, it } from "vitest";
import { buildAvailableToolRecords } from "../build-available-tool-records";

describe("buildAvailableToolRecords", () => {
  it("extracts tool descriptions into the tools record", () => {
    const result = buildAvailableToolRecords(
      {
        "tool-a": { description: "Tool A description" },
        "tool-b": { description: undefined },
      },
      {},
    );

    expect(result.tools).toEqual({
      "tool-a": { description: "Tool A description" },
      "tool-b": { description: undefined },
    });
  });

  it("builds agents records and falls back to id when name is missing", () => {
    const result = buildAvailableToolRecords(
      {},
      {
        "agent-x": { description: "desc", name: "Agent X" },
        "agent-y": {},
      },
    );

    expect(result.agents).toEqual({
      "agent-x": { description: "desc", id: "agent-x", name: "Agent X" },
      "agent-y": { description: undefined, id: "agent-y", name: "agent-y" },
    });
  });

  it("excludes the agent matching excludeAgentId from the agents record", () => {
    const result = buildAvailableToolRecords(
      {},
      {
        "agent-other": { name: "Other" },
        "agent-self": { name: "Self" },
      },
      {},
      "agent-self",
    );

    expect(result.agents).toEqual({
      "agent-other": { description: undefined, id: "agent-other", name: "Other" },
    });
  });

  it("builds workflows record and falls back to id when name is missing", () => {
    const result = buildAvailableToolRecords(
      {},
      {},
      {
        "wf-1": { description: "workflow desc", name: "Workflow One" },
        "wf-2": {},
      },
    );

    expect(result.workflows).toEqual({
      "wf-1": { description: "workflow desc", id: "wf-1", name: "Workflow One" },
      "wf-2": { description: undefined, id: "wf-2", name: "wf-2" },
    });
  });

  it("returns tools, agents, and workflows when all three are populated", () => {
    const result = buildAvailableToolRecords(
      { "tool-a": { description: "Tool A" } },
      { "agent-x": { name: "Agent X" } },
      { "wf-1": { name: "Workflow One" } },
    );

    expect(result.tools).toEqual({ "tool-a": { description: "Tool A" } });
    expect(result.agents).toEqual({
      "agent-x": { description: undefined, id: "agent-x", name: "Agent X" },
    });
    expect(result.workflows).toEqual({
      "wf-1": { description: undefined, id: "wf-1", name: "Workflow One" },
    });
  });

  it("defaults workflows to an empty record when omitted", () => {
    const result = buildAvailableToolRecords({}, {});

    expect(result.workflows).toEqual({});
  });
});
