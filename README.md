# Repair Pass Tracker

Internal dashboard for Carolina Auto Auction that tracks vehicles sent out to
dealerships on repair passes, using [Cognosos](https://www.cognosos.com/) GPS
trackers for live location and automatic status changes.

Built on [Base44](https://base44.com) (React + Vite frontend, Deno backend
functions, Base44 entities for data).

## What it does

- **Dashboard** — live table of active repair passes with location, zone, time
  out, notes, and quick status actions. Polls every 15 seconds.
- **Automatic status transitions** — a scheduled Cognosos sync moves vehicles
  through `pending_departure → out → returned` based on geofence zones and GPS,
  requiring the same signal on two consecutive syncs before committing (see
  `computeSyncChanges` in `base44/functions/syncCognososLocations/entry.ts`).
- **Email alerts** (via Resend) — departure/return/pickup notices, daily status
  reminders, sold-vehicle-left-with-tracker alerts, tracker-found alerts, and a
  Send Out Form PDF generator.
- **Sold Trackers** — finds sold vehicles that left the lot with a tracker still
  attached so the hardware can be recovered.
- **History** — archived (completed) repair passes with search.

## Repository layout

| Path | Contents |
|---|---|
| `src/pages/` | Dashboard, History, Sold Trackers, Settings, auth pages |
| `src/components/repair/` | Repair-pass table, form, stats, detail dialog, map |
| `src/components/ui/` | shadcn/ui component library |
| `base44/entities/` | Entity schemas (RepairPass, SoldTracker, TrackerStatus, …) |
| `base44/functions/` | Deno backend functions (Cognosos sync, email alerts, PDF export) |
| `tests/` | Vitest unit tests for the sync decision logic |

## Backend environment variables

Set these as function secrets in the Base44 dashboard (never commit them):

| Variable | Used for |
|---|---|
| `COGNOSOS_USERNAME` / `COGNOSOS_PASSWORD` | Cognosos API login (GPS/zone data) |
| `RESEND_API_KEY` | Sending alert emails |
| `MAPBOX_API_KEY` | Address autocomplete in the send-out form |

## Local development

1. `npm install`
2. Create `.env.local`:

   ```
   VITE_BASE44_APP_ID=your_app_id
   VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
   ```

3. `npm run dev`

Other scripts: `npm run lint`, `npm test`, `npm run build`.

CI (GitHub Actions) runs lint, tests, and a production build on every push.

## Editing

The app can be edited in the [Base44](https://base44.com) builder or directly
in this repository. With Base44's [GitHub integration](https://docs.base44.com/Integrations/Using-GitHub)
connected, changes made in the builder are pushed here automatically and
commits here appear in the builder.
