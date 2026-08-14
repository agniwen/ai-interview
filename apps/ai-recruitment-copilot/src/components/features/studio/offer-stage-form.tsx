"use client";

/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 阶段的详情面板内容：
//   - 顶部：候选人期望（薪资 / 现 base / 期望入职日）—— 可编辑，partial merge
//   - 下方：Offer 草稿版本时间线（version desc）
//   - 新建 Offer / 编辑 draft / 发送 / 记录响应 / 撤回
//   - 候选人接受 Offer 时弹二次确认，请上层走「标记结案 hired」流程
//
// Offer-stage panel: candidate expectations inline form + offer draft
// timeline. Draft → sent → respond / cancel flows; on "accepted" we prompt
// the caller to launch the close flow.

import type { Dispatch, SetStateAction } from "react";
import type { OfferDraftInput } from "@arc/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@arc/shared/studio-pipeline-stages";
import { DatePicker } from "@/components/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Toast 文案 helper：避免内联三元嵌套（mode + sendImmediately 两维组合）。
// Save-success toast helper; flattens the nested ternary of mode × sendImmediately.
export function saveSuccessMessage(mode: "create" | "edit", sendImmediately: boolean): string {
  if (mode === "edit") {
    return "已更新草稿";
  }
  return sendImmediately ? "Offer 已发送" : "已保存草稿";
}

// 响应选项的中文标签 helper。
// Localized labels for the offer-response radio options.
export function offerResponseLabel(value: "accepted" | "declined" | "counter"): string {
  if (value === "accepted") {
    return "接受";
  }
  return value === "declined" ? "拒绝" : "议价";
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatIsoDateOnly(iso: string): string {
  const dateOnly = iso.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return dateOnly ?? formatDate(iso);
}

export interface OfferFormState {
  position: string;
  baseSalary: string;
  bonus: string;
  equity: string;
  joiningDate: string;
  expiresAt: string;
  notes: string;
}

export function createBlankOfferFormState(): OfferFormState {
  return {
    baseSalary: "",
    bonus: "",
    equity: "",
    expiresAt: "",
    joiningDate: "",
    notes: "",
    position: "",
  };
}

export function offerFormStateFromDraft(draft: OfferDraftRecord): OfferFormState {
  return {
    baseSalary: String(draft.baseSalary),
    bonus: draft.bonus === null ? "" : String(draft.bonus),
    equity: draft.equity ?? "",
    expiresAt: draft.expiresAt ? formatIsoDateOnly(draft.expiresAt) : "",
    joiningDate: draft.joiningDate ? formatIsoDateOnly(draft.joiningDate) : "",
    notes: draft.notes ?? "",
    position: draft.position,
  };
}

export function createOfferFormFieldSetter(setForm: Dispatch<SetStateAction<OfferFormState>>) {
  return <K extends keyof OfferFormState>(field: K, value: OfferFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
}

export function buildOfferDraftPayload(form: OfferFormState): OfferDraftInput {
  const parsedBase = Number(form.baseSalary);
  if (Number.isNaN(parsedBase) || parsedBase <= 0) {
    throw new Error("Base salary 需为正整数");
  }
  const parsedBonus = form.bonus === "" ? null : Number(form.bonus);
  if (parsedBonus !== null && (Number.isNaN(parsedBonus) || parsedBonus < 0)) {
    throw new Error("奖金需为非负整数");
  }
  return {
    baseSalary: parsedBase,
    bonus: parsedBonus,
    equity: form.equity.trim() || null,
    expiresAt: form.expiresAt || null,
    joiningDate: form.joiningDate || null,
    notes: form.notes.trim() || null,
    position: form.position.trim(),
  };
}

export function OfferDraftFormFields({
  form,
  idPrefix,
  onFieldChange,
}: {
  form: OfferFormState;
  idPrefix: string;
  onFieldChange: <K extends keyof OfferFormState>(field: K, value: OfferFormState[K]) => void;
}) {
  const fullSpanClassName = "sm:col-span-2";

  return (
    <div className="grid gap-3 py-2 sm:grid-cols-2">
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-position`}>
          职位
        </Label>
        <Input
          id={`${idPrefix}-position`}
          maxLength={200}
          onChange={(e) => onFieldChange("position", e.target.value)}
          placeholder="例如 高级前端工程师（L4）"
          value={form.position}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-base`}>
          Base 月薪 (¥)
        </Label>
        <Input
          id={`${idPrefix}-base`}
          inputMode="numeric"
          min={0}
          onChange={(e) => onFieldChange("baseSalary", e.target.value)}
          type="number"
          value={form.baseSalary}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-bonus`}>
          年度奖金 (¥，可选)
        </Label>
        <Input
          id={`${idPrefix}-bonus`}
          inputMode="numeric"
          min={0}
          onChange={(e) => onFieldChange("bonus", e.target.value)}
          type="number"
          value={form.bonus}
        />
      </div>
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-equity`}>
          期权 / 股票（可选，自由文本）
        </Label>
        <Input
          id={`${idPrefix}-equity`}
          maxLength={500}
          onChange={(e) => onFieldChange("equity", e.target.value)}
          placeholder="如 0.1% / 4 年 vest"
          value={form.equity}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-joining`}>
          预计入职日（可选）
        </Label>
        <DatePicker
          id={`${idPrefix}-joining`}
          onValueChange={(value) => onFieldChange("joiningDate", value)}
          value={form.joiningDate}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-sm" htmlFor={`${idPrefix}-expires`}>
          Offer 有效期至（可选）
        </Label>
        <DatePicker
          id={`${idPrefix}-expires`}
          onValueChange={(value) => onFieldChange("expiresAt", value)}
          value={form.expiresAt}
        />
      </div>
      <div className={`grid gap-1.5 ${fullSpanClassName}`}>
        <Label className="text-sm" htmlFor={`${idPrefix}-notes`}>
          备注（可选）
        </Label>
        <Textarea
          id={`${idPrefix}-notes`}
          maxLength={2000}
          onChange={(e) => onFieldChange("notes", e.target.value)}
          rows={2}
          value={form.notes}
        />
      </div>
    </div>
  );
}

// ── 新建 / 编辑 Offer dialog ──
// Create-or-edit dialog.
