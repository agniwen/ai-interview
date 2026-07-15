import type { ListStoredAgentsParams } from "@mastra/client-js";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { PageHeader } from "@mastra/playground-ui/components/PageHeader";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { LibraryIcon, SparklesIcon } from "lucide-react";
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
import { useBuilderAgentAccess } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-access";
import { useBuilderAgentFeatures } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-features";
import { useStoredAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { useStoredSkills } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-skills";

type Tab = "agents" | "skills";

export default function AgentBuilderLibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("agents");
  const features = useBuilderAgentFeatures();
  const { canUseFavorites } = useBuilderAgentAccess();

  const agentListParams = useMemo<ListStoredAgentsParams>(() => ({ visibility: "public" }), []);

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

  const renderError = (error: Error) => {
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
          <PermissionDenied resource={tab === "agents" ? "智能体" : "技能"} />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center pt-10">
        <ErrorState title="加载资源库失败" message={error.message} />
      </div>
    );
  };

  const body = (() => {
    if (tab === "agents") {
      if (agentsLoading) {
        return <AgentBuilderListSkeleton rowTestId="library-skeleton-row" />;
      }
      if (agentsError) {
        return renderError(agentsError);
      }
      if (agents.length === 0) {
        return (
          <div className="flex items-center justify-center pt-16">
            <EmptyState
              iconSlot={<LibraryIcon className="h-8 w-8 text-neutral3" />}
              titleSlot="暂无公开智能体"
              descriptionSlot="将智能体设为公开，即可分享到团队资源库。"
            />
          </div>
        );
      }
      return (
        <AgentBuilderList
          agents={agents}
          search={search}
          rowTestId="library-agent-row"
          showFavorites={canUseFavorites}
        />
      );
    }

    // Skills tab
    if (skillsLoading) {
      return <SkillBuilderListSkeleton />;
    }
    if (skillsError) {
      return renderError(skillsError);
    }
    if (skills.length === 0) {
      return (
        <div className="flex items-center justify-center pt-16">
          <EmptyState
            iconSlot={<SparklesIcon className="h-8 w-8 text-neutral3" />}
            titleSlot="暂无公开技能"
            descriptionSlot="将技能设为公开，即可分享到团队资源库。"
          />
        </div>
      );
    }
    return (
      <SkillBuilderList
        skills={skills}
        search={search}
        onSkillClick={(skill) =>
          navigate(`/agent-builder/skills/${skill.id}/view`, { viewTransition: true })
        }
        showFavorites={canUseFavorites}
      />
    );
  })();

  return (
    <>
      <PageLayout className="px-4 md:px-10">
        <PageLayout.TopArea>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
            <PageHeader>
              <PageHeader.Title>
                <LibraryIcon /> 资源库
              </PageHeader.Title>
              <PageHeader.Description>
                {tab === "agents" ? "共享到团队资源库的智能体。" : "共享到团队资源库的技能。"}
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
              <ListSearch onSearch={setSearch} label="筛选资源库" placeholder="按名称或描述筛选" />
            </div>
          </div>
        </PageLayout.TopArea>

        {body}
      </PageLayout>
    </>
  );
}
