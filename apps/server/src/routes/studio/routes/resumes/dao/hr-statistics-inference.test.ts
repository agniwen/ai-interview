import { describe, expect, it } from "vitest";
import { initialStageForUntrackedRecord } from "./hr-statistics";

describe("HR 统计的旧记录初始阶段推断", () => {
  it("用首个阶段事件的来源阶段还原创建时进入，后续已推进的记录也计入", () => {
    expect(
      initialStageForUntrackedRecord("ai_interview", {
        firstStageEvent: { fromStage: "screening" },
        hasCreationEvent: false,
        hasMigrationEvent: false,
      }),
    ).toBe("screening");
  });

  it("未发生阶段变化时使用当前阶段作为创建时进入的阶段", () => {
    expect(
      initialStageForUntrackedRecord("screening", {
        hasCreationEvent: false,
        hasMigrationEvent: false,
      }),
    ).toBe("screening");
  });

  it("迁移记录与已记录创建事件的记录不推断进入时间", () => {
    expect(
      initialStageForUntrackedRecord("screening", {
        hasCreationEvent: false,
        hasMigrationEvent: true,
      }),
    ).toBeNull();
    expect(
      initialStageForUntrackedRecord("screening", {
        hasCreationEvent: true,
        hasMigrationEvent: false,
      }),
    ).toBeNull();
  });

  it("首个事件只知道从结束状态恢复时不虚构初始阶段", () => {
    expect(
      initialStageForUntrackedRecord("screening", {
        firstStageEvent: { fromStage: "closed" },
        hasCreationEvent: false,
        hasMigrationEvent: false,
      }),
    ).toBeNull();
  });
});
