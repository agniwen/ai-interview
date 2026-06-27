"use client";

import { IconAlertCircle, IconFileSearch } from "@tabler/icons-react";
import { JsonEditor } from "@visual-json/react";
import type { JsonValue } from "@visual-json/react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/features/studio/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireStudioAdminAccess } from "@/lib/start/studio/page-access";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

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

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.html,.htm,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,image/png,image/jpeg";

const visualJsonStyle = {
  "--vj-accent": "hsl(var(--primary))",
  "--vj-bg": "hsl(var(--background))",
  "--vj-border": "hsl(var(--border))",
  "--vj-font": "var(--font-mono)",
  "--vj-muted": "hsl(var(--muted))",
  "--vj-text": "hsl(var(--foreground))",
} as CSSProperties;

function VisualJsonPanel({ value }: { value: JsonValue }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <JsonEditor
        height={560}
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

function FieldValue({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="truncate font-medium text-sm">{value ?? "未发现信息"}</span>
    </div>
  );
}

function AgentDebugRoute() {
  const { slug } = useParams({ from: "/w/$slug/studio/agent-debug" });
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
        {
          body: formData,
          method: "POST",
        },
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
      const message = parseError instanceof Error ? parseError.message : "Agent 调试失败";
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
      <PageHeader
        description="上传一份简历，查看解析后的候选人字段、parser 原始 JSON 和 OCR 文本。"
        title="Agent 调试"
      />

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconFileSearch />
            简历解析
          </CardTitle>
          <CardDescription>仅用于调试当前解析链路，不会写入简历库。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FileUpload
            accept={RESUME_ACCEPT}
            browseLabel="选择简历"
            description="PDF、Word、PPT、Excel、HTML 或图片，单文件 20 MB 内"
            disabled={pending}
            draggingLabel="释放后解析"
            maxFiles={1}
            multiple={false}
            onFilesAccepted={(files) => {
              const [file] = files;
              if (file) {
                void parseFile(file);
              }
            }}
            resetKey={resetKey}
            showBorderBeam={false}
            title={pending ? "正在解析" : "上传调试简历"}
          />

          {pending ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
              <Spinner data-icon="inline-start" />
              正在运行 OCR 和结构化抽取
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>解析失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{result.fileName}</CardTitle>
              <Badge variant="secondary">{result.ocr.textSource}</Badge>
              <Badge variant="outline">{result.ocr.pageCount} 页</Badge>
            </div>
            <CardDescription>当前上传文件的解析结果。</CardDescription>
          </CardHeader>
          <CardContent>
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
                <pre className="max-h-[560px] whitespace-pre-wrap overflow-auto rounded-lg border bg-muted/30 p-4 text-sm leading-6">
                  {result.ocr.text}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/agent-debug")({
  component: AgentDebugRoute,
  head: () => ({
    meta: [{ title: "Agent 调试" }],
  }),
  loader: async ({ params }) => {
    const pathname = `/w/${params.slug}/studio/agent-debug`;
    await requireStudioAdminAccess({
      action: "agentDebug",
      pathname,
      slug: params.slug,
    });
  },
});
