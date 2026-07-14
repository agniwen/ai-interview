"use client";

/* oxlint-disable max-lines -- this page intentionally composes the Agent, Workflow, and parser debug panels. */

import { useMutation, useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconPlayerPlay } from "@tabler/icons-react";
import { JsonEditor } from "@visual-json/react";
import type { JsonValue } from "@visual-json/react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import { supportedResumeDocumentAccept } from "@arc/shared/resume-documents";

import { PageHeader } from "@/components/features/studio/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isApiError, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

interface JsonSchema {
  default?: unknown;
  enum?: unknown[];
  examples?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
}

interface AgentDebugResource {
  description: string;
  id: string;
  key: string;
  name: string;
}

interface WorkflowDebugResource {
  description: string;
  id: string;
  inputKind: "json" | "resume-file";
  inputSchema: JsonSchema;
  key: string;
  steps: string[];
}

interface AgentDebugResources {
  agents: AgentDebugResource[];
  workflows: WorkflowDebugResource[];
}

interface AgentRunResult {
  detailsJson: string;
  durationMs: number;
  finishReason?: string;
  runId?: string;
  text: string;
  traceId?: string;
  usage?: Record<string, number | undefined>;
}

interface WorkflowRunResult {
  durationMs: number;
  resultJson: string;
  runId: string;
  status: string;
  stepsJson: string;
  traceId?: string;
}

interface ParserDebugResult {
  fileName: string;
  ocr: {
    pageCount: number;
    text: string;
    textSource: string;
  };
  parsedStructured: JsonValue;
  resumeProfile: ResumeProfile;
}

const visualJsonStyle = {
  "--vj-accent": "hsl(var(--primary))",
  "--vj-bg": "hsl(var(--background))",
  "--vj-border": "hsl(var(--border))",
  "--vj-font": "var(--font-mono)",
  "--vj-muted": "hsl(var(--muted))",
  "--vj-text": "hsl(var(--foreground))",
} as CSSProperties;

function toJsonValue(value: unknown): JsonValue {
  return value === undefined ? null : (structuredClone(value) as JsonValue);
}

function parseJsonValue(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function agentRunJsonValue(result: AgentRunResult): JsonValue {
  const { detailsJson, ...summary } = result;
  return toJsonValue({ ...summary, details: parseJsonValue(detailsJson) });
}

function schemaType(schema: JsonSchema): string | undefined {
  return Array.isArray(schema.type) ? schema.type.find((type) => type !== "null") : schema.type;
}

function exampleFromSchema(schema: JsonSchema): unknown {
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (schema.examples?.length) {
    return schema.examples[0];
  }
  if (schema.enum?.length) {
    return schema.enum[0];
  }

  switch (schemaType(schema)) {
    case "array": {
      return [];
    }
    case "boolean": {
      return false;
    }
    case "integer":
    case "number": {
      return 0;
    }
    case "object": {
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, property]) => [
          key,
          exampleFromSchema(property),
        ]),
      );
    }
    case "string": {
      return "";
    }
    default: {
      return {};
    }
  }
}

function workflowDraft(resource: WorkflowDebugResource | undefined): string {
  return JSON.stringify(exampleFromSchema(resource?.inputSchema ?? { type: "object" }), null, 2);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function failureMetadata(error: unknown): {
  durationMs: number;
  runId?: string;
  traceId?: string;
} | null {
  if (!(isApiError(error) && error.payload && typeof error.payload === "object")) {
    return null;
  }
  const payload = error.payload as Record<string, unknown>;
  if (typeof payload.durationMs !== "number") {
    return null;
  }
  return {
    durationMs: payload.durationMs,
    runId: typeof payload.runId === "string" ? payload.runId : undefined,
    traceId: typeof payload.traceId === "string" ? payload.traceId : undefined,
  };
}

function VisualJsonPanel({ height = 480, value }: { height?: number; value: JsonValue }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <JsonEditor
        height={height}
        readOnly
        sidebarOpen
        style={visualJsonStyle}
        treeShowCounts
        treeShowValues
        value={value}
      />
    </div>
  );
}

function ResourceDebuggerSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-9 w-24" />
      </CardContent>
    </Card>
  );
}

function ResultMetadata({
  durationMs,
  runId,
  traceId,
  tokenUsageUnavailable,
  usage,
}: {
  durationMs: number;
  runId?: string;
  traceId?: string;
  tokenUsageUnavailable?: boolean;
  usage?: Record<string, number | undefined>;
}) {
  const totalTokens = usage?.totalTokens;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{durationMs} ms</Badge>
      {typeof totalTokens === "number" ? (
        <Badge variant="outline">{totalTokens.toLocaleString()} tokens</Badge>
      ) : null}
      {tokenUsageUnavailable ? <Badge variant="outline">Token 汇总不可用</Badge> : null}
      {runId ? <Badge variant="outline">Run {runId}</Badge> : null}
      {traceId ? <Badge variant="outline">Trace {traceId}</Badge> : null}
    </div>
  );
}

function AgentDebugger({ resources, slug }: { resources: AgentDebugResource[]; slug: string }) {
  const [selectedKey, setSelectedKey] = useState(resources[0]?.key ?? "");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const selected = resources.find((resource) => resource.key === selectedKey) ?? resources[0];
  const mutation = useMutation({
    mutationFn: ({ key, message }: { key: string; message: string }) =>
      rpcFetch<AgentRunResult>(
        rpc.api.w[":slug"].studio["agent-debug"].agents[":key"].run.$post({
          json: { prompt: message },
          param: { key, slug },
        }),
        "Agent 调试运行失败",
      ),
    onError: (error) => toast.error(errorMessage(error, "Agent 调试运行失败")),
    onMutate: () => setResult(null),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Agent 运行完成");
    },
  });
  const failedRun = failureMetadata(mutation.error);

  if (!selected) {
    return (
      <Alert>
        <IconAlertCircle />
        <AlertTitle>没有可调试的 Agent</AlertTitle>
        <AlertDescription>请先在 Mastra 实例中注册 Agent。</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent 运行</CardTitle>
          <CardDescription>选择已注册的 Agent，在当前工作区上下文中执行一次调试。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!prompt.trim()) {
                return;
              }
              mutation.mutate({ key: selected.key, message: prompt.trim() });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="agent-debug-agent">Agent</FieldLabel>
                <Select
                  value={selected.key}
                  onValueChange={(value) => {
                    setSelectedKey(value as string);
                    setResult(null);
                    mutation.reset();
                  }}
                >
                  <SelectTrigger className="w-full" id="agent-debug-agent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {resources.map((resource) => (
                        <SelectItem key={resource.key} value={resource.key}>
                          {resource.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {selected.description || selected.id} · {selected.key}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-debug-prompt">调试消息</FieldLabel>
                <Textarea
                  id="agent-debug-prompt"
                  placeholder="输入希望 Agent 处理的内容"
                  rows={10}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </Field>
              <Button disabled={mutation.isPending || !prompt.trim()} type="submit">
                {mutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconPlayerPlay data-icon="inline-start" />
                )}
                {mutation.isPending ? "运行中" : "运行 Agent"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {mutation.isError ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Agent 运行失败</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            {errorMessage(mutation.error, "请检查输入后重试。")}
            {failedRun ? <ResultMetadata {...failedRun} /> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>运行结果</CardTitle>
            <CardDescription>
              <ResultMetadata
                durationMs={result.durationMs}
                runId={result.runId}
                traceId={result.traceId}
                usage={result.usage}
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="response">
              <TabsList>
                <TabsTrigger value="response">回复</TabsTrigger>
                <TabsTrigger value="details">调用详情</TabsTrigger>
              </TabsList>
              <TabsContent className="pt-4" value="response">
                <ScrollArea className="max-h-[32rem]" scrollFade>
                  <pre className="whitespace-pre-wrap text-sm leading-6">
                    {result.text || "Agent 未返回文本。"}
                  </pre>
                </ScrollArea>
              </TabsContent>
              <TabsContent className="pt-4" value="details">
                <VisualJsonPanel value={agentRunJsonValue(result)} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function WorkflowDebugger({
  resources,
  slug,
}: {
  resources: WorkflowDebugResource[];
  slug: string;
}) {
  const [selectedKey, setSelectedKey] = useState(resources[0]?.key ?? "");
  const selected = resources.find((resource) => resource.key === selectedKey) ?? resources[0];
  const [draft, setDraft] = useState(() => workflowDraft(selected));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileResetKey, setFileResetKey] = useState(0);
  const [result, setResult] = useState<WorkflowRunResult | null>(null);
  const mutation = useMutation({
    mutationFn: (
      variables:
        | { file: File; inputKind: "resume-file"; key: string }
        | { input: unknown; inputKind: "json"; key: string },
    ) => {
      if (variables.inputKind === "resume-file") {
        const formData = new FormData();
        formData.append("resume", variables.file);
        return apiFetch<WorkflowRunResult>(
          `/api/w/${encodeURIComponent(slug)}/studio/agent-debug/workflows/${encodeURIComponent(variables.key)}/run-file`,
          { body: formData, method: "POST" },
        );
      }
      return rpcFetch<WorkflowRunResult>(
        rpc.api.w[":slug"].studio["agent-debug"].workflows[":key"].run.$post({
          json: { input: variables.input },
          param: { key: variables.key, slug },
        }),
        "Workflow 调试运行失败",
      );
    },
    onError: (error) => toast.error(errorMessage(error, "Workflow 调试运行失败")),
    onMutate: () => setResult(null),
    onSuccess: (data) => {
      setResult(data);
      toast.success("Workflow 运行完成");
    },
  });
  const failedRun = failureMetadata(mutation.error);

  if (!selected) {
    return (
      <Alert>
        <IconAlertCircle />
        <AlertTitle>没有可调试的 Workflow</AlertTitle>
        <AlertDescription>请先在 Mastra 实例中注册 Workflow。</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Workflow 运行</CardTitle>
          <CardDescription>
            {selected.inputKind === "resume-file"
              ? "上传简历文件，执行已注册的真实 Workflow 并查看各步骤输出。"
              : "根据 Workflow Input Schema 编辑 JSON，并查看各步骤输出。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (selected.inputKind === "resume-file") {
                if (!file) {
                  setDraftError("请选择一份简历文件。");
                  return;
                }
                if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
                  setDraftError("简历文件不能超过 20 MB。");
                  return;
                }
                setDraftError(null);
                mutation.mutate({ file, inputKind: "resume-file", key: selected.key });
                return;
              }
              try {
                const input = JSON.parse(draft) as unknown;
                setDraftError(null);
                mutation.mutate({ input, inputKind: "json", key: selected.key });
              } catch {
                setDraftError("请输入合法的 JSON。");
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="agent-debug-workflow">Workflow</FieldLabel>
                <Select
                  value={selected.key}
                  onValueChange={(value) => {
                    const key = value as string;
                    const resource = resources.find((item) => item.key === key);
                    setSelectedKey(key);
                    setDraft(workflowDraft(resource));
                    setDraftError(null);
                    setFile(null);
                    setFileResetKey((current) => current + 1);
                    setResult(null);
                    mutation.reset();
                  }}
                >
                  <SelectTrigger className="w-full" id="agent-debug-workflow">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {resources.map((resource) => (
                        <SelectItem key={resource.key} value={resource.key}>
                          {resource.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {selected.description || selected.id} · {selected.steps.length} 个步骤
                </FieldDescription>
              </Field>
              <Field data-invalid={Boolean(draftError)}>
                {selected.inputKind === "resume-file" ? (
                  <>
                    <FieldLabel>简历文件</FieldLabel>
                    <FileUpload
                      accept={supportedResumeDocumentAccept}
                      browseLabel="选择简历"
                      description="PDF、Word、PPT、Excel、HTML 或图片，单文件 20 MB 内"
                      disabled={mutation.isPending}
                      draggingLabel="释放后选择"
                      maxFiles={1}
                      multiple={false}
                      resetKey={fileResetKey}
                      showBorderBeam={false}
                      title={file ? file.name : "上传 Workflow 输入文件"}
                      onFilesAccepted={(files) => {
                        setFile(files[0] ?? null);
                        setDraftError(null);
                      }}
                    />
                    <FieldDescription>
                      文件会转换为当前 Workflow 的 bytesBase64、fileName 和 mediaType 输入； Base64
                      内容不会写入调试结果或 trace。
                    </FieldDescription>
                  </>
                ) : (
                  <>
                    <FieldLabel htmlFor="agent-debug-workflow-input">Input JSON</FieldLabel>
                    <Tabs defaultValue="input">
                      <TabsList>
                        <TabsTrigger value="input">输入</TabsTrigger>
                        <TabsTrigger value="schema">Schema</TabsTrigger>
                      </TabsList>
                      <TabsContent className="pt-3" value="input">
                        <Textarea
                          aria-invalid={Boolean(draftError)}
                          className="min-h-72 font-mono text-xs leading-5"
                          id="agent-debug-workflow-input"
                          spellCheck={false}
                          value={draft}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setDraftError(null);
                          }}
                        />
                      </TabsContent>
                      <TabsContent className="pt-3" value="schema">
                        <VisualJsonPanel height={320} value={toJsonValue(selected.inputSchema)} />
                      </TabsContent>
                    </Tabs>
                  </>
                )}
                <FieldError>{draftError}</FieldError>
              </Field>
              <Button
                disabled={
                  mutation.isPending || (selected.inputKind === "resume-file" && file === null)
                }
                type="submit"
              >
                {mutation.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconPlayerPlay data-icon="inline-start" />
                )}
                {mutation.isPending ? "运行中" : "运行 Workflow"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {mutation.isError ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Workflow 运行失败</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            {errorMessage(mutation.error, "请检查 Input JSON 后重试。")}
            {failedRun ? <ResultMetadata {...failedRun} tokenUsageUnavailable /> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>运行结果</CardTitle>
            <CardDescription>
              <ResultMetadata
                durationMs={result.durationMs}
                runId={result.runId}
                tokenUsageUnavailable
                traceId={result.traceId}
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="result">
              <TabsList>
                <TabsTrigger value="result">最终输出</TabsTrigger>
                <TabsTrigger value="steps">步骤详情</TabsTrigger>
              </TabsList>
              <TabsContent className="pt-4" value="result">
                <VisualJsonPanel value={parseJsonValue(result.resultJson)} />
              </TabsContent>
              <TabsContent className="pt-4" value="steps">
                <VisualJsonPanel value={parseJsonValue(result.stepsJson)} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FieldValue({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="truncate font-medium text-sm">{value ?? "未发现信息"}</span>
    </div>
  );
}

function ResumeParserDebugger({ slug }: { slug: string }) {
  const [result, setResult] = useState<ParserDebugResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  async function parseFile(file: File) {
    const formData = new FormData();
    formData.append("resume", file);
    setError(null);
    setPending(true);

    try {
      const response = await fetch(
        `/api/w/${encodeURIComponent(slug)}/studio/agent-debug/resume-parser-test`,
        { body: formData, method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as ParserDebugResult & {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload?.error ?? payload?.message ?? "Agent 调试失败");
      }
      setResult(payload);
      toast.success("解析完成");
    } catch (parseError) {
      const message = errorMessage(parseError, "Agent 调试失败");
      setError(message);
      setResult(null);
      toast.error(message);
    } finally {
      setPending(false);
      setResetKey((value) => value + 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <FileUpload
          accept={supportedResumeDocumentAccept}
          browseLabel="选择简历"
          description="PDF、Word、PPT、Excel、HTML 或图片，单文件 20 MB 内"
          disabled={pending}
          draggingLabel="释放后解析"
          maxFiles={1}
          multiple={false}
          resetKey={resetKey}
          showBorderBeam={false}
          title={pending ? "正在解析" : "上传调试简历"}
          onFilesAccepted={(files) => {
            const [file] = files;
            if (file) {
              void parseFile(file);
            }
          }}
        />

        {pending ? (
          <Alert>
            <Spinner />
            <AlertTitle>正在运行解析流程</AlertTitle>
            <AlertDescription>正在执行 OCR 和结构化抽取。</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>解析失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {result ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-base">{result.fileName}</h2>
            <Badge variant="secondary">{result.ocr.textSource}</Badge>
            <Badge variant="outline">{result.ocr.pageCount} 页</Badge>
          </div>
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">分析字段</TabsTrigger>
              <TabsTrigger value="structured">Parser JSON</TabsTrigger>
              <TabsTrigger value="ocr">OCR 原文</TabsTrigger>
            </TabsList>
            <TabsContent className="pt-4" value="profile">
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <FieldValue label="姓名" value={result.resumeProfile.name} />
                  <FieldValue label="工作年限" value={result.resumeProfile.workYears} />
                  <FieldValue
                    label="目标岗位"
                    value={result.resumeProfile.targetRoles[0] ?? null}
                  />
                  <FieldValue label="邮箱" value={result.resumeProfile.email} />
                  <FieldValue label="电话" value={result.resumeProfile.phone} />
                  <FieldValue
                    label="学校"
                    value={result.resumeProfile.schools.slice(0, 3).join("、") || null}
                  />
                </div>
                <VisualJsonPanel value={result.resumeProfile as JsonValue} />
              </div>
            </TabsContent>
            <TabsContent className="pt-4" value="structured">
              <VisualJsonPanel value={result.parsedStructured} />
            </TabsContent>
            <TabsContent className="pt-4" value="ocr">
              <ScrollArea className="max-h-[35rem]" scrollFade>
                <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-6">
                  {result.ocr.text}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </section>
      ) : null}
    </div>
  );
}

export function AgentDebugPage({ slug }: { slug: string }) {
  const resourcesQuery = useQuery({
    queryFn: () =>
      rpcFetch<AgentDebugResources>(
        rpc.api.w[":slug"].studio["agent-debug"].resources.$get({ param: { slug } }),
        "加载调试资源失败",
      ),
    queryKey: ["agent-debug", "resources", slug] as const,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        description="在当前工作区上下文中运行 Mastra Agent、Workflow，或检查简历解析结果。"
        title="Agent 调试"
      />

      <Tabs defaultValue="agent">
        <TabsList>
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="resume-parser">简历解析</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-6" value="agent">
          {resourcesQuery.isPending ? <ResourceDebuggerSkeleton /> : null}
          {resourcesQuery.isError ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>调试资源加载失败</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {errorMessage(resourcesQuery.error, "请稍后重试。")}
                <Button size="sm" variant="outline" onClick={() => void resourcesQuery.refetch()}>
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {resourcesQuery.data ? (
            <AgentDebugger resources={resourcesQuery.data.agents} slug={slug} />
          ) : null}
        </TabsContent>
        <TabsContent className="pt-6" value="workflow">
          {resourcesQuery.isPending ? <ResourceDebuggerSkeleton /> : null}
          {resourcesQuery.isError ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>调试资源加载失败</AlertTitle>
              <AlertDescription>请返回 Agent 页签重试。</AlertDescription>
            </Alert>
          ) : null}
          {resourcesQuery.data ? (
            <WorkflowDebugger resources={resourcesQuery.data.workflows} slug={slug} />
          ) : null}
        </TabsContent>
        <TabsContent className="pt-6" value="resume-parser">
          <ResumeParserDebugger slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
