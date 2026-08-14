import type { FieldConfig } from "@autoform/core";
import {
  getDef,
  getStringChecks,
  hasDateTimeCheck,
  getUnionOptions,
  getShape,
  getLiteralValue,
} from "./compat";

const STANDARD_FIELD_TYPES: Record<string, string> = {
  ZodArray: "array",
  ZodBoolean: "boolean",
  ZodDiscriminatedUnion: "discriminated-union",
  ZodEnum: "select",
  ZodIntersection: "object",
  ZodNativeEnum: "select",
  ZodNumber: "number",
  ZodObject: "object",
  ZodRecord: "record",
};

function isLiteralSchema(value: unknown) {
  const constructorName =
    value && typeof value === "object" ? value.constructor.name.slice(1) : undefined;
  const def = getDef(value);
  return (
    constructorName === "ZodLiteral" || def?.typeName === "ZodLiteral" || def?.type === "literal"
  );
}

function inferUnionType(schema: unknown) {
  const options = getUnionOptions(schema);
  if (!options) {
    return "union";
  }
  const hasLiteral = options.every((option: unknown) => {
    const shape = getShape(option);
    return shape ? Object.values(shape).some(isLiteralSchema) : false;
  });
  return hasLiteral ? "discriminated-union" : "union";
}

export function inferFieldType(schema: unknown, fieldConfig?: FieldConfig): string {
  if (fieldConfig?.fieldType) {
    return fieldConfig.fieldType;
  }

  //starts with an underscore, so we want to pick from second character
  const constructorName = schema?.constructor?.name?.slice(1);
  const def = getDef(schema);
  const v4Type =
    typeof def?.type === "string"
      ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
      : undefined;
  const rawTypeName = def?.typeName ?? v4Type ?? constructorName;
  const typeName = typeof rawTypeName === "string" ? rawTypeName : undefined;

  const standardType = typeName ? STANDARD_FIELD_TYPES[typeName] : undefined;
  if (standardType) {
    return standardType;
  }

  if (typeName === "ZodString") {
    const checks = getStringChecks(schema);
    if (hasDateTimeCheck(checks)) {
      return "date";
    }
    return "string";
  }

  if (typeName === "ZodUnion") {
    return inferUnionType(schema);
  }

  if (typeName === "ZodLiteral") {
    const literalValue = getLiteralValue(schema);
    if (typeof literalValue === "number") {
      return "number";
    }
    if (typeof literalValue === "boolean") {
      return "boolean";
    }
    return "string";
  }

  // Default to string for unknown types.
  return "string";
}
