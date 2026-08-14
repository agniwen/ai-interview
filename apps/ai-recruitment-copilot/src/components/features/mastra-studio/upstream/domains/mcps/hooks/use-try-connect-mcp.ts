import { useMastraClient } from "@mastra/react";
import { useMutation } from "@tanstack/react-query";

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface TryConnectResult {
  tools: McpTool[];
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    const lines = text.split("\n");

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice("data:".length).trim();
        if (data) {
          return JSON.parse(data);
        }
      }
    }

    throw new Error("SSE 响应中没有数据");
  }

  return response.json();
}

async function connectAndListTools(
  url: string,
  clientHeaders?: Record<string, string>,
): Promise<TryConnectResult> {
  const baseHeaders: Record<string, string> = {
    ...clientHeaders,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };

  // Step 1: Initialize
  const initResponse = await fetch(url, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "mastra-playground", version: "1.0.0" },
        protocolVersion: "2025-03-26",
      },
    }),
    credentials: "include",
    headers: baseHeaders,
    method: "POST",
  });

  if (!initResponse.ok) {
    throw new Error(`初始化失败：${initResponse.status} ${initResponse.statusText}`);
  }

  const sessionId = initResponse.headers.get("Mcp-Session-Id");
  await parseResponse(initResponse);

  const sessionHeaders: Record<string, string> = {
    ...baseHeaders,
  };
  if (sessionId) {
    sessionHeaders["Mcp-Session-Id"] = sessionId;
  }

  // Step 2: Send initialized notification
  await fetch(url, {
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    credentials: "include",
    headers: sessionHeaders,
    method: "POST",
  });

  // Step 3: List tools
  const toolsResponse = await fetch(url, {
    body: JSON.stringify({
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
    }),
    credentials: "include",
    headers: sessionHeaders,
    method: "POST",
  });

  if (!toolsResponse.ok) {
    throw new Error(`获取工具列表失败：${toolsResponse.status} ${toolsResponse.statusText}`);
  }

  const toolsResult = (await parseResponse(toolsResponse)) as { result?: { tools?: McpTool[] } };

  return {
    tools: toolsResult.result?.tools ?? [],
  };
}

export const useTryConnectMcp = () => {
  const client = useMastraClient();
  const clientHeaders = (client.options?.headers as Record<string, string>) ?? {};

  return useMutation({
    mutationFn: (url: string) => connectAndListTools(url, clientHeaders),
  });
};

export type TryConnectMcpMutation = ReturnType<typeof useTryConnectMcp>;
