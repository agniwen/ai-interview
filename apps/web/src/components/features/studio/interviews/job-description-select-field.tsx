"use client";
import { listRecruitingWorkspaceJobDescriptions } from "@/lib/client/backend-api";

import { IconLoader2 } from "@tabler/icons-react";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { apiRequest } from "@/lib/client/api";
import { jobDescriptionKeys } from "@/lib/client/api/query-keys";

import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function describeInterviewers(jd: JobDescriptionListRecord): string {
  const interviewers = jd.interviewers ?? [];
  if (interviewers.length === 0) {
    return "未配置面试官";
  }
  const head = interviewers
    .slice(0, 3)
    .map((item) => item.name)
    .join(" / ");
  const more = interviewers.length > 3 ? " …" : "";
  return `面试官 ${interviewers.length} 位：${head}${more}`;
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
  label = "关联在招岗位",
  matching = false,
  required = true,
  showDescription = true,
  size = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  action?: ReactNode;
  disabled?: boolean;
  /** Field label text. Defaults to 关联在招岗位. */
  label?: string;
  /**
   * 简历解析后自动匹配岗位期间为 true：禁用下拉、显示 spinner 与提示文案，
   * 让用户知道结果即将自动回填。匹配完成后立即恢复可选。
   * True while the auto-match request is in flight; disables the select and
   * surfaces a spinner + hint so the user understands a value is incoming.
   */
  matching?: boolean;
  /** When false, omit the required asterisk next to the label. */
  required?: boolean;
  /** When false, omit the helper description under the field. */
  showDescription?: boolean;
  /** Control height; `sm` matches SelectTrigger size="sm" (h-8). */
  size?: "default" | "sm";
}) {
  const slug = useWorkspaceSlug();
  const { data: jobDescriptions = [] } = useQuery({
    queryFn: async () => {
      const payload = await apiRequest<{ records: JobDescriptionListRecord[] }>(
        listRecruitingWorkspaceJobDescriptions({ path: { workspaceSlug: slug } }),
        "加载在招岗位列表失败",
      );
      return payload.records;
    },
    queryKey: jobDescriptionKeys.recruiting(slug),
    staleTime: 60_000,
  });

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel className="flex items-center gap-2" htmlFor="interview-jd-select">
        <span>
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </span>
        {matching ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
            <IconLoader2 className="size-3 animate-spin" />
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
                description: showDescription ? describeInterviewers(jd) : undefined,
                label: buildJdLabel(jd),
                value: jd.id,
              }))}
              placeholder={matching ? "正在为你匹配在招岗位…" : "请选择在招岗位"}
              searchPlaceholder="搜索岗位…"
              triggerClassName={size === "sm" ? "h-8" : undefined}
              value={value || null}
            />
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {showDescription ? (
          <FieldDescription>
            面试时会从在招岗位所配置的面试官中随机挑选一位，使用其 prompt 与音色。
          </FieldDescription>
        ) : null}
        {error ? <FieldError errors={[{ message: error }]} /> : null}
      </FieldContent>
    </Field>
  );
}
