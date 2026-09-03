import { cn } from "@app/shared/utils";

interface TextareaCounterProps {
  className?: string;
  maxLength: number;
  value?: string | null;
}

function TextareaCounter({ className, maxLength, value }: TextareaCounterProps) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-2 bottom-2 rounded bg-background/85 px-1 text-[10px] text-muted-foreground leading-none",
        className,
      )}
    >
      {(value ?? "").length}/{maxLength}
    </span>
  );
}

export { TextareaCounter };
