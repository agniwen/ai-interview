import { AlertDialog } from "@mastra/playground-ui/components/AlertDialog";
import { Button } from "@mastra/playground-ui/components/Button";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { Input } from "@mastra/playground-ui/components/Input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@mastra/playground-ui/components/Tooltip";
import { AmazonIcon } from "@mastra/playground-ui/icons/AmazonIcon";
import { AzureIcon } from "@mastra/playground-ui/icons/AzureIcon";
import { GoogleIcon } from "@mastra/playground-ui/icons/GoogleIcon";
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  FileText,
  FileCode,
  FileJson,
  Image,
  Loader2,
  RefreshCw,
  Upload,
  FolderPlus,
  Trash2,
  AlertCircle,
  Cloud,
  Database,
  HardDrive,
} from "lucide-react";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { coldarkDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import type { FileEntry } from "../types";

// =============================================================================
// Type Definitions
// =============================================================================

export interface FileBrowserProps {
  entries: FileEntry[];
  currentPath: string;
  isLoading: boolean;
  /** Error from fetching files (e.g., directory not found) */
  error?: Error | null;
  onNavigate: (path: string) => void;
  onFileSelect?: (path: string) => void;
  onRefresh?: () => void;
  onUpload?: () => void;
  onCreateDirectory?: (path: string) => void | Promise<void>;
  onDelete?: (path: string) => void | Promise<void>;
  /** Shows loading state on create directory button */
  isCreatingDirectory?: boolean;
  /** Shows loading state on delete confirmation */
  isDeleting?: boolean;
}

// =============================================================================
// File Icon Helper
// =============================================================================

/**
 * Get icon for a mount point based on provider or icon field.
 */
function getMountIcon(mount: FileEntry["mount"]) {
  if (!mount) {
    return null;
  }

  // First check explicit icon field, then fall back to provider
  const iconKey = mount.icon || mount.provider;

  switch (iconKey) {
    case "aws-s3":
    case "s3": {
      // S3 or S3-compatible storage
      return <AmazonIcon className="h-4 w-4 text-[#FF9900]" />;
    }
    case "google-cloud":
    case "google-cloud-storage":
    case "gcs": {
      return <GoogleIcon className="h-4 w-4" />;
    }
    case "azure-blob":
    case "azure": {
      return <AzureIcon className="h-4 w-4 text-[#0078D4]" />;
    }
    case "cloudflare":
    case "cloudflare-r2":
    case "r2": {
      return <Cloud className="h-4 w-4 text-[#F38020]" />;
    }
    case "minio": {
      return <HardDrive className="h-4 w-4 text-red-400" />;
    }
    case "database": {
      return <Database className="h-4 w-4 text-emerald-400" />;
    }
    case "local":
    case "folder": {
      return <Folder className="h-4 w-4 text-amber-400" />;
    }
    case "hard-drive": {
      return <HardDrive className="h-4 w-4 text-slate-400" />;
    }
    case "cloud": {
      return <Cloud className="h-4 w-4 text-sky-400" />;
    }
    default: {
      // Default to cloud icon for unknown providers
      return <Cloud className="h-4 w-4 text-neutral4" />;
    }
  }
}

function getFileIcon(entry: FileEntry, isOpen = false) {
  const { name, type, mount } = entry;

  if (type === "directory") {
    // If it's a mount point, show the provider icon
    if (mount) {
      return getMountIcon(mount);
    }
    return isOpen ? (
      <FolderOpen className="h-4 w-4 text-amber-400" />
    ) : (
      <Folder className="h-4 w-4 text-amber-400" />
    );
  }

  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx": {
      return <FileCode className="h-4 w-4 text-blue-400" />;
    }
    case "json": {
      return <FileJson className="h-4 w-4 text-yellow-400" />;
    }
    case "md":
    case "mdx": {
      return <FileText className="h-4 w-4 text-neutral4" />;
    }
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp": {
      return <Image className="h-4 w-4 text-purple-400" />;
    }
    default: {
      return <File className="h-4 w-4 text-neutral4" />;
    }
  }
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) {
    return "";
  }
  if (bytes < 0) {
    return `-${formatBytes(-bytes)}`;
  }
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Extract a user-friendly error message from an error.
 * Checks for MastraClientError.body first, then falls back to parsing the message.
 */
function getErrorMessage(error: Error): string {
  // Check for MastraClientError with body property
  if ("body" in error && error.body && typeof error.body === "object") {
    const body = error.body as Record<string, unknown>;
    if (typeof body.error === "string") {
      return body.error;
    }
    if (typeof body.message === "string") {
      return body.message;
    }
  }

  // Fallback: parse the message for older client-js versions
  const { message } = error;

  // Try to extract JSON error message from client-js format: "HTTP error! status: 404 - {...}"
  // Avoid regex to prevent ReDoS - just find the last " - {" and try to parse from there
  const jsonStart = message.lastIndexOf(" - {");
  if (jsonStart !== -1) {
    try {
      // Skip " - "
      const jsonStr = message.slice(jsonStart + 3);
      const parsed = JSON.parse(jsonStr);
      if (parsed.error) {
        return parsed.error;
      }
      if (parsed.message) {
        return parsed.message;
      }
    } catch {
      // Fall through to default
    }
  }

  // Check for common patterns
  if (message.includes("status: 404")) {
    return "未找到目录";
  }

  return message;
}

// =============================================================================
// Breadcrumb Navigation
// =============================================================================

function isRootPath(p: string) {
  return p === "." || p === "";
}

interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const isRoot = isRootPath(path);
  const parts = isRoot ? [] : path.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-sm overflow-x-auto">
      <button
        onClick={() => onNavigate(".")}
        className="p-1 rounded hover:bg-surface4 text-neutral5 hover:text-neutral6 transition-colors"
        aria-label="工作区根目录"
      >
        <FolderOpen className="h-4 w-4" />
      </button>
      {parts.map((part, index) => {
        const partPath = parts.slice(0, index + 1).join("/");
        return (
          <div key={partPath} className="flex items-center">
            <ChevronRight className="h-4 w-4 text-neutral3" />
            <button
              onClick={() => onNavigate(partPath)}
              className="px-2 py-1 rounded hover:bg-surface4 text-neutral5 hover:text-neutral6 transition-colors truncate max-w-[150px]"
              title={part}
            >
              {part}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FileListState({
  children,
  error,
  isLoading,
  isRoot,
  isEmpty,
}: {
  children: React.ReactNode;
  error?: Error | null;
  isEmpty: boolean;
  isLoading: boolean;
  isRoot: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral3" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-12 px-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
          <AlertCircle className="h-6 w-6 text-red-400" />
        </div>
        <p className="text-sm text-neutral6 font-medium mb-1">加载目录失败</p>
        <p className="text-xs text-neutral4 max-w-sm mx-auto">{getErrorMessage(error)}</p>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="py-12 text-center text-neutral4 text-sm">
        {isRoot ? "工作区为空" : "目录为空"}
      </div>
    );
  }
  return children;
}

function MountBadge({ entry }: { entry: FileEntry }) {
  const mountLabel = entry.mount?.displayName || entry.mount?.provider;
  if (!entry.mount || !mountLabel) {
    return null;
  }
  const isError = entry.mount.status === "error";
  const badge = (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${isError ? "text-red-400 bg-red-400/10" : "text-neutral3 bg-surface4"}`}
    >
      {mountLabel}
    </span>
  );
  if (!entry.mount.description) {
    return badge;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{entry.mount.description}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// File Browser Component
// =============================================================================

export function FileBrowser({
  entries,
  currentPath,
  isLoading,
  error,
  onNavigate,
  onFileSelect,
  onRefresh,
  onUpload,
  onCreateDirectory,
  onDelete,
  isCreatingDirectory,
  isDeleting,
}: FileBrowserProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isCreateDirectoryOpen, setIsCreateDirectoryOpen] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState("");

  // Sort entries: directories first, then alphabetically
  const sortedEntries = [...entries].toSorted((a, b) => {
    if (a.type === "directory" && b.type !== "directory") {
      return -1;
    }
    if (a.type !== "directory" && b.type === "directory") {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const isRoot = isRootPath(currentPath);

  const handleEntryClick = (entry: FileEntry) => {
    const fullPath = isRoot ? entry.name : `${currentPath}/${entry.name}`;
    if (entry.type === "directory") {
      onNavigate(fullPath);
    } else {
      onFileSelect?.(fullPath);
    }
  };

  const handleDelete = (entry: FileEntry) => {
    const fullPath = isRoot ? entry.name : `${currentPath}/${entry.name}`;
    setDeleteTarget(fullPath);
  };

  return (
    <div className="rounded-lg border border-border1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface3 border-b border-border1">
        <Breadcrumb path={currentPath} onNavigate={onNavigate} />
        <div className="flex items-center gap-1">
          {onRefresh && (
            <Button
              variant="ghost"
              size="md"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="刷新文件"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
          {onCreateDirectory && (
            <Button
              variant="ghost"
              size="md"
              disabled={isCreatingDirectory}
              aria-label="创建目录"
              onClick={() => setIsCreateDirectoryOpen(true)}
            >
              {isCreatingDirectory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="h-4 w-4" />
              )}
            </Button>
          )}
          {onUpload && (
            <Button variant="ghost" size="md" onClick={onUpload} aria-label="上传文件">
              <Upload className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="max-h-[400px] overflow-auto">
        <FileListState
          error={error}
          isEmpty={sortedEntries.length === 0}
          isLoading={isLoading}
          isRoot={isRoot}
        >
          <TooltipProvider>
            <ul>
              {/* Parent directory link */}
              {!isRoot && (
                <li>
                  <button
                    onClick={() => {
                      const parentPath = currentPath.split("/").slice(0, -1).join("/") || ".";
                      onNavigate(parentPath);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface4 transition-colors text-left"
                  >
                    <FolderOpen className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-neutral5">..</span>
                  </button>
                </li>
              )}
              {sortedEntries.map((entry) => {
                const isError = entry.mount?.status === "error";

                return (
                  <li key={entry.name} className="group">
                    <div className="flex items-center hover:bg-surface4 transition-colors">
                      <button
                        onClick={() => handleEntryClick(entry)}
                        className="flex-1 flex items-center gap-3 px-4 py-2 text-left"
                      >
                        {getFileIcon(entry)}
                        <span className="text-sm text-neutral6 flex-1 truncate">{entry.name}</span>
                        {/* Mount error indicator */}
                        {entry.mount && isError && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <span className="text-red-400">错误：</span>{" "}
                              {entry.mount.error || "连接到此文件系统失败"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <MountBadge entry={entry} />
                        {entry.type === "file" && entry.size !== undefined && (
                          <span className="text-xs text-neutral3 tabular-nums">
                            {formatBytes(entry.size)}
                          </span>
                        )}
                      </button>
                      {onDelete && !entry.mount && (
                        <button
                          onClick={() => handleDelete(entry)}
                          aria-label={`删除 ${entry.name}`}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 text-neutral3 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        </FileListState>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !isDeleting && !open && setDeleteTarget(null)}
      >
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>删除项目</AlertDialog.Title>
            <AlertDialog.Description>
              确定要删除“{deleteTarget}”吗？此操作无法撤销。
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isDeleting}>取消</AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={isDeleting}
              onClick={async () => {
                try {
                  if (deleteTarget && onDelete) {
                    await onDelete(deleteTarget);
                  }
                } finally {
                  setDeleteTarget(null);
                }
              }}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              删除
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
      <Dialog open={isCreateDirectoryOpen} onOpenChange={setIsCreateDirectoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建目录</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              aria-label="目录名称"
              autoFocus
              placeholder="目录名称"
              value={newDirectoryName}
              onChange={(event) => setNewDirectoryName(event.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="default" onClick={() => setIsCreateDirectoryOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!newDirectoryName.trim() || isCreatingDirectory}
              onClick={async () => {
                if (!onCreateDirectory) {
                  return;
                }
                const name = newDirectoryName.trim();
                const fullPath = isRoot ? name : `${currentPath}/${name}`;
                await onCreateDirectory(fullPath);
                setNewDirectoryName("");
                setIsCreateDirectoryOpen(false);
              }}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =============================================================================
// File Viewer Component
// =============================================================================

/**
 * Map file extensions to Prism language names for syntax highlighting.
 */
function getLanguageFromExtension(ext?: string): string | null {
  if (!ext) {
    return null;
  }
  const map: Record<string, string> = {
    bash: "bash",
    c: "c",
    cpp: "cpp",
    css: "css",
    dockerfile: "dockerfile",
    go: "go",
    gql: "graphql",
    graphql: "graphql",
    h: "c",
    hpp: "cpp",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    less: "less",
    makefile: "makefile",
    md: "markdown",
    mdx: "mdx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    scss: "scss",
    sh: "bash",
    sql: "sql",
    svelte: "svelte",
    toml: "toml",
    ts: "typescript",
    tsx: "tsx",
    vue: "vue",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    zsh: "bash",
  };
  return map[ext.toLowerCase()] || null;
}

/**
 * Highlighted code display component using Prism.
 */
function HighlightedCode({ content, language }: { content: string; language: string }) {
  return (
    <SyntaxHighlighter
      language={language}
      style={coldarkDark}
      customStyle={{
        backgroundColor: "transparent",
        fontSize: "0.875rem",
        margin: 0,
        padding: "1rem",
      }}
      codeTagProps={{
        style: {
          fontFamily: "var(--font-mono)",
        },
      }}
    >
      {content}
    </SyntaxHighlighter>
  );
}

export interface FileViewerProps {
  path: string;
  content: string;
  isLoading: boolean;
  mimeType?: string;
  onClose?: () => void;
}

function FileViewerContent({
  content,
  fileName,
  isImage,
  isLoading,
  language,
  mimeType,
}: {
  content: string;
  fileName: string;
  isImage: boolean;
  isLoading: boolean;
  language: string | null;
  mimeType?: string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral3" />
      </div>
    );
  }
  if (isImage) {
    return (
      <div className="p-4 flex items-center justify-center">
        <object
          aria-label={fileName}
          data={`data:${mimeType || "image/png"};base64,${btoa(content)}`}
          type={mimeType || "image/png"}
          className="max-w-full max-h-[400px] object-contain"
        />
      </div>
    );
  }
  if (language) {
    return <HighlightedCode content={content} language={language} />;
  }
  return (
    <pre className="p-4 text-sm text-neutral5 whitespace-pre-wrap font-mono overflow-x-auto">
      {content}
    </pre>
  );
}

export function FileViewer({ path, content, isLoading, mimeType, onClose }: FileViewerProps) {
  const fileName = path.split("/").pop() || path;
  const ext = fileName.split(".").pop()?.toLowerCase();
  const isImage =
    mimeType?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "");
  const language = getLanguageFromExtension(ext);

  return (
    <div className="rounded-lg border border-border1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface3 border-b border-border1">
        <div className="flex items-center gap-2">
          {getFileIcon({ name: fileName, type: "file" })}
          <span className="text-sm font-medium text-neutral6">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton content={content} copyMessage="已复制文件内容" />
          {onClose && (
            <Button variant="ghost" size="md" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-auto h-full" style={{ backgroundColor: "black" }}>
        <FileViewerContent
          content={content}
          fileName={fileName}
          isImage={isImage}
          isLoading={isLoading}
          language={language}
          mimeType={mimeType}
        />
      </div>
    </div>
  );
}
