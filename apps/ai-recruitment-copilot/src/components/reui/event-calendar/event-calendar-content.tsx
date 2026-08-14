"use client";

import type { ComponentType, ReactNode } from "react";
import {
  useEventCalendarSelector,
  useEventCalendarViewConfig,
} from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarAgendaView } from "@/components/reui/event-calendar/event-calendar-agenda-view";
import { EventCalendarMonthView } from "@/components/reui/event-calendar/event-calendar-month-view";
import { EventCalendarResourceView } from "@/components/reui/event-calendar/event-calendar-resource-view";
import {
  EventCalendarDaysView,
  EventCalendarDayView,
  EventCalendarWeekView,
} from "@/components/reui/event-calendar/event-calendar-time-grid";
import type { CalendarView } from "@/components/reui/event-calendar/event-calendar-types";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "@arc/shared/utils";

const DEFAULT_VIEW_COMPONENTS: Record<CalendarView, ComponentType> = {
  agenda: EventCalendarAgendaView,
  day: EventCalendarDayView,
  days: EventCalendarDaysView,
  month: EventCalendarMonthView,
  resource: EventCalendarResourceView,
  week: EventCalendarWeekView,
};

interface EventCalendarContentProps extends Omit<useRender.ComponentProps<"div">, "children"> {
  /** Swap individual view implementations. */
  components?: Partial<Record<CalendarView, ComponentType>>;
  /** Replaces the switchboard entirely; read useEventCalendarView() inside. */
  children?: ReactNode;
}

function EventCalendarContent({
  className,
  render,
  components,
  children,
  ...props
}: EventCalendarContentProps) {
  const viewConfig = useEventCalendarViewConfig();
  const view = useEventCalendarSelector((state) => state.view);
  const loading = useEventCalendarSelector((state) => state.loading);

  const resolved = {
    ...DEFAULT_VIEW_COMPONENTS,
    ...viewConfig.components,
    ...components,
  };
  const ActiveView = resolved[view];

  const defaultProps = {
    children: children ?? <ActiveView />,
    className: cn(
      "relative flex min-h-0 min-w-0 flex-1 flex-col",
      "data-loading:pointer-events-none data-loading:opacity-60",
      viewConfig.classNames?.content,
      className,
    ),
    "data-loading": loading || undefined,
    "data-slot": "event-calendar-content",
    "data-view": view,
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export { DEFAULT_VIEW_COMPONENTS, EventCalendarContent };
export type { EventCalendarContentProps };
