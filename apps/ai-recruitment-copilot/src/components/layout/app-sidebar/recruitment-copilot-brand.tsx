import { useId } from "react";

import { cn } from "@arc/shared/utils";

const EYE_PATH =
  "M-9.3-11.3A9.3 9.3 0 0 1 0-20.6 9.3 9.3 0 0 1 9.3-11.3V11.3A9.3 9.3 0 0 1 0 20.6 9.3 9.3 0 0 1-9.3 11.3Z";

export function RecruitmentCopilotMark({ className }: { className?: string }) {
  const maskId = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 text-[#002FA7] dark:text-white", className)}
      data-slot="recruitment-copilot-mark"
      focusable="false"
      viewBox="-125 -125 250 250"
    >
      <defs>
        <mask height="316" id={maskId} maskUnits="userSpaceOnUse" width="316" x="-158" y="-158">
          <circle cx="0.19" cy="0.33" fill="white" r="100" />
          <path className="recruitment-copilot-eye-a" d={EYE_PATH} fill="black" />
          <path className="recruitment-copilot-eye-b" d={EYE_PATH} fill="black" />
        </mask>
      </defs>
      <circle className="fill-white dark:fill-background" cx="0.19" cy="0.33" r="100" />
      <rect
        fill="currentColor"
        height="316"
        mask={`url(#${maskId})`}
        width="316"
        x="-158"
        y="-158"
      />
      <style>{`
        .recruitment-copilot-eye-a,
        .recruitment-copilot-eye-b {
          transform-box: view-box;
          transform-origin: 0 0;
          animation-duration: 2.967s;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
          animation-direction: alternate;
        }
        .recruitment-copilot-eye-a {
          animation-name: recruitment-copilot-eye-a;
        }
        .recruitment-copilot-eye-b {
          animation-name: recruitment-copilot-eye-b;
        }
        @keyframes recruitment-copilot-eye-a {
          0%, 47% { transform: matrix(.86,-.32,.45,.84,23.09,-43.79); }
          49%, 51% { transform: matrix(.87,-.07,.44,.19,20.39,-42.58); }
          54%, 100% { transform: matrix(.87,-.33,.44,.86,23.78,-38.85); }
        }
        @keyframes recruitment-copilot-eye-b {
          0%, 47% { transform: matrix(.62,-.05,.45,.84,64.11,-54.11); }
          49%, 51% { transform: matrix(.64,-.01,.44,.19,62.38,-53.27); }
          54%, 100% { transform: matrix(.62,-.08,.44,.86,64.94,-50.11); }
        }
        @media (prefers-reduced-motion: reduce) {
          .recruitment-copilot-eye-a,
          .recruitment-copilot-eye-b {
            animation: none;
          }
          .recruitment-copilot-eye-a {
            transform: matrix(.86,-.32,.45,.84,23.09,-43.79);
          }
          .recruitment-copilot-eye-b {
            transform: matrix(.62,-.05,.45,.84,64.11,-54.11);
          }
        }
      `}</style>
    </svg>
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
