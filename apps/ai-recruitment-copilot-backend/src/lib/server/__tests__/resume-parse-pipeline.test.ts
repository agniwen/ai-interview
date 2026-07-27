import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertLegacyOfficeToOoxml: vi.fn(),
  generateStructuredWithMastraAgent: vi.fn(),
  qwenVlOcr: vi.fn(),
  rasterizePdfWithMeta: vi.fn(),
  resumeStructuredAgent: { id: "resume-structured-agent" },
  runAliyunResumeExtraction: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: mocks.generateStructuredWithMastraAgent,
    resumeStructuredAgent: mocks.resumeStructuredAgent,
  }),
);

vi.mock("../office-conversion", () => ({
  convertLegacyOfficeToOoxml: mocks.convertLegacyOfficeToOoxml,
}));

vi.mock("../pdf-rasterize", () => ({
  rasterizePdfWithMeta: mocks.rasterizePdfWithMeta,
}));

vi.mock("../qwen-ocr", () => ({
  isQwenOcrConfigured: () => true,
  qwenVlOcr: mocks.qwenVlOcr,
}));

vi.mock("../aliyun-docmining", () => ({
  runAliyunResumeExtraction: mocks.runAliyunResumeExtraction,
}));

const { extractResumeDocumentText, generateResumeStructured, parseResumeFast, parseResumeOcrOnly } =
  await import("../resume-parse-pipeline");

const STRUCTURED_RESUME = {
  age: null,
  degree: "本科",
  education: "本科",
  educationExperiences: [
    {
      degree: "本科",
      educationLevel: "本科",
      graduationYear: null,
      major: "计算机科学",
      period: "2014-2018",
      school: "浙江大学",
      summary: null,
    },
  ],
  email: "candidate@example.com",
  gender: null,
  graduationYear: null,
  links: [],
  major: "计算机科学",
  name: "候选人",
  personalStrengths: ["前端工程化"],
  phone: null,
  projectExperiences: [
    {
      name: "商家后台",
      period: "2021-2023",
      role: "前端负责人",
      summary: "负责 React 前端架构",
      techStack: ["React", "TypeScript"],
    },
  ],
  schools: ["浙江大学"],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: "在职",
    dateRanges: ["2021-2023"],
    estimatedExperienceYears: 5,
    riskSignals: [],
  },
  workExperiences: [
    {
      company: "示例科技",
      period: "2019-至今",
      role: "前端工程师",
      summary: "负责业务平台前端开发",
    },
  ],
  workYears: 5,
};

function aliyunExtractionResult(content = JSON.stringify(STRUCTURED_RESUME)) {
  return {
    cleanup: { deleted: true, error: null },
    content,
    extractionAttempts: 1,
    pageCount: 2,
    timingsMs: {
      applyLease: 1,
      extraction: 2,
      ossUpload: 3,
      submitParse: 4,
      total: 10,
    },
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    },
  };
}

function createStoredZip(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ compression: "STORE", type: "uint8array" });
}

describe("parseResumeOcrOnly", () => {
  const originalConcurrency = process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY;
  const originalAttempts = process.env.RESUME_PARSE_OCR_ATTEMPTS;
  const originalRetryDelay = process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY = "1";
    process.env.RESUME_PARSE_OCR_ATTEMPTS = "2";
    process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS = "0";
    mocks.rasterizePdfWithMeta.mockResolvedValue({
      pageCount: 3,
      pages: [Buffer.from("page-1"), Buffer.from("page-2"), Buffer.from("page-3")],
    });
  });

  afterEach(() => {
    if (originalConcurrency === undefined) {
      delete process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY;
    } else {
      process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY = originalConcurrency;
    }
    if (originalAttempts === undefined) {
      delete process.env.RESUME_PARSE_OCR_ATTEMPTS;
    } else {
      process.env.RESUME_PARSE_OCR_ATTEMPTS = originalAttempts;
    }
    if (originalRetryDelay === undefined) {
      delete process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS;
    } else {
      process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS = originalRetryDelay;
    }
  });

  it("limits OCR page concurrency from env", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.qwenVlOcr.mockImplementation(async (png: Buffer) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(1);
      active -= 1;
      return png.toString();
    });

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]));

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(maxActive).toBe(1);
  });

  it("emits page-level OCR progress without changing the OCR result", async () => {
    mocks.qwenVlOcr.mockImplementation((png: Buffer) => png.toString());
    const events: unknown[] = [];

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]), {
      onProgress: (event) => events.push(event),
    });

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(events).toEqual([
      {
        renderedPages: 3,
        totalPages: 3,
        type: "document.pages.ready",
      },
      {
        page: 1,
        totalPages: 3,
        type: "ocr.page.started",
      },
      {
        charCount: 6,
        page: 1,
        textPreview: "page-1",
        totalPages: 3,
        type: "ocr.page.completed",
      },
      {
        page: 2,
        totalPages: 3,
        type: "ocr.page.started",
      },
      {
        charCount: 6,
        page: 2,
        textPreview: "page-2",
        totalPages: 3,
        type: "ocr.page.completed",
      },
      {
        page: 3,
        totalPages: 3,
        type: "ocr.page.started",
      },
      {
        charCount: 6,
        page: 3,
        textPreview: "page-3",
        totalPages: 3,
        type: "ocr.page.completed",
      },
      {
        outputChars: 22,
        renderedPages: 3,
        totalPages: 3,
        type: "ocr.completed",
      },
    ]);
  });

  it("retries transient OCR connection errors", async () => {
    mocks.qwenVlOcr
      .mockRejectedValueOnce(new Error("Connection error."))
      .mockResolvedValueOnce("page-1")
      .mockResolvedValueOnce("page-2")
      .mockResolvedValueOnce("page-3");

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]));

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(mocks.qwenVlOcr).toHaveBeenCalledTimes(4);
  });

  it("retries transient OCR TypeErrors that the provider uses for connection failures", async () => {
    mocks.qwenVlOcr
      .mockRejectedValueOnce(new TypeError("Connection error."))
      .mockResolvedValueOnce("page-1")
      .mockResolvedValueOnce("page-2")
      .mockResolvedValueOnce("page-3");

    const result = await parseResumeOcrOnly(new Uint8Array([1, 2, 3]));

    expect(result.text).toBe("page-1\n\npage-2\n\npage-3");
    expect(mocks.qwenVlOcr).toHaveBeenCalledTimes(4);
  });
});

describe("extractResumeDocumentText", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.ALIBABA_BASE_URL = "https://example.test";
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";
    mocks.rasterizePdfWithMeta.mockResolvedValue({
      pageCount: 1,
      pages: [Buffer.from("pdf-page")],
    });
    mocks.qwenVlOcr.mockResolvedValue("PDF 候选人 TypeScript");
  });

  it("keeps PDF extraction on the existing OCR path", async () => {
    const result = await extractResumeDocumentText({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(result).toMatchObject({
      pageCount: 1,
      text: "PDF 候选人 TypeScript",
      textSource: "qwen-ocr",
    });
    expect(mocks.rasterizePdfWithMeta).toHaveBeenCalledTimes(1);
  });

  it("runs OCR directly for image resumes without PDF rasterization", async () => {
    mocks.qwenVlOcr.mockResolvedValue("图片简历 候选人 JavaScript");

    const result = await extractResumeDocumentText({
      bytes: new Uint8Array([4, 5, 6]),
      fileName: "resume.jpeg",
      mediaType: "image/jpeg",
    });

    expect(result).toMatchObject({
      pageCount: 1,
      text: "图片简历 候选人 JavaScript",
      textSource: "qwen-ocr",
    });
    expect(mocks.rasterizePdfWithMeta).not.toHaveBeenCalled();
    expect(mocks.qwenVlOcr).toHaveBeenCalledWith(Buffer.from([4, 5, 6]), "image/jpeg");
  });

  it("infers JPEG OCR media type from image filename when browser type is empty", async () => {
    mocks.qwenVlOcr.mockResolvedValue("JPEG 简历 OCR");

    await extractResumeDocumentText({
      bytes: new Uint8Array([7, 8, 9]),
      fileName: "resume.jpg",
      mediaType: "",
    });

    expect(mocks.qwenVlOcr).toHaveBeenCalledWith(Buffer.from([7, 8, 9]), "image/jpeg");
  });

  it("extracts text from docx files", async () => {
    const bytes = await createStoredZip({
      "word/document.xml": `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>邓超</w:t></w:r></w:p>
            <w:p><w:r><w:t>8 年后端开发</w:t></w:r></w:p>
          </w:body>
        </w:document>
      `,
    });

    const result = await extractResumeDocumentText({
      bytes,
      fileName: "resume.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(result.text).toContain("邓超");
    expect(result.text).toContain("8 年后端开发");
    expect(result.textSource).toBe("docx-text");
    expect(result.pageCount).toBe(1);
  });

  it("extracts slide text from pptx files in slide order", async () => {
    const bytes = await createStoredZip({
      "ppt/slides/slide1.xml": `
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:t>候选人：王五</a:t><a:t>React</a:t>
        </p:sld>
      `,
      "ppt/slides/slide2.xml": `
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:t>项目经验</a:t>
        </p:sld>
      `,
    });

    const result = await extractResumeDocumentText({
      bytes,
      fileName: "resume.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(result.text).toContain("[Slide 1]");
    expect(result.text).toContain("候选人：王五\nReact");
    expect(result.text).toContain("[Slide 2]");
    expect(result.text).toContain("项目经验");
    expect(result.textSource).toBe("pptx-text");
    expect(result.pageCount).toBe(2);
  });

  it("extracts worksheet cells from xlsx files", async () => {
    const bytes = await createStoredZip({
      "xl/_rels/workbook.xml.rels": `
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
        </Relationships>
      `,
      "xl/sharedStrings.xml": `
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <si><t>姓名</t></si>
          <si><t>赵六</t></si>
          <si><t>技能</t></si>
          <si><t>Node.js</t></si>
        </sst>
      `,
      "xl/workbook.xml": `
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="简历" sheetId="1" r:id="rId1"/></sheets>
        </workbook>
      `,
      "xl/worksheets/sheet1.xml": `
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
            <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
          </sheetData>
        </worksheet>
      `,
    });

    const result = await extractResumeDocumentText({
      bytes,
      fileName: "resume.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(result.text).toContain("[Sheet: 简历]");
    expect(result.text).toContain("姓名\t赵六");
    expect(result.text).toContain("技能\tNode.js");
    expect(result.textSource).toBe("xlsx-text");
    expect(result.pageCount).toBe(1);
  });

  it("extracts readable text from single-file HTML resumes", async () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>简历</title>
          <style>.hidden { display: none; }</style>
          <script>window.secret = "ignore me";</script>
        </head>
        <body>
          <h1>候选人：李雷</h1>
          <section>
            <h2>工作经历</h2>
            <p>5 年前端开发，熟悉 React 和 TypeScript。</p>
          </section>
        </body>
      </html>
    `;

    const result = await extractResumeDocumentText({
      bytes: new TextEncoder().encode(html),
      fileName: "resume.html",
      mediaType: "text/html",
    });

    expect(result.text).toContain("候选人：李雷");
    expect(result.text).toContain("5 年前端开发");
    expect(result.text).toContain("React");
    expect(result.text).not.toContain("ignore me");
    expect(result.textSource).toBe("html-text");
    expect(result.pageCount).toBe(1);
  });

  it("converts DOC files before extracting DOCX text", async () => {
    const docxBytes = await createStoredZip({
      "word/document.xml": `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>旧版 Word 候选人</w:t></w:r></w:p>
          </w:body>
        </w:document>
      `,
    });
    mocks.convertLegacyOfficeToOoxml.mockResolvedValue(docxBytes);

    const result = await extractResumeDocumentText({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.doc",
      mediaType: "application/msword",
    });

    expect(mocks.convertLegacyOfficeToOoxml).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      inputExtension: "doc",
      outputExtension: "docx",
    });
    expect(result.text).toContain("旧版 Word 候选人");
    expect(result.textSource).toBe("docx-text");
  });

  it("converts PPT files before extracting PPTX text", async () => {
    const pptxBytes = await createStoredZip({
      "ppt/slides/slide1.xml": `
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:t>旧版 PPT 候选人</a:t>
        </p:sld>
      `,
    });
    mocks.convertLegacyOfficeToOoxml.mockResolvedValue(pptxBytes);

    const result = await extractResumeDocumentText({
      bytes: new Uint8Array([4, 5, 6]),
      fileName: "resume.ppt",
      mediaType: "application/vnd.ms-powerpoint",
    });

    expect(mocks.convertLegacyOfficeToOoxml).toHaveBeenCalledWith({
      bytes: new Uint8Array([4, 5, 6]),
      inputExtension: "ppt",
      outputExtension: "pptx",
    });
    expect(result.text).toContain("旧版 PPT 候选人");
    expect(result.textSource).toBe("pptx-text");
  });

  it("converts XLS files before extracting XLSX text", async () => {
    const xlsxBytes = await createStoredZip({
      "xl/_rels/workbook.xml.rels": `
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
        </Relationships>
      `,
      "xl/sharedStrings.xml": `
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <si><t>旧版 Excel 候选人</t></si>
        </sst>
      `,
      "xl/workbook.xml": `
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="简历" sheetId="1" r:id="rId1"/></sheets>
        </workbook>
      `,
      "xl/worksheets/sheet1.xml": `
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c></row>
          </sheetData>
        </worksheet>
      `,
    });
    mocks.convertLegacyOfficeToOoxml.mockResolvedValue(xlsxBytes);

    const result = await extractResumeDocumentText({
      bytes: new Uint8Array([7, 8, 9]),
      fileName: "resume.xls",
      mediaType: "application/vnd.ms-excel",
    });

    expect(mocks.convertLegacyOfficeToOoxml).toHaveBeenCalledWith({
      bytes: new Uint8Array([7, 8, 9]),
      inputExtension: "xls",
      outputExtension: "xlsx",
    });
    expect(result.text).toContain("旧版 Excel 候选人");
    expect(result.textSource).toBe("xlsx-text");
  });
});

describe("generateResumeStructured", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.generateStructuredWithMastraAgent.mockResolvedValue(STRUCTURED_RESUME);
  });

  it("uses Mastra structured output instead of parsing free-form JSON text", async () => {
    const result = await generateResumeStructured("候选人 React TypeScript 5 年经验");

    expect(result).toEqual(STRUCTURED_RESUME);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.resumeStructuredAgent,
        maxOutputTokens: 16_384,
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
  });

  it("instructs the model to collect a complete skill set without an 18-item cap", async () => {
    await generateResumeStructured("候选人掌握多项技术栈");

    const prompt = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain("skills 是候选人掌握技能的全集");
    expect(prompt).toContain("项目经历");
    expect(prompt).toContain("工作经历");
    expect(prompt).not.toContain("skills 最多 18 项");
  });
});

describe("parseResumeFast provider selection", () => {
  const originalProvider = process.env.RESUME_PARSE_PROVIDER;
  const originalApiKey = process.env.ALIBABA_API_KEY;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.RESUME_PARSE_PROVIDER;
    } else {
      process.env.RESUME_PARSE_PROVIDER = originalProvider;
    }
    if (originalApiKey === undefined) {
      delete process.env.ALIBABA_API_KEY;
    } else {
      process.env.ALIBABA_API_KEY = originalApiKey;
    }
  });

  it("uses Aliyun document mining without invoking OCR or the structured LLM", async () => {
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    process.env.ALIBABA_API_KEY = "test-key";
    mocks.generateStructuredWithMastraAgent.mockClear();
    mocks.qwenVlOcr.mockClear();
    mocks.runAliyunResumeExtraction.mockResolvedValue(aliyunExtractionResult());

    const result = await parseResumeFast({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(result).toEqual({
      pageCount: 2,
      structured: STRUCTURED_RESUME,
      text: JSON.stringify(STRUCTURED_RESUME),
      textSource: "aliyun-docmining",
    });
    expect(mocks.runAliyunResumeExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        fileName: "resume.docx",
      }),
    );
    expect(mocks.qwenVlOcr).not.toHaveBeenCalled();
    expect(mocks.generateStructuredWithMastraAgent).not.toHaveBeenCalled();
  });

  it("retries once when Aliyun returns truncated structured JSON", async () => {
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    process.env.ALIBABA_API_KEY = "test-key";
    mocks.runAliyunResumeExtraction.mockReset();
    mocks.runAliyunResumeExtraction
      .mockResolvedValueOnce(aliyunExtractionResult('{"name":"候选人"'))
      .mockResolvedValueOnce(aliyunExtractionResult());

    const result = await parseResumeFast({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(result.structured).toEqual(STRUCTURED_RESUME);
    expect(mocks.runAliyunResumeExtraction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["resume.pdf", "resume.pdf"],
    ["resume.doc", "resume.doc"],
    ["resume.docx", "resume.docx"],
    ["resume.html", "resume.html"],
    ["resume.htm", "resume.html"],
    ["resume.ppt", "resume.ppt"],
    ["resume.pptx", "resume.pptx"],
    ["resume.xls", "resume.xls"],
    ["resume.xlsx", "resume.xlsx"],
    ["resume.jpg", "resume.jpg"],
    ["resume.png", "resume.png"],
  ])("passes supported format %s to Aliyun as %s", async (fileName, expectedFileName) => {
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    process.env.ALIBABA_API_KEY = "test-key";
    mocks.runAliyunResumeExtraction.mockReset();
    mocks.runAliyunResumeExtraction.mockResolvedValue(aliyunExtractionResult());

    await parseResumeFast({
      bytes: new Uint8Array([1, 2, 3]),
      fileName,
    });

    expect(mocks.runAliyunResumeExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: expectedFileName }),
    );
  });
});
