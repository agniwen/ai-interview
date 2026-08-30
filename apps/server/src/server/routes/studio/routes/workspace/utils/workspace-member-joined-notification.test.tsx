import { toCardElement } from "chat";
import { describe, expect, it, vi } from "vitest";
import {
  notifyWorkspaceInviteCreatorMemberJoined,
  WorkspaceMemberJoinedCard,
} from "./workspace-member-joined-notification";
import type { WorkspaceMemberJoinedNotificationDependencies } from "./workspace-member-joined-notification";

const context = {
  joinedMemberName: "伊森",
  membersUrl: "https://app.example.com/w/test-feizi/studio/members",
  openId: "ou_creator",
  providerId: "feishu-jiguang-hr" as const,
  workspaceName: "测试工作区",
};

describe("workspace member joined notification", () => {
  it("renders the member name and refresh guidance in the Feishu card", () => {
    const card = toCardElement(WorkspaceMemberJoinedCard(context));
    expect(card).not.toBeNull();
    expect(JSON.stringify(card)).toContain("伊森");
    expect(JSON.stringify(card)).toContain("刷新面试官列表");
    expect(JSON.stringify(card)).toContain("查看工作区成员");
  });

  it("sends to the invitation creator's Feishu account", async () => {
    const postCard = vi.fn().mockResolvedValue({ id: "message-1" });
    const dependencies: WorkspaceMemberJoinedNotificationDependencies = {
      loadContext: vi.fn().mockResolvedValue(context),
      postCard,
    };
    await expect(
      notifyWorkspaceInviteCreatorMemberJoined(
        {
          creatorUserId: "creator-1",
          joinedUserId: "member-1",
          organizationId: "org-1",
        },
        dependencies,
      ),
    ).resolves.toBe("sent");
    expect(postCard).toHaveBeenCalledWith("feishu-jiguang-hr", "ou_creator", expect.anything());
  });

  it("skips when the invitation has no creator", async () => {
    const dependencies: WorkspaceMemberJoinedNotificationDependencies = {
      loadContext: vi.fn(),
      postCard: vi.fn(),
    };
    await expect(
      notifyWorkspaceInviteCreatorMemberJoined(
        { creatorUserId: null, joinedUserId: "member-1", organizationId: "org-1" },
        dependencies,
      ),
    ).resolves.toBe("skipped");
    expect(dependencies.loadContext).not.toHaveBeenCalled();
  });
});
