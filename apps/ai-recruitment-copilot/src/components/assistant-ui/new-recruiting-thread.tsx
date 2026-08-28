"use client";

import { ComposerPrimitive, INTERNAL, useComposer, useComposerRuntime } from "@assistant-ui/react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { IconArrowUp } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { withCleanup } from "@/lib/client/async-control";
import { cn } from "@/lib/utils";
import {
  composerSendButtonClass,
  recruitingComposerPlaceholder,
} from "./recruiting-composer-style";
import { focusComposerInputFromShellClick } from "./recruiting-composer-focus";
import { RecruitingComposerDirectiveChip } from "./recruiting-directive-text";
import { RecruitingPersonMentionPopover } from "./recruiting-person-mention";
import { emptyThreadStyle } from "./recruiting-thread-layout";
import { useRecruitingComposerShellLayout } from "./use-recruiting-composer-shell-layout";

const newComposerInputClassName = cn(
  // Keep empty-state height close to the old textarea (min-h-9 + shell py-2).
  // Avoid stacking min-height on both the Lexical wrapper and contenteditable.
  "aui-composer-input relative -me-3 max-h-36 min-w-0 flex-1 bg-transparent text-base text-foreground",
  "[&_.aui-lexical-input]:min-h-9 [&_.aui-lexical-input]:py-1.5 [&_.aui-lexical-input]:ps-1 [&_.aui-lexical-input]:pe-14 [&_.aui-lexical-input]:leading-6 [&_.aui-lexical-input]:outline-none [&_.aui-lexical-input]:whitespace-pre-wrap [&_p]:m-0",
  "[&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:start-1 [&_.aui-lexical-placeholder]:end-14 [&_.aui-lexical-placeholder]:top-1.5 [&_.aui-lexical-placeholder]:text-muted-foreground",
);

function NewThreadEnterSubmitPlugin({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: () => void;
}) {
  "use no memo";
  // Prefer assistant-ui's input plugin registry over Lexical commands so we
  // don't import `@lexical/*` (Vite deep-import resolution is fragile here).
  // Lower priority than TriggerPopover (default 0) so @-mention Enter selects first.
  const pluginRegistry = INTERNAL.useComposerInputPluginRegistryOptional();
  const disabledRef = useRef(disabled);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    disabledRef.current = disabled;
    onSubmitRef.current = onSubmit;
  }, [disabled, onSubmit]);

  useEffect(() => {
    if (!pluginRegistry) {
      return;
    }
    return pluginRegistry.register(
      {
        handleKeyDown(event) {
          if (event.key !== "Enter" || event.shiftKey) {
            return false;
          }
          if (event.ctrlKey || event.metaKey) {
            return false;
          }
          if (event.nativeEvent?.isComposing) {
            return false;
          }
          if (disabledRef.current) {
            return false;
          }
          event.preventDefault();
          onSubmitRef.current();
          return true;
        },
        setCursorPosition(_position) {
          void _position;
        },
      },
      { priority: -1 },
    );
  }, [pluginRegistry]);

  return null;
}

function NewRecruitingComposerShell({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  "use no memo";
  const composerRuntime = useComposerRuntime();
  const text = useComposer((composer) => composer.text);
  const canSubmit = text.trim().length > 0 && !disabled;
  const submittingRef = useRef(false);
  const composerShellRef = useRecruitingComposerShellLayout();

  const handleSubmit = () => {
    if (submittingRef.current || disabled) {
      return;
    }
    const nextText = composerRuntime.getState().text.trim();
    if (!nextText) {
      return;
    }
    submittingRef.current = true;
    composerRuntime.setText("");
    void withCleanup(
      () => onSubmit(nextText),
      () => {
        submittingRef.current = false;
      },
    );
  };

  return (
    <div
      className={cn(
        "aui-composer-shell relative flex w-full items-end gap-2 rounded-[28px] border border-input bg-background px-3 py-2 shadow-md transition-shadow focus-within:shadow-xl data-[multiline]:pb-13 data-[multiline]:[&_.aui-lexical-input]:pe-1",
        disabled && "pointer-events-none opacity-60",
      )}
      ref={composerShellRef}
    >
      <LexicalComposerInput
        aria-label="招聘问题输入"
        autoFocus={!disabled}
        className={newComposerInputClassName}
        directiveChip={RecruitingComposerDirectiveChip}
        placeholder={recruitingComposerPlaceholder}
        submitMode="none"
      />
      <NewThreadEnterSubmitPlugin disabled={!canSubmit} onSubmit={handleSubmit} />
      <Button
        aria-label="发送"
        className={cn(composerSendButtonClass, "absolute right-3 bottom-2 z-1 shrink-0")}
        disabled={!canSubmit}
        onClick={handleSubmit}
        size="icon"
        title="发送"
        type="button"
      >
        <IconArrowUp className="size-4" />
      </Button>
    </div>
  );
}

function NewRecruitingComposer({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  "use no memo";
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root
        className="aui-composer-root relative flex w-full flex-col"
        onClick={focusComposerInputFromShellClick}
      >
        <NewRecruitingComposerShell disabled={disabled} onSubmit={onSubmit} />
        <RecruitingPersonMentionPopover />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

export function NewRecruitingThread({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  return (
    <div
      className="aui-root aui-thread-root flex min-h-0 flex-1 flex-col bg-background text-foreground"
      style={emptyThreadStyle}
    >
      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col justify-center px-4 pb-[18vh]">
        <div className="aui-thread-welcome-root mb-6 text-center">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-normal duration-200">
            从哪里开始招聘协作？
          </h1>
        </div>
        <NewRecruitingComposer disabled={disabled} onSubmit={onSubmit} />
        <p className="mt-2 text-center text-muted-foreground text-xs">
          AI Recruitment Copilot 可能出错，请在确认动作前核对候选人和岗位信息。可用 @ 提及招聘台 /
          人才库候选人。
        </p>
      </div>
    </div>
  );
}
