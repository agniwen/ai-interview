import { Chip } from "@mastra/playground-ui/components/Chip";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

interface ScoreDeltaProps {
  /** Difference between scores (B - A) */
  delta: number;
}

/**
 * Visual indicator for score difference between runs.
 * Shows arrow direction and delta value in neutral color.
 */
export function ScoreDelta({ delta }: ScoreDeltaProps) {
  let arrow = null;
  let sign = "";
  if (delta > 0) {
    arrow = (
      <Chip size="small" color="green" intensity="muted">
        <ArrowUpIcon />
      </Chip>
    );
    sign = "+ ";
  } else if (delta < 0) {
    arrow = (
      <Chip size="small" color="red" intensity="muted">
        <ArrowDownIcon />
      </Chip>
    );
    sign = "- ";
  }

  return (
    <span className={cn("font-mono text-sm text-neutral4 min-w-20")}>
      <span className="w-3 inline-block">{sign}</span>
      {Math.abs(delta).toFixed(2)}&nbsp;{arrow}
    </span>
  );
}
