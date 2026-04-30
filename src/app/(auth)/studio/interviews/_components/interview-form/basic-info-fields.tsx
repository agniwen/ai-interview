"use client";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { studioInterviewStatusMeta, studioInterviewStatusValues } from "@/lib/studio-interviews";
import { JobDescriptionSelectField } from "../job-description-select-field";
import { hasFieldErrors, toFieldErrors } from "./index";
import type { InterviewFormApi } from "./index";

/**
 * "创建 / 编辑面试"对话框共用的基础信息字段块。
 * Shared basic-info field block for the create / edit interview dialogs.
 *
 * 抽出来的好处：候选人姓名 / 邮箱 / 目标岗位 / 当前流程 / 备注 等基础字段在两个对话框
 * 中实现一模一样，集中后日后调整 placeholder、校验、a11y 都只需改一处。
 *
 * Why extract: candidate name / email / target role / status / notes are rendered
 * identically in both dialogs. Centralising means placeholder / validation / a11y
 * tweaks live in a single place.
 */
export function InterviewBasicInfoFields({ form }: { form: InterviewFormApi }) {
  return (
    <>
      <form.Field name="jobDescriptionId">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <JobDescriptionSelectField
              error={errors?.[0]?.message}
              onChange={(next) => field.handleChange(next)}
              value={field.state.value ?? ""}
            />
          );
        }}
      </form.Field>

      <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
        <form.Field name="candidateName">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                <FieldContent className="gap-2">
                  <Input
                    aria-invalid={!!errors?.length}
                    className="w-full"
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="请输入候选人姓名"
                    value={field.state.value}
                  />
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="candidateEmail">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>候选人邮箱</FieldLabel>
                <FieldContent className="gap-2">
                  <Input
                    aria-invalid={!!errors?.length}
                    className="w-full"
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="candidate@example.com"
                    value={field.state.value}
                  />
                  <FieldDescription>可选，方便后台检索与跟进。</FieldDescription>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="targetRole">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>目标岗位</FieldLabel>
                <FieldContent className="gap-2">
                  <Input
                    aria-invalid={!!errors?.length}
                    className="w-full"
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="如：前端工程师 / 产品经理"
                    value={field.state.value}
                  />
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="status">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>当前流程</FieldLabel>
                <FieldContent className="gap-2">
                  <Select
                    onValueChange={(value) => field.handleChange(value as typeof field.state.value)}
                    value={field.state.value}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors?.length}
                      className="w-full"
                      id={field.name}
                    >
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {studioInterviewStatusValues.map((status) => (
                        <SelectItem key={status} value={status}>
                          {studioInterviewStatusMeta[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
    </>
  );
}

/**
 * 「内部备注」文本域。在 basic info 块下方常作为独立栏位出现。
 * The "internal notes" textarea — usually rendered below the basic-info block.
 */
export function InterviewNotesField({ form }: { form: InterviewFormApi }) {
  return (
    <form.Field name="notes">
      {(field) => {
        const errors = toFieldErrors(field.state.meta.errors);
        return (
          <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
            <FieldLabel htmlFor={field.name}>内部备注</FieldLabel>
            <FieldContent className="gap-2">
              <Textarea
                aria-invalid={!!errors?.length}
                className="min-h-32 w-full"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="记录候选人来源、业务线、面试关注点等信息"
                value={field.state.value}
              />
              <FieldError errors={errors} />
            </FieldContent>
          </Field>
        );
      }}
    </form.Field>
  );
}
