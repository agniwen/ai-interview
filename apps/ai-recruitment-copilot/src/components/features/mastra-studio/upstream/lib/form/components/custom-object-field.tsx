import type { ParsedField } from "@autoform/core";
import { getLabel } from "@autoform/core";
import { useAutoForm } from "@autoform/react";
import React from "react";
import type { ComponentType } from "react";

interface RecursiveFieldProps {
  field: ParsedField;
  path: string[];
}

export const CustomObjectField: React.FC<{
  field: ParsedField;
  path: string[];
  renderField: ComponentType<RecursiveFieldProps>;
}> = ({ field, path, renderField: RenderField }) => {
  const { uiComponents } = useAutoForm();
  const schema = field.schema ?? [];

  return (
    <uiComponents.ObjectWrapper label={getLabel(field)} field={field}>
      {Object.entries(schema).map(([_key, subField]) => (
        <RenderField
          key={`${path.join(".")}.${subField.key}`}
          field={subField}
          path={[...path, subField.key]}
        />
      ))}
    </uiComponents.ObjectWrapper>
  );
};
