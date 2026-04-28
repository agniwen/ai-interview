import { Loader2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ToolbarFilterConfig =
  | { type: "search"; key: string; placeholder?: string; minWidth?: string }
  | {
      type: "select";
      key: string;
      placeholder?: string;
      options: { value: string; label: string }[];
    };

export interface ToolbarProps {
  filters?: ToolbarFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  searchLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  toolbarRight?: ReactNode;
  bulkActionsSlot?: ReactNode;
  dataTour?: {
    search?: string;
    filters?: Partial<Record<string, string>>;
    create?: string;
  };
}

export function Toolbar(props: ToolbarProps) {
  const {
    bulkActionsSlot,
    dataTour,
    filterValues,
    filters,
    onFilterChange,
    onRefresh,
    refreshing,
    searchLoading,
    toolbarRight,
  } = props;

  const hasFilters = filters && filters.length > 0;
  if (!hasFilters && !toolbarRight && !onRefresh && !bulkActionsSlot) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {hasFilters ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          {filters.map((filter) => {
            const value = filterValues?.[filter.key] ?? "";
            if (filter.type === "search") {
              return (
                <div
                  className="relative"
                  data-tour={dataTour?.search}
                  key={filter.key}
                  style={filter.minWidth ? { minWidth: filter.minWidth } : undefined}
                >
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pr-9 pl-9"
                    onChange={(event) => onFilterChange?.(filter.key, event.target.value)}
                    placeholder={filter.placeholder}
                    value={value}
                  />
                  {searchLoading ? (
                    <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
              );
            }
            return (
              <Select
                key={filter.key}
                onValueChange={(next) => onFilterChange?.(filter.key, next)}
                value={value}
              >
                <SelectTrigger
                  className="w-full sm:w-auto sm:min-w-45"
                  data-tour={dataTour?.filters?.[filter.key]}
                >
                  <SelectValue placeholder={filter.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {onRefresh ? (
          <Button
            className="shrink-0"
            disabled={refreshing}
            onClick={onRefresh}
            size="icon"
            variant="outline"
          >
            <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="sr-only">刷新</span>
          </Button>
        ) : null}
        {toolbarRight ? <div data-tour={dataTour?.create}>{toolbarRight}</div> : null}
        {bulkActionsSlot}
      </div>
    </div>
  );
}
