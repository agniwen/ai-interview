/* oxlint-disable import/first -- controls are declared after the shared prompt types they consume. */
"use client";

import { IconCornerDownLeft, IconPlus, IconSquare, IconX } from "@tabler/icons-react";
import type { ChatStatus, FileUIPart } from "ai";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import type {
  ChangeEvent,
  ClipboardEventHandler,
  ComponentProps,
  HTMLAttributes,
  KeyboardEventHandler,
  ReactNode,
} from "react";

import { useCallback, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arc/shared/utils";

// ============================================================================
// Helpers
// ============================================================================

export interface AttachmentParsed {
  attachmentId: string;
  text: string;
  structured: unknown;
  pageCount: number;
  textSource: AttachmentTextSource;
}

export type ManagedAttachment = FileUIPart & {
  id: string;
  uploadStatus: "uploading" | "uploaded" | "error";
  attachmentId?: string;
  parsed?: AttachmentParsed;
};

import {
  useOptionalPromptInputController,
  usePromptInputAttachments,
} from "./prompt-input-context";
export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputBody({ className, ...props }: PromptInputBodyProps) {
  return <div className={cn("contents ", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export function PromptInputTextarea({
  onChange,
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  rows,
  ...props
}: PromptInputTextareaProps) {
  const controller = useOptionalPromptInputController();
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      // Call the external onKeyDown handler first
      onKeyDown?.(e);

      // If the external handler prevented default, don't run internal logic
      if (e.defaultPrevented) {
        return;
      }

      if (e.key === "Enter") {
        if (isComposing || e.nativeEvent.isComposing) {
          return;
        }
        if (e.shiftKey) {
          return;
        }
        e.preventDefault();

        // Check if the submit button is disabled before submitting
        const { form } = e.currentTarget;
        const submitButton = form?.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null;
        if (submitButton?.disabled) {
          return;
        }

        form?.requestSubmit();
      }

      // Remove last attachment when Backspace is pressed and textarea is empty
      if (e.key === "Backspace" && e.currentTarget.value === "" && attachments.files.length > 0) {
        e.preventDefault();
        const lastAttachment = attachments.files.at(-1);
        if (lastAttachment) {
          attachments.remove(lastAttachment.id);
        }
      }
    },
    [onKeyDown, isComposing, attachments],
  );

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const items = event.clipboardData?.items;

      if (!items) {
        return;
      }

      const files: File[] = [];

      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        attachments.add(files);
      }
    },
    [attachments],
  );

  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);
  const handleCompositionStart = useCallback(() => setIsComposing(true), []);

  const controlledProps = controller
    ? {
        onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
          controller.textInput.setInput(e.currentTarget.value);
          onChange?.(e);
        },
        value: controller.textInput.value,
      }
    : {
        onChange,
      };

  return (
    <InputGroupTextarea
      className={cn(
        "field-sizing-content min-h-10 max-h-28 overflow-y-auto text-base md:text-base",
        className,
      )}
      name="message"
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      rows={rows ?? 1}
      {...props}
      {...controlledProps}
    />
  );
}

export type PromptInputHeaderProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export function PromptInputHeader({ className, ...props }: PromptInputHeaderProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("order-first pb-0! flex-wrap gap-1 empty:hidden", className)}
      {...props}
    />
  );
}

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, "align">;

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  );
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTools({ className, ...props }: PromptInputToolsProps) {
  return <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}

export type PromptInputButtonTooltip =
  | string
  | {
      content: ReactNode;
      shortcut?: string;
      side?: ComponentProps<typeof TooltipContent>["side"];
    };

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  tooltip?: PromptInputButtonTooltip;
};

function countPromptInputChildren(children: ReactNode): number {
  if (Array.isArray(children)) {
    return children.filter((child) => child !== null && child !== undefined).length;
  }
  return children === null || children === undefined ? 0 : 1;
}

export function PromptInputButton({
  variant = "ghost",
  className,
  size,
  tooltip,
  ...props
}: PromptInputButtonProps) {
  const childCount = countPromptInputChildren(props.children);
  const newSize = size ?? (childCount > 1 ? "sm" : "icon-sm");

  const button = (
    <InputGroupButton
      className={cn(className)}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  const tooltipContent = typeof tooltip === "string" ? tooltip : tooltip.content;
  const shortcut = typeof tooltip === "string" ? undefined : tooltip.shortcut;
  const side = typeof tooltip === "string" ? "top" : (tooltip.side ?? "top");

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={side}>
        {tooltipContent}
        {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;
export function PromptInputActionMenu(props: PromptInputActionMenuProps) {
  return <DropdownMenu {...props} />;
}

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export function PromptInputActionMenuTrigger({
  className,
  children,
  ...props
}: PromptInputActionMenuTriggerProps) {
  return (
    <DropdownMenuTrigger
      render={
        <PromptInputButton className={className} {...props}>
          {children ?? <IconPlus className="size-4" />}
        </PromptInputButton>
      }
    />
  );
}

export type PromptInputActionMenuContentProps = ComponentProps<typeof DropdownMenuContent>;
export function PromptInputActionMenuContent({
  className,
  ...props
}: PromptInputActionMenuContentProps) {
  return <DropdownMenuContent align="start" className={cn(className)} {...props} />;
}

export type PromptInputActionMenuItemProps = ComponentProps<typeof DropdownMenuItem>;
export function PromptInputActionMenuItem({ className, ...props }: PromptInputActionMenuItemProps) {
  return <DropdownMenuItem className={cn(className)} {...props} />;
}

// Note: Actions that perform side-effects (like opening a file dialog)
// are provided in opt-in modules (e.g., prompt-input-attachments).

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

export function PromptInputSubmit({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) {
  const isGenerating = status === "submitted" || status === "streaming";

  let Icon = <IconCornerDownLeft className="size-4" />;

  if (status === "submitted") {
    Icon = <Spinner />;
  } else if (status === "streaming") {
    Icon = <IconSquare className="size-4" />;
  } else if (status === "error") {
    Icon = <IconX className="size-4" />;
  }

  const handleClick = useCallback<
    NonNullable<React.ComponentProps<typeof InputGroupButton>["onClick"]>
  >(
    (e) => {
      if (isGenerating && onStop) {
        e.preventDefault();
        onStop();
        return;
      }
      onClick?.(e);
    },
    [isGenerating, onStop, onClick],
  );

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
}

export type PromptInputSelectProps = ComponentProps<typeof Select>;

export function PromptInputSelect(props: PromptInputSelectProps) {
  return <Select {...props} />;
}

export type PromptInputSelectTriggerProps = ComponentProps<typeof SelectTrigger>;

export function PromptInputSelectTrigger({ className, ...props }: PromptInputSelectTriggerProps) {
  return (
    <SelectTrigger
      className={cn(
        "border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors",
        "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type PromptInputSelectContentProps = ComponentProps<typeof SelectContent>;

export function PromptInputSelectContent({ className, ...props }: PromptInputSelectContentProps) {
  return <SelectContent className={cn(className)} {...props} />;
}

export type PromptInputSelectItemProps = ComponentProps<typeof SelectItem>;

export function PromptInputSelectItem({ className, ...props }: PromptInputSelectItemProps) {
  return <SelectItem className={cn(className)} {...props} />;
}

export type PromptInputSelectValueProps = ComponentProps<typeof SelectValue>;

export function PromptInputSelectValue({ className, ...props }: PromptInputSelectValueProps) {
  return <SelectValue className={cn(className)} {...props} />;
}

export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>;

export function PromptInputHoverCard(props: PromptInputHoverCardProps) {
  return <HoverCard {...props} />;
}

export type PromptInputHoverCardTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export function PromptInputHoverCardTrigger(props: PromptInputHoverCardTriggerProps) {
  return <HoverCardTrigger {...props} />;
}

export type PromptInputHoverCardContentProps = ComponentProps<typeof HoverCardContent>;

export function PromptInputHoverCardContent({
  align = "start",
  ...props
}: PromptInputHoverCardContentProps) {
  return <HoverCardContent align={align} {...props} />;
}

export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTabsList({ className, ...props }: PromptInputTabsListProps) {
  return <div className={cn(className)} {...props} />;
}

export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTab({ className, ...props }: PromptInputTabProps) {
  return <div className={cn(className)} {...props} />;
}

export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>;

export function PromptInputTabLabel({ className, ...props }: PromptInputTabLabelProps) {
  return (
    // oxlint-disable-next-line jsx-a11y/heading-has-content -- Children come via spread props at the call site.
    <h3
      className={cn("mb-2 px-3 font-medium text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTabBody({ className, ...props }: PromptInputTabBodyProps) {
  return <div className={cn("space-y-1", className)} {...props} />;
}

export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTabItem({ className, ...props }: PromptInputTabItemProps) {
  return (
    <div
      className={cn("flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent", className)}
      {...props}
    />
  );
}

export type PromptInputCommandProps = ComponentProps<typeof Command>;

export function PromptInputCommand({ className, ...props }: PromptInputCommandProps) {
  return <Command className={cn(className)} {...props} />;
}

export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>;

export function PromptInputCommandInput({ className, ...props }: PromptInputCommandInputProps) {
  return <CommandInput className={cn(className)} {...props} />;
}

export type PromptInputCommandListProps = ComponentProps<typeof CommandList>;

export function PromptInputCommandList({ className, ...props }: PromptInputCommandListProps) {
  return <CommandList className={cn(className)} {...props} />;
}

export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>;

export function PromptInputCommandEmpty({ className, ...props }: PromptInputCommandEmptyProps) {
  return <CommandEmpty className={cn(className)} {...props} />;
}

export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>;

export function PromptInputCommandGroup({ className, ...props }: PromptInputCommandGroupProps) {
  return <CommandGroup className={cn(className)} {...props} />;
}

export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>;

export function PromptInputCommandItem({ className, ...props }: PromptInputCommandItemProps) {
  return <CommandItem className={cn(className)} {...props} />;
}

export type PromptInputCommandSeparatorProps = ComponentProps<typeof CommandSeparator>;

export function PromptInputCommandSeparator({
  className,
  ...props
}: PromptInputCommandSeparatorProps) {
  return <CommandSeparator className={cn(className)} {...props} />;
}
