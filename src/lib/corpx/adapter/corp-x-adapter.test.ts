import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import { CorpXAuthManager } from '../auth/auth-manager';
import {
  CorpXAdapter,
  createCorpXAdapterWithInitialAuth,
  mapCorpXTransactionStatus,
} from './corp-x-adapter';
import {
  CorpXIdempotencyConflictError,
  CorpXInsufficientFundsError,
  CorpXInvalidRequestError,
  CorpXProviderUnavailableError,
  CorpXTransactionNotFoundError,
  throwAdapterStatusError,
} from '../errors';
import {
  mapCorpXStatus,
  mapCorpXTransferLookupStatus,
  throwPIXCashOutError,
} from '../pix/adapter';

function authTokenResponseListener(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      access_token: 'test-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
  );
}

async function startServer(createListener: () => http.RequestListener): Promise<{
  baseUrl: string;
  server: http.Server;
}> {
  const server = http.createServer(createListener());
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function setupTestAdapter(
  apiListener?: http.RequestListener,
): Promise<{
  adapter: CorpXAdapter;
  auth: CorpXAuthManager;
  close: () => Promise<void>;
}> {
  const authServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/oauth2/token')) {
      authTokenResponseListener(req, res);
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  const apiServer = http.createServer((req, res) => {
    if (apiListener) {
      apiListener(req, res);
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((r) => authServer.listen(0, '127.0.0.1', r));
  await new Promise<void>((r) => apiServer.listen(0, '127.0.0.1', r));

  const authPort = (authServer.address() as AddressInfo).port;
  const apiPort = (apiServer.address() as AddressInfo).port;
  const authURL = `http://127.0.0.1:${authPort}`;
  const apiBaseURL = `http://127.0.0.1:${apiPort}`;

  const auth = new CorpXAuthManager({
    authURL,
    clientID: 'test-client-id',
    clientSecret: 'test-client-secret',
    tenantID: 'test-tenant-id',
  });

  const adapter = await createCorpXAdapterWithInitialAuth({
    apiBaseURL,
    auth,
    accountId: 'test-account-id',
    pixKey: 'test-pix-key',
    webhookIpAllowlist: new Set(['10.0.0.1', '10.0.0.2']),
  });

  return {
    adapter,
    auth,
    close: async () => {
      await Promise.all([closeServer(authServer), closeServer(apiServer)]);
    },
  };
}

async function withTestAdapter(
  apiListener: http.RequestListener | undefined,
  fn: (ctx: { adapter: CorpXAdapter; auth: CorpXAuthManager }) => void | Promise<void>,
): Promise<void> {
  const ctx = await setupTestAdapter(apiListener);
  try {
    await fn(ctx);
  } finally {
    await ctx.close();
  }
}

describe('CorpXAuthManager', () => {
  it('Login_Success', async () => {
    const { server, baseUrl } = await startServer(() => authTokenResponseListener);
    try {
      const auth = new CorpXAuthManager({
        authURL: baseUrl,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      await auth.login();
      expect(auth.isAuthenticated()).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('Login_UsesV2ScopeAndBasicAuth', async () => {
    const seen = {
      authorization: '',
      body: '',
    };
    const server = http.createServer(async (req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/oauth2/token')) {
        seen.authorization = String(req.headers.authorization ?? '');
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        seen.body = Buffer.concat(chunks).toString('utf8');
        authTokenResponseListener(req, res);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const auth = new CorpXAuthManager({
        authURL: `http://127.0.0.1:${port}`,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      await auth.login();
      expect(seen.authorization.startsWith('Basic ')).toBe(true);
      expect(seen.body).toContain('grant_type=client_credentials');
      expect(seen.body).toContain('scope=api2%2Fread+api2%2Fwrite');
    } finally {
      await closeServer(server);
    }
  });

  it('Login_ServerError', async () => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const auth = new CorpXAuthManager({
        authURL: `http://127.0.0.1:${port}`,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      await expect(auth.login()).rejects.toThrow(/login failed/i);
      expect(auth.isAuthenticated()).toBe(false);
    } finally {
      await closeServer(server);
    }
  });

  it('Login_InvalidJSON', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end('not-json');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const auth = new CorpXAuthManager({
        authURL: `http://127.0.0.1:${port}`,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      await expect(auth.login()).rejects.toThrow(/failed to decode login response/i);
    } finally {
      await closeServer(server);
    }
  });

  it('RefreshToken_CallsLogin', async () => {
    const { server, baseUrl } = await startServer(() => authTokenResponseListener);
    try {
      const auth = new CorpXAuthManager({
        authURL: baseUrl,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      await auth.refreshToken();
      expect(auth.isAuthenticated()).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('AddAuthHeader_SetsHeaders', async () => {
    const { server, baseUrl } = await startServer(() => authTokenResponseListener);
    try {
      const auth = new CorpXAuthManager({
        authURL: baseUrl,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'test-tenant',
      });
      await auth.login();
      const headers = new Headers();
      await auth.addAuthHeader(headers);
      expect(headers.get('Authorization')).toBe('Bearer test-access-token');
      expect(headers.get('X-Tenant-Id')).toBe('test-tenant');
    } finally {
      await closeServer(server);
    }
  });

  it('AddAuthHeader_RefreshesExpiredToken', async () => {
    const { server, baseUrl } = await startServer(() => authTokenResponseListener);
    try {
      const auth = new CorpXAuthManager({
        authURL: baseUrl,
        clientID: 'client-id',
        clientSecret: 'client-secret',
        tenantID: 'tenant-id',
      });
      auth.dangerouslySetTokenForTests('expired-token', Date.now() - 3600_000);
      const headers = new Headers();
      await auth.addAuthHeader(headers);
      expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    } finally {
      await closeServer(server);
    }
  });

  it('IsAuthenticated_FalseWhenNoToken', () => {
    const auth = new CorpXAuthManager({
      authURL: 'http://127.0.0.1:9',
      clientID: 'id',
      clientSecret: 'secret',
      tenantID: 'tenant',
    });
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('CorpXAdapter', () => {
  it('NewCorpXAdapter_Success', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      expect(adapter.accountId).toBe('test-account-id');
      expect(adapter.validateWebhookSignature('', '10.0.0.1')).toBe(true);
      expect(adapter.validateWebhookSignature('', '10.0.0.2')).toBe(true);
    });
  });

  it('NewCorpXAdapter_MissingFields', () => {
    const auth = new CorpXAuthManager({
      authURL: 'http://127.0.0.1:9',
      clientID: 'x',
      clientSecret: 'y',
      tenantID: 'z',
    });
    expect(() =>
      new CorpXAdapter({
        apiBaseURL: '',
        auth,
        accountId: '',
        pixKey: '',
        webhookIpAllowlist: new Set(),
      }),
    ).toThrow(/corpx adapter requires/i);
  });

  it('NewCorpXAdapter_AuthFailure', async () => {
    const authServer = http.createServer((_req, res) => {
      res.statusCode = 401;
      res.end();
    });
    await new Promise<void>((r) => authServer.listen(0, '127.0.0.1', r));
    const authPort = (authServer.address() as AddressInfo).port;
    const authURL = `http://127.0.0.1:${authPort}`;

    const auth = new CorpXAuthManager({
      authURL,
      clientID: 'id',
      clientSecret: 'secret',
      tenantID: 'tenant',
    });

    await expect(
      createCorpXAdapterWithInitialAuth({
        apiBaseURL: 'http://127.0.0.1:9',
        auth,
        accountId: 'account',
        pixKey: 'pix',
        webhookIpAllowlist: new Set(),
      }),
    ).rejects.toThrow(/corpx initial authentication failed/i);

    await closeServer(authServer);
  });

  it('QueryBalance_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/v1/accounts/acc-123/balance');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          accountId: 'acc-123',
          total: 15000.0,
          locked: 500.0,
          available: 14500.0,
          currency: 'BRL',
          updatedAt: '2024-01-15T10:30:00Z',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.queryBalance({ accountId: 'acc-123' });
      expect(resp.accountId).toBe('acc-123');
      expect(resp.available).toBe('14500');
      expect(resp.reserved).toBe('500');
      expect(resp.total).toBe('15000');
      expect(resp.currency).toBe('BRL');
    });
  });

  it('QueryBalance_NotFound', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 404;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.queryBalance({ accountId: 'bad-id' })).rejects.toBeInstanceOf(
        CorpXInvalidRequestError,
      );
    });
  });

  it('QueryBalance_Unauthorized', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 403;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.queryBalance({ accountId: 'acc-1' })).rejects.toBeInstanceOf(
        CorpXProviderUnavailableError,
      );
    });
  });

  it('QueryBalance_RateLimit', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 429;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.queryBalance({ accountId: 'acc-1' })).rejects.toBeInstanceOf(
        CorpXProviderUnavailableError,
      );
    });
  });

  it('GetTransactionHistory_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/v1/accounts/acc-123/statement');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          transactions: [
            {
              transactionType: 'PIX_IN',
              status: 'COMPLETED',
              direction: 'IN',
              amount: 1500.5,
              currency: 'BRL',
              description: 'PIX received',
              identifier: 'tx-001',
              transactionDate: '2024-01-15T10:30:00Z',
            },
            {
              transactionType: 'PIX_OUT',
              status: 'COMPLETED',
              direction: 'OUT',
              amount: 500.0,
              currency: 'BRL',
              description: 'PIX sent',
              identifier: 'tx-002',
              transactionDate: '2024-01-15T11:00:00Z',
            },
          ],
          totalElements: 2,
          hasNext: false,
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.getTransactionHistory({ accountId: 'acc-123', limit: 50 });
      expect(resp.transactions).toHaveLength(2);
      expect(resp.transactions[0]?.type).toBe('credit');
      expect(resp.transactions[1]?.type).toBe('debit');
      expect(resp.transactions[0]?.amount).toBe('1500.5');
      expect(resp.totalCount).toBe(2);
      expect(resp.hasMore).toBe(false);
    });
  });

  it('GetTransactionHistory_NotFound', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 404;
      res.end();
    }, async ({ adapter }) => {
      await expect(
        adapter.getTransactionHistory({ accountId: 'bad' }),
      ).rejects.toBeInstanceOf(CorpXInvalidRequestError);
    });
  });

  it('GetProviderInfo', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const info = adapter.getProviderInfo();
      expect(info.name).toBe('corpx');
      expect(info.type).toBe('baas');
      expect(info.capabilities.supportsPIX).toBe(true);
      expect(info.capabilities.supportsPIXCashOut).toBe(true);
      expect(info.capabilities.supportsTED).toBe(false);
      expect(info.capabilities.supportsBoleto).toBe(false);
      expect(info.capabilities.supportsWebhooks).toBe(true);
    });
  });

  it('HealthCheck_Healthy', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      expect(() => adapter.healthCheck()).not.toThrow();
    });
  });

  it('HealthCheck_NotAuthenticated', async () => {
    const ctx = await setupTestAdapter(undefined);
    try {
      ctx.auth.dangerouslySetTokenForTests('x', Date.now() - 3600_000);
      expect(() => ctx.adapter.healthCheck()).toThrow(CorpXProviderUnavailableError);
    } finally {
      await ctx.close();
    }
  });

  it('GenerateDynamicPIX_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toContain('/pix/qr-code/dynamic');
      expect(req.headers['idempotency-key']).toBe('idemp-1');
      expect(req.headers['x-tenant-id']).toBe('test-tenant-id');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          txid: 'tx-abc-123',
          emv: '00020101021226790014br.gov.bcb.pix...',
          identifier: 'order-123',
          status: 'ACTIVE',
          type: 'dynamic',
          value: 150.75,
          message: 'Test payment',
          expiresAt: '2026-05-27T15:00:00Z',
          createdAt: '2026-05-27T14:55:00Z',
          pixKey: 'pix-key-123',
        }),
      );
    }, async ({ adapter }) => {
      const expiresAt = new Date(Date.now() + 3600_000);
      const resp = await adapter.pix.generateDynamicPIX({
        idempotencyKey: 'idemp-1',
        amount: '150.75',
        description: 'Test payment',
        expiresAt,
        correlationId: 'order-123',
      });
      expect(resp.providerTxId).toBe('tx-abc-123');
      expect(resp.qrCode).toBe('00020101021226790014br.gov.bcb.pix...');
      expect(resp.pixKey).toBe('pix-key-123');
      expect(resp.amount).toBe('150.75');
      expect(resp.status).toBe('active');
    });
  });

  it('GenerateDynamicPIX_Conflict', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'idempotency_conflict', message: 'duplicate key' }));
    }, async ({ adapter }) => {
      await expect(
        adapter.pix.generateDynamicPIX({
          idempotencyKey: 'k',
          amount: '100',
          expiresAt: new Date(Date.now() + 3600_000),
          correlationId: 'c1',
        }),
      ).rejects.toBeInstanceOf(CorpXIdempotencyConflictError);
    });
  });

  it('GenerateStaticPIX_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toContain('/pix/qr-code/static');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          txid: 'static-tx-123',
          emv: '00020126580014br.gov.bcb.pix...',
          identifier: 'static-001',
          status: 'ACTIVE',
          type: 'static',
          value: 0,
          message: 'Donation',
          createdAt: '2026-05-27T14:55:00Z',
          pixKey: 'static-key',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.generateStaticPIX({
        idempotencyKey: 'idemp-static-1',
        description: 'Donation',
      });
      expect(resp.providerTxId).toBe('static-tx-123');
      expect(resp.qrCode).toBe('00020126580014br.gov.bcb.pix...');
      expect(resp.amount).toBe('0');
      expect(resp.status).toBe('active');
    });
  });

  it('InitiatePIXCashOut_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toContain('/pix/out');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          transactionId: 'txn-abc123',
          status: 'APPROVED',
          endToEndId: 'E12345678202301011234abcdef',
          amount: 100.0,
          currency: 'BRL',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.initiatePIXCashOut({
        idempotencyKey: 'idemp-cashout-1',
        pixKeyType: 'CPF',
        pixKey: '12345678901',
        amount: '100',
        description: 'Service payment',
        correlationId: 'order-123',
      });
      expect(resp.providerTxId).toBe('txn-abc123');
      expect(resp.e2eId).toBe('E12345678202301011234abcdef');
      expect(resp.status).toBe('submitted');
      expect(resp.amount).toBe('100');
    });
  });

  it('InitiatePIXCashOut_FallsBackToRequestAmountWhenResponseAmountMissing', async () => {
    await withTestAdapter((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          transactionId: 'txn-no-amount',
          status: 'APPROVED',
          endToEndId: 'E12345678202301011234abcdef',
          currency: 'BRL',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.initiatePIXCashOut({
        idempotencyKey: 'idemp-cashout-2',
        pixKeyType: 'CPF',
        pixKey: '12345678901',
        amount: '250.50',
      });
      expect(resp.providerTxId).toBe('txn-no-amount');
      expect(resp.amount).toBe('250.50');
    });
  });

  it('PayPaymentQrEmv_FallsBackToRequestAmountWhenResponseAmountMissing', async () => {
    await withTestAdapter((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toContain('/pix/out/qr-code/async');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          transactionId: 'txn-qr-no-amount',
          status: 'APPROVED',
          endToEndId: 'E2E-QR-1',
          currency: 'BRL',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.payPaymentQrEmv({
        emv: '00020126890014BR.GOV.BCB.PIX2567api-pix.example/spi/v2/abc520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***6304ABCD',
        amount: '10.00',
        idempotencyKey: 'idemp-qr-1',
      });
      expect(resp.providerTxId).toBe('txn-qr-no-amount');
      expect(resp.e2eId).toBe('E2E-QR-1');
      expect(resp.amount).toBe('10.00');
    });
  });

  it('PayPaymentQrEmv_FallsBackToEmvTag54WhenAmountOmittedFromRequestAndResponse', async () => {
    const binanceEmv =
      '00020126890014BR.GOV.BCB.PIX2567api-pix.bancobs2.com.br/spi/v2/d18d6517-2dfe-4ab5-9fd0-2779b627a9cf520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***63042928';
    let postedBody = '';

    await withTestAdapter((req, res) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        postedBody = Buffer.concat(chunks).toString('utf8');
        expect(req.url).toContain('/pix/out/qr-code/async');
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 202;
        res.end(
          JSON.stringify({
            transactionId: 'txn-qr-emv-amount',
            status: 'APPROVED',
            endToEndId: 'E2E-QR-EMV',
            currency: 'BRL',
          }),
        );
      })();
    }, async ({ adapter }) => {
      const resp = await adapter.pix.payPaymentQrEmv({
        emv: binanceEmv,
        amount: '10.00',
        amountHint: '10',
        idempotencyKey: 'idemp-qr-emv',
      });
      const posted = JSON.parse(postedBody) as { amount?: unknown; emv?: string };
      expect(posted.amount).toBe(10);
      expect(posted.emv).toBe(binanceEmv);
      expect(resp.providerTxId).toBe('txn-qr-emv-amount');
      expect(resp.amount).toBe('10.00');
    });
  });

  it('PayPaymentQrEmv_AcceptsAsync202WithPaymentId', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/pix/out/qr-code/async');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          paymentId: 'pay_2f4a0f88-2147-49f2-a4e2-4f7b9f6c0f7a',
          status: 'ACCEPTED',
          identifier: 'pay-qr-async-12345',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.payPaymentQrEmv({
        emv: '00020126890014BR.GOV.BCB.PIX2567api-pix.example/spi/v2/abc520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***6304ABCD',
        amount: '10.00',
        idempotencyKey: 'pay-qr-async-12345',
        correlationId: 'pay-qr-async-12345',
      });
      expect(resp.providerTxId).toBe('pay_2f4a0f88-2147-49f2-a4e2-4f7b9f6c0f7a');
      expect(resp.status).toBe('submitted');
      expect(resp.e2eId).toBe('');
    });
  });

  it('InitiatePIXCashOut_InsufficientFunds', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'INSUFFICIENT_FUNDS', message: 'insufficient balance' }));
    }, async ({ adapter }) => {
      await expect(
        adapter.pix.initiatePIXCashOut({
          idempotencyKey: 'k',
          amount: '10000',
          pixKeyType: 'EVP',
          pixKey: 'k',
        }),
      ).rejects.toBeInstanceOf(CorpXInsufficientFundsError);
    });
  });

  it('InitiatePIXCashOut_BigPIX', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/pix/out/bigpix');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          bigPixId: 'bp-001',
          requestedAmount: 47500.0,
          executedAmount: 47500.0,
          status: 'FULL',
          transfers: [
            { index: 1, amount: 15000.0, status: 'SUCCESS', endToEndId: 'E123-1' },
            { index: 2, amount: 15000.0, status: 'SUCCESS', endToEndId: 'E123-2' },
            { index: 3, amount: 15000.0, status: 'SUCCESS', endToEndId: 'E123-3' },
            { index: 4, amount: 2500.0, status: 'SUCCESS', endToEndId: 'E123-4' },
          ],
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.initiatePIXCashOut({
        idempotencyKey: 'k',
        amount: '47500',
        pixKeyType: 'EVP',
        pixKey: 'dest',
      });
      expect(resp.providerTxId).toBe('bp-001');
      expect(resp.e2eId).toBe('E123-1');
      expect(resp.status).toBe('completed');
      expect(resp.amount).toBe('47500');
    });
  });

  it('InitiatePIXCashOut_BigPIX_Partial', async () => {
    await withTestAdapter((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          bigPixId: 'bp-002',
          requestedAmount: 30000.0,
          executedAmount: 15000.0,
          status: 'PARTIAL',
          transfers: [
            { index: 1, amount: 15000.0, status: 'SUCCESS', endToEndId: 'E456-1' },
          ],
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.initiatePIXCashOut({
        idempotencyKey: 'k',
        amount: '30000',
        pixKeyType: 'EVP',
        pixKey: 'dest',
      });
      expect(resp.status).toBe('requires_reconciliation');
    });
  });

  it('InitiateTransfer_DelegatesToPIXCashOut', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/pix/out');
      expect(req.method).toBe('POST');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 202;
      res.end(
        JSON.stringify({
          transactionId: 'txn-transfer-1',
          status: 'APPROVED',
          endToEndId: 'E-transfer-1',
          amount: 500.0,
          currency: 'BRL',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.initiateTransfer({
        idempotencyKey: 'idemp-transfer-1',
        debitAccountId: 'test-account-id',
        creditAccountId: 'dest-key',
        amount: '500',
        description: 'Transfer payment',
        correlationId: 'corr-1',
      });
      expect(resp.providerTxId).toBe('txn-transfer-1');
      expect(resp.status).toBe('submitted');
    });
  });

  it('GetTransferStatus_Success', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/pix/transactions');
      expect(req.url).toContain('endToEndId=e2e-123');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          transactionId: 'txn-123',
          endToEndId: 'e2e-123',
          status: 'COMPLETED',
          transactionDate: '2024-01-15T10:30:00Z',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.getTransferStatus('e2e-123');
      expect(resp.providerTxId).toBe('txn-123');
      expect(resp.status).toBe('completed');
    });
  });

  it('GetTransferStatus_ItemsEnvelope', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('identifier=treasury-run-1');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          accountId: 'acc-1',
          items: [
            {
              partnerId: 'partner-1',
              endToEndId: 'E123456789',
              status: 'COMPLETED',
              amount: -10,
              identifier: 'treasury-run-1',
              timestamp: '2026-08-14T01:00:00-03:00',
            },
          ],
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.lookupPixPayment({ identifier: 'treasury-run-1' });
      expect(resp.status).toBe('completed');
      expect(resp.e2eId).toBe('E123456789');
      expect(resp.providerTxId).toBe('partner-1');
    });
  });

  it('LookupPixOutStatus_PrefersPaymentsLookup', async () => {
    await withTestAdapter((req, res) => {
      expect(req.url).toContain('/pix/payments/lookup');
      expect(req.url).toContain('endToEnd=E50871921202608140429VA2U2AN46PB');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          transactionId: 'txn-lookup',
          endToEndId: 'E50871921202608140429VA2U2AN46PB',
          status: 'COMPLETED',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.lookupPixOutStatus({
        endToEndId: 'E50871921202608140429VA2U2AN46PB',
      });
      expect(resp.status).toBe('completed');
      expect(resp.providerTxId).toBe('txn-lookup');
    });
  });

  it('LookupPixOutStatus_FallsBackToTransactions', async () => {
    await withTestAdapter((req, res) => {
      if (req.url?.includes('/pix/payments/lookup')) {
        res.statusCode = 404;
        res.end();
        return;
      }
      expect(req.url).toContain('/pix/transactions');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          transactionId: 'txn-stmt',
          endToEndId: 'E50871921202608140429VA2U2AN46PB',
          status: 'PROCESSING',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.lookupPixOutStatus({
        endToEndId: 'E50871921202608140429VA2U2AN46PB',
      });
      expect(resp.status).toBe('pending');
      expect(resp.providerTxId).toBe('txn-stmt');
    });
  });

  it('GetTransferStatus_NotFound', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 404;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.pix.getTransferStatus('nonexistent')).rejects.toBeInstanceOf(
        CorpXTransactionNotFoundError,
      );
    });
  });

  it('GetTransferStatus_Reversed', async () => {
    await withTestAdapter((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          transactionId: 'txn-rev',
          endToEndId: 'e2e-rev',
          status: 'REVERSED',
          transactionDate: '2024-01-15T10:30:00Z',
        }),
      );
    }, async ({ adapter }) => {
      const resp = await adapter.pix.getTransferStatus('e2e-rev');
      expect(resp.status).toBe('failed');
    });
  });

  it('GetTransferStatus_ServiceUnavailable', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 503;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.pix.getTransferStatus('e2e-123')).rejects.toBeInstanceOf(
        CorpXProviderUnavailableError,
      );
    });
  });

  it('GetTransferStatus_Unauthorized', async () => {
    await withTestAdapter((_req, res) => {
      res.statusCode = 403;
      res.end();
    }, async ({ adapter }) => {
      await expect(adapter.pix.getTransferStatus('e2e-123')).rejects.toBeInstanceOf(
        CorpXProviderUnavailableError,
      );
    });
  });

  it('GenerateDynamicPIX_AmountSerializedAsNumber', async () => {
    await withTestAdapter(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = JSON.parse(raw) as Record<string, unknown>;
      expect(typeof body.value).toBe('number');
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          txid: 'tx-1',
          emv: 'emv',
          pixKey: 'key',
          status: 'ACTIVE',
        }),
      );
    }, async ({ adapter }) => {
      await adapter.pix.generateDynamicPIX({
        idempotencyKey: 'test',
        amount: '12345.67',
        expiresAt: new Date(Date.now() + 3600_000),
        correlationId: 'c',
      });
    });
  });

  it('InitiateTED_Unsupported', async () => {
    await withTestAdapter(undefined, async ({ adapter }) => {
      try {
        await adapter.pix.initiateTED({});
        throw new Error('expected initiateTED to reject');
      } catch (e) {
        expect(e).toBeInstanceOf(CorpXProviderUnavailableError);
        expect((e as Error).message).toMatch(/TED not supported/i);
      }
    });
  });

  it('ValidateWebhookSignature_ValidIP', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      expect(adapter.validateWebhookSignature('{}', '10.0.0.1')).toBe(true);
      expect(adapter.validateWebhookSignature('{}', '10.0.0.2')).toBe(true);
    });
  });

  it('ValidateWebhookSignature_InvalidIP', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      expect(adapter.validateWebhookSignature('{}', '192.168.1.1')).toBe(false);
      expect(adapter.validateWebhookSignature('{}', '')).toBe(false);
    });
  });

  it('ProcessWebhookEvent_PIXInReceived', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('pix_in_received', {
        transactionId: 'tx-pix-in-1',
        endToEndId: 'E2E-001',
        amount: 1500.5,
        currency: 'BRL',
        accountId: 'acc-1',
        payerName: 'John Doe',
        payerDocument: '12345678901',
      });
      expect(result.providerTxId).toBe('tx-pix-in-1');
      expect(result.status).toBe('completed');
      expect(result.requiresAction).toBe('update_balance');
      expect(result.updatedFields?.amount).toBe('1500.50');
    });
  });

  it('ProcessWebhookEvent_PIXInReceived_InvalidAmount', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('pix_in_received', {
        transactionId: 'tx-1',
        amount: 0,
      });
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toMatch(/invalid PIX payment/i);
    });
  });

  it('ProcessWebhookEvent_PIXOutCompleted', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('pix_out_completed', {
        transactionId: 'tx-out-1',
        endToEndId: 'E2E-OUT-001',
        amount: 500.0,
        currency: 'BRL',
        status: 'COMPLETED',
      });
      expect(result.providerTxId).toBe('tx-out-1');
      expect(result.status).toBe('completed');
      expect(result.requiresAction).toBe('mark_settlement_complete');
    });
  });

  it('ProcessWebhookEvent_PIXOutFailed', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('pix_out_failed', {
        transactionId: 'tx-fail-1',
        status: 'FAILED',
        errorCode: 'TIMEOUT',
        errorMessage: 'Payment timed out',
      });
      expect(result.providerTxId).toBe('tx-fail-1');
      expect(result.status).toBe('failed');
      expect(result.requiresAction).toBe('mark_settlement_failed');
      expect(result.errorMessage).toBe('Payment timed out');
    });
  });

  it('ProcessWebhookEvent_QRCodePaid', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('qr_code_paid', {
        txid: 'qr-tx-1',
        identifier: 'order-123',
        paidAmount: 150.75,
        endToEndId: 'E2E-QR-001',
        transactionId: 'tx-qr-1',
      });
      expect(result.providerTxId).toBe('qr-tx-1');
      expect(result.status).toBe('completed');
      expect(result.requiresAction).toBe('update_balance');
      expect(result.updatedFields?.amount).toBe('150.75');
    });
  });

  it('ProcessWebhookEvent_UnsupportedEventType', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      const result = adapter.processWebhookEvent('unknown_event', {});
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toMatch(/unsupported event type/i);
    });
  });

  it('HandleBalanceError_AllStatusCodes', async () => {
    await withTestAdapter(undefined, ({ adapter }) => {
      void adapter;
      const cases: { status: number; body: string }[] = [
        { status: 400, body: JSON.stringify({ field: 'id', message: 'invalid' }) },
        { status: 404, body: '{}' },
        { status: 401, body: '{}' },
        { status: 403, body: '{}' },
        { status: 429, body: '{}' },
        { status: 503, body: '{}' },
      ];
      for (const c of cases) {
        expect(() => throwAdapterStatusError('balance query', c.status, c.body)).toThrow();
      }
    });
  });

  it('HandlePIXCashOutError_InsufficientFunds', async () => {
    await withTestAdapter(undefined, () => {
      expect(() =>
        throwPIXCashOutError(
          409,
          JSON.stringify({ code: 'INSUFFICIENT_FUNDS', message: 'not enough balance' }),
        ),
      ).toThrow(CorpXInsufficientFundsError);
    });
  });

  it('HandlePIXCashOutError_Idempotency', async () => {
    await withTestAdapter(undefined, () => {
      expect(() =>
        throwPIXCashOutError(
          409,
          JSON.stringify({ code: 'idempotency_conflict', message: 'duplicate' }),
        ),
      ).toThrow(CorpXIdempotencyConflictError);
    });
  });

  it('MapCorpXStatus', () => {
    expect(mapCorpXStatus('APPROVED')).toBe('submitted');
    expect(mapCorpXStatus('ACCEPTED')).toBe('submitted');
    expect(mapCorpXStatus('PENDING')).toBe('submitted');
    expect(mapCorpXStatus('PROCESSING')).toBe('submitted');
    expect(mapCorpXStatus('COMPLETED')).toBe('completed');
    expect(mapCorpXStatus('TIMEOUT')).toBe('requires_reconciliation');
    expect(mapCorpXStatus('FAILED')).toBe('failed');
    expect(mapCorpXStatus('REJECTED')).toBe('failed');
    expect(mapCorpXStatus('UNKNOWN')).toBe('pending');
    expect(mapCorpXStatus('PENDING_APPROVAL')).toBe('pending_approval');
  });

  it('MapCorpXTransferLookupStatus', () => {
    expect(mapCorpXTransferLookupStatus('COMPLETED')).toBe('completed');
    expect(mapCorpXTransferLookupStatus('PROCESSING')).toBe('pending');
    expect(mapCorpXTransferLookupStatus('PENDING_APPROVAL')).toBe('pending_approval');
    expect(mapCorpXTransferLookupStatus('FAILED')).toBe('failed');
  });

  it('MapCorpXTransactionStatus', () => {
    expect(mapCorpXTransactionStatus('COMPLETED')).toBe('completed');
    expect(mapCorpXTransactionStatus('PAID')).toBe('completed');
    expect(mapCorpXTransactionStatus('PENDING')).toBe('pending');
    expect(mapCorpXTransactionStatus('FAILED')).toBe('failed');
    expect(mapCorpXTransactionStatus('REVERSED')).toBe('failed');
    expect(mapCorpXTransactionStatus('UNKNOWN')).toBe('pending');
  });
});
