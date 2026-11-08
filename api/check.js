import { checkMeaning, describeError, allow, clientIp, InputError, MAX_INPUT_CHARS, isConfigured, NOT_CONFIGURED } from "../lib/humanize.js";

// POST { original, rewrite } -> { score, verdict, missing[], added[] }
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); return res.end("{}"); }
  if (!allow(clientIp(req))) { res.statusCode = 429; return res.end(JSON.stringify({ error: "Ek minute e onek beshi request." })); }
  if (!isConfigured()) { res.statusCode = 503; return res.end(JSON.stringify({ error: NOT_CONFIGURED })); }
  try {
    const { original, rewrite } = req.body || {};
    for (const v of [original, rewrite]) {
      if (typeof v !== "string" || !v.trim()) throw new InputError("Original ar rewrite duita-i lagbe.");
      if (v.length > MAX_INPUT_CHARS * 2) throw new InputError("Lekha ta onek boro.");
    }
    const result = await checkMeaning(original.trim(), rewrite.trim());
    if (!result) { res.statusCode = 422; return res.end(JSON.stringify({ error: "Mane check kora gelo na." })); }
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("check failed:", err);
    const [status, message] = describeError(err);
    res.statusCode = status;
    res.end(JSON.stringify({ error: message }));
  }
}
