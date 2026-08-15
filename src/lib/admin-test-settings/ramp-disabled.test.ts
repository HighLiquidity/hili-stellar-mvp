import { describe, expect, it } from 'vitest';

import { RampDisabledError } from './ramp-disabled';

describe('RampDisabledError', () => {
  it('uses a stable code and 403 for USDC and BRH', () => {
    const usdc = new RampDisabledError('usdc');
    expect(usdc.code).toBe('ramp_disabled');
    expect(usdc.status).toBe(403);
    expect(usdc.product).toBe('usdc');

    const brh = new RampDisabledError('brh');
    expect(brh.code).toBe('ramp_disabled');
    expect(brh.product).toBe('brh');
  });
});
