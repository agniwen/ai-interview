// @vitest-environment jsdom

import type { ResumePoolListRecord } from "@app/shared/resume-pool";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumePoolCard } from "../resume-pool-card";
import { resumePoolCardRecord as record } from "./resume-pool-card-fixture";

// SAFETY: React's test environment flag is intentionally attached to globalThis.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const editButton = () => document.querySelector<HTMLButtonElement>('[aria-label="编辑人才信息"]');

describe("ResumePoolCard edit action", () => {
  it("lets the uploader edit a parsed record without triggering the card detail", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onEdit = vi.fn();
    const onOpenDetail = vi.fn();
    const renderCard = (
      canEdit: boolean,
      resumeParseStatus: ResumePoolListRecord["resumeParseStatus"],
    ) =>
      root.render(
        <ResumePoolCard
          canRetryParse={false}
          onPreviewResume={() => {}}
          onRetryParse={() => {}}
          retrying={false}
          bindingJobDescription={false}
          canDelete={false}
          canEdit={canEdit}
          canEnterRecruiting={true}
          canRecommend={false}
          deleting={false}
          onBindJobDescription={() => {}}
          onDelete={() => {}}
          onEdit={onEdit}
          onEnterRecruiting={() => {}}
          onOpenDetail={onOpenDetail}
          onOpenDuplicateMatches={() => {}}
          record={{
            ...record,
            jobDescriptionId: null,
            jobDescriptionName: null,
            resumeParseStatus,
          }}
          slug="test-workspace"
        />,
      );

    act(() => renderCard(false, "ready"));
    expect(editButton()).toBeNull();

    act(() => renderCard(true, "processing"));
    expect(editButton()?.getAttribute("aria-disabled")).toBe("true");

    act(() => renderCard(true, "ready"));
    act(() => {
      editButton()?.click();
    });
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: record.id }));
    expect(onOpenDetail).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
