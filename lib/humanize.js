import Anthropic from "@anthropic-ai/sdk";
import { MODEL_DEFAULT, rewriteRequest, checkRequest, readCheck, describeError as describe } from "../public/core.js";

export { parseOptions, InputError, MAX_INPUT_CHARS } from "../public/core.js";
import { FREE_WORD_LIMIT } from "../public/core.js";

export const WORD_LIMIT = Number(process.env.FREE_WORD_LIMIT) || FREE_WORD_LIMIT;

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || MODEL_DEFAULT;

export const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const NOT_CONFIGURED = "The server has no ANTHROPIC_API_KEY set. Please contact the site owner.";

// Streams the rewrite. Calls onText(delta) for each piece; resolves with { stop }.
export async function streamRewrite(opts, onText, signal) {
  const stream = client.beta.messages.stream(rewriteRequest(opts, MODEL), { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  return { stop: final.stop_reason };
}

// Compares the original and the rewrite for meaning.
export async function checkMeaning(original, rewrite) {
  return readCheck(await client.beta.messages.create(checkRequest(original, rewrite, MODEL)));
}

export function describeError(err) {
  const [status, message] = describe(err, Anthropic);
  // On the server a bad key is the site owner's problem, not the visitor's.
  return status === 401 || status === 403 ? [500, "The server's API key is not valid. Please contact the site owner."] : [status, message];
}

// Very small per-IP limiter. Good enough for one server; serverless instances each keep their own.
const hits = new Map();
export function allow(ip, limit = Number(process.env.RATE_LIMIT_PER_MIN || 30)) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= limit) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket?.remoteAddress || "unknown";
}
