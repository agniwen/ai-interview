import { cn } from "@app/shared/utils";

export function RecruitmentCopilotMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block shrink-0 bg-[url('/favicon-light.ico')] bg-center bg-contain bg-no-repeat dark:bg-[url('/favicon-dark.ico')]",
        className,
      )}
      data-slot="recruitment-copilot-mark"
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
      <RecruitmentCopilotMark className="size-6 transition-[width,height] duration-200 ease-linear group-data-[collapsible=icon]:size-7 motion-reduce:transition-none" />
      <span className="max-w-48 min-w-0 overflow-hidden whitespace-nowrap font-semibold text-[15px] leading-tight tracking-tight opacity-100 transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
        AI Hiring Copilot
      </span>
    </div>
  );
}
