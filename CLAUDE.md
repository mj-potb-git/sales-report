# CLAUDE.md — Project Context for Future AI Sessions

> Auto-loaded by Claude Code when working in this repo. Read this first so you
> can pick up where the last session left off.

---

## TL;DR

**Project:** Operations dashboard for **Pinoy Online Travel Biz** (POTB).
Built for **MJ** (Sales Skills Development Manager, manifesting GM 🚀).
Combines real-time data from **4 sources** into one ops-monitoring console.

**Tech:** Vite + React + Tailwind v4 + Recharts + Supabase + lucide-react.
**Language:** Talk to MJ in **Taglish** (Tagalog + English mix). MJ is Filipino.

**Live URL:** `http://localhost:5173` (local dev).
**Repo:** https://github.com/mj-potb-git/sales-report

---

## The 4 data sources

| Source | What it provides | Auth | Polled |
|---|---|---|---|
| **YouCanBook.me** (YCBM) | Bookings (session schedules) | HTTP Basic via Vite proxy | 15s, paginated 90d back |
| **LakbayHub utilities API** | Sales records (sign-ups, packages, payments) | No auth (rate-limited) | 30s, shared cache + dedup |
| **Meta Marketing API** | Ad spend, leads, impressions | Bearer via Vite proxy | 60s, fetches 180d |
| **Supabase** | sales_records (mock seed) + booking_attendance (real tracking) | Publishable key direct | live + 15s poll |

**All secrets stay in `.env` (gitignored).** The Vite proxy injects auth headers
server-side so the browser never sees the secrets.

---

## The 7 tabs (in nav order)

1. **Overview** — Daily hero, smart alerts, target progress, top clusters, live activity. The "morning coffee" view.
2. **Bookings** — Full YCBM table + CSV export + **Auto-fill attendance** (matches YCBM bookings to LakbayHub sales by name).
3. **Operations** (the main dashboard) — Spreadsheet-style daily matrix matching MJ's POTB Meta Ads spreadsheet. Has period selector (Today / Week / 14d / Month / 60d / 90d) + Smart Alerts + Funnel viz + Time Slots heatmap.
4. **Sales** — Per-agent / per-team analytics, packages, smart insights.
5. **Officers** — Sales Skills Development view: company overview, performance leaderboard with tier badges (Top Performer / Strong / Average / Needs Coaching), coaching priorities, individual drill-down with trends + recent deals. **Currently sources from LakbayHub `sales_closer` field — but 100% of revenue is currently unassigned**. Will be fixed when Fusioo BookingTransactions is integrated (credentials pending).
6. **Reports** — Raw LakbayHub sign-ups report with daily/weekly/monthly toggle + CSV export.
7. **Settings** — Personalization + credential health + Meta connection test.

---

## Matrix sections (Operations tab) — matches MJ's spreadsheet exactly

```
SPEND & REVENUE              # OF LEADS                    EFFICIENCY              TIME SLOTS
- Total Ads Spent            - Total # of Book an appt.   - Actual CAC            - 10AM (att/book)
- Total Gross Revenue        - Total # of YCBM (sched.)   - Actual SUR            - 3PM
- Return On Ads Spent        - Total # of Show Up         - Actual CVR            - 7PM
- AR% (Ads/Revenue)          - Total # of No-Show                                 - 8PM
- Total # of Leads (Book)    - Total # of Cancelled                               - 9PM
- Average CPL                - Total # of Sales
- Profit
```

**ROAS is shown as % (354%, not 3.54x)** per MJ's preference.

---

## Formula reference (matches MJ's spreadsheet)

| Metric | Formula | Source |
|---|---|---|
| Total Ads Spent | `spend` from Meta Insights | Meta Ads |
| Total Gross Revenue | sum of `sales_amount` matching `date_paid` | LakbayHub |
| Return On Ads Spent | `(Revenue ÷ Spend) × 100` | computed |
| AR% (Ads/Revenue) | `(Spend ÷ Revenue) × 100` | computed |
| Total # of Leads (Booking Made) | count of YCBM bookings created that day | YCBM `raw.createdAt` |
| Average CPL | `Spend ÷ Leads` | computed |
| Profit | `Revenue − Spend` | computed |
| Total # of YCBM booking (Schedule) | count of YCBM bookings with `startsAt` that day | YCBM |
| Total # of Show Up | count where attendance status = `showed` | localStorage→Supabase |
| Total # of No-Show | count where attendance status = `no_show` | localStorage→Supabase |
| Total # of Sales | LakbayHub record count | LakbayHub |
| Actual CAC | `Spend ÷ Sales count` | computed |
| Actual SUR | `Showed ÷ (Showed + No-Show) × 100` | computed |
| Actual CVR | `Sales ÷ Bookings × 100` | computed |

---

## File map — where things live

```
src/
├── api/
│   ├── ycbm.js          — YCBM client + paginated fetchBookings + mapBooking
│   ├── lakbayhub.js     — LakbayHub raw client + record mapper
│   ├── lakbay.js        — Sales aggregation + 3-tier fallback chain (LBH → Supabase → mock)
│   │                       Module-level cache with TTL + in-flight dedup + rate-limit backoff
│   ├── meta.js          — Meta Marketing API client (handles last_Nd vs time_range)
│   └── supabase.js      — Lazy client that re-builds when settings change
├── components/
│   ├── App.jsx          — Header (personalized) + tab routing + skeleton/error states
│   ├── TabNav.jsx       — 6 tabs config
│   ├── OverviewTab.jsx  — Executive summary
│   ├── BookingsTab.jsx  — Table + Auto-fill dropdown + CSV export
│   ├── SalesDashboard.jsx — Operations matrix (THE big one, ~700 lines)
│   ├── SalesAgentsTab.jsx — Agent/team drill-downs
│   ├── ReportsTab.jsx   — Daily/weekly/monthly sign-ups report
│   ├── SettingsTab.jsx  — Credentials + Meta health + personalization fields
│   ├── BookingCard.jsx, AttendanceToggle.jsx, LiveIndicator.jsx — small UI components
│   └── sales/           — Sub-components for analytics tab + alerts
│       ├── TodaySnapshot.jsx, TargetProgress.jsx, SmartInsights.jsx
│       ├── FunnelHealth.jsx, PackagePerformance.jsx, LiveActivityFeed.jsx
│       ├── ClusterHealth.jsx, OpsAlerts.jsx, DeltaBadge.jsx
│       └── MetaConnectionStatus.jsx
├── hooks/
│   ├── usePolling.js     — Generic poller with Page Visibility pause/resume
│   ├── useYcbmData.js    — Wraps fetchBookings + profiles
│   └── useSalesData.js   — Wraps fetchSalesRecords
├── lib/
│   ├── settings.js       — localStorage-backed settings (URL, key, target, userName, etc.)
│   └── attendance.js     — Supabase-backed attendance with localStorage offline cache + inferAttendance
├── data/
│   └── mockSalesData.js  — Seed data (used only when LakbayHub + Supabase both fail)
└── ...

supabase/
├── seed.sql              — sales_records table + 647 mock rows
└── attendance.sql        — booking_attendance table

scripts/
├── generate-seed-sql.mjs — Regenerates supabase/seed.sql from mock data
└── seed-supabase.mjs     — Bulk-loads mock data into Supabase

vite.config.js            — Three proxies: /api/ycbm, /api/lakbay, /api/meta
.env (gitignored)         — All credentials
```

---

## MJ's personalization (already saved in settings)

- **Name:** MJ
- **Role:** Sales Skills Development Manager (with GM aspiration)
- **Dashboard title:** Operations Console
- **Org label:** POTB · Pinoy Online Travel Biz
- **Monthly target:** ₱1,000,000 (editable in Settings → Personalization)

---

## Known constraints

- **LakbayHub API rate-limits** at roughly 10 RPM. Don't poll faster than 30s and use the shared cache in `lakbay.js`.
- **YCBM API paginates 10 records/page** — first fetch of 90d window takes 2-3 minutes. After that, module cache makes subsequent calls instant.
- **Meta API token** is currently a 60-day user token (expires ~July 26, 2026). For permanent: needs a System User token (Meta's new UI hides System Users for some accounts — try Business Settings or use the 60-day token rotation).
- **Meta date_preset** only accepts `last_3d/7d/14d/28d/30d/90d`. For other day counts, `meta.js` automatically uses `time_range` with explicit since/until.

---

## What's pending / not done

- [ ] **Fusioo integration** — MJ to register an app at https://app.fusioo.com/integrations (Credentials Grant), add `FUSIOO_CLIENT_ID`, `FUSIOO_CLIENT_SECRET`, `FUSIOO_APP_ID=b549c26f3ff64497b314a14d26d8cd2e` to .env. Then build a Vite proxy + client + integrate into Officers tab so Account Officer attribution actually works. Will give Sales Skills Development a real signal instead of 100% Unassigned.
- [ ] Cache YCBM bookings in Supabase (eliminates the 2-3 min initial fetch)
- [ ] Custom date range picker (currently only presets)
- [ ] Trend charts of Profit/ROAS over time
- [ ] Daily auto-email digest at 8 AM
- [ ] Multi-user login with role-based views
- [ ] Hourly heatmap (when actual session timestamps become available)

---

## Conventions to follow

- **Speak Taglish** to MJ.
- **Currency:** PHP (₱), formatted via `formatPHP` / `formatPHPCompact` from `api/lakbay.js`.
- **Date keys:** Always use LOCAL components (`y-m-d` from `getFullYear/getMonth/getDate`). UTC ISO breaks at PHT midnight.
- **Secrets:** Never paste in chat. Edit `.env` directly in editor. Vite proxies inject them server-side.
- **Show-up data:** Sourced from manual marking in Bookings tab → Auto-fill → Smart Match (matches YCBM bookings to LakbayHub paid sales by first name). 30 showed / 331 no-show in the seeded data.
- **Polling intervals:** Sales 30s, YCBM 15s, Meta 60s, Attendance 15s.
- **Tasks:** Use TaskCreate/TaskUpdate to track multi-step work.

---

## Useful references

- Repo: https://github.com/mj-potb-git/sales-report
- Supabase project: `qvufabzpwcbafutaalbw` (https://supabase.com/dashboard/project/qvufabzpwcbafutaalbw)
- Meta App ID: `919208254503713` (POTB DASHBOARD)
- Meta Ad Account: `act_1179475260260170` ([Internal] PINOY ONLINE TRAVEL BIZ)
- YCBM Account: `bd78f8c7-d81e-4f64-9273-f7c26c9db840`

When in doubt, check the latest commit on `main` — every change is in a descriptive commit message.
