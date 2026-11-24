// @vitest-environment jsdom
import type { CandidateMaterialItem } from "@app/shared/candidate-materials";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateMaterialsPanel } from "../candidate-materials-panel";
import type { CandidateMaterialsClient } from "../candidate-materials-panel";

// SAFETY: React's test-only act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = vi.fn().mockReturnValue({
  addEventListener: vi.fn(),
  matches: false,
  removeEventListener: vi.fn(),
});

const SAMPLE_ITEMS: CandidateMaterialItem[] = [
  {
    category: "archive",
    contentType: "application/zip",
    createdAt: "2026-11-24T01:00:00.000Z",
    createdBy: "user-1",
    fileName: "works.zip",
    id: "mat-file-zip",
    kind: "file",
    notes: "UI 设计压缩包",
    ownerType: "resume_pool_item",
    sizeBytes: 2 * 1024 * 1024,
    title: "设计作品集压缩包",
    updatedAt: "2026-11-24T01:00:00.000Z",
    url: null,
  },
  {
    category: "video",
    contentType: "video/mp4",
    createdAt: "2026-11-24T02:00:00.000Z",
    createdBy: "user-1",
    fileName: "demo.mp4",
    id: "mat-file-video",
    kind: "file",
    notes: "",
    ownerType: "resume_pool_item",
    sizeBytes: 5 * 1024 * 1024,
    title: "产品演示视频",
    updatedAt: "2026-11-24T02:00:00.000Z",
    url: null,
  },
  {
    category: "portfolio",
    contentType: null,
    createdAt: "2026-11-24T03:00:00.000Z",
    createdBy: "user-1",
    fileName: null,
    id: "mat-link-1",
    kind: "link",
    notes: "访问密码 1234",
    ownerType: "resume_pool_item",
    sizeBytes: null,
    title: "个人作品集网站",
    updatedAt: "2026-11-24T03:00:00.000Z",
    url: "https://portfolio.example.com",
  },
];

function createFakeClient(items: CandidateMaterialItem[]): CandidateMaterialsClient {
  return {
    candidateMaterialFileUrl: (ownerType, slug, ownerId, materialId) =>
      `/api/w/${slug}/studio/${ownerType === "resume_pool_item" ? "resume-pool" : "resumes"}/${ownerId}/materials/${materialId}/file`,
    createCandidateMaterialLink: vi.fn(),
    deleteCandidateMaterial: vi.fn(),
    listCandidateMaterials: vi.fn().mockResolvedValue(items),
    updateCandidateMaterial: vi.fn(),
    uploadCandidateMaterialFile: vi.fn(),
  };
}

function renderPanel(canEdit: boolean, items = SAMPLE_ITEMS) {
  const client = createFakeClient(items);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CandidateMaterialsPanel
          canEdit={canEdit}
          client={client}
          ownerId="pool-1"
          ownerType="resume_pool_item"
          slug="acme"
        />
      </QueryClientProvider>,
    );
  });
  return {
    cleanup: () => {
      act(() => root.unmount());
      queryClient.clear();
      host.remove();
    },
    client,
    host,
  };
}

async function waitForLoaded(host: HTMLElement, text?: string) {
  await vi.waitFor(() => {
    expect(host.textContent).not.toBe("");
    if (text) {
      expect(host.textContent).toContain(text);
    } else {
      expect(host.textContent).toMatch(/补充资料（\d+\/\d+）/);
    }
  });
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CandidateMaterialsPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders file downloads, video preview trigger, and external links", async () => {
    const { cleanup, host } = renderPanel(true);
    try {
      await waitForLoaded(host, "设计作品集压缩包");
      expect(host.textContent).toContain("设计作品集压缩包");
      expect(host.textContent).toContain("产品演示视频");
      expect(host.textContent).toContain("个人作品集网站");
      expect(host.textContent).toContain("压缩包");
      expect(host.textContent).toContain("视频");
      expect(host.textContent).toContain("链接");

      const downloads = host.querySelectorAll<HTMLAnchorElement>("a[download]");
      expect(downloads).toHaveLength(2);
      expect(downloads[0]?.getAttribute("href")).toBe(
        "/api/w/acme/studio/resume-pool/pool-1/materials/mat-file-zip/file",
      );
      expect(host.querySelector('[aria-label="预览 产品演示视频"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="预览 设计作品集压缩包"]')).toBeNull();

      const linkAnchor = host.querySelector<HTMLAnchorElement>(
        'a[href="https://portfolio.example.com"]',
      );
      expect(linkAnchor?.getAttribute("target")).toBe("_blank");
    } finally {
      cleanup();
    }
  });

  it("hides add, edit, and delete controls when read-only", async () => {
    const { cleanup, host } = renderPanel(false);
    try {
      await waitForLoaded(host, "设计作品集压缩包");
      expect(host.textContent).not.toContain("新增资料");
      expect(host.querySelector('[aria-label^="编辑 "]')).toBeNull();
      expect(host.querySelector('[aria-label^="删除 "]')).toBeNull();
      expect(host.querySelectorAll("a[download]")).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it("uploads a file material with description on the default attachment tab", async () => {
    const { cleanup, client, host } = renderPanel(true, []);
    const file = new File(["zip-content"], "portfolio-bundle.zip", { type: "application/zip" });
    vi.mocked(client.uploadCandidateMaterialFile).mockResolvedValue({
      ...SAMPLE_ITEMS[0],
      fileName: "portfolio-bundle.zip",
      id: "mat-file-new",
      notes: "2026 最新设计作品集",
      title: "最新作品集压缩包",
    });
    try {
      await waitForLoaded(host);
      const addBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((btn) =>
        btn.textContent?.includes("新增资料"),
      );
      act(() => {
        addBtn?.click();
      });

      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!fileInput) {
        throw new Error("Expected file input inside dialog");
      }
      Object.defineProperty(fileInput, "files", {
        configurable: true,
        value: [file],
      });
      act(() => {
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const titleInput = [...document.querySelectorAll<HTMLInputElement>("input")].find(
        (input) => input.type !== "file",
      );
      const notesInput = document.querySelector<HTMLTextAreaElement>("textarea");
      if (!titleInput || !notesInput) {
        throw new Error("Expected title and notes fields");
      }
      act(() => {
        setInputValue(titleInput, "最新作品集压缩包");
        setInputValue(notesInput, "2026 最新设计作品集");
      });

      const form = document.querySelector<HTMLFormElement>("form");
      act(() => {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(() => {
        expect(client.uploadCandidateMaterialFile).toHaveBeenCalledWith(
          "resume_pool_item",
          "acme",
          "pool-1",
          file,
          {
            notes: "2026 最新设计作品集",
            title: "最新作品集压缩包",
          },
        );
      });
    } finally {
      cleanup();
    }
  });

  it("submits a new material link after switching to the link tab", async () => {
    const { cleanup, client, host } = renderPanel(true, []);
    vi.mocked(client.createCandidateMaterialLink).mockResolvedValue({
      ...SAMPLE_ITEMS[2],
      id: "mat-link-new",
      title: "Behance 作品集",
      url: "https://behance.net/alice",
    });
    try {
      await waitForLoaded(host);
      const addBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find((btn) =>
        btn.textContent?.includes("新增资料"),
      );
      act(() => {
        addBtn?.click();
      });

      const linkTab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (tab) => tab.textContent?.trim() === "链接",
      );
      if (!linkTab) {
        throw new Error("Expected 链接 tab");
      }
      act(() => {
        linkTab.click();
      });

      const urlInput = document.querySelector<HTMLInputElement>('input[type="url"]');
      const titleInput = [...document.querySelectorAll<HTMLInputElement>("input")].find(
        (input) => input.type !== "url" && input.type !== "file",
      );
      const notesInput = document.querySelector<HTMLTextAreaElement>("textarea");
      if (!urlInput || !titleInput || !notesInput) {
        throw new Error("Expected add link form fields");
      }

      act(() => {
        setInputValue(urlInput, "https://behance.net/alice");
        setInputValue(titleInput, "Behance 作品集");
        setInputValue(notesInput, "重点看第 3 个项目");
      });

      const form = document.querySelector<HTMLFormElement>("form");
      act(() => {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(() => {
        expect(client.createCandidateMaterialLink).toHaveBeenCalledWith(
          "resume_pool_item",
          "acme",
          "pool-1",
          {
            category: "portfolio",
            notes: "重点看第 3 个项目",
            title: "Behance 作品集",
            url: "https://behance.net/alice",
          },
        );
      });
    } finally {
      cleanup();
    }
  });

  it("edits an existing link material and saves changes", async () => {
    const { cleanup, client, host } = renderPanel(true);
    vi.mocked(client.updateCandidateMaterial).mockResolvedValue({
      ...SAMPLE_ITEMS[2],
      notes: "已更新密码",
      title: "新版作品集网站",
      url: "https://new-portfolio.example.com",
    });
    try {
      await waitForLoaded(host, "个人作品集网站");
      const editBtn = host.querySelector<HTMLButtonElement>('[aria-label="编辑 个人作品集网站"]');
      act(() => {
        editBtn?.click();
      });

      const urlInput = document.querySelector<HTMLInputElement>('input[type="url"]');
      const titleInput = [...document.querySelectorAll<HTMLInputElement>("input")].find(
        (input) => input.type !== "url",
      );
      const notesInput = document.querySelector<HTMLTextAreaElement>("textarea");
      if (!urlInput || !titleInput || !notesInput) {
        throw new Error("Expected edit form fields");
      }

      act(() => {
        setInputValue(titleInput, "新版作品集网站");
        setInputValue(urlInput, "https://new-portfolio.example.com");
        setInputValue(notesInput, "已更新密码");
      });

      const form = document.querySelector<HTMLFormElement>("form");
      act(() => {
        form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      await vi.waitFor(() => {
        expect(client.updateCandidateMaterial).toHaveBeenCalledWith(
          "resume_pool_item",
          "acme",
          "pool-1",
          "mat-link-1",
          {
            notes: "已更新密码",
            title: "新版作品集网站",
            url: "https://new-portfolio.example.com",
          },
        );
      });
    } finally {
      cleanup();
    }
  });

  it("deletes a material after confirming in the alert dialog", async () => {
    const { cleanup, client, host } = renderPanel(true);
    vi.mocked(client.deleteCandidateMaterial).mockResolvedValue({ success: true });
    try {
      await waitForLoaded(host, "设计作品集压缩包");
      const deleteBtn = host.querySelector<HTMLButtonElement>(
        '[aria-label="删除 设计作品集压缩包"]',
      );
      act(() => {
        deleteBtn?.click();
      });

      const confirmBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (btn) => btn.textContent === "确认删除",
      );
      act(() => {
        confirmBtn?.click();
      });

      await vi.waitFor(() => {
        expect(client.deleteCandidateMaterial).toHaveBeenCalledWith(
          "resume_pool_item",
          "acme",
          "pool-1",
          "mat-file-zip",
        );
      });
    } finally {
      cleanup();
    }
  });
});
