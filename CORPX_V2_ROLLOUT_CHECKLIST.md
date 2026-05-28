# CorpX v2 Rollout Checklist

## 1) Environment and credentials
- [ ] Set `CORPX_API_URL` to `https://tenant.api.corpx.com` or `https://tenant.api.corpx.com/v1` (both work; avoid double `/v1` in paths)
- [ ] Set `CORPX_AUTH_URL=https://auth.api.corpx.com`
- [ ] Set new `CORPX_CLIENT_ID` and `CORPX_CLIENT_SECRET` for v2 cutover
- [ ] Confirm `CORPX_TENANT_ID`, `CORPX_ACCOUNT_ID`, and `CORPX_PIX_KEY`
- [ ] Restart app/runtime after env updates

## 2) Authentication smoke checks
- [ ] Trigger one server-side CorpX call and confirm token request succeeds (`/oauth2/token`)
- [ ] Confirm no `invalid_scope` errors (v2 scope is `api2/read api2/write`)
- [ ] Confirm no `403` due to origin mismatch (requests must target `tenant.api.corpx.com`)

## 3) On-ramp functional smoke tests
- [ ] Create quote on `/app/onramp`
- [ ] Lock quote and generate dynamic PIX
- [ ] Confirm QR and copy-paste payload render correctly in PIX panel
- [ ] Confirm countdown and expiration behavior remain consistent
- [ ] Verify error path shows provider error message when CorpX fails

## 4) Webhook and processing checks
- [ ] Confirm `qrcode.paid` webhook is received and accepted by IP allowlist
- [ ] Confirm on-ramp order transitions `awaiting_pix -> pix_received` on payment
- [ ] Confirm downstream BRH sale trigger starts as expected

## 5) Observability and rollback preparation
- [ ] Monitor logs for CorpX 4xx/5xx bursts in first rollout hour
- [ ] Keep previous credentials archived for forensic comparison (do not reuse)
- [ ] Keep support escalation path ready (`support@corpxapi.com`)

