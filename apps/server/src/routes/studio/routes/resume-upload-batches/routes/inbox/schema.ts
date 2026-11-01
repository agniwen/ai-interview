import { z } from "zod";
import { decodeUploadTaskInboxCursor } from "./cursor";

export const uploadTaskInboxQuerySchema = z.object({
  cursor: z
    .string()
    .max(1000)
    .refine((value) => decodeUploadTaskInboxCursor(value) !== null, "分页游标无效")
    .optional(),
});
