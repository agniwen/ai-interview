import { getDef, getDefaultValue, getLiteralValue, getShape } from "./compat";

const isLiteralSchema = (schema: unknown, typeName?: unknown, type?: unknown) => {
  const constructorName =
    schema && typeof schema === "object" ? schema.constructor.name.slice(1) : undefined;
  return typeName === "ZodLiteral" || type === "literal" || constructorName === "ZodLiteral";
};

const defaultValueResolver = {
  shape(schema: unknown): Record<string, unknown> {
    const shape = getShape(schema);
    if (!shape) {
      return {};
    }

    const values: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      const defaultValue = defaultValueResolver.stack(field);
      if (defaultValue !== undefined) {
        values[key] = defaultValue;
      }
    }
    return values;
  },

  stack(schema: unknown): unknown {
    const def = getDef(schema);
    if (!def) {
      return undefined;
    }

    const defaultValue = getDefaultValue(schema);
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    const literalValue = getLiteralValue(schema);
    if (literalValue !== undefined && isLiteralSchema(schema, def.typeName, def.type)) {
      return literalValue;
    }

    if ("innerType" in def) {
      return defaultValueResolver.stack(def.innerType);
    }
    if ("schema" in def) {
      return defaultValueResolver.stack(def.schema);
    }

    const shape = getShape(schema);
    if (shape && !("left" in def)) {
      return defaultValueResolver.shape(schema);
    }

    if ("left" in def && "right" in def) {
      const left = getShape(def.left)
        ? defaultValueResolver.shape(def.left)
        : defaultValueResolver.stack(def.left);
      const right = getShape(def.right)
        ? defaultValueResolver.shape(def.right)
        : defaultValueResolver.stack(def.right);
      return {
        ...(left && typeof left === "object" ? left : {}),
        ...(right && typeof right === "object" ? right : {}),
      };
    }

    return undefined;
  },
};

export function getDefaultValueInZodStack(schema: unknown): unknown {
  return defaultValueResolver.stack(schema);
}

export function getDefaultValues(schema: unknown): Record<string, unknown> {
  return defaultValueResolver.shape(schema);
}
