import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { z } from "zod";

export type OfficeXmlNode = OfficeXmlElement | OfficeXmlNode[] | boolean | null | number | string;

export interface OfficeXmlElement {
  [key: string]: OfficeXmlNode;
}

const officeXmlNodeSchema: z.ZodType<OfficeXmlNode> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(officeXmlNodeSchema),
    z.record(z.string(), officeXmlNodeSchema),
  ]),
);
const officeXmlElementSchema: z.ZodType<OfficeXmlElement> = z.record(
  z.string(),
  officeXmlNodeSchema,
);
const officeXmlTextScalarSchema = z.union([z.string(), z.number()]);

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

export function parseOfficeXml(xml: string): OfficeXmlNode {
  return officeXmlNodeSchema.parse(xmlParser.parse(xml));
}

export function officeXmlLocalName(name: string): string {
  return name.includes(":") ? (name.split(":").pop() ?? name) : name;
}

function isOfficeXmlElement(value: OfficeXmlNode | undefined): value is OfficeXmlElement {
  return officeXmlElementSchema.safeParse(value).success;
}

function asArray(value: OfficeXmlNode | undefined): OfficeXmlNode[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function getOfficeXmlChildren(
  node: OfficeXmlNode | undefined,
  childLocalName: string,
): OfficeXmlNode[] {
  if (!isOfficeXmlElement(node)) {
    return [];
  }
  const results: OfficeXmlNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith("@_") && officeXmlLocalName(key) === childLocalName) {
      results.push(...asArray(value));
    }
  }
  return results;
}

export function getFirstOfficeXmlChild(
  node: OfficeXmlNode | undefined,
  childLocalName: string,
): OfficeXmlNode | undefined {
  return getOfficeXmlChildren(node, childLocalName)[0];
}

export function findFirstOfficeXmlDescendant(
  node: OfficeXmlNode | undefined,
  descendantLocalName: string,
): OfficeXmlNode | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstOfficeXmlDescendant(item, descendantLocalName);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (!isOfficeXmlElement(node)) {
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

export function readOfficeXmlAttribute(
  node: OfficeXmlNode | undefined,
  attributeName: string,
): string | null {
  if (!isOfficeXmlElement(node)) {
    return null;
  }
  const direct = node[`@_${attributeName}`];
  const parsedDirect = z.string().safeParse(direct);
  if (parsedDirect.success) {
    return parsedDirect.data;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_") && officeXmlLocalName(key.slice(2)) === attributeName) {
      const parsedValue = z.string().safeParse(value);
      if (parsedValue.success) {
        return parsedValue.data;
      }
    }
  }
  return null;
}

export function collectOfficeXmlText(
  node: OfficeXmlNode | undefined,
  textLocalName: string,
  output: string[],
): void {
  if (officeXmlTextScalarSchema.safeParse(node).success) {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectOfficeXmlText(item, textLocalName, output);
    }
    return;
  }
  if (!isOfficeXmlElement(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (officeXmlLocalName(key) === textLocalName) {
      for (const textNode of asArray(value)) {
        const parsedText = officeXmlTextScalarSchema.safeParse(textNode);
        if (parsedText.success) {
          output.push(String(parsedText.data));
        } else if (isOfficeXmlElement(textNode)) {
          const parsedNestedText = z.string().safeParse(textNode["#text"]);
          if (parsedNestedText.success) {
            output.push(parsedNestedText.data);
          }
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
