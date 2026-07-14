import { render, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { StudioConfigForm } from "../components/studio-config-form";
import { StudioConfigContext } from "../context/studio-config-state";
import type { StudioConfigContextType } from "../context/studio-config-state";
import type { StudioConfig } from "../types";

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderWithConfig(
  ui: React.ReactElement,
  { setConfig = vi.fn() }: { setConfig?: StudioConfigContextType["setConfig"] } = {},
) {
  const contextValue: StudioConfigContextType = {
    apiPrefix: undefined,
    baseUrl: "",
    headers: {},
    isLoading: false,
    setConfig,
  };
  return render(
    <StudioConfigContext.Provider value={contextValue}>{ui}</StudioConfigContext.Provider>,
  );
}

/**
 * Tests for issue https://github.com/mastra-ai/mastra/issues/14634
 *
 * Bug: The settings page previously passed `{ baseUrl, headers }` to StudioConfigForm
 * but omitted `apiPrefix`, causing the field to display empty and revert on save.
 */
describe("StudioConfigForm apiPrefix contract (issue #14634)", () => {
  it("should display the custom apiPrefix in the form field", () => {
    const initialConfig: StudioConfig = {
      apiPrefix: "/mastra",
      baseUrl: "http://localhost:4111",
      headers: {},
    };

    const { container } = renderWithConfig(<StudioConfigForm initialConfig={initialConfig} />);

    const apiPrefixInput = container.querySelector('input[name="apiPrefix"]') as HTMLInputElement;
    expect(apiPrefixInput).not.toBeNull();
    expect(apiPrefixInput.value).toBe("/mastra");
  });

  it("should preserve apiPrefix when submitting the form", () => {
    const mockSetConfig = vi.fn();
    const initialConfig: StudioConfig = {
      apiPrefix: "/mastra",
      baseUrl: "http://localhost:4111",
      headers: { Authorization: "Bearer test" },
    };

    const { container } = renderWithConfig(<StudioConfigForm initialConfig={initialConfig} />, {
      setConfig: mockSetConfig,
    });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiPrefix: "/mastra",
        baseUrl: "http://localhost:4111",
      }),
    );
  });

  it("should submit apiPrefix as undefined when field is empty", () => {
    const mockSetConfig = vi.fn();
    const initialConfig: StudioConfig = {
      baseUrl: "http://localhost:4111",
      headers: {},
    };

    const { container } = renderWithConfig(<StudioConfigForm initialConfig={initialConfig} />, {
      setConfig: mockSetConfig,
    });

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiPrefix: undefined,
      }),
    );
  });

  it("should handle the default /api prefix round-trip", () => {
    const mockSetConfig = vi.fn();
    const initialConfig: StudioConfig = {
      apiPrefix: "/api",
      baseUrl: "http://localhost:4111",
      headers: {},
    };

    const { container } = renderWithConfig(<StudioConfigForm initialConfig={initialConfig} />, {
      setConfig: mockSetConfig,
    });

    const apiPrefixInput = container.querySelector('input[name="apiPrefix"]') as HTMLInputElement;
    expect(apiPrefixInput.value).toBe("/api");

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiPrefix: "/api",
      }),
    );
  });

  it("should call onSave callback after submitting", () => {
    const mockOnSave = vi.fn();
    const initialConfig: StudioConfig = {
      apiPrefix: "/mastra",
      baseUrl: "http://localhost:4111",
      headers: {},
    };

    const { container } = renderWithConfig(
      <StudioConfigForm initialConfig={initialConfig} onSave={mockOnSave} />,
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(mockOnSave).toHaveBeenCalledOnce();
  });
});
