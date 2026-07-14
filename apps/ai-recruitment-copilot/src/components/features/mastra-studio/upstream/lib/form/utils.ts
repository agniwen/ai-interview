import type { FieldConfig } from "@autoform/core";
import { buildZodFieldConfig } from "@autoform/react";
import { convertSchemaToZod } from "@mastra/schema-compat";
import type { ZodTypeAny } from "zod3";
import type { FieldTypes } from "./auto-form";

// @ts-expect-error - TODO
export const fieldConfig: FieldConfig = buildZodFieldConfig<FieldTypes, Record<string, never>>();

export function removeEmptyValues<T extends Record<string, unknown>>(values: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(values) as [keyof T, T[keyof T]][]) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      const newArray = value.map((item: unknown) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const cleanedItem = removeEmptyValues(item as Record<string, unknown>);
          if (Object.keys(cleanedItem).length > 0) {
            return cleanedItem;
          }
          return null;
        }
        return item;
      });
      const filteredArray = newArray.filter((item) => item !== null);
      if (filteredArray.length > 0) {
        result[key] = filteredArray as T[keyof T];
      }
    } else if (value && typeof value === "object") {
      const cleanedValue = removeEmptyValues(value as Record<string, unknown>);
      if (Object.keys(cleanedValue).length > 0) {
        result[key] = cleanedValue as T[keyof T];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Resolve serialized zod output - This function takes the string output of the `jsonSchemaToZod` function
 * and instantiates the zod object correctly.
 *
 * @param obj - serialized zod object
 * @returns resolved zod object
 */
export function resolveSerializedZodOutput(
  schema: Parameters<typeof convertSchemaToZod>[0],
): ZodTypeAny {
  return convertSchemaToZod(schema) as unknown as ZodTypeAny;
}
