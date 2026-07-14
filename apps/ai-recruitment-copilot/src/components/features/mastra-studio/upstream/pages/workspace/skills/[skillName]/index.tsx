import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useParams, useSearchParams } from "@/components/features/mastra-studio/router/compat";

import { validateAgentId } from "./validate-agent-id";
import { ReferenceViewerDialog } from "@/components/features/mastra-studio/upstream/domains/workspace/components/reference-viewer-dialog";
import { SkillDetail } from "@/components/features/mastra-studio/upstream/domains/workspace/components/skill-detail";
import { useWorkspaceFile } from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-workspace";
import {
  useWorkspaceSkill,
  useWorkspaceSkillReference,
} from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-workspace-skills";
import type { Skill } from "@/components/features/mastra-studio/upstream/domains/workspace/types";
import { navCrumb } from "@/components/features/mastra-studio/upstream/lib/nav";
import { RouteHeaderCrumbs } from "@/components/features/mastra-studio/upstream/lib/route-header";
import type { CrumbDef } from "@/components/features/mastra-studio/upstream/lib/route-header";

interface SkillPageContentProps {
  agentCrumbs: CrumbDef[] | null;
  content?: string;
  error: unknown;
  isLoading: boolean;
  isLoadingReference: boolean;
  onCloseReference: () => void;
  onReferenceClick: (referencePath: string) => void;
  referenceContent?: string;
  skill?: Skill;
  viewingReference: string | null;
}

function SkillPageContent({
  agentCrumbs,
  content,
  error,
  isLoading,
  isLoadingReference,
  onCloseReference,
  onReferenceClick,
  referenceContent,
  skill,
  viewingReference,
}: SkillPageContentProps) {
  const crumbs = agentCrumbs && <RouteHeaderCrumbs crumbs={agentCrumbs} />;
  if (isLoading) {
    return (
      <MainContentLayout>
        {crumbs}
        <div className="grid place-items-center h-full">
          <div className="h-8 w-8 border-2 border-accent1 border-t-transparent rounded-full animate-spin" />
        </div>
      </MainContentLayout>
    );
  }
  if (error && is401UnauthorizedError(error)) {
    return (
      <MainContentLayout>
        {crumbs}
        <div className="flex h-full items-center justify-center">
          <SessionExpired />
        </div>
      </MainContentLayout>
    );
  }
  if (error && is403ForbiddenError(error)) {
    return (
      <MainContentLayout>
        {crumbs}
        <div className="flex h-full items-center justify-center">
          <PermissionDenied resource="workspaces" />
        </div>
      </MainContentLayout>
    );
  }
  if (error || !skill) {
    return (
      <MainContentLayout>
        {crumbs}
        <div className="grid place-items-center h-full">
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load skill</p>
            <p className="text-sm text-neutral3">
              {error instanceof Error ? error.message : "Skill not found"}
            </p>
          </div>
        </div>
      </MainContentLayout>
    );
  }
  return (
    <MainContentLayout>
      {crumbs}
      <div className="grid overflow-y-auto overflow-x-hidden h-full">
        <div className="max-w-[100rem] px-[3rem] mx-auto py-8 h-full w-full overflow-x-hidden">
          <SkillDetail skill={skill} rawSkillMd={content} onReferenceClick={onReferenceClick} />
        </div>
      </div>
      <ReferenceViewerDialog
        open={Boolean(viewingReference)}
        onOpenChange={(open) => {
          if (!open) {
            onCloseReference();
          }
        }}
        skillName={skill.name}
        referencePath={viewingReference ?? ""}
        content={referenceContent}
        isLoading={isLoadingReference}
      />
    </MainContentLayout>
  );
}

export default function WorkspaceSkillDetailPage() {
  const { skillName, workspaceId } = useParams<{ skillName: string; workspaceId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const decodedSkillName = skillName ? decodeURIComponent(skillName) : "";

  // Optional path query param for disambiguation when multiple skills share the same name
  const skillPath = searchParams.get("path");
  const decodedSkillPath = skillPath ? decodeURIComponent(skillPath) : undefined;

  // When the page is reached from an agent (?agentId=...), swap the breadcrumb
  // from "Workspaces > workspaceId > skill" to "Agents > agentId > skill".
  // Validate the URL-provided id against the cached agents list so URL tampering
  // doesn't link to a non-existent agent. Cache may be cold on a direct visit;
  // we fall back to the workspace breadcrumb in that case.
  const agentId = searchParams.get("agentId");
  const decodedAgentId = agentId ? decodeURIComponent(agentId) : null;
  const agentsCache = queryClient.getQueriesData<Record<string, unknown>>({ queryKey: ["agents"] });
  const cachedAgents = agentsCache?.[0]?.[1] ?? null;
  const validAgentId = validateAgentId(decodedAgentId, cachedAgents);

  const agentCrumbs = useMemo<CrumbDef[] | null>(
    () =>
      validAgentId
        ? [
            navCrumb("/agents"),
            { id: "agent", label: validAgentId, to: `/agents/${encodeURIComponent(validAgentId)}` },
            { id: "skill", label: decodedSkillName },
          ]
        : null,
    [validAgentId, decodedSkillName],
  );

  const [viewingReference, setViewingReference] = useState<string | null>(null);

  // Fetch skill details - pass workspaceId to fetch from correct workspace
  const {
    data: skill,
    isLoading,
    error,
  } = useWorkspaceSkill(decodedSkillName, { path: decodedSkillPath, workspaceId });

  // Fetch raw SKILL.md file for "Source" view
  const { data: rawSkillMdData } = useWorkspaceFile(skill?.path ? `${skill.path}/SKILL.md` : "", {
    enabled: !!skill?.path,
    workspaceId,
  });

  // Fetch reference content when viewing
  const { data: referenceData, isLoading: isLoadingReference } = useWorkspaceSkillReference(
    decodedSkillName,
    viewingReference ?? "",
    {
      enabled: !!viewingReference,
      path: decodedSkillPath,
      workspaceId,
    },
  );

  return (
    <SkillPageContent
      agentCrumbs={agentCrumbs}
      content={rawSkillMdData?.content}
      error={error}
      isLoading={isLoading}
      isLoadingReference={isLoadingReference}
      onCloseReference={() => setViewingReference(null)}
      onReferenceClick={setViewingReference}
      referenceContent={referenceData?.content}
      skill={skill}
      viewingReference={viewingReference}
    />
  );
}
