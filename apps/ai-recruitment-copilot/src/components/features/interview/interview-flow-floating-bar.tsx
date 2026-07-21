"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cossControlOverlayClass } from "@/components/ui/coss-style";
import { InterviewFlowStepper } from "./interview-flow-stepper";
import type { InterviewFlowStepId } from "./interview-flow-stepper";

const FLOATING_FLOW_GLASS_CLASS = `relative border border-border/40 bg-background/32 bg-clip-padding shadow-[0_18px_54px_-28px_rgb(0_0_0/0.45)] backdrop-blur-lg ${cossControlOverlayClass}`;

export function InterviewFlowFloatingBar({
  actions,
  currentStep,
  hasForms,
  onBack,
}: {
  actions: ReactNode;
  currentStep: InterviewFlowStepId;
  hasForms: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 flex justify-center sm:bottom-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div
        className={`pointer-events-auto w-fit max-w-[calc(100vw-2rem)] rounded-md p-1 ${FLOATING_FLOW_GLASS_CLASS}`}
      >
        <div className="px-3 pt-2 pb-1 md:hidden">
          <InterviewFlowStepper currentStep={currentStep} hasForms={hasForms} />
        </div>
        <div className="relative flex items-center gap-1">
          <div className={onBack ? "shrink-0" : "hidden"}>
            {onBack ? (
              <Button onClick={onBack} size="sm" type="button" variant="ghost">
                上一步
              </Button>
            ) : null}
          </div>
          <div className="hidden min-w-0 shrink-0 px-5 md:block">
            <InterviewFlowStepper currentStep={currentStep} hasForms={hasForms} />
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">{actions}</div>
        </div>
      </div>
    </div>
  );
}
