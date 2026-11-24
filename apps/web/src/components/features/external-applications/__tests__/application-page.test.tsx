// @vitest-environment jsdom
import { createCandidateMaterialLinkSchema } from "@app/shared/candidate-materials";
import type { CandidateMaterialItem } from "@app/shared/candidate-materials";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalApplicationPage } from "../application-page";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: true,
  removeEventListener: vi.fn(),
});

function resolveRequestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function selectComboboxOption(input: HTMLInputElement, optionText: string) {
  await act(async () => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    await Promise.resolve();
  });
  let targetOption: HTMLElement | undefined;
  await vi.waitFor(() => {
    targetOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.includes(optionText),
    );
    expect(targetOption).toBeDefined();
  });
  act(() => {
    targetOption?.click();
  });
}

function queryRequiredElement<T extends Element>(host: HTMLElement, selector: string): T {
  const element = host.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Expected element ${selector}`);
  }
  return element;
}

function createSubmissionFetchMock(
  token: string,
  capturedForms: FormData[],
  uploadedMaterials: FormData[],
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveRequestUrl(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith(`/api/public/external-applications/${token}`) && method === "GET") {
      return Promise.resolve(
        Response.json({
          jobs: [
            { id: "job-writer", jd: "负责 AI 短剧剧本创作", name: "AI 编剧" },
            { id: "job-director", jd: "负责分镜与节奏把控", name: "AI 导演" },
          ],
          workspaceName: "幻游工作室",
        }),
      );
    }
    if (url.endsWith(`/api/public/external-applications/${token}/resumes`) && method === "POST") {
      if (init?.body instanceof FormData) {
        capturedForms.push(init.body);
      }
      return Promise.resolve(Response.json({ status: "queued" }, { status: 201 }));
    }
    if (url.endsWith("/materials/files") && method === "POST") {
      if (init?.body instanceof FormData) {
        uploadedMaterials.push(init.body);
      }
      const created: CandidateMaterialItem = {
        category: "video",
        contentType: "video/mp4",
        createdAt: "2026-11-24T10:00:00.000Z",
        createdBy: "owner-1",
        fileName: "demo.mp4",
        id: "mat-video-1",
        kind: "file",
        notes: "",
        ownerType: "resume_pool_item",
        sizeBytes: 12,
        title: "demo.mp4",
        updatedAt: "2026-11-24T10:00:00.000Z",
        url: null,
      };
      return Promise.resolve(Response.json(created, { status: 201 }));
    }
    return Promise.resolve(
      Response.json({ error: `Unexpected request: ${method} ${url}` }, { status: 404 }),
    );
  });
}

function mountExternalApplicationPage(token: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ExternalApplicationPage token={token} />
      </QueryClientProvider>,
    );
  });

  return {
    cleanup: () => {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    },
    host,
  };
}

describe("ExternalApplicationPage single-candidate form and attachments", () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("submits the single-candidate form with optional portfolio link and portfolio file", async () => {
    const token = "ext-token-form";
    const capturedForms: FormData[] = [];
    const uploadedMaterials: FormData[] = [];
    vi.stubGlobal("fetch", createSubmissionFetchMock(token, capturedForms, uploadedMaterials));

    const { cleanup, host } = mountExternalApplicationPage(token);
    try {
      await vi.waitFor(() => {
        expect(host.textContent).toContain("幻游工作室");
        expect(host.querySelector("#application-candidate-name")).not.toBeNull();
      });

      const nameInput = queryRequiredElement<HTMLInputElement>(host, "#application-candidate-name");
      const primaryJobInput = queryRequiredElement<HTMLInputElement>(
        host,
        "#application-primary-job",
      );
      const resumeInput = queryRequiredElement<HTMLInputElement>(host, "#application-resume-file");
      const remoteRadio = queryRequiredElement<HTMLElement>(host, "#application-work-mode-remote");
      const institutionInput = queryRequiredElement<HTMLInputElement>(
        host,
        "#application-training-institution",
      );
      const classInput = queryRequiredElement<HTMLInputElement>(host, "#application-class-name");
      const batchInput = queryRequiredElement<HTMLInputElement>(host, "#application-batch");
      const alternateJobInput = queryRequiredElement<HTMLInputElement>(
        host,
        "#application-alternate-job",
      );
      const contactInput = queryRequiredElement<HTMLInputElement>(host, "#application-contact");
      const portfolioUrlInput = queryRequiredElement<HTMLInputElement>(
        host,
        "#application-portfolio-url",
      );
      const portfolioFilesInput = queryRequiredElement<HTMLInputElement>(
        host,
        "#application-portfolio-files",
      );
      const contributionInput = queryRequiredElement<HTMLTextAreaElement>(
        host,
        "#application-portfolio-contribution",
      );

      act(() => {
        setInputValue(nameInput, "李四");
      });
      await selectComboboxOption(primaryJobInput, "AI 编剧");

      const resumePdf = new File(["pdf-bytes"], "lisi-resume.pdf", { type: "application/pdf" });
      selectFiles(resumeInput, [resumePdf]);

      act(() => {
        remoteRadio.click();
        setInputValue(institutionInput, "深圳AI学院");
        setInputValue(classInput, "三班");
        setInputValue(batchInput, "2026-11");
      });
      await selectComboboxOption(alternateJobInput, "AI 导演");

      const demoVideo = new File(["video-bytes"], "demo.mp4", { type: "video/mp4" });
      act(() => {
        setInputValue(contactInput, "13900139000");
        setInputValue(portfolioUrlInput, "https://works.example.com/lisi");
        setInputValue(contributionInput, "负责剧本拆解与视频后期合成");
      });
      selectFiles(portfolioFilesInput, [demoVideo]);

      const form = queryRequiredElement<HTMLFormElement>(host, "form");
      act(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(() => {
        expect(capturedForms).toHaveLength(1);
        expect(uploadedMaterials).toHaveLength(1);
      });

      const [submittedForm] = capturedForms;
      expect(submittedForm?.get("candidateName")).toBe("李四");
      expect(submittedForm?.get("jobDescriptionId")).toBe("job-writer");
      expect(submittedForm?.get("workMode")).toBe("remote");
      expect(submittedForm?.get("trainingInstitution")).toBe("深圳AI学院");
      expect(submittedForm?.get("className")).toBe("三班");
      expect(submittedForm?.get("batch")).toBe("2026-11");
      expect(submittedForm?.get("alternateJobDescriptionId")).toBe("job-director");
      expect(submittedForm?.get("contact")).toBe("13900139000");
      expect(submittedForm?.get("portfolioUrl")).toBe("https://works.example.com/lisi");
      expect(submittedForm?.get("portfolioContribution")).toBe("负责剧本拆解与视频后期合成");
      const uploadedResume = submittedForm?.get("resume");
      expect(uploadedResume instanceof File ? uploadedResume.name : null).toBe("lisi-resume.pdf");
      expect(submittedForm?.get("requestId")).toMatch(/^[0-9a-f-]{36}$/i);

      const [uploadedAttachmentForm] = uploadedMaterials;
      const uploadedAttachment = uploadedAttachmentForm?.get("file");
      expect(uploadedAttachment instanceof File ? uploadedAttachment.name : null).toBe("demo.mp4");

      await vi.waitFor(() => {
        expect(host.textContent).toContain("已投递（1）");
        expect(host.textContent).toContain("李四 · lisi-resume.pdf");
      });
    } finally {
      cleanup();
    }
  });

  it("opens the candidate materials modal for a submitted resume and persists attachments via public endpoints", async () => {
    const token = "ext-token-1";
    const requestId = "11111111-1111-4111-8111-111111111111";
    const storedItems: CandidateMaterialItem[] = [];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = resolveRequestUrl(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.endsWith(`/api/public/external-applications/${token}`) && method === "GET") {
        return Promise.resolve(
          Response.json({
            jobs: [{ id: "job-1", jd: "岗位职责描述", name: "前端工程师" }],
            workspaceName: "Acme Corp",
          }),
        );
      }
      if (
        url.endsWith(`/api/public/external-applications/${token}/resumes/${requestId}/materials`) &&
        method === "GET"
      ) {
        return Promise.resolve(Response.json(storedItems));
      }
      if (
        url.endsWith(
          `/api/public/external-applications/${token}/resumes/${requestId}/materials/links`,
        ) &&
        method === "POST"
      ) {
        const body = createCandidateMaterialLinkSchema.parse(
          JSON.parse(String(init?.body ?? "{}")),
        );
        const created: CandidateMaterialItem = {
          category: body.category,
          contentType: null,
          createdAt: "2026-11-24T09:00:00.000Z",
          createdBy: "owner-1",
          fileName: null,
          id: "mat-ext-1",
          kind: "link",
          notes: body.notes,
          ownerType: "resume_pool_item",
          sizeBytes: null,
          title: body.title ?? body.url,
          updatedAt: "2026-11-24T09:00:00.000Z",
          url: body.url,
        };
        storedItems.push(created);
        return Promise.resolve(Response.json(created, { status: 201 }));
      }
      return Promise.resolve(
        Response.json({ error: `Unexpected request: ${method} ${url}` }, { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    localStorage.setItem(
      `external-application-history:${token}`,
      JSON.stringify([{ id: requestId, name: "张三 · 张三简历.pdf" }]),
    );

    const { cleanup, host } = mountExternalApplicationPage(token);
    try {
      await vi.waitFor(() => {
        expect(host.textContent).toContain("Acme Corp");
      });

      const sentTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
        tab.textContent?.includes("已投递"),
      );
      if (!sentTab) {
        throw new Error("Expected sent tab");
      }
      act(() => {
        sentTab.click();
      });

      await vi.waitFor(() => {
        expect(host.textContent).toContain("张三 · 张三简历.pdf");
        expect(host.textContent).toContain("关联附件");
      });

      const attachBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((btn) =>
        btn.textContent?.includes("关联附件"),
      );
      act(() => {
        attachBtn?.click();
      });

      await vi.waitFor(() => {
        expect(document.body.textContent).toContain("关联附件 · 张三 · 张三简历.pdf");
        expect(document.body.textContent).toContain("暂无补充资料");
      });

      const addMaterialBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (btn) => btn.textContent?.includes("新增资料"),
      );
      act(() => {
        addMaterialBtn?.click();
      });

      const linkTab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (tab) => tab.textContent?.trim() === "链接",
      );
      if (!linkTab) {
        throw new Error("Expected 链接 tab inside materials modal");
      }
      act(() => {
        linkTab.click();
      });

      const urlInput = document.querySelector<HTMLInputElement>('input[type="url"]');
      const form = urlInput?.closest("form");
      const titleInput = [...(form?.querySelectorAll<HTMLInputElement>("input") ?? [])].find(
        (input) => input.type !== "url" && input.type !== "file",
      );
      const notesInput = form?.querySelector<HTMLTextAreaElement>("textarea");
      if (!urlInput || !form || !titleInput || !notesInput) {
        throw new Error("Expected link inputs inside add material modal");
      }

      act(() => {
        setInputValue(urlInput, "https://portfolio.example.com/zhangsan");
        setInputValue(titleInput, "张三作品集");
        setInputValue(notesInput, "包含设计稿与视频演示");
      });

      act(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(() => {
        expect(
          fetchMock.mock.calls.some(
            ([url, init]) =>
              resolveRequestUrl(url).endsWith(
                `/api/public/external-applications/${token}/resumes/${requestId}/materials/links`,
              ) && init?.method === "POST",
          ),
        ).toBe(true);
      });

      await vi.waitFor(() => {
        expect(document.body.textContent).toContain("张三作品集");
      });
    } finally {
      cleanup();
    }
  });
});
