import type { CompilerOptions } from "@inlang/paraglide-js";

const PUBLIC_PAGE_STRATEGY: NonNullable<CompilerOptions["strategy"]> = [
  "cookie",
  "preferredLanguage",
  "baseLocale",
];

export const paraglideCompilerOptions = {
  cookieName: "ARC_LOCALE",
  emitTsDeclarations: true,
  isServer: "import.meta.env.SSR",
  outdir: "./src/paraglide",
  outputStructure: "message-modules",
  project: "./project.inlang",
  routeStrategies: [
    { exclude: true, match: "/api/:path(.*)?" },
    { match: "/", strategy: PUBLIC_PAGE_STRATEGY },
    { match: "/login", strategy: PUBLIC_PAGE_STRATEGY },
    { match: "/:path(.*)?", strategy: ["baseLocale"] },
  ],
  strategy: PUBLIC_PAGE_STRATEGY,
} satisfies CompilerOptions;
