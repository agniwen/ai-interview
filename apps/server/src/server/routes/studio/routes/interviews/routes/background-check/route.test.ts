import { describe, expect, it } from "vitest";
import { parseBackgroundCheckEmailRequest } from "./route";

describe("parseBackgroundCheckEmailRequest", () => {
  const input = {
    content: "请查看 https://example.com/background-check/token",
    subject: "背景调查信息采集",
    to: "candidate@example.com",
  };

  it("keeps legacy JSON email requests compatible", async () => {
    await expect(
      parseBackgroundCheckEmailRequest(
        new Request("http://localhost/email", {
          body: JSON.stringify(input),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      ),
    ).resolves.toEqual({ attachments: [], input });
  });

  it("parses multipart email fields and attachments", async () => {
    const body = new FormData();
    for (const [key, value] of Object.entries(input)) {
      body.append(key, value);
    }
    body.append("attachments", new File(["check"], "背调说明.pdf", { type: "application/pdf" }));

    const result = await parseBackgroundCheckEmailRequest(
      new Request("http://localhost/email", { body, method: "POST" }),
    );

    expect(result.input).toEqual(input);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.name).toBe("背调说明.pdf");
  });

  it("rejects malformed multipart email fields", async () => {
    const body = new FormData();
    body.append("subject", "背景调查信息采集");
    await expect(
      parseBackgroundCheckEmailRequest(
        new Request("http://localhost/email", { body, method: "POST" }),
      ),
    ).rejects.toThrow("邮件参数无效");
  });
});
