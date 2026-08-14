import type { AutoFormFieldProps } from "@autoform/react";
import { Input } from "@mastra/playground-ui/components/Input";
import React from "react";

export const NumberField: React.FC<AutoFormFieldProps> = ({ inputProps, error, field, id }) => {
  const { key: _key, ...props } = inputProps;

  return (
    <Input
      id={id}
      type="number"
      className={error ? "border-accent2" : ""}
      {...props}
      defaultValue={field.default === undefined ? undefined : Number(field.default)}
      onChange={(e) => {
        const { value } = e.target;
        if (value !== "" && !Number.isNaN(Number(value))) {
          props.onChange({
            target: { name: inputProps.name, value },
          });
        }
      }}
      onBlur={(e) => {
        const { value } = e.target;
        if (value !== "" && !Number.isNaN(Number(value))) {
          props.onChange({
            target: { name: inputProps.name, value: Number(value) },
          });
        }
      }}
    />
  );
};
