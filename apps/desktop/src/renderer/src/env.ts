import { z } from "zod";

const envSchema = z.object({
  VITE_BASE_URL: z.string().url(),
  VITE_BETTER_AUTH_URL: z.string().url(),
});

function readEnv() {
  const parsed = envSchema.safeParse({
    VITE_BASE_URL: import.meta.env.VITE_BASE_URL,
    VITE_BETTER_AUTH_URL: import.meta.env.VITE_BETTER_AUTH_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Desktop env invalid. Copy apps/desktop/.env.example → .env (${details})`);
  }

  return parsed.data;
}

export const env = readEnv();
