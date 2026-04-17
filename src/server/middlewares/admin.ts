import { canAccessAdmin } from '@/lib/auth-roles';
import { factory } from '../factory';

export const adminMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.var.user || !canAccessAdmin(c.var.user)) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  return next();
});
