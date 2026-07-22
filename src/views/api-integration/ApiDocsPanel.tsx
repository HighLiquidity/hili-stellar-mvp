'use client';

import { CodeBlock } from '@/components/CodeBlock';
import { DevNotice } from '@/components/DevNotice';
import { useI18n } from '@/lib/i18n';

const ONRAMP_QUOTE_CURL = `curl -X POST "$BASE_URL/api/v1/onramp/orders/quote" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: quote-$(uuidgen)" \\
  -d '{
    "externalId": "erp-order-12345",
    "taxId": "12345678901",
    "amountBrl": "1000.00",
    "destinationAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "destinationMemo": "optional-for-G-only"
  }'`;

const ONRAMP_QUOTE_CONTRACT_CURL = `curl -X POST "$BASE_URL/api/v1/onramp/orders/quote" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: quote-$(uuidgen)" \\
  -d '{
    "externalId": "erp-order-smart-1",
    "taxId": "12345678901",
    "amountBrl": "1000.00",
    "destinationAddress": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }'`;

const ONRAMP_LOCK_CURL = `curl -X POST "$BASE_URL/api/v1/onramp/orders/$ORDER_ID/lock" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: lock-$(uuidgen)" \\
  -d '{
    "destinationAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }'`;

const ONRAMP_GET_CURL = `curl "$BASE_URL/api/v1/onramp/orders/$ORDER_ID" \\
  -H "Authorization: Bearer $API_SECRET"`;

const ONRAMP_LIST_CURL = `curl "$BASE_URL/api/v1/onramp/orders?page=1&pageSize=25&externalId=erp-order-12345" \\
  -H "Authorization: Bearer $API_SECRET"`;

const OFFRAMP_QUOTE_CURL = `curl -X POST "$BASE_URL/api/v1/offramp/orders/quote" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: quote-$(uuidgen)" \\
  -d '{
    "externalId": "erp-payout-99",
    "amountUsdc": "100.00",
    "payoutPixKey": "email@empresa.com"
  }'`;

const OFFRAMP_LOCK_CURL = `curl -X POST "$BASE_URL/api/v1/offramp/orders/$ORDER_ID/lock" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: lock-$(uuidgen)" \\
  -d '{
    "payoutPixKey": "email@empresa.com"
  }'`;

const OFFRAMP_LIST_CURL = `curl "$BASE_URL/api/v1/offramp/orders?page=1&status=quoted" \\
  -H "Authorization: Bearer $API_SECRET"`;

const WHITELIST_WALLET_POST_CURL = `curl -X POST "$BASE_URL/api/v1/whitelist/wallets" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: wallet-$(uuidgen)" \\
  -d '{
    "address": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "label": "Treasury",
    "memo": "optional-for-G-only"
  }'`;

const WHITELIST_WALLET_LIST_CURL = `curl "$BASE_URL/api/v1/whitelist/wallets?status=pending&page=1&pageSize=25" \\
  -H "Authorization: Bearer $API_SECRET"`;

const WHITELIST_WALLET_DELETE_CURL = `curl -X DELETE "$BASE_URL/api/v1/whitelist/wallets/$REQUEST_ID" \\
  -H "Authorization: Bearer $API_SECRET"`;

const WHITELIST_PIX_POST_CURL = `curl -X POST "$BASE_URL/api/v1/whitelist/pix-keys" \\
  -H "Authorization: Bearer $API_SECRET" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pix-$(uuidgen)" \\
  -d '{
    "pixKey": "email@empresa.com",
    "beneficiaryName": "Empresa Ltda",
    "label": "Payout principal"
  }'`;

const WHITELIST_PIX_LIST_CURL = `curl "$BASE_URL/api/v1/whitelist/pix-keys?status=approved" \\
  -H "Authorization: Bearer $API_SECRET"`;

const WHITELIST_PIX_DELETE_CURL = `curl -X DELETE "$BASE_URL/api/v1/whitelist/pix-keys/$REQUEST_ID" \\
  -H "Authorization: Bearer $API_SECRET"`;

export function ApiDocsPanel() {
  const { t } = useI18n();

  return (
    <div className="api-integration-panel">
      <DevNotice title={t('pages.apiIntegration.docs.devNotice.title')} variant="info">
        <p>{t('pages.apiIntegration.docs.devNotice.body')}</p>
      </DevNotice>

      <p className="surface__lead">{t('pages.apiIntegration.docs.description')}</p>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.authTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.authBody')}</p>
        <CodeBlock code='Authorization: Bearer hili_sk_demo_xxxxxxxx' label={t('pages.apiIntegration.docs.authHeader')} />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.baseUrlTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.baseUrlBody')}</p>
        <CodeBlock code="https://your-domain.example/api/v1" />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.onrampTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.onrampLead')}</p>
        <p>{t('pages.apiIntegration.docs.onrampDestinationHint')}</p>
        <CodeBlock code={ONRAMP_QUOTE_CURL} label={t('pages.apiIntegration.docs.onrampQuote')} />
        <CodeBlock
          code={ONRAMP_QUOTE_CONTRACT_CURL}
          label={t('pages.apiIntegration.docs.onrampQuoteContract')}
        />
        <CodeBlock code={ONRAMP_LOCK_CURL} label={t('pages.apiIntegration.docs.onrampLock')} />
        <CodeBlock code={ONRAMP_GET_CURL} label={t('pages.apiIntegration.docs.onrampGet')} />
        <CodeBlock code={ONRAMP_LIST_CURL} label={t('pages.apiIntegration.docs.onrampList')} />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.offrampTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.offrampLead')}</p>
        <CodeBlock code={OFFRAMP_QUOTE_CURL} label={t('pages.apiIntegration.docs.offrampQuote')} />
        <CodeBlock code={OFFRAMP_LOCK_CURL} label={t('pages.apiIntegration.docs.offrampLock')} />
        <CodeBlock code={OFFRAMP_LIST_CURL} label={t('pages.apiIntegration.docs.offrampList')} />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.whitelistTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.whitelistLead')}</p>
        <p>{t('pages.apiIntegration.docs.whitelistScopesHint')}</p>
        <CodeBlock code={WHITELIST_WALLET_POST_CURL} label={t('pages.apiIntegration.docs.whitelistWalletPost')} />
        <CodeBlock code={WHITELIST_WALLET_LIST_CURL} label={t('pages.apiIntegration.docs.whitelistWalletList')} />
        <CodeBlock code={WHITELIST_WALLET_DELETE_CURL} label={t('pages.apiIntegration.docs.whitelistWalletDelete')} />
        <CodeBlock code={WHITELIST_PIX_POST_CURL} label={t('pages.apiIntegration.docs.whitelistPixPost')} />
        <CodeBlock code={WHITELIST_PIX_LIST_CURL} label={t('pages.apiIntegration.docs.whitelistPixList')} />
        <CodeBlock code={WHITELIST_PIX_DELETE_CURL} label={t('pages.apiIntegration.docs.whitelistPixDelete')} />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.externalIdTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.externalIdBody')}</p>
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.listTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.listBody')}</p>
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.responseTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.responseBody')}</p>
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.errorsTitle')}</h2>
        <ul className="api-prerequisites-list">
          <li>
            <strong>401</strong> — {t('pages.apiIntegration.docs.errors.unauthorized')}
          </li>
          <li>
            <strong>403</strong> — {t('pages.apiIntegration.docs.errors.whitelist')}
          </li>
          <li>
            <strong>400</strong> — {t('pages.apiIntegration.docs.errors.badRequest')}
          </li>
          <li>
            <strong>404</strong> — {t('pages.apiIntegration.docs.errors.notFound')}
          </li>
          <li>
            <strong>409</strong> — {t('pages.apiIntegration.docs.errors.conflict')}
          </li>
          <li>
            <strong>429</strong> — {t('pages.apiIntegration.docs.errors.rateLimit')}
          </li>
        </ul>
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.idempotencyTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.idempotencyBody')}</p>
        <CodeBlock code="Idempotency-Key: your-unique-key-per-attempt" label={t('pages.apiIntegration.docs.idempotencyHeader')} />
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.rateLimitTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.rateLimitBody')}</p>
      </section>

      <section className="api-docs-section">
        <h2 className="api-docs-section__title">{t('pages.apiIntegration.docs.pollingTitle')}</h2>
        <p>{t('pages.apiIntegration.docs.pollingBody')}</p>
      </section>

      <section className="api-docs-section api-docs-section--planned">
        <h2 className="api-docs-section__title">
          {t('pages.apiIntegration.docs.plannedTitle')}
          <span className="api-status-badge api-status-badge--planned">{t('pages.apiIntegration.status.planned')}</span>
        </h2>
        <ul className="api-prerequisites-list">
          <li>{t('pages.apiIntegration.docs.planned.webhooks')}</li>
          <li>{t('pages.apiIntegration.docs.planned.limits')}</li>
          <li>{t('pages.apiIntegration.docs.planned.kyc')}</li>
        </ul>
      </section>
    </div>
  );
}
