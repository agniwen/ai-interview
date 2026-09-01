import { globalConfigSchema } from "@arc/shared/global-config";
import { z } from "zod";

export { globalConfigSchema };

export const globalConfigResponseSchema = globalConfigSchema.extend({
  updatedAt: z.iso.datetime(),
  updatedBy: z.string().nullable(),
});
