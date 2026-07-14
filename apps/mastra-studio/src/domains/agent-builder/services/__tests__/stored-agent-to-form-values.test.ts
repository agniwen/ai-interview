import { describe, expect, it } from "vitest";
import {
  extractStaticModel,
  isConditionalStoredModel,
  storedAgentToFormValues,
} from "../stored-agent-to-form-values";

describe("storedAgentToFormValues", () => {
  it("returns empty defaults when storedAgent is null or undefined", () => {
    const fromNull = storedAgentToFormValues(null);
    const fromUndefined = storedAgentToFormValues();

    const expected = {
      agents: {},
      avatarUrl: undefined,
      browserEnabled: false,
      description: "",
      instructions: "",
      model: undefined,
      name: "",
      skills: {},
      tools: {},
      visibility: undefined,
      workflows: {},
      workspaceId: undefined,
    };

    expect(fromNull).toEqual(expected);
    expect(fromUndefined).toEqual(expected);
  });

  it("maps every stored agent field into the form value shape", () => {
    const result = storedAgentToFormValues({
      agents: { "agent-x": {} },
      description: "Helps with research",
      id: "agent-1",
      instructions: "Be helpful",
      name: "Researcher",
      tools: { "tool-a": {}, "tool-b": {} },
      workflows: { "wf-1": {} },
      workspace: { type: "id", workspaceId: "ws-1" },
    } as never);

    expect(result).toEqual({
      agents: { "agent-x": true },
      avatarUrl: undefined,
      browserEnabled: false,
      description: "Helps with research",
      instructions: "Be helpful",
      model: undefined,
      name: "Researcher",
      skills: {},
      tools: { "tool-a": true, "tool-b": true },
      visibility: undefined,
      workflows: { "wf-1": true },
      workspaceId: "ws-1",
    });
  });

  it("hydrates skills from a flat record", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      name: "A",
      skills: { s1: { description: "desc" }, s2: {} },
    } as never);

    expect(result.skills).toEqual({ s1: true, s2: true });
  });

  it("merges skills across ConditionalField variants", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      name: "A",
      skills: [
        { value: { s1: { description: "one" } }, when: { type: "always" } },
        { value: { s2: {} }, when: { type: "always" } },
      ],
    } as never);

    expect(result.skills).toEqual({ s1: true, s2: true });
  });

  it("falls back to empty string when instructions is not a string", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      instructions: { type: "rule" },
      name: "A",
    } as never);

    expect(result.instructions).toBe("");
  });

  it("hydrates a static model into the form value", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      model: { name: "gpt-4o", provider: "openai" },
      name: "A",
    } as never);

    expect(result.model).toEqual({ name: "gpt-4o", provider: "openai" });
  });

  it("leaves model undefined for conditional stored models", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      model: [{ value: { name: "gpt-4o", provider: "openai" }, when: { type: "always" } }],
      name: "A",
    } as never);

    expect(result.model).toBeUndefined();
  });

  it("propagates metadata.avatarUrl into the form value", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      metadata: { avatarUrl: "https://cdn.example/a.png" },
      name: "A",
    } as never);

    expect(result.avatarUrl).toBe("https://cdn.example/a.png");
  });

  it("leaves avatarUrl undefined when metadata exists without the key", () => {
    const result = storedAgentToFormValues({
      id: "agent-1",
      metadata: { other: "value" },
      name: "A",
    } as never);

    expect(result.avatarUrl).toBeUndefined();
  });

  it("propagates visibility and browserEnabled=true when browser is non-null", () => {
    const result = storedAgentToFormValues({
      browser: { enabled: true },
      id: "agent-1",
      name: "A",
      visibility: "public",
    } as never);

    expect(result.visibility).toBe("public");
    expect(result.browserEnabled).toBe(true);
  });
});

describe("extractStaticModel", () => {
  it("returns undefined for undefined input", () => {
    expect(extractStaticModel()).toBeUndefined();
  });

  it("returns undefined for a conditional (array) input", () => {
    expect(
      extractStaticModel([
        { value: { name: "gpt-4o", provider: "openai" }, when: { type: "always" } },
      ] as never),
    ).toBeUndefined();
  });

  it("returns undefined when provider is missing or empty", () => {
    expect(extractStaticModel({ name: "gpt-4o" } as never)).toBeUndefined();
    expect(extractStaticModel({ name: "gpt-4o", provider: "" } as never)).toBeUndefined();
    expect(extractStaticModel({ name: "gpt-4o", provider: 42 } as never)).toBeUndefined();
  });

  it("returns undefined when name is missing or empty", () => {
    expect(extractStaticModel({ provider: "openai" } as never)).toBeUndefined();
    expect(extractStaticModel({ name: "", provider: "openai" } as never)).toBeUndefined();
    expect(extractStaticModel({ name: 42, provider: "openai" } as never)).toBeUndefined();
  });

  it("returns the static model when both provider and name are valid strings", () => {
    expect(extractStaticModel({ name: "gpt-4o", provider: "openai" } as never)).toEqual({
      name: "gpt-4o",
      provider: "openai",
    });
  });
});

describe("isConditionalStoredModel", () => {
  it("returns true for array input", () => {
    expect(isConditionalStoredModel([] as never)).toBe(true);
  });

  it("returns false for object input", () => {
    expect(isConditionalStoredModel({ name: "gpt-4o", provider: "openai" } as never)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isConditionalStoredModel()).toBe(false);
  });
});
