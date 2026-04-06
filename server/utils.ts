import type { Context } from 'hono';
import { z } from 'zod';

/**
 * 成功响应
 */
export function success<T extends object | null>(c: Context, data: T) {
  return c.json(data);
}

/**
 * 分页结果
 */
export function page<T extends object[]>(c: Context, data: T, total: number) {
  return c.json({
    data,
    total,
  });
}

/**
 * 分页查询参数
 */
export function pageSchema<T extends z.ZodRawShape>(shape: T = {} as T) {
  const baseShape = {
    current: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
  };
  return z.object({ ...baseShape, ...shape });
}

/**
 * 分页查询条件
 */
export function pageCondition(schema: { current?: number, pageSize?: number }) {
  const { current = 1, pageSize = 10 } = schema;
  const res = {} as { skip?: number, take?: number };
  if (current >= 1) {
    res.skip = (current - 1) * pageSize;
  }
  if (pageSize > 0) {
    res.take = pageSize;
  }
  return res;
}
