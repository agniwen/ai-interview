import type { JsonObject } from "./json";

export type ArcMessageRole = "system" | "user" | "assistant" | "tool";

export interface ArcTextPart {
  providerMetadata?: unknown;
  state?: "streaming" | "done";
  text: string;
  type: "text";
}

export interface ArcFilePart {
  data?: string;
  filename?: string;
  hash?: string;
  mediaType: string;
  name?: string;
  providerMetadata?: unknown;
  type: "file";
  url?: string;
}

export type ArcToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "error";

export interface ArcToolPart {
  approval?: {
    approved?: boolean;
    id: string;
    reason?: string;
    signature?: string;
  };
  callProviderMetadata?: unknown;
  errorText?: string;
  input?: unknown;
  output?: unknown;
  preliminary?: boolean;
  providerExecuted?: boolean;
  rawInput?: unknown;
  resultProviderMetadata?: unknown;
  state: ArcToolState;
  title?: string;
  toolCallId: string;
  toolMetadata?: unknown;
  toolName?: string;
  type: "tool" | "dynamic-tool" | `tool-${string}`;
}

export interface ArcReasoningPart {
  providerMetadata?: unknown;
  state?: "streaming" | "done";
  text: string;
  type: "reasoning";
}

export interface ArcSourcePart {
  filename?: string;
  mediaType?: string;
  metadata?: unknown;
  providerMetadata?: unknown;
  sourceId?: string;
  title?: string;
  type: "source" | "source-url" | "source-document";
  url?: string;
}

export interface ArcStepStartPart {
  type: "step-start";
}

export interface ArcDataPart {
  data: unknown;
  id?: string;
  type: `data-${string}`;
}

export type ArcMessagePart =
  | ArcDataPart
  | ArcFilePart
  | ArcReasoningPart
  | ArcSourcePart
  | ArcStepStartPart
  | ArcTextPart
  | ArcToolPart;

export interface ArcMessage {
  createdAt?: string;
  id: string;
  metadata?: JsonObject;
  parts: ArcMessagePart[];
  role: ArcMessageRole;
}
