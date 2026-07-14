import type { AutoFormFieldProps } from "@autoform/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FormHTMLAttributes, PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CustomAutoForm } from "../custom-auto-form";
import { CustomZodProvider } from "../zod-provider";

const uiComponents = {
  ArrayElementWrapper: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ArrayWrapper: ({ children }: PropsWithChildren) => <fieldset>{children}</fieldset>,
  ErrorMessage: ({ error }: { error: string }) => <p>{error}</p>,
  FieldWrapper: ({ label, children }: PropsWithChildren<{ label: string }>) => (
    <label>
      {label}
      {children}
    </label>
  ),
  Form: ({ children, ...props }: PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>) => (
    <form {...props}>{children}</form>
  ),
  ObjectWrapper: ({ children }: PropsWithChildren) => <fieldset>{children}</fieldset>,
  SubmitButton: ({ children }: PropsWithChildren) => <button type="submit">{children}</button>,
};

function SelectProbe({ value, inputProps }: AutoFormFieldProps) {
  return (
    <div>
      <output data-testid="selected-mode">{String(value ?? "")}</output>
      <button
        type="button"
        onClick={() => {
          inputProps.onChange({
            target: { name: inputProps.name, value: "b" },
          });
        }}
      >
        Select b
      </button>
    </div>
  );
}

describe("CustomAutoForm", () => {
  it("updates controlled enum fields when their form value changes", async () => {
    const onSubmit = vi.fn();
    const schema = new CustomZodProvider(
      z.object({
        mode: z.enum(["a", "b"]).default("a"),
      }),
    );

    render(
      <CustomAutoForm
        schema={schema}
        uiComponents={uiComponents}
        formComponents={{ select: SelectProbe }}
        onSubmit={onSubmit}
        withSubmit
      />,
    );

    expect(screen.getByTestId("selected-mode").textContent).toBe("a");

    fireEvent.click(screen.getByRole("button", { name: "Select b" }));

    await expect.poll(() => screen.getByTestId("selected-mode").textContent).toBe("b");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ mode: "b" }, expect.anything());
    });
  });
});
