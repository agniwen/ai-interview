import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@app/shared/utils";

export type InterviewFlowStepId = "preparation" | "forms" | "interview";

interface InterviewFlowStep {
  id: InterviewFlowStepId;
  label: string;
}

export function buildInterviewFlowSteps(hasForms: boolean): InterviewFlowStep[] {
  return [
    { id: "preparation", label: "了解面试" },
    ...(hasForms ? [{ id: "forms" as const, label: "填写信息" }] : []),
    { id: "interview", label: "开始面试" },
  ];
}

/** Segmented pill of steps; the current one is tinted, unfinished ones show a ring, finished a check. */
export function InterviewFlowProgress({
  className,
  currentStep,
  hasForms,
}: {
  className?: string;
  currentStep: InterviewFlowStepId;
  hasForms: boolean;
}) {
  const steps = buildInterviewFlowSteps(hasForms);
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="面试流程" className={className}>
      <ol className="inline-flex items-center gap-0.5 rounded-full border border-transparent bg-card p-1 shadow-default">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-center gap-0.5"
              key={step.id}
            >
              {index > 0 ? (
                <IconChevronRight aria-hidden className="size-3 text-foreground/25" />
              ) : null}
              <span
                className={cn(
                  "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs transition-colors duration-200 motion-reduce:transition-none",
                  isCurrent && "bg-component font-medium text-foreground",
                  isCompleted && "text-foreground/70",
                  !isCurrent && !isCompleted && "text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <IconCheck aria-hidden className="size-3.5 text-green" />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "size-3 shrink-0 rounded-full border-[1.5px]",
                      isCurrent ? "border-foreground/45" : "border-foreground/25",
                    )}
                  />
                )}
                {step.label}
                {isCompleted ? <span className="sr-only">（已完成）</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
