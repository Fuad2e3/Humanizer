import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_PHRASES } from "../public/core.js";
import { PHRASES, WORDS, WORDY, OPENERS, BN_PHRASES, SKIP } from "../public/rules-data.js";
import { rng, makePick, protect, replacePhrases, swapWords, dropOpeners, contract, fixDashes, tidy } from "../public/rules.js";

const first = (options) => options[0];
const none = () => "";
const latin = (p) => /^[\x00-\x7f]+$/.test(p);

test("every English AI phrase has a rule", () => {
  const openers = new Set(Object.keys(OPENERS).map((k) => k.toLowerCase()));
  for (const p of AI_PHRASES.filter(latin)) {
    if (SKIP[p] || openers.has(p)) continue;
    const out = tidy(swapWords(replacePhrases(p, first).text, first).text).text;
    assert.notEqual(out.toLowerCase(), p, `no rule for "${p}"`);
  }
});

test("skipped phrases say why", () => {
  for (const [p, why] of Object.entries(SKIP)) assert.ok(why.length > 10, p);
});

test("every Bangla AI phrase has a rule", () => {
  for (const p of AI_PHRASES.filter((p) => !latin(p))) {
    const out = tidy(replacePhrases(p, first).text).text;
    assert.notEqual(out, p, `no rule for "${p}"`);
  }
});

test("tables are big enough", () => {
  assert.ok(WORDS.length >= 40, `WORDS has ${WORDS.length}`);
  assert.ok(WORDY.length >= 20, `WORDY has ${WORDY.length}`);
  assert.ok(PHRASES.length >= 40, `PHRASES has ${PHRASES.length}`);
  assert.ok(BN_PHRASES.length >= 20, `BN_PHRASES has ${BN_PHRASES.length}`);
});

test("protect round-trips", () => {
  const input = `Sales rose 62% to 3,000 units. See https://x.com/a?b=1 or mail a@b.co, ping @rahim #ai. He said "it is crucial" and \`robust\` code. Robust Systems Ltd agrees.`;
  const p = protect(input, ["Robust Systems Ltd"]);
  for (const s of ["62%", "3,000", "https://x.com/a?b=1", "a@b.co", "@rahim", "#ai", '"it is crucial"', "`robust`", "Robust Systems Ltd"]) {
    assert.ok(!p.text.includes(s), `still visible: ${s}`);
  }
  assert.equal(p.restore(p.text), input);
});

test("a locked term is never changed", () => {
  const p = protect("Robust Systems Ltd is robust.", ["Robust Systems Ltd"]);
  const out = p.restore(swapWords(p.text, first).text);
  assert.ok(out.startsWith("Robust Systems Ltd is "), out);
  assert.ok(!out.endsWith("robust."), out);
});

test("dropping an opener capitalizes the next word", () => {
  assert.equal(tidy(dropOpeners("Moreover, the plan works.", none).text).text, "The plan works.");
});

test("an opener is only dropped at the start of a sentence", () => {
  assert.equal(tidy(dropOpeners("It works, moreover, it is cheap.", none).text).text, "It works, moreover, it is cheap.");
});

test("deleting a phrase leaves no stray punctuation", () => {
  assert.equal(tidy(replacePhrases("It is important to note that sales rose.", none).text).text, "Sales rose.");
  assert.equal(tidy(replacePhrases("In conclusion, prices fell.", none).text).text, "Prices fell.");
});

test("tidy does not touch text it did not change", () => {
  assert.equal(tidy("iPhone sales rose.  see below").text, "iPhone sales rose.  see below");
});

test("contractions skip clause ends", () => {
  assert.equal(contract("It is fine. Whatever it is. Yes, it is!").text, "It's fine. Whatever it is. Yes, it is!");
  assert.equal(contract("We do not know. They cannot stay.").text, "We don't know. They can't stay.");
});

test("dashes become commas", () => {
  const out = fixDashes("Fast — and cheap—really.").text;
  assert.ok(!out.includes("—"), out);
  assert.equal(fixDashes("From 2010–2020.").text, "From 2010–2020.");
});

test("case is kept", () => {
  assert.equal(swapWords("Utilize it. utilize it.", () => "use").text, "Use it. use it.");
});

test("verb forms are swapped", () => {
  const out = swapWords("She leverages data, leveraged tools and is leveraging AI.", first).text;
  assert.ok(!/leverag/i.test(out), out);
});

test("wordy phrases get shorter", () => {
  const out = swapWords("In order to win, we made a decision due to the fact that time was short.", first).text;
  assert.equal(out, "To win, we decided because time was short.");
});

test("Bangla phrases are replaced", () => {
  const out = tidy(replacePhrases("তাছাড়া বর্তমান যুগে সবাই ফোন ব্যবহার করে।", first).text).text;
  assert.ok(!out.includes("তাছাড়া") && !out.includes("বর্তমান যুগে"), out);
});

test("pick avoids repeating the last choice", () => {
  const pick = makePick(rng(7));
  const seen = Array.from({ length: 6 }, () => pick(["a", "b"], "k"));
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});

test("rng is deterministic", () => {
  const a = rng(3), b = rng(3);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("changes are reported", () => {
  const r = swapWords("We utilize tools.", first);
  assert.deepEqual(r.changes, [{ type: "word", from: "utilize", to: "use" }]);
});

import { splitLong, mergeShort, rhythm } from "../public/rules.js";
import { aiScore } from "../public/detect.js";
import { spread, sentences, words } from "../public/text.js";

const yes = (options) => options.includes(true) ? true : options[0];

test("a long sentence splits at 'but'", () => {
  const s = "The new library opened downtown last spring with a big party for the whole town, but the parking lot was far too small for the crowds that came every weekend.";
  const out = splitLong(s, yes).text;
  assert.equal(sentences(out).length, 2, out);
  assert.match(out, /\. But the parking lot/);
});

test("a 15-word sentence without a conjunction does not split", () => {
  const s = "The new library opened downtown last spring with a big party for the whole town.";
  assert.equal(splitLong(s, yes).text, s);
});

test("two short sentences merge", () => {
  assert.equal(mergeShort("It rained hard. The road flooded.", yes).text, "It rained hard, and the road flooded.");
});

test("a sentence starting with a name is never merged", () => {
  assert.equal(mergeShort("Dhaka is big. Rahim lives there.", yes).text, "Dhaka is big. Rahim lives there.");
});

test("sentences on separate lines never merge", () => {
  assert.equal(mergeShort("It rained.\nThe road flooded.", yes).text, "It rained.\nThe road flooded.");
});

test("questions are not merged", () => {
  assert.equal(mergeShort("Is it raining? The road is wet.", yes).text, "Is it raining? The road is wet.");
});

const FLAT = "The team met on Monday to plan the next product launch carefully. It was a long meeting with many ideas from every department. The designers shared new sketches for the home page and the app. This gave the engineers a clear picture of the work ahead. The marketing group then talked about the budget for the campaign. It looked tight, but everyone agreed to try their best for the launch.";

test("rhythm breaks up a flat paragraph", () => {
  const before = spread(sentences(FLAT).map(words));
  for (const seed of [1, 2, 3]) {
    const out = rhythm(FLAT, makePick(rng(seed))).text;
    const after = spread(sentences(out).map(words));
    assert.ok(after > before + 0.15, `seed ${seed}: ${before.toFixed(2)} -> ${after.toFixed(2)}: ${out}`);
    assert.ok(!aiScore(out).keys.includes("flat"), `seed ${seed} still flat: ${out}`);
  }
});

test("rhythm keeps every word", () => {
  const out = rhythm(FLAT, makePick(rng(1))).text;
  const bag = (t) => t.toLowerCase().match(/[a-z']+/g).filter((w) => w !== "and").sort().join(" ");
  assert.equal(bag(out), bag(FLAT));
});

test("formal tone does not start sentences with And", () => {
  const s = "The board reviewed the annual report in great detail during the long session, and the members approved every single recommendation without any objection at all.";
  assert.ok(!/\. And /.test(splitLong(s, yes, "formal").text));
});

test("rhythm leaves Bangla alone", () => {
  const bn = "আমরা সোমবার দেখা করেছি। সবাই নতুন পরিকল্পনা নিয়ে কথা বলেছে।";
  assert.equal(rhythm(bn, makePick(rng(1))).text, bn);
});

import { humanizeLocal, sentenceOptionsLocal } from "../public/rules.js";
import { STOCK_AI_EN, CASUAL_EN, STOCK_AI_BN, REPEATED_EN } from "./fixtures.mjs";

const HIDDEN = /[​-‏‪-‮⁠-⁤﻿-]/;
const EXAMPLE = "In today's fast-paced world, social media plays a vital role in shaping how young people communicate. Moreover, it is important to note that platforms like Facebook and TikTok have fundamentally transformed the landscape of friendship. Furthermore, studies show that 62% of teenagers in Bangladesh use social media for more than 3 hours a day. In conclusion, social media is a double-edged sword that offers both opportunities and challenges.";
const wordDiff = (a, b) => {
  const A = a.toLowerCase().match(/[\p{L}']+/gu), B = new Set(b.toLowerCase().match(/[\p{L}']+/gu));
  return A.filter((w) => !B.has(w)).length / A.length;
};

test("stock AI English comes out human-like", () => {
  const r = humanizeLocal(STOCK_AI_EN);
  assert.ok(r.score.score <= 30, `score ${r.score.score}: ${r.text}`);
});

test("the example text drops at least 40 points and reads cleanly", () => {
  const before = aiScore(EXAMPLE).score;
  const r = humanizeLocal(EXAMPLE, { locked: ["Facebook", "TikTok", "Bangladesh"] });
  assert.ok(r.score.score <= before - 40, `${before} -> ${r.score.score}: ${r.text}`);
  assert.ok(!/cuts both ways that|landscape/.test(r.text), r.text);
});

test("stock AI Bangla score drops", () => {
  const before = aiScore(STOCK_AI_BN).score, r = humanizeLocal(STOCK_AI_BN);
  assert.ok(r.score.score < before - 25, `${before} -> ${r.score.score}: ${r.text}`);
});

test("casual text is barely touched", () => {
  const r = humanizeLocal(CASUAL_EN);
  assert.ok(wordDiff(CASUAL_EN, r.text) < 0.05, r.text);
});

test("numbers, locked terms and quotes survive", () => {
  const r = humanizeLocal(EXAMPLE + ' She said "it is crucial" twice.', { locked: ["Facebook", "TikTok", "Bangladesh"], strength: "strong" });
  for (const s of ["62%", " 3 ", "Facebook", "TikTok", "Bangladesh", '"it is crucial"']) assert.ok(r.text.includes(s), `lost ${s}: ${r.text}`);
});

test("no hidden or placeholder characters", () => {
  for (const t of [STOCK_AI_EN, CASUAL_EN, STOCK_AI_BN, REPEATED_EN, EXAMPLE]) {
    for (const seed of [1, 2, 3, 4, 5]) for (const strength of ["light", "medium", "strong"]) {
      assert.ok(!HIDDEN.test(humanizeLocal(t, { seed, strength }).text), `seed ${seed} ${strength}`);
    }
  }
});

test("same seed, same output", () => {
  assert.equal(humanizeLocal(STOCK_AI_EN, { seed: 4 }).text, humanizeLocal(STOCK_AI_EN, { seed: 4 }).text);
});

test("different seeds give different versions", () => {
  const outs = new Set([1, 2, 3].map((seed) => humanizeLocal(STOCK_AI_EN, { seed }).text));
  assert.equal(outs.size, 3);
});

test("formal tone adds no contractions", () => {
  const out = humanizeLocal(STOCK_AI_EN, { tone: "formal", strength: "strong" }).text;
  assert.ok(!/\b(it's|that's|there's|don't|doesn't|isn't|aren't|can't|won't|they're|we're|you're|I'm)\b/i.test(out), out);
});

test("light mode keeps sentence structure", () => {
  const r = humanizeLocal(STOCK_AI_EN, { strength: "light" });
  assert.equal(sentences(r.text).length, sentences(STOCK_AI_EN).length);
});

test("a second pass runs only when the score is still high", () => {
  assert.equal(humanizeLocal(CASUAL_EN).passes, 1);
  assert.ok(humanizeLocal(STOCK_AI_EN).passes <= 2);
});

test("fast enough", () => {
  const big = (STOCK_AI_EN + "\n\n").repeat(Math.ceil(30000 / STOCK_AI_EN.length)).slice(0, 30000);
  const t0 = performance.now();
  humanizeLocal(big, { strength: "strong" });
  const ms = performance.now() - t0;
  assert.ok(ms < 200, `${ms.toFixed(0)} ms`);
});

test("sentence options", () => {
  const s = "Moreover, it is crucial to leverage robust tools.";
  const opts = sentenceOptionsLocal(s);
  assert.ok(opts.length >= 2 && opts.length <= 3, JSON.stringify(opts));
  assert.equal(new Set(opts).size, opts.length);
  assert.ok(!opts.includes(s));
});

test("sentence options exist for an already clean sentence", () => {
  const s = "Also, it's key to draw on solid tools.";
  const opts = sentenceOptionsLocal(s);
  assert.ok(opts.length >= 2, JSON.stringify(opts));
  assert.ok(!opts.includes(s));
  assert.equal(new Set(opts).size, opts.length);
});

test("a sentence with nothing to vary has no options", () => {
  assert.deepEqual(sentenceOptionsLocal("Rahim went home."), []);
});
