// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  installNoopWebAnimations,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { Toaster } from "@/components/ui/sonner";
import { UserFormDialog } from "../user-form-dialog";
import type { PlatformUserAdmin } from "../user-form-dialog";
import type { EditableUser, PlatformWorkspaceOption } from "../user-form";

// 账号操作模拟 Better Auth admin 客户端的 { data, error }；工作区操作失败时抛错（同 rpcFetch）。
// Account fakes return Better Auth's { data, error }; workspace fakes throw like rpcFetch.
const admin = {
  addUserToWorkspace: vi.fn<PlatformUserAdmin["addUserToWorkspace"]>(),
  createUser: vi.fn<PlatformUserAdmin["createUser"]>(),
  searchWorkspaces: vi.fn<PlatformUserAdmin["searchWorkspaces"]>(),
  setUserPassword: vi.fn<PlatformUserAdmin["setUserPassword"]>(),
  updateUser: vi.fn<PlatformUserAdmin["updateUser"]>(),
};

enableReactActEnvironment();
installNoopResizeObserver();
installNoopWebAnimations();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string): MediaQueryList => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

// 列表行带着平台角色；编辑时不得把它带进请求。
// Grid rows carry the platform role; editing must never send it back.
const existingAdmin = {
  email: "li@example.com",
  id: "user-1",
  name: "李四",
  role: "admin",
};

const workspaces: PlatformWorkspaceOption[] = Array.from({ length: 10 }, (_, index) => ({
  id: `org-${index}`,
  name: `工作区 ${index}`,
  slug: `ws-${index}`,
}));
const searchedWorkspace: PlatformWorkspaceOption = { id: "org-rd", name: "研发中心", slug: "rd" };

async function mount(user: EditableUser | null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = await renderInAct(
    <QueryClientProvider client={queryClient}>
      <UserFormDialog
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        open
        user={user}
        userAdmin={admin}
      />
      <Toaster />
    </QueryClientProvider>,
  );
  return {
    onOpenChange,
    onSaved,
    unmount: async () => {
      await unmountInAct(view.root);
      view.container.remove();
      queryClient.clear();
    },
  };
}

function input(id: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!element) {
    throw new Error(`Missing input: ${id}`);
  }
  return element;
}

async function type(id: string, value: string) {
  const element = input(id);
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = document.querySelector<HTMLFormElement>("#platform-user-form");
  await act(() => {
    form?.requestSubmit();
  });
}

async function fillValidCreateForm() {
  await type("platform-user-name", "王五");
  await type("platform-user-email", "wang@example.com");
  await type("platform-user-password", "Initial-pass1");
  await type("platform-user-confirm-password", "Initial-pass1");
}

async function openWorkspacePicker() {
  const picker = input("platform-user-workspace");
  await act(() => {
    picker.focus();
    picker.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    picker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// 工作区选项第二行是 /w/<slug>，借此与角色下拉的选项区分。
// Workspace options carry a /w/<slug> line, distinguishing them from role options.
function optionLabels(): string[] {
  return [...document.querySelectorAll('[role="option"]')]
    .filter((option) => option.textContent?.includes("/w/"))
    .map((option) => option.querySelector("span")?.textContent ?? "");
}

async function chooseOption(label: string) {
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) =>
    element.textContent?.includes(label),
  );
  if (!option) {
    throw new Error(`Missing option: ${label}`);
  }
  await act(() => {
    option.click();
  });
}

function roleTrigger() {
  return document.querySelector<HTMLElement>("#platform-user-workspace-role");
}

async function chooseRole(label: string) {
  const trigger = roleTrigger();
  await act(() => {
    trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger?.click();
  });
  await waitForUi(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
  await chooseOption(label);
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("platform user form dialog", () => {
  it("blocks creation and explains invalid fields", async () => {
    const view = await mount(null);
    try {
      await type("platform-user-email", "bad-email");
      await type("platform-user-password", "123");
      await submit();

      await waitForUi(() => {
        expect(document.body.textContent).toContain("请输入姓名");
        expect(document.body.textContent).toContain("邮箱格式不正确");
        expect(document.body.textContent).toContain("密码至少 8 位");
      });
      expect(admin.createUser).not.toHaveBeenCalled();
      expect(view.onSaved).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it("creates a regular user through Better Auth and refreshes the list", async () => {
    admin.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    const view = await mount(null);
    try {
      await type("platform-user-name", " 王五 ");
      await type("platform-user-email", "wang@example.com");
      await type("platform-user-password", "Initial-pass1");
      await type("platform-user-confirm-password", "Initial-pass1");
      await submit();

      await waitForUi(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
      expect(document.querySelector("#platform-user-role")).toBeNull();
      expect(admin.createUser).toHaveBeenCalledWith({
        email: "wang@example.com",
        name: "王五",
        password: "Initial-pass1",
        role: "user",
      });
      expect(admin.addUserToWorkspace).not.toHaveBeenCalled();
      expect(view.onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      await view.unmount();
    }
  });

  it("searches workspaces on the server and adds the new user to the chosen one", async () => {
    admin.searchWorkspaces.mockImplementation((query) =>
      Promise.resolve(query ? [searchedWorkspace] : workspaces),
    );
    admin.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    admin.addUserToWorkspace.mockResolvedValue();
    const view = await mount(null);
    try {
      await fillValidCreateForm();
      await openWorkspacePicker();
      await waitForUi(() => expect(optionLabels()).toHaveLength(10));
      expect(admin.searchWorkspaces).toHaveBeenLastCalledWith("");

      await type("platform-user-workspace", "研发");
      await waitForUi(() => expect(optionLabels()).toEqual(["研发中心"]));
      expect(admin.searchWorkspaces).toHaveBeenLastCalledWith("研发");
      await chooseOption("研发中心");
      await submit();

      await waitForUi(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
      expect(admin.addUserToWorkspace).toHaveBeenCalledWith({
        organizationId: "org-rd",
        role: "member",
        userId: "new-user",
      });
      expect(view.onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      await view.unmount();
    }
  });

  it("reports a failed workspace join after the account was created", async () => {
    admin.searchWorkspaces.mockResolvedValue(workspaces);
    admin.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
    admin.addUserToWorkspace.mockRejectedValue(new Error("该工作区成员数已达上限"));
    const view = await mount(null);
    try {
      await fillValidCreateForm();
      await openWorkspacePicker();
      await waitForUi(() => expect(optionLabels()).toHaveLength(10));
      await chooseOption("工作区 3");
      await submit();

      await waitForUi(() => {
        expect(document.body.textContent).toContain("加入工作区「工作区 3」失败");
        expect(document.body.textContent).toContain("该工作区成员数已达上限");
      });
      // 账号已存在：关闭弹窗并刷新列表，避免重复提交造成邮箱冲突。
      // The account exists: close and refresh rather than allow a conflicting resubmit.
      expect(view.onSaved).toHaveBeenCalledTimes(1);
      expect(view.onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      await view.unmount();
    }
  });

  it("keeps the dialog open when the email is already taken", async () => {
    admin.createUser.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "User already exists." },
    });
    const view = await mount(null);
    try {
      await fillValidCreateForm();
      await submit();

      await waitForUi(() => expect(admin.createUser).toHaveBeenCalledTimes(1));
      expect(view.onOpenChange).not.toHaveBeenCalledWith(false);
    } finally {
      await view.unmount();
    }
  });

  it("updates only the name and password so an admin keeps their role", async () => {
    admin.updateUser.mockResolvedValue({ error: null });
    admin.setUserPassword.mockResolvedValue({ error: null });
    const view = await mount(existingAdmin);
    try {
      expect(document.querySelector("#platform-user-role")).toBeNull();
      expect(input("platform-user-email").disabled).toBe(true);
      expect(input("platform-user-password").value).toBe("");

      await type("platform-user-name", "李四四");
      await type("platform-user-password", "Reset-pass-1");
      await type("platform-user-confirm-password", "Reset-pass-1");
      await submit();

      await waitForUi(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
      expect(admin.updateUser).toHaveBeenCalledTimes(1);
      const [updateInput] = admin.updateUser.mock.calls[0] ?? [];
      expect(updateInput?.userId).toBe("user-1");
      expect(Object.keys(updateInput?.data ?? {})).toEqual(["name"]);
      expect(updateInput?.data.name).toBe("李四四");
      expect(admin.setUserPassword).toHaveBeenCalledWith({
        newPassword: "Reset-pass-1",
        userId: "user-1",
      });
      expect(view.onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      await view.unmount();
    }
  });

  it("shows a mismatch on the confirm field and does not create the user", async () => {
    const view = await mount(null);
    try {
      await type("platform-user-name", "王五");
      await type("platform-user-email", "wang@example.com");
      await type("platform-user-password", "Initial-pass1");
      await type("platform-user-confirm-password", "Initial-pass2");
      await submit();

      await waitForUi(() => {
        const confirmField = input("platform-user-confirm-password").closest('[data-slot="field"]');
        expect(confirmField?.textContent).toContain("两次输入的密码不一致");
      });
      expect(admin.createUser).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it("keeps the current password when both password fields are left empty", async () => {
    admin.updateUser.mockResolvedValue({ error: null });
    const view = await mount(existingAdmin);
    try {
      expect(document.querySelector('[data-slot="password-strength"]')).toBeNull();
      await type("platform-user-name", "李四四");
      await submit();

      await waitForUi(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
      expect(admin.setUserPassword).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });

  it("announces strength changes and lets the password be revealed", async () => {
    const view = await mount(null);
    try {
      expect(document.querySelector('[data-slot="password-strength"]')).toBeNull();

      await type("platform-user-password", "password");
      const meter = document.querySelector('[data-slot="password-strength"]');
      const announcer = meter?.querySelector('[aria-live="polite"]');
      expect(announcer?.textContent).toBe("密码强度：弱");
      const chipStates = [...(meter?.querySelectorAll("li") ?? [])].map((chip) => chip.textContent);
      expect(chipStates).toEqual([
        "8–128 位，已满足",
        "大写，未满足",
        "小写，已满足",
        "数字，未满足",
        "符号，未满足",
      ]);
      await type("platform-user-password", "Password1");
      expect(announcer?.textContent).toBe("密码强度：中");
      await type("platform-user-password", "Password-1234");
      expect(announcer?.textContent).toBe("密码强度：强");

      const toggle = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="platform-user-password"]',
      );
      expect(input("platform-user-password").type).toBe("password");
      await act(() => toggle?.click());
      expect(input("platform-user-password").type).toBe("text");
      expect(toggle?.getAttribute("aria-label")).toBe("隐藏密码");
    } finally {
      await view.unmount();
    }
  });

  it("validates the confirmation live and re-checks it when the password changes", async () => {
    const view = await mount(null);
    try {
      const confirm = input("platform-user-confirm-password");
      await type("platform-user-password", "Abc12");
      await type("platform-user-confirm-password", "Abc");
      expect(confirm.getAttribute("aria-invalid")).toBeNull();

      await type("platform-user-confirm-password", "Abc12-and-more");
      expect(confirm.getAttribute("aria-invalid")).toBe("true");
      const errorId = confirm.getAttribute("aria-describedby");
      expect(errorId && document.querySelector(`#${errorId}`)?.textContent).toBe(
        "两次输入的密码不一致",
      );

      await type("platform-user-password", "Abc12-and-more");
      expect(confirm.getAttribute("aria-invalid")).toBeNull();
      const statusId = confirm.getAttribute("aria-describedby");
      expect(statusId && document.querySelector(`#${statusId}`)?.textContent).toBe("两次输入一致");
    } finally {
      await view.unmount();
    }
  });

  it("clears the chosen workspace role when another workspace is picked", async () => {
    admin.searchWorkspaces.mockResolvedValue(workspaces);
    const view = await mount(null);
    try {
      await fillValidCreateForm();
      expect(roleTrigger()).toBeNull();

      await openWorkspacePicker();
      await waitForUi(() => expect(optionLabels()).toHaveLength(10));
      await chooseOption("工作区 3");
      await waitForUi(() => expect(roleTrigger()?.textContent).toContain("普通成员"));

      await chooseRole("管理员");
      await waitForUi(() => expect(roleTrigger()?.textContent).toContain("管理员"));

      await openWorkspacePicker();
      await waitForUi(() => expect(optionLabels()).toHaveLength(10));
      await chooseOption("工作区 4");
      await waitForUi(() => expect(roleTrigger()?.textContent).toContain("请选择工作区角色"));

      await submit();
      await waitForUi(() => expect(document.body.textContent).toContain("请选择工作区角色"));
      expect(admin.createUser).not.toHaveBeenCalled();
    } finally {
      await view.unmount();
    }
  });
});
