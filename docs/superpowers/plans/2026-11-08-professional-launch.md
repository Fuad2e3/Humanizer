# Professional Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Humanizer ready to sell: accounts (Google and email link), per-plan word limits enforced on the server, a daily quota that holds across server instances, a manual payment flow with an admin page to approve upgrades, privacy and terms pages, security headers, and the leftover fixes from the quality pass.

**Architecture:** Supabase provides login and a Postgres database. The server never uses the Supabase SDK: it verifies a visitor's token with `GET /auth/v1/user` and calls the database through PostgREST with `fetch` and the service-role key, so the server keeps one runtime dependency. All Supabase code on the server sits behind one small module (`lib/supabase.js`) that the account logic receives as a parameter, so tests pass a fake. The browser uses `@supabase/supabase-js`, bundled into `public/vendor/` like the Anthropic SDK. When the Supabase variables are not set, the site runs as it does today: no accounts, and the existing in-memory limit.

**Tech Stack:** Node 22 ESM, plain browser JS, Supabase (Auth + Postgres + RLS), `@supabase/supabase-js` (browser only, vendored with esbuild), `node:test`, Playwright.

**Spec:** Owner decisions in this conversation: payment stays manual for now; login with Google and email link via Supabase; hosting is decided later (the code must work on Vercel and on the local server); site language English only. Product numbers chosen in this plan, owner can change them in one table (`PLANS` in `public/core.js`).

## Global Constraints

- Plans (in `public/core.js`, `PLANS`):
  - `guest` (not signed in): 300 words per rewrite, 1,500 words per day, per IP.
  - `free` (signed in): 500 words per rewrite, 5,000 words per day.
  - `pro`: 3,000 words per rewrite, 100,000 words per day, $9.99 per 30 days.
- A day is the UTC calendar day. Usage counts the input words of every `/api/rewrite` call (each version and each automatic retry counts).
- Pro lasts 30 days from approval (`plan_expires_at`). After that the account is treated as `free` without any job running.
- Admins are the emails in `ADMIN_EMAILS` (comma-separated, compared lower-case).
- New server env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`. The service-role key never reaches the browser. The anon key and URL are public and are sent by `/api/health`.
- IP addresses are stored only as a SHA-256 hash with a server salt (`USAGE_SALT`, falls back to the service-role key).
- Owner-specific text (company name, support email, payment instructions) lives only in `public/site-config.js`, with clear placeholders.
- The GitHub Pages own-key mode keeps working unchanged (no accounts there).
- After any change in `public/`, run `npm run bump` before committing.
- Copy: plain English, short sentences, no em-dashes.

## Review Focus

- A request with an expired or forged token: treated as a guest, never as the account it claims. Test in Task 3.
- Two versions charging the quota at the same moment near the limit: the database function adds atomically, so the total never goes past the limit by more than one call. Test in Task 2 (SQL reviewed) and Task 3 (fake db refuses over-limit).
- Supabase is down or slow during a rewrite: the visitor gets "Accounts are not available right now. Please try again in a moment." and no rewrite runs unmetered. Test in Task 3.
- A non-admin calls `/api/admin`: 403, nothing changes. Test in Task 6.
- A Pro account past `plan_expires_at`: limits fall back to `free`. Test in Task 3.

---

### Task 1: Leftover fixes from the quality pass

**Files:** `public/core.js`, `public/files.js`, `public/app.js`, `public/index.html`, tests in `tests/core.test.mjs`, `tests/ui.test.mjs`

- [ ] **Step 1: Write the failing tests:**
  - `fast-model requests do not ask for a fallback`: `checkRequest("a","b").fallbacks === undefined` and `sentenceRequest(...)` likewise; `rewriteRequest(...)` still has `fallbacks: "default"`.
  - `the sample is wrapped in tags`: with a sample, `messages[0].content` contains `<style_sample>` and `<text_to_rewrite>`, and the system prompt names those tags.
  - `the sample counts toward the word limit`: `parseOptions({ text: 400 words, sample: 200 words }, { maxWords: 500 })` throws `InputError`.
  - `no retry when no signal fired`: `shouldRetry({ score: 50, keys: [] }, 0) === false`.
  - UI `restoring an old entry with lang "en" keeps "Same as input"`: seed `localStorage` history with `settings.lang: "en"`, restore, assert `#lang` is `same`.
  - UI `the options chip counts a style sample`: fill `#sample`, assert the chip shows a style marker (`#lock-count` text ends with `+ style`).
  - UI `a second try is announced`: retry fixture from the quality pass; status contains `Improved on a second try.`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** PDF: wrap the page loop in the same try/catch and `finally { doc?.destroy() }`. Restore maps `lang: "en"` to `same` only for entries that have no `v: 2` marker; new history entries get `v: 2`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Fix leftovers: fallbacks, sample tags and limit, PDF cleanup, retry notice"`

### Task 2: Database schema

**Files:** Create `supabase/schema.sql`. Test: `tests/schema.test.mjs` (static checks).

Tables (all with RLS on):
- `profiles(id uuid pk references auth.users on delete cascade, email text, plan text check in ('free','pro') default 'free', plan_expires_at timestamptz, created_at timestamptz default now())`. Trigger `on auth.users insert` creates the row. RLS: a user can `select` their own row; no client writes.
- `usage(subject text, day date, words int not null default 0, primary key (subject, day))`. No client access.
- `upgrade_requests(id bigserial pk, user_id uuid references profiles, email text, plan text, method text, reference text, status text check in ('pending','approved','rejected') default 'pending', created_at timestamptz default now(), decided_at timestamptz, decided_by text)`. RLS: a user can `select` their own rows; no client writes.
- Function `add_usage(p_subject text, p_words int, p_limit int) returns table(ok boolean, used int)`, `security definer`, executable only by `service_role`: inserts or updates the `(subject, current_date at UTC)` row with `words = words + p_words` only when the result stays `<= p_limit`, in one statement (`insert ... on conflict do update ... where usage.words + excluded.words <= p_limit returning`), and returns `ok=false` with the current total otherwise.

- [ ] **Step 1: Write the failing test** `tests/schema.test.mjs`: reads the file and asserts it contains, for each table, `enable row level security`; `security definer` and `revoke execute on function add_usage` from `public, anon, authenticated`; the `on conflict` update with the `<= p_limit` guard.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (file missing).
- [ ] **Step 3: Write** `supabase/schema.sql`. If `psql` or a local Postgres is available, load it once and call `add_usage` twice past the limit to see `ok=false`; otherwise record that it was not run.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `"Add the Supabase schema: profiles, usage, upgrade requests"`

### Task 3: Server accounts and the daily quota

**Files:** Create `lib/supabase.js`, `lib/account.js`. Modify `public/core.js` (`PLANS`), `api/rewrite.js`, `api/health.js`, `lib/humanize.js` (remove `WORD_LIMIT` use from rewrite). Create `api/me.js`; register in `server.js`. Test: `tests/account.test.mjs`.

**Interfaces:**
- `public/core.js`: `export const PLANS = { guest: { perRewrite: 300, perDay: 1500 }, free: { perRewrite: 500, perDay: 5000 }, pro: { perRewrite: 3000, perDay: 100000, price: 9.99, days: 30 } }`.
- `lib/supabase.js`: `export function createSupabase(env = process.env, fetchFn = fetch) -> null | { getUser(token) -> Promise<{ id, email } | null>, getProfile(id) -> Promise<{ plan, plan_expires_at } | null>, addUsage(subject, words, limit) -> Promise<{ ok, used }>, insert(table, row), select(table, query), update(table, query, patch) }`. Returns `null` when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing. Every call has a 5 s timeout; network or 5xx errors throw `AccountsDownError`.
- `lib/account.js`:
  - `export async function resolveAccount(req, db) -> { kind: "guest" | "user", user: { id, email } | null, plan: "guest" | "free" | "pro", subject: string }`. Reads `Authorization: Bearer <token>`. Invalid token → guest. `pro` with `plan_expires_at` in the past → `free`. Guest subject is `ip:` + SHA-256 of salt + IP.
  - `export async function charge(account, words, db) -> { ok, used, limit }` using `PLANS[plan].perDay`.
  - `export const LIMIT_MESSAGES = { perRewrite(plan, n), perDay(plan) }`: guest and free messages point to signing in or Pro; the Pro message says the daily limit resets at midnight UTC.
- `api/rewrite.js`: when `db` exists: resolve the account, `parseOptions(body, { maxWords: PLANS[plan].perRewrite })`, then `charge`; on `ok: false` answer 429 `{ error, limit: "day", plan }`. When `db` is null: today's behavior.
- `api/health.js`: adds `auth: { url, anonKey } | null` and `plans: PLANS`.
- `api/me.js`: GET → `{ email, plan, planExpires, usedToday, perDay, perRewrite, isAdmin }`, 401 for guests.

- [ ] **Step 1: Write the failing tests** in `tests/account.test.mjs` with a fake `db` object (in-memory maps, no network):
  - `no token is a guest with a hashed IP subject`: subject starts with `ip:` and does not contain the raw IP.
  - `a token the db rejects is a guest`.
  - `a valid token gets the profile plan`: plan `pro`, future expiry → `pro`.
  - `an expired pro falls back to free`.
  - `charge refuses past the daily limit`: free user, charge 4,800 then 300 → second `{ ok: false }`.
  - `accounts down raises a clear error`: fake `getUser` throws `AccountsDownError` → `resolveAccount` rejects with message `"Accounts are not available right now. Please try again in a moment."`
  - `createSupabase returns null without env`.
  - `createSupabase sends the service key and times out`: fake `fetchFn` records headers; a never-resolving fetch rejects with `AccountsDownError` after the timeout (test passes `timeoutMs: 50`).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS, including the quality-pass UI tests (no Supabase env, so behavior is unchanged).
- [ ] **Step 5: Commit** `"Enforce per-plan word limits and a daily quota on the server"`

### Task 4: Sign-in in the page

**Files:** `package.json` (`@supabase/supabase-js` devDependency, exact version; `build:vendor` also bundles `scripts/supabase-entry.mjs` to `public/vendor/supabase.js`), create `public/auth.js`, modify `public/index.html` (Sign in button in the nav, a sign-in `<dialog id="signin">` with "Continue with Google" and an email field, an account menu showing plan and "words left today"), `public/app.js` (send `Authorization` on every `/api/*` call; show the 429 day-limit message with a link to Pricing), `public/styles.css`. Test: `tests/ui.test.mjs`.

**Interfaces:**
- `public/auth.js`: `initAuth({ url, anonKey }) -> Promise<void>`, `signInWithGoogle()`, `signInWithEmail(email) -> Promise<void>` (magic link, `emailRedirectTo` = current page), `signOut()`, `getToken() -> Promise<string | null>`, `onAuthChange(cb)`. All are no-ops when `initAuth` was not called (no `auth` in health).

- [ ] **Step 1: Write the failing UI tests** (mock `/api/health` with `auth: null` and with `auth: { url, anonKey }` pointing at a mocked origin; mock `/api/me`):
  - `no auth config hides the sign-in button`.
  - `with auth config the sign-in button opens the dialog`.
  - `a day-limit 429 shows the upgrade message`: rewrite returns 429 `{ error: "...", limit: "day" }`; status shows the message and a link to `pricing.html`.
  - `a signed-in session sends the token`: put a Supabase session in `localStorage` under the key supabase-js uses, assert the rewrite request has `Authorization: Bearer <token>` and the account menu shows the plan from `/api/me`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Add sign-in with Google or an email link"`

### Task 5: Manual upgrade requests

**Files:** create `public/site-config.js`, `api/upgrade.js` (register in `server.js`), modify `public/pricing.html` (Pro button "Upgrade to Pro"; Team becomes "Contact us" with `mailto:` support email), create `public/pricing.js`. Test: `tests/account.test.mjs`, `tests/ui.test.mjs`.

**Interfaces:**
- `public/site-config.js`: `export const SITE = { name: "Humanizer", company: "YOUR COMPANY NAME", supportEmail: "support@example.com", payment: { methods: [{ id: "bkash", label: "bKash", details: "Send to 01XXXXXXXXX (Personal), reference: your email" }, { id: "bank", label: "Bank transfer", details: "Account details here" }] } }`.
- `api/upgrade.js`: POST `{ method, reference }` (method one of the configured ids or `other`, reference 3–100 chars) → inserts a `pending` row for the signed-in user; guests get 401; a user with a pending request gets 409 "You already have a request waiting for review."; returns `{ ok: true }`.
- `lib/account.js` gains `export async function requestUpgrade(account, body, db)` holding that logic, so it is tested without HTTP.

- [ ] **Step 1: Write the failing tests:** `requestUpgrade` guest → 401 error; bad reference → 400; second pending → 409; valid → row inserted with `status: "pending"`. UI: on Pricing, a signed-out click asks to sign in; a signed-in click shows the payment details from `SITE` and a reference field, and submitting shows "Thanks. We will upgrade your account after we confirm the payment, usually within 24 hours."
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Add manual upgrade requests from the Pricing page"`

### Task 6: Admin page

**Files:** create `api/admin.js` (register in `server.js`), `public/admin.html`, `public/admin.js`; `robots.txt` disallows `admin.html`. Test: `tests/account.test.mjs`, `tests/ui.test.mjs`.

**Interfaces:**
- `lib/account.js`: `export function isAdmin(account, env = process.env) -> boolean`; `export async function listRequests(db, status = "pending")`; `export async function decide(account, { id, action }, db)`: `approve` sets the profile to `pro` with `plan_expires_at` = later of now or the current expiry, plus 30 days (so renewals stack), and marks the request `approved` with `decided_by`; `reject` marks it `rejected`.
- `api/admin.js`: GET → `{ requests }`; POST `{ id, action }` → `{ ok: true }`; non-admins get 403.

- [ ] **Step 1: Write the failing tests:** non-admin → 403 and the fake db is unchanged; approve on a user with 10 days of Pro left → expiry is 40 days out; approve on a free user → 30 days; reject leaves the plan alone. UI: admin page lists a mocked request and clicking Approve sends `{ id, action: "approve" }`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Add an admin page to approve upgrades"`

### Task 7: Privacy, terms and footer

**Files:** create `public/privacy.html`, `public/terms.html` (built from `SITE` placeholders, plain English, clearly marked "Template, have it checked before launch" in an HTML comment and in README); add a footer with Features, Pricing, FAQ, Privacy, Terms and the support email to every page; add both pages to `sitemap.xml`. Test: `tests/ui.test.mjs`.

Privacy page must state: what is collected (email, plan, daily word counts, hashed IP for guests, upgrade references); that text is sent to Anthropic to be rewritten and is not stored on our server; local browser history; how to delete an account (email support). Terms must cover: acceptable use (no academic dishonesty claims, follow your institution's rules), no guarantee of passing AI detectors, manual payments and refunds by email within 7 days if no Pro usage, limits may change.

- [ ] **Step 1: Write the failing UI test:** every page in `public/*.html` has a footer link to `privacy.html` and `terms.html`, and both pages load with no console errors.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** (with bump) `"Add privacy and terms pages and a site footer"`

### Task 8: Security headers

**Files:** `vercel.json` (`headers`), `server.js` (same headers on every response). Test: `tests/ui.test.mjs` (fetch against the local server).

Headers: `Content-Security-Policy` allowing self, `https://api.anthropic.com` and the Supabase URL for `connect-src`, `https://accounts.google.com` not needed (redirect flow), `img-src 'self' data:`, `frame-ancestors 'none'`, `worker-src 'self' blob:`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Because the Supabase URL is per deployment, `connect-src` uses `https://*.supabase.co`.

- [ ] **Step 1: Write the failing test:** `GET /` from the local server has the four headers, and the existing UI tests still pass with the CSP on (no CSP violations reported in the console).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Move any inline `<script>` that the CSP blocks into a file; JSON-LD `<script type="application/ld+json">` is allowed (not executed).
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Send security headers"`

### Task 9: Setup guide

**Files:** create `docs/SETUP.md`; update `README.md` (plans table, env table, links to SETUP.md, `.env.example` gains the new variables).

SETUP.md steps: create a Supabase project; run `supabase/schema.sql` in the SQL editor; turn on Google (with the Google Cloud OAuth client steps) and email providers; set Site URL and redirect URLs; copy URL, anon key and service-role key into Vercel env; set `ADMIN_EMAILS` and `USAGE_SALT`; fill `public/site-config.js`; have the privacy and terms pages checked; how to approve a payment from `/admin.html`.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2: Run** `npm test` and the local server with no Supabase env; load every page in Playwright at 390 px and 1280 px; expected: no console errors and no horizontal scroll.
- [ ] **Step 3: Commit** `"Add the setup guide for accounts and payments"`

---

## Out of scope

- Automatic payments (Paddle, bKash API): the owner chose manual for now. `upgrade_requests` and `decide` are where an automatic provider would plug in later.
- Hosting and domain: decided later; the canonical URLs in `public/*.html` stay as they are.
- History synced across devices, team accounts, outside AI detectors, analytics.
