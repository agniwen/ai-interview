import {
  IconUser,
  IconBriefcase,
  IconTarget,
  IconGenderBigender,
  IconCake,
  IconClock,
  IconMail,
  IconPhone,
  IconUserPlus,
  IconFileText,
} from "@tabler/icons-react";
import { DataField } from "@/components/features/display/data-field";
import type { DataFieldProps } from "@/components/features/display/data-field";
import { cn } from "@app/shared/utils";

const labelIcons = {
  关联岗位: IconBriefcase,
  创建人: IconUserPlus,
  姓名: IconUser,
  工作年限: IconClock,
  年龄: IconCake,
  性别: IconGenderBigender,
  求职意向: IconTarget,
  电话: IconPhone,
  目标岗位: IconTarget,
  简历文件: IconFileText,
  邮箱: IconMail,
};

type CandidateFieldProps<T = DataFieldProps> = T extends DataFieldProps
  ? Omit<T, "label"> & { label: keyof typeof labelIcons }
  : never;

export function CandidateInfoField({ label, className, ...props }: CandidateFieldProps) {
  const Icon = labelIcons[label];
  return (
    <DataField
      {...props}
      className={cn(
        "grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 [&>dt]:text-sm [&>dt]:leading-6 [&>dd]:mt-0 [&>dd]:text-foreground",
        className,
      )}
      label={
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {label}
        </span>
      }
    />
  );
}
