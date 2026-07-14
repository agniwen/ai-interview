/**
 * Workspace tool constants.
 *
 * Inlined from @mastra/core/workspace/constants to avoid import compatibility
 * issues with older core versions that don't have the workspace module.
 */

export const WORKSPACE_TOOLS_PREFIX = "mastra_workspace" as const;

export const WORKSPACE_TOOLS = {
  FILESYSTEM: {
    DELETE: `${WORKSPACE_TOOLS_PREFIX}_delete` as const,
    EDIT_FILE: `${WORKSPACE_TOOLS_PREFIX}_edit_file` as const,
    FILE_STAT: `${WORKSPACE_TOOLS_PREFIX}_file_stat` as const,
    LIST_FILES: `${WORKSPACE_TOOLS_PREFIX}_list_files` as const,
    MKDIR: `${WORKSPACE_TOOLS_PREFIX}_mkdir` as const,
    READ_FILE: `${WORKSPACE_TOOLS_PREFIX}_read_file` as const,
    WRITE_FILE: `${WORKSPACE_TOOLS_PREFIX}_write_file` as const,
  },
  SANDBOX: {
    EXECUTE_COMMAND: `${WORKSPACE_TOOLS_PREFIX}_execute_command` as const,
    GET_PROCESS_OUTPUT: `${WORKSPACE_TOOLS_PREFIX}_get_process_output` as const,
    KILL_PROCESS: `${WORKSPACE_TOOLS_PREFIX}_kill_process` as const,
  },
  SEARCH: {
    INDEX: `${WORKSPACE_TOOLS_PREFIX}_index` as const,
    SEARCH: `${WORKSPACE_TOOLS_PREFIX}_search` as const,
  },
} as const;

export type WorkspaceToolName =
  | (typeof WORKSPACE_TOOLS.FILESYSTEM)[keyof typeof WORKSPACE_TOOLS.FILESYSTEM]
  | (typeof WORKSPACE_TOOLS.SEARCH)[keyof typeof WORKSPACE_TOOLS.SEARCH]
  | (typeof WORKSPACE_TOOLS.SANDBOX)[keyof typeof WORKSPACE_TOOLS.SANDBOX];
