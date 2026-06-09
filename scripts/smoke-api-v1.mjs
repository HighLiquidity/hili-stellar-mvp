/**
 * Smoke test: /api/v1 quote + lock (no PIX payment or crypto transfer).
 * Usage: node scripts/smoke-api-v1.mjs
 * Optional: HILI_SMOKE_API_SECRET=hili_sk_... node scripts/smoke-api-v1.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function hashSecret(secret) {
  const pepper = process.env.API_KEY_HASH_PEPPER?.trim() ?? '';
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

function generateCredentials() {
  const keyPrefix = `hili_pk_${randomBytes(4).toString('hex')}`;
  const secret = `hili_sk_${randomBytes(18).toString('hex')}`;
  return { keyPrefix, secret, secretHash: hashSecret(secret) };
}

function logStep(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function apiFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function listAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

async function resolveOperatorWithWhitelist(admin) {
  const { data: panelRows, error: panelError } = await admin
    .from('panel_access_list')
    .select('email, role, is_active')
    .eq('is_active', true)
    .in('role', ['operator', 'admin']);

  if (panelError) throw new Error(panelError.message);

  const authUsers = await listAuthUsers(admin);
  const emailToUser = new Map(
    authUsers
      .filter((u) => u.email && u.id)
      .map((u) => [u.email.trim().toLowerCase(), u]),
  );

  for (const row of panelRows ?? []) {
    const email = row.email?.trim().toLowerCase();
    const user = email ? emailToUser.get(email) : null;
    if (!user) continue;

    const { data: wallets } = await admin
      .from('user_withdraw_whitelist')
      .select('address, network')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    const wallet = wallets?.[0];
    if (!wallet?.address) continue;

    const { data: pixRows } = await admin
      .from('user_pix_whitelist')
      .select('pix_key')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    return {
      userId: user.id,
      email: user.email,
      walletAddress: wallet.address,
      pixKey: pixRows?.[0]?.pix_key ?? null,
    };
  }

  return null;
}

async function bootstrapApiKey(admin, operator) {
  const credentials = generateCredentials();
  const now = new Date().toISOString();
  const { error } = await admin.from('api_keys').insert({
    label: `smoke-test-${now.slice(0, 19)}`,
    key_prefix: credentials.keyPrefix,
    secret_hash: credentials.secretHash,
    linked_user_id: operator.userId,
    scopes: ['onramp', 'offramp', 'orders:read'],
    is_active: true,
    created_by_email: operator.email?.toLowerCase() ?? 'smoke@test',
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
  return { secret: credentials.secret, prefix: credentials.keyPrefix };
}

loadEnvLocal();

const baseUrl = process.env.HILI_SMOKE_BASE_URL?.trim() || 'http://localhost:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;

try {
  const health = await apiFetch(baseUrl, '/api/health');
  logStep('Health', health.status === 200, `HTTP ${health.status}`);

  const unauth = await apiFetch(baseUrl, '/api/v1/onramp/orders/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxId: '12345678901', amountBrl: '100.00' }),
  });
  logStep('Quote without Bearer', unauth.status === 401, `HTTP ${unauth.status}`);
  if (unauth.status !== 401) failed += 1;

  let secret = process.env.HILI_SMOKE_API_SECRET?.trim() || '';
  let keyPrefix = process.env.HILI_SMOKE_API_KEY_PREFIX?.trim() || '';

  const operator = await resolveOperatorWithWhitelist(admin);
  if (!operator) {
    logStep('Operator + whitelist', false, 'no active operator with wallet whitelist');
    process.exit(1);
  }
  logStep(
    'Operator + whitelist',
    true,
    `${operator.email} · wallet ${operator.walletAddress.slice(0, 8)}…`,
  );

  if (!secret) {
    const boot = await bootstrapApiKey(admin, operator);
    secret = boot.secret;
    keyPrefix = boot.prefix;
    logStep('Bootstrap API key', true, `prefix ${keyPrefix} (temporary smoke key)`);
  } else {
    logStep('Use existing API secret', true, keyPrefix || 'from HILI_SMOKE_API_SECRET');
  }

  const authHeaders = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };

  const externalId = `smoke-${Date.now()}`;
  const idemQuote = `smoke-on-quote-${externalId}`;

  const onQuote = await apiFetch(baseUrl, '/api/v1/onramp/orders/quote', {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': idemQuote },
    body: JSON.stringify({
      externalId,
      taxId: '12345678901',
      amountBrl: '100.00',
    }),
  });
  logStep('On-ramp POST quote', onQuote.status === 200, `HTTP ${onQuote.status}`);
  if (onQuote.status !== 200) {
    console.log('  ', JSON.stringify(onQuote.body));
    failed += 1;
    process.exit(1);
  }

  const orderId = onQuote.body?.orderId;
  logStep('  externalId in quote', onQuote.body?.externalId === externalId, onQuote.body?.externalId);

  const onQuoteReplay = await apiFetch(baseUrl, '/api/v1/onramp/orders/quote', {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': idemQuote },
    body: JSON.stringify({
      externalId,
      taxId: '12345678901',
      amountBrl: '100.00',
    }),
  });
  logStep(
    'On-ramp idempotency replay',
    onQuoteReplay.status === 200 && onQuoteReplay.body?.orderId === orderId,
    `orderId ${onQuoteReplay.body?.orderId}`,
  );

  const onLock = await apiFetch(baseUrl, `/api/v1/onramp/orders/${orderId}/lock`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': `smoke-on-lock-${orderId}` },
    body: JSON.stringify({ destinationAddress: operator.walletAddress }),
  });
  logStep('On-ramp POST lock', onLock.status === 200, `HTTP ${onLock.status}`);
  if (onLock.status !== 200) {
    console.log('  ', JSON.stringify(onLock.body));
    failed += 1;
  } else {
    logStep('  awaiting_pix + PIX payload', onLock.body?.status === 'awaiting_pix' && Boolean(onLock.body?.pix?.copyPaste));
    logStep('  externalId in lock', onLock.body?.externalId === externalId);
  }

  const onGet = await apiFetch(baseUrl, `/api/v1/onramp/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  logStep('On-ramp GET order', onGet.status === 200, `HTTP ${onGet.status} status=${onGet.body?.status}`);
  if (onGet.status === 200) {
    logStep('  sanitized GET (no references)', onGet.body?.references === undefined);
    logStep('  externalId in GET', onGet.body?.externalId === externalId);
  }

  const onList = await apiFetch(
    baseUrl,
    `/api/v1/onramp/orders?externalId=${encodeURIComponent(externalId)}&pageSize=5`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  logStep(
    'On-ramp GET list',
    onList.status === 200 && (onList.body?.orders?.length ?? 0) >= 1,
    `HTTP ${onList.status} total=${onList.body?.total}`,
  );

  if (!operator.pixKey) {
    logStep('Off-ramp quote+lock', false, 'no PIX whitelist for operator — skipped');
  } else {
    const offExternalId = `smoke-off-${Date.now()}`;
    const offQuote = await apiFetch(baseUrl, '/api/v1/offramp/orders/quote', {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': `smoke-off-quote-${offExternalId}` },
      body: JSON.stringify({
        externalId: offExternalId,
        amountUsdc: '10.00',
        payoutPixKey: operator.pixKey,
      }),
    });
    logStep('Off-ramp POST quote', offQuote.status === 200, `HTTP ${offQuote.status}`);
    if (offQuote.status !== 200) {
      console.log('  ', JSON.stringify(offQuote.body));
      failed += 1;
    } else {
      const offOrderId = offQuote.body.orderId;
      const offLock = await apiFetch(baseUrl, `/api/v1/offramp/orders/${offOrderId}/lock`, {
        method: 'POST',
        headers: { ...authHeaders, 'Idempotency-Key': `smoke-off-lock-${offOrderId}` },
        body: JSON.stringify({ payoutPixKey: operator.pixKey }),
      });
      logStep('Off-ramp POST lock', offLock.status === 200, `HTTP ${offLock.status}`);
      if (offLock.status !== 200) {
        console.log('  ', JSON.stringify(offLock.body));
        failed += 1;
      } else {
        logStep(
          '  awaiting_deposit + deposit address',
          offLock.body?.status === 'awaiting_deposit' && Boolean(offLock.body?.deposit?.address),
        );
      }
    }
  }

  console.log('');
  if (failed > 0) {
    console.log(`Smoke test finished with ${failed} failure(s).`);
    process.exit(1);
  }
  console.log('Smoke test (quote + lock) passed.');
} catch (error) {
  console.error('Smoke test error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
