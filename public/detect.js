// AI-likeness estimate, computed in the browser from writing patterns. It is a rough guide,
// not a real AI detector: it reads the same signals people notice when text "sounds like AI".
import { findAI, sentences, words, spread } from "./text.js";

export const MIN_WORDS = 40;

const STARTERS = /^(moreover|furthermore|additionally|in addition|however|overall|ultimately|firstly|secondly|lastly|in conclusion|in summary|notably|importantly|consequently|therefore|thus)\b/i;
const CONTRACTION = /\b\w+'(s|re|ve|ll|d|t|m)\b/gi;

const clamp = (x) => Math.max(0, Math.min(1, x));

// Returns null for short text, else { score 0-100, label, tone, signals[] }.
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
  const starters = sents.length ? sents.filter((s) => STARTERS.test(s)).length / sents.length : 0;
  const starter = clamp(starters * 2.5);
  const contractions = latin ? (t.match(CONTRACTION) || []).length / n * 100 : null;
  const stiff = contractions == null ? 0 : clamp(1 - contractions / 2);
  const dash = clamp(((t.match(/—/g) || []).length / n) * 100 / 1.5);

  const weights = latin ? [0.35, 0.33, 0.15, 0.12, 0.05] : [0.42, 0.4, 0.13, 0, 0.05];
  const parts = [phrase, flat, starter, stiff, dash];
  const score = Math.round(100 * parts.reduce((a, p, i) => a + p * weights[i], 0));

  const signals = [];
  if (phrase > 0.3) signals.push(`${hits} AI-sounding phrase${hits === 1 ? "" : "s"}`);
  if (flat > 0.5) signals.push("sentences are all about the same length");
  if (starter > 0.4) signals.push("many sentences start with 'Moreover' or 'Furthermore'");
  if (stiff > 0.7 && latin) signals.push("no contractions (it's, don't)");
  if (dash > 0.4) signals.push("lots of em-dashes (—)");

  const [label, tone] = score <= 30 ? ["Human-like", "ok"] : score <= 60 ? ["Mixed", "warn"] : ["AI-like", "bad"];
  return { score, label, tone, signals };
}
