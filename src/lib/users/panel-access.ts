import type { PanelUserRole } from './types';
import {
  canAccessRampUi,
  canApproveWhitelist,
  canManageApiKeys,
  canManagePanelUsers,
  isPlatformAdminRole,
} from './roles';

export function isOperatorOrAdminRole(
  role: PanelUserRole | null | undefined,
): role is Extract<PanelUserRole, 'admin' | 'operator'> {
  return canAccessRampUi(role);
}

export function isPlatformAdmin(role: PanelUserRole | null | undefined): boolean {
  return isPlatformAdminRole(role);
}

export { canAccessRampUi, canApproveWhitelist, canManageApiKeys, canManagePanelUsers };
