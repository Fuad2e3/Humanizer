// Text helpers: AI phrase marking, counts, sentence rhythm and a word diff.
import { AI_PHRASES, countWords } from "./core.js?v=202611080817";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AI_RE = new RegExp(AI_PHRASES.map((p) => (/^[\x00-\x7f]+$/.test(p) ? "\\b" + esc(p) + "\\b" : esc(p))).join("|"), "gi");

export const html = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const words = countWords;
export const sentences = (t) => (t.match(/[^.!?।]+[.!?।]+["')\]]*|[^.!?।]+$/g) || []).map((s) => s.trim()).filter(Boolean);

export function markAI(text) {
  let out = "", last = 0;
  text.replace(AI_RE, (m, i) => { out += html(text.slice(last, i)) + "<mark>" + html(m) + "</mark>"; last = i + m.length; return m; });
  return out + html(text.slice(last));
}

export function findAI(text) {
  const counts = new Map();
  (text.match(AI_RE) || []).forEach((m) => { const k = m.toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); });
  return counts;
}

// Coefficient of variation of sentence lengths: how much they differ from each other.
export function spread(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) / mean;
}

export const numbersIn = (t) => [...new Set((t.match(/\d[\d,.]*%?|[০-৯][০-৯,.]*%?/g) || []).map((n) => n.replace(/[.,]$/, "")))];

// Word-level diff (LCS). Returns HTML with <ins>/<del>.
export function diffHTML(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  if (A.length * B.length > 4_000_000) return html(b);
  const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = "";
  const ws = (s) => /^\s+$/.test(s);
  while (i < n && j < m) {
    if (A[i] === B[j]) { out += html(A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out += ws(A[i]) ? "" : "<del>" + html(A[i]) + "</del> "; i++; }
    else { out += ws(B[j]) ? html(B[j]) : "<ins>" + html(B[j]) + "</ins>"; j++; }
  }
  while (i < n) { if (!ws(A[i])) out += " <del>" + html(A[i]) + "</del>"; i++; }
  while (j < m) { out += ws(B[j]) ? html(B[j]) : "<ins>" + html(B[j]) + "</ins>"; j++; }
  return out;
}

// Start/end offsets of each sentence (trimmed), so one sentence can be swapped in place.
export function sentenceRanges(text) {
  const out = [];
  for (const m of text.matchAll(/[^.!?।\n]+(?:[.!?।]+["')\]]*)?/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const start = m.index + lead, end = m.index + m[0].trimEnd().length;
    if (end > start && /[\p{L}\p{N}]/u.test(text.slice(start, end))) out.push({ start, end });
  }
  return out;
}
