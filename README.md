# cashflow_manager_v0

Personal cash-flow planner. Django serves the pages and an API that stores **only encrypted records**. All calculations happen in the browser after the user unlocks their vault.

Spec: see `cashflow-app-spec-v4.md` in the Cash flow App project.

## Run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# .env.example lists the settings; export any you need (defaults work for local dev)
export DJANGO_DEBUG=1
python manage.py migrate
python manage.py runserver
```

Open http://localhost:8000 → Sign in. In dev, the email login code prints in the terminal running `runserver`.

> If `migrate` complains the models don't match the migration, run `python manage.py makemigrations core` and commit the result. (The initial migration was hand-written because the build machine couldn't install Django.)

Tests for the calculation engine, encryption and importers (Node 20+):

```bash
npm test
```

## How it fits together

| Layer | Files | Notes |
|---|---|---|
| Pages | `templates/` | Landing, privacy, login, app shell. Landing and privacy are plain HTML for SEO. |
| API | `core/views.py`, `core/urls.py` | Email-code login, vault key material, encrypted record sync, delete account |
| Data | `core/models.py` | `LoginCode`, `Vault`, `VaultKey`, `Record` (ciphertext + type + period only) |
| Encryption | `static/js/crypto.js` | WebCrypto: AES-256-GCM records, PBKDF2-SHA256 passphrase, HKDF recovery keys |
| Sync | `static/js/store.js` | Pull/push, version conflicts, remembered key in IndexedDB (non-extractable) |
| Maths | `static/js/engine.js`, `static/js/plan.js` | Periods, month verdict, commitments, annual items; year view, projections, checkpoints |
| Grid and charts | `static/js/grid.js`, `static/js/cells.js`, `static/js/charts.js` | Excel-like grid (formulas, paste, undo, autofill); SVG charts with hover |
| UI | `static/js/app.js`, `static/css/app.css` | Vault setup, unlock, onboarding, Month / Plan / Accounts / Savings / Settings, 5 themes |

### Encryption in one paragraph
A random data key encrypts every record (AES-256-GCM, record id + type + user bound in as associated data). The vault passphrase (PBKDF2, 600k iterations) and each of three recovery keys wrap their own copy of that key. The server stores only wrapped keys and ciphertext. Changing the passphrase re-wraps the key; data is never re-encrypted. Lose the passphrase and every recovery key and the data is unrecoverable, by design.

## Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application.
2. Authorised redirect URIs: `https://<your-host>/auth/google/callback` (add `http://localhost:8000/auth/google/callback` for local dev).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears only when both are set.
4. OAuth consent screen: user type External, scopes `openid` and `email` only.

Accounts are one per email. If someone first signed up with an email code and later uses Google with the same verified address, they are asked to link Google to that account (keeping all their data); after that, Google signs them straight in. Links are stored by Google's stable account id in `GoogleIdentity`.

No Google scripts are loaded in our pages; the flow is a server-side redirect, so the strict CSP stays intact.

## Import

Import tab → choose a `.csv` or `.xlsx`. Files are parsed in the browser and never uploaded.

- **Any bank/card export:** map date, description, amount (or debit/credit) and category columns, preview, import.
- **Monthly finances workbook** (sheets named like `Oct 26` with Inflows / Cash - Planned / Cash - Unplanned / card blocks / Annual Expenses Summary): detected automatically. Every month is reconciled against the sheet's closing balance before you import.
- Every import can be undone from the same tab.

## Year, savings and checkpoints

- **Year tab:** months across, metrics down (your old Cashflow sheet): regular income, additional inflow, monthly spending, annual items, net monthly burn, total out, invested, balances, editable notes. Chart of spending and annual items against regular income.
- **Savings tab:** projection of liquid savings month by month to a horizon year from editable assumptions (monthly burn and its yearly growth, annual items and their growth, holiday budget). Shows committed spending by year, the gap, and the month money runs out.
- **Checkpoints:** dated snapshots of liquid savings, committed spending and long-term holdings, edited in the grid. A new checkpoint carries holdings forward from the previous one and recalculates commitments. The latest checkpoint is the projection's starting balance.
- The workbook importer also brings in the Checkpoint sheet, the Cashflow sheet's notes, money lent to people listed as "Credit - …", and treats inflow lines after the first (rent) as one-off.

## Admin dashboard

Signed in as the owner (`OWNER_EMAIL`, default `pravaha.ai@gmail.com`), the app shows an extra **Admin** tab with three views:

- **Business:** new vs returning users, daily/weekly/monthly actives, activation funnel, weekly retention, screens and what-ifs used, records added, depth of use, most active users.
- **Technical:** health checks, traffic and where it comes from (search, AI assistants, social, other sites, campaigns), landing pages, crawlers and AI bots, 404s, endpoint timings and errors, browser errors, email sign-in health, database size against the free-tier limit (`DB_SIZE_LIMIT_MB`, default 512), cold starts.
- **Admins:** add or remove admins by email. The owner can't be removed.

Code: `core/monitor.py` (middleware and APIs), `static/js/admin.js` (dashboard), `static/js/track.js` (usage counts sent by the app: fixed labels only, never content). Monitoring tables trim themselves (page views and errors after 90 days).

## Deploy (free tiers)

1. **Database:** create a Neon project, copy the connection string.
2. **App:** push this repo to GitHub, create a Render *Blueprint* from `render.yaml`, and set `DATABASE_URL`, `DJANGO_ALLOWED_HOSTS` and the `EMAIL_*` variables.
3. **Domain + CDN:** point the domain at Cloudflare (free), proxy to Render, and cache `/`, `/privacy/` and `/static/*`. Never cache `/app` or `/api/*` (the app already sends `Cache-Control: no-store` for those).

## Not built yet (from the spec)

- Argon2id key derivation (vault stores KDF params, so it can be upgraded per user)
- Opt-in data sharing features (spec §10.7) and passkey unlock
- Rate limiting on login-code requests by IP (currently per email)
