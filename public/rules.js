// Local humanize engine: fixed rules that run in the browser, with no AI and no network.
// Each pass takes text and returns { text, changes: [{ type, from, to }] }.
import { aiScore } from "./detect.js?v=202611090832";
import { words, spread } from "./text.js?v=202611090832";
import { PHRASES, WORDY, WORDS, OPENERS, CONTRACTIONS, BN_PHRASES, SIBLINGS, OPENER_SIBLINGS, CASUAL } from "./rules-data.js?v=202611090832";

// Private-use characters mark spots in the text while the passes run; none survive to the output.
const ch = (n) => String.fromCharCode(n);
const PH_OPEN = ch(0xe000), PH_CLOSE = ch(0xe001);   // around a protected span
const MARK = ch(0xe002);    // where something was deleted
const CAP = ch(0xe003);     // capitalize the next letter
const MARKC = ch(0xe004);   // where a phrase ending in a comma was deleted ("needless to say,")
const MARKS = `[${MARK}${MARKC}]`;
const L = "\\p{L}\\p{M}\\p{N}";
const START = `(^|[.!?।]["'”’)\\]]*[ \\t]+|\\n[ \\t]*)`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => s.toLowerCase().replace(/’/g, "'");
const isUpper = (c) => !!c && c !== c.toLowerCase();

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

// Formal and Academic tones skip casual options; null means "keep the original wording".
function tonePick(pick, tone) {
  if (tone !== "formal" && tone !== "academic") return pick;
  return (options, key) => {
    const ok = options.filter((o) => !CASUAL.has(o));
    return ok.length ? pick(ok, key) : null;
  };
}

// ---------- Protecting what must not change ----------
const PROTECT = [
  /https?:\/\/\S+?(?=[.,;:!?)\]]*(?:\s|$))/g,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  // Links without https: www.example.com, example.com/page
  /(?<![\w@./-])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|ai|co|edu|gov|bd|uk|dev|app|info|me|xyz|tech|us|in)(?![a-z0-9-])(?:\/[^\s]*?)?(?=[.,;:!?)\]"”']*(?:\s|$))/gi,
  /(?<![\w@])@\w+/g,
  /(?<![\w&])#\w+/g,
  /"[^"\n]{1,300}"/g,
  /“[^”\n]{1,300}”/g,
  /`[^`\n]+`/g,
  /\d+(?:[.,]\d+)*%?/g,
  /[০-৯]+(?:[.,][০-৯]+)*%?/g
];
const RESTORE = new RegExp(`${PH_OPEN}(.)${PH_CLOSE}`, "gu");

// Swaps protected spans for private-use placeholders. restore() puts them back.
export function protect(text, locked = []) {
  const items = [];
  const hold = (m) => { items.push(m); return PH_OPEN + ch(0xe100 + items.length - 1) + PH_CLOSE; };
  let t = text;
  const terms = locked.filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length) t = t.replace(new RegExp(`(?<![${L}])(?:${terms.map(esc).join("|")})(?![${L}])`, "giu"), hold);
  for (const re of PROTECT) t = t.replace(re, hold);
  return { text: t, restore: (s) => s.replace(RESTORE, (m, c) => items[c.charCodeAt(0) - 0xe100] ?? m) };
}

// ---------- Finding names on its own ----------
// Names, brands and terms are kept without the visitor listing them:
//  - a word with a capital inside (TikTok, iPhone, YouTube) or in all capitals (AI, NASA)
//  - a capitalized word in the middle of a sentence (Facebook, Bangladesh)
//  - two or more capitalized words in a row, also at the start of a sentence (Robust Systems Ltd,
//    Bank of America, New York)
// A single capitalized word at the start of a sentence is left to the rules, since it is usually
// an ordinary word; looksLikeName() below still skips one that is followed by another capital.
const CAPWORD = "\\p{Lu}[\\p{L}\\p{M}'’&-]*";
const NAME_RUN = new RegExp(`(?<![\\p{L}\\p{M}])${CAPWORD}(?:[ \\t]+(?:(?:of|the|for|de|van|von|da|bin)[ \\t]+)?${CAPWORD})*`, "gu");
const INNER_CAP = /^(?:\p{Ll}+\p{Lu}|\p{Lu}[\p{Ll}]*\p{Lu}\p{Ll})|^[\p{Lu}&]{2,}s?$/u;
export function findNames(text) {
  const found = new Set();
  for (const m of text.matchAll(NAME_RUN)) {
    const run = m[0].replace(/[.'’&-]+$/u, "");
    const parts = run.split(/[ \t]+/);
    const atStart = atSentenceStart(text, m.index);
    if (parts.length >= 2 || !atStart || INNER_CAP.test(run)) {
      // "In Bangladesh" at the start: keep the name, not the ordinary first word.
      const caps = parts.filter((w) => /^\p{Lu}/u.test(w)).length;
      const name = atStart && parts.length >= 2 && caps === 2 && !INNER_CAP.test(parts[0]) && STARTERS_SAFE.has(parts[0].toLowerCase())
        ? parts.slice(1).join(" ") : run;
      if (name !== "I" && name.length > 1) found.add(name);
    }
  }
  // camelCase brands with a lower-case first letter: iPhone, eBay
  for (const m of text.matchAll(/(?<![\p{L}])\p{Ll}+\p{Lu}[\p{L}]*/gu)) found.add(m[0]);
  return [...found];
}
// Ordinary first words that are not part of a name that follows: "In Bangladesh", "The Guardian" stays whole.
const STARTERS_SAFE = new Set(["in", "on", "at", "for", "from", "by", "with", "about", "after", "before", "during", "since", "like",
  "moreover", "furthermore", "additionally", "however", "also", "so", "but", "and", "today", "yesterday", "recently", "ultimately",
  "overall", "notably", "importantly", "consequently", "thus", "firstly", "secondly", "lastly", "indeed", "meanwhile", "therefore",
  "although", "while", "when", "if", "because", "as", "here", "there", "this", "these", "those", "many", "most", "some", "every", "each"]);

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
  if (to === "") return from.trimEnd().endsWith(",") ? MARKC : MARK;
  return isUpper(from[0]) ? to[0].toUpperCase() + to.slice(1) : to[0].toLowerCase() + to.slice(1);
}

// True when offset is the first word of a sentence (after spaces, quotes, brackets or deletion marks).
const SKIP_BACK = new RegExp(`[ \\t"'“‘(\\[${MARK}${MARKC}${CAP}]`);
function atSentenceStart(s, off) {
  let i = off - 1;
  while (i >= 0 && SKIP_BACK.test(s[i])) i--;
  return i < 0 || s[i] === "\n" || /[.!?।]/.test(s[i]);
}

// A capitalized match in mid-sentence, or one followed by another capitalized word, is a name: leave it.
function looksLikeName(m, off, s) {
  if (!isUpper(m[0])) return false;
  if (!atSentenceStart(s, off)) return true;
  const next = s.slice(off + m.length).match(/^[ \t]+(\p{L})/u);
  return !!next && isUpper(next[1]);
}

function applyTable(text, rows, pick, type) {
  const { re, map } = compiled(rows);
  const changes = [];
  const out = text.replace(re, (m, off, s) => {
    if (looksLikeName(m, off, s)) return m;
    const to = pick(map.get(norm(m)), norm(m));
    if (to === null) return m;
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

// "a"/"an" in front of a word the rules put in ("an innovative" -> "a new"). Only words the rules
// inserted are checked, so the visitor's own wording is never touched.
const AN_EXCEPT = /^(us|uni|eu|one|once)/i;
export function fixArticles(text, changes) {
  const inserted = new Set(changes.filter((c) => c.to).map((c) => c.to.split(/\s+/)[0].toLowerCase().replace(/[^\p{L}-]/gu, "")).filter(Boolean));
  if (!inserted.size) return { text, changes: [] };
  const out = text.replace(new RegExp(`(?<![${L}])(a|an)([ \\t]+)(\\p{L}[\\p{L}-]*)`, "giu"), (m, art, sp, w) => {
    if (!inserted.has(w.toLowerCase())) return m;
    const want = /^[aeiou]/i.test(w) && !AN_EXCEPT.test(w) ? "an" : "a";
    if (art.toLowerCase() === want) return m;
    return (isUpper(art[0]) ? want[0].toUpperCase() + want.slice(1) : want) + sp + w;
  });
  return { text: out, changes: [] };
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
    if (to === null) return m;
    changes.push({ type: "opener", from: word, to });
    return pre + (to === "" ? MARK : to + " ");
  });
  return { text: out, changes };
}

// it is -> it's, unless the words end a clause: before punctuation, a dash, "and"/"or"/"but",
// or after "what"/"who"/"where"/"how" ("what it is and", "where it is matters").
const CONTRACT_MAP = new Map(CONTRACTIONS);
const CONTRACT_RE = new RegExp(
  `(?<!(?:what|who|where|how|whatever|wherever|whoever|however)[ \\t]+)` +
  `(?<![${L}'’])(?:${CONTRACTIONS.map(([f]) => esc(f)).join("|")})(?![${L}'’])` +
  `(?![ \\t]*(?:[.!?,;:)\\]"”\\n\\-–—]|$))(?![ \\t]+(?:and|or|but)(?![${L}]))`, "giu");
export function contract(text) {
  const changes = [];
  const out = text.replace(CONTRACT_RE, (m) => {
    const short = CONTRACT_MAP.get(m.toLowerCase());
    const to = short.startsWith("I'") ? short : matchCase(m, short);
    changes.push({ type: "contraction", from: m, to });
    return to;
  });
  return { text: out, changes };
}

// Em-dashes read as machine-written; commas do the same job. A dash between numbers or after a
// quotation (an attribution) stays; a dash at the end of a line is dropped.
export function fixDashes(text) {
  const changes = [];
  const out = text.replace(/([ \t]*)(—|(?<=\s)--(?=\s))([ \t]*)/g, (m, a, d, b, off, s) => {
    const prev = s[off - 1], next = s[off + m.length];
    if (/\d/.test(prev || "") && /\d/.test(next || "")) return m;
    if (/[.!?]["”'’)]?$/.test(s.slice(Math.max(0, off - 2), off))) return m;
    const end = next === undefined || next === "\n";
    changes.push({ type: "dash", from: d, to: end ? "" : "," });
    return end ? "" : ", ";
  });
  return { text: out, changes };
}

// Cleans up around deletions: no stray commas or spaces, and a capital letter at the start of a
// sentence (but never on a word like "iPhone").
const START_MARK = new RegExp(`${START}((?:${MARKS}[ \\t,;:]*)+)`, "gu");
const MID_MARK = new RegExp(`(,?)[ \\t]*((?:${MARKS}[ \\t]*)+)(,?)[ \\t]*`, "gu");
const CAP_RE = new RegExp(`${CAP}([\\s"'“(]*)(\\p{L})([\\p{L}\\p{N}]*)`, "gu");
export function tidy(text) {
  if (!new RegExp(MARKS).test(text)) return { text, changes: [] };
  let t = text.replace(START_MARK, (m, pre) => pre + CAP);
  t = t.replace(MID_MARK, (m, before, marks, after, off, s) => {
    const prev = s[off - 1], next = s[off + m.length];
    if (next === undefined || /[.!?;:)\]]/.test(next)) return "";
    // An aside between commas, or a deleted phrase that took its own comma: drop the comma before it too.
    if ((before && after) || (before && marks.includes(MARKC))) return " ";
    const keep = before || after;
    if (prev === undefined || /[\s(["“]/.test(prev)) return keep ? keep + " " : "";
    return keep ? keep + " " : " ";
  });
  t = t.replace(/,(?:[ \t]*,)+/g, ",");
  t = t.replace(CAP_RE, (m, pre, c, rest) => pre + (/\p{Lu}/u.test(rest) ? c : c.toUpperCase()) + rest).split(CAP).join("");
  return { text: t, changes: [] };
}

// ---------- Sentence rhythm ----------
// People mix short and long sentences. These passes split at a conjunction and merge short neighbours,
// never adding or dropping a word except "and" in a merge. Bangla sentences are left alone.
const MERGE_START = /^(The|This|That|It|They|We|You|He|She|There|These|Those)(?![\p{L}])/u;
// A split is safe only when the second half starts a full clause: a pronoun or noun phrase, a number or a name.
const SUBJECT = /^(i|you|he|she|it|we|they|this|these|those|there|the|a|an|my|our|your|his|her|their|its|some|many|most|all|each|every|no|one|people|everyone|everybody|nobody|someone|something|nothing)(?![\p{L}])/iu;
const NUMBER_START = new RegExp(`^[${PH_OPEN}\\d]`);
const startsClause = (r) => SUBJECT.test(r) || NUMBER_START.test(r) || /^\p{Lu}/u.test(r);
const isLatin = (s) => (s.match(/[A-Za-z]/g) || []).length > s.replace(/\s/g, "").length * 0.6;
const sentencesOf = (p) => p.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)[ \t]*/g) || [];
const capFirst = (s) => s.replace(/^(\s*)(\p{L})/u, (m, sp, c) => sp + c.toUpperCase());
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
        const rest = s.slice(m.index + m[0].length);
        if (!startsClause(rest)) continue;                                       // "so that", "and found", "but also"
        if (m[1] && m[1].toLowerCase() === "and" && s.slice(0, m.index).includes(",")) continue;   // end of a list
        const left = words(s.slice(0, m.index)), right = words(rest);
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
// Both must have at least three words, so greetings such as "Hello." stay on their own.
export function mergeShort(text, pick, { flat = false } = {}) {
  return perParagraph(text, (p, changes) => {
    const ss = sentencesOf(p), out = [];
    for (let i = 0; i < ss.length; i++) {
      const cur = ss[i], next = ss[i + 1];
      if (next && isLatin(cur) && isLatin(next) && /[^.]\.[ \t]*$/.test(cur) && MERGE_START.test(next.trimStart())
        && !/,\s+and\s/i.test(cur + next)) {
        const a = words(cur), b = words(next);
        const enough = a >= 3 && b >= 3;
        const short = enough && a <= 7 && b <= 7;
        const flatPair = enough && flat && a + b <= 28 && a <= 16 && b <= 16 && pick([true, false], "merge");
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

// Bangla: a long sentence that joins two full clauses with "এবং" splits in two ("... লাগে এবং সবার ..." ->
// "... লাগে। সবার ..."). Dropping the repeated subject is normal in Bangla. The word before "এবং" must
// look like a finished verb, and a list ("ক, খ এবং গ") is left alone. Nothing is added or dropped but "এবং".
const BN_SENTENCES = /[^।!?\n]+(?:[।!?]+["'”’)\]]*|$)[ \t]*/gu;
const BN_VERB_END = /(?:ছে|ছেন|ছিল|ছিলেন|হয়|হয়|যায়|যায়|পারে|লাগে|করে|দেয়|দেয়|থাকে|রাখে|বে|বেন|লাম|লেন|লো|ল|ত|তেন)$/u;
const bnWords = (s) => (s.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
export function splitBangla(text, { flat = false } = {}) {
  return perParagraph(text, (p, changes) => {
    let since = 2;
    return (p.match(BN_SENTENCES) || [p]).map((s) => {
      since++;
      if (isLatin(s) || !/।/.test(s)) return s;
      const len = bnWords(s);
      if (len < (flat ? 9 : 16) || since < 2) return s;
      let best = null;
      for (const m of s.matchAll(/[ \t]+এবং[ \t]+/gu)) {
        const left = s.slice(0, m.index), right = s.slice(m.index + m[0].length);
        if (/[,،]/.test(left)) continue;
        const lastWord = (left.match(/[\p{L}\p{M}]+$/u) || [""])[0];
        if (!BN_VERB_END.test(lastWord)) continue;
        const l = bnWords(left), r = bnWords(right);
        if (l < 4 || r < 3) continue;
        if (!best || Math.abs(l - r) < Math.abs(best.l - best.r)) best = { m, l, r };
      }
      if (!best) return s;
      since = 0;
      changes.push({ type: "split", from: "এবং", to: "।" });
      return s.slice(0, best.m.index) + "। " + s.slice(best.m.index + best.m[0].length);
    }).join("");
  });
}

// Varies sentence length: splits then merges, more freely when every sentence is about the same length.
export function rhythm(text, pick, tone = "natural") {
  const changes = [];
  const out = text.split(/(\n+)/).map((p, i) => {
    if (i % 2) return p;
    if (!isLatin(p)) {
      const lens = (p.match(BN_SENTENCES) || []).map(bnWords).filter(Boolean);
      const r = splitBangla(p, { flat: lens.length >= 3 && spread(lens) < 0.45 });
      changes.push(...r.changes);
      return r.text;
    }
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

// ---------- The engine ----------
const LEVELS = ["light", "medium", "strong"];
const TARGET = 30;   // stop once the pattern score is at or below this

// One rewrite with one seed: light = phrases and words; medium adds openers, contractions and dashes;
// strong adds sentence rhythm.
function runOnce(text, { strength, tone, locked = [], seed }) {
  const pick = tonePick(makePick(rng(seed)), tone);
  const p = protect(text, [...locked, ...findNames(text)]);
  const level = LEVELS.indexOf(strength);
  const changes = [];
  let t = p.text;
  const step = (r) => { t = r.text; changes.push(...r.changes); };
  if (level >= 1) step(dropOpeners(t, pick, tone));
  step(replacePhrases(t, pick));
  step(swapWords(t, pick));
  step(fixArticles(t, changes));
  if (level >= 1) {
    if (tone !== "formal" && tone !== "academic") step(contract(t));
    step(fixDashes(t));
  }
  step(tidy(t));
  if (level >= 2) step(rhythm(t, pick, tone));
  return { text: p.restore(t), changes };
}

// Tries several seeds (three, or five in Deep mode) and keeps the lowest pattern score (ties: fewer changes).
function bestOf(text, opts) {
  let best = null;
  const tries = opts.strength === "strong" ? 5 : 3;
  for (let k = 0; k < tries; k++) {
    const seed = opts.seed + 100 * k;
    const r = runOnce(text, { ...opts, seed });
    r.score = aiScore(r.text);
    const s = r.score ? r.score.score : 0, b = best && (best.score ? best.score.score : 0);
    if (!best || s < b || (s === b && r.changes.length < best.changes.length)) best = r;
  }
  return best;
}

// Rewrites text with the rules. If the score is still above the target, runs once more one level stronger.
export function humanizeLocal(text, { strength = "medium", tone = "natural", locked = [], seed = 1 } = {}) {
  const level = Math.max(0, LEVELS.indexOf(strength));
  let r = bestOf(text, { strength: LEVELS[level], tone, locked, seed });
  let passes = 1;
  if (r.score && r.score.score > TARGET && level < LEVELS.length - 1) {
    passes = 2;
    const r2 = bestOf(text, { strength: LEVELS[level + 1], tone, locked, seed });
    if (r2.score && r2.score.score <= r.score.score) r = r2;
  }
  return { text: r.text, changes: r.changes, passes, score: r.score };
}

// Small, safe changes to a sentence that is already clean: another linking word, a near-synonym,
// or a contraction written out (or made). Used only for the sentence alternatives.
const EXPAND = new Map(CONTRACTIONS.map(([full, short]) => [short.toLowerCase(), full]));
const SHORT_RE = new RegExp(`(?<![${L}'’])(${[...EXPAND.keys()].map(esc).join("|")})(?![${L}])`, "iu");
function variations(sentence, locked, tone) {
  const formal = tone === "formal" || tone === "academic";
  const p = protect(sentence, [...locked, ...findNames(sentence)]), t = p.text, out = [];
  const lead = t.match(/^\s*/)[0], body = t.slice(lead.length);
  for (const group of OPENER_SIBLINGS) {
    const hit = group.find((o) => body.startsWith(o + " "));
    if (hit) for (const o of group) if (o !== hit && !(formal && CASUAL.has(o))) out.push(lead + o + body.slice(hit.length));
  }
  for (const group of SIBLINGS) {
    for (const w of group) {
      const re = new RegExp(`(?<![${L}'’])${esc(w)}(?![${L}])`, "iu");
      if (re.test(t)) for (const o of group) if (o !== w) out.push(t.replace(re, (m) => matchCase(m, o)));
    }
  }
  const short = t.match(SHORT_RE);
  if (short) out.push(t.slice(0, short.index) + matchCase(short[0], EXPAND.get(short[0].toLowerCase())) + t.slice(short.index + short[0].length));
  else if (!formal) { const c = contract(t); if (c.changes.length) out.push(c.text); }
  return out.map(p.restore);
}

// Up to three different wordings of one sentence: first the full rules with different seeds, then the
// small variations above. Fewer, or none, when there is nothing safe to change.
export function sentenceOptionsLocal(sentence, { tone = "natural", locked = [] } = {}) {
  const found = [], s = sentence.trim();
  const add = (t) => { t = t.trim(); if (t && t !== s && !found.includes(t)) found.push(t); };
  for (let seed = 1; seed <= 12 && found.length < 3; seed++) add(runOnce(sentence, { strength: "strong", tone, locked, seed }).text);
  for (const t of variations(sentence, locked, tone)) if (found.length < 3) add(t);
  return found;
}
