import { cn } from "@app/shared/utils";

interface ModernArtworkProps {
  className: string;
  dataAttributes: Record<`data-${string}`, string>;
}

export function ModernArtwork({ className, dataAttributes }: ModernArtworkProps) {
  return <div {...dataAttributes} aria-hidden="true" className={cn("hiring-artwork", className)} />;
}
