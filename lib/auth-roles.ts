export type RoleValue = string | string[] | null | undefined;

export function getRoleList(value: RoleValue) {
  if (Array.isArray(value)) {
    return value
      .map(role => role.trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map(role => role.trim())
    .filter(Boolean);
}

export function hasRole(value: RoleValue, role: string) {
  return getRoleList(value).includes(role);
}

export function isAdminRole(value: RoleValue) {
  return hasRole(value, 'admin');
}
