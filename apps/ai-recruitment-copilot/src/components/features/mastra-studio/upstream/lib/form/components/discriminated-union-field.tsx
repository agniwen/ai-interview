import type { ParsedField } from "@autoform/core";
import type { AutoFormFieldProps } from "@autoform/react";
import { useFormContext } from "react-hook-form";
import { CustomAutoFormField } from "./custom-auto-form-field";

function createLiteralField(literalSchemas: ParsedField[]) {
  const [firstLiteralSchema] = literalSchemas;
  if (!firstLiteralSchema) {
    return;
  }

  const options: [string, string][] = [];
  for (const literal of literalSchemas) {
    for (const literalValue of literal.fieldConfig?.customData?.literalValues ?? []) {
      options.push([literalValue, literalValue]);
    }
  }
  return {
    default: firstLiteralSchema.default,
    description: firstLiteralSchema.description,
    fieldConfig: firstLiteralSchema.fieldConfig,
    key: firstLiteralSchema.key,
    options,
    required: firstLiteralSchema.required,
    type: "select",
  };
}

function collectVariantFields(schemas: ParsedField[]) {
  const fields: Record<string, ParsedField[]> = {};
  for (const candidateSchema of schemas) {
    const literalSchema = candidateSchema.schema?.find(
      (candidate: ParsedField) => candidate.fieldConfig?.customData?.isLiteral,
    );
    const literalSchemaValue = literalSchema?.fieldConfig?.customData?.literalValues?.[0];
    if (literalSchemaValue) {
      fields[literalSchemaValue] =
        candidateSchema.schema?.filter(
          (candidate: ParsedField) => candidate.key !== literalSchema.key,
        ) ?? [];
    }
  }
  return fields;
}

export const DiscriminatedUnionField: React.FC<AutoFormFieldProps> = ({ field, path }) => {
  const { watch } = useFormContext();
  const fullPath = path.join(".");
  const value = watch(fullPath);
  const allSchemas = field.schema?.flatMap((schema: ParsedField) => schema.schema || []) || [];
  const literalSchemas =
    allSchemas?.filter((schema: ParsedField) => schema.fieldConfig?.customData?.isLiteral) || [];
  const literalSchemaField = createLiteralField(literalSchemas);
  if (!literalSchemaField) {
    return null;
  }
  const otherFieldSchemas = collectVariantFields(field.schema ?? []);

  const andFieldSchemas = field.schema?.filter((candidateSchema) => {
    const literalSchema = candidateSchema.schema?.find(
      (candidate: ParsedField) => candidate.fieldConfig?.customData?.isLiteral,
    );
    return !literalSchema;
  });

  const literalFieldValue = value?.[literalSchemaField.key];

  return (
    <div key={field.key}>
      <CustomAutoFormField
        key={`${fullPath}.${literalSchemaField.key}`}
        field={literalSchemaField}
        path={[...path, literalSchemaField.key]}
      />
      {literalFieldValue &&
        otherFieldSchemas?.[literalFieldValue] &&
        otherFieldSchemas[literalFieldValue].map((candidate: ParsedField) => (
          <CustomAutoFormField
            key={`${fullPath}.${candidate.key}`}
            field={candidate}
            path={[...path, candidate.key]}
          />
        ))}
      {andFieldSchemas &&
        andFieldSchemas.map((candidate: ParsedField) => (
          <CustomAutoFormField
            key={`${fullPath}.${candidate.key}`}
            field={candidate}
            path={[...path, candidate.key]}
          />
        ))}
    </div>
  );
};
