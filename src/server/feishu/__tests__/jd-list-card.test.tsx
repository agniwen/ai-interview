// 中文：JD 选择列表卡片快照；不依赖 DB
// English: snapshot of the JD picker card; no DB needed
import { describe, expect, it } from "vitest";
import { JdListCard } from "../cards/jd-list-card";

const RECORDS = [
  { departmentName: "技术部", description: "做前端", id: "jd-1", name: "前端工程师", prompt: "" },
  { departmentName: "技术部", description: null, id: "jd-2", name: "后端工程师", prompt: "" },
];

describe("JdListCard", () => {
  it("renders a row + 选择 button per record", () => {
    const card = JdListCard({ records: RECORDS, truncated: false });
    const json = JSON.stringify(card);
    expect(json).toContain("前端工程师");
    expect(json).toContain("后端工程师");
    // Two activate-jd actions, one per record
    const occurrences = json.match(/"activate-jd"/g) ?? [];
    expect(occurrences.length).toBe(2);
    // Action value is the JD id
    expect(json).toContain('"value":"jd-1"');
    expect(json).toContain('"value":"jd-2"');
  });

  it("renders an empty-state hint when records is empty", () => {
    const card = JdListCard({ records: [], truncated: false });
    const json = JSON.stringify(card);
    expect(json).toContain("还没有 JD");
  });

  it("shows truncated footer when truncated=true", () => {
    const card = JdListCard({ records: RECORDS, truncated: true });
    const json = JSON.stringify(card);
    expect(json).toContain("仅显示前 10 条");
  });
});
