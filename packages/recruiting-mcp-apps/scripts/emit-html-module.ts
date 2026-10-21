/**
 * 把 Vite 产物内联成单个 HTML，并生成 `dist/index.js`，供 MCP 服务端作为 `ui://` 资源返回。
 * Inline the Vite build into one HTML document and emit a module exporting it as a string.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const distUrl = new URL("../dist/", import.meta.url);
const viewUrl = new URL("view/", distUrl);

const SCRIPT_TAG_RE = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g;
const STYLESHEET_TAG_RE = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g;

function assetUrl(path: string) {
  return new URL(path.replace(/^\//, ""), viewUrl);
}

async function inlineAssets(html: string) {
  let output = html;
  for (const [tag, src] of html.matchAll(SCRIPT_TAG_RE)) {
    // 内联脚本里出现 `</script` 会提前结束标签。 Escape closing tags inside inline scripts.
    const source = await readFile(assetUrl(src), "utf-8");
    const code = source.replaceAll("</script", "<\\/script");
    output = output.replace(tag, () => `<script type="module">${code}</script>`);
  }
  for (const [tag, href] of html.matchAll(STYLESHEET_TAG_RE)) {
    const css = await readFile(assetUrl(href), "utf-8");
    output = output.replace(tag, () => `<style>${css}</style>`);
  }
  return output;
}

const html = await inlineAssets(await readFile(new URL("index.html", viewUrl), "utf-8"));
if (SCRIPT_TAG_RE.test(html) || STYLESHEET_TAG_RE.test(html)) {
  throw new Error("MCP Apps view still references external assets after inlining.");
}

await mkdir(distUrl, { recursive: true });
await writeFile(new URL("recruiting-cards.html", distUrl), html);
await writeFile(
  new URL("index.js", distUrl),
  `/** 招聘卡片 MCP Apps 视图（单文件 HTML）。 */\nexport const recruitingCardsHtml = ${JSON.stringify(html)};\n`,
);
await writeFile(
  new URL("index.d.ts", distUrl),
  "/** 招聘卡片 MCP Apps 视图（单文件 HTML）。 */\nexport declare const recruitingCardsHtml: string;\n",
);
console.log(`[recruiting-mcp-apps] emitted ${(html.length / 1024).toFixed(1)} KiB view`);
