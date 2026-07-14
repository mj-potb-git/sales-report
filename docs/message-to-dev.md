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
   sales are invisible in every month view. Concrete example — **Leila Jules
   Santamena** (`julessarino98@gmail.com`, cluster `ACQUISITION - MARTIN`):
   `payment_status: PAID`, `account_status: ACTIVATED`, `amount_paid: 14999`,
   but `date_paid: null` AND `sales_call_date: null`. She's fully paid yet
   appears in no dated report. Every PAID row needs a real payment date.

**This data already exists in your admin UI — just not in the API.**

Your LakbayHub member view has an **"Invoice Management"** panel that lists each
member's invoices. Real example — Leila Jules Santamena (`julessarino98@gmail.com`)
shows **2 invoices** in the UI:

| Invoice ID | Amount | Status | Updated |
|---|---|---|---|
| invoice-20260710-170909 | ₱14,999.00 | PENDING | July 10, 2026 |
| invoice-20260710-M83227 | ₱14,999.00 | PAID    | July 10, 2026 |

But the API's `/signups/sales-report` returns her as a single row with
`date_paid: null` and **no `invoices` field at all** — so none of that invoice
detail reaches us. We just need that same Invoice Management data exposed via API.

**What we're requesting:**

A read-only endpoint that returns **one row per payment** (invoice/transaction),
instead of one row per member — essentially the "Invoice Management" list:

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

Strongest example — **Athena Blanco** (`athenablanc76@gmail.com`, Travelpreneur):
in the admin UI she is `Overall Balance: PAID` with **3 invoices** (₱3,000 PAID
Apr 5; ₱11,999 PENDING Jul 10; ₱11,999 PAID Jul 10). She is a real, fully-paid
member — yet she does **not appear at all** in `/signups/sales-report` (searched
all 255 rows by name + email). Her entire ₱11,999 July-10 payment is invisible to us.

What we've verified from our side:
- The endpoint currently returns ~255 rows and it DOES include `PENDING`
  payment/account statuses — so it's **not** filtered to paid-only; the missing
  people are absent regardless of status.
- Members with **recent July-10 invoice activity** (Athena, Leila) are the ones
  missing or date-less — possibly the report is a stale snapshot that isn't
  picking up recent invoice updates. Please confirm whether it's cached/regenerated
  on a schedule.
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

---

## THIRD ISSUE — invoices with `cluster_name: null` (coach attribution)

The new `/signups/invoices` endpoint is great, thank you! One data gap: **56
PAID invoices across 39 members come back with `cluster_name: null`** (and
`cluster_id` null). Without the cluster we can't attribute the sale to a coach,
so they all fall into "Unassigned" instead of under their actual coach.

Examples: **Aura Aurea Banaag** (`aubanaag@yahoo.com`, coach should be Maria),
**Athena Blanco** (`athenablanc76@gmail.com`). Most are from April. These
members are NOT in `/signups/sales-report` either, so we have no other source
to recover the cluster from — it can only be fixed at the invoice.

**The cluster already exists on the member record — the invoice just doesn't
inherit it.** In your admin **User List**, Aura Aurea Banaag's Cluster shows
`ACQUISITION - MARIA`, yet her invoices come back with `cluster_name: null`.
So the member→cluster link is already in your DB; please carry it onto the
invoice rows (the invoice's member/company already resolves to that cluster).
There is also NO user/member/company endpoint exposed to us (all return "Route
Not Found"), so we cannot look the cluster up ourselves — it has to come on the
invoice.

**Request:** please populate `cluster_name` (+ `cluster_id`) on every invoice,
the same way `/signups/sales-report` already does. That's what lets us credit
the sale to the right coach.

**The coach is derivable from the payment link.** In `/signups/sales-report`
the `payment_link_used` maps 1:1 to a cluster/coach — we verified all 15
distinct links map to exactly one cluster (e.g. `.../payment-link/1775638380898`
→ `ACQUISITION - MARIA`, `.../1775700737638` → `ACQUISITION - ANGEL`). So the
simplest fix on your side: **either** set `cluster_name` on the invoice from the
payment link, **or** just **add `payment_link_used` to the `/signups/invoices`
response** and we'll map it to the coach ourselves. This also recovers the
Feb–Mar invoices (~400) that pre-date cluster tagging but still have a payment
link. Right now `/signups/invoices` returns NO payment-link field at all, so we
have no way to tag them.

---

## FOURTH ISSUE — re-clustering a member does NOT update their invoices

When we move a member to a different cluster in the admin **User List** (e.g.
re-tagging someone from an internal `ACQUISITION -` cluster to an `AACIO`
cluster), the change is **not reflected in `/signups/invoices`.** The invoice
rows keep the **old** `cluster_name` / `cluster_id` that was frozen at the time
each payment was made.

Concrete, current example — **Janna Mae Natividad**
(`jannamaednatividad@gmail.com`, Travelpreneur). We have moved her to an **AACIO**
cluster in the User List, but `/signups/invoices?month=2026-06` still returns all
three of her invoices with the OLD cluster:

| invoice_id | amount | paid_at | cluster_name (returned) | cluster_id | sales_type |
|---|---|---|---|---|---|
| invoice-20260610-222941 | 5000 | (pending) | `ACQUISITION - ANGEL` | 4cb69ddd-8762-4310-b9cc-b4bfafac4d8c | internal |
| invoice-20260610-225002 | 5000 | 2026-06-10 | `ACQUISITION - ANGEL` | 4cb69ddd-8762-4310-b9cc-b4bfafac4d8c | internal |
| invoice-20260613-171145 | 9999 | 2026-06-13 | `ACQUISITION - ANGEL` | 4cb69ddd-8762-4310-b9cc-b4bfafac4d8c | internal |

Because our POTB-vs-AACIO split (and coach attribution) reads `cluster_name`
straight off each invoice, her sales stay under POTB/Acquisition even though she
now belongs to AACIO. `sales_type` is likewise still `internal`.

**Request:** when a member's cluster changes, please reflect it on their invoices
via ONE of these (either is fine):
1. **Live-resolve** `cluster_name` / `cluster_id` / `sales_type` on the
   `/signups/invoices` response from the member's **current** cluster (join at
   read-time), instead of returning the value frozen at payment time; **or**
2. **Back-fill** existing invoices' `cluster_name` / `cluster_id` / `sales_type`
   whenever a member is re-clustered.

Either way, once the API returns her under AACIO, our dashboard moves her
automatically — no manual step on our end. This is the behaviour MJ expects:
edit the cluster once in LakbayHub → the sale shows up under the correct team.

---

Salamat! Let me know kung kailan mo makakayanan or kung may tanong sa data.

— MJ
