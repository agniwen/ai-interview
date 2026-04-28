// 中文：/jd 系列命令解析器；纯函数，无 I/O
// English: /jd command family parser; pure, no I/O
export type JdCommand = { kind: "list" } | { kind: "clear" };

export function parseJdCommand(rawText: string): JdCommand | null {
  const text = rawText.trim();
  if (text !== "/jd" && !text.startsWith("/jd ")) {
    return null;
  }
  const rest = text === "/jd" ? "" : text.slice(4).trim();
  if (rest === "" || rest === "list") {
    return { kind: "list" };
  }
  if (rest === "clear") {
    return { kind: "clear" };
  }
  return null;
}
