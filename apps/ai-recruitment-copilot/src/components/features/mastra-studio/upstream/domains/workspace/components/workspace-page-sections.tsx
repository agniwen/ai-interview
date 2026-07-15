import { TabContent } from "@mastra/playground-ui/components/Tabs";
import { Bot, ChevronDown, Server } from "lucide-react";
import { FileBrowser, FileViewer } from "./file-browser";
import { SkillsTable } from "./skills-table";
import type { useCreateWorkspaceDirectory, useDeleteWorkspaceFile } from "../hooks/use-workspace";
import type { WorkspaceItem } from "../types";

export function WorkspaceSelector({
  isReadOnly,
  onSelect,
  onToggle,
  selectedWorkspace,
  showDropdown,
  workspaces,
}: {
  isReadOnly: boolean;
  onSelect: (id: string) => void;
  onToggle: () => void;
  selectedWorkspace?: WorkspaceItem;
  showDropdown: boolean;
  workspaces: WorkspaceItem[];
}) {
  if (workspaces.length === 1 && selectedWorkspace) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral4">
        {selectedWorkspace.source === "agent" ? (
          <Bot className="h-4 w-4 text-accent1" />
        ) : (
          <Server className="h-4 w-4" />
        )}
        <span>{selectedWorkspace.name}</span>
        {selectedWorkspace.source === "agent" && selectedWorkspace.agentName && (
          <span className="text-neutral3">({selectedWorkspace.agentName})</span>
        )}
        {isReadOnly && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
            只读
          </span>
        )}
      </div>
    );
  }
  if (workspaces.length <= 1) {
    return null;
  }
  return (
    <div className="relative">
      <button
        aria-label="选择工作区"
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-border1 rounded-lg bg-surface2 hover:bg-surface3 transition-colors w-full max-w-md"
      >
        {selectedWorkspace?.source === "agent" ? (
          <Bot className="h-4 w-4 text-accent1" />
        ) : (
          <Server className="h-4 w-4 text-neutral4" />
        )}
        <span className="flex-1 text-left truncate">
          {selectedWorkspace?.name ?? "选择工作区"}
          {selectedWorkspace?.source === "agent" && selectedWorkspace.agentName && (
            <span className="text-neutral4 ml-1">({selectedWorkspace.agentName})</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-neutral4 transition-transform ${showDropdown ? "rotate-180" : ""}`}
        />
      </button>
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-w-md bg-surface2 border border-border1 rounded-lg shadow-lg overflow-hidden">
          {workspaces.map((workspace) => (
            <button
              aria-label={`打开 ${workspace.name}`}
              key={workspace.id}
              onClick={() => onSelect(workspace.id)}
              className={`flex items-center gap-3 px-3 py-2 w-full text-left hover:bg-surface3 transition-colors ${selectedWorkspace?.id === workspace.id ? "bg-surface3" : ""}`}
            >
              {workspace.source === "agent" ? (
                <Bot className="h-4 w-4 text-accent1 shrink-0" />
              ) : (
                <Server className="h-4 w-4 text-neutral4 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral6 truncate">{workspace.name}</div>
                <div className="text-xs text-neutral4 truncate">
                  {workspace.source === "agent" ? `智能体：${workspace.agentName}` : "全局工作区"}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {workspace.safety?.readOnly && (
                  <span className="text-[10px] text-amber-400">只读</span>
                )}
                {workspace.capabilities.hasFilesystem && (
                  <span className="text-[10px] text-neutral4">文件系统</span>
                )}
                {workspace.capabilities.hasSandbox && (
                  <span className="text-[10px] text-neutral4">沙盒</span>
                )}
                {workspace.capabilities.hasSkills && (
                  <span className="text-[10px] text-neutral4">技能</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilesTabContentProps {
  createDirectory: ReturnType<typeof useCreateWorkspaceDirectory>;
  currentPath: string;
  deleteFile: ReturnType<typeof useDeleteWorkspaceFile>;
  effectiveWorkspaceId?: string;
  fileContent?: { content: string; mimeType?: string };
  files: React.ComponentProps<typeof FileBrowser>["entries"];
  filesError: unknown;
  isLoadingFileContent: boolean;
  isLoadingFiles: boolean;
  isReadOnly: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onSelectFile: (file: string | null) => void;
  selectedFile: string | null;
}

export function FilesTabContent(props: FilesTabContentProps) {
  const onCreateDirectory = props.isReadOnly
    ? undefined
    : (path: string) =>
        props.createDirectory.mutate({ path, workspaceId: props.effectiveWorkspaceId });
  const onDelete = props.isReadOnly
    ? undefined
    : (path: string) =>
        props.deleteFile.mutate({
          force: true,
          path,
          recursive: true,
          workspaceId: props.effectiveWorkspaceId,
        });
  return (
    <TabContent value="files" className="pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FileBrowser
          entries={props.files}
          currentPath={props.currentPath}
          isLoading={props.isLoadingFiles}
          error={props.filesError instanceof Error ? props.filesError : null}
          onNavigate={props.onNavigate}
          onFileSelect={props.onSelectFile}
          onRefresh={props.onRefresh}
          onCreateDirectory={onCreateDirectory}
          onDelete={onDelete}
        />
        {props.selectedFile && (
          <FileViewer
            path={props.selectedFile}
            content={props.fileContent?.content ?? ""}
            isLoading={props.isLoadingFileContent}
            mimeType={props.fileContent?.mimeType}
            onClose={() => props.onSelectFile(null)}
          />
        )}
      </div>
    </TabContent>
  );
}

interface SkillsTabContentProps {
  canManageSkills: boolean;
  effectiveWorkspaceId?: string;
  hasUndiscoveredInstall: boolean;
  isLoadingSkills: boolean;
  isSkillsConfigured: boolean;
  onAdd: () => void;
  onRemove: (skillName: string) => void;
  onUpdate: (skillName: string) => void;
  removingSkillName: string | null;
  skills: React.ComponentProps<typeof SkillsTable>["skills"];
  updatingSkillName: string | null;
}

export function SkillsTabContent(props: SkillsTabContentProps) {
  return (
    <TabContent value="skills" className="pb-8">
      <SkillsTable
        skills={props.skills}
        isLoading={props.isLoadingSkills}
        isSkillsConfigured={props.isSkillsConfigured}
        hasUndiscoveredAgentSkills={props.hasUndiscoveredInstall}
        basePath={
          props.effectiveWorkspaceId
            ? `/workspaces/${props.effectiveWorkspaceId}/skills`
            : "/workspaces"
        }
        onAddSkill={props.canManageSkills ? props.onAdd : undefined}
        onUpdateSkill={props.canManageSkills ? props.onUpdate : undefined}
        onRemoveSkill={props.canManageSkills ? props.onRemove : undefined}
        updatingSkillName={props.updatingSkillName ?? undefined}
        removingSkillName={props.removingSkillName ?? undefined}
      />
    </TabContent>
  );
}
