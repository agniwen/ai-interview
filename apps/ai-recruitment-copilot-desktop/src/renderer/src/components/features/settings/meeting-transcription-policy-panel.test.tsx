import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingTranscriptionPolicy } from "@arc/shared/meeting-transcription";
import { MeetingTranscriptionPolicyView } from "./meeting-transcription-policy-panel";

const policy: MeetingTranscriptionPolicy = {
  allowedProviders: ["openai"],
  availableProviders: [
    {
      id: "openai",
      label: "OpenAI",
      model: "gpt-4o-transcribe-diarize",
      region: "openai-default",
    },
  ],
  canManage: true,
  revision: 2,
  selectedProvider: "openai",
};

describe("Meeting transcription policy settings", () => {
  it("lets administrators explicitly allow and select a deployment provider", () => {
    const html = renderToStaticMarkup(
      <MeetingTranscriptionPolicyView onSave={() => {}} policy={policy} saving={false} />,
    );

    expect(html).toContain("允许使用 OpenAI");
    expect(html).toContain("gpt-4o-transcribe-diarize");
    expect(html).toContain("选择用于新 Final Transcript 的 provider");
    expect(html).toContain("保存转录策略");
  });

  it("keeps ordinary members read-only", () => {
    const html = renderToStaticMarkup(
      <MeetingTranscriptionPolicyView
        onSave={() => {}}
        policy={{ ...policy, canManage: false }}
        saving={false}
      />,
    );

    expect(html).toContain("只有 Workspace Administrator 可以修改");
    expect(html).not.toContain("保存转录策略");
  });
});
