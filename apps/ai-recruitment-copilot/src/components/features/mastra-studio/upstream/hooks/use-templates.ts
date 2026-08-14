import type { TemplateInstallationRequest } from "@mastra/client-js";
import { RequestContext } from "@mastra/core/request-context";
import { useMastraClient } from "@mastra/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";

export interface Template {
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  githubUrl: string;
  tags: string[];
  imageURL?: string;
  codeExample?: string;
  agents?: string[];
  tools?: string[];
  workflows?: string[];
  mcp?: string[];
  networks?: string[];
  videoURL?: string;
  useCase: string;
  supportedProviders: string[];
}

async function getMastraTemplateRepos(): Promise<{
  templates: Template[];
  tags: string[];
  providers: string[];
}> {
  const response = await fetch("https://mastra.ai/api/templates.json");
  if (!response.ok) {
    throw new Error(`获取模板失败：${response.statusText}`);
  }
  const templates = await response.json();
  const allTemplates = [
    {
      agents: ["weatherAgent"],
      description: "获取任意城市的天气信息。",
      githubUrl: "https://github.com/mastra-ai/weather-agent",
      imageURL: "",
      longDescription: "通过一个智能体、一个工作流和一个工具查询城市天气。",
      slug: "weather-agent",
      supportedProviders: ["openai", "anthropic", "google", "groq"],
      tags: ["智能体", "工作流", "工具"],
      title: "天气智能体",
      tools: ["weatherTool"],
      useCase: "",
      workflows: ["weatherWorkflow"],
    },
    ...templates,
  ];

  const allTags = [...new Set(allTemplates.flatMap((t) => t.tags))];
  const allProviders = [...new Set(allTemplates.flatMap((t) => t.supportedProviders))];

  return {
    providers: allProviders,
    tags: allTags,
    templates: allTemplates,
  };
}

async function getTemplateRepoByRepoName({
  repo,
  owner,
}: {
  repo: string;
  owner: string;
}): Promise<Template> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!response.ok) {
    throw new Error(`获取模板失败：${response.statusText}`);
  }
  const repoInfo = await response.json();
  if (!repoInfo.is_template) {
    throw new Error("该仓库不是模板仓库，请在仓库设置中将其设为模板。");
  }

  return {
    description: repoInfo.description ?? "",
    githubUrl: repoInfo.html_url,
    imageURL: "",
    longDescription: repoInfo.description ?? "",
    slug: repoInfo.name,
    supportedProviders: [],
    tags: [],
    title: repoInfo.name,
    useCase: "",
  };
}

async function getTemplateRepo({
  repoOrSlug,
  owner,
}: {
  repoOrSlug: string;
  owner: string;
}): Promise<Template> {
  const { templates } = await getMastraTemplateRepos();
  const template = templates.find((t) => t.slug === repoOrSlug);

  if (!template) {
    if (owner === "mastra-ai" && repoOrSlug.startsWith("template-")) {
      const templateRepo = templates.find(
        (candidate) => `template-${candidate.slug}` === repoOrSlug,
      );
      if (templateRepo) {
        return templateRepo;
      }
    }

    const templateRepo = await getTemplateRepoByRepoName({ owner, repo: repoOrSlug });

    if (templateRepo) {
      return templateRepo;
    }

    throw new Error(`未找到模板 ${repoOrSlug}`);
  }

  return template;
}

async function getTemplateRepoEnvVars({
  repo,
  owner,
  branch,
}: {
  repo: string;
  owner: string;
  branch: string;
}): Promise<Record<string, string>> {
  const envUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.env.example`;
  const envResponse = await fetch(envUrl);

  if (envResponse.ok) {
    const envContent = await envResponse.text();
    const envVars: Record<string, string> = {};
    for (const line of envContent.split("\n")) {
      // Skip empty lines and comments.
      if (!line || line.startsWith("#")) {
        continue;
      }

      const [key, value = ""] = line.split("=");
      if (key) {
        envVars[key] = [...value].every((item) => item === "*") ? "" : value.replaceAll('"', "");
      }
    }

    return envVars;
  }

  return {};
}

export const useMastraTemplates = () =>
  useQuery({
    queryFn: getMastraTemplateRepos,
    queryKey: ["mastra-templates"],
  });

export const useTemplateRepo = ({ repoOrSlug, owner }: { repoOrSlug: string; owner: string }) =>
  useQuery({
    queryFn: () => getTemplateRepo({ owner, repoOrSlug }),
    queryKey: ["template-repo", repoOrSlug, owner],
  });

export const useTemplateRepoEnvVars = ({
  repo,
  owner,
  branch,
}: {
  repo: string;
  owner: string;
  branch: string;
}) =>
  useQuery({
    queryFn: () => getTemplateRepoEnvVars({ branch, owner, repo }),
    queryKey: ["template-repo-env-vars", repo, owner, branch],
  });

export const useAgentBuilderWorkflow = () => {
  const client = useMastraClient();
  return useQuery({
    queryFn: async () => await client.getAgentBuilderAction("merge-template").details(),
    queryKey: ["agent-builder-workflow"],
  });
};

export const useCreateTemplateInstallRun = () => {
  const client = useMastraClient();
  return useMutation({
    mutationFn: async ({ runId }: { runId?: string }) =>
      await client.getAgentBuilderAction("merge-template").createRun({ runId }),
  });
};

export const useGetTemplateInstallRun = () => {
  const client = useMastraClient();
  return useMutation({
    mutationFn: async ({ runId }: { runId: string }) =>
      await client.getAgentBuilderAction("merge-template").runById(runId),
  });
};

const normalizeError = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error === null || error === undefined) {
    return "未知错误";
  }
  if (error instanceof Error) {
    return typeof error.message === "string" && error.message.length > 0
      ? error.message
      : "未知错误";
  }
  if (typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
};

export interface TemplateWorkflowStep extends Record<string, unknown> {
  description?: string;
  error?: unknown;
  id?: string;
  output?: unknown;
  status?: string;
}

export interface TemplateWorkflowInfo {
  allSteps?: Record<string, TemplateWorkflowStep>;
}

interface TemplateInstallPayload extends Record<string, unknown> {
  description?: string;
  error?: unknown;
  id?: string;
  output?: unknown;
  runId?: string;
  status?: string;
}

interface TemplateInstallRecord {
  eventTimestamp?: string;
  payload: TemplateInstallPayload;
  runId?: string;
  type: string;
}

export interface TemplateWorkflowState extends Record<string, unknown> {
  status?: string;
  steps: Record<string, TemplateWorkflowStep>;
}

export interface TemplateInstallState extends Record<string, unknown> {
  error?: string;
  payload: {
    currentStep?: TemplateWorkflowStep | null;
    workflowState: TemplateWorkflowState;
  };
  phase?: string;
  runId?: string;
  status?: string;
}

function createPendingSteps(workflowInfo?: TemplateWorkflowInfo) {
  const steps: Record<string, TemplateWorkflowStep> = {};
  for (const [stepId, step] of Object.entries(workflowInfo?.allSteps ?? {})) {
    steps[stepId] = {
      description: step.description,
      id: step.id ?? stepId,
      status: "pending",
    };
  }
  return steps;
}

function ensureWorkflowSteps(
  state: TemplateInstallState,
  workflowInfo?: TemplateWorkflowInfo,
): TemplateInstallState {
  if (Object.keys(state.payload.workflowState.steps).length > 0 || !workflowInfo?.allSteps) {
    return state;
  }
  return {
    ...state,
    payload: {
      ...state.payload,
      workflowState: {
        ...state.payload.workflowState,
        steps: createPendingSteps(workflowInfo),
      },
    },
  };
}

function applyStepStart(
  state: TemplateInstallState,
  payload: TemplateInstallPayload,
): TemplateInstallState {
  const stepId = payload.id;
  if (!stepId) {
    return state;
  }
  const runningStep = { id: stepId, startTime: new Date(), status: "running", ...payload };
  return {
    ...state,
    payload: {
      ...state.payload,
      currentStep: runningStep,
      workflowState: {
        ...state.payload.workflowState,
        steps: {
          ...state.payload.workflowState.steps,
          [stepId]: { ...state.payload.workflowState.steps[stepId], ...runningStep },
        },
      },
    },
    phase: "processing",
  };
}

function applyStepResult(
  state: TemplateInstallState,
  payload: TemplateInstallPayload,
): TemplateInstallState {
  const stepId = payload.id;
  if (!stepId) {
    return state;
  }
  const completedStep = {
    endTime: new Date(),
    error: payload.error,
    output: payload.output,
    status: payload.status,
  };
  let nextState: TemplateInstallState = {
    ...state,
    payload: {
      ...state.payload,
      currentStep: { ...state.payload.currentStep, ...completedStep },
      workflowState: {
        ...state.payload.workflowState,
        steps: {
          ...state.payload.workflowState.steps,
          [stepId]: { ...state.payload.workflowState.steps[stepId], ...completedStep },
        },
      },
    },
  };

  if (payload.status === "failed" && payload.error) {
    const error = normalizeError(payload.error);
    nextState = {
      ...nextState,
      error,
      errorTimestamp: new Date(),
      failedStep: { description: payload.description || stepId, error, id: stepId },
      payload: {
        ...nextState.payload,
        workflowState: { ...nextState.payload.workflowState, status: "failed" },
      },
      phase: "error",
      status: "failed",
    };
  }
  return nextState;
}

function applyFinish(
  state: TemplateInstallState,
  payload: TemplateInstallPayload,
): TemplateInstallState {
  if (state.phase === "error" || state.status === "failed") {
    return { ...state, completedAt: new Date() };
  }
  const status = payload.status || "completed";
  return {
    ...state,
    completedAt: new Date(),
    payload: {
      ...state.payload,
      currentStep: null,
      workflowState: { ...state.payload.workflowState, status },
    },
    phase: "completed",
    status,
  };
}

function applyError(
  state: TemplateInstallState,
  payload: TemplateInstallPayload,
): TemplateInstallState {
  const error = normalizeError(payload.error);
  return {
    ...state,
    error,
    errorTimestamp: new Date(),
    payload: {
      ...state.payload,
      workflowState: { ...state.payload.workflowState, status: "failed" },
    },
    phase: "error",
    status: "failed",
  };
}

const processTemplateInstallRecord = (
  record: TemplateInstallRecord,
  currentState: TemplateInstallState,
  workflowInfo?: TemplateWorkflowInfo,
): { newState: TemplateInstallState } => {
  const state = ensureWorkflowSteps(currentState, workflowInfo);
  switch (record.type) {
    case "start":
    case "workflow-start": {
      return {
        newState: {
          ...state,
          eventTimestamp: new Date().toISOString(),
          payload: {
            currentStep: null,
            workflowState: { status: "running", steps: createPendingSteps(workflowInfo) },
          },
          phase: "initializing",
          runId: record.runId || record.payload.runId,
          status: "running",
        },
      };
    }
    case "step-start":
    case "workflow-step-start": {
      return { newState: applyStepStart(state, record.payload) };
    }
    case "step-result":
    case "workflow-step-result": {
      return { newState: applyStepResult(state, record.payload) };
    }
    case "step-finish":
    case "workflow-step-finish": {
      return { newState: { ...state, payload: { ...state.payload, currentStep: null } } };
    }
    case "finish":
    case "workflow-finish": {
      return { newState: applyFinish(state, record.payload) };
    }
    case "error": {
      return { newState: applyError(state, record.payload) };
    }
    default: {
      return { newState: state };
    }
  }
};

// Shared localStorage helpers for template installation state
const saveTemplateStateToLocalStorage = (runId: string, state: TemplateInstallState) => {
  try {
    localStorage.setItem(
      `template-install-${runId}`,
      JSON.stringify({
        state,
        timestamp: Date.now(),
      }),
    );
  } catch (error) {
    console.warn("Failed to save template state to localStorage:", error);
  }
};

// Shared helper for processing template installation streams (streamlined)
const createInitialInstallState = (runId?: string): TemplateInstallState => ({
  eventTimestamp: new Date().toISOString(),
  payload: { currentStep: null, workflowState: { steps: {} } },
  phase: "running",
  runId,
});

const useTemplateStreamProcessor = (workflowInfo?: TemplateWorkflowInfo, runId?: string) => {
  const [streamResult, setStreamResult] = useState<Partial<TemplateInstallState>>({});
  const [isStreaming, setIsStreaming] = useState(false);

  const processStream = async (
    stream: ReadableStream<TemplateInstallRecord>,
    initialRunId?: string,
  ) => {
    setIsStreaming(true);
    setStreamResult({});

    if (!stream) {
      throw new Error("未返回数据流");
    }

    const reader = stream.getReader();

    // Do not publish this minimal state until an event arrives.
    let currentState = createInitialInstallState(initialRunId || runId);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const { newState } = processTemplateInstallRecord(value, currentState, workflowInfo);

        currentState = newState;
        setStreamResult(newState);

        // Save to localStorage for refresh recovery (same as watch)
        const effectiveRunId = value.runId || initialRunId || runId;
        if (effectiveRunId) {
          saveTemplateStateToLocalStorage(effectiveRunId, newState);
        }
      }
    } catch (error) {
      console.error("💥 [processStream] Error processing template installation stream:", error);

      // Use the helper for error handling too
      const { newState } = processTemplateInstallRecord(
        {
          payload: { error: error instanceof Error ? error.message : "未知错误" },
          type: "error",
        },
        currentState,
        workflowInfo,
      );

      setStreamResult(newState);
    } finally {
      setIsStreaming(false);
      reader.releaseLock();
    }
  };

  return {
    isStreaming,
    processStream,
    streamResult,
  };
};

interface ErrorDetails {
  code?: unknown;
  message?: string;
  name?: string;
}

function getErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  if (!error || typeof error !== "object") {
    return {};
  }
  const value = error as Record<string, unknown>;
  return {
    code: value.code,
    message: typeof value.message === "string" ? value.message : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
  };
}

function isNetworkFailure(error: unknown) {
  const details = getErrorDetails(error);
  return (
    details.message?.includes("Failed to fetch") ||
    details.message?.includes("NetworkError") ||
    details.message?.includes("network error") ||
    details.message?.includes("fetch") ||
    details.code === "NETWORK_ERROR" ||
    details.name === "TypeError"
  );
}

function wait(delay: number) {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => resolve(null), delay);
  return promise;
}

export const useStreamTemplateInstall = (workflowInfo?: TemplateWorkflowInfo) => {
  const client = useMastraClient();
  const { streamResult, isStreaming, processStream } = useTemplateStreamProcessor(workflowInfo);

  const streamInstall = useMutation({
    mutationFn: async ({
      inputData,
      selectedModel,
      runId,
    }: {
      inputData: TemplateInstallationRequest;
      selectedModel: { provider: string; modelId: string };
      runId: string;
    }) => {
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          const template = client.getAgentBuilderAction("merge-template");
          const requestContext = new RequestContext();
          requestContext.set("selectedModel", selectedModel);
          const stream = await template.stream({ inputData, requestContext }, runId);
          await processStream(stream, runId);

          // If we get here, the stream completed successfully
          return;
        } catch (error) {
          console.error(`💥 [streamInstall] Attempt ${attempt} failed:`, error);
          const isNetworkError = isNetworkFailure(error);

          console.warn(`Stream attempt ${attempt}/${maxRetries} failed:`, error);

          if (isNetworkError) {
            // For stream network errors, provide helpful message since switching context is complex
            const errorMessage = runId
              ? `安装模板时网络异常（可能由热更新引起）。请刷新页面，并使用运行 ID ${runId} 从中断处继续。`
              : "安装模板时网络异常（可能由热更新引起），请重试。";

            console.error("🔌 Stream network error:", errorMessage);
            throw new Error(errorMessage, { cause: error });
          }

          // If it's not a network error or we've exhausted retries, throw
          console.error(
            "❌ [streamInstall] Non-network error or max retries reached, throwing:",
            error,
          );
          throw error;
        }
      }
    },
  });

  return {
    isStreaming,
    streamInstall,
    streamResult,
  };
};

/**
 * Hook for observing template installation with full replay capability.
 * Uses observeStream() which replays cached execution from beginning, then continues live.
 */
export const useObserveStreamTemplateInstall = (workflowInfo?: TemplateWorkflowInfo) => {
  const client = useMastraClient();
  const { streamResult, isStreaming, processStream } = useTemplateStreamProcessor(workflowInfo);

  const observeInstall = useMutation({
    mutationFn: async ({ runId }: { runId: string }) => {
      const maxRetries = 3;
      // Two seconds keeps hot-reload recovery responsive without hammering the server.
      const retryDelay = 2000;

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          // Initialize state - but observeStream will replay full history
          // so we don't need to rely on localStorage as fallback
          const template = client.getAgentBuilderAction("merge-template");

          // Use observeStream to get full replay + live updates
          const stream = await template.observeStream({ runId });
          await processStream(stream, runId);

          // If we get here, the observe stream completed successfully
          return;
        } catch (error) {
          console.error(`💥 [observeInstall] Attempt ${attempt} failed:`, error);
          const isNetworkError = isNetworkFailure(error);

          console.warn(`ObserveStream attempt ${attempt}/${maxRetries} failed:`, error);

          if (isNetworkError && attempt < maxRetries) {
            console.info(
              `🔄 ObserveStream network error detected (likely hot reload), retrying in ${retryDelay}ms... (attempt ${attempt + 1}/${maxRetries})`,
            );
            await wait(retryDelay);
            continue;
          }

          // If it's not a network error or we've exhausted retries, throw
          console.error(
            "❌ [observeInstall] Non-network error or max retries reached, throwing:",
            error,
          );
          throw error;
        }
      }
    },
  });

  return {
    isStreaming,
    observeInstall,
    streamResult,
  };
};
