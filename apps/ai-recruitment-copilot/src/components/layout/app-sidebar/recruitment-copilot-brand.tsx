import type { CSSProperties } from "react";

import { cn } from "@arc/shared/utils";
import { Blobatar } from "blobatar/react";
import "blobatar/motion.css";

const BRAND_BLOBATAR_PALETTE = {
  eye: "#ffffff",
  head: "#002FA7",
};
type BrandBlobatarStyle = CSSProperties & {
  "--mo-eye": string;
  "--mo-head": string;
};
const BRAND_BLOBATAR_STYLE: BrandBlobatarStyle = {
  "--mo-eye": "var(--background)",
  "--mo-head": "currentColor",
};
const BRAND_BLOBATAR_TRAITS = {
  "body.n": 0.999,
  "body.r": 0.38,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Blobatar's public round-trait key is named "shape".
  shape: 0.11,
};

export function RecruitmentCopilotMark({ className }: { className?: string }) {
  return (
    <Blobatar
      animate="hover"
      className={cn("shrink-0 text-[#002FA7] dark:text-white", className)}
      data-slot="recruitment-copilot-mark"
      name="alain00"
      palette={BRAND_BLOBATAR_PALETTE}
      style={BRAND_BLOBATAR_STYLE}
      traits={BRAND_BLOBATAR_TRAITS}
    />
  );
}

export function RecruitmentCopilotBrand({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center gap-2.5 px-1 transition-[height,gap,padding] duration-200 ease-linear group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0 motion-reduce:transition-none",
        className,
      )}
      data-slot="recruitment-copilot-brand"
    >
      <RecruitmentCopilotMark className="size-8 transition-[width,height] duration-200 ease-linear group-data-[collapsible=icon]:size-7 motion-reduce:transition-none" />
      <span className="max-w-48 min-w-0 overflow-hidden whitespace-nowrap font-semibold text-[15px] leading-tight tracking-tight opacity-100 transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
        AI Recruitment Copilot
      </span>
    </div>
  );
}
