import { describe, expect, it, vi } from "vitest";
import { createHumanInterviewDocumentSyncRouter } from "./document-sync-route";
function setup(role: "host" | "observer" = "host", retryResult = true) {
  const retry = vi.fn(() => Promise.resolve(retryResult));
  const router = createHumanInterviewDocumentSyncRouter({
    resolveInterviewer: () =>
      Promise.resolve({ organizationId: "org", role, roundId: "round", status: "ended" }),
    retry,
  });
  return { retry, router };
}
describe("human review document sync HTTP", () => {
  it("retries only the authorized round", async () => {
    const { router, retry } = setup();
    const response = await router.request("/invite/evaluation-document-retry", { method: "POST" });
    expect(response.status).toBe(200);
    expect(retry).toHaveBeenCalledWith({ organizationId: "org", roundId: "round" });
  });
  it("rejects observers before creating retry work", async () => {
    const { router, retry } = setup("observer");
    const response = await router.request("/invite/evaluation-document-retry", { method: "POST" });
    expect(response.status).toBe(403);
    expect(retry).not.toHaveBeenCalled();
  });
  it("reports a stale retry action as a conflict", async () => {
    const { router } = setup("host", false);
    const response = await router.request("/invite/evaluation-document-retry", { method: "POST" });
    expect(response.status).toBe(409);
  });
});
