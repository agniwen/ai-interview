"use client";

import { AlertCircleIcon, RefreshCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatActionsContext } from "./chat-runtime-context";

interface ErrorBannerProps {
  uploadErrorMessage: string | null;
  historyErrorMessage: string | null;
  onContinueAfterError: () => void;
}

export function ErrorBanner({
  uploadErrorMessage,
  historyErrorMessage,
  onContinueAfterError,
}: ErrorBannerProps) {
  const { error } = useChatActionsContext();

  if (!error && !uploadErrorMessage && !historyErrorMessage) {
    return null;
  }

  return (
    <div className="mx-auto mb-2 flex w-full max-w-5xl flex-col gap-2 px-2 sm:px-3">
      {error ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-2 rounded-xl border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:flex-row sm:items-center sm:gap-3 sm:px-4"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span className="leading-relaxed">
              请求失败，这一步没有完成。可以继续跑完剩下的步骤，或从头重新生成。
            </span>
          </div>
          <Button
            className="shrink-0 sm:ml-auto"
            onClick={onContinueAfterError}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCcwIcon className="size-3.5" />
            继续
          </Button>
        </div>
      ) : null}

      {uploadErrorMessage ? (
        <div
          aria-live="polite"
          className="mb-2 flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:px-4"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">{uploadErrorMessage}</p>
        </div>
      ) : null}

      {historyErrorMessage ? (
        <div
          aria-live="polite"
          className="mb-2 flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm sm:px-4"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">{historyErrorMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
