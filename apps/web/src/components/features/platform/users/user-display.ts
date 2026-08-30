export function formatUserNameWithRemark(
  name: string | null | undefined,
  remark: string | null | undefined,
  fallback = "未命名用户",
): string {
  const displayName = name?.trim() || fallback;
  const normalizedRemark = remark?.trim();

  return normalizedRemark ? `${displayName}（${normalizedRemark}）` : displayName;
}
