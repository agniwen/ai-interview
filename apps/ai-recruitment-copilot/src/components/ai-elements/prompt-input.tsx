/* oxlint-disable import/first no-barrel-file -- public prompt facade preserves existing exports. */
"use client";

import { IconPhoto } from "@tabler/icons-react";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import type {
  ChangeEventHandler,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  ReactNode,
} from "react";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { InputGroup } from "@/components/ui/input-group";
import { cn } from "@arc/shared/utils";

// ============================================================================
// Helpers
// ============================================================================

import { useWorkspaceSlug } from "@/lib/client/workspace-context";

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
  beginAttachmentUpload,
  buildManagedAttachment,
  LocalAttachmentsContext,
  LocalReferencedSourcesContext,
  useOptionalPromptInputController,
  usePromptInputAttachments,
} from "./prompt-input-context";
import type {
  AttachmentsContext,
  PromptInputActionAddAttachmentsProps,
  ReferencedSourcesContext,
} from "./prompt-input-context";
export * from "./prompt-input-context";
export * from "./prompt-input-controls";
export function PromptInputActionAddAttachments({
  label = "Add photos or files",
  ...props
}: PromptInputActionAddAttachmentsProps) {
  const attachments = usePromptInputAttachments();

  const handleClick = useCallback(() => {
    attachments.openFileDialog();
  }, [attachments]);

  return (
    <DropdownMenuItem closeOnClick={false} {...props} onClick={handleClick}>
      <IconPhoto className="mr-2 size-4" /> {label}
    </DropdownMenuItem>
  );
}

export interface PromptInputMessage {
  text: string;
  files: (FileUIPart & { attachmentId?: string; parsed?: AttachmentParsed })[];
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit" | "onError"> & {
  // e.g., "image/*" or leave undefined for any
  accept?: string;
  multiple?: boolean;
  // When true, accepts drops anywhere on document. Default false (opt-in).
  globalDrop?: boolean;
  // Render a hidden input with given name and keep it in sync for native form posts. Default false.
  syncHiddenInput?: boolean;
  // Minimal constraints
  maxFiles?: number;
  // bytes
  maxFileSize?: number;
  dragOverlay?: ReactNode;
  dragOverlayClassName?: string;
  onGlobalDropOutside?: () => void;
  onError?: (err: {
    code: "max_files" | "max_file_size" | "accept" | "upload_pending" | "upload_failed";
    message: string;
  }) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({
  className,
  accept,
  multiple,
  globalDrop,
  syncHiddenInput,
  maxFiles,
  maxFileSize,
  dragOverlay,
  dragOverlayClassName,
  onGlobalDropOutside,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) {
  const slug = useWorkspaceSlug();
  // Try to use a provider controller if present
  const controller = useOptionalPromptInputController();
  const usingProvider = !!controller;

  // Refs
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // ----- Local attachments (only used when no provider)
  const [items, setItems] = useState<ManagedAttachment[]>([]);
  const files: ManagedAttachment[] = usingProvider
    ? (controller.attachments.files as ManagedAttachment[])
    : items;
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  // ----- Local referenced sources (always local to PromptInput)
  const [referencedSources, setReferencedSources] = useState<
    (SourceDocumentUIPart & { id: string })[]
  >([]);

  // Keep a ref to files for cleanup on unmount (avoids stale closure)
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const openFileDialogLocal = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const dragDepthRef = useRef(0);

  const setDraggingState = useCallback((nextState: boolean) => {
    setIsDraggingFiles(nextState);
  }, []);

  const resetDraggingState = useCallback(() => {
    dragDepthRef.current = 0;
    setDraggingState(false);
  }, [setDraggingState]);

  const matchesAccept = useCallback(
    (f: File) => {
      if (!accept || accept.trim() === "") {
        return true;
      }

      const patterns = accept
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      return patterns.some((pattern) => {
        if (pattern.endsWith("/*")) {
          // e.g: image/* -> image/
          const prefix = pattern.slice(0, -1);
          return f.type.startsWith(prefix);
        }
        return f.type === pattern;
      });
    },
    [accept],
  );

  const addLocal = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = [...fileList];
      const accepted = incoming.filter((f) => matchesAccept(f));
      if (incoming.length && accepted.length === 0) {
        onError?.({
          code: "accept",
          message: "No files match the accepted types.",
        });
        return;
      }
      const withinSize = (f: File) => (maxFileSize ? f.size <= maxFileSize : true);
      const sized = accepted.filter(withinSize);
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({
          code: "max_file_size",
          message: "All files exceed the maximum size.",
        });
        return;
      }

      const currentCount = items.length;
      const capacity =
        typeof maxFiles === "number" ? Math.max(0, maxFiles - currentCount) : undefined;
      const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;
      if (typeof capacity === "number" && sized.length > capacity) {
        onError?.({
          code: "max_files",
          message: "Too many files. Some were not added.",
        });
      }

      const builtAttachments = capped.map((file) => ({
        attachment: buildManagedAttachment(file),
        file,
      }));

      setItems((prev) => [...prev, ...builtAttachments.map((b) => b.attachment)]);

      for (const { attachment, file } of builtAttachments) {
        beginAttachmentUpload(slug, file, attachment.id, setItems);
      }
    },
    [matchesAccept, maxFiles, maxFileSize, onError, items.length, slug],
  );

  const removeLocal = useCallback(
    (id: string) =>
      setItems((prev) => {
        const found = prev.find((file) => file.id === id);
        if (found?.url) {
          URL.revokeObjectURL(found.url);
        }
        return prev.filter((file) => file.id !== id);
      }),
    [],
  );

  // Wrapper that validates files before calling provider's add
  const addWithProviderValidation = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = [...fileList];
      const accepted = incoming.filter((f) => matchesAccept(f));
      if (incoming.length && accepted.length === 0) {
        onError?.({
          code: "accept",
          message: "No files match the accepted types.",
        });
        return;
      }
      const withinSize = (f: File) => (maxFileSize ? f.size <= maxFileSize : true);
      const sized = accepted.filter(withinSize);
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({
          code: "max_file_size",
          message: "All files exceed the maximum size.",
        });
        return;
      }

      const currentCount = files.length;
      const capacity =
        typeof maxFiles === "number" ? Math.max(0, maxFiles - currentCount) : undefined;
      const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;
      if (typeof capacity === "number" && sized.length > capacity) {
        onError?.({
          code: "max_files",
          message: "Too many files. Some were not added.",
        });
      }

      if (capped.length > 0) {
        controller?.attachments.add(capped);
      }
    },
    [matchesAccept, maxFileSize, maxFiles, onError, files.length, controller],
  );

  const clearAttachments = useCallback(
    () =>
      usingProvider
        ? controller?.attachments.clear()
        : setItems((prev) => {
            for (const file of prev) {
              if (file.url) {
                URL.revokeObjectURL(file.url);
              }
            }
            return [];
          }),
    [usingProvider, controller],
  );

  const clearReferencedSources = useCallback(() => setReferencedSources([]), []);

  const add = usingProvider ? addWithProviderValidation : addLocal;
  const remove = usingProvider ? controller.attachments.remove : removeLocal;
  const openFileDialog = usingProvider
    ? controller.attachments.openFileDialog
    : openFileDialogLocal;

  const clear = useCallback(() => {
    clearAttachments();
    clearReferencedSources();
  }, [clearAttachments, clearReferencedSources]);

  // Let provider know about our hidden file input so external menus can call openFileDialog()
  useEffect(() => {
    if (!usingProvider) {
      return;
    }
    controller.__registerFileInput(inputRef, () => inputRef.current?.click());
  }, [usingProvider, controller]);

  // Note: File input cannot be programmatically set for security reasons
  // The syncHiddenInput prop is no longer functional
  useEffect(() => {
    if (syncHiddenInput && inputRef.current && files.length === 0) {
      inputRef.current.value = "";
    }
  }, [files, syncHiddenInput]);

  // Attach drop handlers on nearest form and document (opt-in)
  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    const onDragEnter = (e: DragEvent) => {
      if (globalDrop) {
        return;
      }
      if (!e.dataTransfer?.types?.includes("Files")) {
        return;
      }

      dragDepthRef.current += 1;
      setDraggingState(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDraggingState(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (globalDrop) {
        return;
      }
      if (!e.dataTransfer?.types?.includes("Files")) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDraggingState(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }
      resetDraggingState();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        add(e.dataTransfer.files);
      }
    };
    form.addEventListener("dragenter", onDragEnter);
    form.addEventListener("dragover", onDragOver);
    form.addEventListener("dragleave", onDragLeave);
    form.addEventListener("drop", onDrop);
    return () => {
      form.removeEventListener("dragenter", onDragEnter);
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("dragleave", onDragLeave);
      form.removeEventListener("drop", onDrop);
    };
  }, [add, globalDrop, resetDraggingState, setDraggingState]);

  useEffect(() => {
    if (!globalDrop) {
      return;
    }

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) {
        return;
      }

      dragDepthRef.current += 1;
      setDraggingState(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
        setDraggingState(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) {
        return;
      }

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDraggingState(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault();
      }

      const form = formRef.current;
      const { target } = e;
      const isDropInsideForm = form && target instanceof Node ? form.contains(target) : false;

      resetDraggingState();

      if (isDropInsideForm) {
        return;
      }

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        onGlobalDropOutside?.();
      }
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, [globalDrop, onGlobalDropOutside, resetDraggingState, setDraggingState]);

  useEffect(() => {
    const onWindowDragEnd = () => {
      resetDraggingState();
    };

    window.addEventListener("dragend", onWindowDragEnd);
    return () => {
      window.removeEventListener("dragend", onWindowDragEnd);
    };
  }, [resetDraggingState]);

  useEffect(
    () => () => {
      if (!usingProvider) {
        for (const f of filesRef.current) {
          if (f.url) {
            URL.revokeObjectURL(f.url);
          }
        }
      }
    },
    [usingProvider],
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      if (event.currentTarget.files) {
        add(event.currentTarget.files);
      }
      // Reset input value to allow selecting files that were previously removed
      event.currentTarget.value = "";
    },
    [add],
  );

  const attachmentsCtx = useMemo<AttachmentsContext>(
    () => ({
      add,
      clear: clearAttachments,
      fileInputRef: inputRef,
      files: files.map((item) => ({ ...item, id: item.id })),
      openFileDialog,
      remove,
    }),
    [files, add, remove, clearAttachments, openFileDialog],
  );

  const refsCtx = useMemo<ReferencedSourcesContext>(
    () => ({
      add: (incoming: SourceDocumentUIPart[] | SourceDocumentUIPart) => {
        const array = Array.isArray(incoming) ? incoming : [incoming];
        setReferencedSources((prev) => [...prev, ...array.map((s) => ({ ...s, id: nanoid() }))]);
      },
      clear: clearReferencedSources,
      remove: (id: string) => {
        setReferencedSources((prev) => prev.filter((s) => s.id !== id));
      },
      sources: referencedSources,
    }),
    [referencedSources, clearReferencedSources],
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const text = usingProvider
        ? controller.textInput.value
        : (() => {
            const formData = new FormData(form);
            return (formData.get("message") as string) || "";
          })();

      // Reset form immediately after capturing text to avoid race condition
      // where user input during async blob conversion would be lost
      if (!usingProvider) {
        form.reset();
      }

      // Uploads were kicked off when each file was attached. Block submit
      // until every attachment has finished uploading.
      if (files.some((f) => f.uploadStatus === "uploading")) {
        onError?.({
          code: "upload_pending",
          message: "附件还在上传，请稍后再试。",
        });
        return;
      }
      if (files.some((f) => f.uploadStatus === "error")) {
        onError?.({
          code: "upload_failed",
          message: "有附件上传失败，请移除后重试。",
        });
        return;
      }

      try {
        const convertedFiles: PromptInputMessage["files"] = files.map(
          ({ id: _id, uploadStatus: _uploadStatus, ...item }) => item,
        );

        const result = onSubmit({ files: convertedFiles, text }, event);

        // Handle both sync and async onSubmit
        if (result instanceof Promise) {
          try {
            await result;
            clear();
            if (usingProvider) {
              controller.textInput.clear();
            }
          } catch {
            // Don't clear on error - user may want to retry
          }
        } else {
          // Sync function completed without throwing, clear inputs
          clear();
          if (usingProvider) {
            controller.textInput.clear();
          }
        }
      } catch {
        // Don't clear on error - user may want to retry
      }
    },
    [usingProvider, controller, files, onSubmit, clear, onError],
  );

  // Render with or without local provider
  const inner = (
    <>
      <input
        accept={accept}
        aria-label="Upload files"
        className="hidden"
        multiple={multiple}
        onChange={handleChange}
        ref={inputRef}
        title="Upload files"
        type="file"
      />
      <form className={cn("w-full", className)} onSubmit={handleSubmit} ref={formRef} {...props}>
        <InputGroup className="overflow-hidden">
          {children}
          {dragOverlay && isDraggingFiles ? (
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-3",
                dragOverlayClassName,
              )}
            >
              {dragOverlay}
            </div>
          ) : null}
        </InputGroup>
      </form>
    </>
  );

  const withReferencedSources = (
    <LocalReferencedSourcesContext value={refsCtx}>{inner}</LocalReferencedSourcesContext>
  );

  // Always provide LocalAttachmentsContext so children get validated add function
  return (
    <LocalAttachmentsContext value={attachmentsCtx}>
      {withReferencedSources}
    </LocalAttachmentsContext>
  );
}
