import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./drizzle-local",
  schema: "./src/main/database/schema.ts",
});
