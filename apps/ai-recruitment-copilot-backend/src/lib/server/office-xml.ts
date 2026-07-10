import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

export function parseOfficeXml(xml: string): unknown {
  return xmlParser.parse(xml);
}

export function officeXmlLocalName(name: string): string {
  return name.includes(":") ? (name.split(":").pop() ?? name) : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function getOfficeXmlChildren(node: unknown, childLocalName: string): unknown[] {
  if (!isRecord(node)) {
    return [];
  }
  const results: unknown[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith("@_") && officeXmlLocalName(key) === childLocalName) {
      results.push(...asArray(value));
    }
  }
  return results;
}

export function getFirstOfficeXmlChild(node: unknown, childLocalName: string): unknown {
  return getOfficeXmlChildren(node, childLocalName)[0];
}

export function findFirstOfficeXmlDescendant(node: unknown, descendantLocalName: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstOfficeXmlDescendant(item, descendantLocalName);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(node)) {
    return undefined;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (officeXmlLocalName(key) === descendantLocalName) {
      return value;
    }
    const found = findFirstOfficeXmlDescendant(value, descendantLocalName);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function readOfficeXmlAttribute(node: unknown, attributeName: string): string | null {
  if (!isRecord(node)) {
    return null;
  }
  const direct = node[`@_${attributeName}`];
  if (typeof direct === "string") {
    return direct;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key.startsWith("@_") &&
      officeXmlLocalName(key.slice(2)) === attributeName &&
      typeof value === "string"
    ) {
      return value;
    }
  }
  return null;
}

export function collectOfficeXmlText(node: unknown, textLocalName: string, output: string[]): void {
  if (typeof node === "string" || typeof node === "number") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectOfficeXmlText(item, textLocalName, output);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (officeXmlLocalName(key) === textLocalName) {
      for (const textNode of asArray(value)) {
        if (typeof textNode === "string" || typeof textNode === "number") {
          output.push(String(textNode));
        } else if (isRecord(textNode) && typeof textNode["#text"] === "string") {
          output.push(textNode["#text"]);
        }
      }
      continue;
    }
    collectOfficeXmlText(value, textLocalName, output);
  }
}

export function extractOfficeXmlText(xml: string, textLocalName = "t"): string[] {
  const texts: string[] = [];
  collectOfficeXmlText(parseOfficeXml(xml), textLocalName, texts);
  return texts.map((text) => text.trim()).filter(Boolean);
}

export function loadOfficeZip(bytes: Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(Buffer.from(bytes));
}

export async function readOfficeZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? await file.async("string") : null;
}
