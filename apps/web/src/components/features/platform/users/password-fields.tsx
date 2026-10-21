"use client";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_CATEGORY_COUNT,
  evaluatePassword,
} from "@app/shared/password-policy";
import type { PasswordCategory, PasswordStrength } from "@app/shared/password-policy";
import { cn } from "@app/shared/utils";
import { IconCheck, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useState } from "react";
import type { FocusEventHandler } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const CATEGORY_ORDER: readonly PasswordCategory[] = ["uppercase", "lowercase", "digit", "symbol"];

const STRENGTH_META = {
  medium: { filled: 2, label: "中", segmentClass: "bg-amber", textClass: "text-amber-ink" },
  strong: { filled: 3, label: "强", segmentClass: "bg-green", textClass: "text-green-ink" },
  weak: { filled: 1, label: "弱", segmentClass: "bg-red", textClass: "text-red-ink" },
} satisfies Record<
  Exclude<PasswordStrength, "empty">,
  { filled: number; label: string; segmentClass: string; textClass: string }
>;
const STRENGTH_SEGMENT_COUNT = 3;

const motionClass =
  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none";

export function PasswordInput({
  autoComplete = "new-password",
  describedBy,
  id,
  invalid,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  autoComplete?: string;
  describedBy?: string;
  id: string;
  invalid?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete={autoComplete}
        id={id}
        maxLength={PASSWORD_MAX_LENGTH}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type={visible ? "text" : "password"}
        value={value}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-controls={id}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          size="icon-xs"
        >
          {visible ? <IconEyeOff aria-hidden="true" /> : <IconEye aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

const CATEGORY_CHIP_LABELS = {
  digit: "数字",
  lowercase: "小写",
  symbol: "符号",
  uppercase: "大写",
} as const satisfies Record<PasswordCategory, string>;

function RuleChip({ met, children }: { met: boolean; children: string }) {
  return (
    <li
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs",
        motionClass,
        met
          ? "border-transparent bg-green-tint text-green-ink"
          : "border-border text-muted-foreground",
      )}
    >
      {met ? <IconCheck aria-hidden="true" className="size-3" stroke={2.5} /> : null}
      <span>{children}</span>
      <span className="sr-only">{met ? "，已满足" : "，未满足"}</span>
    </li>
  );
}

/**
 * 分段强度条 + 强/中/弱文案 + 一行规则标签。规则与服务端共用 `@app/shared/password-policy`。
 * Segmented meter, strength label and a single row of rule chips from the shared policy.
 */
export function PasswordStrengthMeter({ id, password }: { id: string; password: string }) {
  const evaluation = evaluatePassword(password);
  const meta = evaluation.strength === "empty" ? null : STRENGTH_META[evaluation.strength];

  return (
    <div className="flex flex-col gap-2" data-slot="password-strength" id={id}>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="grid flex-1 grid-cols-3 gap-1">
          {Array.from({ length: STRENGTH_SEGMENT_COUNT }, (_, index) => (
            <span
              className={cn(
                "h-1.5 rounded-full",
                motionClass,
                meta && index < meta.filled ? meta.segmentClass : "bg-muted",
              )}
              key={index}
            />
          ))}
        </div>
        <p
          aria-atomic="true"
          aria-live="polite"
          className={cn(
            "shrink-0 font-medium text-xs",
            motionClass,
            meta?.textClass ?? "text-muted-foreground",
          )}
        >
          {meta ? `密码强度：${meta.label}` : "未输入密码"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ul aria-label="长度要求" className="flex">
          <RuleChip met={evaluation.lengthValid}>
            {`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 位`}
          </RuleChip>
        </ul>
        <div className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            {`含其中 ${PASSWORD_REQUIRED_CATEGORY_COUNT} 类`}
          </span>
          <ul
            aria-label={`字符类型，至少满足 ${PASSWORD_REQUIRED_CATEGORY_COUNT} 类`}
            className="flex flex-wrap gap-1.5"
          >
            {CATEGORY_ORDER.map((category) => (
              <RuleChip key={category} met={evaluation.categories[category]}>
                {CATEGORY_CHIP_LABELS[category]}
              </RuleChip>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** 两次输入一致时的轻量通过状态，样式与规则标签一致。Match status styled like the rule chips. */
export function PasswordMatchStatus({ id }: { id: string }) {
  return (
    <output
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1 rounded-md bg-green-tint px-2 text-green-ink text-xs",
        motionClass,
      )}
      id={id}
    >
      <IconCheck aria-hidden="true" className="size-3" stroke={2.5} />
      两次输入一致
    </output>
  );
}
