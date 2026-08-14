import { useMastraClient } from "@mastra/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  isWorkspaceV1Supported,
  shouldRetryWorkspaceQuery,
  isWorkspaceNotSupportedError,
} from "../compatibility";
import type {
  WorkspaceInfo,
  WorkspacesListResponse,
  FileListResponse,
  FileReadResponse,
  FileStatResponse,
  WriteFileParams,
  WriteFileFromFileParams,
  SearchWorkspaceParams,
  SearchResponse,
} from "../types";

interface WorkspaceApi {
  info(): Promise<WorkspaceInfo>;
  listFiles(path: string, recursive?: boolean): Promise<FileListResponse>;
  readFile(path: string, encoding?: string): Promise<FileReadResponse>;
  stat(path: string): Promise<FileStatResponse>;
  writeFile(path: string, content: string, options: Record<string, unknown>): Promise<unknown>;
  delete(path: string, options: Record<string, unknown>): Promise<unknown>;
  mkdir(path: string, recursive?: boolean): Promise<unknown>;
  search(params: Omit<SearchWorkspaceParams, "workspaceId">): Promise<SearchResponse>;
  index(params: {
    path: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}

interface WorkspaceClient {
  getWorkspace(workspaceId?: string): WorkspaceApi;
  listWorkspaces(): Promise<WorkspacesListResponse>;
}

const getWorkspaceClient = (client: unknown) => client as WorkspaceClient;

function getParentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/") || (path.startsWith("/") ? "/" : ".");
}

// Re-export for other hooks to use
export { isWorkspaceV1Supported, isWorkspaceNotSupportedError };

// =============================================================================
// Workspace Info Hook
// =============================================================================

export const useWorkspaceInfo = (workspaceId?: string) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!workspaceId && isWorkspaceV1Supported(client),
    queryFn: (): Promise<WorkspaceInfo> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(workspaceId);
      return workspace.info();
    },
    queryKey: ["workspace", "info", workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

// =============================================================================
// List All Workspaces Hook
// =============================================================================

export const useWorkspaces = () => {
  const client = useMastraClient();

  return useQuery({
    queryFn: (): Promise<WorkspacesListResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      return getWorkspaceClient(client).listWorkspaces();
    },
    queryKey: ["workspaces"],
    retry: shouldRetryWorkspaceQuery,
  });
};

// =============================================================================
// Filesystem Hooks
// =============================================================================

export const useWorkspaceFiles = (
  path: string,
  options?: { enabled?: boolean; recursive?: boolean; workspaceId?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!path &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<FileListResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(options.workspaceId);
      return workspace.listFiles(path, options?.recursive);
    },
    queryKey: ["workspace", "files", path, options?.recursive, options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

export const useWorkspaceFile = (
  path: string,
  options?: { enabled?: boolean; encoding?: string; workspaceId?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!path &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<FileReadResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(options.workspaceId);
      return workspace.readFile(path, options?.encoding);
    },
    queryKey: ["workspace", "file", path, options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

export const useWorkspaceFileStat = (
  path: string,
  options?: { enabled?: boolean; workspaceId?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!path &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<FileStatResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(options.workspaceId);
      return workspace.stat(path);
    },
    queryKey: ["workspace", "stat", path, options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

export const useWriteWorkspaceFile = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: WriteFileParams) => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.writeFile(params.path, params.content, {
        encoding: params.encoding,
        recursive: params.recursive ?? true,
      });
    },
    onSuccess: (_, variables) => {
      const parentPath = getParentPath(variables.path);
      void queryClient.invalidateQueries({ queryKey: ["workspace", "files", parentPath] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "file", variables.path] });
    },
  });
};

export const useWriteWorkspaceFileFromFile = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: WriteFileFromFileParams) => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      // Convert file to base64
      const arrayBuffer = await params.file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCodePoint(byte), ""),
      );

      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.writeFile(params.path, base64, {
        encoding: "base64",
        recursive: params.recursive ?? true,
      });
    },
    onSuccess: (_, variables) => {
      const parentPath = getParentPath(variables.path);
      void queryClient.invalidateQueries({ queryKey: ["workspace", "files", parentPath] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "file", variables.path] });
    },
  });
};

export const useDeleteWorkspaceFile = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      path: string;
      recursive?: boolean;
      force?: boolean;
      workspaceId?: string;
    }) => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.delete(params.path, {
        force: params.force,
        recursive: params.recursive,
      });
    },
    onSuccess: (_, variables) => {
      const parentPath = getParentPath(variables.path);
      void queryClient.invalidateQueries({ queryKey: ["workspace", "files", parentPath] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "file", variables.path] });
    },
  });
};

export const useCreateWorkspaceDirectory = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { path: string; recursive?: boolean; workspaceId?: string }) => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.mkdir(params.path, params.recursive);
    },
    onSuccess: (_, variables) => {
      const parentPath = getParentPath(variables.path);
      void queryClient.invalidateQueries({ queryKey: ["workspace", "files", parentPath] });
    },
  });
};

// =============================================================================
// Search Hooks
// =============================================================================

export const useSearchWorkspace = () => {
  const client = useMastraClient();

  return useMutation({
    mutationFn: (params: SearchWorkspaceParams): Promise<SearchResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.search({
        minScore: params.minScore,
        mode: params.mode,
        query: params.query,
        topK: params.topK,
      });
    },
  });
};

export const useIndexWorkspaceContent = () => {
  const client = useMastraClient();

  return useMutation({
    mutationFn: (params: {
      workspaceId: string;
      path: string;
      content: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceClient(client).getWorkspace(params.workspaceId);
      return workspace.index({
        content: params.content,
        metadata: params.metadata,
        path: params.path,
      });
    },
  });
};
