# Humanizer

Rewrites AI-generated text so it reads more like a person wrote it, while keeping its numbers and names the same.

There are two engines:

- **Quick** (always on, the default): fixed rules that run in the visitor's browser. Free, instant, no account and no API key, and the text never leaves the device. It changes wording and rhythm, not ideas or structure.
- **AI** (optional): a Claude rewrite on your own server. It appears on the page only when a server with an API key is running (Vercel or `npm start`).

## Features

| Feature | What it does |
|---|---|
| Quick engine | Replaces stock AI phrases ("plays a vital role in", "it is important to note that") and stiff words (utilize, leverage, robust), shortens wordy phrases (in order to, due to the fact that), drops or swaps filler openers (Moreover, However, Indeed), cuts empty lead-ins ("it is clear that"), adds contractions and splits or joins sentences so their length varies. Over 500 rules. Covers Bangla too: about 55 stock phrases, and long sentences split at "এবং" in Deep mode |
| AI pattern score | Shows how AI-like the text looks before and after, on a meter, and explains why. It is computed in the browser from writing patterns, so detectors such as GPTZero or Turnitin may score differently |
| Second pass | Quick: if the score is still above 20, the rules run once more one level stronger. AI: if the score is above 45, Claude rewrites once more with fixes for what the score found. The lower score is kept |
| 3 modes | Light (phrases and words), Balanced (also openers, contractions and dashes), Deep (also sentence rhythm, in English and Bangla) |
| Up to 3 versions | One click gives 1 to 3 different rewrites, each with its own score. Quick mode picks the best of three tries for each version (five in Deep mode) |
| Word limit | 3,000 words at a time in Quick mode. 500 per AI rewrite (set with `FREE_WORD_LIMIT`) |
| Protected text | Numbers, names, links, email addresses, @mentions, #hashtags and quoted text are never changed. Names are found automatically: brands with a capital inside (TikTok, iPhone), acronyms (AI, NASA), capitalized words mid-sentence (Facebook) and multi-word names (Bank of America) |
| File upload | .txt, .md, Word (.docx) and PDF files, by button or drag and drop. Files are read in the browser. Scanned PDFs without a text layer are not supported |
| Word download | Save the result as a .docx file |
| History | The last 30 rewrites are saved in the browser and can be reopened, copied or deleted |
| Sentence rewrite | Click any sentence in the result to get up to three new wordings |
| AI-only options | Language (English, Bangla, Banglish), purpose (email, essay, blog, social post), "Match my style" and a meaning check by Claude |
| SEO pages | Features, Pricing and FAQ pages with meta tags, a share image, structured data, `robots.txt` and `sitemap.xml` |

No hidden characters, look-alike letters or deliberate typos are ever added. Detectors and plagiarism tools flag those as manipulation, and they break copying, search and spell-check.

### Before launch

- **Pricing:** the site is free. The Pricing page shows the Free plan and a planned Pro plan with no price. Payments and user accounts are not built yet.
- **Legal pages:** `privacy.html` and `terms.html` describe the site as it runs today (Quick mode only, no cookies, hosted on GitHub Pages). Update them before adding AI mode, analytics or payments, and have them checked by a lawyer before charging anyone.
- **Fonts:** Geist is served from `public/fonts/` (SIL Open Font License, in `public/fonts/OFL.txt`), so no visitor data goes to a font host.
- **Your own domain:** the canonical links, share tags, `robots.txt` and `sitemap.xml` point to `https://fuad2e3.github.io/Humanizer/public/`. When you move to your own domain, replace that address in `public/*.html`, `public/robots.txt` and `public/sitemap.xml`.

### Measuring the Quick engine

`npm run bench` runs the engine over 16 typical AI-written English paragraphs, 12 in other genres (emails, product copy, cover letters, reviews, how-tos), 6 unseen ones that no rule was written from, 3 Bangla ones and 3 human-written texts (in `tests/bench/corpus.mjs`). It prints the average pattern score before and after for each mode, the signals still left, and how much human text changed. The test suite fails if Deep mode averages above 18 for English or 10 for Bangla, or if human text changes by more than 5%. Use it to check that a new rule really helps before keeping it.

Current results (Deep): English 63 → 16, other genres 69 → 18, unseen 53 → 14, Bangla 73 → 7; human text at most 3% changed. Keep the unseen set unseen: write rules from the other sets, and use it only to check that they carry over.

## Where to run it

### 1. GitHub Pages (free, no server)

Site: https://fuad2e3.github.io/Humanizer/

The page runs in Quick mode. Visitors need nothing: no key and no account.

To turn it on: repo **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.

### 2. Vercel (adds the AI engine)

Your Claude key stays on the server, and visitors can choose Quick or AI. API costs go to your account.

1. Sign in at https://vercel.com with GitHub, then import this repo from **Add New → Project**.
2. Add `ANTHROPIC_API_KEY` under **Environment Variables**.
3. Click **Deploy**.

### 3. On your own computer

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env     # put your ANTHROPIC_API_KEY in .env to turn on the AI engine
npm start
```

Open http://localhost:3000

## How the Quick engine works

`public/rules.js` runs these passes in order (`public/rules-data.js` holds the tables):

1. **Protect** numbers, names (found automatically), links, emails, @mentions, #hashtags and quoted text by swapping them for placeholders.
2. **Openers:** drop or replace "Moreover,", "Furthermore," and similar at the start of a sentence (Balanced and Deep).
3. **Phrases:** replace stock AI phrases, in English and Bangla.
4. **Words:** shorten wordy phrases and swap stiff words, with every verb form ("leverages", "leveraged").
5. **Contractions** ("it is" → "it's", not at the end of a clause, never in Formal or Academic tone) and **dashes** (Balanced and Deep).
6. **Tidy:** fix capitals and commas where something was deleted.
7. **Rhythm:** split long sentences at "but", "so" or "and", and join short neighbours, more freely when every sentence is about the same length (Deep).
8. **Restore** the protected text.

Choices between options come from a seeded random generator, so each version differs and the same seed always gives the same result. Each version tries three seeds and keeps the lowest score.

## Updating the site

After changing anything in `public/`, run this before you commit so visitors' browsers load the new files instead of cached ones:

```bash
npm run bump
```

## Tests

```bash
npm test
```

Runs the unit tests and a browser test of the page (with the API mocked, so no key is needed). The browser test uses Playwright if it is installed and is skipped otherwise.

## Settings (environment variables, AI engine only)

| Name | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required for AI) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for rewrites |
| `CLAUDE_FAST_MODEL` | `claude-haiku-5-5` | Model used for meaning checks and sentence options |
| `RATE_LIMIT_PER_MIN` | `30` | Requests allowed per IP per minute (3 versions = 6 requests; each sentence rewrite = 2) |
| `FREE_WORD_LIMIT` | `500` | Maximum words per AI rewrite |
| `PORT` | `3000` | Port for the local server |

## Files

- `public/index.html`: the tool
- `public/features.html`, `public/pricing.html`, `public/faq.html`: content pages
- `public/og.png`, `public/robots.txt`, `public/sitemap.xml`: sharing and search
- `public/app.js`: main page logic
- `public/styles.css`: styles
- `public/rules.js`: the Quick engine
- `public/rules-data.js`: the Quick engine's phrase, word, opener and contraction tables
- `public/core.js`: AI prompts and options, shared by the server and the browser
- `public/detect.js`: AI pattern score
- `public/files.js`: reads .txt, .md, .docx and .pdf files
- `public/docx-export.js`: builds the .docx download
- `public/history.js`: saves history in the browser
- `public/text.js`: text helpers (highlighting, diff)
- `public/vendor/pdf.min.mjs`, `pdf.worker.min.mjs`: PDF.js for PDF upload (`npm run build:pdf`)
- `tests/`: tests (`npm test`)
- `api/rewrite.js`: streams an AI rewrite
- `api/check.js`: runs the meaning check
- `api/sentence.js`: three AI alternatives for one sentence
- `api/health.js`: tells the page that a server with a key is present
- `lib/humanize.js`: Claude API calls on the server
- `server.js`: local server
- `index.html`: sends GitHub Pages visitors to `public/`

## Notes

- Each AI rewrite makes two Claude calls (rewrite and meaning check), so 3 versions cost three times as much as 1. An automatic second try adds one more rewrite call for that version. Second tries also count toward `RATE_LIMIT_PER_MIN`, so one run with 3 versions can use up to 9 requests. On Vercel the limit is counted per server instance, so use Vercel Firewall if you need a strict limit.
- If Claude declines a request, it is retried on another model automatically.
- No tool can guarantee passing AI detectors. The goal is to make text read better and more naturally.
