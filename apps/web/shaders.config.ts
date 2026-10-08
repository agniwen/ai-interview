import { defineConfig } from "shaders/config";

export default defineConfig({
  // Components are imported from 'shaders/react'
  framework: "react",
  // Where `npx shaders install` writes component files
  outDir: "src/components/shaders",
});
