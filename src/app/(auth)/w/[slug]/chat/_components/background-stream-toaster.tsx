"use client";

import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { subscribeChatFinish } from "../_lib/chat-registry";

// The chat page promotes `/w/[slug]/chat` to `/w/[slug]/chat/[id]` via
// `history.replaceState`, so Next's `useParams()` never observes the
// promotion. Parse the live `window.location.pathname` instead.
const CHAT_SESSION_PATH_PATTERN = /^\/w\/[^/?#]+\/chat\/([^/?#]+)/;

function getCurrentChatSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const match = CHAT_SESSION_PATH_PATTERN.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

export function BackgroundStreamToaster() {
  useEffect(
    () =>
      subscribeChatFinish(({ chatId, slug, message, isAbort, isDisconnect, isError }) => {
        if (isAbort || isDisconnect || isError) {
          return;
        }
        if (message.role !== "assistant") {
          return;
        }
        if (chatId === getCurrentChatSessionId()) {
          return;
        }
        const href = `/w/${slug}/chat/${encodeURIComponent(chatId)}`;
        const toastId = toast("新回复", {
          action: (
            <Button asChild className="ml-auto" size="sm">
              <Link href={href} onClick={() => toast.dismiss(toastId)}>
                查看
              </Link>
            </Button>
          ),
        });
      }),
    [],
  );

  return null;
}
