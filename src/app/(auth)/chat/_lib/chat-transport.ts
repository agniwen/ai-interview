import { DefaultChatTransport } from "ai";
import { getChatMeta } from "./chat-meta";

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;

export function createChatTransport(chatId: string) {
  return new DefaultChatTransport({
    api: "/api/resume",
    body: () => {
      const meta = getChatMeta(chatId);
      const jd = meta.jobDescription.trim();
      return {
        chatId,
        enableThinking: meta.enableThinking,
        ...(jd && { jobDescription: jd }),
      };
    },
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
  });
}
