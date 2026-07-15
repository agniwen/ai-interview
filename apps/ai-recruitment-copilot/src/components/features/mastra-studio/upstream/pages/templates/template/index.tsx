import { version } from "@mastra/core/package.json";
import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { BrainIcon, TagIcon, WorkflowIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import {
  Link,
  useParams,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import { TemplateFailure } from "@/components/features/mastra-studio/upstream/domains/templates/template-failure";
import { TemplateForm } from "@/components/features/mastra-studio/upstream/domains/templates/template-form";
import { TemplateInfo } from "@/components/features/mastra-studio/upstream/domains/templates/template-info";
import { TemplateInstallation } from "@/components/features/mastra-studio/upstream/domains/templates/template-installation";
import { TemplateSuccess } from "@/components/features/mastra-studio/upstream/domains/templates/template-success";
import {
  useTemplateRepo,
  useTemplateRepoEnvVars,
  useStreamTemplateInstall,
  useCreateTemplateInstallRun,
  useAgentBuilderWorkflow,
  useGetTemplateInstallRun,
  useObserveStreamTemplateInstall,
} from "@/components/features/mastra-studio/upstream/hooks/use-templates";
import type { TemplateInstallState } from "@/components/features/mastra-studio/upstream/hooks/use-templates";
import { cn } from "@/components/features/mastra-studio/upstream/lib/utils";

interface TemplateValidationError {
  message?: string;
  type?: string;
}

interface TemplateInstallRunData {
  snapshot?: {
    result?: {
      error?: unknown;
      message?: unknown;
      success?: boolean;
      validationResults?: {
        errors?: TemplateValidationError[];
        remainingErrors: number;
        valid: boolean;
      };
    };
    status?: string;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTemplateValidationError(error: unknown): error is TemplateValidationError {
  return Boolean(error && typeof error === "object");
}

function getStreamValidationErrors(
  result: Partial<TemplateInstallState>,
): TemplateValidationError[] | undefined {
  const { validationResults } = result;
  if (!validationResults || typeof validationResults !== "object") {
    return;
  }
  const { errors } = validationResults as Record<string, unknown>;
  return Array.isArray(errors) ? errors.filter(isTemplateValidationError) : undefined;
}

type TemplateData = NonNullable<ReturnType<typeof useTemplateRepo>["data"]>;

function buildTemplateInfoData(template?: TemplateData) {
  return [
    {
      icon: <ToolsIcon />,
      key: "tools",
      label: "工具",
      value: template?.tools?.length ? template.tools.join(", ") : "n/a",
    },
    {
      icon: <AgentIcon />,
      key: "agents",
      label: "智能体",
      value: template?.agents?.length ? template.agents.join(", ") : "n/a",
    },
    {
      icon: <WorkflowIcon />,
      key: "workflows",
      label: "工作流",
      value: template?.workflows?.length ? template.workflows.join(", ") : "n/a",
    },
    {
      icon: <BrainIcon />,
      key: "providers",
      label: "提供商",
      value: template?.supportedProviders?.length ? template.supportedProviders.join(", ") : "n/a",
    },
    {
      icon: <TagIcon />,
      key: "tags",
      label: "标签",
      value: template?.tags?.length ? template.tags.join(", ") : "n/a",
    },
  ];
}

function getTemplateRepoName(template: TemplateData | undefined, templateSlug: string): string {
  if (!template?.githubUrl) {
    return `template-${templateSlug}`;
  }
  return new URL(template.githubUrl).pathname.split("/")[2] ?? `template-${templateSlug}`;
}

function TemplateContent({
  completedRunValidationErrors,
  failure,
  fallbackValidationErrors,
  formProps,
  installationProps,
  installedEntities,
  isObserving,
  isStreaming,
  success,
  template,
}: {
  completedRunValidationErrors: TemplateValidationError[];
  failure: string | null;
  fallbackValidationErrors?: TemplateValidationError[];
  formProps: ComponentProps<typeof TemplateForm>;
  installationProps: Omit<ComponentProps<typeof TemplateInstallation>, "name">;
  installedEntities: ComponentProps<typeof TemplateSuccess>["installedEntities"];
  isObserving: boolean;
  isStreaming: boolean;
  success: boolean;
  template?: TemplateData;
}) {
  if (!template) {
    return null;
  }
  const validationErrors =
    completedRunValidationErrors.length > 0
      ? completedRunValidationErrors
      : fallbackValidationErrors;

  return (
    <>
      {(isStreaming || isObserving) && (
        <TemplateInstallation name={template.title} {...installationProps} />
      )}
      {success && (
        <TemplateSuccess
          name={template.title}
          installedEntities={installedEntities}
          linkComponent={Link}
        />
      )}
      {failure && <TemplateFailure errorMsg={failure} validationErrors={validationErrors} />}
      {!isStreaming && !isObserving && !success && !failure && <TemplateForm {...formProps} />}
    </>
  );
}

export default function Template() {
  const { templateSlug } = useParams() as { templateSlug: string };
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModelProvider, setSelectedModelProvider] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string>("");
  const [hasAutoResumed, setHasAutoResumed] = useState(false);
  const [isFreshInstall, setIsFreshInstall] = useState(false);
  const [completedRunValidationErrors, setCompletedRunValidationErrors] = useState<
    TemplateValidationError[]
  >([]);

  const { data: template, isLoading: isLoadingTemplate } = useTemplateRepo({
    owner: "mastra-ai",
    repoOrSlug: templateSlug,
  });

  const isBeta = version?.includes("beta") ?? false;
  const branch = isBeta ? "beta" : "main";

  const { data: templateEnvVars, isLoading: isLoadingEnvVars } = useTemplateRepoEnvVars({
    branch,
    owner: "mastra-ai",
    repo: getTemplateRepoName(template, templateSlug),
  });

  // Fetch agent builder workflow info for step pre-population
  const { data: workflowInfo, isLoading: isLoadingWorkflow } = useAgentBuilderWorkflow();
  const { mutateAsync: createTemplateInstallRun, isPending: isCreatingRun } =
    useCreateTemplateInstallRun();
  const { mutateAsync: getTemplateInstallRun } = useGetTemplateInstallRun();
  const { streamInstall, streamResult, isStreaming } = useStreamTemplateInstall(workflowInfo);
  const {
    observeInstall,
    streamResult: observeStreamResult,
    isStreaming: isObserving,
  } = useObserveStreamTemplateInstall(workflowInfo);

  // Check for completed runs after hot reload recovery
  useEffect(() => {
    const runId = searchParams.get("runId");

    if (runId && !success && !failure && !isStreaming && !isObserving) {
      console.info("🔄 Checking completed run after hot reload:", { runId });

      setCurrentRunId(runId);
      const checkCompletedRun = async () => {
        try {
          const runData = (await getTemplateInstallRun({ runId })) as TemplateInstallRunData;
          const { snapshot } = runData;

          if (snapshot?.status === "success" && snapshot.result?.success) {
            setSuccess(true);
            return;
          }
          if (snapshot?.result?.success !== false) {
            return;
          }

          const { validationResults } = snapshot.result;
          if (
            validationResults &&
            !validationResults.valid &&
            validationResults.remainingErrors > 0
          ) {
            setFailure(
              `模板安装已完成，但仍有 ${validationResults.remainingErrors} 个验证问题未解决。`,
            );
            setCompletedRunValidationErrors(validationResults.errors || []);
            return;
          }

          const errorValue = snapshot.result.message || snapshot.result.error || "模板安装失败";
          setFailure(typeof errorValue === "string" ? errorValue : String(errorValue));
        } catch (error) {
          console.error("❌ Failed to fetch run details:", error);
          setFailure("重新加载后无法获取安装状态");
        }
      };
      void checkCompletedRun();
    }
  }, [searchParams, success, failure, isStreaming, isObserving, getTemplateInstallRun]);

  // Auto-resume watching from URL parameters
  useEffect(() => {
    const runId = searchParams.get("runId");
    const shouldResume = searchParams.get("resume");
    const savedProvider = searchParams.get("provider");

    // Only resume watching if we have explicit resume parameters and workflow info is loaded
    if (
      runId &&
      shouldResume === "true" &&
      savedProvider &&
      !isStreaming &&
      !isObserving &&
      !hasAutoResumed &&
      !isFreshInstall &&
      workflowInfo
    ) {
      setCurrentRunId(runId);
      // Prevent multiple auto-resume attempts.
      setHasAutoResumed(true);

      const resumeInstall = async () => {
        try {
          const runData = (await getTemplateInstallRun({ runId })) as TemplateInstallRunData;
          if (runData.snapshot?.status === "running") {
            await observeInstall.mutateAsync({ runId });
          }
          setSearchParams((prev) => {
            const newParams = new URLSearchParams(prev);
            newParams.delete("resume");
            return newParams;
          });
        } catch (error) {
          console.error("❌ Failed to resume template installation:", error);
          const message = getErrorMessage(error);
          if (message.includes("404") || message.includes("not found")) {
            setFailure("未找到模板安装运行记录，它可能已过期或已经完成。");
            return;
          }
          setFailure("恢复模板安装失败，请重试。");
        }
      };
      void resumeInstall();
    }
  }, [
    searchParams,
    templateSlug,
    isStreaming,
    isObserving,
    hasAutoResumed,
    isFreshInstall,
    workflowInfo,
    getTemplateInstallRun,
    observeInstall,
    setSearchParams,
  ]);

  const providerOptions = [
    { label: "OpenAI", value: "openai" },
    { label: "Anthropic", value: "anthropic" },
    { label: "Groq", value: "groq" },
    { label: "Google", value: "google" },
  ];

  const templateInfoData = buildTemplateInfoData(template);
  const installedEntities = templateInfoData.slice(0, 3).filter((entity) => entity.value !== "n/a");

  useEffect(() => {
    if (templateEnvVars) {
      setVariables(templateEnvVars);
    }
  }, [templateEnvVars]);

  const workflowPhase = streamResult?.phase ?? observeStreamResult?.phase;
  const workflowError = streamResult?.error ?? observeStreamResult?.error;

  // Monitor for workflow errors — only react to phase/error changes, not full object identity
  useEffect(() => {
    if (workflowPhase === "error" && workflowError) {
      setFailure(typeof workflowError === "string" ? workflowError : String(workflowError));
    }
  }, [workflowError, workflowPhase]);

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
  };

  const handleModelUpdate = (params: { provider: string; modelId: string }) => {
    setSelectedModelProvider(params.provider);
    setSelectedModelId(params.modelId);
    return Promise.resolve({ message: "模型已成功更新" });
  };

  const handleInstallTemplate = async () => {
    const missingVariables: string[] = [];
    for (const [key, value] of Object.entries(variables)) {
      if (value === "") {
        missingVariables.push(key);
      }
    }

    if (missingVariables.length > 0) {
      setErrors(missingVariables);
      return;
    }

    if (template) {
      // Reset states
      setFailure(null);
      setSuccess(false);
      setCurrentRunId("");
      // Prevent the auto-resume watcher from starting for this fresh install.
      setIsFreshInstall(true);

      try {
        const repo = template.githubUrl || `https://github.com/mastra-ai/template-${template.slug}`;
        const templateParams = {
          ref: branch,
          repo,
          slug: template.slug,
          variables: variables as Record<string, string>,
        };

        // Step 1: Create the template installation run
        const { runId } = await createTemplateInstallRun({});

        setCurrentRunId(runId);

        // Update URL with runId and provider for resume capability
        // Note: We don't save variables in URL for security (may contain sensitive env vars)
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev);
          newParams.set("runId", runId);
          newParams.set("resume", "true");
          newParams.set("provider", selectedProvider || "openai");
          return newParams;
        });

        // Step 2: Start streaming the installation with the runId
        await streamInstall.mutateAsync({
          inputData: templateParams,
          runId,
          selectedModel: {
            modelId: selectedModelId,
            provider: selectedModelProvider,
          },
        });
      } catch (error) {
        // Allow a later retry to use the resume watcher again.
        setIsFreshInstall(false);
        setFailure(getErrorMessage(error) || "模板安装失败");
        console.error("Template installation failed", error);
      }
    }
  };

  const handleVariableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (value.trim() === "") {
      setErrors((prev) => [...prev, name]);
    } else {
      setErrors((prev) => prev.filter((error) => error !== name));
    }

    setVariables((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const formProps: ComponentProps<typeof TemplateForm> = {
    defaultModelId: selectedModelId,
    defaultModelProvider: selectedModelProvider,
    errors,
    handleInstallTemplate,
    handleVariableChange,
    isInstalling: isCreatingRun,
    isLoadingEnvVars: isLoadingEnvVars || isLoadingWorkflow,
    onModelUpdate: handleModelUpdate,
    onProviderChange: handleProviderChange,
    providerOptions,
    selectedProvider,
    setErrors,
    setVariables,
    variables,
  };
  const installationProps: Omit<ComponentProps<typeof TemplateInstallation>, "name"> = {
    runId: currentRunId,
    streamResult: isObserving ? observeStreamResult : streamResult,
    workflowInfo,
  };
  const fallbackValidationErrors =
    getStreamValidationErrors(streamResult) ?? getStreamValidationErrors(observeStreamResult);

  return (
    <MainContentLayout>
      <div className={cn("w-full lg:px-12 h-full overflow-y-scroll")}>
        <div className="p-6 w-full max-w-[80rem] mx-auto grid gap-y-4">
          <TemplateInfo
            isLoading={isLoadingTemplate}
            title={template?.title}
            description={template?.longDescription}
            imageURL={template?.imageURL}
            githubUrl={template?.githubUrl}
            infoData={templateInfoData}
            templateSlug={templateSlug}
          />
          <TemplateContent
            completedRunValidationErrors={completedRunValidationErrors}
            failure={failure}
            fallbackValidationErrors={fallbackValidationErrors}
            formProps={formProps}
            installationProps={installationProps}
            installedEntities={installedEntities}
            isObserving={isObserving}
            isStreaming={isStreaming}
            success={success}
            template={template}
          />
        </div>
      </div>
    </MainContentLayout>
  );
}
