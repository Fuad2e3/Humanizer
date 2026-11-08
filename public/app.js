import { parseOptions, rewriteRequest, checkRequest, readCheck, describeError, FREE_WORD_LIMIT, OWN_KEY_WORD_LIMIT } from "./core.js";
import { markAI, findAI, words, sentences, spread, numbersIn, diffHTML } from "./text.js";
import { aiScore, MIN_WORDS } from "./detect.js";
import { readTextFile, ACCEPT } from "./files.js";
import { loadHistory, addHistory, removeHistory, clearHistory } from "./history.js";

const $ = (id) => document.getElementById(id);
const input = $("input"), output = $("output"), backdropInner = $("backdrop-inner");
const status = $("status"), goBtn = $("go"), againBtn = $("again"), stopBtn = $("stop");

const EXAMPLE_IN = "In today's fast-paced world, social media plays a vital role in shaping how young people communicate. Moreover, it is important to note that platforms like Facebook and TikTok have fundamentally transformed the landscape of friendship. Furthermore, studies show that 62% of teenagers in Bangladesh use social media for more than 3 hours a day. In conclusion, social media is a double-edged sword that offers both opportunities and challenges.";
const EXAMPLE_OUT = "Social media has changed how young people talk to each other. Facebook and TikTok? They've reshaped what friendship even looks like. In Bangladesh, studies show 62% of teenagers spend more than 3 hours a day on these apps. That's a lot of time. It brings real opportunities, and real problems too.";
const EXAMPLE_CHECK = { score: 94, verdict: "All the main ideas and facts are kept; only the 'double-edged sword' phrase is said more plainly.", missing: [], added: [] };

const MODE_NAMES = { light: "Light", medium: "Balanced", strong: "Deep" };
const TONE_NAMES = { natural: "Natural", casual: "Casual", formal: "Formal", academic: "Academic", blog: "Blog" };

// ---------- State ----------
let state = {
  source: EXAMPLE_IN,
  versions: [{ text: EXAMPLE_OUT, check: EXAMPLE_CHECK, status: "done" }],
  active: 0,
  example: true,
  tab: "result"
};
const cur = () => state.versions[state.active] || { text: "", check: null, status: "idle" };
let wordLimit = FREE_WORD_LIMIT;

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

const lockedTerms = () => $("locked").value.split(",").map((s) => s.trim()).filter(Boolean);

// Mode description under the toolbar, and the locked-words panel
const showModeDesc = () => { $("mode-desc").textContent = $("strength").querySelector('[aria-pressed="true"]').dataset.desc || ""; };
$("strength").addEventListener("click", showModeDesc);
const showLockCount = () => { $("lock-count").textContent = String(lockedTerms().length); };
$("locked").addEventListener("input", showLockCount);
$("opt-toggle").addEventListener("click", () => {
  const open = $("opt-toggle").getAttribute("aria-expanded") !== "true";
  $("opt-toggle").setAttribute("aria-expanded", String(open));
  $("opts").hidden = !open;
  if (open) $("locked").focus();
});

// ---------- Input, highlight, word counter ----------
function syncInput() {
  backdropInner.innerHTML = markAI(input.value) + "\n ";
  backdropInner.style.transform = `translateY(${-input.scrollTop}px)`;
  const n = words(input.value);
  $("wc-text").textContent = `${n.toLocaleString()} / ${wordLimit.toLocaleString()} words`;
  $("wc-bar").style.width = Math.min(100, (n / wordLimit) * 100) + "%";
  $("wc-text").parentElement.classList.toggle("over", n > wordLimit);
  setBadge($("in-ai"), aiScore(input.value));
  $("empty").hidden = input.value.length > 0;
}
input.addEventListener("input", () => { syncInput(); renderChecks(); });
input.addEventListener("scroll", () => { backdropInner.style.transform = `translateY(${-input.scrollTop}px)`; });
$("locked").addEventListener("input", renderChecks);
$("clear").addEventListener("click", () => { input.value = ""; syncInput(); renderChecks(); input.focus(); });

function setBadge(el, r) {
  el.className = "ai-badge" + (r ? " " + r.tone : "");
  el.textContent = r ? `AI ${r.score}%` : "AI —";
  el.title = r ? `AI score estimate: ${r.label}` : `The AI score needs at least ${MIN_WORDS} words`;
}

// Empty-state actions
$("paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) { setStatus("The clipboard is empty."); return; }
    input.value = text; syncInput(); renderChecks(); input.focus();
  } catch { input.focus(); setStatus("Press Ctrl+V (or ⌘V) to paste."); }
});
$("upload2").addEventListener("click", () => $("file").click());
$("try-example").addEventListener("click", () => { input.value = EXAMPLE_IN; syncInput(); renderChecks(); input.focus(); });

// ---------- Output ----------
function renderOutput() {
  const v = cur();
  $("example-badge").hidden = !state.example;
  const has = !!v.text;
  output.classList.toggle("placeholder", !has);
  if (!has) output.textContent = v.status === "err" ? (v.error || "This version could not be created.") : v.status === "streaming" ? "" : "Paste your text, then press “Humanize”.";
  else if (state.tab === "diff") output.innerHTML = diffHTML(state.source, v.text);
  else output.innerHTML = markAI(v.text);
  output.classList.toggle("streaming", v.status === "streaming");
  $("out-count").textContent = has ? `${words(v.text)} words · ${sentences(v.text).length} sentences` : "";
  $("tab-result").setAttribute("aria-selected", String(state.tab === "result"));
  $("tab-diff").setAttribute("aria-selected", String(state.tab === "diff"));
  moveThumb($("tab-result").parentElement);
  $("use-version").hidden = !has || state.example || v.status === "streaming";
  setBadge($("out-ai"), has && v.status !== "streaming" ? aiScore(v.text) : null);
  $("copy").classList.toggle("accent", has && !state.example && v.status !== "streaming");
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

function renderAI(src, out) {
  const before = aiScore(src), after = out ? aiScore(out) : null;
  const meter = (bar, num, r) => {
    $(bar).style.width = (r ? r.score : 0) + "%";
    $(bar).className = r ? r.tone : "";
    countTo($(num), r ? r.score : null);
  };
  meter("ai-before-bar", "ai-before-num", before);
  meter("ai-after-bar", "ai-after-num", after);
  const show = after || before;
  if (!show) { setPill("ai-pill", "idle", "—"); $("ai-signals").textContent = `The AI score needs at least ${MIN_WORDS} words.`; return; }
  if (after && before) {
    const drop = before.score - after.score;
    setPill("ai-pill", after.tone, drop > 0 ? `${drop} points lower` : after.label);
  } else setPill("ai-pill", show.tone, show.label);
  $("ai-signals").textContent = show.signals.length
    ? `Why ${after ? "the rewrite" : "your text"} looks AI-written: ${show.signals.join(", ")}.`
    : `No common AI patterns found in ${after ? "the rewrite" : "your text"}.`;
}

function renderChecks() {
  const v = cur(), out = v.status === "streaming" ? "" : v.text;
  const src = out ? state.source : input.value;
  renderAI(src, out);

  const inAI = findAI(src), outAI = out ? findAI(out) : null;
  const target = outAI ?? inAI, total = [...target.values()].reduce((a, b) => a + b, 0);
  $("a-chips").replaceChildren(...[...target.entries()].map(([k, c]) => chip(c > 1 ? `${k} ×${c}` : k)));
  if (outAI) {
    const before = [...inAI.values()].reduce((a, b) => a + b, 0);
    setPill("a-pill", total === 0 ? "ok" : total <= 2 ? "warn" : "bad", total === 0 ? "Clean" : `${total} left`);
    $("a-note").textContent = `${before} in the original, ${total} in the rewrite.`;
  } else {
    setPill("a-pill", total === 0 ? "ok" : "warn", `${total} found`);
    $("a-note").textContent = total ? "These show up a lot in AI-written text." : "No common AI phrases found.";
  }

  const lin = sentences(src).map(words), lout = out ? sentences(out).map(words) : [];
  const maxLen = Math.max(1, ...lin, ...lout);
  const bars = (el, arr) => el.replaceChildren(...arr.slice(0, 40).map((n) => { const i = document.createElement("i"); i.style.height = Math.max(6, (n / maxLen) * 100) + "%"; i.title = n + " words"; return i; }));
  bars($("r-in"), lin); bars($("r-out"), lout);
  const sIn = spread(lin), sOut = spread(lout);
  if (out && lout.length > 1) {
    const pct = Math.round(sOut * 100);
    setPill("r-pill", sOut >= 0.35 ? "ok" : sOut >= 0.2 ? "warn" : "bad", `Variation ${pct}%`);
    $("r-note").textContent = `Sentence length variation: ${Math.round(sIn * 100)}% before, ${pct}% after. Above 35% reads as natural.`;
  } else {
    setPill("r-pill", "idle", lin.length > 1 ? `Variation ${Math.round(sIn * 100)}%` : "—");
    $("r-note").textContent = "People mix short and long sentences. AI sentences tend to be the same length.";
  }

  const fChips = $("f-chips"); fChips.replaceChildren();
  let miss = 0;
  const items = [...numbersIn(src).map((n) => ({ t: n })), ...lockedTerms().filter((t) => src.toLowerCase().includes(t.toLowerCase())).map((t) => ({ t }))];
  if (!items.length) { setPill("f-pill", "idle", "—"); $("f-note").textContent = "No numbers or locked words in the text."; }
  else if (!out) { items.forEach((x) => fChips.append(chip(x.t))); setPill("f-pill", "idle", `${items.length} to check`); $("f-note").textContent = "After the rewrite, each one is checked."; }
  else {
    items.forEach((x) => { const ok = out.toLowerCase().includes(x.t.toLowerCase()); if (!ok) miss++; fChips.append(chip((ok ? "✓ " : "✗ ") + x.t, ok ? "kept" : "missing")); });
    setPill("f-pill", miss ? "bad" : "ok", miss ? `${miss} missing` : "All kept");
    $("f-note").textContent = miss ? "The red ones are missing from the rewrite. Try again or fix them by hand." : "Every number and locked word is kept exactly.";
  }
  renderMeaning(v);
}


function renderMeaning(v) {
  const c = v.check, detail = $("m-detail"); detail.replaceChildren();
  const ring = (n) => { $("m-ring").style.strokeDashoffset = String(169.6 * (1 - (n ?? 0) / 100)); countTo($("m-num"), n ?? null); };
  if (c === "pending") { ring(null); setPill("m-pill", "idle", "Checking…"); $("m-verdict").textContent = "Claude is comparing the rewrite with the original…"; return; }
  if (!c) {
    ring(null); setPill("m-pill", "idle", "—");
    $("m-verdict").textContent = v.text && v.status !== "streaming" ? "The meaning check could not be completed." : "After the rewrite, Claude compares it with the original to check that no ideas were lost.";
    return;
  }
  ring(c.score);
  setPill("m-pill", c.score >= 90 ? "ok" : c.score >= 75 ? "warn" : "bad", c.score >= 90 ? "Preserved" : c.score >= 75 ? "Mostly kept" : "Meaning changed");
  $("m-verdict").textContent = c.verdict || "";
  const list = (title, arr) => {
    if (!arr || !arr.length) return;
    const h = document.createElement("span"); h.className = "label"; h.textContent = title;
    const ul = document.createElement("ul"); arr.forEach((x) => { const li = document.createElement("li"); li.textContent = x; ul.append(li); });
    detail.append(h, ul);
  };
  list("Lost", c.missing); list("Added", c.added);
}

function renderAll() { renderVersionTabs(); renderOutput(); renderChecks(); }

// ---------- Where Claude runs ----------
// "server": our /api (Vercel or npm start). "browser": the visitor's own key, for static hosts like GitHub Pages.
let mode = "server", Anthropic = null;
const KEY_STORE = "humanizer-key";
const keyStore = {
  get() { try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; } },
  set(v) { try { v ? localStorage.setItem(KEY_STORE, v) : localStorage.removeItem(KEY_STORE); } catch {} }
};

async function detectMode() {
  try {
    const r = await fetch("api/health", { cache: "no-store" });
    if (r.ok) {
      const h = await r.json();
      if (h.ok) {
        if (Number.isInteger(h.wordLimit) && h.wordLimit > 0) wordLimit = h.wordLimit;
        if (!h.configured) setStatus("The server has no API key set, so rewrites will not work.", true);
        syncInput();
        return;
      }
    }
  } catch {}
  mode = "browser";
  wordLimit = OWN_KEY_WORD_LIMIT;
  $("keybar").hidden = false;
  const saved = keyStore.get();
  if (saved) { $("apikey").value = saved; $("remember").checked = true; }
  syncInput();
}
$("apikey").addEventListener("input", () => { if ($("remember").checked) keyStore.set($("apikey").value.trim()); });
$("remember").addEventListener("change", () => keyStore.set($("remember").checked ? $("apikey").value.trim() : ""));
$("forget").addEventListener("click", () => { $("apikey").value = ""; $("remember").checked = false; keyStore.set(""); $("apikey").focus(); });

async function browserClient() {
  const apiKey = $("apikey").value.trim();
  if (!apiKey) { $("apikey").focus(); throw fail("Enter your Claude API key above first."); }
  if (!Anthropic) Anthropic = (await import("./vendor/anthropic.js")).default;
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}
const toUserError = (e, signal, partial) => {
  if (signal.aborted) return new DOMException("Cancelled", "AbortError");
  const err = fail(describeError(e, Anthropic)[1]); err.partial = partial; return err;
};

async function browserRewrite(body, signal, onText) {
  let opts;
  try { opts = parseOptions(body, { maxWords: wordLimit }); } catch (e) { throw fail(e.message); }
  const client = await browserClient();
  let text = "";
  try {
    const stream = client.beta.messages.stream(rewriteRequest(opts), { signal });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { text += ev.delta.text; onText(text); }
    }
    return { text, stop: (await stream.finalMessage()).stop_reason };
  } catch (e) { throw toUserError(e, signal, text); }
}

async function browserCheck(original, rewrite, signal) {
  const client = await browserClient();
  let result;
  try { result = readCheck(await client.beta.messages.create(checkRequest(original, rewrite), { signal })); }
  catch (e) { throw toUserError(e, signal); }
  if (!result) throw fail("The meaning check could not be completed.");
  return result;
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

async function run() {
  const src = input.value.trim();
  if (!src) { setStatus("Paste some text first.", true); input.focus(); return; }
  const n = words(src);
  if (n > wordLimit) { setStatus(`You can rewrite up to ${wordLimit} words at a time. This text has ${n}. Please split it into smaller parts.`, true); return; }

  const count = Number(seg("versions"));
  const settings = { tone: $("tone").value, strength: seg("strength"), lang: "en", locked: lockedTerms() };
  ctl = new AbortController();
  const signal = ctl.signal;
  setBusy(true);
  setStatus(count > 1 ? `Writing ${count} versions…` : "Thinking…");
  state = { source: src, versions: Array.from({ length: count }, () => ({ text: "", check: null, status: "streaming" })), active: 0, example: false, tab: "result" };
  renderAll();
  // On a phone the result sits below the input, so bring it into view.
  if (matchMedia("(max-width: 760px)").matches) output.closest(".sheet").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

  const rewrite = mode === "server" ? serverRewrite : browserRewrite;
  const check = mode === "server" ? serverCheck : browserCheck;

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
    $("tone").value = h.settings.tone || "natural"; setSeg("strength", h.settings.strength);
    if (h.settings.locked) $("locked").value = h.settings.locked.join(", ");
    showModeDesc(); showLockCount();
  }
  setSeg("versions", String(Math.min(3, Math.max(1, h.versions.length))));
  state = { source: h.source, versions: h.versions.map((v) => ({ ...v, status: "done" })), active: 0, example: false, tab: "result" };
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

// ---------- Boot with the example loaded ----------
input.value = EXAMPLE_IN;
showModeDesc(); showLockCount();
syncInput();
moveThumbs();
requestAnimationFrame(() => requestAnimationFrame(() => segs.forEach((s) => s.classList.remove("no-anim"))));
document.fonts?.ready.then(moveThumbs);
renderAll();
renderHistory();
detectMode();
