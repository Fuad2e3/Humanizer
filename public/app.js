import { FREE_WORD_LIMIT, QUICK_WORD_LIMIT } from "./core.js?v=202611120845";
import { humanizeLocal, sentenceOptionsLocal, findNames } from "./rules.js?v=202611120845";
import { markAI, findAI, words, sentences, numbersIn, diffHTML, html, sentenceRanges } from "./text.js?v=202611120845";
import { aiScore, MIN_WORDS, shouldRetry } from "./detect.js?v=202611120845";
import { readTextFile, ACCEPT } from "./files.js?v=202611120845";
import { makeDocx } from "./docx-export.js?v=202611120845";
import { loadHistory, addHistory, removeHistory, clearHistory } from "./history.js?v=202611120845";

const $ = (id) => document.getElementById(id);
const input = $("input"), output = $("output"), backdropInner = $("backdrop-inner");
const status = $("status"), goBtn = $("go"), againBtn = $("again"), stopBtn = $("stop");

const EXAMPLE_IN = "In today's fast-paced world, social media plays a vital role in shaping how young people communicate. Moreover, it is important to note that platforms like Facebook and TikTok have fundamentally transformed the landscape of friendship. Furthermore, studies show that 62% of teenagers around the world use social media for more than 3 hours a day. In conclusion, social media is a double-edged sword that offers both opportunities and challenges.";
// The example result is the Quick engine's real output, so it shows what visitors will get.
const EXAMPLE_RUN = humanizeLocal(EXAMPLE_IN);

// Counts the engine's changes by kind, for the report and history.
function summarize(changes) {
  const n = { words: 0, sentences: 0, contractions: 0 };
  for (const c of changes) {
    if (c.type === "split" || c.type === "merge") n.sentences++;
    else if (c.type === "contraction") n.contractions++;
    else n.words++;
  }
  return n;
}

const MODE_NAMES = { light: "Light", medium: "Balanced", strong: "Deep" };
const TONE_NAMES = { natural: "Natural", casual: "Casual", formal: "Formal", academic: "Academic", blog: "Blog" };

// ---------- State ----------
const exampleState = () => ({
  source: EXAMPLE_IN,
  versions: [{ text: EXAMPLE_RUN.text, check: null, engine: "quick", summary: summarize(EXAMPLE_RUN.changes), status: "done" }],
  active: 0,
  example: true,
  tab: "result"
});
let state = exampleState();
// The example result belongs to the example text: once the visitor clears or changes that text,
// the result side goes back to empty, and "Try an example" brings both back.
function syncExample() {
  const isExample = input.value.trim() === EXAMPLE_IN;
  if (state.example && !isExample) { state = { source: "", versions: [], active: 0, example: false, tab: "result" }; renderAll(); }
  else if (isExample && !state.versions.length) { state = exampleState(); renderAll(); }
}
const cur = () => state.versions[state.active] || { text: "", check: null, status: "idle" };
// "quick": rules in the browser (always there). "ai": our server's /api, offered only when /api/health answers.
let engine = "quick", serverReady = false, serverLimit = FREE_WORD_LIMIT;
let wordLimit = QUICK_WORD_LIMIT;

const fail = (msg) => { const e = new Error(msg); e.userMessage = msg; return e; };
// Messages appear as a small toast at the bottom; errors stay a little longer.
let toastTimer = null;
function setStatus(text, err = false) {
  clearTimeout(toastTimer);
  status.textContent = text;
  status.className = "toast show" + (err ? " err" : "");
  const busy = goBtn.disabled && !err;
  if (!busy) toastTimer = setTimeout(() => status.classList.remove("show"), err ? 6000 : 3500);
}

// ---------- Settings ----------
const seg = (id) => $(id).querySelector('[aria-pressed="true"]').dataset.v;
const setSeg = (id, v) => { $(id).querySelectorAll("button[data-v]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === v))); moveThumb($(id)); };
["strength", "versions"].forEach((id) => $(id).addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]"); if (b) setSeg(id, b.dataset.v);
}));
// What each mode does differs by engine; the buttons' tooltips and the screen-reader text follow the engine.
const MODE_DESC = {
  quick: { light: "Swaps stock phrases and stiff words", medium: "Also drops filler openers and adds contractions", strong: "Also varies sentence length" },
  ai: { light: "Fixes only the robotic parts", medium: "Rewrites sentences, keeps the structure", strong: "Restructures everything, same meaning" }
};
// Quick keeps the input language and has no style or purpose options, so those controls show only for AI.
function setEngine(e) {
  engine = e === "ai" && serverReady ? "ai" : "quick";
  setSeg("engine", engine);
  wordLimit = engine === "ai" ? serverLimit : QUICK_WORD_LIMIT;
  document.querySelectorAll(".ai-only").forEach((el) => { el.hidden = engine !== "ai"; });
  if (engine !== "ai") { $("opts").hidden = true; $("opt-toggle").setAttribute("aria-expanded", "false"); }
  $("strength").querySelectorAll("button[data-v]").forEach((b) => { b.dataset.desc = b.title = MODE_DESC[engine][b.dataset.v]; });
  showModeDesc();
  syncInput();
}
// Without a server every version is handled locally, including AI rewrites reopened from history.
const usesQuick = (v) => v.engine === "quick" || !serverReady;
$("engine").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) setEngine(b.dataset.v); });
// ---------- Motion helpers ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// A thumb that slides under the selected button of each segmented control.
function moveThumb(seg) {
  const sel = seg.querySelector('[aria-pressed="true"], [aria-selected="true"]');
  const thumb = seg.querySelector(".seg-thumb");
  if (!sel || !thumb) return;
  thumb.style.width = sel.offsetWidth + "px";
  thumb.style.transform = `translateX(${sel.offsetLeft}px)`;
}
const segs = [...document.querySelectorAll(".seg")];
segs.forEach((seg) => { const t = document.createElement("span"); t.className = "seg-thumb"; t.setAttribute("aria-hidden", "true"); seg.prepend(t); seg.classList.add("no-anim"); });
const moveThumbs = () => segs.forEach(moveThumb);
addEventListener("resize", () => { segs.forEach((s) => s.classList.add("no-anim")); moveThumbs(); requestAnimationFrame(() => segs.forEach((s) => s.classList.remove("no-anim"))); });

// Counts a number up or down to its new value.
function countTo(el, value) {
  if (value == null) { el.textContent = "—"; el.dataset.v = ""; return; }
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(value);
  if (reduceMotion || from === value) { el.textContent = String(value); return; }
  const start = performance.now(), dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
    if (el.dataset.v !== String(value)) return;
    el.textContent = String(Math.round(from + (value - from) * e));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Names, brands and terms are found in the text itself; there is no list to fill in.
const lockedTerms = (text = $("input").value) => findNames(text).slice(0, 30);

// Mode description under the toolbar, and the locked-words panel
const showModeDesc = () => { $("mode-desc").textContent = $("strength").querySelector('[aria-pressed="true"]').dataset.desc || ""; };
$("strength").addEventListener("click", showModeDesc);
const showSampleCount = () => { $("sample-count").textContent = `${$("sample").value.length} / ${$("sample").maxLength}`; };
$("sample").addEventListener("input", showSampleCount);
$("opt-toggle").addEventListener("click", () => {
  const open = $("opt-toggle").getAttribute("aria-expanded") !== "true";
  $("opt-toggle").setAttribute("aria-expanded", String(open));
  $("opts").hidden = !open;
  if (open) $("sample").focus();
});

// ---------- Input, highlight, word counter ----------
function syncInput() {
  backdropInner.innerHTML = markAI(input.value) + "\n ";
  backdropInner.style.transform = `translateY(${-input.scrollTop}px)`;
  const n = words(input.value);
  $("wc-text").innerHTML = `${n.toLocaleString()} / ${wordLimit.toLocaleString()}<span class="wc-unit"> words</span>`;
  $("wc-bar").style.width = Math.min(100, (n / wordLimit) * 100) + "%";
  $("wc-text").parentElement.classList.toggle("over", n > wordLimit);
  setBadge($("in-ai"), aiScore(input.value));
  $("empty").hidden = input.value.length > 0;
}
input.addEventListener("input", () => { syncInput(); syncExample(); renderChecks(); });
input.addEventListener("scroll", () => { backdropInner.style.transform = `translateY(${-input.scrollTop}px)`; });
$("clear").addEventListener("click", () => { input.value = ""; syncInput(); syncExample(); renderChecks(); input.focus(); });

function setBadge(el, r) {
  el.className = "ai-badge" + (r ? " " + r.tone : "");
  el.textContent = r ? `AI ${r.score}%` : "AI —";
  el.title = r ? `AI pattern score: ${r.label}` : `The AI pattern score needs at least ${MIN_WORDS} words`;
}

// Empty-state actions
$("paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { setStatus("The clipboard is empty."); return; }
    input.value = text; syncInput(); syncExample(); renderChecks(); input.focus();
  } catch { input.focus(); setStatus("Press Ctrl+V (or ⌘V) to paste."); }
});
$("upload2").addEventListener("click", () => $("file").click());
$("try-example").addEventListener("click", () => { input.value = EXAMPLE_IN; syncInput(); syncExample(); renderChecks(); input.focus(); });

// ---------- Output ----------
function renderOutput() {
  const v = cur();
  $("example-badge").hidden = !state.example;
  const has = !!v.text;
  output.classList.toggle("placeholder", !has);
  if (!has) output.textContent = v.status === "err" ? (v.error || "This version could not be created.") : v.status === "streaming" ? "" : "Your humanized text will appear here.";
  else if (state.tab === "diff") output.innerHTML = diffHTML(state.source, v.text);
  else if (v.status === "streaming" || goBtn.disabled) output.innerHTML = markAI(v.text);
  else output.innerHTML = clickableSentences(v.text);
  output.classList.toggle("streaming", v.status === "streaming");
  $("out-count").textContent = has ? `${words(v.text)} words · ${sentences(v.text).length} sentences` : "";
  $("tab-result").setAttribute("aria-selected", String(state.tab === "result"));
  $("tab-diff").setAttribute("aria-selected", String(state.tab === "diff"));
  moveThumb($("tab-result").parentElement);
  $("use-version").hidden = !has || state.example || v.status === "streaming";
  setBadge($("out-ai"), has && v.status !== "streaming" ? aiScore(v.text) : null);
  $("copy").classList.toggle("accent", has && !state.example && v.status !== "streaming");
  $("copy").disabled = $("download").disabled = !has || v.status === "streaming";
  $("sent-hint").hidden = !has || state.tab !== "result" || v.status === "streaming";
  closeAlt();
  $("report-for").textContent = state.versions.length > 1 ? `for Version ${state.active + 1}` : "";
}
$("tab-result").addEventListener("click", () => { state.tab = "result"; renderOutput(); });
$("tab-diff").addEventListener("click", () => { state.tab = "diff"; renderOutput(); });

function renderVersionTabs() {
  const box = $("vtabs");
  box.hidden = state.versions.length < 2;
  if (box.hidden) return box.replaceChildren();
  box.replaceChildren(...state.versions.map((v, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "vtab" + (v.status === "err" ? " err" : ""); b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === state.active));
    const name = document.createElement("span"); name.textContent = `Version ${i + 1}`;
    b.append(name);
    if (v.status === "streaming" || v.status === "checking") { const sp = document.createElement("i"); sp.className = "spin"; b.append(sp); }
    else if (v.status === "err") { const x = document.createElement("span"); x.textContent = "✗"; b.append(x); }
    else { const badge = document.createElement("span"); setBadge(badge, aiScore(v.text)); b.append(badge); }
    b.addEventListener("click", () => { state.active = i; renderAll(); });
    return b;
  }));
}

// ---------- Report ----------
const setPill = (id, cls, text) => { const p = $(id); p.className = "pill " + cls; p.textContent = text; };
const chip = (text, cls = "") => { const s = document.createElement("span"); s.className = "chip " + cls; s.textContent = text; return s; };
// A short row of tags; past `max`, the rest become "+N".
const chipRow = (id, items, max = 6) => {
  const shown = items.slice(0, max).map(([t, cls]) => chip(t, cls));
  if (items.length > max) shown.push(chip(`+${items.length - max}`, "more"));
  $(id).replaceChildren(...shown);
};
// Short names for what still looks AI-written
const SIGNAL_TAGS = { phrases: "AI phrases", flat: "Same-length sentences", starters: "Linking-word openers", stiff: "No contractions",
  dash: "Em-dashes", repeat: "Repeated words", openings: "Same sentence openings" };

// Report: hidden until there is a result, then only the numbers and any problems.
const pillTone = (score) => (score >= 90 ? "ok" : score >= 75 ? "warn" : "bad");

function renderChecks() {
  const v = cur(), out = v.status === "streaming" ? "" : v.text;
  $("report").hidden = !out;
  if (!out) return;
  const src = state.source;

  // AI score, before and after
  const before = aiScore(src), after = aiScore(out);
  const bar = (id, r) => { $(id).style.width = (r ? r.score : 0) + "%"; $(id).className = (id === "ai-before-bar" ? "ghost " : "") + (r ? r.tone : ""); };
  bar("ai-before-bar", before); bar("ai-after-bar", after);
  countTo($("ai-before-num"), before ? before.score : null);
  countTo($("ai-after-num"), after ? after.score : null);
  if (!after) { setPill("ai-pill", "idle", "Too short"); chipRow("ai-signals", [[`Needs ${MIN_WORDS}+ words`, "more"]]); }
  else {
    const drop = before ? before.score - after.score : 0;
    setPill("ai-pill", after.tone, after.tone === "ok" && drop > 0 ? `${drop} lower` : after.label);
    const tags = after.score > 30 ? after.keys.map((k) => [SIGNAL_TAGS[k], "warn"]) : [];
    chipRow("ai-signals", tags.length ? tags : [["Reads natural", "kept"]]);
  }

  // AI phrases: only the ones still left are shown
  const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const inAI = findAI(src), outAI = findAI(out), left = total(outAI);
  $("a-from").textContent = String(total(inAI));
  $("a-to").textContent = String(left);
  setPill("a-pill", left === 0 ? "ok" : left <= 2 ? "warn" : "bad", left === 0 ? "Clean" : `${left} left`);
  // Phrases still left first, then the ones that were removed
  chipRow("a-chips", [...[...outAI.entries()].map(([k, c]) => [c > 1 ? `${k} ×${c}` : k, "warn"]),
    ...[...inAI.keys()].filter((k) => !outAI.has(k)).map((k) => [k, "gone"])], 4);

  // Numbers and names found in the text: only the missing ones are shown
  const items = [...numbersIn(src), ...lockedTerms(src).filter((t) => src.toLowerCase().includes(t.toLowerCase()))];
  const missing = items.filter((t) => !out.toLowerCase().includes(t.toLowerCase()));
  if (!items.length) { $("f-num").textContent = "—"; $("f-unit").textContent = ""; setPill("f-pill", "idle", "None to check"); }
  else {
    $("f-num").textContent = String(items.length - missing.length);
    $("f-unit").textContent = `/${items.length} kept`;
    setPill("f-pill", missing.length ? "bad" : "ok", missing.length ? `${missing.length} missing` : "All kept");
  }
  chipRow("f-chips", [...missing.map((t) => ["✗ " + t, "missing"]), ...items.filter((t) => !missing.includes(t)).map((t) => ["✓ " + t, "kept"])]);

  renderMeaning(v);
}

function renderMeaning(v) {
  const c = v.check, detail = $("m-detail"), verdict = $("m-verdict");
  detail.replaceChildren();
  const ring = (n) => { $("m-ring").style.strokeDashoffset = String(163.4 * (1 - (n ?? 0) / 100)); countTo($("m-num"), n ?? null); };
  // Quick mode has no AI meaning check; the card lists what the rules changed instead.
  const quick = v.engine === "quick";
  $("m-title").textContent = quick ? "Changes" : "Meaning kept";
  $("m-ring-box").hidden = quick;
  $("m-unit").textContent = quick ? " edits" : "/100";
  if (quick) {
    const s = v.summary || { words: 0, sentences: 0, contractions: 0 };
    const total = s.words + s.sentences + s.contractions;
    countTo($("m-num"), total);
    setPill("m-pill", total ? "ok" : "idle", total ? "Wording only" : "Nothing found");
    const tags = [];
    if (s.words) tags.push([`${s.words} word${s.words === 1 ? "" : "s"} and phrases`]);
    if (s.sentences) tags.push([`${s.sentences} sentence${s.sentences === 1 ? "" : "s"} reshaped`]);
    if (s.contractions) tags.push([`${s.contractions} contraction${s.contractions === 1 ? "" : "s"}`]);
    tags.push(["Same ideas and order", "kept"]);
    verdict.hidden = true;
    detail.className = "chips";
    chipRow("m-detail", total ? tags : [["No known AI patterns", "more"]]);
    return;
  }
  detail.className = "detail";
  if (c === "pending") { ring(null); setPill("m-pill", "idle", "Checking…"); verdict.hidden = true; return; }
  if (!c) { ring(null); setPill("m-pill", "idle", "Not checked"); verdict.hidden = true; return; }
  ring(c.score);
  setPill("m-pill", pillTone(c.score), c.score >= 90 ? "Preserved" : c.score >= 75 ? "Mostly kept" : "Changed");
  // Explain only when something was lost or added.
  const problems = (c.missing?.length || 0) + (c.added?.length || 0);
  verdict.hidden = !(problems || c.score < 90);
  verdict.textContent = c.verdict || "";
  const list = (title, arr) => {
    if (!arr || !arr.length) return;
    const h = document.createElement("span"); h.className = "label"; h.textContent = title;
    const ul = document.createElement("ul"); arr.forEach((x) => { const li = document.createElement("li"); li.textContent = x; ul.append(li); });
    detail.append(h, ul);
  };
  list("Lost", c.missing); list("Added", c.added);
}

function renderAll() { renderVersionTabs(); renderOutput(); renderChecks(); }

// ---------- Is there a server? ----------
// Static hosts such as GitHub Pages answer 404 here, and the page stays in Quick mode.
// A server with an AI key adds the "AI" engine.
async function detectServer() {
  try {
    const r = await fetch("api/health", { cache: "no-store" });
    if (r.ok) {
      const h = await r.json();
      if (h.ok && h.configured) {
        serverReady = true;
        if (Number.isInteger(h.wordLimit) && h.wordLimit > 0) serverLimit = h.wordLimit;
        $("engine").hidden = false;
        moveThumb($("engine"));
      }
    }
  } catch {}
  setEngine(engine);
}

async function postJson(url, body, signal) {
  let res;
  try { res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
  catch (e) { if (e.name === "AbortError") throw e; throw fail("Could not reach the server. Check your internet connection."); }
  if (!res.ok) {
    let msg = "Something went wrong. Please try again.";
    try { msg = (await res.json()).error || msg; } catch {}
    throw fail(msg);
  }
  return res;
}

// Reads the NDJSON stream from /api/rewrite.
async function serverRewrite(body, signal, onText) {
  const res = await postJson("api/rewrite", body, signal);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", text = "", stop = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.t) { text += msg.t; onText(text); }
      if (msg.error) { const e = fail(msg.error); e.partial = text; throw e; }
      if (msg.done) stop = msg.stop;
    }
  }
  return { text, stop };
}

const serverCheck = async (original, rewrite, signal) => (await postJson("api/check", { original, rewrite }, signal)).json();

// ---------- Sentence alternatives ----------
// The result is drawn as clickable sentences; picking one asks Claude for three new wordings.
function clickableSentences(text) {
  let out = "", last = 0;
  for (const r of sentenceRanges(text)) {
    out += html(text.slice(last, r.start)) + `<span class="sent" role="button" tabindex="0" data-s="${r.start}" data-e="${r.end}">${markAI(text.slice(r.start, r.end))}</span>`;
    last = r.end;
  }
  return out + html(text.slice(last));
}

const alt = $("alt"), altBody = $("alt-body");
let altCtl = null, altSpan = null;

function closeAlt() {
  altCtl?.abort(); altCtl = null;
  altSpan?.classList.remove("active"); altSpan = null;
  alt.hidden = true;
}

function placeAlt(span) {
  const sheet = alt.parentElement.getBoundingClientRect(), r = span.getBoundingClientRect();
  const width = Math.min(420, sheet.width - 24);
  alt.style.width = width + "px";
  alt.style.left = Math.max(12, Math.min(r.left - sheet.left, sheet.width - width - 12)) + "px";
  const below = r.bottom - sheet.top + 8;
  alt.style.top = (below + 220 > sheet.height ? Math.max(12, r.top - sheet.top - 8 - alt.offsetHeight) : below) + "px";
}

async function fetchAlternatives(body, signal, quick) {
  if (quick) {
    const options = sentenceOptionsLocal(body.sentence, { tone: body.tone, locked: body.locked });
    if (!options.length) throw fail("No other wording found for this sentence.");
    return options;
  }
  return (await (await postJson("api/sentence", body, signal)).json()).options;
}

async function openAlt(span) {
  const v = cur();
  if (goBtn.disabled || !v.text) return;
  closeAlt();
  altSpan = span; span.classList.add("active");
  const start = Number(span.dataset.s), end = Number(span.dataset.e), sentence = v.text.slice(start, end);
  altBody.innerHTML = '<p class="alt-wait"><i class="spin"></i>Finding new wordings…</p>';
  alt.hidden = false; placeAlt(span);
  altCtl = new AbortController();
  const signal = altCtl.signal;
  try {
    const options = await fetchAlternatives({ sentence, context: v.text, tone: $("tone").value, lang: $("lang").value, locked: lockedTerms(v.text) }, signal, usesQuick(v));
    if (signal.aborted) return;
    altBody.replaceChildren(...options.map((o) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "alt-opt"; b.textContent = o;
      b.addEventListener("click", () => applyAlt(v, start, end, sentence, o));
      return b;
    }));
    placeAlt(span);
    altBody.querySelector("button")?.focus();
  } catch (e) {
    if (signal.aborted || e.name === "AbortError") return;
    const p = document.createElement("p"); p.className = "alt-err"; p.textContent = e.userMessage || "Something went wrong. Please try again.";
    altBody.replaceChildren(p);
  }
}

async function applyAlt(v, start, end, oldSentence, newSentence) {
  if (v.text.slice(start, end) !== oldSentence) { closeAlt(); return; }
  v.text = v.text.slice(0, start) + newSentence + v.text.slice(end);
  state.example = false;
  closeAlt();
  if (usesQuick(v)) { renderAll(); setStatus("Sentence replaced."); return; }
  v.check = "pending"; renderAll();
  setStatus("Sentence replaced. Checking the meaning again…");
  try { v.check = await serverCheck(state.source, v.text, new AbortController().signal); setStatus("Sentence replaced."); }
  catch { v.check = null; setStatus("Sentence replaced. The meaning check could not run."); }
  renderAll();
}

output.addEventListener("click", (e) => { const s = e.target.closest(".sent"); if (s) openAlt(s); });
output.addEventListener("keydown", (e) => { const s = e.target.closest(".sent"); if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openAlt(s); } });
output.addEventListener("scroll", closeAlt);
$("alt-close").addEventListener("click", closeAlt);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !alt.hidden) closeAlt(); });
document.addEventListener("pointerdown", (e) => { if (!alt.hidden && !alt.contains(e.target) && !e.target.closest(".sent")) closeAlt(); });

// ---------- Run ----------
let ctl = null;
const goLabel = goBtn.querySelector("span"), goIcon = goBtn.querySelector("svg");
function setBusy(b) {
  goBtn.disabled = b; againBtn.disabled = b; stopBtn.hidden = !b;
  goBtn.classList.toggle("loading", b);
  goLabel.textContent = b ? "Writing…" : "Humanize";
  if (b) { const sp = document.createElement("i"); sp.className = "spin"; goIcon.replaceWith(sp); }
  else goBtn.querySelector(".spin")?.replaceWith(goIcon);
}

// On a phone the result sits below the input, so bring it into view.
function showResultOnPhone() {
  if (matchMedia("(max-width: 760px)").matches) output.closest(".sheet").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

// Quick mode: the rules run here, at once, with no network. Each run uses new seeds, so Regenerate gives new wording.
let quickRuns = 0;
function runQuick(src, count) {
  const settings = { engine: "quick", tone: $("tone").value, strength: seg("strength"), locked: lockedTerms() };
  const base = quickRuns++ * 10;
  closeAlt();
  const versions = Array.from({ length: count }, (_, i) => {
    const r = humanizeLocal(src, { ...settings, seed: base + i + 1 });
    return { text: r.text, engine: "quick", summary: summarize(r.changes), check: null, status: "done" };
  });
  state = { source: src, versions, active: 0, example: false, tab: "result" };
  renderAll();
  showResultOnPhone();
  output.classList.remove("fresh"); void output.offsetWidth; output.classList.add("fresh");
  setStatus(versions.some((v) => v.text !== src) ? "Done." : "Done. No AI patterns the rules know were found.");
  againBtn.hidden = false;
  const before = aiScore(src);
  renderHistory(addHistory({
    source: src, settings, aiBefore: before?.score ?? null,
    versions: versions.map((v) => ({ text: v.text, engine: "quick", summary: v.summary, check: null }))
  }));
}

async function run() {
  const src = input.value.trim();
  if (!src) { setStatus("Paste some text first.", true); input.focus(); return; }
  const n = words(src);
  if (n > wordLimit) { setStatus(`You can rewrite up to ${wordLimit} words at a time. This text has ${n}. Please split it into smaller parts.`, true); return; }

  const count = Number(seg("versions"));
  if (engine === "quick") return runQuick(src, count);
  const settings = { engine: "ai", tone: $("tone").value, strength: seg("strength"), lang: $("lang").value, purpose: $("purpose").value, sample: $("sample").value.trim(), locked: lockedTerms() };
  ctl = new AbortController();
  const signal = ctl.signal;
  setBusy(true);
  setStatus(count > 1 ? `Writing ${count} versions…` : "Thinking…");
  state = { source: src, versions: Array.from({ length: count }, () => ({ text: "", check: null, engine: "ai", status: "streaming" })), active: 0, example: false, tab: "result" };
  renderAll();
  showResultOnPhone();

  const rewrite = serverRewrite, check = serverCheck;

  // If the score is still high, rewrite once more with fixes for what the score found.
  // The retry replaces the first text only when it finished cleanly and scores lower; a stop, error or cut-off keeps the first.
  const improve = async (i, v) => {
    const first = aiScore(v.text);
    if (!shouldRetry(first, 0)) return;
    v.attempts = 2;
    if (!signal.aborted) setStatus(count > 1 ? `Improving version ${i + 1}…` : "Improving…");
    try {
      const { text, stop } = await rewrite({ ...settings, text: src, variant: i, feedback: first.keys }, signal, () => {});
      const second = aiScore(text.trim());
      if (stop === "end_turn" && second && second.score < first.score) { v.text = text.trim(); v.stop = stop; }
    } catch (e) {
      // Keep the first text on a stop or error.
    }
  };

  const one = async (i) => {
    const v = state.versions[i];
    try {
      const { text, stop } = await rewrite({ ...settings, text: src, variant: i }, signal, (t) => {
        v.text = t;
        if (state.active === i) renderOutput();
      });
      v.text = text.trim(); v.stop = stop;
      if (stop === "refusal") throw fail("Claude declined to rewrite this text.");
      if (!v.text) throw fail("No response came back. Please try again.");
      v.attempts = 1;
      await improve(i, v);
      v.status = "checking"; v.check = "pending"; renderAll();
      try { v.check = await check(src, v.text, signal); }
      catch (e) { v.check = null; if (e.name === "AbortError") throw e; }
      v.status = "done";
    } catch (e) {
      v.text = (e.partial || v.text || "").trim();
      v.status = e.name === "AbortError" ? (v.text ? "done" : "err") : "err";
      v.error = e.name === "AbortError" ? "Stopped." : e.userMessage || "Something went wrong.";
      if (v.check === "pending") v.check = null;
    } finally { renderAll(); }
  };

  await Promise.all(state.versions.map((_, i) => one(i)));
  setBusy(false);
  output.classList.remove("fresh"); void output.offsetWidth; output.classList.add("fresh");

  const good = state.versions.filter((v) => v.status === "done" && v.text);
  const bad = state.versions.filter((v) => v.status === "err");
  if (cur().status === "err" && good.length) state.active = state.versions.indexOf(good[0]);
  if (!good.length) setStatus(signal.aborted ? "Stopped." : bad[0]?.error || "Something went wrong.", !signal.aborted);
  else {
    const notes = [signal.aborted ? "Stopped." : "Done."];
    if (bad.length) notes.push(`${bad.length} version${bad.length === 1 ? "" : "s"} could not be created.`);
    if (good.some((v) => v.stop === "max_tokens")) notes.push("The text was cut off; try a shorter part.");
    setStatus(notes.join(" "));
    againBtn.hidden = false;
    const before = aiScore(src);
    renderHistory(addHistory({
      source: src, settings, aiBefore: before?.score ?? null,
      versions: good.map((v) => ({ text: v.text, check: v.check && v.check !== "pending" ? v.check : null }))
    }));
  }
  renderAll();
}
goBtn.addEventListener("click", run);
againBtn.addEventListener("click", run);
stopBtn.addEventListener("click", () => ctl?.abort());
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !goBtn.disabled) { e.preventDefault(); run(); } });

// ---------- Copy / reuse ----------
$("copy").addEventListener("click", async () => {
  const text = cur().text; if (!text) return;
  const label = $("copy").querySelector("span");
  try { await navigator.clipboard.writeText(text); label.textContent = "Copied"; }
  catch {
    state.tab = "result"; renderOutput();
    const r = document.createRange(); r.selectNodeContents(output); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    label.textContent = "Selected, press Ctrl+C";
  }
  setTimeout(() => { label.textContent = "Copy"; }, 2000);
});
$("download").addEventListener("click", () => {
  const text = cur().text; if (!text) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(makeDocx(text));
  a.download = `humanized-${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("use-version").textContent = "Edit this";
$("use-version").title = "Move this rewrite into the input to edit or humanize it again";
$("use-version").addEventListener("click", () => {
  input.value = cur().text; syncInput(); input.focus();
  setStatus("This version is now in the input. You can edit it or humanize it again.");
});

// ---------- File upload ----------
const fileInput = $("file");
fileInput.accept = ACCEPT;
$("upload").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ""; });

async function loadFile(file) {
  setStatus(`Reading ${file.name}…`);
  try {
    const text = await readTextFile(file);
    input.value = text; input.scrollTop = 0; syncInput(); renderChecks();
    const n = words(text);
    setStatus(n > wordLimit ? `Loaded ${n} words from ${file.name}. The limit is ${wordLimit} words at a time, so please remove some.` : `Loaded ${n} words from ${file.name}.`, n > wordLimit);
  } catch (e) { setStatus(e.message || "The file could not be read.", true); }
}

const editor = $("editor"), drop = $("drop");
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
editor.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.hidden = false; });
editor.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
editor.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
editor.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; drop.hidden = true;
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
// A file dropped outside the editor should not open in the tab.
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

// ---------- History ----------
const dialog = $("history");
const when = (t) => new Date(t).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const snippet = (s, n = 140) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

function renderHistory(list = loadHistory()) {
  const count = $("history-count");
  count.hidden = !list.length; count.textContent = String(list.length);
  $("history-empty").hidden = list.length > 0;
  $("history-clear").hidden = !list.length;
  $("history-list").replaceChildren(...list.map((h) => {
    const li = document.createElement("li"); li.className = "h-item";
    const meta = document.createElement("div"); meta.className = "h-meta";
    const a = document.createElement("span");
    a.textContent = `${when(h.at)} · ${MODE_NAMES[h.settings?.strength] || ""} · ${TONE_NAMES[h.settings?.tone] || ""}${h.versions.length > 1 ? ` · ${h.versions.length} versions` : ""}`;
    const after = aiScore(h.versions[0]?.text || "");
    const b = document.createElement("span");
    b.textContent = h.aiBefore != null && after ? `AI ${h.aiBefore} → ${after.score}` : "";
    meta.append(a, b);
    const p = document.createElement("p"); p.className = "h-text"; p.textContent = snippet(h.versions[0]?.text || h.source);
    const actions = document.createElement("div"); actions.className = "h-actions";
    const del = document.createElement("button"); del.type = "button"; del.className = "btn small ghost"; del.textContent = "Delete";
    del.addEventListener("click", () => renderHistory(removeHistory(h.id)));
    const open = document.createElement("button"); open.type = "button"; open.className = "btn small"; open.textContent = "Open";
    open.addEventListener("click", () => restore(h));
    actions.append(del, open);
    li.append(meta, p, actions);
    return li;
  }));
}

function restore(h) {
  input.value = h.source; syncInput();
  if (h.settings) {
    $("tone").value = h.settings.tone || "natural"; $("lang").value = h.settings.lang || "same"; $("purpose").value = h.settings.purpose || "general"; $("sample").value = h.settings.sample || ""; showSampleCount(); setSeg("strength", h.settings.strength);
    showModeDesc();
  }
  setSeg("versions", String(Math.min(3, Math.max(1, h.versions.length))));
  // Entries saved before Quick mode existed were AI rewrites.
  const used = h.settings?.engine || "ai";
  setEngine(used);
  state = { source: h.source, versions: h.versions.map((v) => ({ ...v, engine: v.engine || used, status: "done" })), active: 0, example: false, tab: "result" };
  renderAll();
  setStatus(`Opened the rewrite from ${when(h.at)}.`);
  dialog.close();
  scrollTo({ top: 0 });
}

$("open-history").addEventListener("click", () => { renderHistory(); dialog.showModal(); });
$("history-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
let confirmTimer = null;
$("history-clear").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  if (btn.dataset.confirm !== "1") {
    btn.dataset.confirm = "1"; btn.textContent = "Sure? Click again";
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "Clear all"; }, 3000);
    return;
  }
  btn.dataset.confirm = ""; btn.textContent = "Clear all";
  renderHistory(clearHistory());
});


// ---------- Samples below the tool: real Quick engine output, made on page load ----------
const SAMPLES = [
  { label: "Email", text: "I hope this email finds you well. I am writing to follow up on our recent conversation regarding the upcoming product launch. As discussed, it is crucial that we align on the key milestones before the end of the month. Additionally, I would like to schedule a meeting to review the marketing strategy in detail. Please let me know your availability at your earliest convenience." },
  { label: "Essay", text: "Remote work has fundamentally transformed the way organizations operate in the modern era. Employees can now collaborate seamlessly from anywhere in the world. Furthermore, this flexibility offers numerous advantages, including reduced commuting time and improved work-life balance. However, it is important to note that remote work also presents unique challenges. In conclusion, organizations must strike a balance between flexibility and connection." },
  { label: "বাংলা", lang: "bn", text: "বর্তমান যুগে মোবাইল ফোন আমাদের দৈনন্দিন জীবনে অপরিহার্য হয়ে উঠেছে। এর মাধ্যমে আমরা সহজেই যোগাযোগ করতে পারি এবং বিভিন্ন তথ্য জানতে পারি। তাছাড়া শিক্ষা ও ব্যবসার বিভিন্ন ক্ষেত্রে মোবাইল ফোন গুরুত্বপূর্ণ ভূমিকা পালন করে। তবে অতিরিক্ত ব্যবহার আমাদের স্বাস্থ্যের জন্য ক্ষতিকর হতে পারে। পরিশেষে বলা যায় যে, সঠিক ব্যবহারই মোবাইল ফোনকে আশীর্বাদে পরিণত করে।" }
];

function renderSamples() {
  const box = $("samples");
  if (!box) return;
  box.replaceChildren(...SAMPLES.map((s) => {
    const run = humanizeLocal(s.text, { strength: "strong", seed: 1 });
    const before = aiScore(s.text), after = aiScore(run.text);
    const card = document.createElement("article");
    card.className = "sample";
    if (s.lang) card.lang = s.lang;
    const score = (r) => (r ? `<span class="ai-badge ${r.tone}">AI ${r.score}%</span>` : "");
    card.innerHTML = `<div class="sample-head"><h3>${html(s.label)}</h3><button type="button" class="link-btn sample-try">Try this text</button></div>
      <div class="sample-side"><div class="sample-label"><span>Before</span>${score(before)}</div><p>${markAI(s.text)}</p></div>
      <div class="sample-side after"><div class="sample-label"><span>After</span>${score(after)}</div><p>${html(run.text)}</p></div>`;
    card.querySelector(".sample-try").addEventListener("click", () => {
      input.value = s.text; syncInput(); syncExample(); renderChecks();
      document.getElementById("top").scrollIntoView({ behavior: "smooth" });
      input.focus({ preventScroll: true });
    });
    return card;
  }));
}

// ---------- Boot with the example loaded ----------
input.value = EXAMPLE_IN;
showModeDesc();
syncInput();
moveThumbs();
requestAnimationFrame(() => requestAnimationFrame(() => segs.forEach((s) => s.classList.remove("no-anim"))));
document.fonts?.ready.then(moveThumbs);
renderAll();
renderHistory();
renderSamples();
setEngine("quick");
detectServer();
