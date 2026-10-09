import { describe, expect, it, vi } from "vitest";
import {
  backgroundCheckDraftInputSchema,
  backgroundCheckFormInputSchema,
} from "@app/db-schema/background-check";
import { createBackgroundCheckDraftRouter } from "./draft-route";

const draft = {
  candidateName: "张三",
  employmentRecords: [
    {
      colleague: { contact: "", name: "" },
      companyName: "",
      contactPermission: null,
      disciplinaryRecord: "",
      employmentEnd: null,
      employmentStart: "",
      hasLeftCompany: null,
      hrContact: { contact: "", name: "" },
      lastPosition: "",
      leavingReason: null,
      leavingReasonOther: null,
      lineManager: { contact: "", name: "" },
    },
  ],
  gender: "",
  graduationCertificateNumber: "",
  idNumber: "",
  signatureName: "",
  signedDate: "",
};

describe("public background check draft", () => {
  it("allows incomplete drafts without accepting them as formal submissions or retaining consent", async () => {
    expect(backgroundCheckFormInputSchema.safeParse({ ...draft, consent: true }).success).toBe(
      false,
    );
    const parsed = backgroundCheckDraftInputSchema.parse({ ...draft, consent: true });
    expect(parsed).not.toHaveProperty("consent");
    const saveDraft = vi.fn().mockResolvedValue({ savedAt: "2026-09-16T09:00:00.000Z" });
    const router = createBackgroundCheckDraftRouter({ saveDraft });
    const response = await router.request("/specific-token/draft", {
      body: JSON.stringify({ ...draft, consent: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ savedAt: "2026-09-16T09:00:00.000Z" });
    expect(saveDraft).toHaveBeenCalledWith("specific-token", parsed);
  });

  it.each([
    { ...draft, idNumber: "x".repeat(51) },
    { ...draft, employmentRecords: [] },
    {
      ...draft,
      employmentRecords: [
        draft.employmentRecords[0],
        draft.employmentRecords[0],
        draft.employmentRecords[0],
      ],
    },
    { ...draft, signedDate: "invalid-date" },
  ])("rejects malformed or oversized drafts before writing", async (input) => {
    const saveDraft = vi.fn().mockResolvedValue({ savedAt: "2026-09-16T09:00:00.000Z" });
    const response = await createBackgroundCheckDraftRouter({ saveDraft }).request("/token/draft", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("refuses saves when the token is unavailable or the collection was submitted", async () => {
    const response = await createBackgroundCheckDraftRouter({
      saveDraft: () => Promise.resolve(null),
    }).request("/token/draft", {
      body: JSON.stringify(draft),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "当前背调链接已提交或不可用，无法保存草稿。" });
  });
});
