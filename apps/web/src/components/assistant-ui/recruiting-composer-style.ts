// Prompt bar: one 28px row (input + trailing actions) inside a 6px-padded, 14px-radius shell.
// Multiline input keeps full width and the actions drop below it (see use-recruiting-composer-shell-layout).
export const composerShellClass =
  "aui-composer-shell relative flex w-full items-end rounded-[14px] border border-transparent bg-control p-1.5 shadow-default data-[multiline]:pb-10 data-[multiline]:[&_.aui-lexical-input]:pe-1.5";

// Mobile keeps 16px text so iOS does not zoom on focus.
export const composerInputClass = [
  "aui-composer-input relative max-h-36 min-w-0 flex-1 bg-transparent text-foreground",
  "[&_.aui-lexical-input]:min-h-7 [&_.aui-lexical-input]:ps-1.5 [&_.aui-lexical-input]:py-0.5 [&_.aui-lexical-input]:pe-9 [&_.aui-lexical-input]:text-base [&_.aui-lexical-input]:leading-6 md:[&_.aui-lexical-input]:py-[5px] md:[&_.aui-lexical-input]:text-[13px] md:[&_.aui-lexical-input]:leading-[18px] [&_.aui-lexical-input]:outline-none [&_.aui-lexical-input]:whitespace-pre-wrap [&_p]:m-0",
  "[&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:start-1.5 [&_.aui-lexical-placeholder]:end-9 [&_.aui-lexical-placeholder]:top-0.5 [&_.aui-lexical-placeholder]:truncate [&_.aui-lexical-placeholder]:text-base [&_.aui-lexical-placeholder]:leading-6 [&_.aui-lexical-placeholder]:text-muted-foreground md:[&_.aui-lexical-placeholder]:top-[5px] md:[&_.aui-lexical-placeholder]:text-[13px] md:[&_.aui-lexical-placeholder]:leading-[18px]",
].join(" ");

export const composerActionsClass =
  "aui-composer-action-wrapper absolute right-1.5 bottom-1.5 z-1 flex shrink-0 items-center justify-end gap-1";

export const composerSendButtonClass =
  "size-7 rounded-lg border-transparent bg-foreground p-0 text-background shadow-none inset-shadow-none active:inset-shadow-none hover:bg-foreground/85 disabled:bg-(--gray-4) disabled:text-muted-foreground disabled:opacity-100";

export const recruitingComposerPlaceholder = "输入招聘问题，或输入 @ 提及候选人...";

export const recruitingComposerDisclaimer =
  "Deepround 可能出错，请在确认动作前核对候选人和岗位信息。";
