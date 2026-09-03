import { cn } from "@app/shared/utils";

export type InterviewFlowStepId = "preparation" | "forms" | "interview";

interface InterviewFlowStep {
  description: string;
  id: InterviewFlowStepId;
  label: string;
}

export function buildInterviewFlowSteps(hasForms: boolean): InterviewFlowStep[] {
  return [
    {
      description: "了解岗位与面试安排",
      id: "preparation",
      label: "面试准备",
    },
    ...(hasForms
      ? [
          {
            description: "补充本次面试需要的信息",
            id: "forms" as const,
            label: "填写信息",
          },
        ]
      : []),
    {
      description: "与 AI 面试官实时交流",
      id: "interview",
      label: "AI 面试",
    },
  ];
}

export function InterviewFlowStepper({
  currentStep,
  hasForms,
}: {
  currentStep: InterviewFlowStepId;
  hasForms: boolean;
}) {
  const steps = buildInterviewFlowSteps(hasForms);
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="面试流程" className="w-max max-w-full">
      <ol className="flex items-center justify-center">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-w-0 shrink-0 items-center"
              key={step.id}
            >
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 h-px w-6 shrink-0 transition-colors duration-200 motion-reduce:transition-none sm:mx-3 sm:w-10",
                    index <= currentIndex ? "bg-primary/30" : "bg-border",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "truncate text-[11px] transition-colors duration-200 motion-reduce:transition-none sm:text-xs",
                  isCurrent && "font-medium text-foreground",
                  isCompleted && "text-foreground/60",
                  !isCurrent && !isCompleted && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
