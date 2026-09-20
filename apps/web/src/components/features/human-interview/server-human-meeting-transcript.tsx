import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { ReactNode, Ref } from "react";
import { z } from "zod";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { RemoteParticipant, DataPacket_Kind } from "livekit-client";
import {
  HUMAN_TRANSCRIPTION_PREVIEW_TOPIC,
  humanTranscriptionEventSchema,
} from "@app/shared/human-transcription";
import type { HumanTranscriptionEvent } from "@app/shared/human-transcription";
import {
  readTranscriptPreview,
  receiveTranscriptPreview,
  visibleTranscriptRows,
} from "./human-meeting-transcript-preview";
import type {
  TimedTranscriptPreview,
  TranscriptPreviewScope,
} from "./human-meeting-transcript-preview";
import type { HumanMeetingLiveTranscriptHandle } from "./human-meeting-live-transcript";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
const scopeSchema = z.object({
  executionId: z.string().nullable(),
  generation: z.number().int().positive().nullable(),
  runId: z.string().nullable(),
});
const metadataSchema = scopeSchema.extend({
  participants: z.record(
    z.string(),
    z.object({ displayName: z.string(), role: z.enum(["candidate", "interviewer"]) }),
  ),
});
const updateSchema = scopeSchema.extend({
  error: z.string().nullable(),
  events: z.array(humanTranscriptionEventSchema),
  status: z.string(),
});

export function ServerHumanMeetingTranscript({
  inviteToken,
  ref,
  renderPanel,
}: {
  renderPanel?: (panel: ReactNode) => ReactNode;
  inviteToken: string;
  ref?: Ref<HumanMeetingLiveTranscriptHandle>;
}) {
  const room = useRoomContext();
  const [events, setEvents] = useState<HumanTranscriptionEvent[]>([]);
  const [previews, setPreviews] = useState<TimedTranscriptPreview[]>([]);
  const [scope, setScope] = useState<TranscriptPreviewScope>({
    executionId: null,
    generation: null,
    runId: null,
  });
  const [now, setNow] = useState(Date.now);
  const [participants, setParticipants] = useState<z.infer<typeof metadataSchema>["participants"]>(
    {},
  );
  const [status, setStatus] = useState("正在连接服务端字幕…");
  useImperativeHandle(ref, () => ({ flush: () => Promise.resolve() }), []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    function receive(
      payload: Uint8Array,
      sender?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string,
    ) {
      if (topic !== HUMAN_TRANSCRIPTION_PREVIEW_TOPIC) {
        return;
      }
      const packet = readTranscriptPreview(payload, sender?.isAgent === true, scope, participants);
      if (!packet) {
        return;
      }
      const receivedAt = Date.now();
      setNow(receivedAt);
      setPreviews((previous) => receiveTranscriptPreview(previous, packet, receivedAt));
    }
    function resetPreview() {
      setPreviews([]);
    }
    room.on(RoomEvent.DataReceived, receive);
    room.on(RoomEvent.Reconnecting, resetPreview);
    room.on(RoomEvent.Disconnected, resetPreview);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
      room.off(RoomEvent.Reconnecting, resetPreview);
      room.off(RoomEvent.Disconnected, resetPreview);
    };
  }, [room, scope, participants]);
  useEffect(() => {
    const abort = new AbortController();
    let source: EventSource | undefined;
    const path = `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/server-transcript`;
    async function connect() {
      try {
        const response = await fetch(path, { signal: abort.signal });
        if (!response.ok) {
          throw new Error("无法读取字幕");
        }
        const metadata = metadataSchema.parse(await response.json());
        if (abort.signal.aborted) {
          return;
        }
        setParticipants(metadata.participants);
        setScope(metadata);
        setEvents([]);
        setPreviews([]);
        source = new EventSource(`${path}?stream=1`);
        source.addEventListener("message", (event) => {
          let decoded: unknown;
          try {
            decoded = JSON.parse(event.data);
          } catch {
            return;
          }
          const parsed = updateSchema.safeParse(decoded);
          if (!parsed.success) {
            return;
          }
          const update = parsed.data;
          setScope(update);
          setEvents((previous) => {
            const known = new Set(previous.map((item) => item.eventId));
            return [...previous, ...update.events.filter((item) => !known.has(item.eventId))];
          });
          const labels = new Map<string, string>(
            Object.entries({
              capturing: "实时字幕已连接 · 自动保存",
              finalizing: "正在保存最后的发言",
              needs_review: "转录需要复核",
              pending: "正在准备采集",
              ready: "转录已保存",
            }),
          );
          setStatus(update.error ?? labels.get(update.status) ?? "正在连接");
          if (
            ["ready", "needs_review", "failed"].includes(update.status) &&
            update.events.length < 100
          ) {
            setScope({ ...update, executionId: null });
            setPreviews([]);
            source?.close();
          }
        });
        source.addEventListener("error", () => setStatus("字幕连接恢复中，服务端继续保存…"));
      } catch {
        if (!abort.signal.aborted) {
          setStatus("字幕暂不可用，服务端继续采集");
        }
      }
    }
    void connect();
    return () => {
      abort.abort();
      source?.close();
    };
  }, [inviteToken]);
  const rows = useMemo(
    () => visibleTranscriptRows(events, previews, scope, participants, now),
    [events, previews, scope, participants, now],
  );
  const panel = (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4"
      aria-label="实时字幕"
    >
      <output className="text-xs text-muted-foreground">{status}</output>
      <MessageScrollerProvider autoScroll key={inviteToken}>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3" aria-live="off">
              {rows.map(({ event, key, displayName, pending }) => (
                <MessageScrollerItem key={key} messageId={key}>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {displayName}
                      {pending && event.kind === "interim" && " · 正在识别"}
                      {pending && event.kind === "final" && " · 正在保存"}
                    </p>
                    <p className="text-sm leading-6">{event.text}</p>
                  </div>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label="回到最新字幕" />
        </MessageScroller>
      </MessageScrollerProvider>
    </section>
  );
  return renderPanel ? renderPanel(panel) : panel;
}
