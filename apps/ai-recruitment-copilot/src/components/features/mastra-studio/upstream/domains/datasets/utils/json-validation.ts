/**
 * JSON validation utilities for dataset import
 * Validates JSON structure matches expected format
 */

/** Expected structure of an imported item */
export interface ImportableItem {
  input: unknown;
  groundTruth?: unknown;
  metadata?: Record<string, unknown>;
}

/** Validation error for a specific item */
export interface JSONValidationError {
  index: number;
  message: string;
}

/** Result of JSON validation */
export interface JSONValidationResult {
  valid: boolean;
  errors: JSONValidationError[];
  items: ImportableItem[];
}

/**
 * Validate JSON data for dataset import
 * @param data - Parsed JSON data
 * @returns Validation result with errors and valid items
 */
export function validateJSONData(data: unknown): JSONValidationResult {
  const errors: JSONValidationError[] = [];
  const items: ImportableItem[] = [];

  // Check: must be an array
  if (!Array.isArray(data)) {
    errors.push({
      index: -1,
      message: "JSON 必须是数据项数组",
    });
    return { errors, items, valid: false };
  }

  // Check: must not be empty
  if (data.length === 0) {
    errors.push({
      index: -1,
      message: "JSON 数组必须至少包含一个数据项",
    });
    return { errors, items, valid: false };
  }

  // Validate each item
  for (let i = 0; i < data.length; i += 1) {
    const item = data[i];
    // 1-indexed for user display
    const itemNum = i + 1;

    // Check: must be an object
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push({
        index: itemNum,
        message: `第 ${itemNum} 个数据项必须是对象`,
      });
      continue;
    }

    // Check: must have 'input' field
    if (!("input" in item) || item.input === undefined || item.input === null) {
      errors.push({
        index: itemNum,
        message: `第 ${itemNum} 个数据项缺少必填的 input 字段`,
      });
      continue;
    }

    // Check: input cannot be empty string
    if (item.input === "") {
      errors.push({
        index: itemNum,
        message: `第 ${itemNum} 个数据项的 input 字段为空`,
      });
      continue;
    }

    // Check: metadata must be an object if present
    if (
      "metadata" in item &&
      item.metadata !== undefined &&
      item.metadata !== null &&
      (typeof item.metadata !== "object" || Array.isArray(item.metadata))
    ) {
      errors.push({
        index: itemNum,
        message: `第 ${itemNum} 个数据项的 metadata 字段无效（必须是对象）`,
      });
      continue;
    }

    // Item is valid, add to items array
    items.push({
      groundTruth: "groundTruth" in item ? item.groundTruth : undefined,
      input: item.input,
      metadata: "metadata" in item ? (item.metadata as Record<string, unknown>) : undefined,
    });
  }

  return {
    errors,
    items,
    valid: errors.length === 0,
  };
}
