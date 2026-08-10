import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { chromeIconControlClassName } from "@/components/layout/chrome-icon-button";
import type {
  MeetingCaptureSnapshot,
  RecoverableMeetingCapture,
  WorkspaceSaveState,
} from "../../../../../preload/meeting-capture";
import { cn } from "@arc/shared/utils";
import { formatAppDateTimeShort } from "@/lib/client/datetime";
import { useSuspendChromeDrag } from "@/lib/use-suspend-chrome-drag";
import { useMeetingRecording } from "./meeting-recording-context";

const noDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
} as CSSProperties;

/** Hover reveal: fade + slide in from the right. */
const ACTION_REVEAL_CLASS =
  "pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center gap-0.5 bg-linear-to-l from-popover from-65% to-transparent pr-1 pl-5 opacity-0 translate-x-1.5 transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100";

const ACTION_BTN_CLASS = "h-6 px-1.5 text-[11px]";

function formatRecoveryDeadline(value: string): string {
  return formatAppDateTimeShort(value);
}

function recoveryTitle(capture: RecoverableMeetingCapture): string {
  if (capture.status === "interrupted") {
    return "中断录音";
  }
  return capture.recoveryCopyDeleteAfter ? "Recovery Copy" : "待上传";
}

function recoveryMeta(capture: RecoverableMeetingCapture): string {
  if (capture.recoveryCopyDeleteAfter) {
    return `${formatRecoveryDeadline(capture.recoveryCopyDeleteAfter)} 清理`;
  }
  const micSec = Math.floor(capture.tracks.microphone.committedThroughMs / 1000);
  const sysSec = Math.floor(capture.tracks.system.committedThroughMs / 1000);
  return `麦 ${micSec}s · 系统 ${sysSec}s`;
}

const WORKSPACE_SAVE_TITLE: Record<WorkspaceSaveState["state"], string> = {
  "action-required": "需处理",
  uploading: "上传中",
  verifying: "验证中",
  "waiting-for-network": "等待网络",
  "workspace-verified": "已保存",
};

type InboxEntry =
  | { kind: "saved"; captureId: string }
  | { kind: "recoverable"; capture: RecoverableMeetingCapture };

function collectInboxEntries(snapshot: MeetingCaptureSnapshot): InboxEntry[] {
  const entries: InboxEntry[] = [];
  const seen = new Set<string>();

  if (snapshot.saved) {
    seen.add(snapshot.saved.captureId);
    entries.push({ captureId: snapshot.saved.captureId, kind: "saved" });
  }

  for (const capture of snapshot.recoverable) {
    if (seen.has(capture.captureId)) {
      continue;
    }
    seen.add(capture.captureId);
    entries.push({ capture, kind: "recoverable" });
  }

  return entries;
}

function InboxRowShell({
  actions,
  meta,
  title,
}: {
  actions: ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <div className="group relative flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 hover:bg-accent/60">
      <p className="min-w-0 flex-1 truncate text-xs">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground"> · {meta}</span>
      </p>
      <div className={ACTION_REVEAL_CLASS}>{actions}</div>
    </div>
  );
}

function InboxSavedRow({
  captureId,
  onDiscard,
  onSave,
  snapshot,
}: {
  captureId: string;
  onDiscard: (captureId?: string, includeSaved?: boolean) => void;
  onSave: (captureId?: string) => void;
  snapshot: MeetingCaptureSnapshot;
}) {
  const workspaceSave = snapshot.workspaceSaves.find((item) => item.captureId === captureId);
  const title = workspaceSave ? WORKSPACE_SAVE_TITLE[workspaceSave.state] : "本地保存";
  const meta =
    workspaceSave?.error?.trim() ||
    (workspaceSave?.recoveryCopyDeleteAfter
      ? `${formatRecoveryDeadline(workspaceSave.recoveryCopyDeleteAfter)} 清理`
      : "待同步");

  return (
    <InboxRowShell
      actions={
        <>
          <Button
            className={ACTION_BTN_CLASS}
            nativeButton={false}
            render={<Link params={{ meetingId: captureId }} to="/meetings/$meetingId" />}
            size="sm"
            variant="outline"
          >
            打开
          </Button>
          {workspaceSave?.state === "action-required" ? (
            <Button className={ACTION_BTN_CLASS} onClick={() => onSave(captureId)} size="sm">
              重试
            </Button>
          ) : null}
          <Button
            className={ACTION_BTN_CLASS}
            onClick={() => onDiscard(captureId, true)}
            size="sm"
            variant="ghost"
          >
            清除
          </Button>
        </>
      }
      meta={meta}
      title={title}
    />
  );
}

function InboxRecoverableRow({
  capture,
  onDiscard,
  onSave,
}: {
  capture: RecoverableMeetingCapture;
  onDiscard: (captureId: string, includeSaved: boolean) => void;
  onSave: (captureId: string) => void;
}) {
  return (
    <InboxRowShell
      actions={
        <>
          <Button
            className={ACTION_BTN_CLASS}
            nativeButton={false}
            render={<Link params={{ meetingId: capture.captureId }} to="/meetings/$meetingId" />}
            size="sm"
            variant="outline"
          >
            打开
          </Button>
          {capture.recoveryCopyDeleteAfter ? null : (
            <Button
              className={ACTION_BTN_CLASS}
              onClick={() => onSave(capture.captureId)}
              size="sm"
            >
              保存
            </Button>
          )}
          <Button
            className={ACTION_BTN_CLASS}
            onClick={() => onDiscard(capture.captureId, capture.status === "saved-local")}
            size="sm"
            variant="ghost"
          >
            放弃
          </Button>
        </>
      }
      meta={recoveryMeta(capture)}
      title={recoveryTitle(capture)}
    />
  );
}

/**
 * Header inbox for local recording recovery / pending saves.
 * Header 收件箱：本地录音恢复与待处理保存。
 */
export function MeetingInboxMenu() {
  const { captureSnapshot, requestDiscard, saveRecording } = useMeetingRecording();
  const [open, setOpen] = useState(false);
  // Title-bar drag regions swallow clicks; suspend while open so outside click closes.
  useSuspendChromeDrag(open);
  const entries = collectInboxEntries(captureSnapshot);
  const count = entries.length;

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label={count > 0 ? `本地录音收件箱，${count} 项待处理` : "本地录音收件箱"}
        className={cn(chromeIconControlClassName, "relative")}
        onDoubleClick={(event) => event.stopPropagation()}
        style={noDragStyle}
      >
        <Icon className="size-4" icon="ph:tray" />
        {count > 0 ? (
          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1" sideOffset={6}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-[11px] text-muted-foreground">
            本地录音
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <p className="px-2 py-5 text-center text-muted-foreground text-xs">暂无待处理项</p>
        ) : (
          <div className="grid max-h-72 gap-px overflow-y-auto">
            {entries.map((entry) =>
              entry.kind === "saved" ? (
                <InboxSavedRow
                  captureId={entry.captureId}
                  key={`saved-${entry.captureId}`}
                  onDiscard={requestDiscard}
                  onSave={(captureId) => void saveRecording(captureId)}
                  snapshot={captureSnapshot}
                />
              ) : (
                <InboxRecoverableRow
                  capture={entry.capture}
                  key={`recoverable-${entry.capture.captureId}`}
                  onDiscard={requestDiscard}
                  onSave={(captureId) => void saveRecording(captureId)}
                />
              ),
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
