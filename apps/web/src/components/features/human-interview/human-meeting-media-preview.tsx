import { VideoTrack } from "@livekit/components-react";
import type { TrackReference, TrackReferenceOrPlaceholder } from "@livekit/components-react";
import {
  IconArrowsDiagonal2,
  IconDeviceDesktopUp,
  IconGripHorizontal,
  IconMaximize,
} from "@tabler/icons-react";
import { Track } from "livekit-client";
import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

const MIN_WIDTH = 168;
const MAX_WIDTH = 480;
const ARROW_STEP = 16;
const KEY_DELTAS = new Map([
  ["ArrowDown", { x: 0, y: ARROW_STEP }],
  ["ArrowLeft", { x: -ARROW_STEP, y: 0 }],
  ["ArrowRight", { x: ARROW_STEP, y: 0 }],
  ["ArrowUp", { x: 0, y: -ARROW_STEP }],
]);
const handleClassName =
  "flex h-8 touch-none select-none items-center rounded-md text-xs hover:bg-component focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

interface Point {
  x: number;
  y: number;
}

interface PreviewGeometry {
  boundsWidth: number;
  heightTravel: number;
  widthTravel: number;
  width: number;
}

type PreviewAction = "move" | "resize";

interface PreviewGesture {
  action: PreviewAction;
  geometry: PreviewGeometry;
  origin: Point;
  pointerId: number;
  position: Point;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isScreenShare(track: TrackReferenceOrPlaceholder) {
  return track.source === Track.Source.ScreenShare;
}

function previewTracks(tracks: TrackReferenceOrPlaceholder[]) {
  return tracks
    .filter((track): track is TrackReference =>
      Boolean(track.publication && !track.publication.isMuted),
    )
    .toSorted((first, second) => Number(isScreenShare(second)) - Number(isScreenShare(first)));
}

export function HumanMeetingMediaPreview({
  active,
  onReturnToMeeting,
  tracks,
}: {
  active: boolean;
  onReturnToMeeting: () => void;
  tracks: TrackReferenceOrPlaceholder[];
}) {
  const [position, setPosition] = useState<Point>({ x: 1, y: 1 });
  const [width, setWidth] = useState<number>();
  const boundsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const gestureRef = useRef<PreviewGesture | null>(null);
  const videos = active ? previewTracks(tracks) : [];
  if (videos.length === 0) {
    return null;
  }

  function readGeometry(): PreviewGeometry | null {
    const bounds = boundsRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    return bounds && panel
      ? {
          boundsWidth: bounds.width,
          heightTravel: bounds.height - panel.height,
          width: panel.width,
          widthTravel: bounds.width - panel.width,
        }
      : null;
  }

  function adjust(action: PreviewAction, geometry: PreviewGeometry, start: Point, delta: Point) {
    if (action === "resize") {
      const maximum = Math.min(MAX_WIDTH, geometry.boundsWidth);
      const diagonalDelta = (delta.x + delta.y) / 2;
      setWidth(clamp(geometry.width - diagonalDelta, Math.min(MIN_WIDTH, maximum), maximum));
      return;
    }
    setPosition({
      x: clamp(start.x + delta.x / Math.max(1, geometry.widthTravel), 0, 1),
      y: clamp(start.y + delta.y / Math.max(1, geometry.heightTravel), 0, 1),
    });
  }

  function startGesture(event: PointerEvent<HTMLButtonElement>, action: PreviewAction) {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    const geometry = readGeometry();
    if (geometry) {
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        action,
        geometry,
        origin: { x: event.clientX, y: event.clientY },
        pointerId: event.pointerId,
        position,
      };
    }
  }

  function moveGesture(event: PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (gesture?.pointerId === event.pointerId) {
      adjust(gesture.action, gesture.geometry, gesture.position, {
        x: event.clientX - gesture.origin.x,
        y: event.clientY - gesture.origin.y,
      });
    }
  }

  function endGesture(event: PointerEvent<HTMLButtonElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
    }
  }

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, action: PreviewAction) {
    const delta = KEY_DELTAS.get(event.key);
    const geometry = delta && readGeometry();
    if (delta && geometry) {
      event.preventDefault();
      adjust(
        action,
        geometry,
        position,
        action === "resize" ? { x: delta.x || delta.y, y: delta.x || delta.y } : delta,
      );
    }
  }

  const gestureHandlers = {
    onLostPointerCapture: endGesture,
    onPointerCancel: endGesture,
    onPointerMove: moveGesture,
    onPointerUp: endGesture,
  };

  // Use the available travel as the anchor, so the panel stays in bounds as its height changes.
  const left = position.x * 100;
  const top = position.y * 100;
  return (
    <div
      ref={boundsRef}
      className="pointer-events-none absolute inset-3 z-20 [container-type:size]"
    >
      <aside
        aria-label="会议画面预览"
        ref={panelRef}
        className="pointer-events-auto absolute flex max-h-[72%] w-[min(18rem,64cqw)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-large"
        style={{
          left: `${left}%`,
          maxWidth: "min(100%, max(0px, calc((72cqh - 2.75rem) * 16 / 9)))",
          top: `${top}%`,
          translate: `${-left}% ${-top}%`,
          width,
        }}
      >
        <div className="flex shrink-0 items-center gap-0.5 px-1 py-0.5">
          <button
            {...gestureHandlers}
            aria-label="调整预览大小"
            className={`${handleClassName} w-8 shrink-0 cursor-nwse-resize justify-center`}
            onKeyDown={(event) => handleKeys(event, "resize")}
            onPointerDown={(event) => startGesture(event, "resize")}
            title="拖动或用方向键调整大小"
            type="button"
          >
            <IconArrowsDiagonal2 aria-hidden="true" className="size-4" />
          </button>
          <button
            {...gestureHandlers}
            aria-label="移动会议画面预览"
            className={`${handleClassName} min-w-0 flex-1 cursor-grab justify-center gap-1 active:cursor-grabbing`}
            onKeyDown={(event) => handleKeys(event, "move")}
            onPointerDown={(event) => startGesture(event, "move")}
            title="拖动或用方向键移动"
            type="button"
          >
            <IconGripHorizontal
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate">会议画面</span>
          </button>
          <button
            aria-label="返回会议视图"
            className={`${handleClassName} w-8 shrink-0 justify-center`}
            onClick={onReturnToMeeting}
            title="返回会议视图"
            type="button"
          >
            <IconMaximize aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain px-1 pb-1">
          {videos.map((track) => {
            const shared = isScreenShare(track);
            const name = track.participant.name || track.participant.identity;
            return (
              <figure
                aria-label={`${name}的${shared ? "共享屏幕" : "摄像头"}`}
                className="relative aspect-video shrink-0 overflow-hidden rounded-lg bg-black"
                key={track.publication.trackSid}
              >
                <VideoTrack
                  className={shared ? "size-full object-contain" : "size-full object-cover"}
                  trackRef={track}
                />
                <figcaption className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-sm bg-black/75 px-1.5 py-0.5 text-white text-xs">
                  {shared ? (
                    <IconDeviceDesktopUp aria-hidden="true" className="size-3.5 shrink-0" />
                  ) : null}
                  <span className="truncate">
                    {name}
                    {shared ? " · 共享屏幕" : ""}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
