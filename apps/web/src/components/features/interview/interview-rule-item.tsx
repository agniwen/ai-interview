import type { TablerIcon } from "@tabler/icons-react";

export function RuleItem({
  icon: Icon,
  title,
  description,
}: {
  icon: TablerIcon;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3 py-4 sm:gap-4 sm:py-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:size-4.5" />
      <div className="flex flex-col gap-1">
        <div className="font-medium text-sm sm:text-base">{title}</div>
        <p className="text-muted-foreground text-xs leading-normal sm:text-sm">{description}</p>
      </div>
    </li>
  );
}
