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
