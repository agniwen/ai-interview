import { useStoredAgentDependents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";

const MAX_DEPENDENTS_SHOWN = 5;

type Variant = "delete" | "make-private";

const COPY: Record<
  Variant,
  {
    dependents: string;
    hidden: (n: number) => string;
  }
> = {
  delete: {
    dependents: "此智能体被以下智能体用作子智能体：",
    hidden: (n) => `另有 ${n} 个私有智能体也引用了此智能体。`,
  },
  "make-private": {
    dependents: "将此智能体设为私有可能导致以下使用它作为子智能体的智能体无法正常工作：",
    hidden: (n) => `另有 ${n} 个私有智能体也引用了此智能体，可能会停止工作。`,
  },
};

interface AgentImpactWarningsProps {
  agentId: string;
  variant: Variant;
  enabled?: boolean;
}

export const AgentImpactWarnings = ({
  agentId,
  variant,
  enabled = true,
}: AgentImpactWarningsProps) => {
  const { data, isLoading, isError } = useStoredAgentDependents(agentId, { enabled });

  if (!enabled || isLoading || isError) {
    return null;
  }

  const dependents = data?.dependents ?? [];
  const hiddenCount = data?.hiddenCount ?? 0;

  if (dependents.length === 0 && hiddenCount === 0) {
    return null;
  }

  const copy = COPY[variant];
  const visible = dependents.slice(0, MAX_DEPENDENTS_SHOWN);
  const overflow = dependents.length - visible.length;

  return (
    <div data-testid="agent-impact-warnings" className="text-ui-sm text-neutral3">
      {dependents.length > 0 && (
        <div data-testid="agent-impact-dependents-warning">
          <p className="font-medium">{copy.dependents}</p>
          <ul className="mt-1 list-disc pl-5">
            {visible.map((dep) => (
              <li key={dep.id} data-testid="agent-impact-dependent">
                {dep.name}
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <p data-testid="agent-impact-dependents-more" className="mt-1 text-icon-3">
              以及另外 {overflow} 个
            </p>
          )}
        </div>
      )}
      {hiddenCount > 0 && (
        <p
          data-testid="agent-impact-hidden-warning"
          className={dependents.length > 0 ? "mt-2" : ""}
        >
          {copy.hidden(hiddenCount)}
        </p>
      )}
    </div>
  );
};
