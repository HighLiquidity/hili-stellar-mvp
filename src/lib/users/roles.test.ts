import { describe, expect, it } from 'vitest';

import {
  canAccessRampUi,
  canSubmitOwnWhitelistRequests,
  isClientTenantRampActor,
} from './roles';

describe('client tenant ramp roles', () => {
  it('treats client_admin as a ramp actor', () => {
    expect(isClientTenantRampActor('client_admin')).toBe(true);
    expect(canAccessRampUi('client_admin')).toBe(true);
    expect(canSubmitOwnWhitelistRequests('client_admin')).toBe(true);
  });

  it('keeps viewer out of ramp and whitelist submission', () => {
    expect(isClientTenantRampActor('viewer')).toBe(false);
    expect(canAccessRampUi('viewer')).toBe(false);
    expect(canSubmitOwnWhitelistRequests('viewer')).toBe(false);
  });

  it('keeps platform admin on ramp without tenant actor semantics', () => {
    expect(isClientTenantRampActor('admin')).toBe(false);
    expect(canAccessRampUi('admin')).toBe(true);
    expect(canSubmitOwnWhitelistRequests('admin')).toBe(false);
  });
});
