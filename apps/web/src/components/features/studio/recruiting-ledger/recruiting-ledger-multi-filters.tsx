"use client";

import type { RecruitingLedgerFacet } from "@app/shared/studio-recruiting-ledger";
import {
  recruitingLedgerJobStatusOptions,
  recruitingLedgerRecommendationOptions,
} from "@app/shared/studio-recruiting-ledger";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

export type RecruitingLedgerMultiFilterKey =
  | "departmentId"
  | "jobDescriptionId"
  | "recommendationLevel"
  | "recruitingStatus"
  | "responsibleHrId";

interface RecruitingLedgerMultiFiltersProps {
  departments: RecruitingLedgerFacet[];
  filterKeys?: readonly RecruitingLedgerMultiFilterKey[];
  jobs: RecruitingLedgerFacet[];
  mode: "jobs" | "records";
  onChange: (key: RecruitingLedgerMultiFilterKey, value: string[] | undefined) => void;
  recruiters: RecruitingLedgerFacet[];
  value: Partial<Record<RecruitingLedgerMultiFilterKey, string[] | undefined>>;
}

const recordOnlyFilterKeys = new Set<RecruitingLedgerMultiFilterKey>([
  "recommendationLevel",
  "responsibleHrId",
]);

interface LedgerMultiFilterProps {
  emptyMessage: string;
  noun: string;
  onChange: (value: string[] | undefined) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  searchPlaceholder: string;
  triggerClassName: string;
  value: string[];
}

function selectedFilterLabel(
  value: string[],
  options: readonly { label: string; value: string }[],
  noun: string,
): string {
  if (value.length === 1) {
    return options.find((option) => option.value === value[0])?.label ?? `已选 1 个${noun}`;
  }
  return `已选 ${value.length} 个${noun}`;
}

function LedgerMultiFilter({
  emptyMessage,
  noun,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  triggerClassName,
  value,
}: LedgerMultiFilterProps) {
  return (
    <SearchableMultiSelect
      emptyMessage={emptyMessage}
      onChange={(nextValue) => onChange(nextValue.length > 0 ? nextValue : undefined)}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      selectedDisplay="count"
      selectedFormat={() => selectedFilterLabel(value, options, noun)}
      triggerClassName={triggerClassName}
      value={value}
    />
  );
}

export function RecruitingLedgerMultiFilters({
  departments,
  filterKeys,
  jobs,
  mode,
  onChange,
  recruiters,
  value,
}: RecruitingLedgerMultiFiltersProps) {
  const departmentOptions = departments.map((item) => ({ label: item.label, value: item.id }));
  const jobOptions = jobs.map((item) => ({ label: item.label, value: item.id }));
  const recruiterOptions = recruiters.map((item) => ({ label: item.label, value: item.id }));
  const recommendationOptions = recruitingLedgerRecommendationOptions.map((item) => ({
    label: item.label,
    value: item.value,
  }));
  const statusOptions = recruitingLedgerJobStatusOptions.map((item) => ({
    label: item.label,
    value: item.value,
  }));
  const isVisible = (key: RecruitingLedgerMultiFilterKey) =>
    filterKeys ? filterKeys.includes(key) : mode === "records" || !recordOnlyFilterKeys.has(key);

  return (
    <>
      {isVisible("departmentId") ? (
        <LedgerMultiFilter
          emptyMessage="没有匹配的部门"
          noun="部门"
          onChange={(nextValue) => onChange("departmentId", nextValue)}
          options={departmentOptions}
          placeholder="全部部门"
          searchPlaceholder="搜索部门"
          triggerClassName="w-44 flex-nowrap"
          value={value.departmentId ?? []}
        />
      ) : null}
      {isVisible("jobDescriptionId") ? (
        <LedgerMultiFilter
          emptyMessage="没有匹配的岗位"
          noun="岗位"
          onChange={(nextValue) => onChange("jobDescriptionId", nextValue)}
          options={jobOptions}
          placeholder="全部岗位"
          searchPlaceholder="搜索岗位"
          triggerClassName="w-72 flex-nowrap"
          value={value.jobDescriptionId ?? []}
        />
      ) : null}
      {isVisible("recruitingStatus") ? (
        <LedgerMultiFilter
          emptyMessage="没有匹配的岗位状态"
          noun="状态"
          onChange={(nextValue) => onChange("recruitingStatus", nextValue)}
          options={statusOptions}
          placeholder="全部岗位状态"
          searchPlaceholder="搜索岗位状态"
          triggerClassName="w-44 flex-nowrap"
          value={value.recruitingStatus ?? []}
        />
      ) : null}
      {isVisible("responsibleHrId") ? (
        <LedgerMultiFilter
          emptyMessage="没有匹配的 HR"
          noun="HR"
          onChange={(nextValue) => onChange("responsibleHrId", nextValue)}
          options={recruiterOptions}
          placeholder="全部 HR"
          searchPlaceholder="搜索 HR"
          triggerClassName="w-44 flex-nowrap"
          value={value.responsibleHrId ?? []}
        />
      ) : null}
      {isVisible("recommendationLevel") ? (
        <LedgerMultiFilter
          emptyMessage="没有匹配的 AI 评价"
          noun="评价"
          onChange={(nextValue) => onChange("recommendationLevel", nextValue)}
          options={recommendationOptions}
          placeholder="全部 AI 评价"
          searchPlaceholder="搜索 AI 评价"
          triggerClassName="w-48 flex-nowrap"
          value={value.recommendationLevel ?? []}
        />
      ) : null}
    </>
  );
}
