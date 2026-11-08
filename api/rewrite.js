import { parseOptions, streamRewrite, describeError, allow, clientIp, isConfigured, NOT_CONFIGURED, WORD_LIMIT } from "../lib/humanize.js";

// POST { text, tone, strength, lang, locked[], variant } -> NDJSON stream of {"t": "..."} lines, then {"done": true, "stop": "..."}
export default async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end(); }
  if (!allow(clientIp(req))) return sendError(res, 429, "Too many requests in the last minute. Please wait a moment.");

  if (!isConfigured()) return sendError(res, 503, NOT_CONFIGURED);

  let opts;
  try { opts = parseOptions(req.body, { maxWords: WORD_LIMIT }); } catch (err) { return sendError(res, ...describeError(err)); }

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableEnded) ctl.abort(); });

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
  };
  try {
    const { stop } = await streamRewrite(opts, (t) => { begin(); res.write(JSON.stringify({ t }) + "\n"); }, ctl.signal);
    begin();
    res.end(JSON.stringify({ done: true, stop }) + "\n");
  } catch (err) {
    if (ctl.signal.aborted) return;
    console.error("rewrite failed:", err);
    const [status, message] = describeError(err);
    if (!started) return sendError(res, status, message);
    res.end(JSON.stringify({ error: message }) + "\n");
  }
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}
