// 与官方 docs (workflow/docs/deploying/world/postgres-world.mdx) 的写法一致;
// world-postgres 的依赖打包问题在 next.config.ts 用 outputFileTracingIncludes
// + serverExternalPackages 解决, 这里不需要做任何 hack。
// Mirrors the official docs' instrumentation example
// (workflow/docs/deploying/world/postgres-world.mdx). The standalone-build
// bundling for world-postgres is handled in next.config.ts via
// outputFileTracingIncludes + serverExternalPackages.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { getWorld } = await import("workflow/runtime");
    await getWorld().start?.();
  }
}
