"use client";

import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useQuery } from "@tanstack/react-query";
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
    throw new Error("加载 JD 列表失败");
  }
  const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
  return payload.records;
}

export function JobDescriptionSelectField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const { data: jobDescriptions = [] } = useQuery({
    queryFn: fetchJobDescriptions,
    queryKey: ["job-descriptions", "all"],
    staleTime: 60_000,
  });

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="interview-jd-select">
        关联 JD <span className="text-destructive">*</span>
      </FieldLabel>
      <FieldContent className="gap-2">
        <Select onValueChange={(next) => onChange(next)} value={value || undefined}>
          <SelectTrigger aria-invalid={!!error} className="w-full" id="interview-jd-select">
            <SelectValue placeholder="请选择 JD" />
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
        <FieldDescription>
          面试时会从 JD 所配置的面试官中随机挑选一位，使用其 prompt 与音色。
        </FieldDescription>
        {error ? <FieldError errors={[{ message: error }]} /> : null}
      </FieldContent>
    </Field>
  );
}
