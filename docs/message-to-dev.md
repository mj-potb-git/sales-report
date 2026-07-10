# Message to LakbayHub API dev — copy & send

Hi! Kailangan namin ng maliit na dagdag sa LakbayHub Utilities API para sa
sales dashboard. Nasa baba ang detalye — technical na para diretso na sa'yo.

---

**Subject: API request — expose per-payment (invoice) data in the sales report**

Hi [dev],

We're building an operations dashboard that reads the POTB Utilities API
(`potb-utilities-api.lakbayhub.com`). We need one addition to it.

**The problem / why we need this:**

Our sales are counted **per payment, on the date each payment was actually made.**
A member often pays a **Down Payment** first, then the **balance** later — sometimes
in a different month. Example (real record):

- **Krvin Socito** — Travelpreneur (₱14,999): paid ₱3,000 DP on **May 31**, then
  ₱11,999 balance on **June 8**.
- Our report must show **₱3,000 in May** and **₱11,999 in June** — split by the
  real payment date.

Right now `/signups/sales-report` only returns **one `amount_paid` (the total)**
and **one `date_paid`** per member. So:
1. We can't split a DP and its balance into the correct months.
2. Once a member is fully paid, there's **no trace** they ever made a DP, and no
   DP date.
3. About **18 PAID records currently come back with `date_paid: null`**, so those
   sales are invisible in every month view.

**What we're requesting:**

A read-only endpoint that returns **one row per payment** (invoice/transaction),
instead of one row per member:

```
GET /signups/invoices        (or /signups/payments)
```

Fields per payment:

| Field            | Example                | Notes |
|------------------|------------------------|-------|
| `invoice_id`     | `INV-000871`           | unique per payment |
| `email`          | `krvin@example.com`    | links to the member |
| `lead_name`      | `Krvin Socito`         | display |
| `amount`         | `3000`                 | amount of THIS payment only |
| `paid_at`        | `2026-05-31`           | date THIS payment was made |
| `payment_status` | `partial` / `paid`     | |
| `payment_type`   | `down_payment` / `balance` / `full` | if available |
| `package_avail`  | `Travelpreneur Package`| |
| `cluster_name`   | `ACQUISITION - MARTIN` | for coach attribution |

Example response:

```json
{
  "status": true,
  "code": 200,
  "data": [
    { "invoice_id": "INV-000871", "email": "krvin@example.com", "lead_name": "Krvin Socito",
      "amount": 3000,  "paid_at": "2026-05-31", "payment_status": "partial", "payment_type": "down_payment",
      "package_avail": "Travelpreneur Package", "cluster_name": "ACQUISITION - MARTIN" },
    { "invoice_id": "INV-000954", "email": "krvin@example.com", "lead_name": "Krvin Socito",
      "amount": 11999, "paid_at": "2026-06-08", "payment_status": "paid", "payment_type": "balance",
      "package_avail": "Travelpreneur Package", "cluster_name": "ACQUISITION - MARTIN" }
  ]
}
```

**Simpler alternative** (if a whole new endpoint is heavy): just add an
`invoices` array onto each existing `/signups/sales-report` row —

```json
{
  "lead_name": "Krvin Socito", "email": "krvin@example.com",
  "amount_paid": 14999, "date_paid": "2026-05-30", "package_avail": "Travelpreneur Package",
  "invoices": [
    { "amount": 3000,  "paid_at": "2026-05-31", "status": "partial" },
    { "amount": 11999, "paid_at": "2026-06-08", "status": "paid" }
  ]
}
```

**Please keep it consistent with the current API:**
- Same `x-app-key` header auth as `/signups/sales-report`
- Same envelope: `{ status, code, message, data }`
- Same host, so our existing proxy just forwards it

Either shape unblocks us completely.

---

## SECOND ISSUE — `/signups/sales-report` is missing records

Separate from the payment-dates request above, we're also finding **members
who exist in LakbayHub but never appear in `/signups/sales-report`.** Examples
(all confirmed present in our records, absent from the API response):
Kath Gbc, Dor Ban, Ro Ma Sta Maria, Ness Rillera, April Rose Gatbunton Barlis,
Joel ZXian JB Bayas, Olie Joaquin Palmos, Mica Corpuz, Michael Sy.

What we've verified from our side:
- The endpoint currently returns ~255 rows and it DOES include `PENDING`
  payment/account statuses — so it's **not** filtered to paid-only; the missing
  people are absent regardless of status.
- Every other endpoint we've tried (`/signups`, `/payments`, `/invoices`,
  `/transactions`, etc.) returns **500 "Route Not Found"** — so `/signups/
  sales-report` is the ONLY window we have into the data.

**Questions / requests:**
1. **What is the inclusion rule for `/signups/sales-report`?** Why would a
   signed-up or paid member NOT appear? Is it scoped to certain clusters,
   account types, sub-accounts, or does a row require a linked sales-call /
   payment record before it shows?
2. **Please expose a complete list endpoint** that returns **ALL** members /
   signups / payments with no hidden filtering — every stage, every cluster,
   every status — so nothing is silently dropped from our reports.
3. A **lookup-by-email** (`GET /signups/sales-report?email=...` or similar)
   would also let us confirm whether a specific person exists in the system.

Salamat! Let me know kung kailan mo makakayanan or kung may tanong sa data.

— MJ
