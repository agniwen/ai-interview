import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

interface UseChatDraftArgs {
  onSubmit: (trimmed: string) => void;
}

const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
};

export const useChatDraft = ({ onSubmit }: UseChatDraftArgs) => {
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
    setDraft("");
  };

  return { draft, handleFormSubmit, handleKeyDown, setDraft, trimmed };
};
