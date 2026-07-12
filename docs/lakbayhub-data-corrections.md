# LakbayHub — Per-Record Data Corrections Needed (source-side)

These are specific member/invoice records where the LakbayHub data is wrong or
incomplete, so the dashboard (which faithfully mirrors LakbayHub) shows them
wrong. None of these can be fixed in the dashboard — they must be corrected in
LakbayHub. Running list; MJ forwards to the LakbayHub team.

Verified 2026-07-11.

| # | Member | Email | Issue | Fix in LakbayHub |
|---|---|---|---|---|
| 1 | **Rosalina Palmos** | palmosplace008@gmail.com | Balance invoice recorded ₱49,990 but actual amount received = **₱49,999** (₱9 short). Adventurer, cluster ACQUISITION - ANGEL. | Correct the invoice amount to ₱49,999. |
| 2 | **Vanessa Rillera** | vanessamendozarillera@gmail.com | Invoice has **no `cluster_name`** → shows as "Unassigned" (no coach credit). | Set the member/invoice cluster (coach). |
| 3 | **Aura Aurea Banaag** | aubanaag@yahoo.com | Invoice `cluster_name` is null, though the **User List already shows Cluster = ACQUISITION - MARIA**. Invoice doesn't inherit the member cluster. | Carry the member's cluster (ACQUISITION - MARIA) onto her invoices. |
| 4 | **Janna Mae Natividad** | jannamaednatividad@gmail.com | Tagged **ACQUISITION - ANGEL (internal)** but should be **AACIO**. The internal payment link (`.../1775700737638`) was used instead of Angel's AACIO link (`.../1778641884774`). | Re-tag her cluster to **AACIO ANGEL** (and use the AACIO link going forward). |

## Systemic asks (see message-to-dev.md)
- Populate `cluster_name` on ALL invoices (inherit from the member record) — fixes
  the ~305 "Unassigned" sales at once. #2 and #3 above are instances of this.
- OR add `payment_link_used` to the `/signups/invoices` response so the dashboard
  can map coach + audience (internal vs AACIO) itself and flag mistags like #4.
