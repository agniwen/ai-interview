/* oxlint-disable complexity -- candidate info section hosts identity edit form with validation branches. */
"use client";

import {
  canEditResumeRecord,
  describeResumeEvaluationStatus,
  resumeEvaluationStatusFormValueSchema,
} from "@arc/shared/studio-resumes";
import type { ResumeIdentityUpdateInput, ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { JobDescriptionSelectField } from "@/components/features/studio/interviews/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateStudioResumeIdentity } from "@/lib/client/api";
import { runAsyncAction } from "@/lib/client/async-control";

interface OverviewIdentityDraft {
  age: string;
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string;
  gender: string;
  jobDescriptionId: string;
  resumeEvaluationStatus: "fail" | "pass" | "unreviewed";
  workYears: string;
}

function toOverviewIdentityDraft(detail: ResumeLibraryDetail): OverviewIdentityDraft {
  const profile = detail.resumeProfile;
  return {
    age: profile?.age === null || profile?.age === undefined ? "" : String(profile.age),
    // Prefer table columns; fall back to structured profile JSON.
    candidateEmail: detail.candidateEmail ?? profile?.email ?? "",
    candidateName: detail.candidateName || profile?.name || "",
    candidatePhone: detail.candidatePhone ?? profile?.phone ?? "",
    gender: profile?.gender ?? "",
    jobDescriptionId: detail.jobDescriptionId ?? "",
    resumeEvaluationStatus: detail.resumeEvaluationStatus ?? "unreviewed",
    workYears:
      profile?.workYears === null || profile?.workYears === undefined
        ? ""
        : String(profile.workYears),
  };
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function ResumeOverviewCandidateInfoSection({
  canEdit = false,
  detail,
  onUpdated,
  slug,
}: {
  canEdit?: boolean;
  detail: ResumeLibraryDetail;
  onUpdated?: () => void;
  slug?: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OverviewIdentityDraft>(() => toOverviewIdentityDraft(detail));
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);

  // Match 招聘台列表 card 编辑按钮：resumeLibrary:update（via canEdit）+ 解析 ready。
  const showEdit = Boolean(canEdit && slug && canEditResumeRecord(detail.resumeParseStatus));
  const resumeEvaluation = describeResumeEvaluationStatus(detail.resumeEvaluationStatus);
  const displayName = detail.candidateName || detail.resumeProfile?.name || null;
  const displayEmail = detail.candidateEmail ?? detail.resumeProfile?.email ?? null;
  const displayPhone = detail.candidatePhone ?? detail.resumeProfile?.phone ?? null;

  useEffect(() => {
    if (!editing) {
      setDraft(toOverviewIdentityDraft(detail));
      setNameError(null);
      setJdError(null);
    }
  }, [detail, editing]);

  // Drop edit mode if permission / parse status no longer allows it.
  useEffect(() => {
    if (!showEdit && editing) {
      setEditing(false);
      setDraft(toOverviewIdentityDraft(detail));
      setNameError(null);
      setJdError(null);
    }
  }, [detail, editing, showEdit]);

  function handleCancel() {
    setDraft(toOverviewIdentityDraft(detail));
    setNameError(null);
    setJdError(null);
    setEditing(false);
  }

  async function handleSave() {
    if (!slug || !showEdit) {
      return;
    }
    const name = draft.candidateName.trim();
    if (!name) {
      setNameError("请填写候选人姓名");
      return;
    }
    if (!draft.jobDescriptionId.trim()) {
      setJdError("请选择关联在招岗位");
      return;
    }
    const email = draft.candidateEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("请输入有效邮箱");
      return;
    }
    const age = parseOptionalNumber(draft.age);
    const workYears = parseOptionalNumber(draft.workYears);
    if (draft.age.trim() && age === null) {
      toast.error("年龄请输入有效数字");
      return;
    }
    if (draft.workYears.trim() && workYears === null) {
      toast.error("工作年限请输入有效数字");
      return;
    }

    setNameError(null);
    setJdError(null);
    setSaving(true);
    await runAsyncAction({
      cleanup: () => setSaving(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
      operation: async () => {
        const payload: ResumeIdentityUpdateInput = {
          age,
          candidateEmail: email,
          candidateName: name,
          candidatePhone: draft.candidatePhone.trim(),
          gender: draft.gender.trim(),
          jobDescriptionId: draft.jobDescriptionId.trim(),
          resumeEvaluationStatus: draft.resumeEvaluationStatus,
          // Keep existing target role (not shown in this section).
          targetRole: detail.targetRole ?? "",
          workYears,
        };
        await updateStudioResumeIdentity(slug, detail.id, payload);
        toast.success("候选人信息已保存");
        setEditing(false);
        await queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
        onUpdated?.();
      },
    });
  }

  const actions = showEdit ? (
    <div className="flex items-center gap-0.5">
      {editing ? (
        <>
          <Button
            aria-label="取消编辑"
            className="size-7"
            disabled={saving}
            onClick={handleCancel}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconX className="size-3.5" />
          </Button>
          <Button
            aria-label="保存"
            className="size-7"
            disabled={saving}
            onClick={handleSave}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconCheck className="size-3.5" />
          </Button>
        </>
      ) : (
        <Button
          aria-label="编辑候选人信息"
          className="size-7"
          onClick={() => setEditing(true)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <IconPencil className="size-3.5" />
        </Button>
      )}
    </div>
  ) : null;

  return (
    <section className="border-border/50 border-t pt-6">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="font-medium text-sm">候选人信息</h3>
        {actions}
      </div>

      {editing ? (
        <DataFields columns={3} density="compact">
          <Field>
            <FieldLabel htmlFor="overview-candidate-name">
              姓名 <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldContent className="gap-1">
              <Input
                className="h-8"
                id="overview-candidate-name"
                disabled={saving}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, candidateName: event.target.value }))
                }
                value={draft.candidateName}
              />
              {nameError ? <FieldError errors={[{ message: nameError }]} /> : null}
            </FieldContent>
          </Field>
          <div>
            <JobDescriptionSelectField
              disabled={saving}
              error={jdError ?? undefined}
              onChange={(next) => {
                setDraft((current) => ({ ...current, jobDescriptionId: next }));
                setJdError(null);
              }}
              showDescription={false}
              size="sm"
              value={draft.jobDescriptionId}
            />
          </div>
          <Field>
            <FieldLabel htmlFor="overview-resume-evaluation">简历评估</FieldLabel>
            <Select
              disabled={saving}
              onValueChange={(next) => {
                const status = resumeEvaluationStatusFormValueSchema.safeParse(next);
                if (status.success) {
                  setDraft((current) => ({ ...current, resumeEvaluationStatus: status.data }));
                }
              }}
              value={draft.resumeEvaluationStatus}
            >
              <SelectTrigger className="w-full" id="overview-resume-evaluation" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unreviewed">未评估</SelectItem>
                <SelectItem value="pass">通过</SelectItem>
                <SelectItem value="fail">不通过</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-gender">性别</FieldLabel>
            <Input
              className="h-8"
              id="overview-gender"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, gender: event.target.value }))
              }
              value={draft.gender}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-age">年龄</FieldLabel>
            <Input
              className="h-8"
              id="overview-age"
              disabled={saving}
              inputMode="numeric"
              onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
              value={draft.age}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-work-years">工作年限</FieldLabel>
            <Input
              className="h-8"
              id="overview-work-years"
              disabled={saving}
              inputMode="decimal"
              onChange={(event) =>
                setDraft((current) => ({ ...current, workYears: event.target.value }))
              }
              value={draft.workYears}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-email">邮箱</FieldLabel>
            <Input
              className="h-8"
              id="overview-email"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, candidateEmail: event.target.value }))
              }
              type="email"
              value={draft.candidateEmail}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="overview-phone">电话</FieldLabel>
            <Input
              className="h-8"
              id="overview-phone"
              disabled={saving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, candidatePhone: event.target.value }))
              }
              type="tel"
              value={draft.candidatePhone}
            />
          </Field>
        </DataFields>
      ) : (
        <DataFields columns={3} density="compact">
          <DataField label="姓名" value={displayName} />
          <DataField
            label="关联岗位"
            value={
              <JobDescriptionHoverCard
                jobDescriptionId={detail.jobDescriptionId}
                name={detail.jobDescriptionName}
              />
            }
            valueClassName="font-medium"
          />
          <DataField label="简历评估" value={resumeEvaluation.label} valueClassName="font-medium" />
          <DataField label="性别" value={detail.resumeProfile?.gender} />
          <DataField kind="number" label="年龄" value={detail.resumeProfile?.age} />
          <DataField kind="number" label="工作年限" value={detail.resumeProfile?.workYears} />
          <DataField kind="email" label="邮箱" value={displayEmail} />
          <DataField kind="phone" label="电话" value={displayPhone} />
        </DataFields>
      )}
    </section>
  );
}
