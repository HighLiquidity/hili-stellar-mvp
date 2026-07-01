import type { PanelUserRole } from './types';

export const PLATFORM_ADMIN_ROLE: PanelUserRole = 'admin';
export const CLIENT_ADMIN_ROLE: PanelUserRole = 'client_admin';

export const ALL_PANEL_ROLES: PanelUserRole[] = [
  'admin',
  'client_admin',
  'operator',
  'viewer',
];

export const CLIENT_SCOPED_ROLES: PanelUserRole[] = ['client_admin', 'operator', 'viewer'];

export const CLIENT_ADMIN_MANAGEABLE_ROLES: PanelUserRole[] = ['operator', 'viewer'];

export const PLATFORM_ADMIN_ASSIGNABLE_ROLES: PanelUserRole[] = [
  'admin',
  'client_admin',
  'operator',
  'viewer',
];

export function isPlatformAdminRole(role: PanelUserRole | null | undefined): boolean {
  return role === PLATFORM_ADMIN_ROLE;
}

export function isClientAdminRole(role: PanelUserRole | null | undefined): boolean {
  return role === CLIENT_ADMIN_ROLE;
}

export function isOperatorRole(role: PanelUserRole | null | undefined): boolean {
  return role === 'operator';
}

export function isClientTenantRampActor(role: PanelUserRole | null | undefined): boolean {
  return isOperatorRole(role) || isClientAdminRole(role);
}

export function canSubmitOwnWhitelistRequests(role: PanelUserRole | null | undefined): boolean {
  return isClientTenantRampActor(role);
}

export function canAccessRampUi(role: PanelUserRole | null | undefined): boolean {
  return isPlatformAdminRole(role) || isClientTenantRampActor(role);
}

export function canManagePanelUsers(role: PanelUserRole | null | undefined): boolean {
  return isPlatformAdminRole(role) || isClientAdminRole(role);
}

export function canManageApiKeys(role: PanelUserRole | null | undefined): boolean {
  return isPlatformAdminRole(role) || isClientAdminRole(role);
}

export function canApproveWhitelist(role: PanelUserRole | null | undefined): boolean {
  return isPlatformAdminRole(role) || isClientAdminRole(role);
}

export function requiresClientId(role: PanelUserRole): boolean {
  return CLIENT_SCOPED_ROLES.includes(role);
}
