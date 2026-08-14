import { cn } from "@mastra/playground-ui/utils/cn";
import { ChevronDownIcon, ChevronsDownIcon, ChevronsUpIcon, ChevronUpIcon } from "lucide-react";

interface ExperimentTraceTimelineExpandColProps {
  isSelected?: boolean;
  isFaded?: boolean;
  isExpanded?: boolean;
  toggleChildren?: () => void;
  expandAllDescendants?: () => void;
  totalDescendants?: number;
  allDescendantsExpanded?: boolean;
  numOfChildren?: number;
}

interface ExpandButtonProps {
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

function ExpandButton({ onClick, children, className }: ExpandButtonProps) {
  return (
    <button type="button" onClick={onClick} className={cn("h-full", className)}>
      <div
        className={cn(
          "flex items-center gap-[0.1rem] text-ui-sm text-neutral5 border border-border1 pl-2 pr-1 rounded-lg transition-all",
          "hover:text-yellow-500",
          "[&>svg]:shrink-0 [&>svg]:opacity-80 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:transition-all",
        )}
      >
        {children}
      </div>
    </button>
  );
}

function getExpandIcon(isExpanded?: boolean, allDescendantsExpanded?: boolean) {
  if (!isExpanded) {
    return <ChevronDownIcon />;
  }
  return allDescendantsExpanded ? <ChevronsUpIcon /> : <ChevronUpIcon />;
}

export function ExperimentTraceTimelineExpandCol({
  isSelected,
  isFaded,
  isExpanded,
  toggleChildren,
  expandAllDescendants,
  totalDescendants = 0,
  allDescendantsExpanded,
  numOfChildren,
}: ExperimentTraceTimelineExpandColProps) {
  return (
    <div
      className={cn("flex items-center justify-end h-full px-3", {
        "bg-surface4": isSelected,
        "opacity-30 [&:hover]:opacity-60": isFaded,
      })}
    >
      {numOfChildren && numOfChildren > 0 ? (
        <div className="flex gap-1">
          <ExpandButton onClick={() => toggleChildren?.()}>
            {allDescendantsExpanded ? totalDescendants : numOfChildren}{" "}
            {getExpandIcon(isExpanded, allDescendantsExpanded)}
          </ExpandButton>

          {totalDescendants > (numOfChildren ?? 0) && !allDescendantsExpanded && (
            <ExpandButton onClick={() => expandAllDescendants?.()}>
              {totalDescendants} <ChevronsDownIcon />
            </ExpandButton>
          )}
        </div>
      ) : null}
    </div>
  );
}
