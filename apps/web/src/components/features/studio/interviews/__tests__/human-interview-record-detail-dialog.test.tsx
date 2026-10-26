// @vitest-environment jsdom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioHumanInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { HumanInterviewRecordDetailContent } from "../human-interview-record-detail-dialog";

enableReactActEnvironment();
const record: StudioHumanInterviewRecordListRecord = {
  candidateAvatarVersion: null,
  candidateEmail: null,
  candidateId: "candidate",
  candidateName: "张三",
  conclusion: "pass",
  createdAt: "2026-10-26T00:00:00Z",
  createdBy: null,
  creatorImage: null,
  creatorName: null,
  feishuDocumentUrl: null,
  format: "online",
  hasResumeFile: false,
  id: "round-two",
  interviewers: [],
  jobDescriptionDepartmentName: null,
  jobDescriptionId: null,
  jobDescriptionName: null,
  kind: "human",
  lastInterviewAt: null,
  meetingStatus: "ended",
  resumeFileName: null,
  roundLabel: "业务二面",
  scheduledAt: null,
  status: "completed",
  updatedAt: "2026-10-26T00:00:00Z",
};
let rendered: Awaited<ReturnType<typeof renderInAct>> | undefined;
let client: QueryClient;
const requests: string[] = [];
function installApi(meetingStatus = "ended") {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.includes("/human-interview-rounds/round-two/meetings/this-meeting")) {
        return Promise.resolve(
          Response.json({
            recordingNotice: null,
            transcript: null,
            transcriptNotice: "本轮暂无转录",
            transcriptionError: null,
            transcriptionState: "unavailable",
          }),
        );
      }
      if (url.includes("/human-interview-meetings")) {
        return Promise.resolve(
          Response.json([
            {
              createdAt: "2026-10-27",
              id: "other-meeting",
              rounds: [{ roundId: "round-one" }],
              status: "ended",
            },
            {
              createdAt: "2026-10-26",
              id: "this-meeting",
              rounds: [{ roundId: "round-two" }],
              status: meetingStatus,
            },
          ]),
        );
      }
      if (url.endsWith("/candidate/human-interview-rounds")) {
        return Promise.resolve(
          Response.json([
            {
              feedback: "其他轮次的评价",
              format: "online",
              id: "round-one",
              interviewers: [],
              label: "业务一面",
              status: "completed",
            },
            {
              feedback: "本轮面试反馈",
              format: "online",
              id: "round-two",
              interviewers: [],
              label: "业务二面",
              status: "completed",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json({ message: "Unexpected test request" }, { status: 404 }),
      );
    }),
  );
}
async function renderDetail(active = true) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rendered = await renderInAct(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider id="workspace-id" slug="workspace" memberRole="owner" permissions={{}}>
        <HumanInterviewRecordDetailContent record={record} active={active} />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
  return rendered.container;
}
afterEach(async () => {
  if (rendered) {
    await unmountInAct(rendered.root);
    rendered.container.remove();
    rendered = undefined;
  }
  client?.clear();
  requests.length = 0;
  vi.unstubAllGlobals();
});
async function selectTranscript(container: HTMLElement) {
  const tab = [...container.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(
    (item) => item.textContent === "聊天转录",
  );
  expect(tab).toBeDefined();
  await act(() => {
    tab?.click();
  });
}

describe("human interview record details", () => {
  it("shows only the selected round and loads its transcript on demand", async () => {
    installApi();
    const container = await renderDetail();
    await waitForUi(() => expect(container.textContent).toContain("本轮面试反馈"));
    expect(container.textContent).not.toContain("其他轮次的评价");
    expect(requests.some((url) => url.includes("meetings"))).toBe(false);
    await selectTranscript(container);
    await waitForUi(() => expect(container.textContent).toContain("转录暂不可用"));
    expect(container.querySelector('[aria-label="面试信息"]')).not.toBeNull();
    expect(container.textContent).not.toContain("本轮面试反馈");
    expect(requests.some((url) => url.includes("/round-two/meetings/this-meeting"))).toBe(true);
    expect(requests.some((url) => url.includes("/meetings/other-meeting"))).toBe(false);
  });
  it("does not fetch data while closed", async () => {
    installApi();
    await renderDetail(false);
    expect(requests).toEqual([]);
  });
  it("does not request a detail for a meeting that has not ended", async () => {
    installApi("scheduled");
    const container = await renderDetail();
    await selectTranscript(container);
    await waitForUi(() => expect(container.textContent).toContain("暂无已结束会议的对话记录"));
    expect(requests.some((url) => url.includes("/meetings/this-meeting"))).toBe(false);
  });
});
