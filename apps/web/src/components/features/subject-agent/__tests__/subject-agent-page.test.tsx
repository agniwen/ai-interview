// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  StudioSidePaneProvider,
  useStudioSidePaneController,
} from "@/components/features/studio/studio-side-pane-context";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { SUBJECT_AGENT_PANE_ID } from "../subject-agent-context";
import { SubjectAgentPaneAutoOpen, useAttachSubjectDraftOnCreate } from "../subject-agent-page";
import { createSubjectDraftId } from "../subject-thread-api";
import type { SubjectRef } from "../subject-thread-api";

// SAFETY: This flag explicitly enables React's test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHAT_PERMISSIONS = { chat: ["read"] };
const DRAFT_ID = createSubjectDraftId();

let root: Root;
let queryClient: QueryClient;
let activeId: string | null = null;
let saveCreated: ((id: string) => void) | null = null;

function EditorHarness({ subjectId }: { subjectId: string }) {
  const { activeId: currentId, close } = useStudioSidePaneController();
  activeId = currentId;
  const subject: SubjectRef = { kind: "job_description", slug: "default", subjectId };
  saveCreated = useAttachSubjectDraftOnCreate(subject, () => {});
  return (
    <>
      <SubjectAgentPaneAutoOpen subjectId={subjectId} />
      <button data-close-pane onClick={close} type="button">
        关闭面板
      </button>
    </>
  );
}

function renderEditor(subjectId: string, permissions: Record<string, string[]> = CHAT_PERMISSIONS) {
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider
          id="org"
          memberRole="member"
          permissions={permissions}
          slug="default"
        >
          <StudioSidePaneProvider scopeKey="default">
            <EditorHarness key={subjectId} subjectId={subjectId} />
          </StudioSidePaneProvider>
        </WorkspaceSlugProvider>
      </QueryClientProvider>,
    ),
  );
}

function setDesktop(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    addEventListener: () => {},
    matches: query === "(min-width: 1024px)" ? matches : false,
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  activeId = null;
  queryClient = new QueryClient();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("opens the Agent pane on entering an editor at desktop widths", () => {
  setDesktop(true);
  renderEditor("record-1");
  expect(activeId).toBe(SUBJECT_AGENT_PANE_ID);
});

it("keeps the pane closed on narrow screens, where the drawer would cover the form", () => {
  setDesktop(false);
  renderEditor("record-1");
  expect(activeId).toBeNull();
});

it("keeps the pane closed without chat permission", () => {
  setDesktop(true);
  renderEditor("record-1", {});
  expect(activeId).toBeNull();
});

it("does not reopen a pane the user closed, including on the edit page after the first save", async () => {
  setDesktop(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ ok: true }))),
  );
  renderEditor(DRAFT_ID);
  expect(activeId).toBe(SUBJECT_AGENT_PANE_ID);

  act(() => document.querySelector<HTMLButtonElement>("button[data-close-pane]")?.click());
  expect(activeId).toBeNull();
  renderEditor(DRAFT_ID);
  expect(activeId).toBeNull();

  await act(async () => {
    await saveCreated?.("record-9");
  });
  renderEditor("record-9");
  expect(activeId).toBeNull();
});
