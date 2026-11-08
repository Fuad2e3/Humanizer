import { test } from "node:test";
import assert from "node:assert/strict";
import { aiScore } from "../public/detect.js";
import { STOCK_AI_EN, CASUAL_EN, STOCK_AI_BN, REPEATED_EN } from "./fixtures.mjs";

test("stock AI English scores AI-like", () => {
  const r = aiScore(STOCK_AI_EN);
  assert.ok(r.score > 60, `score ${r.score}`);
  assert.ok(r.keys.includes("phrases"));
  assert.ok(r.keys.includes("starters"));
});

test("casual human English scores human-like", () => {
  const r = aiScore(CASUAL_EN);
  assert.ok(r.score <= 30, `score ${r.score}`);
});

test("stock AI Bangla is detected", () => {
  const r = aiScore(STOCK_AI_BN);
  assert.ok(r.keys.includes("phrases"), JSON.stringify(r));
  assert.ok(r.score > 45, `score ${r.score}`);
});

test("repeated words raise the repeat signal", () => {
  assert.ok(aiScore(REPEATED_EN).keys.includes("repeat"));
});

test("short text returns null", () => {
  assert.equal(aiScore("Too short."), null);
});

test("keys and signals line up", () => {
  for (const t of [STOCK_AI_EN, CASUAL_EN, STOCK_AI_BN, REPEATED_EN]) {
    const r = aiScore(t);
    assert.equal(r.keys.length, r.signals.length);
  }
});

import { shouldRetry, RETRY_THRESHOLD, MAX_RETRIES } from "../public/detect.js";

test("shouldRetry", () => {
  assert.equal(RETRY_THRESHOLD, 45);
  assert.equal(MAX_RETRIES, 1);
  assert.equal(shouldRetry(null, 0), false);
  assert.equal(shouldRetry({ score: 70 }, 0), true);
  assert.equal(shouldRetry({ score: 70 }, 1), false);
  assert.equal(shouldRetry({ score: 40 }, 0), false);
});

test("short text never triggers a retry", () => {
  assert.equal(shouldRetry(aiScore("Moreover, this is crucial."), 0), false);
});
