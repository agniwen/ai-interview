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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

async function fetchJobDescriptions(): Promise<JobDescriptionListRecord[]> {
  const response = await fetch("/api/studio/job-descriptions/all");
  if (!response.ok) {
    throw new Error("加载在招岗位列表失败");
  }
  const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
  return payload.records;
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
        关联在招岗位 <span className="text-destructive">*</span>
      </FieldLabel>
      <FieldContent className="gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Select
              disabled={disabled}
              onValueChange={(next) => onChange(next)}
              value={value || undefined}
            >
              <SelectTrigger
                aria-invalid={!!error}
                className="w-full h-13!"
                id="interview-jd-select"
              >
                <SelectValue placeholder="请选择在招岗位" />
              </SelectTrigger>
              <SelectContent>
                {jobDescriptions.map((jd) => (
                  <SelectItem key={jd.id} value={jd.id}>
                    <div className="flex w-full flex-col items-start text-left">
                      <span className="w-full text-left">
                        {jd.departmentName ? `${jd.departmentName} / ` : ""}
                        {jd.name}
                      </span>
                      <span className="w-full text-left text-muted-foreground text-xs">
                        {jd.interviewers.length > 0
                          ? `面试官 ${jd.interviewers.length} 位：${jd.interviewers
                              .slice(0, 3)
                              .map((item) => item.name)
                              .join(" / ")}${jd.interviewers.length > 3 ? " …" : ""}`
                          : "未配置面试官"}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
