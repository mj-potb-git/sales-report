# Architecture Decisions

> Living document of design decisions, data flow, and formulas.
> Read this when you need to understand "why" something was built a certain way.

---

## Data flow overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Browser (localhost:5173)                   │
│                                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐    │
│   │ Overview │  │ Bookings │  │   Ops    │  │ Sales/Rpts  │    │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘    │
│        │              │              │               │           │
│        └──────┬───────┴──────┬──────┴───────────────┘           │
│               │              │                                   │
│        ┌──────▼─────┐ ┌──────▼─────┐ ┌─────────────┐            │
│        │useYcbmData │ │useSalesData│ │fetchMetaDaily│           │
│        └──────┬─────┘ └──────┬─────┘ └──────┬──────┘            │
│               │              │              │                    │
└───────────────┼──────────────┼──────────────┼────────────────────┘
                │              │              │
        Vite proxy (.env)      │      Vite proxy (.env)
                │              │              │
   ┌────────────▼────┐   ┌─────▼──────┐  ┌────▼──────────────┐
   │ YouCanBook.me   │   │ LakbayHub  │  │ Meta Marketing API│
   │ /v1/{acct}/...  │   │ utilities  │  │ graph.facebook... │
   └─────────────────┘   └────────────┘  └───────────────────┘

                          ┌──────────┐
                          │ Supabase │ ← sales_records (mock fallback)
                          │          │ ← booking_attendance (cross-device)
                          └──────────┘
```

---

## Why these tech choices

| Decision | Why |
|---|---|
| **Vite over CRA** | 10× faster HMR, Tailwind v4 first-class support, native ES modules |
| **Tailwind v4** | Zero-config, JIT, no postcss step needed |
| **Recharts over Chart.js** | React-native, composable, smaller for our use |
| **Supabase over Firebase** | Postgres = familiar SQL, free tier generous, RLS-based security model |
| **No backend** | Vite dev server proxy is enough for dev; Supabase + browser is enough for prod-style usage |
| **localStorage → Supabase migration** | Attendance now syncs across devices (MJ on laptop, team on phone) |
| **DM Sans font** | Clean sans-serif from Google Fonts, professional but warm |

---

## Why Vite proxy + .env for credentials

**Problem**: YCBM, Meta, and Supabase secret keys must NOT reach the browser.

**Solution**: Vite dev server reads `.env` at startup → server-side proxy injects
auth headers on outgoing requests. Browser only sees `/api/ycbm/*` URLs.

```javascript
// vite.config.js
'/api/ycbm': {
  target: 'https://api.youcanbook.me',
  rewrite: (path) => path.replace(/^\/api\/ycbm/, `/v1/${accountId}`),
  configure: (proxy) => {
    proxy.on('proxyReq', (req) => {
      req.setHeader('Authorization', `Basic ${basic}`)
    })
  },
}
```

For production deployment, swap the dev proxy for an Edge Function or Cloudflare
Worker (same idea, different runtime).

---

## Formula reference (exactly matches MJ's spreadsheet)

```
                              SPEND & REVENUE

Total Ads Spent     = Meta Insights: spend per day
Total Gross Revenue = Σ LakbayHub.sales_amount where date_paid = day
Return On Ads Spent = (Revenue ÷ Spend) × 100         %
AR% (Ads/Revenue)   = (Spend ÷ Revenue) × 100         %
Total # of Leads    = count YCBM bookings where         (per spreadsheet,
  (Booking Made)        raw.createdAt = day              "leads" = bookings created)
Average CPL         = Spend ÷ Total Leads             ₱
Profit              = Revenue − Spend                 ₱   (color-coded ± in UI)

                              # OF LEADS

Total # of Book     = count YCBM bookings created on day
  an appointment
Total # of YCBM     = count YCBM bookings where
  booking (Schedule)    startsAt = day, !cancelled
Total # of Show Up  = count attendance.status='showed' for that day's bookings
Total # of No-Show  = count attendance.status='no_show'
Total # of Cancelled= count YCBM bookings where cancelled=true
Total # of Sales    = LakbayHub record count

                              EFFICIENCY

Actual CAC          = Spend ÷ Sales count             ₱
Actual SUR          = Showed ÷ (Showed + No-Show)     %
Actual CVR          = Sales ÷ Total Bookings          %
```

Implementation: `src/components/SalesDashboard.jsx` → `perDay` reduce.

---

## Key conventions

### Date handling

**Rule:** Always use LOCAL date components (`getFullYear/getMonth/getDate`), not
`toISOString().slice(0,10)`. UTC-based ISO breaks at PHT midnight because PHT is
UTC+8 — local Sep 15 0:00 becomes UTC Sep 14 16:00.

```javascript
// ✅ Correct
function formatDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ❌ Wrong — shifts day in PHT
d.toISOString().slice(0, 10)
```

### Meta `date_preset` values

Meta only accepts specific presets: `last_3d`, `last_7d`, `last_14d`,
`last_28d`, `last_30d`, `last_90d`. For other day counts (e.g. 60), use
`time_range` with explicit since/until.

See `api/meta.js` → `dateRangeQuery(days)`.

### LakbayHub rate limits

Limited to ~10 RPM. Multiple components calling `fetchSalesRecords()` would
hammer the API. Solution in `api/lakbay.js`:

1. **20-second TTL cache** — repeated calls within 20s return cached data.
2. **In-flight dedup** — concurrent calls share one promise.
3. **Rate-limit backoff** — on 429, skip live API for 2 minutes.
4. **Last-known fallback** — serve cached real data instead of mock seed when
   rate-limited.

### Attendance tracking

YCBM has no attendance API. We track manually with two helpers:

1. **Per-booking toggle** in BookingsTab (cycle: unset → showed → no_show → unset)
2. **Auto-fill from sales correlation** — matches first-name + date window:
   - Matched to a paid LakbayHub sale → "Showed"
   - No match (past booking) → "No-Show"
   - Future booking → leave unset

Persists via Supabase `booking_attendance` table with publishable-key RLS.

### Polling intervals

| Source | Why this interval |
|---|---|
| LakbayHub (sales) | **30s** — fast enough for ops monitoring, slow enough to stay under rate limit |
| YCBM (bookings) | **15s** — same |
| Meta (ad spend) | **60s** — Meta data updates slowly (15+ min lag typically) anyway |
| Supabase attendance | **15s** background poll — picks up other users' changes |

All polling pauses when the document is hidden (Page Visibility API) and fires
a catch-up refresh on resume.

---

## Component organization

### `App.jsx` (root)
- Personalized header (settings-driven)
- Tab routing with 6 tabs
- Settings tab is ALWAYS accessible (even during load/error) so credentials can be fixed

### Tab components
Each owns its own data fetching, period state, and rendering. Shared utilities
in `src/api/` and `src/lib/`.

### `sales/` sub-folder
Cards used by SalesAgentsTab and SalesDashboard for analytics widgets.

### `lib/`
- `settings.js` — localStorage-backed config (URL, key, monthlyTarget, userName, role, title, org)
- `attendance.js` — Supabase-backed attendance with offline fallback

---

## Settings architecture

Settings stored in `localStorage` (browser-specific), with `.env` as fallback.

| Setting | Storage | Notes |
|---|---|---|
| Supabase URL + publishable key | localStorage override → .env fallback | Browser-safe |
| Supabase secret key | `.env` only (never localStorage) | Server-side only |
| Monthly target | localStorage | Default ₱1M |
| User name / role / title / org | localStorage | Personalization |
| YCBM / Meta credentials | `.env` only | Vite proxy uses them |

Override origin shown in UI as a badge (`from .env` vs `override`).

---

## Migration notes

### Yesterday's localStorage → Supabase (attendance)

When MJ first marked attendance via Auto-fill, 361 entries went to localStorage.
The new Supabase-backed implementation **auto-migrates** them on first connect:

```javascript
async function migrateLegacyIfAny() {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return
  // Upsert all to Supabase in chunks of 200
  // ...
  localStorage.removeItem(LEGACY_KEY)
}
```

After migration, localStorage is cleared so the next session reads from Supabase.

---

## Common pitfalls and how they were solved

| Bug | Cause | Fix |
|---|---|---|
| Matrix showed 0 for all bookings | UTC date keys ≠ local startsAt | Switched to local YYYY-MM-DD |
| YCBM API only returned 12 future bookings | API paginates 10/page, returns only future by default | `?from=` cursor + iterate progressively |
| Meta 400 on `last_60d` | Only `last_3/7/14/28/30/90d` are valid presets | Switched to `time_range` JSON for non-standard ranges |
| LakbayHub rate-limited after a few minutes | 3 components polling 5-10s each | Shared cache + dedup + backoff |
| Sales tab showed mock data (Team Alpha) | LakbayHub failed → Supabase fallback returned mock seed | Added `lastRealData` in-memory shadow |
| CAC showed ₱0 when no spend | `0 / N = 0` got formatted as ₱0 | Return `null` when spend or denominator is 0 |
| Smart Match cleared on reload | localStorage per-browser | Migrated to Supabase booking_attendance |

---

## Things to consider for future

### Cache YCBM bookings in Supabase
First load currently waits 2-3 min for 90-day pagination. Solution: each
successful fetch upserts to a Supabase `bookings_cache` table. Subsequent loads
read instantly from Supabase, then back-fill any new bookings from YCBM.

### Replace pagination with webhooks
YCBM and LakbayHub probably support webhooks → instead of polling, listen for
new bookings/sales in real time. Would need a small backend (Supabase Edge
Function works) to receive them.

### Production deployment
Currently runs on Vite dev server. For prod:
1. Build with `npm run build` → static `dist/` folder
2. Deploy on Vercel/Netlify
3. Replace Vite proxy with serverless functions for `/api/ycbm`, `/api/lakbay`, `/api/meta`
4. Or use Cloudflare Workers (cheaper, faster cold-start)

### Multi-user
Add Supabase Auth → each sales manager sees only their cluster's data via RLS
policies. Settings can store per-user preferences in a `user_settings` table.

---

## Credits

Built collaboratively by MJ (Sales Skills Development Manager, manifesting GM
2027) and Claude (Opus 4.7, High thinking mode) over ~2 days of Taglish-driven
pair programming. May or may not have involved manifestation. 🚀
