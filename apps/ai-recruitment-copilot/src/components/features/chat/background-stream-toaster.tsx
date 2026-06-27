"use client";

import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isStudioResumeChatId } from "../studio/studio-resume-chat";
import type { ChatFinishEvent } from "./lib/chat-registry";
import { subscribeChatFinish } from "./lib/chat-registry";

export function shouldShowBackgroundStreamToast(
  event: ChatFinishEvent,
  currentChatId: string | null,
): boolean {
  if (event.isAbort || event.isDisconnect || event.isError) {
    return false;
  }
  if (event.message.role !== "assistant") {
    return false;
  }
  if (isStudioResumeChatId(event.chatId)) {
    return false;
  }
  return event.chatId !== currentChatId;
}

export function BackgroundStreamToaster() {
  const navigate = useNavigate();
  const currentChatId = useParams({
    select: (params) => (typeof params.sessionId === "string" ? params.sessionId : null),
    strict: false,
  });

  useEffect(
    () =>
      subscribeChatFinish((event) => {
        if (!shouldShowBackgroundStreamToast(event, currentChatId)) {
          return;
        }
        const { chatId, slug } = event;
        const toastId = toast("新回复", {
          action: (
            <Button
              className="ml-auto"
              onClick={() => {
                toast.dismiss(toastId);
                void navigate({
                  params: { sessionId: chatId, slug },
                  to: "/w/$slug/chat/$sessionId",
                });
              }}
              size="sm"
            >
              查看
            </Button>
          ),
        });
      }),
    [currentChatId, navigate],
  );

  return null;
}
