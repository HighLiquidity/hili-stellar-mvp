import type { PanelUserRole } from './types';

export function isOperatorOrAdminRole(
  role: PanelUserRole | null | undefined,
): role is Extract<PanelUserRole, 'admin' | 'operator'> {
  return role === 'admin' || role === 'operator';
}
