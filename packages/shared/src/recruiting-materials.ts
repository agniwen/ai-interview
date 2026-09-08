export const RECRUITING_MATERIAL_MAX_BYTES = 20 * 1024 * 1024;
export const RECRUITING_MATERIAL_MAX_COUNT = 10;

export function validateRecruitingMaterialFiles(
  files: readonly { name: string; size: number }[],
  existingCount: number,
): string | null {
  if (files.length === 0) {
    return "请选择文件";
  }
  if (existingCount + files.length > RECRUITING_MATERIAL_MAX_COUNT) {
    return "每位候选人的流水附件最多 10 个，请删除后再上传";
  }
  for (const file of files) {
    if (!file.name.trim() || file.name.length > 255) {
      return "文件名不能为空且不能超过 255 个字符";
    }
    if (file.size <= 0) {
      return `${file.name} 为空文件`;
    }
    if (file.size > RECRUITING_MATERIAL_MAX_BYTES) {
      return `${file.name} 超过 20 MB`;
    }
  }
  return null;
}
