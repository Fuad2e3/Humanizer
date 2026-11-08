// Drives the real page with the /api routes mocked, so no API key is needed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { STOCK_AI_EN, CASUAL_EN } from "./fixtures.mjs";

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch {}
const skip = chromium ? false : "Playwright is not installed";

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/`;
let server, browser;

before(async () => {
  if (skip) return;
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: "test" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((ok) => server.stdout.on("data", (d) => String(d).includes("running") && ok()));
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

const ndjson = (text) => JSON.stringify({ t: text }) + "\n" + JSON.stringify({ done: true, stop: "end_turn" }) + "\n";
const CHECK = { score: 95, verdict: "Same meaning.", missing: [], added: [] };

// Opens the page; `responses` are rewrite bodies in call order (a function returning null hangs).
// engine: "ai" picks the server engine after load (the default for the API tests); "quick" stays in Quick mode.
// static: true answers /api/health with 404, as GitHub Pages does.
export async function openPage(responses, { engine = "ai", static: isStatic = false } = {}) {
  const page = await browser.newPage();
  const calls = [];
  if (isStatic) await page.route("**/api/health", (r) => r.fulfill({ status: 404, body: "Not found" }));
  await page.route("**/api/check", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(CHECK) }));
  await page.route("**/api/rewrite", (r) => {
    const body = JSON.parse(r.request().postData());
    calls.push(body);
    const text = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (text === null) return; // never answers
    if (typeof text === "object") return r.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ t: text.partial }) + "\n" }); // cut off: no done line
    r.fulfill({ contentType: "application/x-ndjson", body: ndjson(text) });
  });
  await page.goto(BASE);
  if (engine === "ai") { await page.waitForSelector("#engine:not([hidden])"); await page.click('#engine [data-v="ai"]'); }
  return { page, calls };
}

const outputText = (page) => page.$eval("#output", (el) => el.textContent.replace(/\s+/g, " ").trim());
const norm = (s) => s.replace(/\s+/g, " ").trim();
const finished = (page) => page.waitForFunction(() => !document.getElementById("go").disabled && /Done|Stopped/.test(document.getElementById("status").textContent));

async function humanize(page, text = STOCK_AI_EN) {
  await page.fill("#input", text);
  await page.click("#go");
}

test("retries once when the first score is high", { skip }, async () => {
  const { page, calls } = await openPage([STOCK_AI_EN, CASUAL_EN]);
  await humanize(page);
  await finished(page);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].feedback.length > 0);
  assert.equal(await outputText(page), norm(CASUAL_EN));
  await page.close();
});

test("keeps the first version when the retry is worse", { skip }, async () => {
  const worse = STOCK_AI_EN + " Moreover, it is crucial to leverage robust and seamless tools in this pivotal landscape today.";
  const { page, calls } = await openPage([STOCK_AI_EN, worse]);
  await humanize(page);
  await finished(page);
  assert.equal(calls.length, 2);
  assert.equal(await outputText(page), norm(STOCK_AI_EN));
  await page.close();
});

test("no retry for a good first score", { skip }, async () => {
  const { page, calls } = await openPage([CASUAL_EN]);
  await humanize(page);
  await finished(page);
  assert.equal(calls.length, 1);
  await page.close();
});

test("stop during retry keeps the first version", { skip }, async () => {
  const { page, calls } = await openPage([STOCK_AI_EN, null]);
  await humanize(page);
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("Improving"));
  assert.equal(calls.length, 2);
  await page.click("#stop");
  await finished(page);
  assert.equal(await outputText(page), norm(STOCK_AI_EN));
  const err = await page.$eval("#status", (el) => el.classList.contains("err") || el.classList.contains("error"));
  assert.equal(err, false);
  await page.close();
});

test("sends the chosen language", { skip }, async () => {
  const { page, calls } = await openPage([CASUAL_EN]);
  await page.selectOption("#lang", "bn");
  await humanize(page);
  await finished(page);
  assert.equal(calls[0].lang, "bn");
  await page.close();
});

test("sends purpose and sample", { skip }, async () => {
  const { page, calls } = await openPage([CASUAL_EN]);
  await page.selectOption("#purpose", "essay");
  await page.click("#opt-toggle");
  await page.fill("#sample", "This is how I write.");
  await humanize(page);
  await finished(page);
  assert.equal(calls[0].purpose, "essay");
  assert.equal(calls[0].sample, "This is how I write.");
  await page.close();
});

const statusText = (page) => page.$eval("#status", (el) => el.textContent);

test("reads text from a PDF", { skip }, async () => {
  const { page } = await openPage([CASUAL_EN]);
  await page.setInputFiles("#file", "tests/fixtures/sample.pdf");
  await page.waitForFunction(() => /Loaded|PDF|support/.test(document.getElementById("status").textContent));
  assert.equal((await page.inputValue("#input")).trim(), "Hello from a PDF.", await statusText(page));
  await page.close();
});

test("explains a PDF with no text layer", { skip }, async () => {
  const { page } = await openPage([CASUAL_EN]);
  await page.setInputFiles("#file", "tests/fixtures/scanned.pdf");
  await page.waitForFunction(() => /Loaded|PDF|support/.test(document.getElementById("status").textContent));
  assert.equal(await statusText(page), "No text was found in this PDF. It may be a scanned image.");
  await page.close();
});

test("downloads the result as a .docx", { skip }, async () => {
  const { page } = await openPage([CASUAL_EN]);
  await humanize(page);
  await finished(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  assert.match(download.suggestedFilename(), /^humanized-\d{4}-\d{2}-\d{2}\.docx$/);
  await page.close();
});

test("a cut-off retry does not replace a complete first version", { skip }, async () => {
  const { page, calls } = await openPage([STOCK_AI_EN, { partial: CASUAL_EN }]);
  await humanize(page);
  await finished(page);
  assert.equal(calls.length, 2);
  assert.equal(await outputText(page), norm(STOCK_AI_EN));
  await page.close();
});

// ---------- Quick mode (local rules) ----------
test("no API key bar on a static host", { skip }, async () => {
  const { page } = await openPage([], { engine: "quick", static: true });
  await page.waitForLoadState("networkidle");
  assert.equal(await page.$("#keybar"), null);
  assert.equal(await page.isVisible("#engine"), false);
  await page.close();
});

test("quick mode humanizes without any network call", { skip }, async () => {
  const { page } = await openPage([], { engine: "quick", static: true });
  await page.waitForLoadState("networkidle");
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await humanize(page);
  await finished(page);
  assert.notEqual(await outputText(page), norm(STOCK_AI_EN));
  const badge = await page.textContent("#out-ai");
  assert.ok(Number(badge.match(/\d+/)[0]) <= 30, badge);
  assert.deepEqual(requests, []);
  assert.match(await page.textContent("#report"), /Changes/);
  await page.close();
});

test("three quick versions differ", { skip }, async () => {
  const { page } = await openPage([], { engine: "quick", static: true });
  await page.click('#versions [data-v="3"]');
  await humanize(page);
  await finished(page);
  const texts = [];
  for (const i of [0, 1, 2]) { await page.click(`#vtabs .vtab >> nth=${i}`); texts.push(await outputText(page)); }
  assert.equal(new Set(texts).size, 3);
  await page.close();
});

test("sentence click offers local options", { skip }, async () => {
  const { page } = await openPage([], { engine: "quick", static: true });
  await humanize(page, "Moreover, it is crucial to leverage robust tools. " + CASUAL_EN);
  await finished(page);
  await page.click("#output .sent >> nth=0");
  await page.waitForSelector("#alt-body .alt-opt");
  assert.ok((await page.$$("#alt-body .alt-opt")).length >= 1);
  await page.close();
});

test("history saves a quick run", { skip }, async () => {
  const { page } = await openPage([], { engine: "quick", static: true });
  await humanize(page);
  await finished(page);
  const saved = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /hist/i.test(k))?.[1] || "");
  assert.match(saved, /"engine":"quick"/);
  await page.close();
});

test("with a server the engine choice appears and AI uses the API", { skip }, async () => {
  const { page, calls } = await openPage([CASUAL_EN], { engine: "ai" });
  assert.equal(await page.isVisible("#engine"), true);
  await humanize(page, CASUAL_EN);
  await finished(page);
  assert.equal(calls.length, 1);
  await page.close();
});
