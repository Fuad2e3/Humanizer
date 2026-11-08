// Tests for the findings of the final review of the Quick engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { humanizeLocal, sentenceOptionsLocal, splitLong, mergeShort, contract, fixDashes, tidy, dropOpeners, replacePhrases } from "../public/rules.js";

const yes = (options) => (options.includes(true) ? true : options[0]);
const none = () => "";

// Every output the engine can give for a text: seeds 1-3, all strengths, a plain and a formal tone.
function outs(text) {
  const all = [];
  for (const seed of [1, 2, 3]) for (const strength of ["light", "medium", "strong"]) for (const tone of ["natural", "formal"]) {
    all.push(humanizeLocal(text, { seed, strength, tone }).text);
  }
  return all;
}
const never = (text, re) => { for (const o of outs(text)) assert.ok(!re.test(o), `${re} in: ${o}`); };
const always = (text, s) => { for (const o of outs(text)) assert.ok(o.includes(s), `lost "${s}": ${o}`); };

// ---------- C1: grammar and meaning from the word tables ----------
test("C1 ensure is only swapped where 'make sure' fits", () => {
  never("We ensure quality in every product.", /make sure quality/i);
  never("Ensuring safety is our goal.", /making sure safety/i);
});

test("C1 a/an agrees with the new word", () => {
  for (const t of ["This is an innovative solution.", "It is a crucial step.", "We saw an intricate design.", "They took a holistic view.",
    "We face an ever-evolving market.", "It is an optimal choice.", "That was an elevating talk."]) {
    never(t, /\ban (new|fresh|detailed|changing|fast-changing|best|key|big|major|complex|full|complete|careful)\b/i);
    never(t, /\ba (important|all-round|easy|open|improving)\b/i);
  }
});

test("C1 'has shed light on' keeps a past participle", () => {
  never("Research has shed light on the issue.", /has (explain|clear up)\b/);
});

test("C1 'the majority of the' becomes 'most of the'", () => {
  never("The majority of the students passed.", /most the/i);
  never("A large number of the users left.", /many the/i);
});

test("C1 plural 'play a ... role' never becomes 'are'/'is' (breaks after can/will/may)", async () => {
  const { PHRASES } = await import("../public/rules-data.js");
  for (const [k, opts] of PHRASES.filter(([k]) => /^play a /.test(k))) {
    for (const o of opts) assert.ok(!/^(are|is) /.test(o), `${k} -> ${o}`);
  }
});

test("C1 words with a plain meaning are left alone", () => {
  always("Her elevated blood pressure worried the doctors at the clinic.", "elevated blood pressure");
  always("Kids in foster care need more help from all of us.", "foster care");
  always("We watched a film with Jodie Foster last night.", "Jodie Foster");
  always("Check your climbing harness before every climb.", "climbing harness");
  always("They gained leverage over their rivals this year.", "leverage over");
  always("A medieval tapestry hung in the great hall.", "medieval tapestry");
  always("Paramount Pictures made the film in two years.", "Paramount Pictures");
  always("It stands as it did a hundred years ago.", "stands as it did");
  always("The door was unlocked when we got home.", "was unlocked");
});

test("C1 no 'most best' or 'the modern of'", () => {
  never("This is the most optimal plan for the team.", /most best/i);
  never("They work at the cutting-edge of science.", /the (modern|latest) of/i);
});

// ---------- I1: splits never leave a fragment ----------
test("I1 no split before 'that', 'also' or a verb", () => {
  const cases = [
    "We finished the whole project on time and on budget, so that the client would be happy with the final result we delivered.",
    "The researchers studied two hundred people over ten long years, and found that people who walk daily live longer lives.",
    "This plan is good for the planet in many important ways, but also for the health of every single person who lives here."
  ];
  for (const s of cases) assert.equal(splitLong(s, yes).text, s);
});

test("I1 no split after a list", () => {
  const s = "The busy market near our house sells apples, pears, peaches, and plums, and many other kinds of fresh fruit from farms all around the region.";
  assert.ok(!/\. And many/.test(splitLong(s, yes).text));
});

// ---------- I2: merges need at least three words on each side ----------
test("I2 one-word sentences are not merged", () => {
  assert.equal(mergeShort("Hello. This is Sarah from accounts.", yes).text, "Hello. This is Sarah from accounts.");
  assert.equal(mergeShort("Thanks. That is all.", yes).text, "Thanks. That is all.");
});

// ---------- I3: no capital letter after a number or quote ----------
test("I3 a split before a number keeps the next word lower-case", () => {
  const s = "We studied the data from the last two years in great detail and depth; 62% of the people we asked said yes to the plan.";
  assert.ok(!/62% Of/.test(splitLong(s, yes).text));
});

// ---------- I4: contractions at clause ends ----------
test("I4 no contraction before and/or/but or a dash, or after what/who/where/how", () => {
  assert.equal(contract("This is what it is and that is that.").text, "This is what it is and that's that.");
  assert.equal(contract("Where it is matters.").text, "Where it is matters.");
  assert.equal(contract("I know who we are and why.").text, "I know who we are and why.");
  assert.equal(contract("It is what it is - fun.").text, "It's what it is - fun.");
});

// ---------- I6: sentence alternatives ----------
test("I6 formal sentence options add no contractions or casual openers", () => {
  for (const o of sentenceOptionsLocal("Also, it is clear that we do not agree.", { tone: "formal" })) {
    assert.ok(!/\b\w+'(s|t|re|ll)\b|^Plus,|^On top of that,/.test(o), o);
  }
});

test("I6 near-synonyms never hit verbs or nouns", () => {
  for (const [s, bad] of [["Please complete the report today.", /full the report/], ["She works at a law firm downtown.", /law steady/], ["I major in biology at college.", /big in biology/]]) {
    for (const o of sentenceOptionsLocal(s)) assert.ok(!bad.test(o), o);
  }
});

test("I6 expanding a contraction changes the right word", () => {
  for (const o of sentenceOptionsLocal("My habit's cost is high, but it's fine.")) assert.ok(!/My habit is/.test(o), o);
});

// ---------- I7: no stray comma after a mid-sentence deletion ----------
test("I7 a deleted aside takes its commas with it", () => {
  assert.equal(tidy(replacePhrases("This is, needless to say, a problem.", none).text).text, "This is a problem.");
});

// ---------- I8: links without https are protected ----------
test("I8 bare domains and paths are never changed", () => {
  always("Visit www.robust-tools.com or example.com/utilize-guide today for more.", "www.robust-tools.com");
  always("Visit www.robust-tools.com or example.com/utilize-guide today for more.", "example.com/utilize-guide");
});

// ---------- Re-graded from minor ----------
test("brand names keep their case after an opener is dropped", () => {
  assert.equal(tidy(dropOpeners("Moreover, iPhone sales rose.", none).text).text, "iPhone sales rose.");
});

test("dashes between numbers, after a quote and at a line end are handled", () => {
  assert.equal(fixDashes("From 1990—2000 it grew.").text, "From 1990—2000 it grew.");
  assert.equal(fixDashes('"To be or not to be." — Shakespeare').text, '"To be or not to be." — Shakespeare');
  assert.equal(fixDashes("Wait —\nNext line.").text, "Wait\nNext line.");
});

test("formal and academic tones get no casual words", () => {
  for (const tone of ["formal", "academic"]) for (const seed of [1, 2, 3]) {
    const o = humanizeLocal("In essence, a myriad of tools exist today. It is a game-changer for the whole industry, and it plays a vital role in growth.", { tone, seed, strength: "strong" }).text;
    assert.ok(!/Basically|lots of|big deal|matters? a lot|Plus,/.test(o), `${tone}: ${o}`);
  }
});
