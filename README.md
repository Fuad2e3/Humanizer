# Manush Lekha: Humanizer

AI diye lekha text ke manusher moto natural kore rewrite kore. Kintu mane, number ar naam bodlay na. বাংলা, English ar Banglish, teen tai chole.

## Features

| Feature | Ki kore |
|---|---|
| AI detection score | Rewrite er age ar pore lekha koto ta "AI er moto" lage, meter e dekhay, ar keno lage sheta-o bole. Browser ei lekhar pattern dekhe hishab kore, tai eta estimate, guarantee na |
| 3 ta mode | Halka (shudhu polish), Shadharon (sentence notun kore), Gobhir (puro lekha notun kore sajay) |
| 3 ta version | Ek click e 1-3 ta alada rewrite, protita'r nijer score soho |
| Word limit | Free te ekbare 500 word (`FREE_WORD_LIMIT` diye bodlano jay). Nijer key diye GitHub Pages e 3,000 word |
| File upload | .txt, .md ba Word (.docx) file. Button diye ba editor e tene ana jay. Browser ei pora hoy |
| History | Shesh 30 ta rewrite browser e save thake. Kholo, copy, muchhe felo |
| Mane check | Claude original ar notun lekha milie 0-100 score dey, ki harie geche sheta bole |
| Number o word lock | Number ar locked word hubohu ache kina ✓/✗ diye dekhay |
| Landing page | Features, review, pricing, FAQ section |

### Launch er age

- **Review section:** `public/index.html` e "User ra ki bolche" section er review gulo sample. Asol user der review diye bodle din.
- **Pricing:** Pro ar Team plan e "Shiggiri ashche" button dewa ache. Payment (bKash, SSLCommerz, Stripe) ar user account ekhono banano hoyni, tai Pro er 3,000 word limit ekhono kaj kore na.

## Website kothay chalano jay

### 1. GitHub Pages (free, server lage na)

Website: https://fuad2e3.github.io/Humanizer/

Ekhane kono server nei. Tai je use korbe, she page er upore nijer Claude API key bosabe ([key kothay pabo](https://console.anthropic.com/settings/keys)). Key ta tar browser theke sorasori Anthropic e jay, onno kothao jay na. "Ei browser e mone rakho" tick dile porer bar abar key dite hoy na.

Chalu korte: repo **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.

### 2. Vercel (visitor er key lage na)

Server e apnar key thake, tai visitor ra key chhara-i use korte pare. Khoroch apnar account theke jay.

1. https://vercel.com e GitHub diye login korun, tarpor **Add New → Project** theke ei repo ta import korun.
2. **Environment Variables** e `ANTHROPIC_API_KEY` add korun.
3. **Deploy** chapun.

### 3. Nijer computer e

Node.js 22 ba tar beshi version lagbe.

```bash
npm install
cp .env.example .env     # tarpor .env file e ANTHROPIC_API_KEY bosan
npm start
```

Browser e khulun: http://localhost:3000

Page nije bujhe ney kon mode e cholche. Server thakle server diye kaj kore. Na thakle API key chaay.

## Settings (environment variable)

| Name | Default | Kaj |
|---|---|---|
| `ANTHROPIC_API_KEY` | (lagbei) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Kon model diye rewrite hobe |
| `RATE_LIMIT_PER_MIN` | `30` | Ek IP theke minute e koto ta request kora jabe (3 version = 6 ta request) |
| `FREE_WORD_LIMIT` | `500` | Ekbare koto word deya jabe |
| `PORT` | `3000` | Local server er port |

## Folder

- `public/index.html`: website er page
- `public/app.js`: page er mul code
- `public/styles.css`: design
- `public/detect.js`: AI score hishab
- `public/files.js`: .txt/.docx file pora
- `public/history.js`: history save
- `public/text.js`: text helper (highlight, diff)
- `public/core.js`: prompt ar niyom, server ar browser duijon-i eta use kore
- `public/vendor/anthropic.js`: browser er jonno Claude SDK (`npm run build:vendor` diye banano)
- `index.html`: GitHub Pages ke `public/` e niye jay
- `api/rewrite.js`: lekha rewrite kore, stream kore pathay
- `api/check.js`: mane thik ache kina check kore
- `api/health.js`: page ke janay j server ache
- `lib/humanize.js`: Claude er prompt ar API call
- `server.js`: local e chalanor server
- `claude-artifact/`: claude.ai artifact version, server chhara chole

## Note

- API call er khoroch apnar Anthropic account theke jabe. Public e chharle `RATE_LIMIT_PER_MIN` kom rakhun. Vercel e ei limit protita instance e alada alada gona hoy, tai kora limit lagle Vercel Firewall use korun.
- Kono tool AI detector pass korar guarantee dite pare na. Ei project er uddeshsho lekhake porte bhalo ar natural kora.
