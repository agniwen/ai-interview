import { z } from "zod";

export const workspaceSlugSchema = z.object({ workspaceSlug: z.string().trim().min(1) });
