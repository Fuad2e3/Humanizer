// AI-likeness estimate, computed in the browser from writing patterns. It is a rough guide,
// not a real AI detector: it reads the same signals people notice when text "sounds like AI".
import { findAI, sentences, words, spread } from "./text.js?v=202611080821";

export const MIN_WORDS = 40;
// A version whose score is above the threshold is rewritten once more with feedback.
export const RETRY_THRESHOLD = 45;
export const MAX_RETRIES = 1;

export const shouldRetry = (result, attempt) => Boolean(result) && result.score > RETRY_THRESHOLD && attempt < MAX_RETRIES;

const STARTERS = /^(moreover|furthermore|additionally|in addition|however|overall|ultimately|firstly|secondly|lastly|in conclusion|in summary|notably|importantly|consequently|therefore|thus)\b/i;
const BN_STARTERS = /^(তাছাড়া|অধিকন্তু|সুতরাং|পরিশেষে|সর্বোপরি|অতএব|এছাড়াও)(?=[\s,]|$)/;
const CONTRACTION = /\b\w+'(s|re|ve|ll|d|t|m)\b/gi;
const STOP = new Set(["that", "this", "with", "have", "they", "them", "their", "there", "were", "from", "what", "when", "will", "would", "about", "into", "just", "like", "than", "then", "your", "been", "said", "some", "more", "also", "very"]);

const clamp = (x) => Math.max(0, Math.min(1, x));

// Share of content words that belong to a word used 3 or more times.
function repetition(t) {
  const list = (t.toLowerCase().match(/[\p{L}\p{M}']+/gu) || []).filter((w) => [...w].length >= 4 && !STOP.has(w));
  if (!list.length) return 0;
  const counts = new Map();
  list.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return list.filter((w) => counts.get(w) >= 3).length / list.length;
}

// Share of sentences whose first word also starts another sentence.
function sameOpenings(sents) {
  const firsts = sents.map((s) => (s.toLowerCase().match(/[\p{L}\p{M}']+/u) || [""])[0]);
  const counts = new Map();
  firsts.forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  return firsts.filter((w) => w && counts.get(w) > 1).length / Math.max(1, sents.length);
}

// Returns null for short text, else { score 0-100, label, tone, signals[], keys[] }.
export function aiScore(text) {
  const t = text.trim();
  const n = words(t);
  if (n < MIN_WORDS) return null;
  const sents = sentences(t);
  const lens = sents.map(words);
  const latin = (t.match(/[A-Za-z]/g) || []).length / Math.max(1, t.replace(/\s/g, "").length) > 0.6;

  const hits = [...findAI(t).values()].reduce((a, b) => a + b, 0);
  const phrase = clamp((hits / n) * 100 / 3);               // 3+ stock phrases per 100 words reads as AI
  const cv = spread(lens);
  const flat = sents.length > 2 ? clamp((0.55 - cv) / 0.45) : 0.5; // people mix short and long sentences
  const starters = sents.length ? sents.filter((s) => STARTERS.test(s) || BN_STARTERS.test(s)).length / sents.length : 0;
  const starter = clamp(starters * 2.5);
  const contractions = latin ? (t.match(CONTRACTION) || []).length / n * 100 : null;
  const stiff = contractions == null ? 0 : clamp(1 - contractions / 2);
  const dash = clamp(((t.match(/—/g) || []).length / n) * 100 / 1.5);
  const repeat = clamp((repetition(t) - 0.05) / 0.15);
  const openings = sents.length > 2 ? clamp((sameOpenings(sents) - 0.2) / 0.4) : 0;

  // phrase, flat, starter, stiff, dash, repeat, openings (each row sums to 1)
  const weights = latin ? [0.3, 0.25, 0.13, 0.1, 0.04, 0.1, 0.08] : [0.36, 0.3, 0.14, 0, 0.04, 0.1, 0.06];
  const parts = [phrase, flat, starter, stiff, dash, repeat, openings];
  const score = Math.round(100 * parts.reduce((a, p, i) => a + p * weights[i], 0));

  const signals = [], keys = [];
  const add = (key, text) => { keys.push(key); signals.push(text); };
  if (phrase > 0.3) add("phrases", `${hits} AI-sounding phrase${hits === 1 ? "" : "s"}`);
  if (flat > 0.5) add("flat", "sentences are all about the same length");
  if (starter > 0.4) add("starters", "many sentences open with linking words such as 'Moreover' or 'তাছাড়া'");
  if (stiff > 0.7 && latin) add("stiff", "no contractions (it's, don't)");
  if (dash > 0.4) add("dash", "lots of em-dashes (—)");
  if (repeat > 0.4) add("repeat", "the same words come back again and again");
  if (openings > 0.5) add("openings", "many sentences start the same way");

  const [label, tone] = score <= 30 ? ["Human-like", "ok"] : score <= 60 ? ["Mixed", "warn"] : ["AI-like", "bad"];
  return { score, label, tone, signals, keys };
}
