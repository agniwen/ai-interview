"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { DepartmentRecord } from "@arc/shared/departments";
import { runAsyncAction } from "@/lib/client/async-control";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PROMPT_MAX = 2000;

export interface JobDescriptionAiCreateResult {
  departmentId: string;
  description: string;
  name: string;
  prompt: string;
}

export function JobDescriptionAiCreateDialog({
  departments,
  onGenerated,
  onOpenChange,
  open,
}: {
  departments: DepartmentRecord[];
  onGenerated: (result: JobDescriptionAiCreateResult) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const slug = useWorkspaceSlug();
  const [prompt, setPrompt] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const departmentOptions = useMemo(
    () =>
      departments.map((dept) => ({
        label: dept.name,
        value: dept.id,
      })),
    [departments],
  );

  const departmentName = useMemo(
    () => departments.find((dept) => dept.id === departmentId)?.name ?? null,
    [departmentId, departments],
  );

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setDepartmentId(null);
      setGenerating(false);
    }
  }, [open]);

  async function handleGenerate() {
    if (!departmentId) {
      toast.error("请选择所属部门");
      return;
    }
    if (!prompt.trim()) {
      toast.error("请填写 AI 生成指令");
      return;
    }

    setGenerating(true);
    await runAsyncAction({
      cleanup: () => setGenerating(false),
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "AI 生成失败");
      },
      operation: async () => {
        const result = await rpcFetch<{
          description: string;
          prompt: string;
          suggestedName: string;
        }>(
          rpc.api.w[":slug"].studio["job-descriptions"]["ai-generate"].$post({
            json: {
              departmentName: departmentName ?? undefined,
              prompt: prompt.trim(),
            },
            param: { slug },
          }),
          "AI 生成岗位内容失败",
        );

        onGenerated({
          departmentId,
          description: result.description,
          name: result.suggestedName,
          prompt: result.prompt,
        });
        onOpenChange(false);
      },
    });
  }

  return (
    <Modal
      description="选择部门并填写指令，AI 将生成岗位描述与 Prompt，并打开「新建在招岗位」供你确认与保存。"
      dismissible={!generating}
      footer={
        <>
          <Button
            disabled={generating}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={generating || !departmentId || !prompt.trim()}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {generating ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {generating ? "生成内容中…" : "生成岗位内容"}
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!generating) {
          onOpenChange(next);
        }
      }}
      open={open}
      size="lg"
      title="AI 创建在招岗位"
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>
            所属部门 <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent>
            <SearchableSelect
              disabled={generating || departmentOptions.length === 0}
              emptyMessage="没有可选部门"
              onChange={setDepartmentId}
              options={departmentOptions}
              placeholder={departmentOptions.length === 0 ? "暂无部门" : "选择部门"}
              searchPlaceholder="搜索部门…"
              value={departmentId}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>
            填写指令 <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent>
            <div className="relative">
              <Textarea
                className="min-h-24 resize-none pb-6"
                disabled={generating}
                maxLength={PROMPT_MAX}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：高级前端工程师，要求 3 年以上 React/TypeScript 经验，重点考察组件设计、性能优化和团队协作"
                rows={4}
                value={prompt}
              />
              <TextareaCounter maxLength={PROMPT_MAX} value={prompt} />
            </div>
          </FieldContent>
        </Field>
      </FieldGroup>
    </Modal>
  );
}
