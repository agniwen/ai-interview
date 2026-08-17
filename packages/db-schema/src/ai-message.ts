import type { JsonObject } from "./json";

export type ArcMessageRole = "system" | "user" | "assistant" | "tool";

export interface ArcTextPart {
  text: string;
  type: "text";
}

export interface ArcFilePart {
  data?: string;
  filename?: string;
  hash?: string;
  mediaType: string;
  name?: string;
  type: "file";
  url?: string;
}

export interface ArcToolPart {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state: "input-streaming" | "input-available" | "output-available" | "error";
  toolCallId: string;
  toolName: string;
  type: "tool";
}

export interface ArcReasoningPart {
  text: string;
  type: "reasoning";
}

export interface ArcSourcePart {
  metadata?: unknown;
  title?: string;
  type: "source";
  url?: string;
}

export type ArcMessagePart =
  | ArcFilePart
  | ArcReasoningPart
  | ArcSourcePart
  | ArcTextPart
  | ArcToolPart;

export interface ArcMessage {
  createdAt?: string;
  id: string;
  metadata?: JsonObject;
  parts: ArcMessagePart[];
  role: ArcMessageRole;
}
