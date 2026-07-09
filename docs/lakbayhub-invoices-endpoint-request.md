# Feature Request — Invoice / Payment-Level Endpoint (LakbayHub Utilities API)

**To:** maintainer of `potb-utilities-api.lakbayhub.com`
**From:** POTB Operations (MJ)
**Why:** The Operations Dashboard needs to attribute each **payment** to the month
it was actually paid. Right now `/signups/sales-report` returns only the
**aggregate** per customer (one total `amount_paid` + one `date_paid`), so a Down
Payment in May and the balance paid in June both collapse into a single row and a
single date. We cannot split them.

---

## What we need

A read-only endpoint that returns **one row per payment** (invoice / transaction),
not one row per customer.

### Proposed

```
GET /signups/invoices        (or /signups/payments)
```

Optional query params (nice to have, not required):
- `from` / `to` — ISO date range filter on `paid_at`
- `email` — filter to one customer

### Required fields per payment

| Field            | Type            | Example                     | Notes |
|------------------|-----------------|-----------------------------|-------|
| `invoice_id`     | string          | `INV-000123`                | unique per payment |
| `email`          | string          | `krvin@example.com`         | links to the customer in sales-report |
| `lead_name`      | string          | `Krvin Socito`              | for display |
| `amount`         | number          | `3000`                      | amount of THIS payment only |
| `paid_at`        | ISO date/datetime | `2026-05-31`              | date THIS payment was made |
| `payment_status` | string          | `partial` / `paid`          | this payment / running status |
| `payment_type`   | string          | `down_payment` / `balance` / `full` | if available |
| `package_avail`  | string          | `Travelpreneur Package`     | for cross-check |
| `cluster_name`   | string          | `ACQUISITION - MARTIN`      | for coach attribution |

### Example response

```json
{
  "status": true,
  "code": 200,
  "data": [
    {
      "invoice_id": "INV-000871",
      "email": "krvin@example.com",
      "lead_name": "Krvin Socito",
      "amount": 3000,
      "paid_at": "2026-05-31",
      "payment_status": "partial",
      "payment_type": "down_payment",
      "package_avail": "Travelpreneur Package",
      "cluster_name": "ACQUISITION - MARTIN"
    },
    {
      "invoice_id": "INV-000954",
      "email": "krvin@example.com",
      "lead_name": "Krvin Socito",
      "amount": 11999,
      "paid_at": "2026-06-08",
      "payment_status": "paid",
      "payment_type": "balance",
      "package_avail": "Travelpreneur Package",
      "cluster_name": "ACQUISITION - MARTIN"
    }
  ]
}
```

With this, Krvin's ₱14,999 correctly reports as **₱3,000 in May** + **₱11,999 in June**.

---

## Auth / format (match the existing API)

- Same `x-app-key` header auth as `/signups/sales-report`.
- Same envelope: `{ status, code, message, data }`.
- Same base host so the existing proxy just forwards it.

## Minimum viable version

If a full new endpoint is heavy, even adding an **`invoices` array** onto each
existing `/signups/sales-report` row works:

```json
{
  "lead_name": "Krvin Socito",
  "email": "krvin@example.com",
  "amount_paid": 14999,
  "date_paid": "2026-05-30",
  "package_avail": "Travelpreneur Package",
  "invoices": [
    { "amount": 3000,  "paid_at": "2026-05-31", "status": "partial" },
    { "amount": 11999, "paid_at": "2026-06-08", "status": "paid" }
  ]
}
```

Either shape unblocks the dashboard. Thank you!
