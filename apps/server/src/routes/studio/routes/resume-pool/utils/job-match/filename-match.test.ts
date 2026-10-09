import { describe, expect, it } from "vitest";
import {
  matchPublishedJobFromResumeFileName,
  matchPublishedJobsFromResumeFileNameCore,
  matchPublishedJobsFromTargetRoles,
} from "./filename-match";

const jobs = [
  { id: "jd-frontend", name: "前端工程师" },
  { id: "jd-senior-frontend", name: "高级前端工程师" },
  { id: "jd-java", name: "Java 开发工程师" },
  { id: "jd-javascript", name: "JavaScript 开发工程师" },
];

describe("matchPublishedJobFromResumeFileName", () => {
  it("matches a complete normalized job-name segment", () => {
    expect(matchPublishedJobFromResumeFileName("张三-高级前端工程师-5年.pdf", jobs)).toEqual({
      jobDescriptionId: "jd-senior-frontend",
      status: "exact",
    });
  });

  it("normalizes full-width characters, case, spaces, and separators", () => {
    expect(
      matchPublishedJobFromResumeFileName("Candidate＿ＪＡＶＡ　开发工程师.docx", jobs),
    ).toEqual({ jobDescriptionId: "jd-java", status: "exact" });
  });

  it("does not match a shorter job name inside a longer segment", () => {
    const result = matchPublishedJobFromResumeFileName(
      "张三-高级前端工程师-5年.pdf",
      jobs.filter((job) => job.id === "jd-frontend"),
    );
    expect(result).toEqual({ status: "unmatched" });
  });

  it("does not match Java inside JavaScript", () => {
    const result = matchPublishedJobFromResumeFileName(
      "张三-JavaScript 开发工程师.pdf",
      jobs.filter((job) => job.id === "jd-java"),
    );
    expect(result).toEqual({ status: "unmatched" });
  });

  it("returns every id when normalized published job names are ambiguous", () => {
    expect(
      matchPublishedJobFromResumeFileName("张三-产品经理.pdf", [
        { id: "jd-product-a", name: "产品经理" },
        { id: "jd-product-b", name: "产品经理" },
      ]),
    ).toEqual({
      jobDescriptionIds: ["jd-product-a", "jd-product-b"],
      status: "ambiguous",
    });
  });

  it("returns unmatched when the file name has no complete job segment", () => {
    expect(matchPublishedJobFromResumeFileName("张三个人简历.pdf", jobs)).toEqual({
      status: "unmatched",
    });
  });
});

describe("strong job candidates", () => {
  const operationJobs = [
    { id: "jd-commercial", name: "商业化运营经理" },
    { id: "jd-content-director", name: "内容运营总监" },
    { id: "jd-content-manager", name: "内容运营经理" },
    { id: "jd-game", name: "游戏平台运营总监" },
  ];

  it("matches filename role cores without requiring the seniority suffix", () => {
    expect(
      matchPublishedJobsFromResumeFileNameCore(
        "【商业化运营_深圳_25-40K】张净淅_15年.pdf",
        operationJobs,
      ),
    ).toEqual(["jd-commercial"]);
  });

  it("separates exact target-role matches from role-core expansion", () => {
    expect(matchPublishedJobsFromTargetRoles(["内容运营", "活动运营"], operationJobs)).toEqual({
      coreIds: ["jd-content-director", "jd-content-manager"],
      exactIds: [],
    });
  });

  it("does not expand an explicit target seniority to other seniority levels", () => {
    expect(
      matchPublishedJobsFromTargetRoles(
        ["产品实习生"],
        [
          { id: "jd-product-intern", name: "产品实习生" },
          { id: "jd-product-director", name: "产品总监" },
        ],
      ),
    ).toEqual({ coreIds: [], exactIds: ["jd-product-intern"] });

    expect(
      matchPublishedJobsFromTargetRoles(
        ["技术经理"],
        [{ id: "jd-senior-tech-manager", name: "高级技术经理" }],
      ),
    ).toEqual({ coreIds: [], exactIds: [] });
  });

  it("expands a target without seniority across prefix and suffix seniority labels", () => {
    expect(
      matchPublishedJobsFromTargetRoles(
        ["技术"],
        [
          { id: "jd-senior-tech-manager", name: "高级技术经理" },
          { id: "jd-tech-director", name: "技术总监" },
        ],
      ),
    ).toEqual({
      coreIds: ["jd-senior-tech-manager", "jd-tech-director"],
      exactIds: [],
    });
  });

  it("does not treat an arbitrary substring as a strong role match", () => {
    expect(matchPublishedJobsFromTargetRoles(["运营"], operationJobs)).toEqual({
      coreIds: [],
      exactIds: [],
    });
  });
});
