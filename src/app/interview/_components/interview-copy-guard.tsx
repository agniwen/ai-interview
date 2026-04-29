"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

function blockClipboard(event: ClipboardEvent) {
  event.preventDefault();
}

export function InterviewCopyGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    return () => {
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
    };
  }, []);

  return (
    <div className="select-none [&_[contenteditable]]:select-text [&_input]:select-text [&_textarea]:select-text">
      {children}
    </div>
  );
}
