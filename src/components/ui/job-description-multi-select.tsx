"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface JobDescriptionOption {
  id: string;
  name: string;
}

// 在招岗位多选下拉，复用面试官选择器的同款交互。
// Multi-select dropdown for job descriptions; mirrors the interviewer picker UX.
export function JobDescriptionMultiSelect({
  value,
  onChange,
  options,
  invalid,
  placeholder = "选择岗位…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: JobDescriptionOption[];
  invalid?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedItems = useMemo(
    () => options.filter((item) => selectedSet.has(item.id)),
    [options, selectedSet],
  );

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string) {
    onChange(value.filter((item) => item !== id));
  }

  return (
    <div className="space-y-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:bg-input/30",
            )}
            data-invalid={invalid ? true : undefined}
            type="button"
          >
            <span className={selectedItems.length === 0 ? "text-muted-foreground" : ""}>
              {selectedItems.length === 0 ? placeholder : `已选 ${selectedItems.length} 个岗位`}
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="搜索岗位…" />
            <CommandList>
              <CommandEmpty>没有匹配的岗位</CommandEmpty>
              <CommandGroup>
                {options.map((item) => {
                  const isSelected = selectedSet.has(item.id);
                  return (
                    <CommandItem key={item.id} onSelect={() => toggle(item.id)} value={item.name}>
                      <CheckIcon
                        className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{item.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge className="gap-1 pr-0.5" key={item.id} variant="secondary">
              {item.name}
              <button
                aria-label={`移除 ${item.name}`}
                className="inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:bg-background/70 hover:opacity-100"
                onClick={() => remove(item.id)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
