import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ExternalApplicationDraft,
  ExternalApplicationFormErrors,
  ExternalJobOption,
  PendingPortfolioFile,
} from "./application-form-fields";
import {
  FieldTitleLabel,
  JobComboboxField,
  PortfolioFilesField,
  ResumeFileField,
  WorkModeField,
} from "./application-form-fields";

export interface ExternalApplicationFormProps {
  alternateJobs: ExternalJobOption[];
  draft: ExternalApplicationDraft;
  errors: ExternalApplicationFormErrors;
  jobs: ExternalJobOption[];
  onDraftChange: <K extends keyof ExternalApplicationDraft>(
    key: K,
    value: ExternalApplicationDraft[K],
  ) => void;
  onRemovePortfolioFile: (id: string) => void;
  onRemoveResume: () => void;
  onSelectPortfolioFiles: (incoming: File[]) => void;
  onSelectResume: (incoming: File[]) => void;
  onSubmit: (event: React.FormEvent) => void;
  portfolioFiles: PendingPortfolioFile[];
  portfolioResetKey: number;
  resumeFile: File | null;
  resumeResetKey: number;
  selectedAlternateJob: ExternalJobOption | null;
  selectedPrimaryJob: ExternalJobOption | null;
  submitting: boolean;
}

function TextApplicationField({
  disabled,
  error,
  id,
  label,
  maxLength,
  onChange,
  optional = false,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  disabled: boolean;
  error?: string;
  id: string;
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  optional?: boolean;
  placeholder: string;
  required?: boolean;
  type?: "text" | "url";
  value: string;
}) {
  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldTitleLabel htmlFor={id} optional={optional} required={required}>
        {label}
      </FieldTitleLabel>
      <Input
        aria-invalid={error ? true : undefined}
        aria-required={required ? true : undefined}
        className="h-10 md:text-sm [&>input]:px-3"
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function ExternalApplicationForm({
  alternateJobs,
  draft,
  errors,
  jobs,
  onDraftChange,
  onRemovePortfolioFile,
  onRemoveResume,
  onSelectPortfolioFiles,
  onSelectResume,
  onSubmit,
  portfolioFiles,
  portfolioResetKey,
  resumeFile,
  resumeResetKey,
  selectedAlternateJob,
  selectedPrimaryJob,
  submitting,
}: ExternalApplicationFormProps) {
  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <TextApplicationField
          disabled={submitting}
          error={errors.candidateName}
          id="application-candidate-name"
          label="候选人姓名"
          maxLength={120}
          placeholder="请输入姓名"
          required
          value={draft.candidateName}
          onChange={(value) => onDraftChange("candidateName", value)}
        />

        <JobComboboxField
          disabled={submitting}
          error={errors.jobDescriptionId}
          inputId="application-primary-job"
          jobs={jobs}
          label="首选岗位"
          onChange={(jobId) => onDraftChange("jobDescriptionId", jobId)}
          placeholder="搜索首选岗位"
          required
          selectedJob={selectedPrimaryJob}
          showJdDrawer
        />

        <ResumeFileField
          disabled={submitting}
          error={errors.resume}
          file={resumeFile}
          onRemove={onRemoveResume}
          onSelectFile={onSelectResume}
          resetKey={resumeResetKey}
        />

        <WorkModeField
          disabled={submitting}
          error={errors.workMode}
          onChange={(mode) => onDraftChange("workMode", mode)}
          value={draft.workMode}
        />

        <TextApplicationField
          disabled={submitting}
          error={errors.trainingInstitution}
          id="application-training-institution"
          label="培训机构/校区"
          maxLength={200}
          placeholder="请输入培训机构/校区"
          required
          value={draft.trainingInstitution}
          onChange={(value) => onDraftChange("trainingInstitution", value)}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextApplicationField
            disabled={submitting}
            error={errors.className}
            id="application-class-name"
            label="班级"
            maxLength={120}
            optional
            placeholder="选填"
            value={draft.className}
            onChange={(value) => onDraftChange("className", value)}
          />
          <TextApplicationField
            disabled={submitting}
            error={errors.batch}
            id="application-batch"
            label="批次"
            maxLength={120}
            optional
            placeholder="选填"
            value={draft.batch}
            onChange={(value) => onDraftChange("batch", value)}
          />
        </div>

        <JobComboboxField
          clearable
          disabled={submitting || alternateJobs.length === 0}
          error={errors.alternateJobDescriptionId}
          inputId="application-alternate-job"
          jobs={alternateJobs}
          label="备选岗位"
          onChange={(jobId) => onDraftChange("alternateJobDescriptionId", jobId)}
          optional
          placeholder={alternateJobs.length > 0 ? "搜索备选岗位（选填）" : "暂无其他备选岗位"}
          selectedJob={selectedAlternateJob}
        />

        <TextApplicationField
          disabled={submitting}
          error={errors.contact}
          id="application-contact"
          label="联系方式"
          maxLength={200}
          placeholder="手机号 / 微信号 / 邮箱"
          required
          value={draft.contact}
          onChange={(value) => onDraftChange("contact", value)}
        />

        <TextApplicationField
          disabled={submitting}
          error={errors.portfolioUrl}
          id="application-portfolio-url"
          label="作品集链接"
          maxLength={2048}
          optional
          placeholder="https://...（可填写作品集网站或网盘链接）"
          type="url"
          value={draft.portfolioUrl}
          onChange={(value) => onDraftChange("portfolioUrl", value)}
        />

        <PortfolioFilesField
          disabled={submitting}
          error={errors.portfolioFiles}
          files={portfolioFiles}
          hasPortfolioLink={Boolean(draft.portfolioUrl.trim())}
          onRemoveFile={onRemovePortfolioFile}
          onSelectFiles={onSelectPortfolioFiles}
          resetKey={portfolioResetKey}
        />

        <Field data-invalid={errors.portfolioContribution ? "true" : undefined}>
          <FieldTitleLabel htmlFor="application-portfolio-contribution" optional>
            作品个人分工
          </FieldTitleLabel>
          <Textarea
            className="field-sizing-fixed min-h-24 resize-none px-3 py-2.5 md:text-sm"
            disabled={submitting}
            id="application-portfolio-contribution"
            maxLength={2000}
            placeholder="如有团队作品或课程练习，可简要写明你负责的工序与分工"
            rows={3}
            value={draft.portfolioContribution}
            onChange={(event) => onDraftChange("portfolioContribution", event.target.value)}
          />
          {errors.portfolioContribution ? (
            <FieldError>{errors.portfolioContribution}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>

      <div className="flex justify-center pt-2">
        <Button
          className="w-full text-sm sm:w-auto sm:min-w-52 sm:px-8"
          disabled={submitting || jobs.length === 0}
          size="lg"
          type="submit"
        >
          {submitting ? "正在提交…" : "提交申请"}
        </Button>
      </div>
    </form>
  );
}
