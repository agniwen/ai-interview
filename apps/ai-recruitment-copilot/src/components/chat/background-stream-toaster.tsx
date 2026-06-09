"use client";

import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { subscribeChatFinish } from "./lib/chat-registry";

export function BackgroundStreamToaster() {
  const navigate = useNavigate();
  const currentChatId = useParams({
    select: (params) => (typeof params.sessionId === "string" ? params.sessionId : null),
    strict: false,
  });

  useEffect(
    () =>
      subscribeChatFinish(({ chatId, slug, message, isAbort, isDisconnect, isError }) => {
        if (isAbort || isDisconnect || isError) {
          return;
        }
        if (message.role !== "assistant") {
          return;
        }
        if (chatId === currentChatId) {
          return;
        }
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
