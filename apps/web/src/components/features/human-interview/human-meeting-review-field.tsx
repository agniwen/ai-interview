import type { ReactNode } from "react";
import { Field as FormField, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@app/shared/utils";

export function HumanMeetingReviewField({
  children,
  label,
  id,
  required = false,
  wide = false,
  error,
}: {
  children: ReactNode;
  label: string;
  id: string;
  required?: boolean;
  wide?: boolean;
  error?: string;
}) {
  return (
    <FormField data-invalid={Boolean(error)} className={cn("gap-2", wide && "md:col-span-2")}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      {children}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </FormField>
  );
}
