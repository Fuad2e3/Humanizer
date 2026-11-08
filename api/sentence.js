import { parseSentence, sentenceOptions, describeError, allow, clientIp, isConfigured, NOT_CONFIGURED } from "../lib/humanize.js";

// POST { sentence, context, tone, locked[] } -> { options: [three strings] }
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end("{}"); }
  if (!allow(clientIp(req))) { res.statusCode = 429; return res.end(JSON.stringify({ error: "Too many requests in the last minute. Please wait a moment." })); }
  if (!isConfigured()) { res.statusCode = 503; return res.end(JSON.stringify({ error: NOT_CONFIGURED })); }
  try {
    const options = await sentenceOptions(parseSentence(req.body));
    if (!options) { res.statusCode = 422; return res.end(JSON.stringify({ error: "No alternatives came back. Please try again." })); }
    res.end(JSON.stringify({ options }));
  } catch (err) {
    console.error("sentence failed:", err);
    const [status, message] = describeError(err);
    res.statusCode = status;
    res.end(JSON.stringify({ error: message }));
  }
}
