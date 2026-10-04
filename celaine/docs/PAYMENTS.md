# Payment integration boundary

Celaine creates and protects orders but does not collect real money. The client has no endpoint capable of marking an order paid in production.

Choose the payment provider for your actual business, currency, countries and seller-payout model. A provider integration must create its checkout/session using the order's server-calculated total and verify its webhook according to that provider's official rules.

## Trusted adapter contract

Only after verifying the provider's success event should your server-side adapter call:

`POST /api/v1/payments/webhook`

```json
{
  "event_id": "provider-unique-event-id",
  "order_id": "the-existing-celaine-order-id",
  "amount_cents": 3500,
  "currency": "USD",
  "status": "paid"
}
```

Headers:

- `Content-Type: application/json`
- `X-Celaine-Timestamp`: current Unix timestamp in seconds
- `X-Celaine-Signature`: HMAC-SHA256 hex digest of `timestamp + '.' + exact_raw_body`, using `PAYMENT_WEBHOOK_SECRET`

The secret must contain at least 32 characters and remain on trusted servers. The adapter is not a browser component. Re-encoding the JSON after signing changes the signature.

```python
# Example signing inside YOUR trusted adapter; not a public payment endpoint.
import hashlib, hmac, json, time
import httpx

body = json.dumps(verified_event, separators=(",", ":")).encode()
timestamp = str(int(time.time()))
signature = hmac.new(secret.encode(), timestamp.encode() + b"." + body,
                     hashlib.sha256).hexdigest()
response = httpx.post(celaine_api + "/api/v1/payments/webhook", content=body,
    headers={"Content-Type": "application/json",
             "X-Celaine-Timestamp": timestamp,
             "X-Celaine-Signature": signature}, timeout=15)
response.raise_for_status()
```

The API accepts only events within five minutes, checks the original order's amount/currency, deduplicates provider event IDs, enforces active exclusive reservations, and fulfills atomically. A mismatched or expired order returns a conflict and must enter your reconciliation/refund workflow. Do not discard these errors or tell the buyer that access was granted.

Before opening checkout for an exclusive idea, create its reservation. Match provider checkout expiry to the 30-minute reservation. A provider payment after expiry must be refunded or reconciled, not used to sell an exclusive idea twice.

## Development-only simulator

When `DEMO_PAYMENTS=true` in development, the buyer can call `POST /api/v1/orders/{id}/demo-pay`. This does not contact a provider or transfer money. Production startup rejects this configuration, and the endpoint is independently blocked when `ENVIRONMENT=production`.

The hosted React preview uses its own explicitly local simulation. Its license files state that the purchase is simulated.

## Remaining business work

Provider checkout creation, payment capture, tax/fees, refunds, disputed payments, identity verification, seller balances and payouts are outside this source package's implemented payment adapter. Adopt approved license terms for musical material and define credit/publishing splits separately from the idea-access license.
