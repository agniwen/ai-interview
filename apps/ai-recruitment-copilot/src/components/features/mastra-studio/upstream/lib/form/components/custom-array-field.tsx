import type { ParsedField } from "@autoform/core";
import { getLabel } from "@autoform/core";
import { useAutoForm } from "@autoform/react";
import React from "react";
import type { ComponentType } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

interface RecursiveFieldProps {
  field: ParsedField;
  path: string[];
}

export const CustomArrayField: React.FC<{
  field: ParsedField;
  path: string[];
  renderField: ComponentType<RecursiveFieldProps>;
}> = ({ field, path, renderField: RenderField }) => {
  const { uiComponents } = useAutoForm();
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: path.join("."),
  });

  const subFieldType = field.schema?.[0]?.type;
  let defaultValue: unknown;
  if (subFieldType === "object") {
    defaultValue = {};
  } else if (subFieldType === "array") {
    defaultValue = [];
  } else {
    defaultValue = null;
  }

  const subField = field.schema?.[0];

  if (!subField) {
    return (
      <uiComponents.ErrorMessage
        error={`[AutoForm] Unable to determine array element schema for "${getLabel(field)}"`}
      />
    );
  }

  return (
    <uiComponents.ArrayWrapper
      label={getLabel(field)}
      field={field}
      onAddItem={() => append(defaultValue)}
    >
      {fields.map((item, index) => (
        <uiComponents.ArrayElementWrapper
          key={item.id}
          onRemove={() => remove(index)}
          index={index}
        >
          <RenderField field={subField} path={[...path, index.toString()]} />
        </uiComponents.ArrayElementWrapper>
      ))}
    </uiComponents.ArrayWrapper>
  );
};
