import { z } from "zod";

export const workspaceSlugSchema = z.object({ slug: z.string().trim().min(1) });
