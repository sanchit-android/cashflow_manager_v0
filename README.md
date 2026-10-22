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

Tests for the calculation engine and encryption (Node 20+):

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
| Maths | `static/js/engine.js` | Periods (calendar or pay cycle), month verdict, commitments, annual items, runway |
| UI | `static/js/app.js`, `static/css/app.css` | Vault setup, unlock, onboarding, Month / Plan / Accounts / Savings / Settings, 5 themes |

### Encryption in one paragraph
A random data key encrypts every record (AES-256-GCM, record id + type + user bound in as associated data). The vault passphrase (PBKDF2, 600k iterations) and each of three recovery keys wrap their own copy of that key. The server stores only wrapped keys and ciphertext. Changing the passphrase re-wraps the key; data is never re-encrypted. Lose the passphrase and every recovery key and the data is unrecoverable, by design.

## Deploy (free tiers)

1. **Database:** create a Neon project, copy the connection string.
2. **App:** push this repo to GitHub, create a Render *Blueprint* from `render.yaml`, and set `DATABASE_URL`, `DJANGO_ALLOWED_HOSTS` and the `EMAIL_*` variables.
3. **Domain + CDN:** point the domain at Cloudflare (free), proxy to Render, and cache `/`, `/privacy/` and `/static/*`. Never cache `/app` or `/api/*` (the app already sends `Cache-Control: no-store` for those).

## Not built yet (from the spec)

- Google sign-in (add `django-allauth`); email-code login is in place
- Workbook / CSV import (browser-side, SheetJS)
- Year view and charts, checkpoint snapshots and multi-year projections
- Argon2id key derivation (vault stores KDF params, so it can be upgraded per user)
- Opt-in data sharing features (spec §10.7) and passkey unlock
- Rate limiting on login-code requests by IP (currently per email)
