"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cossWhisperShadowClass } from "@/components/ui/coss-style";
import { InterviewFlowStepper } from "./interview-flow-stepper";
import type { InterviewFlowStepId } from "./interview-flow-stepper";

const FLOATING_FLOW_GLASS_CLASS = `relative border border-border/50 bg-background/80 bg-clip-padding backdrop-blur-lg ${cossWhisperShadowClass}`;

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
        className={`pointer-events-auto w-full max-w-[calc(100vw-2rem)] rounded-md p-1 md:w-fit ${FLOATING_FLOW_GLASS_CLASS}`}
      >
        <div className="flex justify-center px-3 pt-2 pb-2 md:hidden">
          <InterviewFlowStepper currentStep={currentStep} hasForms={hasForms} />
        </div>
        <div className="relative flex w-full items-center gap-1">
          {onBack ? (
            <div className="min-w-0 flex-1 md:flex-none md:shrink-0">
              <Button
                className="w-full md:w-auto"
                onClick={onBack}
                size="sm"
                type="button"
                variant="ghost"
              >
                上一步
              </Button>
            </div>
          ) : null}
          <div className="hidden min-w-0 shrink-0 px-5 md:block">
            <InterviewFlowStepper currentStep={currentStep} hasForms={hasForms} />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 [&>*]:min-w-0 [&>*]:flex-1 md:flex-none md:shrink-0 md:[&>*]:flex-none">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
