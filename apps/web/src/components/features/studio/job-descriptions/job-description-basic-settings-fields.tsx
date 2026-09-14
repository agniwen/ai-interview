"use client";

import type { DepartmentRecord } from "@app/shared/departments";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import {
  filterInterviewerIdsByDepartment,
  getDepartmentSyncedInterviewerSelection,
} from "@app/shared/job-description-interviewers";
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
  reportingManagerOptions,
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
  reportingManagerOptions: { label: string; value: string }[];
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

      <form.Field name="reportingManagerUserId">
        {(field) => (
          <Field className={JOB_SETTING_FIELD_CLASS} orientation="responsive">
            <FieldContent className="min-w-0 gap-0.5">
              <FieldLabel htmlFor={field.name}>汇报上级</FieldLabel>
              <FieldDescription className="text-xs leading-relaxed">
                选择该岗位的直属汇报对象，可不填。
              </FieldDescription>
            </FieldContent>
            <div className={JOB_SETTING_CONTROL_CLASS}>
              <SearchableSelect
                emptyMessage="没有匹配的成员"
                id={field.name}
                onChange={(value) => field.handleChange(value)}
                options={reportingManagerOptions}
                placeholder="选择汇报上级"
                searchPlaceholder="搜索成员…"
                value={field.state.value}
              />
            </div>
          </Field>
        )}
      </form.Field>

      <div className="space-y-4 px-3.5 py-4">
        <div>
          <p className="font-medium text-sm">薪资与需求</p>
          <p className="mt-1 text-muted-foreground text-xs">薪资单位为 K，用于组成岗位薪资区间。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="salaryMinK">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>薪资下限（K）</FieldLabel>
                  <Input
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    inputMode="decimal"
                    min="0"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    placeholder="如：20"
                    step="0.01"
                    type="number"
                    value={field.state.value ?? ""}
                  />
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="salaryMaxK">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>薪资上限（K）</FieldLabel>
                  <Input
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    inputMode="decimal"
                    min="0"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    placeholder="如：35"
                    step="0.01"
                    type="number"
                    value={field.state.value ?? ""}
                  />
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="headcount">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>招聘人数</FieldLabel>
                  <Input
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    min="1"
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(event.target.value ? Number(event.target.value) : null)
                    }
                    placeholder="如：2"
                    step="1"
                    type="number"
                    value={field.state.value ?? ""}
                  />
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="jobWeight">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                  <FieldLabel htmlFor={field.name}>岗位权重（两位小数）</FieldLabel>
                  <Input
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    inputMode="decimal"
                    min="0.01"
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value || null)}
                    placeholder="默认 1.00"
                    step="0.01"
                    type="number"
                    value={field.state.value ?? ""}
                  />
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </form.Field>
        </div>
      </div>

      <div className="space-y-4 px-3.5 py-4">
        <div>
          <p className="font-medium text-sm">招聘设置</p>
          <p className="mt-1 text-muted-foreground text-xs">
            设置当前岗位的招聘节奏和主要推荐渠道。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <form.Field name="priority">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>优先级</FieldLabel>
                <SearchableSelect
                  id={field.name}
                  onChange={(value) =>
                    field.handleChange(
                      value === "high" || value === "low" || value === "medium" ? value : "medium",
                    )
                  }
                  options={[
                    { label: "高", value: "high" },
                    { label: "中", value: "medium" },
                    { label: "低", value: "low" },
                  ]}
                  placeholder="选择优先级"
                  value={field.state.value}
                />
                <FieldDescription className="text-xs leading-relaxed">
                  标记当前岗位的招聘优先程度。
                </FieldDescription>
              </Field>
            )}
          </form.Field>
          <form.Field name="targetDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>目标日期</FieldLabel>
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value || null)}
                  type="date"
                  value={field.state.value ?? ""}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="publishedDate">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>发布日期</FieldLabel>
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value || null)}
                  type="date"
                  value={field.state.value ?? ""}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="referralChannels">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field
                  className="md:col-span-2"
                  data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
                >
                  <FieldLabel htmlFor={field.name}>简历推荐渠道</FieldLabel>
                  <Input
                    aria-invalid={!!errors?.length}
                    id={field.name}
                    maxLength={500}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="如：内推、技术招聘群、猎头"
                    value={field.state.value ?? ""}
                  />
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </form.Field>
        </div>
      </div>
    </div>
  );
}
