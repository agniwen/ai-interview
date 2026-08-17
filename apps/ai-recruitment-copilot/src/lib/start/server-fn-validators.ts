import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

export const codeInputSchema = z.object({
  code: nonEmptyStringSchema,
});

export const idInputSchema = z.object({
  id: nonEmptyStringSchema,
});

export const inviteTokenInputSchema = z.object({
  inviteToken: nonEmptyStringSchema,
});

export const slugInputSchema = z.object({
  slug: nonEmptyStringSchema,
});

export const emptyFiltersSchema = z.object({});

const dataGridSortOrderSchema = z.custom<"asc" | "desc" | undefined>(
  (value) => value === undefined || value === "asc" || value === "desc",
);
const dataGridSortBySchema = z.union([z.string(), z.undefined()]);

export function dataGridQuerySchema<TFilters extends z.ZodType<Record<string, string>>>(
  filtersSchema: TFilters,
) {
  return z.object({
    filters: filtersSchema,
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    search: z.string(),
    sortBy: dataGridSortBySchema,
    sortOrder: dataGridSortOrderSchema,
  });
}

export function platformDataGridInputSchema<TFilters extends z.ZodType<Record<string, string>>>(
  filtersSchema: TFilters,
) {
  return z.object({
    query: dataGridQuerySchema(filtersSchema),
  });
}

export function workspaceDataGridInputSchema<TFilters extends z.ZodType<Record<string, string>>>(
  filtersSchema: TFilters,
) {
  return z.object({
    query: dataGridQuerySchema(filtersSchema),
    slug: nonEmptyStringSchema,
  });
}
