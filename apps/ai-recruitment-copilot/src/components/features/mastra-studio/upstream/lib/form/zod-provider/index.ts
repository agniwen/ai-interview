import type {
  FieldConfig,
  ParsedField,
  ParsedSchema,
  SchemaProvider,
  SchemaValidation,
} from "@autoform/core";
import { removeEmptyValues } from "../utils";
import {
  getDef,
  getBaseSchema,
  getEnumValues,
  getShape,
  getArrayElement,
  getLiteralValues,
  getUnionOptions,
  getIntersection,
  isOptional,
} from "./compat";
import { getDefaultValues, getDefaultValueInZodStack } from "./default-values";
import { inferFieldType } from "./field-type-inference";

interface ValidationIssue {
  message: string;
  path: PropertyKey[];
}

interface SafeParseResult {
  data?: unknown;
  error?: { errors?: ValidationIssue[]; issues?: ValidationIssue[] };
  success: boolean;
}

interface SchemaLike {
  description?: string;
  safeParse(values: unknown): SafeParseResult;
}

/**
 * Version-agnostic field config extraction.
 * For generated schemas (from jsonSchemaToZod), there's no @autoform/zod fieldConfig() wrapper,
 * so this returns undefined. If a schema happens to carry field config, it will be found here.
 */
function getFieldConfigInZodStack(schema: unknown): FieldConfig | undefined {
  const def = getDef(schema);
  if (!def) {
    return undefined;
  }

  // v3: field config stored via Symbol on refinement function
  if (def.typeName === "ZodEffects" && def.effect?.type === "refinement") {
    const fn = def.effect?.refinement;
    if (fn) {
      const symbols = Object.getOwnPropertySymbols(fn);
      for (const sym of symbols) {
        const val = (fn as Record<PropertyKey, unknown>)[sym];
        if (val && typeof val === "object") {
          return val as FieldConfig;
        }
      }
    }
  }

  // Recurse into wrappers
  if ("innerType" in def) {
    return getFieldConfigInZodStack(def.innerType);
  }
  if ("schema" in def) {
    return getFieldConfigInZodStack(def.schema);
  }

  return undefined;
}

function getSchemaTypeName(schema: unknown) {
  const def = getDef(schema);
  const record = schema && typeof schema === "object" ? (schema as Record<string, unknown>) : {};
  const constructorName = record.constructor?.name?.slice(1);
  const v4Type =
    typeof def?.type === "string"
      ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
      : undefined;
  return def?.typeName ?? v4Type ?? constructorName;
}

function getOptionValues(schema: unknown): [string, string][] {
  const options = getEnumValues(schema);
  if (!options) {
    return [];
  }
  return Array.isArray(options)
    ? options.map((value) => [String(value), String(value)])
    : Object.entries(options).map(([key, value]) => [key, String(value)]);
}

interface FieldParserApi {
  getChildFields(
    key: string,
    baseSchema: unknown,
    initialType: string,
  ): { fields: ParsedField[]; type: string };
  parse(key: string, schema: unknown): ParsedField;
}

const fieldParser: FieldParserApi = {
  getChildFields(
    key: string,
    baseSchema: unknown,
    initialType: string,
  ): { fields: ParsedField[]; type: string } {
    const shape = getShape(baseSchema);
    if (shape && !getIntersection(baseSchema)) {
      return {
        fields: Object.entries(shape).map(([childKey, field]) =>
          fieldParser.parse(childKey, field),
        ),
        type: initialType,
      };
    }

    const typeName = getSchemaTypeName(baseSchema);
    const unionOptions = getUnionOptions(baseSchema);
    if ((typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") && unionOptions) {
      return {
        fields: unionOptions.map((field, index) => fieldParser.parse(String(index), field)),
        type: initialType,
      };
    }

    const intersection = getIntersection(baseSchema);
    if (intersection) {
      const left = fieldParser.getChildFields(key, intersection.left, initialType);
      const right = fieldParser.getChildFields(key, intersection.right, left.type);
      return { fields: [...left.fields, ...right.fields], type: right.type };
    }

    if (typeName === "ZodArray") {
      const element = getArrayElement(baseSchema);
      return { fields: element ? [fieldParser.parse("0", element)] : [], type: initialType };
    }

    const child =
      baseSchema === getBaseSchema(baseSchema) ? undefined : fieldParser.parse(key, baseSchema);
    return { fields: child?.schema ?? (child ? [child] : []), type: child?.type ?? initialType };
  },

  parse(key: string, schema: unknown): ParsedField {
    const baseSchema = getBaseSchema(schema);
    const fieldConfig = getFieldConfigInZodStack(schema);
    const initialType = inferFieldType(baseSchema, fieldConfig);
    const defaultValue = getDefaultValueInZodStack(schema);
    const optionValues = getOptionValues(baseSchema);
    const { fields: subSchema, type } = fieldParser.getChildFields(key, baseSchema, initialType);
    const baseTypeName = getSchemaTypeName(baseSchema);

    const isLiteral = baseTypeName === "ZodLiteral";
    const literalValues = isLiteral ? getLiteralValues(baseSchema) : undefined;

    return {
      default: defaultValue,
      description:
        baseSchema && typeof baseSchema === "object"
          ? ((baseSchema as Record<string, unknown>).description as string | undefined)
          : undefined,
      fieldConfig:
        isLiteral || Object.keys(fieldConfig ?? {})?.length > 0
          ? {
              ...fieldConfig,
              customData: {
                ...fieldConfig?.customData,
                ...(isLiteral ? { isLiteral, literalValues } : {}),
              },
            }
          : undefined,
      key,
      options: optionValues,
      required: !isOptional(schema),
      schema: subSchema,
      type,
    };
  },
};

export function parseSchema(schema: unknown): ParsedSchema {
  const shape = getShape(schema);
  if (!shape) {
    return { fields: [] };
  }

  const fields: ParsedField[] = Object.entries(shape).map(([key, field]) =>
    fieldParser.parse(key, field),
  );

  return { fields };
}

export class CustomZodProvider<T extends SchemaLike> implements SchemaProvider {
  private _schema: T;
  constructor(schema: T) {
    if (!schema) {
      throw new Error("CustomZodProvider: schema is required");
    }
    this._schema = schema;
  }

  getDefaultValues(): Record<string, unknown> {
    return getDefaultValues(this._schema);
  }

  validateSchema(values: Record<string, unknown>): SchemaValidation {
    const cleanedValues = removeEmptyValues(values);
    const validationResult = this._schema.safeParse(cleanedValues);
    if (validationResult.success) {
      return { data: validationResult.data, success: true } as const;
    }
    const issues = validationResult.error?.issues ?? validationResult.error?.errors ?? [];
    return {
      errors: issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map(String),
      })),
      success: false,
    } as const;
  }

  parseSchema(): ParsedSchema {
    return parseSchema(this._schema);
  }
}
