import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  qwenVlOcr: vi.fn(),
  rasterizePdfWithMeta: vi.fn(),
}));

vi.mock("../pdf-rasterize", () => ({
  rasterizePdfWithMeta: mocks.rasterizePdfWithMeta,
}));

vi.mock("../qwen-ocr", () => ({
  isQwenOcrConfigured: () => true,
  qwenVlOcr: mocks.qwenVlOcr,
}));

const { extractResumeDocumentText, parseResumeOcrOnly } = await import("../resume-parse-pipeline");

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
    vi.clearAllMocks();
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
});

describe("extractResumeDocumentText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
