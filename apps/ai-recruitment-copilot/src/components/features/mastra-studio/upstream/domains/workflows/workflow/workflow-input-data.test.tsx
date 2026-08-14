import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod3";

import { WorkflowInputData } from "./workflow-input-data";

vi.mock("@mastra/playground-ui/components/Button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("@mastra/playground-ui/components/CodeEditor", () => ({
  CodeEditor: () => null,
}));
vi.mock("@mastra/playground-ui/components/Collapsible", () => ({
  Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@mastra/playground-ui/components/Select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));
vi.mock("@mastra/playground-ui/components/Txt", () => ({
  Txt: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@mastra/playground-ui/icons/Icon", () => ({
  Icon: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@mastra/playground-ui/utils/cn", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("./workflow-input-type-toggle", () => ({
  WorkflowInputTypeToggle: () => null,
}));
vi.mock("@/components/features/mastra-studio/upstream/lib/form/dynamic-form", () => ({
  DynamicForm: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

describe("WorkflowInputData", () => {
  it("renders when the workflow has no default input", () => {
    expect(() =>
      renderToStaticMarkup(
        <WorkflowInputData
          defaultValues={null}
          isSubmitLoading={false}
          onSubmit={vi.fn()}
          schema={z.object({})}
          submitButtonLabel="Run"
        />,
      ),
    ).not.toThrow();
  });
});
