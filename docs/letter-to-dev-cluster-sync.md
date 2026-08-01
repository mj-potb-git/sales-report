# Letter to LakbayHub dev — cluster edits must reflect in the API

Hi [dev], salamat ulit sa `/signups/invoices` endpoint — malaking tulong 'yon.
May isa akong importanteng request na kailangan namin para tumama ang team
attribution at revenue reports. Technical na ang paliwanag sa baba para diretso.

---

**Subject: Editing a member's Cluster does not reflect in `/signups/invoices`**

**What we need (short version):**
When we change a member's **Cluster** in the admin (User List /
`admin-user/register`), that change must be reflected in the data your API
returns for that member's payments. Right now it is not — the invoices keep the
OLD cluster forever.

**Why this matters to the business:**
Our dashboard splits every sale into **POTB (internal / `ACQUISITION -`)** vs
**AACIO (external / `AACIO ...`, `EXTERNAL COACH - ...`)** and credits each sale
to a coach — purely from the `cluster_name` on each invoice. This feeds our
revenue-per-team and ROAS reporting that management reviews. So when a member is
re-assigned to a different cluster/team, their sales must move with them. Today
they don't, so a sale stays under the wrong team even after we correct the
cluster.

**Concrete, live example — Janna Mae Natividad:**

We moved her to an **AACIO** cluster in the User List. But
`/signups/invoices?month=2026-06` still returns all her invoices with the OLD
cluster:

| invoice_id | amount | paid_at | cluster_name (returned) | sales_type |
|---|---|---|---|---|
| invoice-20260610-222941 | 5000 | (pending) | `ACQUISITION - ANGEL` | internal |
| invoice-20260610-225002 | 5000 | 2026-06-10 | `ACQUISITION - ANGEL` | internal |
| invoice-20260613-171145 | 9999 | 2026-06-13 | `ACQUISITION - ANGEL` | internal |

`cluster_id` on all three is still `4cb69ddd-8762-4310-b9cc-b4bfafac4d8c`
(ACQUISITION - ANGEL), and `sales_type` is still `internal`. It looks like the
invoice stores a **frozen copy** of the cluster from the moment of payment, and
re-assigning the member later does not update it.

**Two things we've confirmed from our side:**

1. **The invoice cluster is frozen at payment time.** It does not follow the
   member's current cluster. (This is the main issue above.)

2. **There is no member/cluster endpoint we can read.** We tried `/members`,
   `/users`, `/companies`, `/clusters`, `/signups/members`, and ~10 more — all
   return `500 Route Not Found`. Only `/signups/invoices` and
   `/signups/sales-report` work. So we cannot look up a member's *current*
   cluster ourselves to correct it on our end — the fix has to be in the API.

   (Heads-up for the join: some members have **more than one email**. Janna's
   payments are under `jannamaednatividad@gmail.com`, while another profile of
   hers uses `triovistaofficial0612@gmail.com`. Whatever you key the
   cluster-resolution on, please base it on the account that actually owns the
   invoices.)

**What we're requesting — either option is fine:**

- **Option A (preferred): live-resolve.** On the `/signups/invoices` response,
  return `cluster_name` / `cluster_id` / `sales_type` from the member's
  **current** cluster (join at read-time), instead of the value frozen at
  payment. This way, one edit in the User List reflects immediately.

- **Option B: back-fill.** Whenever a member is re-assigned to a new cluster,
  update `cluster_name` / `cluster_id` / `sales_type` on that member's existing
  invoice rows.

With either one, editing the cluster once → the sale shows up under the correct
team automatically, no manual work on our side.

Salamat! Let me know kung feasible ito at kung kailan mo makakayanan. 🙏

— MJ
