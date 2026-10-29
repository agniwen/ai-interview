// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { CandidateFormTemplateEditorDialog } from "../form-template-editor-dialog";
import { emptyFormTemplateValues } from "../form-template-values";

enableReactActEnvironment();
installNoopResizeObserver();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  vi.unstubAllGlobals();
});

describe("CandidateFormTemplateEditorDialog", () => {
  it.each(["dialog", "page"] as const)(
    "keeps incomplete questions visible while adding, editing, and validating drafts in %s",
    async (presentation) => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: () => ({
          addEventListener: () => {},
          matches: false,
          removeEventListener: () => {},
        }),
      });
      const { root } = await renderInAct(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <WorkspaceSlugProvider
            id="org-default"
            memberRole="admin"
            permissions={{}}
            slug="default"
          >
            <CandidateFormTemplateEditorDialog
              presentation={presentation}
              initialDraft={{ ...emptyFormTemplateValues(), title: "草稿回归" }}
              jobDescriptions={[]}
              onOpenChange={() => {}}
              onSaved={() => {
                throw new Error("Invalid draft must not be saved");
              }}
              open
              record={null}
            />
          </WorkspaceSlugProvider>
        </QueryClientProvider>,
      );
      roots.push(root);
      await waitForUi(() =>
        expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(1),
      );

      if (presentation === "page") {
        const titleInput = document.querySelector<HTMLInputElement>("input#title");
        const setTitle = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        act(() => {
          setTitle?.call(titleInput, "更新后的草稿");
          titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await waitForUi(() =>
          expect(document.querySelector<HTMLInputElement>("input#title")?.value).toBe(
            "更新后的草稿",
          ),
        );
      }

      for (const [index, type] of ["填写题", "多选题", "单选题"].entries()) {
        const addButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
          (button) => button.textContent?.includes(type) && button.textContent.includes("点击添加"),
        );
        expect(addButton).toBeDefined();
        act(() => addButton?.click());
        await waitForUi(() =>
          expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(index + 2),
        );
      }

      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="请输入题目"]',
      );
      expect(textarea).not.toBeNull();
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      for (const value of ["新题目", ""]) {
        act(() => {
          setValue?.call(textarea, value);
          textarea?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await waitForUi(() => {
          expect(textarea?.value).toBe(value);
          expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(4);
        });
      }
      const typeSelect = [
        ...document.querySelectorAll<HTMLButtonElement>('[role="combobox"]'),
      ].find((button) => button.closest('[data-slot="field"]')?.textContent?.includes("题目类型"));
      expect(typeSelect).toBeDefined();
      act(() => typeSelect?.click());
      await waitForUi(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
      const textOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent === "填写题",
      );
      expect(textOption).toBeDefined();
      act(() => textOption?.click());
      await waitForUi(() => {
        expect(typeSelect?.textContent).toMatch(/填写题|text/);
        expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(4);
        expect(document.querySelector('input[placeholder="显示文字"]')).toBeNull();
      });
      act(() =>
        document.querySelector<HTMLButtonElement>('button[form="form-template-form"]')?.click(),
      );
      await waitForUi(() => expect(document.body.textContent).toContain("题目不能为空"));
      expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(4);
    },
  );

  it("can open the create dialog without recursively resetting form state", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ addEventListener: () => {}, matches: false, removeEventListener: () => {} }),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { root } = await renderInAct(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider id="org-default" memberRole="admin" permissions={{}} slug="default">
          <CandidateFormTemplateEditorDialog
            initialDraft={{
              description: "",
              jobDescriptionIds: [],
              questions: [0, 1].map((index) => ({
                displayMode: "textarea",
                id: crypto.randomUUID(),
                label: `问题 ${index + 1}`,
                options: [],
                required: true,
                sortOrder: index,
                type: "text",
              })),
              scope: "global",
              title: "测试表单",
            }}
            jobDescriptions={[]}
            onOpenChange={() => {}}
            onSaved={() => {}}
            open
            record={null}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
    roots.push(root);

    expect(document.body.textContent).toContain("创建表单题");
    await waitForUi(() =>
      expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(2),
    );
    act(() => document.querySelector<HTMLElement>('[aria-label="配置第 1 题"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="删除题目"]')?.click());
    const confirmDelete = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "确认删除",
    );
    expect(confirmDelete).toBeDefined();
    act(() => confirmDelete?.click());
    await waitForUi(() => {
      expect(document.querySelectorAll('[aria-label^="配置第"]')).toHaveLength(1);
      expect(document.body.textContent).toContain("编辑题干、展示方式和选项。");
    });
  });

  it("hands a newly created template to the edit-page transition without closing the page", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ addEventListener: () => {}, matches: false, removeEventListener: () => {} }),
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "created-form" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { root } = await renderInAct(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSlugProvider id="org-default" memberRole="admin" permissions={{}} slug="default">
          <CandidateFormTemplateEditorDialog
            presentation="page"
            initialDraft={{
              description: "",
              jobDescriptionIds: [],
              questions: [
                {
                  displayMode: "textarea",
                  id: crypto.randomUUID(),
                  label: "期望薪资",
                  options: [],
                  required: true,
                  sortOrder: 0,
                  type: "text",
                },
              ],
              scope: "global",
              title: "新表单",
            }}
            jobDescriptions={[]}
            onCreated={onCreated}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
            open
            record={null}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
    roots.push(root);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[form="form-template-form"]')?.click();
      await Promise.resolve();
    });
    await waitForUi(() => expect(onCreated).toHaveBeenCalledWith("created-form"));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("flags duplicate option text and values live and blocks saving until they are fixed", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ addEventListener: () => {}, matches: false, removeEventListener: () => {} }),
    });
    const onSaved = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { root } = await renderInAct(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceSlugProvider id="org-default" memberRole="admin" permissions={{}} slug="default">
          <CandidateFormTemplateEditorDialog
            presentation="page"
            initialDraft={{
              description: "",
              jobDescriptionIds: [],
              questions: [
                {
                  displayMode: "radio",
                  id: crypto.randomUUID(),
                  label: "是否接受出差",
                  options: [
                    { label: "接受", value: "yes" },
                    { label: "不接受", value: "yes" },
                  ],
                  required: true,
                  sortOrder: 0,
                  type: "single",
                },
              ],
              scope: "global",
              title: "出差意向",
            }}
            jobDescriptions={[]}
            onOpenChange={() => {}}
            onSaved={onSaved}
            open
            record={null}
          />
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    );
    roots.push(root);
    await waitForUi(() => expect(document.body.textContent).toContain("选项值与选项 1 重复"));
    expect(document.body.textContent).not.toContain("显示文字与选项 1 重复");
    const secondLabel = document.querySelector<HTMLInputElement>(
      'input[aria-label="选项 2 的显示文字"]',
    );
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setValue?.call(secondLabel, " 接受 ");
      secondLabel?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForUi(() => {
      expect(document.body.textContent).toContain("显示文字与选项 1 重复");
      expect(secondLabel?.getAttribute("aria-invalid")).toBe("true");
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[form="form-template-form"]')?.click();
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    act(() => {
      setValue?.call(secondLabel, "不接受");
      secondLabel?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForUi(() => {
      expect(document.body.textContent).not.toContain("显示文字与选项 1 重复");
      expect(document.body.textContent).toContain("选项值与选项 1 重复");
    });
  });
});
