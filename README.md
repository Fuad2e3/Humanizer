# Manush Lekha: Humanizer

AI diye lekha text ke manusher moto natural kore rewrite kore. Kintu mane, number ar naam bodlay na. বাংলা, English ar Banglish, teen tai chole.

## Onno humanizer tool er problem, ar egula kivabe solve kora hoyeche

| Problem | Manush Lekha ki kore |
|---|---|
| Rewrite korle mane bodle jay | Rewrite er por Claude original ar notun lekha milie dekhe. 0-100 score dey, ar ki harie geche ba notun ki jog hoyeche sheta list kore dekhay |
| Number, naam, brand bodle jay | Original er shob number ar apnar lock kora word notun lekhay hubohu ache kina check kore, ✓/✗ diye dekhay |
| Awkward, odbhut sentence | Tone (Natural, Casual, Formal, Academic, Blog) ar koto ta bodlabe (Halka/Majhari/Beshi) nijei bechhe nite paren |
| Ki bodlalo bojha jay na | "Ki bodlalo" tab e word dhore dhore diff dekhay |
| AI-sounding lekha | "moreover", "plays a vital role" er moto phrase holud kore highlight kore. Sentence length koto mishano, sheta chart e dekhay |

## Local e chalano

Node.js 22 ba tar beshi version lagbe.

```bash
npm install
cp .env.example .env     # tarpor .env file e ANTHROPIC_API_KEY bosan
npm start
```

Browser e khulun: http://localhost:3000

API key nin https://console.anthropic.com theke.

## Vercel e deploy

1. https://vercel.com e GitHub diye login korun, tarpor **Add New → Project** theke ei repo ta import korun.
2. **Environment Variables** e `ANTHROPIC_API_KEY` add korun.
3. **Deploy** chapun.

## Settings (environment variable)

| Name | Default | Kaj |
|---|---|---|
| `ANTHROPIC_API_KEY` | (lagbei) | Claude API key |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Kon model diye rewrite hobe |
| `RATE_LIMIT_PER_MIN` | `10` | Ek IP theke minute e koto ta request kora jabe |
| `PORT` | `3000` | Local server er port |

## Folder

- `public/index.html`: website (frontend)
- `api/rewrite.js`: lekha rewrite kore, stream kore pathay
- `api/check.js`: mane thik ache kina check kore
- `lib/humanize.js`: Claude er prompt ar API call
- `server.js`: local e chalanor server
- `claude-artifact/`: claude.ai artifact version, server chhara chole

## Note

- API call er khoroch apnar Anthropic account theke jabe. Public e chharle `RATE_LIMIT_PER_MIN` kom rakhun. Vercel e ei limit protita instance e alada alada gona hoy, tai kora limit lagle Vercel Firewall use korun.
- Kono tool AI detector pass korar guarantee dite pare na. Ei project er uddeshsho lekhake porte bhalo ar natural kora.
