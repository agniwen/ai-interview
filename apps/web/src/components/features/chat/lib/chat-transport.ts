import { DefaultChatTransport } from "ai";
import { backendApiUrl } from "@/lib/client/backend-api";
import { getChatMeta } from "./chat-meta";

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

export async function fetchChatRequest(fetchInput: RequestInfo | URL, init?: RequestInit) {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    timeoutController.abort("Chat request timed out after 8 minutes.");
  }, CHAT_REQUEST_TIMEOUT_MS);

  if (init?.signal) {
    if (init.signal.aborted) {
      timeoutController.abort(init.signal.reason);
    } else {
      init.signal.addEventListener("abort", () => timeoutController.abort(init.signal?.reason), {
        once: true,
      });
    }
  }

  try {
    return await fetch(fetchInput, {
      ...init,
      credentials: "include",
      signal: timeoutController.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function createChatTransport(chatId: string, workspaceSlug: string) {
  return new DefaultChatTransport({
    api: backendApiUrl(`/workspaces/${encodeURIComponent(workspaceSlug)}/copilot/resume-chat`),
    body: () => {
      const meta = getChatMeta(chatId);
      return {
        chatId,
        ...(meta.focus && { focus: meta.focus }),
      };
    },
    fetch: fetchChatRequest,
    // Defensive layer over the SDK's default body builder: when regenerating,
    // ensure `messages` is trimmed *before* the message being replaced and
    // that `messageId` is present so the server can prune the DB row. The SDK
    // strips local state but does not always pass `messageId` to the body
    // (e.g. when callers omit it), leaving the old assistant orphaned in the
    // DB and resurfacing on reload.
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body, headers }) => {
      let outgoingMessages = messages;
      if (trigger === "regenerate-message" && messageId) {
        const cutoff = messages.findIndex((m) => m.id === messageId);
        if (cutoff !== -1) {
          outgoingMessages = messages.slice(0, cutoff);
        }
      }
      return {
        body: {
          ...body,
          id,
          messageId,
          messages: outgoingMessages,
          trigger,
        },
        headers,
      };
    },
  });
}
