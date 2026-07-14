import { CommandItem } from "@mastra/playground-ui/components/Command";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/components/features/mastra-studio/upstream/lib/utils";

type NavigationCommandItemProps = Omit<ComponentProps<typeof CommandItem>, "children"> & {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  path?: string;
  badge?: string;
  shortcut?: ReactNode;
};

const resultIconClassName =
  "mt-0.5 flex size-4 min-w-4 max-w-4 basis-4 shrink-0 items-center justify-center text-neutral3 transition-colors duration-150 ease-out group-data-[selected=true]:text-neutral6 [&>svg]:!size-4 [&>svg]:shrink-0";

const CommandPath = ({ children }: { children: ReactNode }) => (
  <span className="max-w-[13rem] truncate rounded-md border border-border1 bg-surface4/70 px-1.5 py-0.5 font-mono text-[10px] leading-none text-neutral3">
    {children}
  </span>
);

export const NavigationCommandItem = ({
  icon,
  title,
  subtitle,
  path,
  badge,
  shortcut,
  className,
  ...props
}: NavigationCommandItemProps) => (
  <CommandItem
    className={cn(
      "group h-auto items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 data-[selected=true]:border-border1 data-[selected=true]:bg-surface4/80",
      "transition-[background-color,border-color] duration-150 ease-out",
      className,
    )}
    {...props}
  >
    <span className={resultIconClassName}>{icon}</span>
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-ui-smd font-medium leading-ui-sm text-neutral6">
          {title}
        </span>
        {badge ? (
          <span className="shrink-0 rounded-md border border-border1 bg-surface4/60 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none text-neutral3">
            {badge}
          </span>
        ) : null}
      </span>
      {subtitle || path ? (
        <span className="flex min-w-0 items-center gap-2 text-ui-xs leading-ui-xs text-neutral3">
          {subtitle ? <span className="truncate">{subtitle}</span> : null}
          {path ? <CommandPath>{path}</CommandPath> : null}
        </span>
      ) : null}
    </span>
    {shortcut}
  </CommandItem>
);
