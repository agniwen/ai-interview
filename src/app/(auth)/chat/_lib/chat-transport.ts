import { WorkflowChatTransport } from "@workflow/ai";
import { getChatMeta } from "./chat-meta";

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;
const ACTIVE_RUN_LS_KEY = (chatId: string) => `active-workflow-run:${chatId}`;

export function getStoredActiveRunId(chatId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(ACTIVE_RUN_LS_KEY(chatId));
}

export function setStoredActiveRunId(chatId: string, runId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (runId) {
    window.localStorage.setItem(ACTIVE_RUN_LS_KEY(chatId), runId);
  } else {
    window.localStorage.removeItem(ACTIVE_RUN_LS_KEY(chatId));
  }
}

export function createChatTransport(chatId: string, initialActiveRunId: string | null = null) {
  // localStorage is the fast-path hint. Server-injected initialActiveRunId is
  // the source of truth on first mount; transport still re-reads localStorage
  // on subsequent reconnects within the same tab.
  if (initialActiveRunId) {
    setStoredActiveRunId(chatId, initialActiveRunId);
  }

  return new WorkflowChatTransport({
    api: "/api/resume",
    fetch: async (fetchInput, init) => {
      const timeoutController = new AbortController();
      const timeoutId = window.setTimeout(() => {
        timeoutController.abort("Chat request timed out after 8 minutes.");
      }, CHAT_REQUEST_TIMEOUT_MS);

      if (init?.signal) {
        if (init.signal.aborted) {
          timeoutController.abort(init.signal.reason);
        } else {
          init.signal.addEventListener(
            "abort",
            () => timeoutController.abort(init.signal?.reason),
            { once: true },
          );
        }
      }

      try {
        return await fetch(fetchInput, {
          ...init,
          signal: timeoutController.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    onChatEnd: () => {
      setStoredActiveRunId(chatId, null);
    },
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      if (runId) {
        setStoredActiveRunId(chatId, runId);
      }
    },
    prepareReconnectToStreamRequest: ({ api, ...rest }) => {
      const runId = getStoredActiveRunId(chatId);
      if (!runId) {
        throw new Error(`No active workflow run for chat ${chatId}`);
      }
      return {
        ...rest,
        api: `${api}/${encodeURIComponent(runId)}/stream`,
      };
    },
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
      const meta = getChatMeta(chatId);
      const jd = meta.jobDescription.trim();
      // WorkflowChatTransport's fetch does not auto-set Content-Type, so the
      // server's JSON validator sees an unparsed body. Set it explicitly.
      return {
        body: {
          ...body,
          chatId,
          enableThinking: meta.enableThinking,
          id,
          messageId,
          messages: outgoingMessages,
          trigger,
          ...(jd && { jobDescription: jd }),
        },
        headers: {
          ...headers,
          "content-type": "application/json",
        },
      };
    },
  });
}
