import { afterEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../factory";
import { authConfigRouter } from "../routes/auth-config/route";

const app = factory.createApp().route("/auth-config", authConfigRouter);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /auth-config", () => {
  it("exposes only Jiguang HR login by default", async () => {
    const response = await app.request("/auth-config");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feishuLoginProviderIds: ["feishu-jiguang-hr"],
    });
  });

  it("exposes the legacy login only when explicitly enabled", async () => {
    vi.stubEnv("FEISHU_LEGACY_LOGIN_ENABLED", "true");

    const response = await app.request("/auth-config");

    expect(await response.json()).toEqual({
      feishuLoginProviderIds: ["feishu-jiguang-hr", "feishu"],
    });
  });
});
