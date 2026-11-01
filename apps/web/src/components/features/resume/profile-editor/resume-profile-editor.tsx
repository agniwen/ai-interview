"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
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
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EntryListEditor } from "./entry-list-editor";
import {
  createEducationExperienceDraft,
  createProjectExperienceDraft,
  createWorkExperienceDraft,
} from "./resume-profile-draft";
import type {
  EducationExperienceDraft,
  ProjectExperienceDraft,
  ResumeProfileDraft,
  WorkExperienceDraft,
} from "./resume-profile-draft";
import { TagListInput } from "./tag-list-input";

const GENDER_OPTIONS = ["男", "女"] as const;
/** Base UI 的 Toggle 需要非空 value，用哨兵值表示「未知」。 */
const GENDER_UNKNOWN_VALUE = "unknown";
const EDUCATION_LEVEL_OPTIONS = ["高中", "中专", "大专", "本科", "硕士", "博士"] as const;
const PERIOD_PLACEHOLDER = "如 2021.03 - 至今";
const SUMMARY_MAX_LENGTH = 4000;
const SHORT_TEXT_MAX_LENGTH = 120;
const PERIOD_MAX_LENGTH = 60;

export interface ResumeProfileEditorProps {
  value: ResumeProfileDraft;
  onChange: (value: ResumeProfileDraft) => void;
  disabled?: boolean;
  /**
   * 是否在画像里编辑姓名 / 邮箱 / 电话 / 求职意向。招聘台由外层招聘信息字段维护这些身份字段，
   * 传 false 隐藏；人才库直接编辑画像，传 true。
   * Whether identity fields live in this editor. The recruiting desk keeps them in its
   * own recruiting fields (false); the resume pool edits them here (true).
   */
  showIdentityFields?: boolean;
}

/** 校验数字草稿：空值合法；返回错误文案或 null。 */
export function validateNumberDraft(
  value: string,
  { label, max, integer }: { label: string; max: number; integer?: boolean },
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    return `${label}需在 0-${max} 之间`;
  }
  if (integer && !Number.isInteger(parsed)) {
    return `${label}需为整数`;
  }
  return null;
}

export function getResumeProfileDraftError(
  draft: ResumeProfileDraft,
  { requireName }: { requireName: boolean },
): string | null {
  if (requireName && draft.name.trim().length === 0) {
    return "请填写候选人姓名";
  }
  return (
    validateNumberDraft(draft.age, { integer: true, label: "年龄", max: 120 }) ??
    validateNumberDraft(draft.workYears, { label: "工作年限", max: 80 })
  );
}

function EditorSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm" id={headingId}>
            {title}
          </h3>
          {count === undefined ? null : (
            <Badge className="tabular-nums" variant="secondary">
              {count}
            </Badge>
          )}
        </div>
        {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  maxLength = SHORT_TEXT_MAX_LENGTH,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  type?: "text" | "email" | "tel";
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="ml-1 text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      <Input
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </Field>
  );
}

function SummaryField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        className="min-h-24"
        disabled={disabled}
        id={id}
        maxLength={SUMMARY_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  unit,
  step,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  unit: string;
  step: number;
  error: string | null;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent className="gap-2">
        <InputGroup>
          <InputGroupInput
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            id={id}
            inputMode="decimal"
            min={0}
            onChange={(event) => onChange(event.target.value)}
            placeholder="未知"
            step={step}
            type="number"
            value={value}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}

function TagField({
  label,
  description,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent className="gap-1.5">
        <TagListInput
          aria-describedby={description ? descriptionId : undefined}
          disabled={disabled}
          id={id}
          onChange={onChange}
          placeholder={placeholder}
          value={value}
        />
        {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}

function GenderField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  // AI 偶尔返回非标准写法（如「男性」），保留为额外选项，避免打开即被改写。
  // Keep a non-standard AI value as an extra option so opening the form never rewrites it.
  const extraOption = value && !GENDER_OPTIONS.some((option) => option === value) ? value : null;
  return (
    <Field>
      <FieldLabel id={labelId}>性别</FieldLabel>
      <ToggleGroup
        aria-labelledby={labelId}
        disabled={disabled}
        onValueChange={(next) => {
          const [selected] = next;
          onChange(!selected || selected === GENDER_UNKNOWN_VALUE ? "" : selected);
        }}
        spacing={2}
        value={[value || GENDER_UNKNOWN_VALUE]}
        variant="outline"
      >
        {GENDER_OPTIONS.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {option}
          </ToggleGroupItem>
        ))}
        {extraOption ? <ToggleGroupItem value={extraOption}>{extraOption}</ToggleGroupItem> : null}
        <ToggleGroupItem value={GENDER_UNKNOWN_VALUE}>未知</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

function EducationLevelField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const extraOption =
    value && !EDUCATION_LEVEL_OPTIONS.some((option) => option === value) ? value : null;
  return (
    <Field>
      <FieldLabel htmlFor={id}>学历</FieldLabel>
      <NativeSelect
        className="w-full"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <NativeSelectOption value="">未知</NativeSelectOption>
        {EDUCATION_LEVEL_OPTIONS.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
        {extraOption ? (
          <NativeSelectOption value={extraOption}>{extraOption}</NativeSelectOption>
        ) : null}
      </NativeSelect>
    </Field>
  );
}

function joinSummary(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ");
}

function WorkExperienceFields({
  item,
  update,
  disabled,
}: {
  item: WorkExperienceDraft;
  update: (patch: Partial<Omit<WorkExperienceDraft, "key">>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField
        disabled={disabled}
        label="公司"
        onChange={(company) => update({ company })}
        value={item.company}
      />
      <TextField
        disabled={disabled}
        label="职位"
        onChange={(role) => update({ role })}
        value={item.role}
      />
      <TextField
        disabled={disabled}
        label="在职时间"
        maxLength={PERIOD_MAX_LENGTH}
        onChange={(period) => update({ period })}
        placeholder={PERIOD_PLACEHOLDER}
        value={item.period}
      />
      <div className="md:col-span-2">
        <SummaryField
          disabled={disabled}
          label="工作内容"
          onChange={(summary) => update({ summary })}
          placeholder="职责、业绩与关键成果"
          value={item.summary}
        />
      </div>
    </div>
  );
}

function ProjectExperienceFields({
  item,
  update,
  disabled,
}: {
  item: ProjectExperienceDraft;
  update: (patch: Partial<Omit<ProjectExperienceDraft, "key">>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField
        disabled={disabled}
        label="项目名称"
        onChange={(name) => update({ name })}
        value={item.name}
      />
      <TextField
        disabled={disabled}
        label="担任角色"
        onChange={(role) => update({ role })}
        value={item.role}
      />
      <TextField
        disabled={disabled}
        label="项目时间"
        maxLength={PERIOD_MAX_LENGTH}
        onChange={(period) => update({ period })}
        placeholder={PERIOD_PLACEHOLDER}
        value={item.period}
      />
      <TagField
        disabled={disabled}
        label="技术栈"
        onChange={(techStack) => update({ techStack })}
        placeholder="如 React，回车添加"
        value={item.techStack}
      />
      <div className="md:col-span-2">
        <SummaryField
          disabled={disabled}
          label="项目描述"
          onChange={(summary) => update({ summary })}
          placeholder="项目背景、个人贡献与结果"
          value={item.summary}
        />
      </div>
    </div>
  );
}

function EducationExperienceFields({
  item,
  update,
  disabled,
}: {
  item: EducationExperienceDraft;
  update: (patch: Partial<Omit<EducationExperienceDraft, "key">>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField
        disabled={disabled}
        label="学校"
        onChange={(school) => update({ school })}
        value={item.school}
      />
      <TextField
        disabled={disabled}
        label="专业"
        onChange={(major) => update({ major })}
        value={item.major}
      />
      <EducationLevelField
        disabled={disabled}
        onChange={(educationLevel) => update({ educationLevel })}
        value={item.educationLevel}
      />
      <TextField
        disabled={disabled}
        label="学位"
        onChange={(degree) => update({ degree })}
        placeholder="如 工学学士"
        value={item.degree}
      />
      <TextField
        disabled={disabled}
        label="就读时间"
        maxLength={PERIOD_MAX_LENGTH}
        onChange={(period) => update({ period })}
        placeholder="如 2016.09 - 2020.06"
        value={item.period}
      />
      <TextField
        disabled={disabled}
        label="毕业年份"
        maxLength={PERIOD_MAX_LENGTH}
        onChange={(graduationYear) => update({ graduationYear })}
        placeholder="如 2020"
        value={item.graduationYear}
      />
      <div className="md:col-span-2">
        <SummaryField
          disabled={disabled}
          label="补充说明"
          onChange={(summary) => update({ summary })}
          placeholder="主修课程、荣誉或在校经历"
          value={item.summary}
        />
      </div>
    </div>
  );
}

/**
 * 简历画像（AI 解析结果）编辑器。受控组件，招聘台编辑与人才库编辑共用。
 * Resume Profile (AI-parsed facts) editor. Controlled; shared by the recruiting
 * desk edit drawer and the resume pool edit drawer.
 */
export function ResumeProfileEditor({
  value,
  onChange,
  disabled = false,
  showIdentityFields = false,
}: ResumeProfileEditorProps) {
  const strengthsId = useId();

  function patch(next: Partial<ResumeProfileDraft>) {
    onChange({ ...value, ...next });
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorSection
        description="AI 从简历中识别，可能有误；修正后会基于新信息重新生成 AI 评价。"
        title="个人信息"
      >
        <div className="grid gap-5 md:grid-cols-2">
          {showIdentityFields ? (
            <>
              <TextField
                disabled={disabled}
                label="候选人姓名"
                onChange={(name) => patch({ name })}
                required
                value={value.name}
              />
              <TextField
                disabled={disabled}
                label="邮箱"
                maxLength={200}
                onChange={(email) => patch({ email })}
                placeholder="candidate@example.com"
                type="email"
                value={value.email}
              />
              <TextField
                disabled={disabled}
                label="联系电话"
                maxLength={40}
                onChange={(phone) => patch({ phone })}
                type="tel"
                value={value.phone}
              />
            </>
          ) : null}
          <GenderField
            disabled={disabled}
            onChange={(gender) => patch({ gender })}
            value={value.gender}
          />
          <NumberField
            disabled={disabled}
            error={validateNumberDraft(value.age, { integer: true, label: "年龄", max: 120 })}
            label="年龄"
            onChange={(age) => patch({ age })}
            step={1}
            unit="岁"
            value={value.age}
          />
          <NumberField
            disabled={disabled}
            error={validateNumberDraft(value.workYears, { label: "工作年限", max: 80 })}
            label="工作年限"
            onChange={(workYears) => patch({ workYears })}
            step={0.5}
            unit="年"
            value={value.workYears}
          />
        </div>
      </EditorSection>

      <EditorSection title="求职与技能">
        <div className="flex flex-col gap-5">
          {showIdentityFields ? (
            <TagField
              description="第一项作为目标岗位展示"
              disabled={disabled}
              label="求职意向"
              onChange={(targetRoles) => patch({ targetRoles })}
              placeholder="如 后端工程师，回车添加"
              value={value.targetRoles}
            />
          ) : null}
          <TagField
            description="支持粘贴以逗号、顿号或换行分隔的多个技能；点击标签可修改"
            disabled={disabled}
            label="技能"
            onChange={(skills) => patch({ skills })}
            placeholder="如 Go，回车添加"
            value={value.skills}
          />
          <TagField
            disabled={disabled}
            label="毕业院校"
            onChange={(schools) => patch({ schools })}
            placeholder="如 浙江大学，回车添加"
            value={value.schools}
          />
          <Field>
            <FieldLabel htmlFor={strengthsId}>个人优势</FieldLabel>
            <FieldContent className="gap-1.5">
              <Textarea
                aria-describedby={`${strengthsId}-description`}
                className="min-h-28"
                disabled={disabled}
                id={strengthsId}
                onChange={(event) => patch({ personalStrengths: event.target.value })}
                placeholder="每行一条"
                value={value.personalStrengths}
              />
              <FieldDescription id={`${strengthsId}-description`}>每行一条优势</FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </EditorSection>

      <EditorSection count={value.workExperiences.length} title="工作经历">
        <EntryListEditor
          createItem={createWorkExperienceDraft}
          disabled={disabled}
          emptyText="暂无工作经历"
          itemLabel="工作经历"
          items={value.workExperiences}
          onChange={(workExperiences) => patch({ workExperiences })}
          renderFields={(item, update) => (
            <WorkExperienceFields disabled={disabled} item={item} update={update} />
          )}
          summarize={(item) => ({
            meta: item.period,
            title: joinSummary(item.company, item.role),
          })}
        />
      </EditorSection>

      <EditorSection count={value.projectExperiences.length} title="项目经历">
        <EntryListEditor
          createItem={createProjectExperienceDraft}
          disabled={disabled}
          emptyText="暂无项目经历"
          itemLabel="项目经历"
          items={value.projectExperiences}
          onChange={(projectExperiences) => patch({ projectExperiences })}
          renderFields={(item, update) => (
            <ProjectExperienceFields disabled={disabled} item={item} update={update} />
          )}
          summarize={(item) => ({
            meta: item.period,
            title: joinSummary(item.name, item.role),
          })}
        />
      </EditorSection>

      <EditorSection count={value.educationExperiences.length} title="教育经历">
        <EntryListEditor
          createItem={createEducationExperienceDraft}
          disabled={disabled}
          emptyText="暂无教育经历"
          itemLabel="教育经历"
          items={value.educationExperiences}
          onChange={(educationExperiences) => patch({ educationExperiences })}
          renderFields={(item, update) => (
            <EducationExperienceFields disabled={disabled} item={item} update={update} />
          )}
          summarize={(item) => ({
            meta: item.period || item.graduationYear,
            title: joinSummary(item.school, item.major, item.educationLevel),
          })}
        />
      </EditorSection>
    </div>
  );
}
