# Repair Pass Tracker — Improvement Plan

Findings from a full review of the app source (frontend, entity schemas, and all 15
backend functions), ordered by priority.

> **Status (2026-07-14):** All non-authentication items have been applied — email
> HTML escaping (1.3), the dashboard/stats/PDF bug fixes (2.1, 2.2, 2.4), token
> caching, targeted post-create sync and skip-unchanged writes (§3), unit tests for
> the sync decision logic, a real README, and GitHub Actions CI (§5, §6).
> Deliberately **not** applied per owner decision: function auth checks (1.1) and
> entity RLS (1.2) — the team relies on open access because Base44 user management
> is cumbersome. Also still open: per-user notification read state (2.3), shared
> Cognosos helper module (§4 — Base44 functions are single-file), and batched
> parallel updates inside the sync loop.

## 1. Security

### 1.1 Unauthenticated backend functions (highest priority)
These functions have **no authentication check** — anyone who discovers the function
URL can call them:

| Function | Risk |
|---|---|
| `syncCognososLocations` | Triggers a full Cognosos fetch + DB writes on demand (quota burn, forced state transitions). Uses `asServiceRole` throughout. |
| `sendSendOutFormEmail` | Sends email through the Resend account with a PDF attachment — spam/quota abuse; also confirms whether a stock number exists. |
| `getDeviceMovements` | Returns live GPS movement history using company Cognosos credentials. |
| `lookupVehicleByStock` | Returns vehicle data from Cognosos unauthenticated. |
| `searchAddresses` | Proxies Mapbox with the company API key (quota burn). |

**Fix:** add the same gate the other functions already use, e.g.

```ts
const user = await base44.auth.me();
if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
```

If `syncCognososLocations` is called by a Base44 scheduled automation that can't pass
user auth, gate it with a shared-secret header (`X-Sync-Key` checked against an env
var) instead of leaving it open.

### 1.2 No row-level security on entities
None of the entity schemas define `rls` rules, so **any registered user** can update or
delete anything — including `AppSettings.alert_email` (redirecting all alerts to an
arbitrary address). At minimum, restrict `AppSettings` writes to admins:

```jsonc
"rls": { "update": { "user_condition": { "role": "admin" } }, "delete": { "user_condition": { "role": "admin" } } }
```

### 1.3 HTML injection in alert emails
User-entered fields (`dealership`, `dealership_address`, `client`, make/model, notes)
are interpolated into email HTML unescaped in `sendSendOutFormEmail`,
`sendDailyStatusReminders`, `sendStatusChangeEmail`, `sendSoldVehicleAlert`, and
`syncCognososLocations`. A typed `<img src=…>` ends up live in the email. Add a small
`escapeHtml()` helper and wrap every interpolated field.

## 2. Correctness bugs

### 2.1 Active passes can silently disappear from the Dashboard
`Dashboard.jsx` fetches `RepairPass.list('-created_date', 200)` and filters
`!archived` client-side. Once total passes (including archived history) exceed 200,
**older still-active passes drop off the dashboard**. Fetch only active ones instead:

```js
base44.entities.RepairPass.filter({ archived: false }, '-created_date', 200)
```

### 2.2 Stats cards count archived vehicles
`StatsCards` receives the unfiltered `passes` array, so the "Returned" tile includes
archived history (within the 200 fetched). Pass the `active` array instead. Consider a
fourth "Sent for Pickup" tile — that status is currently invisible in the stats row.

### 2.3 Notifications are global, not per-user
`Notification` records are shared: when one user opens the bell, `read: true` is
written to the shared records and the notifications show as read **for everyone**.
Either store per-user read state (e.g. a `read_by` array) or create notifications per
user.

### 2.4 PDF base64 conversion can crash on large files
`btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))` in `sendSendOutFormEmail`
spreads the whole byte array as function arguments — this throws `RangeError` once the
PDF is more than ~100KB. Convert in chunks or use a base64 library.

## 3. Performance & cost

- **Full sync after every create:** the Dashboard invokes `syncCognososLocations`
  (fetches *every* application and *every* node from Cognosos) after each new pass.
  Use the targeted `lookupCognososAsset`/`lookupVehicleByStock` for the just-created
  unit instead, and leave full syncs to the schedule.
- **Cognito re-auth on every call:** every function fetches the IdP config and
  re-authenticates on each invocation. Cache the token (module-level variable with
  expiry) — tokens last ~1 hour.
- **Sequential awaits in sync loops:** `syncCognososLocations` and
  `refreshSoldTrackers` update passes and fetch movements one at a time. Batch with
  `Promise.all` in groups of ~10 (the pattern `refreshSoldTrackers` already uses for
  custom fields).
- **Unconditional writes:** every sync writes `last_location_update` to every pass
  even when nothing changed; skip updates when zone/GPS/status are unchanged.

## 4. Maintainability

- **~150 lines duplicated across 8 functions:** `getCognososToken()` + application/node
  pagination are copy-pasted into every Cognosos function. Extract a shared module if
  the platform allows, or at least a single source-of-truth snippet.
- **Duplicated date helpers:** `parseUTC`/`formatET` exist in both `src/lib/time.js`
  and inside functions. Same for the `/left\s*(lot|site)/i` zone regex (7 files) —
  a config drift risk if the zone naming ever changes.
- **Hardcoded values worth moving into AppSettings:** the 1200 m lot-radius GPS
  threshold, the alert `from:` address, the error-report mailto, and the map default
  center.
- **The state machine is untested:** the two-sync `pending_transition` confirm logic,
  zone regex handling, and GPS fallback in `syncCognososLocations` are the riskiest
  code. Extract the decision logic into a pure function (`decideTransition(pass, node,
  movement, settings) → changes`) and unit-test it with Vitest.

## 5. Repo & delivery (now that it's on GitHub)

- Replace the template `README.md` with real docs: what the app does, the four status
  states, required env vars (`COGNOSOS_USERNAME`, `COGNOSOS_PASSWORD`,
  `RESEND_API_KEY`, `MAPBOX_API_KEY`), and which functions run on schedules.
- Add a GitHub Actions workflow running `npm ci && npm run lint && npm run build` on
  every push/PR.
- Consider connecting Base44's native GitHub integration so edits in the Base44
  builder and commits here stay in sync automatically.

## 6. UX polish (smaller)

- Mutations (`create`, `update`, `archive`) have no `onError` handlers — failures are
  silent. Add error toasts via the existing toaster.
- Opening the notification bell instantly marks everything read (N parallel update
  calls); a single "mark all read" action on close, or a bulk update, would be gentler.
- `RepairPassTable` reason column truncates at 160px with only a `title` tooltip;
  the notes column already wraps — consider the same treatment.
