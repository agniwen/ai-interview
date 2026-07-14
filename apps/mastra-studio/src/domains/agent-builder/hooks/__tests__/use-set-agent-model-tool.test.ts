import { renderHook } from "@testing-library/react";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { AgentBuilderEditFormValues } from "../../schemas";
import { SET_AGENT_MODEL_TOOL_NAME, useSetAgentModelTool } from "../use-set-agent-model-tool";
import type { ModelInfo } from "@/domains/llm";

const availableModels: ModelInfo[] = [
  { model: "gpt-4o", provider: "openai", providerName: "OpenAI" },
  { model: "claude-3-5-sonnet-latest", provider: "anthropic", providerName: "Anthropic" },
];

const renderTool = () => {
  const formRef: { current: ReturnType<typeof useForm<AgentBuilderEditFormValues>> | null } = {
    current: null,
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const methods = useForm<AgentBuilderEditFormValues>({
      defaultValues: { description: "", instructions: "", name: "" },
    });
    formRef.current = methods;
    return React.createElement(FormProvider, methods, children);
  };

  const { result } = renderHook(() => useSetAgentModelTool({ availableModels }), {
    wrapper: Wrapper,
  });
  return { form: () => formRef.current!, tool: result.current };
};

describe("useSetAgentModelTool", () => {
  it("exposes the canonical tool id", () => {
    const { tool } = renderTool();
    expect(tool.id).toBe(SET_AGENT_MODEL_TOOL_NAME);
    expect(tool.id).toBe("set-agent-model");
  });

  it("writes the model provider/name pair to the form", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({ model: { name: "gpt-4o", provider: "openai" } } as any);
    expect(form().getValues("model")).toEqual({ name: "gpt-4o", provider: "openai" });
  });

  it("cleans provider ids with sub-paths (e.g. openai.responses -> openai)", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({ model: { name: "gpt-4o", provider: "openai.responses" } } as any);
    expect(form().getValues("model")).toEqual({ name: "gpt-4o", provider: "openai" });
  });

  it("ignores empty provider or name", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({ model: { name: "gpt-4o", provider: "" } } as any);
    expect(form().getValues("model")).toBeUndefined();

    await tool.execute!({ model: { name: "", provider: "openai" } } as any);
    expect(form().getValues("model")).toBeUndefined();
  });

  it("does nothing when model input is missing", async () => {
    const { tool, form } = renderTool();
    await tool.execute!({} as any);
    expect(form().getValues("model")).toBeUndefined();
  });
});
