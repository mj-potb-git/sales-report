# POTB Operations Console

> Sales + operations dashboard for **Pinoy Online Travel Biz**.
> Built by MJ × Claude. Combines YouCanBook.me, LakbayHub, Meta Ads, and
> Supabase into one live monitoring console.

[![Repo](https://img.shields.io/badge/repo-mj--potb--git%2Fsales--report-1B4F4F)](https://github.com/mj-potb-git/sales-report)

---

## Quick Start

```bash
# 1. Install deps (one-time)
npm install

# 2. Run dev server
npm run dev

# 3. Open in browser
# → http://localhost:5173
```

That's it. Six tabs will be live with real data.

---

## Features

### 📊 Overview tab
Executive summary with greeting, today's revenue, smart alerts, monthly target
progress, top clusters, and live activity feed.

### 📅 Bookings tab
All YouCanBook.me bookings (past + future) with:
- 3-state attendance toggle per booking (Showed / No-Show / Unset)
- **Auto-fill Attendance** dropdown — matches YCBM bookings to LakbayHub paid
  sales by name. Click once to auto-mark 360+ bookings.
- CSV export of any filtered view (Upcoming / Past / Date Range)

### 📈 Operations tab (the big one)
The daily performance matrix mirroring POTB's spreadsheet:

| Section | Rows |
|---|---|
| **SPEND & REVENUE** | Total Ads Spent, Gross Revenue, ROAS, AR%, Leads (Booking Made), Avg CPL, **Profit** |
| **# OF LEADS** | Book an appointment, YCBM (On Day Schedule), Show Up, No-Show, Cancelled, Sales |
| **EFFICIENCY** | CAC, SUR (Show Up Rate), CVR (Conversion Rate) |
| **TIME SLOTS** | Attendees / Bookings per time slot (10AM, 3PM, 7PM, 8PM, 9PM) with % |

Plus:
- **Period selector**: Today / This Week / 14 Days / This Month / 60 Days / 90 Days
- **Period-over-period delta** badges (+12% vs yesterday / vs last week / etc.)
- **Conversion Funnel** visualization (Leads → Bookings → Show-Ups → Sales)
- **Smart Alerts**: 9 types auto-derived from real data

### 👥 Sales tab
Per-agent and per-team analytics. Drill-downs with charts, recent transactions,
package performance, funnel health, cluster status.

### 📋 Reports tab
Raw LakbayHub sign-ups with Daily / Weekly / Monthly / All toggle. Sortable
table + filters + CSV export.

### ⚙️ Settings tab
- **Personalization**: name, role, dashboard title, organization label
- **Business**: monthly sales target (₱)
- **Meta Ads Connection**: live health check + token recovery guide
- **Supabase / YCBM** credentials info

---

## Setup from scratch (new machine)

### 1. Clone

```bash
git clone https://github.com/mj-potb-git/sales-report.git
cd sales-report
npm install
```

### 2. Create `.env` (gitignored)

Copy this template and fill in real values:

```env
# YouCanBook.me
YCBM_ACCOUNT_ID=your-account-uuid
YCBM_API_KEY=ak_your_key_here

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_your_key
SUPABASE_SERVICE_KEY=sb_secret_only_for_scripts

# Meta Ads
META_AD_ACCOUNT_ID=act_1234567890
META_ACCESS_TOKEN=EAAyour_token_here
```

### 3. Initialize Supabase tables (one-time)

Open https://supabase.com/dashboard/project/YOUR_REF/sql/new and run:

- `supabase/seed.sql` — creates `sales_records` + seeds 647 mock rows
- `supabase/attendance.sql` — creates `booking_attendance` table

### 4. Bulk-seed sales data (optional, only if you want mock fallback in Supabase)

```bash
node scripts/seed-supabase.mjs
```

### 5. Start

```bash
npm run dev
```

---

## How to refresh expired credentials

### Meta Ads token (60-day expiry)

1. Go to https://developers.facebook.com/apps/919208254503713/marketing-api/tools/
2. Click **Get Token** with `ads_management`, `ads_read`, `read_insights` checked
3. Copy the new token
4. Open `.env` → replace value of `META_ACCESS_TOKEN`
5. Restart Vite (`Ctrl+C` then `npm run dev`)
6. Go to Settings tab → click **Test** sa Meta Ads Connection panel

### YouCanBook.me API key

1. Settings → API in YCBM dashboard → regenerate key
2. Update `YCBM_API_KEY` sa `.env`
3. Restart Vite

### Supabase keys

- Publishable key → `VITE_SUPABASE_ANON_KEY` (safe to expose)
- Secret key → `SUPABASE_SERVICE_KEY` (server-side only, never browser)
- Rotate via https://supabase.com/dashboard/project/YOUR_REF/settings/api-keys

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Vite + React 18 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Charts | Recharts |
| Icons | lucide-react |
| Data | Supabase JS (`@supabase/supabase-js`) |
| Fonts | DM Sans (Google Fonts) |

---

## Folder structure

See [CLAUDE.md](./CLAUDE.md) for the full file map and architecture notes.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions and formulas.

---

## Troubleshooting

### "Meta error — check token" sa Operations dashboard
Token expired. Follow the Meta refresh steps above. The Settings → Meta Ads
Connection panel has a clickable 6-step recovery guide.

### Show-Up Rate / No-Show all showing 0
Attendance is manually tracked. Go to **Bookings → Auto-fill → Smart Match**
to auto-populate based on LakbayHub sales correlation. Persists across devices
via Supabase.

### "LakbayHub rate-limited"
Normal. The API blocks at ~10 requests per minute. Dashboard auto-backs-off
for 2 minutes and serves last-known data. Will resume automatically.

### Sales tab showing mock data (Team Alpha, Daniel Cruz, etc.)
LakbayHub is unreachable AND Supabase is empty/has mock seed. Wait for
LakbayHub to come back online, or run `node scripts/seed-supabase.mjs` to
refresh the Supabase cache.

### Initial load is slow (2-3 minutes)
YCBM pagination is fetching 90 days of bookings. Once cached in the module,
subsequent loads are instant. Future improvement: cache to Supabase.

---

## License

Internal use only. © 2026 Pinoy Online Travel Biz.
