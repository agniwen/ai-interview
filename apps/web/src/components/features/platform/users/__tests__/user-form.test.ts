import { describe, expect, it } from "vitest";
import {
  buildUserUpdatePlan,
  createUserFormSchema,
  editUserFormSchema,
  getAuthErrorMessage,
  getConfirmPasswordState,
  getNextWorkspaceRole,
} from "../user-form";

const user = { email: "li@example.com", id: "u1", name: "李四" };
const strongPassword = "Initial-pass1";

function issuesByField(result: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("platform user form rules", () => {
  it("requires a valid email, a policy-compliant password and a matching confirmation", () => {
    const result = createUserFormSchema.safeParse({
      confirmPassword: "",
      email: "not-an-email",
      name: " ",
      password: "alllowercase",
      workspace: null,
      workspaceRole: null,
    });
    expect(issuesByField(result)).toEqual({
      confirmPassword: "请再次输入密码",
      email: "邮箱格式不正确",
      name: "请输入姓名",
      password: "密码需包含大写字母、小写字母、数字、符号中的至少 3 类",
    });

    expect(
      createUserFormSchema.safeParse({
        confirmPassword: strongPassword,
        email: "new@example.com",
        name: "王五",
        password: strongPassword,
        workspace: { id: "org-1", name: "研发部", slug: "rd" },
        workspaceRole: "member",
      }).success,
    ).toBe(true);
  });

  it("flags a mismatched confirmation on the confirm field", () => {
    const result = createUserFormSchema.safeParse({
      confirmPassword: "Initial-pass2",
      email: "new@example.com",
      name: "王五",
      password: strongPassword,
      workspace: null,
      workspaceRole: null,
    });
    expect(issuesByField(result)).toEqual({ confirmPassword: "两次输入的密码不一致" });
  });

  it("lets editing leave both password fields empty but validates a new password", () => {
    const base = { email: user.email, name: "李四", workspace: null, workspaceRole: null };
    expect(
      editUserFormSchema.safeParse({ ...base, confirmPassword: "", password: "" }).success,
    ).toBe(true);
    expect(
      issuesByField(editUserFormSchema.safeParse({ ...base, confirmPassword: "x", password: "" })),
    ).toEqual({ confirmPassword: "两次输入的密码不一致" });
    expect(
      issuesByField(
        editUserFormSchema.safeParse({ ...base, confirmPassword: "Abc1", password: "Abc1" }),
      ),
    ).toEqual({ password: "密码至少 8 位" });
  });

  it("submits only changed fields and never includes a role", () => {
    const unchanged = {
      confirmPassword: "",
      email: user.email,
      workspace: null,
      workspaceRole: null,
    };
    expect(buildUserUpdatePlan(user, { ...unchanged, name: "李四", password: "" })).toEqual({
      data: null,
      newPassword: null,
    });
    expect(
      buildUserUpdatePlan(user, {
        ...unchanged,
        confirmPassword: strongPassword,
        name: " 李四四 ",
        password: strongPassword,
      }),
    ).toEqual({ data: { name: "李四四" }, newPassword: strongPassword });
  });

  it("translates Better Auth error codes and falls back otherwise", () => {
    expect(
      getAuthErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, "创建用户失败"),
    ).toBe("该邮箱已被其他账号使用");
    expect(getAuthErrorMessage({ code: "SOMETHING_ELSE", message: "boom" }, "创建用户失败")).toBe(
      "创建用户失败",
    );
  });

  it("requires a workspace role once an initial workspace is chosen", () => {
    const result = createUserFormSchema.safeParse({
      confirmPassword: strongPassword,
      email: "new@example.com",
      name: "王五",
      password: strongPassword,
      workspace: { id: "org-1", name: "研发部", slug: "rd" },
      workspaceRole: null,
    });
    expect(issuesByField(result)).toEqual({ workspaceRole: "请选择工作区角色" });
  });

  it("only reports a confirm mismatch once the input diverges, overshoots or is left", () => {
    const typing = { blurred: false };
    expect(getConfirmPasswordState("Abc12345!", "", typing)).toBe("empty");
    expect(getConfirmPasswordState("Abc12345!", "Abc1", typing)).toBe("pending");
    expect(getConfirmPasswordState("Abc12345!", "Abx", typing)).toBe("mismatch");
    expect(getConfirmPasswordState("Abc12", "Abc12-and-more", typing)).toBe("mismatch");
    expect(getConfirmPasswordState("Abc12345!", "Abc1", { blurred: true })).toBe("mismatch");
    expect(getConfirmPasswordState("Abc12345!", "Abc12345!", typing)).toBe("match");
  });

  it("defaults the role on the first workspace pick and clears it when the workspace changes", () => {
    const rd = { id: "org-rd", name: "研发部", slug: "rd" };
    const hr = { id: "org-hr", name: "人事部", slug: "hr" };
    expect(getNextWorkspaceRole(null, rd, null)).toBe("member");
    expect(getNextWorkspaceRole(rd, rd, "admin")).toBe("admin");
    expect(getNextWorkspaceRole(rd, hr, "admin")).toBeNull();
    expect(getNextWorkspaceRole(rd, null, "admin")).toBeNull();
  });
});
