"use client";

import { IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type {
  BackgroundCheckFormInput,
  BackgroundCheckLeavingReason,
} from "@app/db-schema/background-check";
import {
  backgroundCheckFormInputSchema,
  backgroundCheckDraftInputSchema,
  backgroundCheckLeavingReasonSchema,
} from "@app/db-schema/background-check";
import type { PublicBackgroundCheckRecord } from "@app/shared/studio-pipeline-stages";
import { savePublicBackgroundCheckDraft } from "@/lib/client/api/endpoints/background-check";
import { DatePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EmploymentRecord = BackgroundCheckFormInput["employmentRecords"][number];
type DraftEmploymentRecord = Omit<EmploymentRecord, "contactPermission" | "hasLeftCompany"> & {
  contactPermission: boolean | null;
  hasLeftCompany: boolean | null;
};
type BackgroundCheckDraft = Omit<
  BackgroundCheckFormInput,
  "consent" | "employmentRecords" | "gender"
> & {
  consent: boolean;
  employmentRecords: DraftEmploymentRecord[];
  gender: "" | BackgroundCheckFormInput["gender"];
};

const leavingReasons: { label: string; value: BackgroundCheckLeavingReason }[] = [
  { label: "劳动合同终止", value: "contract_ended" },
  { label: "员工主动离职", value: "employee_resigned" },
  { label: "裁员", value: "workforce_reduction" },
  { label: "企业重组", value: "restructuring" },
  { label: "其他", value: "other" },
  { label: "不便回答", value: "refuse_to_answer" },
];

function emptyEmployment(): DraftEmploymentRecord {
  return {
    colleague: { contact: "", name: "" },
    companyName: "",
    contactPermission: null,
    disciplinaryRecord: "",
    employmentEnd: null,
    employmentStart: "",
    hasLeftCompany: null,
    hrContact: { contact: "", name: "" },
    lastPosition: "",
    leavingReason: null,
    leavingReasonOther: null,
    lineManager: { contact: "", name: "" },
  };
}

function booleanChoiceValue(value: boolean | null): "" | "no" | "yes" {
  if (value === null) {
    return "";
  }
  return value ? "yes" : "no";
}

function submissionErrorMessage(error: Error): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "请检查填写内容";
  }
  return error.message;
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  );
}

function ReferenceFields({
  idPrefix,
  label,
  onChange,
  value,
}: {
  idPrefix: string;
  label: string;
  onChange: (value: DraftEmploymentRecord["hrContact"]) => void;
  value: DraftEmploymentRecord["hrContact"];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>
          {label}
          <RequiredMark />
        </Label>
        <Input
          id={`${idPrefix}-name`}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="姓名"
          required
          value={value.name}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-contact`}>
          {label}办公联系方式
          <RequiredMark />
        </Label>
        <Input
          id={`${idPrefix}-contact`}
          onChange={(event) => onChange({ ...value, contact: event.target.value })}
          placeholder="办公电话或工作邮箱"
          required
          value={value.contact}
        />
      </div>
    </div>
  );
}

export function PublicBackgroundCheckPage({
  dependencies = { saveDraft: savePublicBackgroundCheckDraft },
  initialRecord,
  token,
}: {
  dependencies?: { saveDraft: typeof savePublicBackgroundCheckDraft };
  initialRecord: PublicBackgroundCheckRecord;
  token: string;
}) {
  const [submitted, setSubmitted] = useState(initialRecord.status === "submitted");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(initialRecord.draftSavedAt ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<BackgroundCheckDraft>(() => ({
    candidateName: initialRecord.candidateName,
    employmentRecords: [emptyEmployment()],
    gender: "",
    graduationCertificateNumber: "",
    idNumber: "",
    signatureName: "",
    signedDate: "",
    ...initialRecord.draftData,
    consent: false,
  }));
  const [savedForm, setSavedForm] = useState(() =>
    initialRecord.draftData ? JSON.stringify(form) : null,
  );
  const hasUnsavedChanges = savedForm !== JSON.stringify({ ...form, consent: false });

  async function saveDraft() {
    if (saving || pending) {
      return;
    }
    const snapshot = JSON.stringify({ ...form, consent: false });
    setSaving(true);
    setSaveError(null);
    try {
      const input = backgroundCheckDraftInputSchema.parse(form);
      const result = await dependencies.saveDraft(token, input);
      setSavedAt(result.savedAt);
      setSavedForm(snapshot);
      toast.success("草稿已保存，可通过同一链接继续填写");
    } catch (error) {
      const message = submissionErrorMessage(
        error instanceof Error ? error : new Error("保存草稿失败，请稍后重试"),
      );
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function updateEmployment(index: number, patch: Partial<DraftEmploymentRecord>) {
    setForm((current) => ({
      ...current,
      employmentRecords: current.employmentRecords.map((record, recordIndex) =>
        recordIndex === index ? { ...record, ...patch } : record,
      ),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || pending) {
      return;
    }
    if (!form.consent) {
      toast.error("请先确认授权背景调查");
      return;
    }
    setPending(true);
    try {
      const payload = backgroundCheckFormInputSchema.parse({ ...form, consent: true });
      const response = await fetch(
        `/api/public/background-checks/${encodeURIComponent(token)}/submit`,
        {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const result = z
        .object({ error: z.string().optional(), status: z.string().optional() })
        .safeParse(await response.json());
      if (!response.ok || !result.success) {
        throw new Error(
          result.success ? (result.data.error ?? "提交失败，请稍后重试") : "提交失败，请稍后重试",
        );
      }
      setSubmitted(true);
      toast.success("背景调查信息已提交");
    } catch (error) {
      toast.error(
        submissionErrorMessage(error instanceof Error ? error : new Error("提交失败，请稍后重试")),
      );
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border bg-background p-8 text-center shadow-sm">
          <IconCheck className="mx-auto size-10 rounded-full bg-primary/10 p-2 text-primary" />
          <h1 className="mt-4 font-semibold text-2xl">背景调查信息已提交</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            招聘负责人已收到提醒。如需补充或修改，请联系招聘负责人。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-background sm:bg-muted/30 sm:px-4 sm:py-12">
      <form
        className="mx-auto max-w-3xl overflow-hidden bg-background sm:rounded-2xl sm:border sm:shadow-sm"
        onSubmit={submit}
      >
        <header className="border-b px-5 py-7 sm:px-10">
          <p className="font-semibold text-lg">{initialRecord.companyName}</p>
          <h1 className="mt-2 font-semibold text-2xl tracking-tight">背景调查信息采集</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            候选人：{initialRecord.candidateName}
            {initialRecord.jobName ? ` · ${initialRecord.jobName}` : ""}
          </p>
        </header>
        <div className="space-y-8 px-5 py-7 sm:px-10">
          <section className="space-y-2 text-sm">
            <h2 className="font-medium">填写说明</h2>
            <p className="mt-1 text-muted-foreground">
              请确保所填信息真实有效。招聘方可能根据核实需要联系您提供的证明人，或补充核实其他可验证的证明信息。
            </p>
            <p className="mt-1 text-muted-foreground">
              标有 <span className="text-destructive">*</span> 的项目为必填项。
            </p>
          </section>
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg">基本信息</h2>
              <p className="mt-1 text-muted-foreground text-sm">请按证件信息如实填写。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="background-name">
                  姓名
                  <RequiredMark />
                </Label>
                <Input
                  id="background-name"
                  required
                  value={form.candidateName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, candidateName: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="background-gender">
                  性别
                  <RequiredMark />
                </Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id="background-gender"
                  required
                  value={form.gender}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      gender: z.enum(["male", "female", "other"]).parse(event.target.value),
                    }))
                  }
                >
                  <option disabled value="">
                    请选择
                  </option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="background-id">
                  证件号码
                  <RequiredMark />
                </Label>
                <Input
                  id="background-id"
                  required
                  value={form.idNumber}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, idNumber: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="background-graduation">
                  毕业证书编号
                  <RequiredMark />
                </Label>
                <Input
                  id="background-graduation"
                  required
                  value={form.graduationCertificateNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      graduationCertificateNumber: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </section>
          <section className="space-y-5">
            <div>
              <h2 className="font-semibold text-lg">工作经历</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                请填写最近一至两段工作经历及可核实的证明人。
              </p>
            </div>
            {form.employmentRecords.map((record, index) => (
              <div className="space-y-4 rounded-xl border p-4 sm:p-5" key={index}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">工作经历 {index + 1}</h3>
                  {form.employmentRecords.length > 1 ? (
                    <Button
                      aria-label={`删除工作经历 ${index + 1}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          employmentRecords: current.employmentRecords.filter(
                            (_, recordIndex) => recordIndex !== index,
                          ),
                        }))
                      }
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`employment-company-${index}`}>
                      公司名称
                      <RequiredMark />
                    </Label>
                    <Input
                      id={`employment-company-${index}`}
                      required
                      value={record.companyName}
                      onChange={(event) =>
                        updateEmployment(index, { companyName: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`employment-position-${index}`}>
                      最后职位
                      <RequiredMark />
                    </Label>
                    <Input
                      id={`employment-position-${index}`}
                      required
                      value={record.lastPosition}
                      onChange={(event) =>
                        updateEmployment(index, { lastPosition: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`employment-left-${index}`}>
                      是否已离职
                      <RequiredMark />
                    </Label>
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      id={`employment-left-${index}`}
                      required
                      value={booleanChoiceValue(record.hasLeftCompany)}
                      onChange={(event) =>
                        updateEmployment(index, {
                          employmentEnd: event.target.value === "yes" ? "" : null,
                          hasLeftCompany: event.target.value === "yes",
                          leavingReason: null,
                          leavingReasonOther: null,
                        })
                      }
                    >
                      <option disabled value="">
                        请选择
                      </option>
                      <option value="no">否，在职</option>
                      <option value="yes">是，已离职</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`employment-reason-${index}`}>
                      离职原因{record.hasLeftCompany === true ? <RequiredMark /> : null}
                    </Label>
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={record.hasLeftCompany !== true}
                      id={`employment-reason-${index}`}
                      required={record.hasLeftCompany === true}
                      value={record.leavingReason ?? ""}
                      onChange={(event) =>
                        updateEmployment(index, {
                          leavingReason: backgroundCheckLeavingReasonSchema.parse(
                            event.target.value,
                          ),
                        })
                      }
                    >
                      <option disabled value="">
                        {record.hasLeftCompany === false ? "在职，无需填写" : "请选择离职原因"}
                      </option>
                      {leavingReasons.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                    <legend className="mb-2 font-medium text-sm">在职时间</legend>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`employment-start-${index}`}>
                        开始时间
                        <RequiredMark />
                      </Label>
                      <DatePicker
                        id={`employment-start-${index}`}
                        required
                        value={record.employmentStart}
                        onValueChange={(value) =>
                          updateEmployment(index, { employmentStart: value })
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`employment-end-${index}`}>
                        结束时间{record.hasLeftCompany === true ? <RequiredMark /> : null}
                      </Label>
                      {record.hasLeftCompany === true ? (
                        <DatePicker
                          id={`employment-end-${index}`}
                          required
                          value={record.employmentEnd ?? ""}
                          onValueChange={(value) =>
                            updateEmployment(index, { employmentEnd: value })
                          }
                        />
                      ) : (
                        <div
                          className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-muted-foreground text-sm"
                          id={`employment-end-${index}`}
                        >
                          {record.hasLeftCompany === false ? "至今" : "请先选择是否已离职"}
                        </div>
                      )}
                    </div>
                  </fieldset>
                  {record.leavingReason === "other" ? (
                    <div className="grid gap-1.5 sm:col-span-2">
                      <Label htmlFor={`employment-reason-other-${index}`}>
                        其他离职原因
                        <RequiredMark />
                      </Label>
                      <Input
                        id={`employment-reason-other-${index}`}
                        required
                        value={record.leavingReasonOther ?? ""}
                        onChange={(event) =>
                          updateEmployment(index, { leavingReasonOther: event.target.value })
                        }
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor={`disciplinary-record-${index}`}>
                      违纪记录
                      <RequiredMark />
                    </Label>
                    <Textarea
                      id={`disciplinary-record-${index}`}
                      placeholder="没有可填写“无”"
                      required
                      rows={2}
                      value={record.disciplinaryRecord}
                      onChange={(event) =>
                        updateEmployment(index, { disciplinaryRecord: event.target.value })
                      }
                    />
                  </div>
                </div>
                <ReferenceFields
                  idPrefix={`employment-${index}-hr`}
                  label="人力部门联系人"
                  value={record.hrContact}
                  onChange={(value) => updateEmployment(index, { hrContact: value })}
                />
                <ReferenceFields
                  idPrefix={`employment-${index}-manager`}
                  label="直接主管"
                  value={record.lineManager}
                  onChange={(value) => updateEmployment(index, { lineManager: value })}
                />
                <ReferenceFields
                  idPrefix={`employment-${index}-colleague`}
                  label="同事联系人"
                  value={record.colleague}
                  onChange={(value) => updateEmployment(index, { colleague: value })}
                />
                <div className="grid gap-1.5">
                  <Label htmlFor={`contact-permission-${index}`}>
                    是否允许招聘方立即联系上述证明人
                    <RequiredMark />
                  </Label>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    id={`contact-permission-${index}`}
                    required
                    value={booleanChoiceValue(record.contactPermission)}
                    onChange={(event) =>
                      updateEmployment(index, { contactPermission: event.target.value === "yes" })
                    }
                  >
                    <option disabled value="">
                      请选择
                    </option>
                    <option value="yes">是，允许立即联系</option>
                    <option value="no">否，暂不联系</option>
                  </select>
                </div>
              </div>
            ))}
            {form.employmentRecords.length < 2 ? (
              <Button
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    employmentRecords: [...current.employmentRecords, emptyEmployment()],
                  }))
                }
                type="button"
                variant="outline"
              >
                <IconPlus className="size-4" />
                添加一段工作经历
              </Button>
            ) : null}
          </section>
          <section className="space-y-4 border-t pt-6">
            <div>
              <h2 className="font-semibold text-lg">确认与授权</h2>
              <p className="mt-1 text-muted-foreground text-sm">请本人签名并填写签署日期。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="background-signature">
                  本人签名
                  <RequiredMark />
                </Label>
                <Input
                  id="background-signature"
                  placeholder={form.candidateName}
                  required
                  value={form.signatureName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, signatureName: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="background-signed-date">
                  签署日期
                  <RequiredMark />
                </Label>
                <DatePicker
                  id="background-signed-date"
                  required
                  value={form.signedDate}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, signedDate: value }))
                  }
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                aria-required="true"
                checked={form.consent}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, consent: checked === true }))
                }
              />
              <span>
                本人确认以上信息真实、准确，并授权 {initialRecord.companyName}{" "}
                仅为本次招聘目的开展背景调查。
                <RequiredMark />
              </span>
            </label>
          </section>
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              保存草稿不会正式提交，也无需先填完所有必填项。草稿保存在服务端，持有此专属链接的人可继续填写，请妥善保管链接。
            </p>
            {savedAt ? (
              <p aria-live="polite" className="text-muted-foreground text-xs">
                草稿保存于 {new Date(savedAt).toLocaleString("zh-CN")}
                {hasUnsavedChanges ? " · 有修改尚未保存" : " · 已保存"}
              </p>
            ) : null}
            {saveError ? (
              <p role="alert" className="text-destructive text-xs">
                {saveError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                disabled={saving || pending}
                onClick={saveDraft}
                type="button"
                variant="outline"
              >
                {saving ? "保存中…" : "保存草稿"}
              </Button>
              <Button disabled={pending || saving || !form.consent} type="submit">
                {pending ? "提交中…" : "确认并提交"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
