"use client";

import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import {
  filterInterviewerIdsByDepartment,
  getDepartmentSyncedInterviewerSelection,
} from "@arc/shared/job-description-interviewers";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import type { JobDescriptionFormApi } from "./job-description-form-values";
import {
  JOB_SETTING_CONTROL_CLASS,
  JOB_SETTING_FIELD_CLASS,
  NAME_MAX_LENGTH,
  normalizeDepartmentId,
} from "./job-description-form-values";

export function JobDescriptionBasicSettingsFields({
  allowCrossDepartmentInterviewers,
  codeLocked,
  departments,
  evaluationFrozen,
  form,
  handleGenerateCode,
  interviewers,
  interviewerOptions,
  isGeneratingCode,
  selectedDepartmentId,
  selectedInterviewerIds,
}: {
  allowCrossDepartmentInterviewers: boolean;
  codeLocked: boolean;
  departments: DepartmentRecord[];
  evaluationFrozen: boolean;
  form: JobDescriptionFormApi;
  handleGenerateCode: () => void;
  interviewers: InterviewerListRecord[];
  interviewerOptions: { label: string; value: string }[];
  isGeneratingCode: boolean;
  selectedDepartmentId: string;
  selectedInterviewerIds: string[];
}) {
  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      <form.Field name="name">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field
              className={JOB_SETTING_FIELD_CLASS}
              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
              orientation="responsive"
            >
              <FieldContent className="min-w-0 gap-0.5">
                <FieldLabel htmlFor={field.name}>
                  岗位名称 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldDescription className="text-xs leading-relaxed">
                  显示在岗位列表、候选人和面试记录中。
                </FieldDescription>
              </FieldContent>
              <div className={JOB_SETTING_CONTROL_CLASS}>
                <Input
                  aria-invalid={!!errors?.length}
                  id={field.name}
                  disabled={evaluationFrozen}
                  maxLength={NAME_MAX_LENGTH}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="如：高级前端工程师"
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </div>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="code">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          const canGenerateCode = !codeLocked && !isGeneratingCode;
          let codeButtonLabel = "生成";
          if (codeLocked) {
            codeButtonLabel = "已生成";
          } else if (isGeneratingCode) {
            codeButtonLabel = "生成中";
          }
          return (
            <Field
              className={JOB_SETTING_FIELD_CLASS}
              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
              orientation="responsive"
            >
              <FieldContent className="min-w-0 gap-0.5">
                <FieldLabel htmlFor={field.name}>岗位编码</FieldLabel>
                <FieldDescription className="text-xs leading-relaxed">
                  用于内部识别；保存时可自动生成。
                </FieldDescription>
              </FieldContent>
              <div className={JOB_SETTING_CONTROL_CLASS}>
                <InputGroup>
                  <InputGroupInput
                    aria-invalid={!!errors?.length}
                    className={field.state.value ? "font-mono" : "text-muted-foreground"}
                    id={field.name}
                    placeholder="保存时自动生成"
                    readOnly
                    value={field.state.value ?? ""}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      disabled={!canGenerateCode}
                      onClick={handleGenerateCode}
                      type="button"
                    >
                      {codeButtonLabel}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError errors={errors} />
              </div>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="departmentId">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field
              className={JOB_SETTING_FIELD_CLASS}
              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
              orientation="responsive"
            >
              <FieldContent className="min-w-0 gap-0.5">
                <FieldLabel htmlFor={field.name}>
                  所属部门 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldDescription className="text-xs leading-relaxed">
                  决定默认可选择的面试官范围。
                </FieldDescription>
              </FieldContent>
              <div className={JOB_SETTING_CONTROL_CLASS}>
                <SearchableSelect
                  id={field.name}
                  invalid={!!errors?.length}
                  onChange={(value) => {
                    const nextDepartmentId = normalizeDepartmentId(value);
                    field.handleChange(nextDepartmentId);
                    form.setFieldValue(
                      "interviewerIds",
                      filterInterviewerIdsByDepartment(
                        interviewers,
                        nextDepartmentId,
                        selectedInterviewerIds,
                        allowCrossDepartmentInterviewers,
                      ),
                    );
                  }}
                  options={departments.map((dept) => ({
                    label: dept.name,
                    value: dept.id,
                  }))}
                  placeholder="选择部门"
                  searchPlaceholder="搜索部门…"
                  value={field.state.value || null}
                />
                <FieldError errors={errors} />
              </div>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name="allowCrossDepartmentInterviewers">
        {(field) => (
          <Field
            className={`${JOB_SETTING_FIELD_CLASS} @md/field-group:items-center!`}
            orientation="responsive"
          >
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor={field.name}>允许匹配跨部门面试官</FieldLabel>
              <FieldDescription className="text-xs leading-relaxed">
                关闭时仅可选择所属部门面试官；开启后可选择任意部门。
              </FieldDescription>
            </FieldContent>
            <div className="flex w-full justify-end @md/field-group:basis-80 @md/field-group:shrink-0">
              <Switch
                checked={field.state.value}
                className="h-6! w-11! [&_[data-slot=switch-thumb]]:size-5!"
                id={field.name}
                onCheckedChange={(checked) => {
                  field.handleChange(checked);
                  if (!checked) {
                    form.setFieldValue(
                      "interviewerIds",
                      filterInterviewerIdsByDepartment(
                        interviewers,
                        selectedDepartmentId,
                        selectedInterviewerIds,
                        false,
                      ),
                    );
                  }
                }}
              />
            </div>
          </Field>
        )}
      </form.Field>

      <form.Field name="interviewerIds">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field
              className={JOB_SETTING_FIELD_CLASS}
              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
              orientation="responsive"
            >
              <FieldContent className="min-w-0 gap-0.5">
                <FieldLabel htmlFor={field.name}>
                  面试官 <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldDescription className="text-xs leading-relaxed">
                  选择负责该岗位的一位或多位面试官。
                </FieldDescription>
              </FieldContent>
              <div className={JOB_SETTING_CONTROL_CLASS}>
                <SearchableMultiSelect
                  emptyMessage="没有匹配的面试官"
                  id={field.name}
                  invalid={!!errors?.length}
                  onChange={(next) => {
                    const synced = getDepartmentSyncedInterviewerSelection({
                      allowCrossDepartmentInterviewers,
                      currentDepartmentId: selectedDepartmentId,
                      interviewers,
                      nextInterviewerIds: next,
                      previousInterviewerIds: field.state.value,
                    });
                    if (synced.departmentId !== selectedDepartmentId) {
                      form.setFieldValue("departmentId", synced.departmentId);
                    }
                    field.handleChange(synced.interviewerIds);
                  }}
                  options={interviewerOptions}
                  placeholder="选择面试官…"
                  searchPlaceholder="搜索面试官…"
                  selectedFormat={(count) => `已选 ${count} 位面试官`}
                  selectedPreviewLimit={3}
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </div>
            </Field>
          );
        }}
      </form.Field>
    </div>
  );
}
