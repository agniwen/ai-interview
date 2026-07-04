import { build } from "vite";

// The Vite CLI can leave Rolldown worker threads alive after TanStack/Nitro
// prerendering on the current toolchain. The JS API resolves and exits cleanly.
try {
  await build();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
