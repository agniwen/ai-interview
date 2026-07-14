import { describe, expect, it } from "vitest";
import { AgentBuilderEditFormSchema } from "../schemas";

describe("AgentBuilderEditFormSchema", () => {
  it("accepts name and instructions without tools", () => {
    const result = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
      name: "My agent",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tools as a record", () => {
    const result = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
      name: "My agent",
      tools: { "web-search": true },
    });
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const result = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
    });
    expect(result.success).toBe(false);
  });

  it("requires instructions", () => {
    const result = AgentBuilderEditFormSchema.safeParse({
      name: "My agent",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional description", () => {
    const withDescription = AgentBuilderEditFormSchema.safeParse({
      description: "Helps with research tasks",
      instructions: "Do things",
      name: "My agent",
    });
    expect(withDescription.success).toBe(true);

    const without = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
      name: "My agent",
    });
    expect(without.success).toBe(true);
  });

  it("accepts an optional workspaceId", () => {
    const withId = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
      name: "My agent",
      workspaceId: "workspace-123",
    });
    expect(withId.success).toBe(true);

    const without = AgentBuilderEditFormSchema.safeParse({
      instructions: "Do things",
      name: "My agent",
    });
    expect(without.success).toBe(true);
  });
});
