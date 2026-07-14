import type { StoredToolProviderConfig } from "@mastra/client-js";
import { describe, expect, it } from "vitest";

import {
  buildToolProvidersForSave,
  extractFormToolProviders,
} from "../tool-providers-form-mappers";

describe("tool provider form mappers", () => {
  it("round-trips labeled connections for multi-connection toolkits", () => {
    const stored: Record<string, StoredToolProviderConfig> = {
      composio: {
        connections: {
          gmail: [
            {
              connectionId: "conn_work",
              kind: "author",
              label: "work",
              scope: "per-author",
              toolkit: "gmail",
            },
            {
              connectionId: "conn_personal",
              kind: "author",
              label: "personal",
              scope: "per-author",
              toolkit: "gmail",
            },
          ],
        },
        tools: {
          GMAIL_FETCH_EMAILS: { toolkit: "gmail" },
        },
      },
    };

    const formValue = extractFormToolProviders(stored);

    expect(formValue?.composio.connections.gmail).toEqual([
      expect.objectContaining({
        connectionId: "conn_work",
        kind: "author",
        label: "work",
        toolkit: "gmail",
      }),
      expect.objectContaining({
        connectionId: "conn_personal",
        kind: "author",
        label: "personal",
        toolkit: "gmail",
      }),
    ]);
    expect(buildToolProvidersForSave(formValue)?.composio.connections.gmail).toEqual([
      expect.objectContaining({
        connectionId: "conn_work",
        kind: "author",
        label: "work",
        toolkit: "gmail",
      }),
      expect.objectContaining({
        connectionId: "conn_personal",
        kind: "author",
        label: "personal",
        toolkit: "gmail",
      }),
    ]);
  });

  it("skips malformed provider entries instead of throwing", () => {
    const stored: Record<string, unknown> = {
      arcade: "oops",
      composio: null,
      valid: {
        connections: { gmail: [{ connectionId: "conn_a", kind: "author", toolkit: "gmail" }] },
        tools: { GMAIL_FETCH_EMAILS: { toolkit: "gmail" } },
      },
    };

    const formValue = extractFormToolProviders(stored);

    expect(formValue).toBeDefined();
    expect(Object.keys(formValue ?? {})).toEqual(["valid"]);
  });

  it("returns undefined when every provider entry is malformed", () => {
    expect(extractFormToolProviders({ composio: null })).toBeUndefined();
  });
});
