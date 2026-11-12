// Measures the Quick engine on the benchmark texts: average AI pattern score before and after for each
// mode, which signals are left, the most common words still left from the AI list, and how much
// human text changes. Run: npm run bench
import { humanizeLocal } from "../public/rules.js";
import { aiScore } from "../public/detect.js";
import { findAI } from "../public/text.js";
import { AI_TEXTS, AI_TEXTS_BN, AI_TEXTS_GENRES, AI_TEXTS_UNSEEN, HUMAN_TEXTS } from "../tests/bench/corpus.mjs";

const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
const SEEDS = [1, 2, 3];

export function bench({ verbose = false } = {}) {
  const out = {};
  for (const [name, set] of [["English", AI_TEXTS], ["Genres", AI_TEXTS_GENRES], ["Unseen", AI_TEXTS_UNSEEN], ["Bangla", AI_TEXTS_BN]]) {
    for (const strength of ["light", "medium", "strong"]) {
      const before = [], after = [], signals = new Map(), left = new Map();
      for (const t of set) for (const seed of SEEDS) {
        const r = humanizeLocal(t, { strength, seed });
        before.push(aiScore(t).score); after.push(r.score.score);
        r.score.keys.forEach((k) => signals.set(k, (signals.get(k) || 0) + 1));
        findAI(r.text).forEach((c, k) => left.set(k, (left.get(k) || 0) + c));
      }
      out[`${name} ${strength}`] = { before: avg(before), after: avg(after), worst: Math.max(...after), signals, left };
    }
  }
  // Human text: share of words changed (lower is better)
  const changed = HUMAN_TEXTS.map((t) => {
    const r = humanizeLocal(t, { strength: "strong" });
    const a = t.split(/\s+/), b = new Set(r.text.split(/\s+/));
    return a.filter((w) => !b.has(w)).length / a.length;
  });
  out.humanChanged = Math.round(100 * Math.max(...changed));
  if (verbose) {
    for (const [k, v] of Object.entries(out)) {
      if (typeof v !== "object") continue;
      console.log(`${k.padEnd(16)} ${String(v.before).padStart(3)} -> ${String(v.after).padStart(3)}  worst ${v.worst}  left: ${[...v.signals].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(" ")}`);
      if (v.left.size) console.log(`${"".padEnd(16)} AI words left: ${[...v.left].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, n]) => `${s}×${n}`).join(", ")}`);
    }
    console.log(`Human text: at most ${out.humanChanged}% of words changed`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) bench({ verbose: true });
