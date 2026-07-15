import { z } from "zod3";

/**
 * Shared form schemas for `toolProviders`. The Agent Builder mounts these
 * on its top-level form schema so save/load can round-trip through the
 * stored agent shape.
 *
 * `kind` is locked to `'author'` for v1. `scope` defaults to `'per-author'` at
 * the runtime layer when absent. Display labels live on the connection row
 * itself and are renamed via `PATCH /tool-providers/.../connections/...`, but
 * pins preserve them because multi-connection toolkits require labels on save.
 */

export const connectionFormSchema = z
  .object({
    connectionId: z.string().min(1),
    kind: z.literal("author"),
    label: z.string().optional(),
    scope: z.enum(["shared", "per-author", "caller-supplied"]).optional(),
    toolkit: z.string().min(1),
  })
  .passthrough();

export const toolProviderConfigFormSchema = z
  .object({
    connections: z.record(z.string(), z.array(connectionFormSchema)),
    tools: z.record(
      z.string(),
      z
        .object({
          description: z.string().optional(),
          toolkit: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const toolProvidersFormSchema = z.record(z.string(), toolProviderConfigFormSchema);

export type ToolProvidersFormValue = z.infer<typeof toolProvidersFormSchema>;
export type ToolProviderConnectionFormValue = z.infer<typeof connectionFormSchema>;

/**
 * Shared `superRefine` helper. Hosts call this from their top-level schema's
 * refinement so they can scope `path` correctly.
 */
export function validateToolProviders(
  providers: ToolProvidersFormValue | undefined,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = ["toolProviders"],
): void {
  if (!providers) {
    return;
  }

  for (const [providerId, config] of Object.entries(providers)) {
    for (const [toolkit, connections] of Object.entries(config.connections ?? {})) {
      const seenConnectionIds = new Map<string, number>();
      for (const [index, connection] of connections.entries()) {
        if (connection.scope === "caller-supplied") {
          continue;
        }
        if (seenConnectionIds.has(connection.connectionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `连接“${connection.connectionId}”已固定到 ${toolkit}`,
            path: [...basePath, providerId, "connections", toolkit, index, "connectionId"],
          });
        } else {
          seenConnectionIds.set(connection.connectionId, index);
        }
      }
    }

    // Every selected tool must have at least one connection on its toolkit.
    for (const [slug, meta] of Object.entries(config.tools ?? {})) {
      const bucket = config.connections?.[meta.toolkit] ?? [];
      if (bucket.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `工具“${slug}”至少需要一个 ${meta.toolkit} 连接`,
          path: [...basePath, providerId, "tools", slug],
        });
      }
    }
  }
}
