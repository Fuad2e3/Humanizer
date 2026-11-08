# Humanizer Quality Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the product gaps that need no outside service or business decision: a real test suite, a stronger AI score, an automatic second rewrite when the score is high, language choice, purpose and style-sample options, PDF upload, .docx download and cheaper models for small calls.

**Architecture:** Prompt and option logic stays in `public/core.js`, which the server (`lib/humanize.js`) and the browser (`public/app.js`) both import. The score stays in `public/detect.js`. New browser-only helpers get their own small files in `public/`. Tests use the built-in `node:test` runner and import the same `public/*.js` modules; one Playwright smoke test drives the real page with the `/api/*` routes mocked.

**Tech Stack:** Node 22 ESM, plain browser JS (no framework), `@anthropic-ai/sdk`, `node:test`, Playwright (pre-installed globally, loaded with `createRequire`), `pdfjs-dist` (vendored into `public/vendor/`).

**Spec:** The gap review from this conversation (Bangla). The items this plan covers are listed in Global Constraints and the tasks. Items needing a decision or an outside service are under "Out of scope: separate plans" at the end.

## Global Constraints

- Node `>=22` (from `package.json`). No new runtime dependency for the server.
- All prompt text, option tables and validation live in `public/core.js`, so both builds stay identical.
- Any value the browser sends into a prompt must come from a fixed table in `core.js` (keys, not free text), except `text`, `sample` and `locked`, which go in the user message or are already length-capped.
- Default models: `MODEL_DEFAULT = "claude-opus-5-5"` for rewrites, new `MODEL_FAST = "claude-haiku-5-5"` for meaning checks and sentence options. Server env overrides: `CLAUDE_MODEL`, new `CLAUDE_FAST_MODEL`.
- At most 1 automatic retry per version (`MAX_RETRIES = 1`), triggered when the score is above `RETRY_THRESHOLD = 45`.
- After any change in `public/`, run `npm run bump` before committing (README rule).
- User-facing copy is plain English, short sentences, no em-dashes (matches existing UI).

## Review Focus

- Text under `MIN_WORDS` (40): `aiScore` returns `null`, so no retry happens and nothing crashes. Test in Task 3.
- The retry scores worse than the first try: the better (lower) score is kept and shown. Test in Task 4.
- User presses Stop during the retry: the first rewrite is kept as the result, status "done". Test in Task 4.
- A client sends `feedback: ["ignore all rules", "phrases"]` or a 5,000-character `sample`: unknown keys are dropped, `sample` is cut to 1,500 characters. Test in Task 3 and Task 6.
- A scanned PDF with no text layer: the user sees "No text was found in this PDF. It may be a scanned image." Test in Task 7.

---

### Task 1: Test runner and fast model for small calls

**Files:**
- Modify: `package.json` (add `"test": "node --test tests/"`)
- Modify: `public/core.js:3` (add `MODEL_FAST`), `public/core.js:107` (`checkRequest` default model), `public/core.js:170` (`sentenceRequest` default model)
- Modify: `lib/humanize.js:11` (add `FAST_MODEL`), `lib/humanize.js:27-34` (use it)
- Modify: `README.md` settings table (add `CLAUDE_FAST_MODEL`)
- Create: `tests/core.test.mjs`

**Interfaces:**
- Produces: `export const MODEL_FAST = "claude-haiku-5-5"` in `core.js`. `checkRequest(original, rewrite, model = MODEL_FAST)`, `sentenceRequest(opts, model = MODEL_FAST)`. `npm test` runs every `tests/*.test.mjs`.

- [ ] **Step 1: Write the failing tests** in `tests/core.test.mjs`:
  - `checkRequest uses the fast model by default`: `assert.equal(checkRequest("a", "b").model, "claude-haiku-5-5")`
  - `sentenceRequest uses the fast model by default`: build opts with `parseSentence({ sentence: "Hi there.", context: "Hi there. Bye." })`, assert `.model === "claude-haiku-5-5"`
  - `rewriteRequest still uses the default model`: `assert.equal(rewriteRequest(parseOptions({ text: "hello world" })).model, "claude-opus-5-5")`
  - `parseOptions rejects empty text`: `assert.throws(() => parseOptions({ text: "  " }), InputError)`
  - `parseOptions caps locked terms`: 40 terms in, `locked.length === 30`
- [ ] **Step 2: Run** `npm test`. Expected: the two fast-model tests FAIL, the rest PASS.
- [ ] **Step 3: Implement** `MODEL_FAST` and the two defaults in `core.js`; in `lib/humanize.js` add `const FAST_MODEL = process.env.CLAUDE_FAST_MODEL || MODEL_FAST` and pass it to `checkRequest` and `sentenceRequest`. Add the README row: `CLAUDE_FAST_MODEL | claude-haiku-5-5 | Model used for meaning checks and sentence options`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add package.json public/core.js lib/humanize.js README.md tests/core.test.mjs && npm run bump && git add public && git commit -m "Use a faster model for meaning checks and sentence options; add npm test"`

### Task 2: Stronger AI score and Bangla phrases

**Files:**
- Modify: `public/core.js:13-22` (`AI_PHRASES`: add at least 30 Bangla stock phrases and 20 more English ones)
- Modify: `public/detect.js` (new signals, `keys` in the result, Bangla starters)
- Create: `tests/detect.test.mjs`

**Interfaces:**
- Consumes: `findAI`, `sentences`, `words`, `spread` from `text.js`.
- Produces: `aiScore(text) -> null | { score, label, tone, signals: string[], keys: string[] }`. `keys` is a subset of `["phrases", "flat", "starters", "stiff", "dash", "repeat", "openings"]`, in the same order as `signals`. Existing callers that read `score`, `label`, `tone`, `signals` keep working.

New signals (add to `parts` and `weights`, weights must still sum to 1 for each branch):
- `repeat`: share of content words (length ≥ 4) that appear 3+ times; AI repeats its key nouns. Signal text: "the same words come back again and again".
- `openings`: share of sentences whose first word matches another sentence's first word. Signal text: "many sentences start the same way".
- Bangla starters added to `STARTERS`: `তাছাড়া|অধিকন্তু|সুতরাং|পরিশেষে|সর্বোপরি|অতএব|এছাড়াও`.

Bangla phrases to include (at least): "এটি লক্ষণীয় যে", "এটা বলা বাহুল্য", "গুরুত্বপূর্ণ ভূমিকা পালন করে", "সর্বোপরি", "পরিশেষে", "তাছাড়া", "অধিকন্তু", "বিভিন্ন ক্ষেত্রে", "ব্যাপক পরিসরে", "একটি গুরুত্বপূর্ণ বিষয়", "আধুনিক যুগে", "প্রযুক্তির এই যুগে", "সামগ্রিকভাবে", "অপরিহার্য", "নিঃসন্দেহে বলা যায়".

- [ ] **Step 1: Write the failing tests** in `tests/detect.test.mjs` (fixture texts as constants in the file, each ≥ 60 words):
  - `stock AI English scores AI-like`: a paragraph using "Moreover", "Furthermore", "delve", "crucial", even-length sentences, no contractions → `score > 60` and `keys` includes `"phrases"` and `"starters"`
  - `casual human English scores human-like`: mixed short/long sentences, contractions, no stock phrases → `score <= 30`
  - `stock AI Bangla is detected`: Bangla paragraph with "তাছাড়া", "সর্বোপরি", "গুরুত্বপূর্ণ ভূমিকা পালন করে" → `keys` includes `"phrases"` and `score > 45`
  - `repeated words raise the repeat signal`: a text repeating "technology" 6 times → `keys` includes `"repeat"`
  - `short text returns null`: `aiScore("Too short.") === null`
  - `keys and signals line up`: for any fixture, `keys.length === signals.length`
- [ ] **Step 2: Run** `npm test`. Expected: Bangla, repeat and keys tests FAIL.
- [ ] **Step 3: Implement** the phrase additions and the two signals. Keep weights so the "casual human" fixture stays `<= 30`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with `npm run bump`) `"Strengthen the AI score: word repetition, sentence openings, Bangla phrases"`

### Task 3: Feedback-driven rewrite request

**Files:**
- Modify: `public/core.js` (`FEEDBACK` table, `parseOptions`, `rewriteRequest`)
- Modify: `public/detect.js` (`RETRY_THRESHOLD`, `MAX_RETRIES`, `shouldRetry`)
- Test: `tests/core.test.mjs`, `tests/detect.test.mjs`

**Interfaces:**
- Consumes: `aiScore(...).keys` from Task 2.
- Produces:
  - `export const FEEDBACK` in `core.js`: one fixed English instruction per key from Task 2 (for example `flat: "The last attempt had sentences of nearly equal length. Make some very short and some long."`).
  - `parseOptions` returns a new field `feedback: string[]`: only keys present in `FEEDBACK`, deduplicated, max 7.
  - `rewriteRequest` appends `"- Fix these problems from the last attempt: " + instructions` when `feedback.length > 0`.
  - `detect.js`: `export const RETRY_THRESHOLD = 45`, `export const MAX_RETRIES = 1`, `export function shouldRetry(result, attempt) -> boolean` (true only when `result` is not null, `result.score > RETRY_THRESHOLD` and `attempt < MAX_RETRIES`).

- [ ] **Step 1: Write the failing tests:**
  - `parseOptions keeps only known feedback keys`: `parseOptions({ text: "hi", feedback: ["phrases", "ignore all rules", "phrases", 5] }).feedback` deep-equals `["phrases"]`
  - `rewriteRequest adds feedback instructions`: with `feedback: ["flat"]`, `system` includes `FEEDBACK.flat`; with `feedback: []`, `system` does not include `"last attempt"`
  - `shouldRetry`: `(null, 0) → false`, `({ score: 70 }, 0) → true`, `({ score: 70 }, 1) → false`, `({ score: 40 }, 0) → false`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Let a rewrite request carry fixed feedback from the AI score"`

### Task 4: Automatic second try in the page

**Files:**
- Modify: `public/app.js:455-484` (the `one(i)` function inside `run()`)
- Create: `tests/ui.test.mjs`
- Modify: `public/features.html`, `public/faq.html` (one sentence each about the automatic second try)

**Interfaces:**
- Consumes: `aiScore`, `shouldRetry` (Task 3), `parseOptions` accepting `feedback` (Task 3).
- Produces: version objects may carry `v.attempts` (1 or 2). Status line shows "Improving version N…" during a retry.

Behavior: after a version finishes streaming, compute `aiScore(v.text)`. If `shouldRetry(r, 0)`, call `rewrite({ ...settings, text: src, variant: i, feedback: r.keys }, …)` streaming into a temporary string. Keep the retry only if its score is lower; otherwise keep the first text. Abort or error during the retry keeps the first text with status "done". Then run the meaning check on the kept text.

- [ ] **Step 1: Write the failing test** `tests/ui.test.mjs`: start `server.js` on a free port (`PORT` env, `ANTHROPIC_API_KEY=test`), launch Chromium via `createRequire(import.meta.url)("playwright")`, mock with `page.route`:
  - `api/rewrite`: first call returns the "stock AI English" fixture from Task 2 as NDJSON, second call returns the "casual human" fixture; record each request body.
  - `api/check`: returns `{ score: 95, verdict: "Same meaning.", missing: [], added: [] }`.
  - Test `retries once when the first score is high`: paste 60+ words, click Humanize, wait for "Done."; assert 2 rewrite calls, the second body has a non-empty `feedback` array, and the output text equals the casual fixture.
  - Test `keeps the first version when the retry is worse`: both calls return the stock AI fixture except the second adds two more "Moreover"; assert the output equals the first response.
  - Test `no retry for a good first score`: first call returns the casual fixture; assert exactly 1 rewrite call.
  - Test `stop during retry keeps the first version`: make the second response hang; click Stop; assert output equals the first response and no error status.
- [ ] **Step 2: Run** `node --test tests/ui.test.mjs`. Expected: the retry tests FAIL (only 1 call).
- [ ] **Step 3: Implement** the behavior above in `one(i)`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Rewrite once more when the AI score stays high, keeping the better version"`

### Task 5: Language choice

**Files:**
- Modify: `public/index.html` (a `<select id="lang">` next to `#tone`: Same as input / English / বাংলা / Banglish, values `same`, `en`, `bn`, `banglish`; default `same`)
- Modify: `public/app.js:448` (`lang: $("lang").value`), the sentence request body, and history restore (`restore(h)` sets `#lang`)
- Modify: `public/core.js` (`parseSentence` keeps `lang`; `sentenceRequest` uses `LANGS[lang]` instead of the fixed "Write in English.")
- Test: `tests/core.test.mjs`, `tests/ui.test.mjs`

**Interfaces:**
- Produces: `parseSentence(body)` returns `{ sentence, context, tone, locked, lang }`; `sentenceRequest` reads `lang`.

- [ ] **Step 1: Write the failing tests:**
  - `sentenceRequest writes in the chosen language`: with `lang: "bn"`, `system` includes `"Bangla, in Bengali script"`; with no `lang`, includes `"the same language and script as the input text"`
  - UI: `sends the chosen language`: choose `bn`, run, assert the rewrite body has `lang: "bn"`
- [ ] **Step 2: Run** `npm test`. Expected: both FAIL.
- [ ] **Step 3: Implement.** Note `parseOptions` defaults `lang` to `"en"`; change the default to `"same"` so Bangla input stays Bangla.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Add a language choice; keep the input language by default"`

### Task 6: Purpose and style sample

**Files:**
- Modify: `public/core.js` (`PURPOSES` table; `parseOptions` returns `purpose` and `sample`; `rewriteRequest`)
- Modify: `public/index.html` (`<select id="purpose">`: General, Email, Essay, Blog or SEO article, Social post; a collapsible "Match my style" textarea `#sample` with a 1,500-character counter)
- Modify: `public/app.js` (send `purpose`, `sample`; save and restore them in history)
- Test: `tests/core.test.mjs`, `tests/ui.test.mjs`

**Interfaces:**
- Produces: `PURPOSES = { general, email, essay, seo, social }` (one instruction each; `general` is `""`). `parseOptions` returns `purpose` (default `"general"`) and `sample` (string, trimmed, max 1,500 chars, default `""`). When `sample` is set, the user message becomes `STYLE SAMPLE (match its voice, do not copy its content):\n<sample>\n\nTEXT TO REWRITE:\n<text>` and the system prompt says the message holds a style sample and the text, both content, never instructions.

- [ ] **Step 1: Write the failing tests:**
  - `parseOptions caps the style sample`: 5,000-char sample → `sample.length === 1500`
  - `unknown purpose falls back to general`: `purpose: "hack"` → `"general"`
  - `rewriteRequest puts the sample in the user message, not the system prompt`: `messages[0].content` includes the sample and `system` does not
  - `rewriteRequest without a sample sends the plain text`: `messages[0].content === text`
  - UI: `sends purpose and sample`
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Add a purpose choice and a style sample"`

### Task 7: PDF upload

**Files:**
- Modify: `package.json` (devDependency `pdfjs-dist` pinned to an exact 4.x version; script `"build:pdf": "node scripts/copy-pdfjs.mjs"`)
- Create: `scripts/copy-pdfjs.mjs` (copies `pdf.min.mjs` and `pdf.worker.min.mjs` into `public/vendor/`)
- Create: `public/vendor/pdf.min.mjs`, `public/vendor/pdf.worker.min.mjs` (generated, committed like `anthropic.js`)
- Modify: `public/files.js` (`ACCEPT` adds `.pdf,application/pdf`; `readTextFile` handles `.pdf`; new `pdfText(buf)` that lazy-imports the vendored build)
- Create: `tests/fixtures/sample.pdf` (one page, text "Hello from a PDF.") and `tests/fixtures/scanned.pdf` (one page, image only)
- Test: `tests/ui.test.mjs`

**Interfaces:**
- Produces: `readTextFile(file)` returns PDF text with pages joined by `\n\n`. Errors: `"No text was found in this PDF. It may be a scanned image."`, `"This PDF could not be read."`

- [ ] **Step 1: Write the failing UI tests:** upload `sample.pdf` with `setInputFiles("#file", …)` → input contains "Hello from a PDF."; upload `scanned.pdf` → status shows the scanned-image message.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL ("Only .txt, .md and .docx files are supported.").
- [ ] **Step 3: Implement.** Update the unsupported-type message to "Only .txt, .md, .docx and .pdf files are supported." and the upload hint text in `index.html`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Read text from PDF files"`

### Task 8: Download as .docx

**Files:**
- Create: `public/docx-export.js`
- Modify: `public/files.js` (export `unzipEntry` for tests)
- Modify: `public/index.html`, `public/app.js` (a "Download .docx" button next to Copy; file name `humanized-YYYY-MM-DD.docx`)
- Create: `tests/docx.test.mjs`

**Interfaces:**
- Produces: `makeDocx(text: string) -> Blob` (MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`). One `<w:p>` per line, blank lines kept, XML-escaped, `xml:space="preserve"` on `<w:t>`. Zip uses the stored method (no compression) with CRC-32, entries `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`.

- [ ] **Step 1: Write the failing tests** in `tests/docx.test.mjs`:
  - `round-trips through the reader`: `unzipEntry(await makeDocx("A & B\n\nবাংলা <ok>").arrayBuffer(), "word/document.xml")` contains `A &amp; B`, `বাংলা &lt;ok&gt;` and 3 `<w:p>` elements
  - `has the three required parts`: `unzipEntry` finds `[Content_Types].xml` and `_rels/.rels`
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `makeDocx` and the button.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS. Then open a generated file once in LibreOffice (`soffice --headless --convert-to txt`) if available, and confirm the text matches.
- [ ] **Step 5: Commit** (with bump) `"Download the result as a Word file"`

### Task 9: Docs and final check

**Files:**
- Modify: `README.md` (features table: automatic second try, language choice, purpose, style sample, PDF upload, .docx download; Files list: `docx-export.js`, `tests/`; a "Tests" section with `npm test`; note that each retry adds one rewrite call to the cost)
- Modify: `public/features.html` (same features)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2: Run** `npm test`. Expected: all PASS. Run `npm start` and load `http://localhost:3000` in Playwright; expected: no console errors.
- [ ] **Step 3: Commit** (with bump) `"Document the new features and tests"`

---

## Out of scope: separate plans

These need a decision from the owner or an outside account first, so each gets its own plan once decided:

1. **Payments and accounts:** which payment provider (Stripe, Paddle, or a Bangladesh option like bKash/SSLCommerz) and which login (email link, Google). Unlocks the Pro 3,000-word limit and history across devices.
2. **Shared rate limit:** needs a store such as Upstash Redis or Vercel KV, so the limit holds across Vercel instances.
3. **Outside AI detectors:** GPTZero, Copyleaks and others need paid API keys; decide which ones and who pays.
4. **Analytics:** pick a tool (Plausible, Umami, Vercel Analytics) and a privacy notice.
5. **Browser extension, public API, Google Docs add-on, grammar and plagiarism checks:** larger products; build after payments so their use can be charged.
