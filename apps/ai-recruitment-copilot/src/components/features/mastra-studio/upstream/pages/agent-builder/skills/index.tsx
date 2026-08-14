import type { StoredSkillResponse } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { PageHeader } from "@mastra/playground-ui/components/PageHeader";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { DownloadIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "@/components/features/mastra-studio/router/compat";
import { toast } from "sonner";
import { BuilderAddSkillDialog } from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/skill-list/builder-add-skill-dialog";
import {
  SkillBuilderList,
  SkillBuilderListSkeleton,
} from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/skill-list/skill-builder-list";
import { useBuilderRegistries } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-registries";
import { useStoredSkills } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-skills";
import { useCurrentUser } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-current-user";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";

export default function AgentBuilderSkillsPage() {
  const navigate = useNavigate();
  const { isLoading: isCurrentUserLoading } = useCurrentUser();
  const { hasPermission, rbacEnabled } = usePermissions();
  const canWriteSkills = !rbacEnabled || hasPermission("stored-skills:write");
  const canReadSkills = !rbacEnabled || hasPermission("stored-skills:read");
  const [registryDialog, setRegistryDialog] = useState<{ id: string; label: string } | null>(null);

  const goToCreate = () => navigate("/agent-builder/skills/create", { viewTransition: true });
  const goToEdit = (skillId: string) =>
    navigate(`/agent-builder/skills/${skillId}/edit`, { viewTransition: true });

  const { data, isLoading, error } = useStoredSkills({ enabled: !isCurrentUserLoading });
  const [search, setSearch] = useState("");

  const skills = useMemo(() => data?.skills ?? [], [data?.skills]);
  const installedSkillIds = useMemo(() => skills.map((s) => s.id), [skills]);

  // Surface registry browse only for users who can read AND write skills, and
  // only when at least one registry is actually enabled. This is the gate
  // requested in COR-832: invisible when there's nothing useful to do.
  const { data: registriesData } = useBuilderRegistries({
    enabled: canReadSkills && canWriteSkills,
  });
  const enabledRegistry = useMemo(
    () => registriesData?.registries.find((r) => r.enabled) ?? null,
    [registriesData],
  );

  const handleSkillClick = (skill: StoredSkillResponse) => {
    void goToEdit(skill.id);
  };

  const body = (() => {
    if (isCurrentUserLoading || isLoading) {
      return <SkillBuilderListSkeleton />;
    }

    if (error) {
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
            <PermissionDenied resource="技能" />
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center pt-10">
          <ErrorState title="加载技能失败" message={error.message} />
        </div>
      );
    }

    if (skills.length === 0) {
      return (
        <div className="flex items-center justify-center pt-16">
          <EmptyState
            iconSlot={<SparklesIcon className="h-8 w-8 text-neutral3" />}
            titleSlot="暂无技能"
            descriptionSlot="创建第一个技能，为智能体提供新能力。"
            actionSlot={
              canWriteSkills ? (
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={goToCreate}>
                    <PlusIcon /> 新建技能
                  </Button>
                  {enabledRegistry && (
                    <Button
                      variant="default"
                      onClick={() =>
                        setRegistryDialog({ id: enabledRegistry.id, label: enabledRegistry.label })
                      }
                    >
                      <DownloadIcon /> 浏览注册表
                    </Button>
                  )}
                </div>
              ) : undefined
            }
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
                <SparklesIcon /> 我的技能
              </PageHeader.Title>
              <PageHeader.Description>你创建的技能。</PageHeader.Description>
            </PageHeader>
            {skills.length > 0 && canWriteSkills && (
              <div className="w-full shrink-0 flex flex-col items-stretch gap-2 md:w-auto md:flex-row md:items-center">
                {enabledRegistry && (
                  <Button
                    variant="default"
                    className="w-full justify-center md:w-auto"
                    onClick={() =>
                      setRegistryDialog({ id: enabledRegistry.id, label: enabledRegistry.label })
                    }
                  >
                    <DownloadIcon /> 浏览注册表
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="w-full justify-center md:w-auto"
                  onClick={goToCreate}
                >
                  <PlusIcon /> 新建技能
                </Button>
              </div>
            )}
          </div>
          <div className="max-w-120">
            <ListSearch onSearch={setSearch} label="筛选技能" placeholder="按名称或描述筛选" />
          </div>
        </PageLayout.TopArea>

        {body}
      </PageLayout>

      {registryDialog && (
        <BuilderAddSkillDialog
          open={!!registryDialog}
          onOpenChange={(open) => {
            if (!open) {
              setRegistryDialog(null);
            }
          }}
          registryId={registryDialog.id}
          registryLabel={registryDialog.label}
          installedSkillIds={installedSkillIds}
          onInstalled={(storedSkillId) => {
            const installed = skills.find((s) => s.id === storedSkillId);
            toast.success(installed ? `已导入“${installed.name}”` : "已导入技能");
          }}
          onCollision={(skillName) => {
            const existing = skills.find((s) => s.id === skillName || s.name === skillName);
            if (existing) {
              toast.error(`“${existing.name}”已在你的库中`, {
                action: {
                  label: "打开现有技能",
                  onClick: () => goToEdit(existing.id),
                },
              });
            } else {
              toast.error(`已存在名为“${skillName}”的技能。`);
            }
          }}
        />
      )}
    </>
  );
}
