import { IconMaximize } from "@tabler/icons-react";
import { useRef } from "react";
import type { ReactNode } from "react";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { Button } from "@/components/ui/button";

export function CandidateResumePreview({
  children,
  candidate,
  onOpen,
}: {
  children: ReactNode;
  candidate?: { hasResumeFile: boolean; resumeFileName?: string | null };
  onOpen: () => void;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  if (!candidate?.hasResumeFile) {
    return null;
  }
  return (
    <section aria-label="简历预览" className="mx-2 mb-4 pt-3 md:mx-4">
      <div className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-xl border bg-background">
        <div
          className="min-h-0 flex-1 cursor-zoom-in overflow-hidden"
          onPointerDownCapture={(event) => {
            if (pointers.current.size === 0) {
              moved.current = false;
            }
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.current.size > 1) {
              moved.current = true;
            }
          }}
          onPointerMoveCapture={(event) => {
            const start = pointers.current.get(event.pointerId);
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
              moved.current = true;
            }
          }}
          onPointerUpCapture={(event) => pointers.current.delete(event.pointerId)}
          onPointerCancelCapture={(event) => {
            moved.current = true;
            pointers.current.delete(event.pointerId);
          }}
          onClickCapture={(event) => {
            if (moved.current) {
              return;
            }
            const { target } = event;
            if (!(target instanceof Element)) {
              return;
            }
            if (target.closest("button, input, select, [role=combobox]")) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onOpen();
          }}
        >
          {children}
        </div>
        <Button
          aria-label="全屏查看简历"
          className="h-auto w-full justify-start rounded-none border-0 px-4 py-3 text-left"
          onClick={onOpen}
          variant="text"
        >
          <ResumeDocumentFileIcon
            kind={getResumeDocumentFileIconKind({ fileName: candidate.resumeFileName })}
          />
          <span className="min-w-0 flex-1 truncate">{candidate.resumeFileName ?? "简历"}</span>
          <IconMaximize />
        </Button>
      </div>
    </section>
  );
}
