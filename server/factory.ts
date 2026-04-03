import type { Env } from '@/server/type';
import { createFactory } from 'hono/factory';

export const factory = createFactory<Env>();
