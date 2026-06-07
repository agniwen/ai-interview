import { devToolsMiddleware } from "@ai-sdk/devtools";
import { wrapLanguageModel } from "ai";

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/**
 * Wraps a LanguageModel with the AI SDK DevTools middleware in development
 * only. In production the model is returned as-is.
 *
 * DevTools persists every generation to `.devtools/generations.json` on disk,
 * which is inappropriate for production workloads handling user data.
 *
 * Launch the viewer with: `npx @ai-sdk/devtools` (http://localhost:4983).
 */
export function withDevTools(model: WrappableModel): WrappableModel {
  if (process.env.NODE_ENV !== "development") {
    return model;
  }

  return wrapLanguageModel({
    middleware: devToolsMiddleware(),
    model,
  });
}
