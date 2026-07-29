import { describe, expect, it } from 'vitest';

import {
  buildStellarExpertAccountUrl,
  buildStellarExpertTxUrl,
  DEFAULT_STELLAR_EXPERT_TX_BASE,
  extractStellarTxHash,
} from './explorer-url';

const SAMPLE_HASH = '28327158ec4ae982334e04d174355c4c40789752d80dc532ad0b04fc2ce4f090';
const SAMPLE_ACCOUNT = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

describe('extractStellarTxHash', () => {
  it('returns bare hash unchanged', () => {
    expect(extractStellarTxHash(SAMPLE_HASH)).toBe(SAMPLE_HASH);
  });

  it('extracts hash from full StellarExpert URL', () => {
    const url = `${DEFAULT_STELLAR_EXPERT_TX_BASE}${SAMPLE_HASH}`;
    expect(extractStellarTxHash(url)).toBe(SAMPLE_HASH);
  });
});

describe('buildStellarExpertTxUrl', () => {
  it('appends hash to default testnet base', () => {
    expect(buildStellarExpertTxUrl(SAMPLE_HASH)).toBe(`${DEFAULT_STELLAR_EXPERT_TX_BASE}${SAMPLE_HASH}`);
  });

  it('builds URL when callback sends full explorer link', () => {
    const url = `${DEFAULT_STELLAR_EXPERT_TX_BASE}${SAMPLE_HASH}`;
    expect(buildStellarExpertTxUrl(url)).toBe(`${DEFAULT_STELLAR_EXPERT_TX_BASE}${SAMPLE_HASH}`);
  });

  it('returns null for empty or unsafe input', () => {
    expect(buildStellarExpertTxUrl('')).toBeNull();
    expect(buildStellarExpertTxUrl('<script>')).toBeNull();
  });
});

describe('buildStellarExpertAccountUrl', () => {
  it('builds public network account URL', () => {
    expect(buildStellarExpertAccountUrl(SAMPLE_ACCOUNT, 'STELLAR_PUBLIC')).toBe(
      `https://stellar.expert/explorer/public/account/${SAMPLE_ACCOUNT}`,
    );
  });

  it('defaults to testnet when network is unset', () => {
    expect(buildStellarExpertAccountUrl(SAMPLE_ACCOUNT)).toBe(
      `https://stellar.expert/explorer/testnet/account/${SAMPLE_ACCOUNT}`,
    );
  });

  it('returns null for empty account', () => {
    expect(buildStellarExpertAccountUrl('')).toBeNull();
  });
});
