import type { ExternalApplicationWorkMode } from "@app/shared/external-applications";
import {
  externalApplicationWorkModeLabels,
  externalApplicationWorkModeValues,
} from "@app/shared/external-applications";
import {
  CANDIDATE_MATERIAL_FILE_ACCEPT,
  CANDIDATE_MATERIAL_FILE_LABEL,
  CANDIDATE_MATERIAL_MAX_COUNT,
  getCandidateMaterialBadgeLabel,
  inferCandidateMaterialCategory,
} from "@app/shared/candidate-materials";
import {
  externalApplicationResumeAccept,
  externalApplicationResumeLabel,
} from "@app/shared/resume-documents";
import { IconTrash, IconUpload } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { formatJobDescriptionForDisplay } from "@/components/features/human-interview/job-description-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ExternalJobOption {
  id: string;
  jd: string;
  name: string;
}

export interface ExternalApplicationDraft {
  alternateJobDescriptionId: string;
  batch: string;
  candidateName: string;
  className: string;
  contact: string;
  jobDescriptionId: string;
  portfolioContribution: string;
  portfolioUrl: string;
  trainingInstitution: string;
  workMode: ExternalApplicationWorkMode;
}

export type ExternalApplicationErrorKey =
  | keyof ExternalApplicationDraft
  | "portfolioFiles"
  | "resume";
export type ExternalApplicationFormErrors = Partial<Record<ExternalApplicationErrorKey, string>>;

export interface PendingPortfolioFile {
  file: File;
  id: string;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
}

export function FieldTitleLabel({
  children,
  htmlFor,
  optional = false,
  required = false,
}: {
  children: ReactNode;
  htmlFor?: string;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className="w-full justify-between gap-2">
      <span className="inline-flex items-center gap-1">
        <span>{children}</span>
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </span>
      {optional ? <span className="font-normal text-xs text-muted-foreground">选填</span> : null}
    </FieldLabel>
  );
}

export function JobDescriptionContent({ jd }: { jd: string }) {
  if (!jd.trim()) {
    return <p className="text-sm text-muted-foreground">暂未提供岗位 JD。</p>;
  }
  return (
    <MarkdownView
      className="text-sm leading-7 [&_p]:whitespace-pre-line"
      content={formatJobDescriptionForDisplay(jd)}
    />
  );
}

export function JobComboboxField({
  clearable = false,
  disabled,
  error,
  inputId,
  jobs,
  label,
  onChange,
  optional = false,
  placeholder,
  required = false,
  selectedJob,
  showJdDrawer = false,
}: {
  clearable?: boolean;
  disabled: boolean;
  error?: string;
  inputId: string;
  jobs: ExternalJobOption[];
  label: string;
  onChange: (jobId: string) => void;
  optional?: boolean;
  placeholder: string;
  required?: boolean;
  selectedJob: ExternalJobOption | null;
  showJdDrawer?: boolean;
}) {
  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldTitleLabel htmlFor={inputId} optional={optional} required={required}>
        {label}
      </FieldTitleLabel>
      <Combobox
        disabled={disabled}
        items={jobs}
        itemToStringLabel={(job) => job.name}
        isItemEqualToValue={(job, value) => job.id === value.id}
        value={selectedJob}
        onValueChange={(job) => onChange(job?.id ?? "")}
      >
        <ComboboxInput
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
          className="h-10 w-full md:text-sm [&>input]:px-3"
          clearVisible={Boolean(clearable && selectedJob)}
          id={inputId}
          onClear={() => onChange("")}
          placeholder={placeholder}
          showClear={clearable}
        />
        <ComboboxContent>
          <ComboboxEmpty>没有匹配的岗位</ComboboxEmpty>
          <ComboboxList>
            {(job: ExternalJobOption) => (
              <ComboboxItem key={job.id} value={job}>
                {job.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {showJdDrawer && selectedJob ? (
        <Drawer direction="bottom" key={selectedJob.id}>
          <DrawerTrigger asChild>
            <Button className="w-full md:hidden" size="sm" type="button" variant="outline">
              查看岗位 JD
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85dvh]">
            <DrawerHeader className="mx-auto w-full max-w-3xl flex-row items-start justify-between gap-4 text-left">
              <div className="min-w-0">
                <DrawerTitle>岗位 JD</DrawerTitle>
                <DrawerDescription>{selectedJob.name}</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  关闭
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <ScrollArea className="mx-auto min-h-0 w-full max-w-3xl flex-1" scrollFade>
              <div className="px-4 pt-2 pb-8">
                <JobDescriptionContent jd={selectedJob.jd} />
              </div>
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function WorkModeField({
  disabled,
  error,
  onChange,
  value,
}: {
  disabled: boolean;
  error?: string;
  onChange: (value: ExternalApplicationWorkMode) => void;
  value: ExternalApplicationWorkMode;
}) {
  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldTitleLabel required>办公形式</FieldTitleLabel>
      <RadioGroup
        aria-label="办公形式"
        className="grid gap-3 sm:grid-cols-2"
        disabled={disabled}
        value={value}
        onValueChange={(nextValue) => {
          const matched = externalApplicationWorkModeValues.find((mode) => mode === nextValue);
          if (matched) {
            onChange(matched);
          }
        }}
      >
        {externalApplicationWorkModeValues.map((mode) => {
          const itemId = `application-work-mode-${mode}`;
          return (
            <FieldLabel
              key={mode}
              htmlFor={itemId}
              className="min-h-10 w-full cursor-pointer items-center rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm font-normal transition-colors hover:bg-muted/40"
            >
              <RadioGroupItem id={itemId} value={mode} />
              <span>{externalApplicationWorkModeLabels[mode]}</span>
            </FieldLabel>
          );
        })}
      </RadioGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function ResumeFileField({
  disabled,
  error,
  file,
  onRemove,
  onSelectFile,
  resetKey,
}: {
  disabled: boolean;
  error?: string;
  file: File | null;
  onRemove: () => void;
  onSelectFile: (incoming: File[]) => void;
  resetKey: number;
}) {
  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldTitleLabel htmlFor="application-resume-file" required>
        简历
      </FieldTitleLabel>
      <FileUpload
        accept={externalApplicationResumeAccept}
        acceptedFileTypes={[{ icon: IconUpload, label: externalApplicationResumeLabel }]}
        ariaLabel="选择或拖放简历"
        browseLabel={file ? "更换简历" : "选择简历"}
        description={`支持 ${externalApplicationResumeLabel}，单个文件不超过 20 MB。`}
        disabled={disabled}
        inputId="application-resume-file"
        multiple={false}
        onFilesSelected={(incoming) => {
          onSelectFile(incoming);
          return false;
        }}
        resetKey={resetKey}
        showFileList={false}
        title="点击或拖放简历到这里上传"
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button
            aria-label={`移除简历 ${file.name}`}
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
            onClick={onRemove}
          >
            移除
          </Button>
        </div>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function PortfolioFilesField({
  disabled,
  error,
  files,
  hasPortfolioLink,
  onRemoveFile,
  onSelectFiles,
  resetKey,
}: {
  disabled: boolean;
  error?: string;
  files: PendingPortfolioFile[];
  hasPortfolioLink: boolean;
  onRemoveFile: (id: string) => void;
  onSelectFiles: (incoming: File[]) => void;
  resetKey: number;
}) {
  const remainingSlots = Math.max(
    0,
    CANDIDATE_MATERIAL_MAX_COUNT - files.length - (hasPortfolioLink ? 1 : 0),
  );
  return (
    <Field data-invalid={error ? "true" : undefined}>
      <FieldTitleLabel htmlFor="application-portfolio-files" optional>
        作品附件
      </FieldTitleLabel>
      <FileUpload
        accept={CANDIDATE_MATERIAL_FILE_ACCEPT}
        ariaLabel="选择或拖放作品附件"
        browseLabel="添加本地文件"
        description={`支持 ${CANDIDATE_MATERIAL_FILE_LABEL}；单个不超过 100 MB，当前还可添加 ${remainingSlots} 份。`}
        disabled={disabled}
        inputId="application-portfolio-files"
        multiple
        onFilesSelected={(incoming) => {
          onSelectFiles(incoming);
          return false;
        }}
        resetKey={resetKey}
        showFileList={false}
        title="点击或拖放作品附件到这里上传"
      />
      {files.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border/70 px-3">
          {files.map((entry) => {
            const category = inferCandidateMaterialCategory(entry.file.name, entry.file.type);
            return (
              <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium" title={entry.file.name}>
                      {entry.file.name}
                    </p>
                    <Badge className="h-5 shrink-0 px-1.5 text-[11px]" variant="secondary">
                      {getCandidateMaterialBadgeLabel({ category, kind: "file" })}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)}</p>
                </div>
                <Button
                  aria-label={`移除作品附件 ${entry.file.name}`}
                  disabled={disabled}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onRemoveFile(entry.id)}
                >
                  <IconTrash />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
