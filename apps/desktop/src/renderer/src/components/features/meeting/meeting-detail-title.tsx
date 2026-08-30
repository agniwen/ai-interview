import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface MeetingDetailTitleProps {
  canRename: boolean;
  editingTitle: string;
  isEditing: boolean;
  isPending: boolean;
  onCancel: () => void;
  onChange: (title: string) => void;
  onEdit: () => void;
  onSubmit: () => void;
  title: string;
}

export function MeetingDetailTitle({
  canRename,
  editingTitle,
  isEditing,
  isPending,
  onCancel,
  onChange,
  onEdit,
  onSubmit,
  title,
}: MeetingDetailTitleProps) {
  const editorRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !editor.contains(event.relatedTarget)) {
        onCancel();
      }
    };

    editor.addEventListener("focusout", handleFocusOut);
    return () => editor.removeEventListener("focusout", handleFocusOut);
  }, [isEditing, onCancel]);

  if (isEditing) {
    const normalizedTitle = editingTitle.trim();
    return (
      <form
        className="flex h-7 min-w-0 max-w-full items-center gap-1"
        ref={editorRef}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          aria-label={`编辑${title}的名称`}
          autoFocus
          className="h-7 min-w-20 max-w-[calc(100%-3.5rem)] border-0 border-foreground/30 border-b bg-transparent p-0 font-semibold text-xl leading-7 outline-none transition-colors [field-sizing:content] focus:border-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
          maxLength={RECORDING_TITLE_MAX_LENGTH}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          value={editingTitle}
        />
        <Button
          aria-label={`保存${title}的名称`}
          disabled={!normalizedTitle || isPending}
          size="icon-xs"
          title="保存名称"
          type="submit"
          variant="ghost"
        >
          <Icon icon="ph:check" />
        </Button>
        <Button
          aria-label={`取消编辑${title}的名称`}
          disabled={isPending}
          onClick={onCancel}
          size="icon-xs"
          title="取消编辑"
          type="button"
          variant="ghost"
        >
          <Icon icon="ph:x" />
        </Button>
      </form>
    );
  }

  return (
    <div className="group/title flex h-7 min-w-0 max-w-full items-center gap-1">
      <h1 className="truncate font-semibold text-xl leading-7">{title}</h1>
      {canRename ? (
        <Button
          aria-label={`编辑${title}的名称`}
          className="opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100"
          onClick={onEdit}
          size="icon-xs"
          title="编辑名称"
          type="button"
          variant="ghost"
        >
          <Icon icon="ph:pencil-line" />
        </Button>
      ) : null}
    </div>
  );
}
