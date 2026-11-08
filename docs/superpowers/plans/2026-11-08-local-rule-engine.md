# Local Rule Engine ("Quick" mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite AI-sounding text with fixed rules that run in the visitor's browser, with no AI, no API key, no server and no cost, so the GitHub Pages site works for everyone without the API key bar.

**Architecture:** A new pure module `public/rules.js` (tables in `public/rules-data.js`) turns text into a rewrite in passes: protect what must not change, replace stock phrases, swap stiff words, drop linking-word openers, add contractions, fix dashes, then vary sentence rhythm. A seeded random choice picks between alternatives, so versions 1-3 differ and the same seed always gives the same output. The page runs the engine locally by default. The existing AI path stays in the code and is offered only when a server with a key is present (`api/health`); the own-key bar is removed.

**Tech Stack:** Plain browser JS (ES modules), `node:test`, Playwright. No new dependencies.

**Spec:** Owner request in this conversation: drop paid AI; use pattern matching on the user's sentences so the text no longer reads as AI; remove the API key bar. Owner accepted that this is weaker than an AI rewrite (stated in the handoff message).

## Global Constraints

- Quick mode makes no network request. The text never leaves the browser (say so in the FAQ and on the page).
- Never insert invisible characters, look-alike letters (homoglyphs), random typos or filler that changes meaning. Output must pass `!/[​-‏‪-‮⁠-⁤﻿]/.test(out)` and contain only characters already in the input plus ASCII letters, digits and punctuation from the rule tables (and Bengali letters for Bangla rules).
- Every number, locked term, URL, email address, `@mention`, `#hashtag` and text inside quotation marks or backticks comes out exactly as it went in.
- Strength levels: `light` = phrases + word swaps; `medium` = light + opener removal + contractions + dashes; `strong` = medium + sentence splits and merges.
- Tone `formal` and `academic` never add contractions; `casual` and `blog` may use the casual alternatives ("And", "Plus") for openers.
- English rules apply only to Latin-script sentences; Bangla rules only to Bengali-script sentences.
- The score is renamed "AI pattern score" everywhere, with the note "Based on writing patterns. Detectors such as GPTZero or Turnitin may score differently." The engine targets the same patterns the score reads, so the page must not claim the result will pass any detector.
- Speed: a 30,000-character input finishes in under 200 ms in Node.
- After any change in `public/`, run `npm run bump` before committing. Copy: plain English, no em-dashes.

## Review Focus

- A locked term that contains a swap word ("Robust Systems Ltd"): left untouched. Test in Task 1.
- Deleting an opener or phrase at the start of a sentence: the next word is capitalized and no ", ," or double space is left. Test in Task 1.
- "whatever it is." / "Yes, it is!": not contracted, because a contraction cannot end a clause. Test in Task 1.
- Text with no AI patterns (the casual fixture): changes fewer than 5% of words. Test in Task 3.
- A sentence starting with a proper noun is never lower-cased by a merge ("Dhaka is big. Rahim lives there." stays two sentences or keeps "Rahim"). Test in Task 2.

---

### Task 1: Rule tables and the word-level passes

**Files:** create `public/rules-data.js`, `public/rules.js`, `tests/rules.test.mjs`

**Interfaces:**
- `rules-data.js` exports:
  - `PHRASES: Array<[pattern: string, options: string[]]>`: one row per stock phrase, options are plain replacements, `""` means delete. Must cover every English entry of `AI_PHRASES` in `core.js` (a test checks this), for example `["it is important to note that", [""]]`, `["plays a crucial role in", ["matters a lot for", "is key to"]]`, `["in today's fast-paced world,", ["", "These days,"]]`, `["a wide range of", ["many", "all kinds of"]]`, `["in conclusion,", ["", "So,", "In short,"]]`.
  - `WORDS: Array<[word, options]>` for single stiff words: `utilize→use`, `leverage→use`, `delve into→look at/dig into`, `robust→strong/solid`, `seamless→smooth`, `foster→build/encourage`, `crucial→key/important`, `pivotal→key`, `facilitate→help`, `commence→start`, `numerous→many`, `individuals→people`, `in order to→to`, `due to the fact that→because`, `ensure→make sure`, `showcase→show`, `underscore→show`, `transformative→big`, `myriad of→lots of`, `plethora of→plenty of` (at least 40 rows).
  - `OPENERS: Record<string, { neutral: string[], casual: string[] }>` for `Moreover`, `Furthermore`, `Additionally`, `In addition`, `Notably`, `Importantly`, `Consequently`, `Ultimately`, `Overall`, `Thus`; `neutral` always includes `""` (drop).
  - `CONTRACTIONS: Array<[full, short]>`: it is, that is, there is, do not, does not, did not, is not, are not, was not, cannot, will not, would not, should not, they are, we are, you are, I am, it will, we will, they will.
  - `BN_PHRASES`: Bangla rows for every Bangla entry of `AI_PHRASES` (for example `উল্লেখ্য যে → ""`, `পরিশেষে বলা যায় → শেষে বলি`, `তাছাড়া → আর`, `অধিকন্তু → আর`, `সর্বোপরি → সবচেয়ে বড় কথা`, `নিঃসন্দেহে → অবশ্যই`, `বর্তমান যুগে → এখন`, `গুরুত্বপূর্ণ ভূমিকা পালন করে → অনেক কাজে লাগে`).
- `rules.js` exports:
  - `rng(seed: number) -> () => number` (mulberry32).
  - `protect(text, locked: string[]) -> { text, restore(s) -> string }`: swaps numbers, locked terms, URLs, emails, `@x`, `#x`, `"..."`, `“...”` and backtick spans for private-use placeholders `<n>`; `restore` puts them back. Placeholders never survive `restore`.
  - `replacePhrases(text, pick)`, `swapWords(text, pick)`, `dropOpeners(text, pick, tone)`, `contract(text)`, `fixDashes(text)`, `tidy(text)`: each `(string, ...) -> { text, changes: Array<{ type, from, to }> }`, where `pick(options) -> string` uses the seeded rng. Matching is whole-word, case-insensitive; the replacement copies the case of the first letter.

- [ ] **Step 1: Write the failing tests** in `tests/rules.test.mjs`:
  - `every English AI phrase has a rule` and `every Bangla AI phrase has a rule`: for each `AI_PHRASES` entry, some `PHRASES`/`WORDS`/`OPENERS`/`BN_PHRASES` row matches it.
  - `protect round-trips`: input with `62%`, `3,000`, `https://x.com/a?b=1`, `a@b.co`, `@rahim`, `#ai`, `"quoted text"` and locked `Robust Systems Ltd` → `restore(protect(...).text) === input`, and the protected text contains none of those strings.
  - `a locked term is never changed`: `swapWords(protect("Robust Systems Ltd is robust.", ["Robust Systems Ltd"]).text, pick)` restored → starts with `Robust Systems Ltd` and the second `robust` is replaced.
  - `dropping an opener capitalizes the next word`: `dropOpeners("Moreover, the plan works.", () => "")` → `"The plan works."`
  - `deleting a phrase leaves no stray punctuation`: `tidy(replacePhrases("It is important to note that sales rose.", () => "").text).text === "Sales rose."`
  - `contractions skip clause ends`: `contract("It is fine. Whatever it is. Yes, it is!").text === "It's fine. Whatever it is. Yes, it is!"`
  - `dashes become commas or full stops`: `fixDashes("Fast — and cheap.").text` contains no `—`.
  - `case is kept`: `swapWords("Utilize it. utilize it.", () => "use").text === "Use it. use it."`
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the tables and passes.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `"Add rule tables and word-level passes for the local engine"`

### Task 2: Sentence rhythm

**Files:** `public/rules.js`, `tests/rules.test.mjs`

**Interfaces:**
- `splitLong(text, pick) -> { text, changes }`: a Latin sentence of 22+ words that contains `, and `, `, but ` or `, so ` with 6+ words on each side becomes two sentences (`"... . And ..."`, `"... . But ..."`, `"... . So ..."`). At most one split per sentence.
- `mergeShort(text, pick) -> { text, changes }`: two adjacent Latin sentences of 3-7 words each, inside the same paragraph, merge into one with `", and "` only when the second starts with one of `The, This, That, It, They, We, You, He, She, There, These, Those` (lower-cased in the merge). Never merges across a line break.

- [ ] **Step 1: Write the failing tests:** a 30-word sentence with `, but ` splits into two with the second starting `But`; a 15-word sentence does not split; `"It rained. The road flooded."` merges to `"It rained, and the road flooded."`; `"Dhaka is big. Rahim lives there."` is unchanged; sentences on separate lines never merge; after `splitLong` + `mergeShort` on `STOCK_AI_EN` the "flat" signal is gone (`!aiScore(out).keys.includes("flat")`).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `"Vary sentence rhythm with safe splits and merges"`

### Task 3: The engine

**Files:** `public/rules.js`, `tests/rules.test.mjs`

**Interfaces:**
- `humanizeLocal(text, { strength = "medium", tone = "natural", locked = [], seed = 1 }) -> { text, changes, passes, score: aiScore result | null }`. Runs `protect`, then the passes for the strength level in this order: phrases, words, openers, contractions, dashes, rhythm, `tidy`, then `restore`. If `aiScore(out)` is still above 30 and strength is below `strong`, it runs once more one level stronger (`passes` = 2). Never more than 2 passes.
- `sentenceOptionsLocal(sentence, { tone, locked }) -> string[]`: runs the engine on the single sentence with seeds 1-12 at `strong`, returns up to 3 distinct results that differ from the input; may return fewer.

- [ ] **Step 1: Write the failing tests:**
  - `stock AI English comes out human-like`: `humanizeLocal(STOCK_AI_EN).score.score <= 30`.
  - `stock AI Bangla score drops`: `humanizeLocal(STOCK_AI_BN).score.score < aiScore(STOCK_AI_BN).score - 25`.
  - `casual text is barely touched`: fewer than 5% of words differ (word-level diff count / word count).
  - `numbers, locked terms and quotes survive`: the quality-pass example text with locked `Facebook, TikTok, Bangladesh` keeps `62%`, `3` and all three terms.
  - `no hidden characters`: output fails the invisible-character regex from Global Constraints for every fixture and seeds 1-5.
  - `same seed, same output` and `different seeds give different versions` (seeds 1, 2, 3 on `STOCK_AI_EN` give 3 distinct texts).
  - `formal tone adds no contractions`.
  - `fast enough`: 30,000 characters (fixture repeated) in under 200 ms.
  - `sentence options`: `sentenceOptionsLocal("Moreover, it is crucial to leverage robust tools.")` returns 2-3 distinct strings, none equal to the input.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `"Add the local humanize engine with seeded versions"`

### Task 4: Use the engine in the page

**Files:** `public/app.js`, `public/index.html`, `public/styles.css`, `tests/ui.test.mjs`

**Interfaces:**
- Engine choice: when `api/health` answers (server with a key), a segmented control `#engine` shows "Quick" and "AI"; otherwise only Quick exists and the control is hidden. Quick is the default.
- Quick run: `humanizeLocal` per version with `seed = versionIndex + 1`, rendered at once (no streaming state). Mode buttons map to strength (Light/Balanced/Deep → light/medium/strong). Language and purpose selects are hidden in Quick mode (the rules keep the input language). The style sample field is hidden in Quick mode.
- Report in Quick mode: the "Meaning kept" card becomes "Changes" (`N phrases replaced, N words swapped, N sentences reshaped`), because there is no AI meaning check. Numbers-and-names and AI-phrases cards work as today.
- Sentence click in Quick mode uses `sentenceOptionsLocal`; "No other wording found for this sentence." when it returns none.
- Removed: the key bar (`#keybar`), the API key store, `browserRewrite`, `browserCheck`, the browser sentence path, `public/vendor/anthropic.js`, `scripts/sdk-entry.mjs`, the `build:vendor` script and the own-key word limit. GitHub Pages word limit becomes 3,000 for Quick mode (`QUICK_WORD_LIMIT`).

- [ ] **Step 1: Write the failing UI tests** (served with `server.js` but `/api/health` routed to 404, which is what GitHub Pages does):
  - `no API key bar on a static host`: `#keybar` is absent.
  - `quick mode humanizes without any network call`: record requests after load; paste `STOCK_AI_EN`, click Humanize; the output differs from the input, the result badge is `AI ≤ 30%`, and no request went to any `/api/` path or other origin.
  - `three versions differ`: choose 3×, run, the three tabs hold three different texts.
  - `sentence click offers local options`.
  - `history saves a quick run`.
  - `with a server the engine control appears` (health mocked OK): `#engine` visible; choosing AI uses `/api/rewrite` as before.
  - Update the existing retry, language, purpose and PDF/.docx tests so they select the AI engine or still apply.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** (with bump) `"Humanize in the browser by default; remove the API key bar"`

### Task 5: Honest labels and copy

**Files:** `public/index.html`, `public/app.js` (badge titles), `public/features.html`, `public/faq.html` (visible text and JSON-LD), `public/pricing.html` (Free plan lists Quick mode; Pro stays "Coming soon"), `README.md`, `tests/ui.test.mjs`

Copy to add: "Quick mode runs in your browser. Your text never leaves your device." and the "AI pattern score" note from Global Constraints. FAQ "Will it get my text past AI detectors?" keeps its "No tool can guarantee that" answer and adds that Quick mode changes wording and rhythm but not ideas or structure, so detectors may still flag it. README: features table, how the engine works, files list (`rules.js`, `rules-data.js`), removal of the own-key setup.

- [ ] **Step 1: Write the failing UI test:** the home page contains "AI pattern score" and "never leaves your device"; no page contains "Enter your Claude API key".
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Update the copy.**
- [ ] **Step 4: Run** `npm test`, then load every page at 390 px and 1280 px; expected: all PASS, no console errors, no sideways scroll.
- [ ] **Step 5: Commit** (with bump) `"Label the score honestly and describe Quick mode"`

---

## Out of scope

- Hidden-character, look-alike-letter or random-typo tricks (excluded on purpose: they corrupt the text, and detectors and plagiarism tools flag them as manipulation).
- Paraphrasing whole ideas or reordering paragraphs (needs an AI model).
- The Cloudflare, accounts and payment plan (`2026-11-08-professional-launch.md`), on hold until the owner picks it up again.
