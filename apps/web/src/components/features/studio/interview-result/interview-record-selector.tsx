"use client";

import { IconArrowBackUp, IconChevronDown } from "@tabler/icons-react";

import {
  DATE_TIME_DISPLAY_OPTIONS,
  formatTimeDisplayText,
} from "@/components/features/display/time-display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";

export function FormSubmissionResetAction({
  onReset,
  resettingId,
  submissions,
}: {
  onReset: (id: string) => void;
  resettingId: string | null;
  submissions: StudioPersonDetailViewModel["formSubmissions"];
}) {
  if (submissions.length === 0) {
    return null;
  }

  const isResetting = resettingId !== null;

  if (submissions.length === 1) {
    const [submission] = submissions;
    return (
      <Button
        className="ml-auto"
        disabled={isResetting}
        onClick={() => onReset(submission.id)}
        size="xs"
        type="button"
        variant="outline"
      >
        <IconArrowBackUp />
        {isResetting ? "重置中..." : "重置填写"}
      </Button>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            className="ml-auto"
            disabled={isResetting}
            size="xs"
            type="button"
            variant="outline"
          >
            <IconArrowBackUp />
            {isResetting ? "重置中..." : "重置填写"}
            <IconChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>选择要重置的表单</DropdownMenuLabel>
        {submissions.map((submission) => (
          <DropdownMenuItem key={submission.id} onClick={() => onReset(submission.id)}>
            <span className="truncate">{submission.snapshot.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInterviewRecordLabel(
  report: StudioPersonDetailViewModel["resultReports"][number],
  index: number,
) {
  const time =
    formatTimeDisplayText(report.startedAt ?? report.createdAt, DATE_TIME_DISPLAY_OPTIONS) ??
    "时间未记录";
  return index === 0 ? `最近一次 · ${time}` : `第 ${index + 1} 条记录 · ${time}`;
}

export function InterviewRecordSelector({
  onSelectedReportChange,
  reports,
  value,
}: {
  onSelectedReportChange: (conversationId: string) => void;
  reports: StudioPersonDetailViewModel["resultReports"];
  value: string | null;
}) {
  if (!(reports.length > 1) || !value) {
    return null;
  }
  return (
    <Select
      onValueChange={(conversationId) => {
        if (conversationId) {
          onSelectedReportChange(conversationId);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="选择面试记录" className="w-full sm:w-72">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          <SelectLabel>面试记录</SelectLabel>
          {reports.map((report, index) => {
            const label = getInterviewRecordLabel(report, index);
            return (
              <SelectItem key={report.conversationId} label={label} value={report.conversationId}>
                {label}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
