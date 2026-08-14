/**
 * Zod v3/v4 compatibility layer.
 *
 * Zod v3 stores schema internals in `schema._def`.
 * Zod v4 stores schema internals in `schema._zod.def`.
 *
 * This module provides helpers that work with both versions.
 */

type UnknownRecord = Record<string, unknown>;

interface SchemaDefinition extends UnknownRecord {
  checks?: unknown[];
  defaultValue?: unknown;
  effect?: { refinement?: object; type?: string };
  element?: unknown;
  entries?: unknown[] | Record<string, unknown>;
  innerType?: unknown;
  left?: unknown;
  options?: unknown[];
  right?: unknown;
  schema?: unknown;
  shape?: Record<string, unknown> | (() => Record<string, unknown>);
  type?: unknown;
  typeName?: unknown;
  value?: unknown;
  values?: unknown;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

export function isV4(schema: unknown): boolean {
  return Boolean(asRecord(schema)?._zod);
}

/**
 * Get the internal definition object for a schema, regardless of Zod version.
 * v3: schema._def
 * v4: schema._zod.def
 */
export function getDef(schema: unknown): SchemaDefinition | undefined {
  const record = asRecord(schema);
  if (!record) {
    return undefined;
  }
  if (isV4(schema)) {
    return asRecord(asRecord(record._zod)?.def) as SchemaDefinition | undefined;
  }
  return asRecord(record._def) as SchemaDefinition | undefined;
}

/**
 * Check if a schema is optional (works for both v3 and v4).
 */
export function isOptional(schema: unknown): boolean {
  const record = asRecord(schema);
  if (typeof record?.isOptional === "function") {
    return Boolean(record.isOptional());
  }
  if (typeof record?.safeParse === "function") {
    return Boolean(asRecord(record.safeParse())?.success);
  }
  return false;
}

/**
 * Get the shape of an object schema (works for both v3 and v4).
 * v3: schema.shape (getter) or schema._def.shape()
 * v4: schema.shape (getter) or schema._zod.def.shape
 */
export function getShape(schema: unknown): Record<string, unknown> | undefined {
  const record = asRecord(schema);
  const directShape = asRecord(record?.shape);
  if (directShape) {
    return directShape;
  }
  const def = getDef(schema);
  if (def?.shape) {
    return typeof def.shape === "function" ? def.shape() : def.shape;
  }
  return undefined;
}

/**
 * Unwrap to the base schema, stripping wrappers like ZodOptional, ZodDefault, ZodEffects, etc.
 * Works for both v3 (_def.innerType, _def.schema) and v4 (_zod.def.innerType, _zod.def.schema).
 */
export function getBaseSchema(schema: unknown): unknown {
  const def = getDef(schema);
  if (!def) {
    return schema;
  }
  if ("innerType" in def) {
    return getBaseSchema(def.innerType);
  }
  if ("schema" in def) {
    return getBaseSchema(def.schema);
  }
  return schema;
}

/**
 * Get enum entries/values from a schema.
 * v3: schema._def.values (array or object)
 * v4: schema._zod.def.entries (array or object)
 */
export function getEnumValues(schema: unknown): unknown[] | Record<string, unknown> | undefined {
  const def = getDef(schema);
  // v4 uses "entries" for enums
  if (def?.entries) {
    return def.entries;
  }
  // v3 uses "values" for enums
  if (def?.values) {
    return Array.isArray(def.values) || asRecord(def.values)
      ? (def.values as unknown[] | Record<string, unknown>)
      : undefined;
  }
  return undefined;
}

/**
 * Get array element schema.
 * v3: schema._def.type
 * v4: schema._zod.def.element
 */
export function getArrayElement(schema: unknown): unknown {
  const def = getDef(schema);
  return def?.element ?? def?.type;
}

/**
 * Get literal value(s) from a ZodLiteral schema.
 * v3: schema._def.value (single value)
 * v4: schema._zod.def.values (array or single value)
 */
export function getLiteralValue(schema: unknown): unknown {
  const def = getDef(schema);
  // v4: values (may be array)
  if (def?.values !== undefined) {
    return Array.isArray(def.values) ? def.values[0] : def.values;
  }
  // v3: value (single)
  if (def?.value !== undefined) {
    return def.value;
  }
  return undefined;
}

/**
 * Get literal values array from a ZodLiteral schema (for fieldConfig customData).
 * v4: schema._zod.def.values
 * v3: schema._def.value (wrapped in array)
 */
export function getLiteralValues(schema: unknown): unknown {
  const def = getDef(schema);
  if (def?.values !== undefined) {
    return def.values;
  }
  if (def?.value !== undefined) {
    return [def.value];
  }
  return undefined;
}

/**
 * Get default value from a ZodDefault schema.
 * v3: schema._def.defaultValue() — it's a function
 * v4: schema._zod.def.defaultValue — it's a direct value
 */
export function getDefaultValue(schema: unknown): unknown {
  const def = getDef(schema);
  if (def?.defaultValue !== undefined) {
    return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
  }
  return undefined;
}

/**
 * Get union options from a ZodUnion or ZodDiscriminatedUnion schema.
 * v3: schema._def.options
 * v4: schema._zod.def.options
 */
export function getUnionOptions(schema: unknown): unknown[] | undefined {
  const def = getDef(schema);
  return def?.options;
}

/**
 * Get intersection left/right from a ZodIntersection schema.
 * v3: schema._def.left, schema._def.right
 * v4: schema._zod.def.left, schema._zod.def.right
 */
export function getIntersection(schema: unknown): { left: unknown; right: unknown } | undefined {
  const def = getDef(schema);
  if (def?.left && def?.right) {
    return { left: def.left, right: def.right };
  }
  // v4 also exposes schema.def directly
  const directDef = asRecord(asRecord(schema)?.def);
  if (directDef?.left && directDef.right) {
    return { left: directDef.left, right: directDef.right };
  }
  return undefined;
}

/**
 * Get string checks from a ZodString schema.
 * v3: schema._def.checks (array of { kind, ... })
 * v4: schema._zod.def.checks (array of check schemas with _zod.def.check and _zod.def.format)
 */
export function getStringChecks(schema: unknown): unknown[] {
  const def = getDef(schema);
  return def?.checks ?? [];
}

/**
 * Check if a string schema has a datetime check.
 * v3: check.kind === 'datetime'
 * v4: check._zod.def.check === 'string_format' && check._zod.def.format === 'datetime'
 */
export function hasDateTimeCheck(checks: unknown[]): boolean {
  return checks.some((check) => {
    // v4 format
    if (isV4(check)) {
      const checkDef = getDef(check);
      return checkDef?.check === "string_format" && checkDef?.format === "datetime";
    }
    // v3 format
    return asRecord(check)?.kind === "datetime";
  });
}

/**
 * Detect if a schema is a ZodObject-like (either v3 or v4).
 */
export function isDefaultSchema(schema: unknown): boolean {
  const def = getDef(schema);
  return (
    def?.typeName === "ZodDefault" ||
    def?.type === "default" ||
    getDefaultValue(schema) !== undefined
  );
}

/**
 * Detect if a schema is a ZodLiteral (either v3 or v4).
 */
export function isLiteralSchema(schema: unknown): boolean {
  const def = getDef(schema);
  return (
    def?.typeName === "ZodLiteral" ||
    def?.type === "literal" ||
    asRecord(schema)?.constructor?.name?.slice(1) === "ZodLiteral"
  );
}

/**
 * Detect if a schema is a ZodIntersection (either v3 or v4).
 */
export function isIntersectionSchema(schema: unknown): boolean {
  const intersection = getIntersection(schema);
  if (!intersection) {
    return false;
  }
  const def = getDef(schema);
  return (
    def?.typeName === "ZodIntersection" ||
    def?.type === "intersection" ||
    asRecord(schema)?.constructor?.name?.slice(1) === "ZodIntersection"
  );
}

/**
 * Detect if a schema is a ZodObject-like (either v3 or v4).
 */
export function isObjectSchema(schema: unknown): boolean {
  return getShape(schema) !== undefined && !isIntersectionSchema(schema);
}
