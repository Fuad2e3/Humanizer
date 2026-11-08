// Local humanize engine: fixed rules that run in the browser, with no AI and no network.
// Each pass takes text and returns { text, changes: [{ type, from, to }] }.
import { words, spread } from "./text.js?v=202611080926";
import { PHRASES, WORDY, WORDS, OPENERS, CONTRACTIONS, BN_PHRASES } from "./rules-data.js?v=202611080926";

const MARK = "";   // where something was deleted; tidy() cleans up around it
const CAP = "";    // capitalize the next letter
const L = "\\p{L}\\p{M}\\p{N}";
const START = `(^|[.!?।]["'”’)\\]]*[ \\t]+|\\n[ \\t]*)`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => s.toLowerCase().replace(/’/g, "'");

// Small seeded random number generator (mulberry32), so the same seed gives the same rewrite.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Picks an option at random, avoiding the last choice for the same key and the two most recent choices overall.
export function makePick(rand) {
  const last = new Map(), recent = [];
  return (options, key = options.join("|")) => {
    let pool = options.length > 1 ? options.filter((o) => o !== last.get(key)) : options;
    const fresh = pool.filter((o) => o === "" || !recent.includes(o));
    if (fresh.length) pool = fresh;
    const choice = pool[Math.floor(rand() * pool.length)];
    last.set(key, choice);
    recent.push(choice);
    if (recent.length > 2) recent.shift();
    return choice;
  };
}

// ---------- Protecting what must not change ----------
const PROTECT = [
  /https?:\/\/\S+?(?=[.,;:!?)\]]*(?:\s|$))/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /(?<![\w@])@\w+/g,
  /(?<![\w&])#\w+/g,
  /"[^"\n]{1,300}"/g,
  /“[^”\n]{1,300}”/g,
  /`[^`\n]+`/g,
  /\d+(?:[.,]\d+)*%?/g,
  /[০-৯]+(?:[.,][০-৯]+)*%?/g
];

// Swaps protected spans for private-use placeholders. restore() puts them back.
export function protect(text, locked = []) {
  const items = [];
  const hold = (m) => { items.push(m); return "" + String.fromCharCode(0xe100 + items.length - 1) + ""; };
  let t = text;
  const terms = locked.filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length) t = t.replace(new RegExp(`(?<![${L}])(?:${terms.map(esc).join("|")})(?![${L}])`, "giu"), hold);
  for (const re of PROTECT) t = t.replace(re, hold);
  return { text: t, restore: (s) => s.replace(/(.)/gu, (m, c) => items[c.charCodeAt(0) - 0xe100] ?? m) };
}

// ---------- Table passes ----------
const cache = new WeakMap();
function compiled(rows) {
  if (!cache.has(rows)) {
    const keys = rows.map((r) => r[0]).sort((a, b) => b.length - a.length);
    const re = new RegExp(`(?<![${L}'’])(?:${keys.map((k) => esc(k).replace(/'/g, "['’]")).join("|")})(?![${L}])`, "giu");
    cache.set(rows, { re, map: new Map(rows.map(([k, o]) => [norm(k), o])) });
  }
  return cache.get(rows);
}

// Copies the case of the first letter from the original; "" becomes a deletion mark.
function matchCase(from, to) {
  if (to === "") return MARK;
  const f = from[0];
  return f !== f.toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to[0].toLowerCase() + to.slice(1);
}

function applyTable(text, rows, pick, type) {
  const { re, map } = compiled(rows);
  const changes = [];
  const out = text.replace(re, (m) => {
    const to = pick(map.get(norm(m)), norm(m));
    changes.push({ type, from: m, to });
    return matchCase(m, to);
  });
  return { text: out, changes };
}

const ALL_PHRASES = [...PHRASES, ...BN_PHRASES];
export const replacePhrases = (text, pick) => applyTable(text, ALL_PHRASES, pick, "phrase");

export function swapWords(text, pick) {
  const a = applyTable(text, WORDY, pick, "wordy");
  const b = applyTable(a.text, WORDS, pick, "word");
  return { text: b.text, changes: [...a.changes, ...b.changes] };
}

// Removes or replaces linking words such as "Moreover," at the start of a sentence.
const OPENER_KEYS = Object.keys(OPENERS).sort((a, b) => b.length - a.length);
const OPENER_RE = new RegExp(`${START}(${OPENER_KEYS.map(esc).join("|")})[ \\t]*,[ \\t]*`, "giu");
const OPENER_MAP = new Map(OPENER_KEYS.map((k) => [k.toLowerCase(), OPENERS[k]]));
export function dropOpeners(text, pick, tone = "natural") {
  const changes = [];
  const casual = tone === "casual" || tone === "blog";
  const out = text.replace(OPENER_RE, (m, pre, word) => {
    const o = OPENER_MAP.get(word.toLowerCase());
    const to = pick(casual ? [...o.neutral, ...o.casual] : o.neutral, "open:" + word.toLowerCase());
    changes.push({ type: "opener", from: word, to });
    return pre + (to === "" ? MARK : to + " ");
  });
  return { text: out, changes };
}

// it is -> it's, unless the words end a clause ("Yes, it is.").
const CONTRACT_MAP = new Map(CONTRACTIONS);
const CONTRACT_RE = new RegExp(`(?<![${L}'’])(?:${CONTRACTIONS.map(([f]) => esc(f)).join("|")})(?![${L}'’])(?![ \\t]*(?:[.!?,;:)\\]"”\\n]|$))`, "giu");
export function contract(text) {
  const changes = [];
  const out = text.replace(CONTRACT_RE, (m) => {
    const short = CONTRACT_MAP.get(m.toLowerCase());
    const to = short === "I'm" ? short : matchCase(m, short);
    changes.push({ type: "contraction", from: m, to });
    return to;
  });
  return { text: out, changes };
}

// Em-dashes read as machine-written; commas do the same job.
export function fixDashes(text) {
  const changes = [];
  const out = text.replace(/[ \t]*(?:—|\s--\s)[ \t]*/g, (m) => { changes.push({ type: "dash", from: m.trim(), to: "," }); return ", "; });
  return { text: out, changes };
}

// Cleans up around deletions: no stray commas or spaces, and a capital letter at the start of a sentence.
const START_MARK = new RegExp(`${START}((?:${MARK}[ \\t,;:]*)+)`, "gu");
export function tidy(text) {
  if (!text.includes(MARK)) return { text, changes: [] };
  let t = text.replace(START_MARK, (m, pre) => pre + CAP);
  t = t.replace(new RegExp(`[ \\t]*(?:${MARK}[ \\t]*)+`, "gu"), (m, off, s) => {
    const prev = s[off - 1], next = s[off + m.length];
    if (next === undefined || /[.!?,;:)\]]/.test(next)) return "";
    if (prev === undefined || /[\s(["“]/.test(prev)) return "";
    return " ";
  });
  t = t.replace(/,(?:[ \t]*,)+/g, ",");
  t = t.replace(new RegExp(`${CAP}([\\s"'“(]*)(\\p{L})`, "gu"), (m, pre, ch) => pre + ch.toUpperCase()).replace(new RegExp(CAP, "g"), "");
  return { text: t, changes: [] };
}

// ---------- Sentence rhythm ----------
// People mix short and long sentences. These passes split at a conjunction and merge short neighbours,
// never adding or dropping a word except "and" in a merge. Bangla sentences are left alone.
const MERGE_START = /^(The|This|That|It|They|We|You|He|She|There|These|Those)(?![\p{L}])/u;
const isLatin = (s) => (s.match(/[A-Za-z]/g) || []).length > s.replace(/\s/g, "").length * 0.6;
const sentencesOf = (p) => p.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)[ \t]*/g) || [];
const capFirst = (s) => s.replace(/\p{L}/u, (c) => c.toUpperCase());
const lowerFirst = (s) => s.replace(/^(\s*)(\p{L})/u, (m, sp, c) => sp + c.toLowerCase());

// Runs fn on each paragraph, keeping the line breaks between them.
function perParagraph(text, fn) {
  const changes = [];
  const out = text.split(/(\n+)/).map((p, i) => (i % 2 ? p : fn(p, changes))).join("");
  return { text: out, changes };
}

const isFlat = (p) => {
  const lens = sentencesOf(p).filter(isLatin).map(words);
  return lens.length >= 3 && spread(lens) < 0.45;
};

// Splits a sentence at ", but", ", so", ", yet", ", and" or ";". Long sentences always split; when the
// paragraph is flat, some medium ones split too, which makes short, punchy sentences.
export function splitLong(text, pick, tone = "natural", { flat = false } = {}) {
  const conj = tone === "formal" || tone === "academic" ? /,\s+(but|so|yet)\s+|;\s+/gi : /,\s+(but|so|yet|and)\s+|;\s+/gi;
  return perParagraph(text, (p, changes) => {
    let since = 2;
    return sentencesOf(p).map((s) => {
      since++;
      if (!isLatin(s)) return s;
      const len = words(s);
      let best = null;
      for (const m of s.matchAll(conj)) {
        const left = words(s.slice(0, m.index)), right = words(s.slice(m.index + m[0].length));
        if (!best || Math.abs(left - right) < Math.abs(best.left - best.right)) best = { m, left, right };
      }
      if (!best) return s;
      const { m, left, right } = best;
      const long = len >= 22 && left >= 6 && right >= 6;
      const medium = flat && len >= 10 && left >= 3 && right >= 3 && since >= 2 && pick([true, false], "split");
      if (!long && !medium) return s;
      since = 0;
      const rest = s.slice(m.index + m[0].length);
      const joined = s.slice(0, m.index) + ". " + (m[1] ? capFirst(m[1]) + " " + rest : capFirst(rest));
      changes.push({ type: "split", from: m[0].trim(), to: "." });
      return joined;
    }).join("");
  });
}

// Merges two neighbouring sentences with ", and" when the second starts with a pronoun or "The".
export function mergeShort(text, pick, { flat = false } = {}) {
  return perParagraph(text, (p, changes) => {
    const ss = sentencesOf(p), out = [];
    for (let i = 0; i < ss.length; i++) {
      const cur = ss[i], next = ss[i + 1];
      if (next && isLatin(cur) && isLatin(next) && /[^.]\.[ \t]*$/.test(cur) && MERGE_START.test(next.trimStart())
        && !/,\s+and\s/i.test(cur + next)) {
        const a = words(cur), b = words(next);
        const short = a <= 7 && b <= 7;
        const flatPair = flat && a + b <= 28 && a <= 16 && b <= 16 && pick([true, false], "merge");
        if (short || flatPair) {
          out.push(cur.trimEnd().replace(/\.$/, "") + ", and " + lowerFirst(next.trimStart()));
          changes.push({ type: "merge", from: ".", to: ", and" });
          i++;
          continue;
        }
      }
      out.push(cur);
    }
    return out.join("");
  });
}

// Varies sentence length: splits then merges, more freely when every sentence is about the same length.
export function rhythm(text, pick, tone = "natural") {
  const changes = [];
  const out = text.split(/(\n+)/).map((p, i) => {
    if (i % 2) return p;
    const flat = isFlat(p);
    const a = splitLong(p, pick, tone, { flat });
    const b = mergeShort(a.text, pick, { flat });
    changes.push(...a.changes, ...b.changes);
    if (!flat || !isFlat(b.text)) return b.text;
    // Still flat: split wherever it is allowed, without the coin flip. "formal" leaves out "and",
    // so the ", and" a merge just added is not split again.
    const c = splitLong(b.text, (o) => (o.includes(true) ? true : pick(o)), "formal", { flat: true });
    changes.push(...c.changes);
    return c.text;
  }).join("");
  return { text: out, changes };
}
