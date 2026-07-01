import { requirePanelRoleFromAccessToken, type PanelAccessContext } from './require-panel-role';

export async function requireApiKeyManagerFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin', 'client_admin']);
}

export async function requireUserManagerFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['admin', 'client_admin']);
}

export async function requireClientAdminFromAccessToken(
  accessToken: string,
): Promise<PanelAccessContext> {
  return requirePanelRoleFromAccessToken(accessToken, ['client_admin']);
}
