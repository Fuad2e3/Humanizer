# Professional Launch on Cloudflare with Free AI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Humanizer on Cloudflare with no API key asked from visitors, using free AI (Google Gemini first, Cloudflare Workers AI when Gemini is busy or out of quota), with accounts, per-plan daily limits, manual Pro upgrades, an admin page, legal pages and security headers.

**Architecture:** API handlers become Web-standard `(request, env) -> Response` functions in `lib/handlers/`. Cloudflare Pages Functions (`functions/api/*.js`) call them directly; the local Node server (`server.js`) calls them through a small adapter, so local runs and tests use the same code. All AI calls go through `lib/ai.js`, which tries the providers in order (Gemini, then Workers AI) and returns one shape. Prompt text stays in `public/core.js`, now provider-neutral (`{ system, user, maxTokens, schema }`). Accounts and the daily quota use Supabase over `fetch` (`lib/supabase.js`), passed in as a parameter so tests use a fake. The browser no longer talks to any AI provider: the own-key mode, the key bar and the vendored Anthropic SDK are removed.

**Tech Stack:** Cloudflare Pages + Pages Functions, Workers AI binding (`env.AI`), Gemini REST API (`generativelanguage.googleapis.com`), Supabase (Auth + Postgres + RLS), plain browser JS, `@supabase/supabase-js` (browser only, vendored), `node:test`, Playwright, `wrangler` (dev dependency, for local Pages runs).

**Spec:** Owner decisions in this conversation: host on Cloudflare; use free AI, Gemini and Workers AI, no Claude; payment stays manual; login with Google and email link via Supabase; site in English only. Free-tier limits were checked only through third-party pages (about 1,500 Gemini requests per day, 10,000 Workers AI neurons per day) and must be confirmed in the owner's dashboards.

## Global Constraints

- Providers, in order: `gemini` then `workers-ai`. A provider is skipped when its secret or binding is missing. Fall back to the next one on HTTP 429, 5xx, timeout (25 s) or empty output. A 4xx other than 429 is a bug and is not retried.
- Model names are env settings, never hard-coded in more than one place: `GEMINI_MODEL` (default `gemini-flash-latest`), `WORKERS_AI_MODEL` (default `@cf/meta/llama-3.1-8b-instruct-fast`). Owner confirms both in their dashboards (SETUP.md says how).
- Secrets: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `USAGE_SALT`. Plain vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`, `GEMINI_MODEL`, `WORKERS_AI_MODEL`. Binding: `AI`.
- Plans (`PLANS` in `public/core.js`): `guest` 300 words per rewrite, 1,500 per day per IP; `free` 500 and 5,000; `pro` 3,000 and 100,000, $9.99 per 30 days. UTC day. Every AI call that rewrites counts its input words (versions and retries included). Meaning checks and sentence options do not count words but do count toward a per-minute limit.
- Without Supabase settings the site still runs: guests only, per-IP limits kept in memory (local development).
- The automatic second try stays, but runs only on `pro` (it doubles calls against the free AI quota).
- The privacy page must say that text is sent to Google (Gemini) or Cloudflare (Workers AI) to be rewritten, and that Google may use content sent through its free tier to improve its products.
- Owner-specific text (company, support email, payment details) lives only in `public/site-config.js`.
- After any change in `public/`, run `npm run bump` before committing. Copy: plain English, no em-dashes.

## Review Focus

- Gemini answers 429 (daily quota used up): the same request is answered by Workers AI and the visitor sees a normal result. Test in Task 2.
- Both providers fail: the visitor sees "The AI service is busy right now. Please try again in a few minutes." and the words are not charged. Test in Task 2 and Task 4.
- A model returns JSON wrapped in code fences or with extra text for the meaning check: it is still parsed, and an unparseable answer shows "The meaning check could not be completed." without failing the rewrite. Test in Task 1.
- A forged or expired login token: treated as a guest. Test in Task 4.
- A non-admin calls the admin API: 403, nothing changes. Test in Task 7.

---

### Task 1: Provider-neutral prompts

**Files:** `public/core.js`, `tests/core.test.mjs`

**Interfaces:**
- Produces: `rewritePrompt(opts) -> { system, user, maxTokens: 8000 }`, `checkPrompt(original, rewrite) -> { system, user, maxTokens: 2000, schema: CHECK_SCHEMA }`, `sentencePrompt(opts) -> { system, user, maxTokens: 1500, schema: SENTENCE_SCHEMA }`, `parseJsonReply(text) -> object | null` (strips ```json fences and text around the outermost `{...}`), `readCheck(text)`, `readSentence(text)` now take the reply text. Removed: `rewriteRequest`, `checkRequest`, `sentenceRequest`, `FALLBACK`, `MODEL_DEFAULT`, `MODEL_FAST`, `OWN_KEY_WORD_LIMIT`, `describeError`'s Anthropic branch.
- Leftovers folded in: sample wrapped in `<style_sample>` / `<text_to_rewrite>` tags and counted toward the word limit; `shouldRetry` false when `keys` is empty.

- [ ] **Step 1: Write the failing tests:** each prompt builder's shape; `parseJsonReply('```json\n{"score":90}\n```')` → `{ score: 90 }`; `parseJsonReply('Sure! {"options":["a"]} Hope this helps')` → `{ options: ["a"] }`; `parseJsonReply("nope")` → `null`; `readCheck` clamps score to 0-100 and returns `null` for unparseable text; sample tags and word-limit tests; `shouldRetry({ score: 50, keys: [] }, 0) === false`. Replace the old `*Request` tests.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `parseOptions`, `parseSentence`, `FEEDBACK`, `PURPOSES`, `TONES`, `LANGS`. JSON prompts end with "Reply with only a JSON object matching this schema: <schema JSON>" so models without structured output still comply.
- [ ] **Step 4: Run** `npm test`. Expected: core tests PASS (UI tests may fail until Task 3; note it).
- [ ] **Step 5: Commit** `"Make prompts provider-neutral and parse JSON replies leniently"`

### Task 2: AI providers with fallback

**Files:** create `lib/ai.js`, `lib/providers/gemini.js`, `lib/providers/workers-ai.js`, `tests/ai.test.mjs`

**Interfaces:**
- `gemini.js`: `export function geminiProvider(env, fetchFn = fetch) -> null | { name: "gemini", generate({ system, user, maxTokens, schema }, { onText, signal }) -> Promise<{ text, stop: "end" | "length" }> }`. Uses `POST https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse` when `onText` is given, else `:generateContent`; key in the `x-goog-api-key` header; `systemInstruction`, `generationConfig.maxOutputTokens`, and for a schema `responseMimeType: "application/json"`. Maps `finishReason: "MAX_TOKENS"` to `stop: "length"`.
- `workers-ai.js`: `export function workersAiProvider(env) -> null | { name: "workers-ai", generate(...) }`. Calls `env.AI.run(WORKERS_AI_MODEL, { messages: [{ role: "system", ... }, { role: "user", ... }], max_tokens, stream: Boolean(onText) })`; reads the SSE stream (`data: {"response": "..."}` lines, `[DONE]`).
- `ai.js`: `export class AIBusyError extends Error` with message "The AI service is busy right now. Please try again in a few minutes."; `export function providers(env, fetchFn) -> provider[]`; `export async function generate(prompt, { env, fetchFn, onText, signal, timeoutMs = 25000 }) -> { text, stop, provider }`. Fallback happens only before the first streamed character; once text has streamed, an error ends the stream with the partial text and `stop: "error"`.

- [ ] **Step 1: Write the failing tests** with a fake `fetchFn` and a fake `env.AI`: Gemini success (streamed chunks joined, `onText` called in order); Gemini 429 → Workers AI answers, `provider === "workers-ai"`; both fail → `AIBusyError`; Gemini 400 → error thrown, Workers AI not called; no `GEMINI_API_KEY` → only Workers AI used; timeout → next provider; error after first chunk → partial text, `stop: "error"`, no fallback; the API key is sent in a header, never in the URL.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: AI tests PASS.
- [ ] **Step 5: Commit** `"Add Gemini and Workers AI providers with fallback"`

### Task 3: Web-standard handlers, Cloudflare functions and the local server

**Files:** create `lib/handlers/{rewrite,check,sentence,health,me}.js` (only `rewrite`, `check`, `sentence`, `health` in this task), `lib/http.js` (`json(status, body)`, `ndjsonStream()`), `functions/api/[[route]].js`, `wrangler.toml`; rewrite `server.js` to adapt Node req/res to `Request`/`Response`; delete `api/*.js`, `lib/humanize.js`, `vercel.json`, `public/vendor/anthropic.js`, `scripts/sdk-entry.mjs`, `@anthropic-ai/sdk`; remove the key bar and own-key code from `public/index.html` and `public/app.js`. Tests: `tests/handlers.test.mjs`, existing `tests/ui.test.mjs`.

**Interfaces:**
- Each handler: `export default async function (request, env, ctx) -> Response`, where `ctx` = `{ ai: { generate }, db: supabase | null, ip: string }` built by the router, so tests inject fakes.
- `functions/api/[[route]].js`: `onRequest({ request, env, params })` picks the handler by path, builds `ctx` with the real `generate`, `createSupabase(env)` and the `CF-Connecting-IP` header.
- `server.js`: same router for local runs; reads `.env`; `env.AI` is absent locally unless `wrangler pages dev` is used (README explains).
- `rewrite` streams NDJSON as today: `{"t": "..."}` lines, then `{"done": true, "stop": "end" | "length" | "error", "provider": "..."}`. `app.js` keeps the retry only when `stop === "end"`.
- `health` returns `{ ok: true, providers: ["gemini", "workers-ai"], auth: {...} | null, plans: PLANS }`.

- [ ] **Step 1: Write the failing tests** in `tests/handlers.test.mjs`: call each handler with a `Request` and a fake `ctx`; rewrite streams the fake provider's text; check returns the parsed JSON; a fence-wrapped check reply still parses; an unparseable check reply → 422 with "The meaning check could not be completed."; `AIBusyError` → 503 with its message; non-POST → 405; over the guest word limit → 400.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update `tests/ui.test.mjs` so its mocks match the new done line, and drop UI tests of the own-key mode. Run `npx wrangler pages dev public --compatibility-date=2026-10-01` once if wrangler can start offline; record the result either way.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Move the API to Cloudflare Pages Functions with free AI; drop the API key bar"`

### Task 4: Accounts and the daily quota

As Tasks 2 and 3 of the earlier launch plan (`git show ed90c75:docs/superpowers/plans/2026-11-08-professional-launch.md`), adapted: `supabase/schema.sql` (profiles, usage with atomic `add_usage`, upgrade_requests, RLS on all), `lib/supabase.js` (`createSupabase(env, fetchFn)`), `lib/account.js` (`resolveAccount(request, ctx)`, `charge(account, words, db)`), `lib/handlers/me.js`. In `rewrite`, charge only after the provider returns its first character (so `AIBusyError` charges nothing), and pass `retryAllowed: plan === "pro"` in the `done` line.

- [ ] **Step 1: Write the failing tests:** no token → guest with hashed IP subject; rejected token → guest; expired Pro → free; charge refuses past the daily limit; Supabase down → "Accounts are not available right now. Please try again in a moment."; `AIBusyError` → no charge; schema file has RLS on every table and the `<= p_limit` guard.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `"Add accounts and per-plan daily limits"`

### Task 5: Sign-in in the page

As Task 4 of the earlier launch plan (same commit): vendored `@supabase/supabase-js`, `public/auth.js`, Sign in dialog (Google, email link), account menu with plan and words left, `Authorization` header on every API call, day-limit message linking to Pricing, retry only when the `done` line says `retryAllowed`.

- [ ] Steps 1-5 as in that task, with these UI tests: no auth config hides Sign in; the dialog opens; a signed-in session sends the token and shows the plan; a day-limit 429 shows the upgrade link; a guest run makes no second try even with a high score.

### Task 6: Manual upgrade requests

As Task 5 of the earlier launch plan (same commit) (`public/site-config.js`, `lib/handlers/upgrade.js`, Pricing page form, "Contact us" for Team). Pricing copy for Pro: "3,000 words per rewrite, 100,000 words a day, automatic second try".

### Task 7: Admin page

As Task 6 of the earlier launch plan (same commit) (`lib/handlers/admin.js`, `public/admin.html`, approve adds 30 days to the later of now and the current expiry).

### Task 8: Privacy, terms, footer and security headers

As Tasks 7 and 8 of the earlier launch plan (same commit), with headers in `public/_headers` (Cloudflare Pages format) and in `server.js`. `connect-src` is `'self' https://*.supabase.co` only, since the browser no longer calls any AI provider. Privacy text includes the Gemini and Workers AI wording from Global Constraints.

### Task 9: Leftover fixes and the setup guide

Remaining leftovers (PDF.js cleanup and errors, history `lang` restore, style chip marker, "Improved on a second try." notice), then `docs/SETUP.md`: create the Cloudflare Pages project from GitHub (build command none, output `public`, functions folder auto-detected); add the Workers AI binding `AI`; create a Gemini key in Google AI Studio and check the free limits for the chosen model there; Supabase project, schema, Google and email login, redirect URLs; every secret and var; fill `site-config.js`; how to approve a payment. README: remove the GitHub Pages and Vercel sections; `index.html` at the repo root keeps sending GitHub Pages visitors to `public/`, where a banner points them to the new address once the owner fills `SITE.url`.

- [ ] Final check: `npm test`; every page at 390 px and 1280 px with no console errors and no sideways scroll; one full rewrite through the local server with fake providers.

---

## Out of scope

- Claude, paid AI tiers and automatic payments (owner chose free AI and manual payment for now). `lib/ai.js` is where a paid provider would be added later.
- Custom domain (owner adds it in Cloudflare later; canonical URLs are updated then).
- History synced across devices, team accounts, outside AI detectors, analytics.
