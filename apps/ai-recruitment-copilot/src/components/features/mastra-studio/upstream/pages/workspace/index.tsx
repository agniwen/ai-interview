import { Button } from "@mastra/playground-ui/components/Button";
import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Tab, TabList, Tabs } from "@mastra/playground-ui/components/Tabs";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { toast } from "@mastra/playground-ui/utils/toast";
import { FileText, Wand2, Search } from "lucide-react";
import { useState, useCallback } from "react";
import {
  useSearchParams,
  useParams,
  useNavigate,
} from "@/components/features/mastra-studio/router/compat";
import { isWorkspaceNotSupportedError } from "@/components/features/mastra-studio/upstream/domains/workspace/compatibility";
import type { SkillsTable } from "@/components/features/mastra-studio/upstream/domains/workspace/components";
import { AddSkillDialog } from "@/components/features/mastra-studio/upstream/domains/workspace/components";
import {
  FilesTabContent,
  SkillsTabContent,
  WorkspaceSelector,
} from "@/components/features/mastra-studio/upstream/domains/workspace/components/workspace-page-sections";
import { NoWorkspacesInfo } from "@/components/features/mastra-studio/upstream/domains/workspace/components/no-workspaces-info";
import {
  SearchWorkspacePanel,
  SearchSkillsPanel,
} from "@/components/features/mastra-studio/upstream/domains/workspace/components/search-panel";
import { WorkspaceNotConfigured } from "@/components/features/mastra-studio/upstream/domains/workspace/components/workspace-not-configured";
import { WorkspaceNotSupported } from "@/components/features/mastra-studio/upstream/domains/workspace/components/workspace-not-supported";
import {
  useInstallSkill,
  useUpdateSkills,
  useRemoveSkill,
} from "@/components/features/mastra-studio/upstream/domains/workspace/hooks";
import {
  useWorkspaceInfo,
  useWorkspaces,
  useWorkspaceFiles,
  useSearchWorkspace,
  useDeleteWorkspaceFile,
  useCreateWorkspaceDirectory,
  useWorkspaceFile,
} from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-workspace";
import {
  useWorkspaceSkills,
  useSearchWorkspaceSkills,
} from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-workspace-skills";
import type { WorkspaceItem } from "@/components/features/mastra-studio/upstream/domains/workspace/types";

type TabType = "files" | "skills";

type WorkspaceInfo = ReturnType<typeof useWorkspaceInfo>["data"];

function getWorkspaceCapabilities(info: WorkspaceInfo, selectedWorkspace?: WorkspaceItem) {
  return {
    canBM25: info?.capabilities?.canBM25 ?? false,
    canVector: info?.capabilities?.canVector ?? false,
    hasFilesystem: info?.capabilities?.hasFilesystem ?? false,
    hasSkills: info?.capabilities?.hasSkills ?? false,
    isReadOnly: selectedWorkspace?.safety?.readOnly ?? false,
    isWorkspaceConfigured: info?.isWorkspaceConfigured ?? false,
  };
}

function getEffectiveTab(tab: TabType | null, hasFilesystem: boolean, hasSkills: boolean): TabType {
  if (tab === "files" && hasFilesystem) {
    return "files";
  }
  if (tab === "skills" && hasSkills) {
    return "skills";
  }
  if (hasFilesystem) {
    return "files";
  }
  return hasSkills ? "skills" : "files";
}

function getInstalledSkillId(skill: React.ComponentProps<typeof SkillsTable>["skills"][number]) {
  const source = skill.skillsShSource;
  return source ? `${source.owner}/${source.repo}/${skill.name}` : null;
}

function getInstalledSkillIds(
  skills: React.ComponentProps<typeof SkillsTable>["skills"],
): string[] {
  return skills.flatMap((skill) => {
    const id = getInstalledSkillId(skill);
    return id === null ? [] : [id];
  });
}

function deriveWorkspacePresentation({
  filesData,
  selectedWorkspace,
  skillsData,
  tab,
  workspaceInfo,
}: {
  filesData: ReturnType<typeof useWorkspaceFiles>["data"];
  selectedWorkspace?: WorkspaceItem;
  skillsData: ReturnType<typeof useWorkspaceSkills>["data"];
  tab: TabType | null;
  workspaceInfo: WorkspaceInfo;
}) {
  const capabilities = getWorkspaceCapabilities(workspaceInfo, selectedWorkspace);
  const skills = skillsData?.skills ?? [];
  const isSkillsConfigured = skillsData?.isSkillsConfigured ?? false;
  const canSearchFiles =
    capabilities.hasFilesystem && (capabilities.canBM25 || capabilities.canVector);
  const canSearchSkills = capabilities.hasSkills && isSkillsConfigured && skills.length > 0;
  return {
    ...capabilities,
    activeTab: getEffectiveTab(tab, capabilities.hasFilesystem, capabilities.hasSkills),
    canManageSkills: capabilities.hasFilesystem && !capabilities.isReadOnly,
    canSearchFiles,
    canSearchSkills,
    files: filesData?.entries ?? [],
    hasSearchCapability: canSearchFiles || canSearchSkills,
    skills,
    writableMounts: workspaceInfo?.mounts
      ?.filter((mount) => !mount.readOnly)
      .map((mount) => ({
        displayName: mount.displayName,
        icon: mount.icon,
        name: mount.name,
        path: mount.path,
        provider: mount.provider,
      })),
  };
}

function WorkspaceLoadState({
  children,
  genericError,
  isLoadingInfo,
  isLoadingWorkspaces,
  isPermissionDenied,
  isSessionExpired,
  isWorkspaceConfigured,
  isWorkspaceNotSupported,
  workspaceCount,
}: {
  children: React.ReactNode;
  genericError: unknown;
  isLoadingInfo: boolean;
  isLoadingWorkspaces: boolean;
  isPermissionDenied: boolean;
  isSessionExpired: boolean;
  isWorkspaceConfigured: boolean;
  isWorkspaceNotSupported: boolean;
  workspaceCount: number;
}) {
  if (isLoadingWorkspaces) {
    return (
      <NoDataPageLayout>
        <Spinner />
      </NoDataPageLayout>
    );
  }
  if (isSessionExpired) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }
  if (isPermissionDenied) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="workspaces" />
      </NoDataPageLayout>
    );
  }
  if (isWorkspaceNotSupported) {
    return (
      <NoDataPageLayout>
        <WorkspaceNotSupported />
      </NoDataPageLayout>
    );
  }
  if (genericError) {
    return (
      <NoDataPageLayout>
        <ErrorState title="Failed to load workspace" message={(genericError as Error).message} />
      </NoDataPageLayout>
    );
  }
  if (workspaceCount === 0) {
    return (
      <NoDataPageLayout>
        <NoWorkspacesInfo />
      </NoDataPageLayout>
    );
  }
  if (!isLoadingInfo && !isWorkspaceConfigured) {
    return (
      <NoDataPageLayout>
        <WorkspaceNotConfigured />
      </NoDataPageLayout>
    );
  }
  return children;
}

function WorkspaceSearchPanel({
  workspaceId,
  canSearchFiles,
  canSearchSkills,
  canBM25,
  canVector,
  showInitWarning,
  onViewFileResult,
  onViewSkillResult,
}: {
  workspaceId: string;
  canSearchFiles: boolean;
  canSearchSkills: boolean;
  canBM25: boolean;
  canVector: boolean;
  showInitWarning: boolean;
  onViewFileResult: (id: string) => void;
  onViewSkillResult: (skillName: string, skillPath: string) => void;
}) {
  const searchWorkspace = useSearchWorkspace();
  const searchSkills = useSearchWorkspaceSkills();

  return (
    <div className="border border-border1 rounded-lg p-4 bg-surface2 space-y-4">
      {canSearchFiles && (
        <div>
          <h3 className="text-sm font-medium text-neutral5 mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Search Indexed Files
          </h3>
          {showInitWarning && (
            <p className="text-xs text-amber-400 mb-3">
              File search requires <code className="text-amber-300">workspace.init()</code> to index
              files from your configured <code className="text-amber-300">autoIndexPaths</code>.
            </p>
          )}
          <SearchWorkspacePanel
            onSearch={(params) => searchWorkspace.mutate({ ...params, workspaceId })}
            isSearching={searchWorkspace.isPending}
            searchResults={
              searchWorkspace.data
                ? {
                    ...searchWorkspace.data,
                    results: searchWorkspace.data.results.filter((r) => !r.id.startsWith("skill:")),
                  }
                : undefined
            }
            canBM25={canBM25}
            canVector={canVector}
            onViewResult={onViewFileResult}
          />
        </div>
      )}

      {canSearchSkills && (
        <div>
          <h3 className="text-sm font-medium text-neutral5 mb-3 flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Search Skills
          </h3>
          <SearchSkillsPanel
            onSearch={(params) => searchSkills.mutate({ ...params, workspaceId })}
            results={searchSkills.data?.results ?? []}
            isSearching={searchSkills.isPending}
            onResultClick={(result) => onViewSkillResult(result.skillName, result.skillPath)}
          />
        </div>
      )}
    </div>
  );
}

export default function Workspace() {
  const { workspaceId: workspaceIdFromPath } = useParams<{ workspaceId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showAddSkillDialog, setShowAddSkillDialog] = useState(false);
  const [removingSkillName, setRemovingSkillName] = useState<string | null>(null);
  const [updatingSkillName, setUpdatingSkillName] = useState<string | null>(null);
  // Track if we installed a skill that wasn't discovered (client-side only, resets on refresh)
  const [hasUndiscoveredInstall, setHasUndiscoveredInstall] = useState(false);

  // Get state from URL query params (path, file, tab are still query params)
  const fileFromUrl = searchParams.get("file");
  const tabFromUrl = searchParams.get("tab") as TabType | null;

  // List of all workspaces (global + agent workspaces) - used for workspace selector dropdown
  const {
    data: workspacesData,
    error: workspacesError,
    isLoading: isLoadingWorkspaces,
  } = useWorkspaces();
  const workspaces = workspacesData?.workspaces ?? [];

  // Use workspaceId from path directly if available, otherwise fall back to first workspace from list
  const effectiveWorkspaceId = workspaceIdFromPath ?? workspaces[0]?.id;

  // Workspace info - calls /api/workspaces/:workspaceId directly
  const {
    data: workspaceInfo,
    isLoading: isLoadingInfo,
    error: workspaceInfoError,
  } = useWorkspaceInfo(effectiveWorkspaceId);

  // Check if 401 unauthorized (session expired)
  const isSessionExpired =
    is401UnauthorizedError(workspacesError) || is401UnauthorizedError(workspaceInfoError);

  // Check if 403 forbidden (permission denied)
  const isPermissionDenied =
    is403ForbiddenError(workspacesError) || is403ForbiddenError(workspaceInfoError);

  const pathFromUrl = searchParams.get("path") || ".";

  // Check if workspaces are not supported (501 error from server)
  const isWorkspaceNotSupported =
    isWorkspaceNotSupportedError(workspacesError) ||
    isWorkspaceNotSupportedError(workspaceInfoError);

  // Get the selected workspace metadata from the list (for displaying name, capabilities badge, etc.)
  const selectedWorkspace: WorkspaceItem | undefined = effectiveWorkspaceId
    ? workspaces.find((w) => w.id === effectiveWorkspaceId)
    : undefined;

  // Helper to update URL query params while preserving others
  const updateSearchParams = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    }
    setSearchParams(newParams);
  };

  // Navigate to a different workspace (changes path, resets query params)
  const setSelectedWorkspaceId = (id: string) => {
    // Reset warning when switching workspaces
    setHasUndiscoveredInstall(false);
    setShowSearch(false);
    void navigate(`/workspaces/${id}`);
  };

  const setCurrentPath = (path: string) => {
    updateSearchParams({ file: null, path: path === "." || path === "" ? null : path });
  };

  const setSelectedFile = (file: string | null) => {
    updateSearchParams({ file });
  };

  const setActiveTab = (tab: TabType) => {
    updateSearchParams({ tab });
  };

  // Use URL-derived values
  const currentPath = pathFromUrl;
  const selectedFile = fileFromUrl;

  // Files - pass workspaceId to get files from the selected workspace
  const {
    data: filesData,
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refetchFiles,
  } = useWorkspaceFiles(currentPath, {
    enabled: workspaceInfo?.isWorkspaceConfigured && workspaceInfo?.capabilities?.hasFilesystem,
    workspaceId: effectiveWorkspaceId,
  });
  const deleteFile = useDeleteWorkspaceFile();
  const createDirectory = useCreateWorkspaceDirectory();

  // Selected file content - pass workspaceId
  const { data: fileContent, isLoading: isLoadingFileContent } = useWorkspaceFile(
    selectedFile ?? "",
    {
      enabled: !!selectedFile,
      workspaceId: effectiveWorkspaceId,
    },
  );

  // Skills - pass workspaceId to get skills from the selected workspace
  const {
    data: skillsData,
    isLoading: isLoadingSkills,
    refetch: refetchSkills,
  } = useWorkspaceSkills({ workspaceId: effectiveWorkspaceId });

  // Skills.sh hooks
  const installSkill = useInstallSkill();
  const updateSkills = useUpdateSkills();
  const removeSkill = useRemoveSkill();

  const {
    activeTab,
    canBM25,
    canManageSkills,
    canSearchFiles,
    canSearchSkills,
    canVector,
    files,
    hasFilesystem,
    hasSearchCapability,
    hasSkills,
    isReadOnly,
    isWorkspaceConfigured,
    skills,
    writableMounts,
  } = deriveWorkspacePresentation({
    filesData,
    selectedWorkspace,
    skillsData,
    tab: tabFromUrl,
    workspaceInfo,
  });
  const isSkillsConfigured = skillsData?.isSkillsConfigured ?? false;

  // Skills.sh handlers
  const handleInstallSkill = useCallback(
    (params: { repository: string; skillName: string; mount?: string }) => {
      if (!effectiveWorkspaceId) {
        return;
      }

      installSkill.mutate(
        { ...params, workspaceId: effectiveWorkspaceId },
        {
          onError: (error) => {
            toast.error(
              `Failed to install skill: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          },
          onSuccess: async (result) => {
            if (result.success) {
              setShowAddSkillDialog(false);

              // Refetch skills and check if the installed skill appears in the list
              const { data: refreshedData, error } = await refetchSkills();

              // If refetch failed, just show success (can't verify discovery)
              if (error || !refreshedData) {
                toast.success(
                  `Skill "${result.skillName}" installed successfully (${result.filesWritten} files)`,
                );
                return;
              }

              const installedSkillFound = refreshedData.skills.some(
                (s) => s.name === result.skillName,
              );

              if (installedSkillFound) {
                toast.success(
                  `Skill "${result.skillName}" installed successfully (${result.filesWritten} files)`,
                );
              } else {
                // Skill was installed but not discovered - likely missing path config
                setHasUndiscoveredInstall(true);
                toast.warning(
                  `Skill "${result.skillName}" installed to .agents/skills but not discovered. Add .agents/skills to your workspace skills paths.`,
                );
              }
            } else {
              toast.error("Failed to install skill");
            }
          },
        },
      );
    },
    [effectiveWorkspaceId, installSkill, refetchSkills],
  );

  const handleUpdateSkill = useCallback(
    (skillName: string) => {
      if (!effectiveWorkspaceId) {
        return;
      }

      setUpdatingSkillName(skillName);
      updateSkills.mutate(
        { skillName, workspaceId: effectiveWorkspaceId },
        {
          onError: (error) => {
            setUpdatingSkillName(null);
            toast.error(
              `Failed to update skill: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          },
          onSuccess: (result) => {
            setUpdatingSkillName(null);
            if (result.updated.length > 0) {
              const [updated] = result.updated;
              if (updated.success) {
                toast.success(
                  `Skill "${skillName}" updated successfully (${updated.filesWritten} files)`,
                );
                void refetchSkills();
              } else {
                toast.error(`Failed to update skill: ${updated.error ?? "Unknown error"}`);
              }
            } else {
              toast.error(`Failed to update skill: No update result returned`);
            }
          },
        },
      );
    },
    [effectiveWorkspaceId, updateSkills, refetchSkills],
  );

  const handleRemoveSkill = useCallback(
    (skillName: string) => {
      if (!effectiveWorkspaceId) {
        return;
      }

      setRemovingSkillName(skillName);
      removeSkill.mutate(
        { skillName, workspaceId: effectiveWorkspaceId },
        {
          onError: (error) => {
            setRemovingSkillName(null);
            toast.error(
              `Failed to remove skill: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          },
          onSuccess: (result) => {
            setRemovingSkillName(null);
            if (result.success) {
              toast.success(`Skill "${result.skillName}" removed successfully`);
              void refetchSkills();
            } else {
              toast.error(`Failed to remove skill "${result.skillName}"`);
            }
          },
        },
      );
    },
    [effectiveWorkspaceId, removeSkill, refetchSkills],
  );

  const renderWorkspace = () => (
    <PageLayout>
      {hasSearchCapability && (
        <PageLayout.TopArea>
          <PageLayout.Row className="justify-end">
            <Button
              onClick={() => setShowSearch(!showSearch)}
              tooltip="Search workspace"
              aria-label="Search workspace"
            >
              <Search />
            </Button>
          </PageLayout.Row>
        </PageLayout.TopArea>
      )}

      <PageLayout.MainArea className="grid content-start gap-6">
        <WorkspaceSelector
          isReadOnly={isReadOnly}
          onSelect={(id) => {
            setSelectedWorkspaceId(id);
            setShowWorkspaceDropdown(false);
          }}
          onToggle={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
          selectedWorkspace={selectedWorkspace}
          showDropdown={showWorkspaceDropdown}
          workspaces={workspaces}
        />

        {/* Search Panel - keyed on workspace so hooks reset on switch */}
        {showSearch && hasSearchCapability && effectiveWorkspaceId && (
          <WorkspaceSearchPanel
            key={effectiveWorkspaceId}
            workspaceId={effectiveWorkspaceId}
            canSearchFiles={canSearchFiles}
            canSearchSkills={canSearchSkills}
            canBM25={canBM25}
            canVector={canVector}
            showInitWarning={!isLoadingInfo && workspaceInfo?.status !== "ready"}
            onViewFileResult={(id) => {
              updateSearchParams({ file: id, tab: "files" });
            }}
            onViewSkillResult={(skillName, skillPath) => {
              if (effectiveWorkspaceId) {
                void navigate(
                  `/workspaces/${effectiveWorkspaceId}/skills/${encodeURIComponent(skillName)}?path=${encodeURIComponent(skillPath)}`,
                );
              }
            }}
          />
        )}

        {(hasFilesystem || hasSkills) && (
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultTab={activeTab}>
            <TabList>
              {hasFilesystem && (
                <Tab value="files">
                  <FileText className="h-4 w-4" /> Files
                </Tab>
              )}
              {hasSkills && (
                <Tab value="skills">
                  <Wand2 className="h-4 w-4" /> Skills
                  {isSkillsConfigured && skills.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface4 text-neutral4">
                      {skills.length}
                    </span>
                  )}
                </Tab>
              )}
            </TabList>
            {hasFilesystem && (
              <FilesTabContent
                createDirectory={createDirectory}
                currentPath={currentPath}
                deleteFile={deleteFile}
                effectiveWorkspaceId={effectiveWorkspaceId}
                fileContent={fileContent}
                files={files}
                filesError={filesError}
                isLoadingFileContent={isLoadingFileContent}
                isLoadingFiles={isLoadingFiles}
                isReadOnly={isReadOnly}
                onNavigate={setCurrentPath}
                onRefresh={() => void refetchFiles()}
                onSelectFile={setSelectedFile}
                selectedFile={selectedFile}
              />
            )}
            {hasSkills && (
              <SkillsTabContent
                canManageSkills={canManageSkills}
                effectiveWorkspaceId={effectiveWorkspaceId}
                hasUndiscoveredInstall={hasUndiscoveredInstall}
                isLoadingSkills={isLoadingSkills}
                isSkillsConfigured={isSkillsConfigured}
                onAdd={() => setShowAddSkillDialog(true)}
                onRemove={handleRemoveSkill}
                onUpdate={handleUpdateSkill}
                removingSkillName={removingSkillName}
                skills={skills}
                updatingSkillName={updatingSkillName}
              />
            )}
          </Tabs>
        )}

        {!hasFilesystem && !hasSkills && !isLoadingInfo && (
          <div className="py-12 text-center text-neutral4">
            <p>No workspace capabilities are configured.</p>
          </div>
        )}
      </PageLayout.MainArea>

      {/* Add Skill Dialog */}
      {effectiveWorkspaceId && canManageSkills && (
        <AddSkillDialog
          open={showAddSkillDialog}
          onOpenChange={setShowAddSkillDialog}
          workspaceId={effectiveWorkspaceId}
          onInstall={handleInstallSkill}
          isInstalling={installSkill.isPending}
          // Pass precise IDs for skills with source info (format: owner/repo/name)
          installedSkillIds={getInstalledSkillIds(skills)}
          // Fallback to names for skills without source info
          installedSkillNames={skills.filter((s) => !s.skillsShSource).map((s) => s.name)}
          writableMounts={writableMounts}
          installedSkillPaths={Object.fromEntries(
            skills.filter((s) => s.path).map((s) => [s.name, s.path]),
          )}
        />
      )}
    </PageLayout>
  );

  return (
    <WorkspaceLoadState
      genericError={workspacesError || workspaceInfoError}
      isLoadingInfo={isLoadingInfo}
      isLoadingWorkspaces={isLoadingWorkspaces}
      isPermissionDenied={isPermissionDenied}
      isSessionExpired={isSessionExpired}
      isWorkspaceConfigured={isWorkspaceConfigured}
      isWorkspaceNotSupported={isWorkspaceNotSupported}
      workspaceCount={workspaces.length}
    >
      {renderWorkspace()}
    </WorkspaceLoadState>
  );
}
