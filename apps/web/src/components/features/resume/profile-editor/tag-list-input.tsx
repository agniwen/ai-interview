"use client";

import { IconX } from "@tabler/icons-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

import { cossFieldSurfaceClass } from "@/components/ui/coss-style";
import { cn } from "@app/shared/utils";

/** 逗号、顿号、分号与换行都视为分隔符，方便从简历原文粘贴。 */
const TAG_SEPARATOR_PATTERN = /[,，、;；\n\r\t]+/u;
const TAG_COMMIT_KEYS = new Set([",", "，", "、", ";", "；"]);

export interface TagListInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  maxItemLength?: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function splitTags(text: string): string[] {
  return text
    .split(TAG_SEPARATOR_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 追加标签并按大小写不敏感去重。Append tags, de-duplicated case-insensitively. */
export function appendTags(
  current: readonly string[],
  incoming: readonly string[],
  limits: { maxItems: number; maxItemLength: number },
): string[] {
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const next = [...current];
  for (const raw of incoming) {
    const tag = raw.slice(0, limits.maxItemLength).trim();
    const normalized = tag.toLowerCase();
    if (tag.length === 0 || seen.has(normalized) || next.length >= limits.maxItems) {
      continue;
    }
    seen.add(normalized);
    next.push(tag);
  }
  return next;
}

/**
 * 标签列表输入：回车或分隔符添加，粘贴自动拆分，退格删除末项，点击标签可取回修改。
 * Tag list input: Enter / separators add, paste splits, Backspace removes the last
 * tag, and clicking a tag pulls it back into the input for editing.
 */
export function TagListInput({
  value,
  onChange,
  id,
  placeholder = "输入后回车添加",
  disabled = false,
  maxItems = 100,
  maxItemLength = 120,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: TagListInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const limits = { maxItemLength, maxItems };
  const isFull = value.length >= maxItems;

  function commit(text: string) {
    const tags = splitTags(text);
    if (tags.length > 0) {
      onChange(appendTags(value, tags, limits));
    }
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
    inputRef.current?.focus();
  }

  function editAt(index: number) {
    const pending = splitTags(draft);
    const rest = value.filter((_, itemIndex) => itemIndex !== index);
    onChange(appendTags(rest, pending, limits));
    setDraft(value[index] ?? "");
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter" || TAG_COMMIT_KEYS.has(event.key)) {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!TAG_SEPARATOR_PATTERN.test(text)) {
      return;
    }
    event.preventDefault();
    commit(`${draft}${text}`);
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Pointer-only convenience; the inner input stays the keyboard target.
    <div
      className={cn(
        cossFieldSurfaceClass,
        "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5",
        disabled && "cursor-not-allowed opacity-60",
      )}
      data-invalid={ariaInvalid || undefined}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, index) => (
        <span
          className="inline-flex max-w-full items-center rounded-md bg-secondary text-secondary-foreground text-xs"
          key={`${tag}-${index}`}
        >
          <button
            className="max-w-60 truncate py-1 pr-1 pl-2 text-left disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              editAt(index);
            }}
            title={`点击修改「${tag}」`}
            type="button"
          >
            {tag}
          </button>
          <button
            aria-label={`移除「${tag}」`}
            className="mr-0.5 inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background/70 hover:text-foreground disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              removeAt(index);
            }}
            type="button"
          >
            <IconX className="size-3" />
          </button>
        </span>
      ))}
      <input
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        disabled={disabled || isFull}
        id={id}
        maxLength={maxItemLength}
        onBlur={() => commit(draft)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={isFull ? `最多 ${maxItems} 项` : placeholder}
        ref={inputRef}
        value={draft}
      />
    </div>
  );
}
