import { describe, expect, it } from 'vitest';

import { assertOnrampOrderInDataScope, rowMatchesDataScope } from './scope';

describe('rowMatchesDataScope', () => {
  it('allows platform admin to access any row', () => {
    expect(
      rowMatchesDataScope(
        { client_id: 'client-a', created_by_user_id: 'user-1' },
        { mode: 'platform' },
      ),
    ).toBe(true);
  });

  it('matches by client_id when scoped to client', () => {
    expect(
      rowMatchesDataScope(
        { client_id: 'client-a', created_by_user_id: 'user-1' },
        { mode: 'client', clientId: 'client-a' },
      ),
    ).toBe(true);

    expect(
      rowMatchesDataScope(
        { client_id: 'client-b', created_by_user_id: 'user-1' },
        { mode: 'client', clientId: 'client-a' },
      ),
    ).toBe(false);
  });

  it('falls back to created_by_user_id when client_id is missing', () => {
    expect(
      rowMatchesDataScope(
        { client_id: null, created_by_user_id: 'user-1' },
        { mode: 'client', clientId: 'client-a' },
        'user-1',
      ),
    ).toBe(true);
  });
});

describe('assertOnrampOrderInDataScope', () => {
  it('throws 404 when order belongs to another client', () => {
    expect(() =>
      assertOnrampOrderInDataScope(
        { client_id: 'client-b' },
        { mode: 'client', clientId: 'client-a' },
      ),
    ).toThrowError('On-ramp order not found.');
  });
});
