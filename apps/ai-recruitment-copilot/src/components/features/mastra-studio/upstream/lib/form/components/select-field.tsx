import type { AutoFormFieldProps } from "@autoform/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mastra/playground-ui/components/Select";
import React from "react";

export const SelectField: React.FC<AutoFormFieldProps> = ({
  field,
  inputProps,
  error,
  id,
  value,
}) => {
  const { key: _key, ...props } = inputProps;

  return (
    <Select
      {...props}
      value={value}
      onValueChange={(selectedValue) => {
        const syntheticEvent = {
          target: {
            name: inputProps.name,
            value: selectedValue,
          },
        } as React.ChangeEvent<HTMLInputElement>;
        props.onChange(syntheticEvent);
      }}
    >
      <SelectTrigger id={id} className={error ? "border-accent2" : ""}>
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        {(field.options || []).map(([optionKey, label]) => (
          <SelectItem key={optionKey} value={optionKey}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
