import { z } from "zod";

const searchParamPrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
const searchParamsSchema = z.record(
  z.string(),
  z.union([searchParamPrimitiveSchema, z.array(searchParamPrimitiveSchema), z.undefined()]),
);

export type SearchParamsRecord = z.infer<typeof searchParamsSchema>;

export const coerceSearchParams = searchParamsSchema.parse;

export function firstSearchValue(value: SearchParamsRecord[string]): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue === undefined ? undefined : String(firstValue);
}
