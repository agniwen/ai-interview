import type { InMemoryFileNode } from "../agent-edit-page/utils/form-validation";

export const STRUCTURAL_IDS = new Set([
  "root",
  "skill-md",
  "license-md",
  "references",
  "scripts",
  "assets",
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function createInitialStructure(name: string): InMemoryFileNode[] {
  const slug = slugify(name) || "untitled";
  return [
    {
      children: [
        { content: "", id: "skill-md", name: "SKILL.md", type: "file" },
        { content: "", id: "license-md", name: "LICENSE.md", type: "file" },
        { children: [], id: "references", name: "references", type: "folder" },
        { children: [], id: "scripts", name: "scripts", type: "folder" },
        { children: [], id: "assets", name: "assets", type: "folder" },
      ],
      id: "root",
      name: slug,
      type: "folder",
    },
  ];
}

export function updateRootFolderName(files: InMemoryFileNode[], name: string): InMemoryFileNode[] {
  const slug = slugify(name) || "untitled";
  return files.map((node) => (node.id === "root" ? { ...node, name: slug } : node));
}

export function extractSkillInstructions(files: InMemoryFileNode[]): string {
  const root = files.find((n) => n.id === "root");
  if (!root?.children) {
    return "";
  }
  const skillMd = root.children.find((n) => n.id === "skill-md");
  return skillMd?.content ?? "";
}

export function extractSkillLicense(files: InMemoryFileNode[]): string | undefined {
  const root = files.find((n) => n.id === "root");
  if (!root?.children) {
    return undefined;
  }
  const licenseMd = root.children.find((n) => n.id === "license-md");
  const content = licenseMd?.content?.trim();
  return content || undefined;
}

export function isImageContent(content: string | undefined): boolean {
  return !!content && content.startsWith("data:image/");
}

export function updateNodeContent(
  nodes: InMemoryFileNode[],
  nodeId: string,
  content: string,
): InMemoryFileNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, content };
    }
    if (node.children) {
      return { ...node, children: updateNodeContent(node.children, nodeId, content) };
    }
    return node;
  });
}
