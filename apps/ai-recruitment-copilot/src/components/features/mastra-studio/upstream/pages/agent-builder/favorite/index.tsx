import type { ListStoredAgentsParams, StoredSkillResponse } from "@mastra/client-js";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { PageHeader } from "@mastra/playground-ui/components/PageHeader";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { SparklesIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "@/components/features/mastra-studio/router/compat";
import {
  AgentBuilderList,
  AgentBuilderListSkeleton,
} from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/agent-list/agent-builder-list";
import {
  SkillBuilderList,
  SkillBuilderListSkeleton,
} from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/skill-list/skill-builder-list";
import { useBuilderAgentFeatures } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-features";
import { useStoredAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { useStoredSkills } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-skills";
import { useCurrentUser } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-current-user";

type Tab = "agents" | "skills";

const renderError = (error: Error, resource: string) => {
  if (is401UnauthorizedError(error)) {
    return (
      <div className="flex items-center justify-center pt-10">
        <SessionExpired />
      </div>
    );
  }
  if (is403ForbiddenError(error)) {
    return (
      <div className="flex items-center justify-center pt-10">
        <PermissionDenied resource={resource} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center pt-10">
      <ErrorState title={`加载收藏的${resource}失败`} message={error.message} />
    </div>
  );
};

export default function AgentBuilderFavoritePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("agents");
  const features = useBuilderAgentFeatures();
  const { data: currentUser } = useCurrentUser();

  const handleSkillClick = (skill: StoredSkillResponse) => {
    const isOwner = !skill.authorId || currentUser?.id === skill.authorId;
    const destination = isOwner ? "edit" : "view";
    void navigate(`/agent-builder/skills/${skill.id}/${destination}`, { viewTransition: true });
  };

  const agentListParams = useMemo<ListStoredAgentsParams>(
    () => ({
      favoritedOnly: true,
      orderBy: { direction: "DESC", field: "updatedAt" },
    }),
    [],
  );

  const {
    data: agentsData,
    isLoading: agentsLoading,
    error: agentsError,
  } = useStoredAgents(agentListParams);
  const {
    data: skillsData,
    isLoading: skillsLoading,
    error: skillsError,
  } = useStoredSkills({ enabled: tab === "skills" && features.skills });

  const agents = agentsData?.agents ?? [];
  const skills = skillsData?.skills ?? [];

  const body = (() => {
    if (tab === "agents") {
      if (agentsLoading) {
        return <AgentBuilderListSkeleton rowTestId="favorite-skeleton-row" />;
      }
      if (agentsError) {
        return renderError(agentsError, "智能体");
      }
      if (agents.length === 0) {
        return (
          <div className="flex items-center justify-center pt-16">
            <EmptyState
              iconSlot={<StarIcon className="h-8 w-8 text-neutral3" />}
              titleSlot="暂无收藏的智能体"
              descriptionSlot="为智能体添加星标，即可在此快速访问。"
            />
          </div>
        );
      }
      return <AgentBuilderList agents={agents} search={search} rowTestId="favorite-agent-row" />;
    }

    // Skills tab
    if (skillsLoading) {
      return <SkillBuilderListSkeleton />;
    }
    if (skillsError) {
      return renderError(skillsError, "技能");
    }
    if (skills.length === 0) {
      return (
        <div className="flex items-center justify-center pt-16">
          <EmptyState
            iconSlot={<SparklesIcon className="h-8 w-8 text-neutral3" />}
            titleSlot="暂无收藏的技能"
            descriptionSlot="为技能添加星标，即可在此快速访问。"
          />
        </div>
      );
    }
    return <SkillBuilderList skills={skills} search={search} onSkillClick={handleSkillClick} />;
  })();

  return (
    <>
      <PageLayout className="px-4 md:px-10">
        <PageLayout.TopArea>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
            <PageHeader>
              <PageHeader.Title>
                <StarIcon /> 收藏
              </PageHeader.Title>
              <PageHeader.Description>
                {tab === "agents"
                  ? "你在智能体构建器中收藏的智能体。"
                  : "你在智能体构建器中收藏的技能。"}
              </PageHeader.Description>
            </PageHeader>
          </div>
          <div className="flex items-center gap-4">
            {features.skills && (
              <div className="flex rounded-lg border border-border1 overflow-hidden">
                <button
                  onClick={() => setTab("agents")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === "agents"
                      ? "bg-surface4 text-neutral6"
                      : "bg-surface2 text-neutral3 hover:text-neutral5"
                  }`}
                >
                  智能体
                </button>
                <button
                  onClick={() => setTab("skills")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === "skills"
                      ? "bg-surface4 text-neutral6"
                      : "bg-surface2 text-neutral3 hover:text-neutral5"
                  }`}
                >
                  技能
                </button>
              </div>
            )}
            <div className="flex-1 max-w-120">
              <ListSearch onSearch={setSearch} label="筛选收藏" placeholder="按名称或描述筛选" />
            </div>
          </div>
        </PageLayout.TopArea>

        {body}
      </PageLayout>
    </>
  );
}
