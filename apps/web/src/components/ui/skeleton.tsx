import { cn } from "@arc/shared/utils";

function Skeleton({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "subtle" }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md",
        variant === "subtle" ? "bg-muted/50" : "bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
