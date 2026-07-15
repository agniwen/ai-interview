export function formatVersionLabel(type: "Dataset" | "Agent", value: string | number): string {
  const isNumeric = typeof value === "number" || /^\d+(\.\d+)*$/.test(String(value));
  const localizedType = type === "Dataset" ? "数据集" : "智能体";
  return isNumeric ? `${localizedType} v${value}` : `${localizedType} ${value}`;
}
