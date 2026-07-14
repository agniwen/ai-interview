import { describe, expect, it } from "vitest";
import { storedAgentToAgentConfig } from "../stored-agent-to-agent-config";

describe("storedAgentToAgentConfig", () => {
  it("uses the fallback id when storedAgent is null or undefined", () => {
    expect(storedAgentToAgentConfig(null, "fallback-id")).toEqual({
      authorId: undefined,
      avatarUrl: undefined,
      description: "",
      id: "fallback-id",
      name: "",
      systemPrompt: "",
      visibility: "private",
    });
    expect(storedAgentToAgentConfig(undefined, "fallback-id")).toEqual({
      authorId: undefined,
      avatarUrl: undefined,
      description: "",
      id: "fallback-id",
      name: "",
      systemPrompt: "",
      visibility: "private",
    });
  });

  it("uses storedAgent.id when present and copies over name/description/instructions", () => {
    const result = storedAgentToAgentConfig(
      {
        description: "Helps with research",
        id: "stored-id",
        instructions: "Be helpful",
        name: "Researcher",
      } as never,
      "fallback-id",
    );

    expect(result).toEqual({
      authorId: undefined,
      avatarUrl: undefined,
      description: "Helps with research",
      id: "stored-id",
      name: "Researcher",
      systemPrompt: "Be helpful",
      visibility: "private",
    });
  });

  it("falls back to empty string when instructions is not a string", () => {
    const result = storedAgentToAgentConfig(
      { id: "a", instructions: { type: "rule" }, name: "N" } as never,
      "fallback-id",
    );

    expect(result.systemPrompt).toBe("");
  });

  it("extracts avatarUrl from metadata when present", () => {
    const result = storedAgentToAgentConfig(
      { id: "a", metadata: { avatarUrl: "https://cdn.example/a.png" }, name: "N" } as never,
      "fallback-id",
    );

    expect(result.avatarUrl).toBe("https://cdn.example/a.png");
  });

  it("leaves avatarUrl undefined when metadata is present but lacks avatarUrl", () => {
    const result = storedAgentToAgentConfig(
      { id: "a", metadata: { other: "value" }, name: "N" } as never,
      "fallback-id",
    );

    expect(result.avatarUrl).toBeUndefined();
  });

  it("preserves visibility=public when set", () => {
    const result = storedAgentToAgentConfig(
      { id: "a", name: "N", visibility: "public" } as never,
      "fallback-id",
    );

    expect(result.visibility).toBe("public");
  });

  it("preserves authorId when set to a string", () => {
    const result = storedAgentToAgentConfig(
      { authorId: "user-1", id: "a", name: "N" } as never,
      "fallback-id",
    );

    expect(result.authorId).toBe("user-1");
  });

  it("preserves authorId when set to null", () => {
    const result = storedAgentToAgentConfig(
      { authorId: null, id: "a", name: "N" } as never,
      "fallback-id",
    );

    expect(result.authorId).toBeNull();
  });
});
