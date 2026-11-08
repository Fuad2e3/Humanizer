import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequest, sentenceRequest, rewriteRequest, parseOptions, parseSentence, InputError } from "../public/core.js";

test("checkRequest uses the fast model by default", () => {
  assert.equal(checkRequest("a", "b").model, "claude-haiku-5-5");
});

test("sentenceRequest uses the fast model by default", () => {
  const opts = parseSentence({ sentence: "Hi there.", context: "Hi there. Bye." });
  assert.equal(sentenceRequest(opts).model, "claude-haiku-5-5");
});

test("rewriteRequest still uses the default model", () => {
  assert.equal(rewriteRequest(parseOptions({ text: "hello world" })).model, "claude-opus-5-5");
});

test("parseOptions rejects empty text", () => {
  assert.throws(() => parseOptions({ text: "  " }), InputError);
});

test("parseOptions caps locked terms", () => {
  const locked = Array.from({ length: 40 }, (_, i) => `term${i}`);
  assert.equal(parseOptions({ text: "hi", locked }).locked.length, 30);
});
