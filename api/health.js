import { isConfigured, WORD_LIMIT } from "../lib/humanize.js";

// The page calls this to learn whether a server is behind it. Static hosts (GitHub Pages) answer 404.
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, configured: isConfigured(), wordLimit: WORD_LIMIT }));
}
