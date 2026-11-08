# Humanizer

Rewrites AI-generated text so it reads like a person wrote it, while keeping its meaning, numbers and names the same.

## Features

| Feature | What it does |
|---|---|
| AI detection score | Shows how AI-like the text looks before and after the rewrite, on a meter, and explains why. It is computed in the browser from writing patterns, so it is an estimate, not a guarantee |
| 3 modes | Light (polish only), Balanced (rewrites sentences), Deep (restructures the whole text) |
| Up to 3 versions | One click gives 1 to 3 different rewrites, each with its own score |
| Word limit | 500 words per rewrite on the free tier (set with `FREE_WORD_LIMIT`). 3,000 words when visitors use their own key on GitHub Pages |
| File upload | .txt, .md and Word (.docx) files, by button or drag and drop. Files are read in the browser |
| History | The last 30 rewrites are saved in the browser and can be reopened, copied or deleted |
| Sentence rewrite | Click any sentence in the result to get three new wordings that fit the paragraph; picking one re-runs the meaning check |
| Meaning check | Claude compares the rewrite with the original, gives a 0-100 score and lists anything lost or added |
| Number and word lock | Checks that every number and locked word is still there, marked ✓ or ✗ |
| SEO pages | Features, Pricing and FAQ pages with meta tags, a share image, structured data, `robots.txt` and `sitemap.xml` |

### Before launch

- **Pricing:** Pro and Team show a "Coming soon" button. Payments and user accounts are not built yet, so the Pro 3,000-word limit does not apply to anyone yet. Prices are in US dollars; change them in `public/pricing.html`.
- **Your own domain:** the canonical links, share tags, `robots.txt` and `sitemap.xml` point to `https://fuad2e3.github.io/Humanizer/public/`. When you move to your own domain, replace that address in `public/*.html`, `public/robots.txt` and `public/sitemap.xml`.

## Where to run it

### 1. GitHub Pages (free, no server)

Site: https://fuad2e3.github.io/Humanizer/

There is no server here, so each visitor enters their own Claude API key ([get one here](https://console.anthropic.com/settings/keys)). The key goes straight from their browser to Anthropic and nowhere else. "Remember in this browser" saves it for next time.

To turn it on: repo **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.

### 2. Vercel (no key needed for visitors)

Your key stays on the server, so visitors can use the site without a key. API costs go to your account.

1. Sign in at https://vercel.com with GitHub, then import this repo from **Add New → Project**.
2. Add `ANTHROPIC_API_KEY` under **Environment Variables**.
3. Click **Deploy**.

### 3. On your own computer

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env     # then put your ANTHROPIC_API_KEY in .env
npm start
```

Open http://localhost:3000

The page detects which setup it is running in. With a server it uses the server; without one it asks for an API key.

## Settings (environment variables)

| Name | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for rewrites and meaning checks |
| `RATE_LIMIT_PER_MIN` | `30` | Requests allowed per IP per minute (3 versions = 6 requests; each sentence rewrite = 2) |
| `FREE_WORD_LIMIT` | `500` | Maximum words per rewrite |
| `PORT` | `3000` | Port for the local server |

## Files

- `public/index.html`: the tool
- `public/features.html`, `public/pricing.html`, `public/faq.html`: content pages
- `public/og.png`, `public/robots.txt`, `public/sitemap.xml`: sharing and search
- `public/app.js`: main page logic
- `public/styles.css`: styles
- `public/core.js`: prompts and options, shared by the server and the browser
- `public/detect.js`: AI score estimate
- `public/files.js`: reads .txt and .docx files
- `public/history.js`: saves history in the browser
- `public/text.js`: text helpers (highlighting, diff)
- `public/vendor/anthropic.js`: Claude SDK bundled for the browser (`npm run build:vendor`)
- `api/rewrite.js`: streams a rewrite
- `api/check.js`: runs the meaning check
- `api/sentence.js`: three alternatives for one sentence
- `api/health.js`: tells the page that a server is present
- `lib/humanize.js`: Claude API calls on the server
- `server.js`: local server
- `index.html`: sends GitHub Pages visitors to `public/`

## Notes

- Each rewrite makes two Claude calls (rewrite and meaning check), so 3 versions cost three times as much as 1. On a public site, keep `RATE_LIMIT_PER_MIN` low. On Vercel the limit is counted per server instance, so use Vercel Firewall if you need a strict limit.
- If Claude declines a request, it is retried on another model automatically.
- No tool can guarantee passing AI detectors. The goal is to make text read better and more naturally.
