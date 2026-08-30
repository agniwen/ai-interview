import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MailIngestRunNowButton } from "./mail-ingest-run-now-button";

function renderButton(canManage: boolean) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MailIngestRunNowButton canManage={canManage} slug="workspace" />
    </QueryClientProvider>,
  );
}

describe("MailIngestRunNowButton", () => {
  it("only renders the immediate poll action for administrators", () => {
    expect(renderButton(false)).toBe("");
    expect(renderButton(true)).toContain("立即轮询");
  });
});
