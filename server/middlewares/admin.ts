import { isAdminRole } from '@/lib/auth-roles';
import { factory } from '../factory';

export const adminMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.var.user || !isAdminRole(c.var.user.role)) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  return next();
});
