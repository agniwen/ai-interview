"use client";

import type { JobDescriptionListRecord } from "@/lib/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";

function describeInterviewers(jd: JobDescriptionListRecord): string {
  if (jd.interviewers.length === 0) {
    return "未配置面试官";
  }
  const head = jd.interviewers
    .slice(0, 3)
    .map((item) => item.name)
    .join(" / ");
  const more = jd.interviewers.length > 3 ? " …" : "";
  return `面试官 ${jd.interviewers.length} 位：${head}${more}`;
}

function buildJdLabel(jd: JobDescriptionListRecord): string {
  return jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name;
}

export function JobDescriptionSelectField({
  value,
  onChange,
  error,
  action,
  disabled,
  matching = false,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  action?: ReactNode;
  disabled?: boolean;
  /**
   * 简历解析后自动匹配岗位期间为 true：禁用下拉、显示 spinner 与提示文案，
   * 让用户知道结果即将自动回填。匹配完成后立即恢复可选。
   * True while the auto-match request is in flight; disables the select and
   * surfaces a spinner + hint so the user understands a value is incoming.
   */
  matching?: boolean;
}) {
  const slug = useWorkspaceSlug();
  const { data: jobDescriptions = [] } = useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all", slug],
    staleTime: 60_000,
  });

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel className="flex items-center gap-2" htmlFor="interview-jd-select">
        <span>
          关联在招岗位 <span className="text-destructive">*</span>
        </span>
        {matching ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            <LoaderCircleIcon className="size-3 animate-spin" />
            正在为你匹配在招岗位…
          </span>
        ) : null}
      </FieldLabel>
      <FieldContent className="gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              disabled={disabled || matching}
              id="interview-jd-select"
              invalid={!!error}
              onChange={(next) => onChange(next ?? "")}
              options={jobDescriptions.map((jd) => ({
                description: describeInterviewers(jd),
                label: buildJdLabel(jd),
                value: jd.id,
              }))}
              placeholder={matching ? "正在为你匹配在招岗位…" : "请选择在招岗位"}
              searchPlaceholder="搜索岗位…"
              triggerClassName="h-13!"
              value={value || null}
            />
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <FieldDescription>
          面试时会从在招岗位所配置的面试官中随机挑选一位，使用其 prompt 与音色。
        </FieldDescription>
        {error ? <FieldError errors={[{ message: error }]} /> : null}
      </FieldContent>
    </Field>
  );
}
