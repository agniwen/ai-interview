import { useId } from "react";
import { incomeProofTypeLabels, incomeProofTypeValues } from "@app/shared/recruiting-materials";
import type { RecruitingMaterialMetadata } from "@app/shared/recruiting-materials";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function RecruitingMaterialMetadataFields({
  value,
  onChange,
  disabled,
}: {
  value: RecruitingMaterialMetadata;
  onChange: (value: RecruitingMaterialMetadata) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-type`}>类型</FieldLabel>
        <Select
          value={value.incomeType}
          disabled={disabled}
          onValueChange={(incomeType) => onChange({ ...value, incomeType })}
        >
          <SelectTrigger id={`${id}-type`} className="w-full">
            <SelectValue placeholder="请选择类型（选填）" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {incomeProofTypeValues.map((type) => (
                <SelectItem key={type} value={type}>
                  {incomeProofTypeLabels[type]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-notes`}>备注</FieldLabel>
        <Textarea
          id={`${id}-notes`}
          rows={3}
          className="field-sizing-fixed resize-none"
          maxLength={500}
          disabled={disabled}
          value={value.notes}
          placeholder="填写附件说明（选填）"
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </Field>
    </FieldGroup>
  );
}
