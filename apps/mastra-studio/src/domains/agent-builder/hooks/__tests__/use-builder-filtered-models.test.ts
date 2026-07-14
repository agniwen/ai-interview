import type { BuilderModelPolicy, Provider } from "@mastra/client-js";
import { MastraReactProvider } from "@mastra/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { createElement } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ModelInfo } from "../../../llm/hooks/use-filtered-models";
import {
  useBuilderFilteredModels,
  useBuilderFilteredProviders,
} from "../use-builder-filtered-models";
import { allProviders, availableModelsResponse } from "./fixtures/builder-models";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:4111";

const providers = allProviders;

const allModels: ModelInfo[] = providers.flatMap((p) =>
  p.models.map((model) => ({ model, provider: p.id, providerName: p.name })),
);

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) =>
    createElement(MastraReactProvider, {
      baseUrl: BASE_URL,
      children: createElement(QueryClientProvider, { client: queryClient }, children as ReactNode),
    });
};

/**
 * The allowed `provider:model` set comes from `GET /editor/builder/models/available`,
 * which the client surfaces as `getBuilderAvailableModels()`. The policy argument
 * only toggles pass-through; the actual membership is whatever the endpoint returns.
 */
const setAvailable = (available: Provider[]) => {
  server.use(
    http.get(`${BASE_URL}/api/editor/builder/models/available`, () =>
      HttpResponse.json(availableModelsResponse(available)),
    ),
  );
};

beforeEach(() => {
  setAvailable([]);
});

describe("useBuilderFilteredProviders", () => {
  describe("when the policy does not constrain the picker", () => {
    it("passes through every provider when the policy is inactive", () => {
      const policy: BuilderModelPolicy = { active: false };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      expect(result.current).toEqual(providers);
    });

    it("passes through every provider when allowed is undefined", () => {
      const policy: BuilderModelPolicy = { active: true, pickerVisible: true };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      expect(result.current).toEqual(providers);
    });

    it("passes through every provider when allowed is empty (server-side contract)", () => {
      const policy: BuilderModelPolicy = { active: true, allowed: [], pickerVisible: true };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      expect(result.current).toEqual(providers);
    });
  });

  describe("when a provider wildcard is in the available set", () => {
    it("keeps providers with at least one available model", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "OPENAI_API_KEY",
          id: "openai",
          models: ["gpt-4o", "gpt-4o-mini"],
          name: "OpenAI",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ provider: "openai" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].id).toBe("openai");
      expect(result.current[0].models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    });
  });

  describe("when only specific models are in the available set", () => {
    it("narrows models within a provider to the available set", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "OPENAI_API_KEY",
          id: "openai",
          models: ["gpt-4o-mini"],
          name: "OpenAI",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ modelId: "gpt-4o-mini", provider: "openai" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].models).toEqual(["gpt-4o-mini"]);
    });
  });

  describe("when a custom-kind provider is in the available set", () => {
    it("keeps the custom provider", async () => {
      setAvailable([
        {
          connected: false,
          envVar: "ACME_API_KEY",
          id: "acme/gateway",
          models: ["acme-mini"],
          name: "Acme Gateway",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ kind: "custom", provider: "acme/gateway" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].id).toBe("acme/gateway");
    });
  });

  describe("when the available set excludes every provider", () => {
    it("returns no providers", async () => {
      setAvailable([]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ provider: "made-up" as "openai" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current).toEqual([]));
    });
  });

  describe("when a wildcard and a specific-model entry are combined", () => {
    it("keeps both providers with the correct model narrowing", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "OPENAI_API_KEY",
          id: "openai",
          models: ["gpt-4o", "gpt-4o-mini"],
          name: "OpenAI",
        },
        {
          connected: true,
          envVar: "ANTHROPIC_API_KEY",
          id: "anthropic",
          models: ["claude-opus-4-7"],
          name: "Anthropic",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ provider: "openai" }, { modelId: "claude-opus-4-7", provider: "anthropic" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredProviders(providers, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current).toHaveLength(2));
      expect(result.current.map((p) => p.id)).toEqual(["openai", "anthropic"]);
      const openai = result.current.find((p) => p.id === "openai");
      const anthropic = result.current.find((p) => p.id === "anthropic");
      expect(openai?.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
      expect(anthropic?.models).toEqual(["claude-opus-4-7"]);
      expect(result.current.find((p) => p.id === "acme/gateway")).toBeUndefined();
    });
  });
});

describe("useBuilderFilteredModels", () => {
  describe("when the policy does not constrain the picker", () => {
    it("passes through every model when the policy is inactive", () => {
      const policy: BuilderModelPolicy = { active: false };
      const { result } = renderHook(() => useBuilderFilteredModels(allModels, policy), {
        wrapper: createWrapper(),
      });
      expect(result.current).toEqual(allModels);
    });

    it("passes through every model when allowed is undefined", () => {
      const policy: BuilderModelPolicy = { active: true, pickerVisible: true };
      const { result } = renderHook(() => useBuilderFilteredModels(allModels, policy), {
        wrapper: createWrapper(),
      });
      expect(result.current).toEqual(allModels);
    });
  });

  describe("when the available set narrows the models", () => {
    it("intersects with the available set for a provider wildcard", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "OPENAI_API_KEY",
          id: "openai",
          models: ["gpt-4o", "gpt-4o-mini"],
          name: "OpenAI",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ provider: "openai" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredModels(allModels, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() =>
        expect(result.current.map((m) => m.model)).toEqual(["gpt-4o", "gpt-4o-mini"]),
      );
    });

    it("intersects with the available set for a specific modelId", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "ANTHROPIC_API_KEY",
          id: "anthropic",
          models: ["claude-opus-4-7"],
          name: "Anthropic",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ modelId: "claude-opus-4-7", provider: "anthropic" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredModels(allModels, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() =>
        expect(result.current).toEqual([
          { model: "claude-opus-4-7", provider: "anthropic", providerName: "Anthropic" },
        ]),
      );
    });

    it("intersects with a combined provider-wildcard + specific-modelId available set", async () => {
      setAvailable([
        {
          connected: true,
          envVar: "OPENAI_API_KEY",
          id: "openai",
          models: ["gpt-4o", "gpt-4o-mini"],
          name: "OpenAI",
        },
        {
          connected: true,
          envVar: "ANTHROPIC_API_KEY",
          id: "anthropic",
          models: ["claude-opus-4-7"],
          name: "Anthropic",
        },
      ]);
      const policy: BuilderModelPolicy = {
        active: true,
        allowed: [{ provider: "openai" }, { modelId: "claude-opus-4-7", provider: "anthropic" }],
        pickerVisible: true,
      };
      const { result } = renderHook(() => useBuilderFilteredModels(allModels, policy), {
        wrapper: createWrapper(),
      });
      await waitFor(() =>
        expect(result.current).toEqual([
          { model: "gpt-4o", provider: "openai", providerName: "OpenAI" },
          { model: "gpt-4o-mini", provider: "openai", providerName: "OpenAI" },
          { model: "claude-opus-4-7", provider: "anthropic", providerName: "Anthropic" },
        ]),
      );
      expect(result.current.find((m) => m.model === "claude-haiku-4-5")).toBeUndefined();
      expect(result.current.find((m) => m.model === "acme-mini")).toBeUndefined();
    });
  });
});
