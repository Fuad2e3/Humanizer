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

// ---------- Stronger engine ----------
import { splitBangla } from "../public/rules.js";

test("new stock phrases and words are replaced", () => {
  const r = (t) => tidy(swapWords(replacePhrases(t, first).text, first).text).text;
  assert.equal(r("AI is revolutionizing medicine."), "AI is changing medicine.");
  assert.equal(r("It is essential to strike a balance between speed and care."), "You need to balance speed and care.");
  assert.equal(r("The tool reads vast amounts of data in a matter of seconds."), "The tool reads huge amounts of data in seconds.");
  assert.equal(r("It is clear that the plan works."), "The plan works.");
});

test("new linking words are handled at the start of a sentence", () => {
  assert.equal(tidy(dropOpeners("However, the plan works.", first).text).text, "Still, the plan works.");
  assert.equal(tidy(dropOpeners("Indeed, the plan works.", none).text).text, "The plan works.");
  assert.equal(dropOpeners("However hard we try, it fails.", first).text, "However hard we try, it fails.");
});

test("more contractions, but never 'let us' or a clause end", () => {
  assert.equal(contract("I will go and they have not called.").text, "I'll go and they haven't called.");
  assert.equal(contract("Let us know.").text, "Let us know.");
  assert.equal(contract("That is who he is.").text, "That's who he is.");
});

test("a long Bangla sentence splits at এবং between two clauses", () => {
  const s = "ছাত্র এবং শিক্ষক দুজনেই আজকের সভায় উপস্থিত ছিলেন এবং সবাই নতুন নিয়ম নিয়ে অনেক কথা বললেন সেখানে বসে।";
  assert.equal(splitBangla(s).text, "ছাত্র এবং শিক্ষক দুজনেই আজকের সভায় উপস্থিত ছিলেন। সবাই নতুন নিয়ম নিয়ে অনেক কথা বললেন সেখানে বসে।");
});

test("a Bangla list is never split", () => {
  const s = "আমি ভাত, ডাল এবং মাছ খেয়েছি আজ দুপুরে বাড়িতে বসে মায়ের সাথে অনেক গল্প করতে করতে।";
  assert.equal(splitBangla(s, { flat: true }).text, s);
});

test("Deep mode breaks up flat Bangla", () => {
  const before = aiScore(STOCK_AI_BN).score;
  const r = humanizeLocal(STOCK_AI_BN, { strength: "strong" });
  assert.ok(r.score.score <= 25, `score ${r.score.score}`);
  assert.ok(r.changes.some((c) => c.type === "split"), "no Bangla split");
  assert.ok(before - r.score.score >= 50, `${before} -> ${r.score.score}`);
});

// ---------- Names are found automatically ----------
import { findNames } from "../public/rules.js";

test("names, brands and acronyms are found without a list", () => {
  const names = findNames("Moreover, platforms like Facebook and TikTok matter. Robust Systems Ltd works with Bank of America. Dhaka University uses the iPhone, AI and NASA data. In Bangladesh it is crucial.");
  for (const n of ["Facebook", "TikTok", "Robust Systems Ltd", "Bank of America", "Dhaka University", "iPhone", "AI", "NASA", "Bangladesh"]) assert.ok(names.includes(n), `missing ${n}: ${names}`);
  for (const n of ["Moreover", "In Bangladesh", "In"]) assert.ok(!names.includes(n), `ordinary word kept as a name: ${n}`);
});

test("a brand name that looks like an ordinary word is kept", () => {
  const r = humanizeLocal("Robust Systems Ltd makes robust tools. Our partner Vibrant Media is vibrant and the work is crucial for everyone involved here today.", { strength: "strong" });
  assert.ok(r.text.includes("Robust Systems Ltd") && r.text.includes("Vibrant Media"), r.text);
  assert.ok(!/robust tools|is vibrant/.test(r.text), r.text);
});

test("the example keeps its names with no locked list", () => {
  const r = humanizeLocal(EXAMPLE, { strength: "strong" });
  for (const s of ["Facebook", "TikTok", "Bangladesh", "62%"]) assert.ok(r.text.includes(s), `lost ${s}: ${r.text}`);
});

// ---------- "that"/"which" clause split ----------
import { splitRelative } from "../public/rules.js";

test("a long sentence splits where 'that' starts a clause about the thing named", () => {
  assert.equal(splitRelative("So, social media is a mixed blessing that offers both opportunities and challenges.").text,
    "So, social media is a mixed blessing. It offers both opportunities and challenges.");
  assert.equal(splitRelative("We bought the new reporting tool, which is far easier for the whole team to use.").text,
    "We bought the new reporting tool. It's far easier for the whole team to use.");
  assert.equal(splitRelative("We bought the new reporting tool, which is far easier for the whole team to use.", "formal").text,
    "We bought the new reporting tool. It is far easier for the whole team to use.");
});

test("'that' after a verb or before a plural subject never splits", () => {
  for (const s of ["Also, studies show that 62% of teenagers in Bangladesh use social media every single day.",
    "Teachers reject the claim that students cheat more often when they use these online tools.",
    "The managers said that the plan works well enough for the whole company this year."]) {
    assert.equal(splitRelative(s).text, s);
  }
});

test("the example reads human-like in Deep mode", () => {
  const r = humanizeLocal(EXAMPLE, { strength: "strong" });
  assert.ok(r.score.score <= 30, `score ${r.score.score}: ${r.text}`);
  assert.ok(/blessing\. It offers/.test(r.text), r.text);
});

// ---------- Joins, "-ing" tails, and the benchmark ----------
import { mergeLinked, splitTails } from "../public/rules.js";
import { bench } from "../scripts/bench.mjs";

test("a linking word becomes a join", () => {
  assert.equal(mergeLinked("A strong online presence matters for every brand today. Also, it helps you reach a much wider audience.").text,
    "A strong online presence matters for every brand today, and it helps you reach a much wider audience.");
  assert.equal(mergeLinked("Remote work saves a lot of commuting time. Still, many people feel isolated at home.").text,
    "Remote work saves a lot of commuting time, but many people feel isolated at home.");
});

test("a join keeps names capitalized and skips a sentence that is already joined", () => {
  assert.match(mergeLinked("We tested three tools for the whole team. Also, Facebook added a new feature last week.").text, /, and Facebook added/);
  assert.match(mergeLinked("Our team tried every option we could find. This made the choice much easier for everyone.").text, /, and this made/);
  const joined = "We tested three tools, and they all failed in the same way. Also, the support team never replied.";
  assert.equal(mergeLinked(joined).text, joined);
});

test("an '-ing' tail becomes its own sentence", () => {
  assert.equal(splitTails("AI tools can assist teachers by automating admin tasks, allowing them to focus on teaching.").text,
    "AI tools can assist teachers by automating admin tasks. That lets them focus on teaching.");
  assert.equal(splitTails("Reading can serve as a form of relaxation, helping to reduce stress.").text,
    "Reading can serve as a form of relaxation. That helps reduce stress.");
});

test("'not only ... but also' is never split", () => {
  const s = "Not only does it expand vocabulary and improve comprehension skills, but it also builds empathy in young readers.";
  assert.equal(splitLong(s, () => true, "natural", { flat: true }).text, s);
});

test("a replacement avoids a word already used nearby", () => {
  const r = swapWords("People can improve their energy and enhance their well-being.", first);
  assert.ok(!/improve their energy and improve/.test(r.text), r.text);
});

test("benchmark: typical AI text comes out human-like, human text barely changes", () => {
  const b = bench();
  assert.ok(b["English strong"].after <= 18, `English Deep average ${b["English strong"].after}`);
  assert.ok(b["Bangla medium"].after <= 10, `Bangla Balanced average ${b["Bangla medium"].after}`);
  assert.ok(b["English medium"].after <= 20, `English Balanced average ${b["English medium"].after}`);
  assert.ok(b["English strong"].worst <= 32, `English Deep worst ${b["English strong"].worst}`);
  assert.ok(b["Bangla strong"].after <= 10, `Bangla Deep average ${b["Bangla strong"].after}`);
  assert.ok(b.humanChanged <= 5, `human text changed ${b.humanChanged}%`);
});

// ---------- More rhythm: "which", "as", "including", Bangla joins ----------
import { mergeBangla } from "../public/rules.js";

test("', which' about a whole clause and a causal ', as' become their own sentences", () => {
  assert.equal(splitRelative("The melting of polar ice caps is raising sea levels quickly, which poses a threat to coastal towns.").text,
    "The melting of polar ice caps is raising sea levels quickly. This poses a threat to coastal towns.");
  assert.equal(splitRelative("Also, employee training is essential, as human error remains one of the leading causes of breaches.").text,
    "Also, employee training is essential. That's because human error remains one of the leading causes of breaches.");
});

test("'as' that means 'while' or 'in the way that' stays", () => {
  for (const s of ["Prices keep climbing across the whole region, as the city grows faster than anyone expected.",
    "She kept working late on the report every night, as her manager had asked her to do.",
    "The team finished the work on time, as well as the extra report for the board."]) assert.equal(splitRelative(s).text, s);
});

test("', including' splits only after a plural noun", () => {
  assert.equal(splitTails("Chronic sleep loss can lead to many health issues, including weakened immunity and weight gain.").text,
    "Chronic sleep loss can lead to many health issues. These include weakened immunity and weight gain.");
  const s = "Remote work offers many advantages for the team, including reduced commuting time and better balance.";
  assert.equal(splitTails(s).text, s);
});

test("no second 'and' after a list, no second 'but', nothing after 'not only'", () => {
  for (const s of ["Eating well helps the heart, the brain, and the gut. Also, it keeps your energy steady all day.",
    "This process not only creates jobs but also builds local skills. However, starting out is risky for most founders."]) {
    assert.equal(mergeLinked(s).text, s);
  }
});

test("Bangla joins at a linking word", () => {
  assert.equal(mergeBangla("অনলাইন কেনাকাটা মোবাইল ফোনকে আরও জনপ্রিয় করেছে। তবে অতিরিক্ত ব্যবহার স্বাস্থ্যের ক্ষতি করে।").text,
    "অনলাইন কেনাকাটা মোবাইল ফোনকে আরও জনপ্রিয় করেছে, তবে অতিরিক্ত ব্যবহার স্বাস্থ্যের ক্ষতি করে।");
});

test("'optimal' keeps the sentence grammatical", () => {
  assert.equal(swapWords("Water matters for optimal bodily function.", first).text, "Water matters for ideal bodily function.");
  assert.equal(swapWords("Pick the optimal route.", first).text, "Pick the best route.");
});

test("a phrase replaced with a comma ending never leaves a double comma", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = humanizeLocal("মোবাইল ফোন আমাদের জীবনে অনেক কাজে লাগে এবং আমরা সহজেই যোগাযোগ করতে পারি। তবে অতিরিক্ত ব্যবহার আমাদের স্বাস্থ্যের জন্য ক্ষতিকর হতে পারে এবং এটা মনে রাখা দরকার। পরিশেষে বলা যায় যে, সঠিক ব্যবহারই মোবাইল ফোনকে আশীর্বাদে পরিণত করে এবং জীবনকে সহজ করে তোলে।", { strength: "strong", seed });
    assert.ok(!/,\s*,/.test(r.text), r.text);
  }
});
