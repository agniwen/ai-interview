"use client";

import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
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

async function fetchJobDescriptions(): Promise<JobDescriptionListRecord[]> {
  const response = await fetch("/api/studio/job-descriptions/all");
  if (!response.ok) {
    throw new Error("加载在招岗位列表失败");
  }
  const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
  return payload.records;
}

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
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  action?: ReactNode;
  disabled?: boolean;
}) {
  const { data: jobDescriptions = [] } = useQuery({
    queryFn: fetchJobDescriptions,
    queryKey: ["job-descriptions", "all"],
    staleTime: 60_000,
  });

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="interview-jd-select">
        关联在招岗位 <span className="text-danger">*</span>
      </FieldLabel>
      <FieldContent className="gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              disabled={disabled}
              id="interview-jd-select"
              invalid={!!error}
              onChange={(next) => onChange(next ?? "")}
              options={jobDescriptions.map((jd) => ({
                description: describeInterviewers(jd),
                label: buildJdLabel(jd),
                value: jd.id,
              }))}
              placeholder="请选择在招岗位"
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
