import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChatRequest } from "../lib/chat-transport";

describe("fetchChatRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes cookies when the backend runs on a different origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChatRequest("http://localhost:8787/workspaces/default/copilot/resume-chat", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/workspaces/default/copilot/resume-chat",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });
});
