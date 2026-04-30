"use client";

import type { Announcements, DragEndEvent, ScreenReaderInstructions } from "@dnd-kit/core";
import type { ReactNode } from "react";
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  type DropAnimation,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Generic-ish sortable vertical list built on top of dnd-kit.
 *
 * Pattern: caller owns the array state and stable ids. This component handles
 * sensors + DndContext + SortableContext and delegates item rendering.
 *
 * Access drag state per-item via {@link SortableItem} and attach the
 * drag-handle props via {@link SortableDragHandle}. Listeners are scoped to
 * the handle (not the whole row), so inputs inside a row stay interactive.
 */

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: "按空格或回车开始拖动。移动时使用方向键，完成按空格/回车，取消按 Esc。",
};

function buildAnnouncements(total: number): Announcements {
  return {
    onDragStart({ active }) {
      return `开始拖动第 ${Number(active.data.current?.sortable?.index ?? 0) + 1} 项。`;
    },
    onDragOver({ active, over }) {
      if (!over) {
        return `第 ${Number(active.data.current?.sortable?.index ?? 0) + 1} 项不再悬停在可放置区域。`;
      }
      const toIndex = Number(over.data.current?.sortable?.index ?? 0) + 1;
      return `已悬停到第 ${toIndex} / ${total} 项。`;
    },
    onDragEnd({ active, over }) {
      if (!over) {
        return `拖动取消。`;
      }
      const fromIndex = Number(active.data.current?.sortable?.index ?? 0) + 1;
      const toIndex = Number(over.data.current?.sortable?.index ?? 0) + 1;
      return `已把第 ${fromIndex} 项放到第 ${toIndex} 位。`;
    },
    onDragCancel({ active }) {
      return `取消拖动第 ${Number(active.data.current?.sortable?.index ?? 0) + 1} 项。`;
    },
  };
}

const DROP_ANIMATION: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: "0.4" },
    },
  }),
};

interface SortableListProps {
  /**
   * Stable ids, one per item, in the visual order they should be rendered.
   * Must be unique and consistent across renders — reordering them via
   * `onReorder` is the whole point. Never pass array indices here.
   */
  ids: string[];
  /** Called with the source and destination indices when a drag completes. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /**
   * Optional overlay render for the drag preview. When provided, the active
   * item gets a visual replica floating under the cursor while the original
   * row goes translucent.
   */
  renderOverlay?: (activeId: string) => ReactNode;
  className?: string;
  children: ReactNode;
}

export function SortableList({
  ids,
  onReorder,
  renderOverlay,
  className,
  children,
}: SortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 6px of movement before drag starts — plain clicks, text selection
      // inside inputs, and touch scrolls over the row do not trigger drag.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1 || from === to) {
        return;
      }
      onReorder(from, to);
    },
    [ids, onReorder],
  );

  return (
    <DndContext
      accessibility={{
        announcements: buildAnnouncements(ids.length),
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2", className)}>{children}</div>
      </SortableContext>
      {renderOverlay ? (
        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeId ? renderOverlay(activeId) : null}
        </DragOverlay>
      ) : null}
    </DndContext>
  );
}

interface SortableItemRenderArgs {
  isDragging: boolean;
  /** Props for the drag-handle button. Spread onto the grip element only. */
  handleProps: {
    ref: (node: HTMLElement | null) => void;
    "aria-label": string;
    "aria-describedby"?: string;
    "aria-roledescription"?: string;
    role?: string;
    tabIndex?: number;
    onKeyDown?: React.KeyboardEventHandler;
    onPointerDown?: React.PointerEventHandler;
    style?: React.CSSProperties;
  };
}

interface SortableItemProps {
  id: string;
  /** Disable drag for this row (e.g. read-only state). */
  disabled?: boolean;
  className?: string;
  children: (args: SortableItemRenderArgs) => ReactNode;
}

function SortableItemImpl({ id, disabled, className, children }: SortableItemProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // While dragging, keep the row in layout but fade it — the overlay (if
    // any) shows the moving copy. Without a visual cue users lose track of
    // the source row.
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleProps: SortableItemRenderArgs["handleProps"] = {
    ref: setActivatorNodeRef,
    "aria-label": "拖动以排序",
    ...attributes,
    ...listeners,
    style: { cursor: disabled ? "not-allowed" : "grab", touchAction: "none" },
  };

  return (
    <div className={className} ref={setNodeRef} style={style}>
      {children({ handleProps, isDragging })}
    </div>
  );
}

/**
 * Memoized to prevent cascading re-renders across siblings while a drag is
 * in progress. Each item only updates when its `id`/`disabled` changes or
 * its children identity changes.
 */
export const SortableItem = memo(SortableItemImpl);
SortableItem.displayName = "SortableItem";

type SortableDragHandleProps = SortableItemRenderArgs["handleProps"] & {
  className?: string;
  /** Override the built-in grip icon. */
  children?: ReactNode;
};

/**
 * Pre-styled grip handle. Spread the `handleProps` from `SortableItem` onto
 * it. Uses `GripVerticalIcon` by default.
 */
export function SortableDragHandle({
  className,
  children,
  ...handleProps
}: SortableDragHandleProps) {
  return (
    <button
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      type="button"
      {...handleProps}
    >
      {children ?? <GripVerticalIcon className="size-4" />}
    </button>
  );
}
