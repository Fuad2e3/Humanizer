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
