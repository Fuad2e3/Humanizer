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
export async function openPage(responses) {
  const page = await browser.newPage();
  const calls = [];
  await page.route("**/api/check", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(CHECK) }));
  await page.route("**/api/rewrite", (r) => {
    const body = JSON.parse(r.request().postData());
    calls.push(body);
    const text = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (text === null) return; // never answers
    r.fulfill({ contentType: "application/x-ndjson", body: ndjson(text) });
  });
  await page.goto(BASE);
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
