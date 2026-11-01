import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { toAISdkStream } from "@mastra/ai-sdk";
import { readUIMessageStream, validateUIMessages } from "ai";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getMastraModelConfig } from "@app/ai-runtime/models";
import { extractNativeApproval } from "../../../routes/chat/utils/extract-native-approval";
import { legacyUiMessageToArcMessage } from "../adapters/arc-message-adapter";

const model = getMastraModelConfig({
  ALIBABA_API_KEY: "test-key",
  ALIBABA_BASE_URL: "https://example.com/v1",
  ALIBABA_MODEL: "test-model",
}).chatModel;

interface ProviderDelta {
  content?: string;
  tool_calls?: {
    index: number;
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

function providerResponse(delta: ProviderDelta, finishReason: "stop" | "tool_calls") {
  const events = [
    { choices: [{ delta, finish_reason: null, index: 0 }] },
    { choices: [{ delta: {}, finish_reason: finishReason, index: 0 }] },
  ];
  return Promise.resolve(
    new Response(
      `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    ),
  );
}

async function readMessage(
  stream: Parameters<typeof toAISdkStream>[0],
  initialMessage?: UIMessage,
): Promise<UIMessage> {
  let message: UIMessage | undefined;
  for await (const update of readUIMessageStream({
    message: initialMessage,
    stream: toAISdkStream(stream, {
      from: "agent",
      lastMessageId: initialMessage?.id,
      version: "v7",
    }),
    terminateOnError: true,
  })) {
    message = update;
  }
  if (!message) {
    throw new Error("Expected an AI SDK UI message");
  }
  return message;
}

afterEach(() => vi.unstubAllGlobals());

describe("Mastra to AI SDK v7 stream", () => {
  it("produces valid text messages that survive business persistence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => providerResponse({ content: "候选人评价" }, "stop")),
    );
    const agent = new Agent({ id: "text-probe", instructions: "test", model, name: "TextProbe" });
    const message = await readMessage(await agent.stream("hello"));
    expect(message.parts).toContainEqual(
      expect.objectContaining({ text: "候选人评价", type: "text" }),
    );
    await expect(
      validateUIMessages({ messages: [legacyUiMessageToArcMessage(message)] }),
    ).resolves.toHaveLength(1);
  });

  it.each([true, false])("resumes the exact approved tool with decision %s", async (approved) => {
    const execute = vi.fn(() => Promise.resolve({ accepted: true }));
    const fetch = vi
      .fn()
      .mockImplementationOnce(() =>
        providerResponse(
          {
            tool_calls: [
              {
                function: { arguments: "{}", name: "propose_action" },
                id: "tool-1",
                index: 0,
                type: "function",
              },
            ],
          },
          "tool_calls",
        ),
      )
      .mockImplementation(() => providerResponse({ content: "处理完成" }, "stop"));
    vi.stubGlobal("fetch", fetch);
    const agent = new Agent({
      id: `approval-probe-${approved}`,
      instructions: "test",
      model: getMastraModelConfig({
        ALIBABA_API_KEY: "test-key",
        ALIBABA_BASE_URL: `https://example.com/${approved}/v1`,
        ALIBABA_MODEL: `approval-model-${approved}`,
      }).chatModel,
      name: "ApprovalProbe",
      tools: {
        propose_action: createTool({
          description: "test",
          execute,
          id: "propose_action",
          inputSchema: z.object({}),
          requireApproval: true,
        }),
      },
    });
    const mastra = new Mastra({
      agents: { agent },
      storage: new InMemoryStore({ id: `approval-store-${approved}` }),
    });
    const message = await readMessage(await mastra.getAgent("agent").stream("propose an action"));
    expect(execute).not.toHaveBeenCalled();
    const part = message.parts.find((item) => item.type === "tool-propose_action");
    if (!part || part.type !== "tool-propose_action" || part.state !== "approval-requested") {
      throw new Error(`Expected an approval request: ${JSON.stringify(message.parts)}`);
    }
    const responded: UIMessage = {
      ...message,
      parts: [{ ...part, approval: { ...part.approval, approved }, state: "approval-responded" }],
    };
    const persisted = legacyUiMessageToArcMessage(responded);
    const messages = await validateUIMessages({ messages: [persisted] });
    const approval = extractNativeApproval(messages);
    if (!approval) {
      throw new Error("Expected the persisted approval target");
    }
    expect(approval.toolCallId).toBe("tool-1");
    await readMessage(
      await agent.resumeStream(approval.resumeData, {
        runId: approval.runId,
        toolCallId: approval.toolCallId,
      }),
      responded,
    );
    expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0);
  });
});
