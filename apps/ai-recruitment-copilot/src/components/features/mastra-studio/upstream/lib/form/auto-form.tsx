import type { AutoFormFieldProps, AutoFormUIComponents } from "@autoform/react";
import { useMemo } from "react";
import type { FieldValues } from "react-hook-form";
import { ArrayElementWrapper } from "./components/array-element-wrapper";
import { ArrayWrapper } from "./components/array-wrapper";
import { BooleanField } from "./components/boolean-field";
import { DateField } from "./components/date-field";
import { DiscriminatedUnionField } from "./components/discriminated-union-field";
import { ErrorMessage } from "./components/error-message";
import { FieldWrapper } from "./components/field-wrapper";
import { Form } from "./components/form";
import { NumberField } from "./components/number-field";
import { ObjectWrapper } from "./components/object-wrapper";
import { RecordField } from "./components/record-field";
import { SelectField } from "./components/select-field";
import { StringField } from "./components/string-field";
import { SubmitButton } from "./components/submit-button";
import { UnionField } from "./components/union-field";
import { CustomAutoForm } from "./custom-auto-form";
import type { AutoFormProps } from "./types";

const ShadcnUIComponents: AutoFormUIComponents = {
  ArrayElementWrapper,
  ArrayWrapper,
  ErrorMessage,
  FieldWrapper,
  Form,
  ObjectWrapper,
  SubmitButton,
};

export const ShadcnAutoFormFieldComponents = {
  boolean: BooleanField,
  date: DateField,
  number: NumberField,
  record: RecordField,
  select: SelectField,
  string: StringField,
};
export type FieldTypes = keyof typeof ShadcnAutoFormFieldComponents;

export function AutoForm<T extends FieldValues>({
  uiComponents,
  formComponents,
  readOnly,
  ...props
}: AutoFormProps<T> & { readOnly?: boolean }) {
  // Memoize UI components to prevent unnecessary re-renders
  const mergedUiComponents = useMemo(
    () => ({ ...ShadcnUIComponents, ...uiComponents }),
    [uiComponents],
  );

  // Memoize form components with readOnly prop to prevent focus loss on re-renders
  // Only merge readOnly when explicitly set (not undefined) to preserve field-level settings
  const mergedFormComponents = useMemo(() => {
    const mergeInputProps = (inputProps?: Record<string, unknown>) =>
      readOnly === undefined ? inputProps : { ...inputProps, readOnly };

    return {
      boolean: (fieldProps: AutoFormFieldProps) => (
        <BooleanField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      date: (fieldProps: AutoFormFieldProps) => (
        <DateField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      "discriminated-union": (fieldProps: AutoFormFieldProps) => (
        <DiscriminatedUnionField
          {...fieldProps}
          inputProps={mergeInputProps(fieldProps.inputProps)}
        />
      ),
      number: (fieldProps: AutoFormFieldProps) => (
        <NumberField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      record: (fieldProps: AutoFormFieldProps) => (
        <RecordField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      select: (fieldProps: AutoFormFieldProps) => (
        <SelectField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      string: (fieldProps: AutoFormFieldProps) => (
        <StringField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      union: (fieldProps: AutoFormFieldProps) => (
        <UnionField {...fieldProps} inputProps={mergeInputProps(fieldProps.inputProps)} />
      ),
      ...formComponents,
    };
  }, [readOnly, formComponents]);

  return (
    <CustomAutoForm
      {...props}
      uiComponents={mergedUiComponents}
      formComponents={mergedFormComponents}
    />
  );
}
