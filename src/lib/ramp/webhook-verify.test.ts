import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyRampCallbackSignature } from './webhook-verify';

describe('verifyRampCallbackSignature', () => {
  it('accepts valid HMAC', () => {
    const secret = 'test-secret';
    const body = '{"operationId":"op_1","version":1}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyRampCallbackSignature(body, sig, secret)).toBe(true);
  });

  it('rejects tampered body', () => {
    const secret = 'test-secret';
    const body = '{"operationId":"op_1"}';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyRampCallbackSignature(body + ' ', sig, secret)).toBe(false);
  });
});
