import type { UIMessage } from "ai";

export interface ChatConversationSummary {
  id: string;
  title: string;
  isTitleGenerating: boolean;
  updatedAt: number;
  createdAt: number;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  jobDescription: string;
  resumeImports: Record<string, string>;
  messages: UIMessage[];
}

async function jsonRequest<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchConversations(): Promise<ChatConversationSummary[]> {
  const data = await jsonRequest<{ conversations: ChatConversationSummary[] }>(
    "/api/chat/conversations",
    { method: "GET" },
  );
  return data.conversations;
}

export async function fetchConversation(id: string): Promise<ChatConversationDetail | null> {
  const response = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    method: "GET",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const data = (await response.json()) as { conversation: ChatConversationDetail };
  return data.conversation;
}

export interface UpsertConversationPayload {
  id: string;
  title?: string;
  isTitleGenerating?: boolean;
  jobDescription?: string;
  resumeImports?: Record<string, string>;
  createdAt?: number;
}

export async function upsertConversation(payload: UpsertConversationPayload): Promise<void> {
  await jsonRequest("/api/chat/conversations", {
    body: JSON.stringify(payload),
    method: "POST",
  });
}

export interface PatchConversationPayload {
  title?: string;
  isTitleGenerating?: boolean;
  jobDescription?: string;
  resumeImports?: Record<string, string>;
}

export async function patchConversation(
  id: string,
  payload: PatchConversationPayload,
): Promise<void> {
  await jsonRequest(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    body: JSON.stringify(payload),
    method: "PATCH",
  });
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed with status ${response.status}`);
  }
}

export async function upsertChatMessageOnServer(
  conversationId: string,
  message: UIMessage,
): Promise<void> {
  await jsonRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    body: JSON.stringify({ message }),
    method: "POST",
  });
}

export interface UploadedAttachment {
  id: string;
  url: string;
}

export async function uploadAttachment(blob: Blob, filename: string): Promise<UploadedAttachment> {
  const form = new FormData();
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type || "application/pdf" });
  form.append("file", file, filename);

  const response = await fetch("/api/chat/uploads", {
    body: form,
    credentials: "same-origin",
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as UploadedAttachment;
}
