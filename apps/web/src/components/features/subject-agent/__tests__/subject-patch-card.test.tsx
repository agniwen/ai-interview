// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useMemo, useRef, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { buildJobDescriptionAgentPatch } from "@app/shared/job-description-agent";
import type { JobDescriptionAgentPageContext } from "@app/shared/job-description-agent";
import { StudioSidePaneProvider } from "@/components/features/studio/studio-side-pane-context";
import {
  enableReactActEnvironment,
  installNoopWebAnimations,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { JobDescriptionPatchCard } from "../subject-patch-tool-uis";
import { SubjectAgentProvider, useRegisterSubjectAgentForm } from "../subject-agent-context";
import type { SubjectAgentFormBridge } from "../subject-agent-context";

enableReactActEnvironment();
installNoopWebAnimations();

const savedForm: JobDescriptionAgentPageContext = {
  allowCrossDepartmentInterviewers: false,
  departmentId: "dept-web",
  headcount: 2,
  internalCriteria: null,
  interviewerIds: ["iv-web"],
  jobWeight: null,
  name: "React 前端开发",
  priority: "medium",
  prompt: "负责 Web 前端开发。",
  publishedDate: null,
  referralChannels: null,
  reportingManagerUserId: null,
  salaryMaxK: "30",
  salaryMinK: "20",
  targetDate: null,
};

const patch = buildJobDescriptionAgentPatch(
  {
    changes: { headcount: 3, prompt: "负责 React 组件与状态管理。" },
    summary: "细化职责并增加人数",
  },
  savedForm,
);

/** Stands in for the job form: exposes its values and saved version through the bridge. */
function FormHarness({ initial }: { initial: JobDescriptionAgentPageContext }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(savedForm);
  const valuesRef = useRef(initial);
  const savedRef = useRef(savedForm);
  const listenersRef = useRef(new Set<() => void>());
  useEffect(() => {
    valuesRef.current = values;
    savedRef.current = saved;
    for (const listener of listenersRef.current) {
      listener();
    }
  }, [saved, values]);
  const bridge = useMemo<SubjectAgentFormBridge>(
    () => ({
      getPageContext: () => valuesRef.current,
      getSavedContext: () => savedRef.current,
      kind: "job_description",
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
      write: (next) => setValues((current) => ({ ...current, ...next })),
    }),
    [],
  );
  useRegisterSubjectAgentForm(bridge);
  return (
    <>
      <output data-testid="form">
        {values.prompt}|{values.headcount}
      </output>
      <button onClick={() => setSaved(values)} type="button">
        保存
      </button>
    </>
  );
}

async function renderCard(initial: JobDescriptionAgentPageContext) {
  return await renderInAct(
    <QueryClientProvider client={new QueryClient()}>
      <StudioSidePaneProvider scopeKey="workspace">
        <SubjectAgentProvider
          subject={{ kind: "job_description", slug: "acme", subjectId: "job-1" }}
        >
          <FormHarness initial={initial} />
          <JobDescriptionPatchCard patch={patch} toolCallId="call-1" />
        </SubjectAgentProvider>
      </StudioSidePaneProvider>
    </QueryClientProvider>,
  );
}

function formText() {
  return document.querySelector('[data-testid="form"]')?.textContent;
}

function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`Button ${label} not found`);
  }
  button.click();
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("fills the unsaved form and restores the previous values on undo", async () => {
  const { root } = await renderCard(savedForm);

  act(() => {
    clickButton("应用到表单");
  });
  await waitForUi(() => expect(formText()).toBe("负责 React 组件与状态管理。|3"));

  act(() => {
    clickButton("撤销");
  });
  await waitForUi(() => expect(formText()).toBe("负责 Web 前端开发。|2"));

  await unmountInAct(root);
});

it("asks before overwriting a patched field that changed after the suggestion", async () => {
  const { root } = await renderCard({ ...savedForm, prompt: "同事刚改过的 JD。" });

  act(() => {
    clickButton("应用到表单");
  });
  await waitForUi(() => expect(document.body.textContent).toContain("表单内容已变化"));
  expect(formText()).toBe("同事刚改过的 JD。|2");

  act(() => {
    clickButton("仍要应用");
  });
  await waitForUi(() => expect(formText()).toBe("负责 React 组件与状态管理。|3"));

  await unmountInAct(root);
});

it("shows the patch as saved once the saved version holds its values", async () => {
  const { root } = await renderCard(savedForm);

  act(() => {
    clickButton("应用到表单");
  });
  await waitForUi(() => expect(document.body.textContent).toContain("已填入表单，未保存"));

  act(() => {
    clickButton("保存");
  });
  await waitForUi(() => expect(document.body.textContent).toContain("已保存生效"));
  expect(document.body.textContent).not.toContain("应用到表单");
  expect(document.body.textContent).not.toContain("撤销");

  await unmountInAct(root);
});
