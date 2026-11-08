// Rule tables for the local engine. Each row is [pattern, options]; "" as an option means delete.
// Patterns are lower-case and matched as whole words; the replacement copies the case of the first letter.

// Verb helper: forms are [base, -s, past, -ing]; each replacement gives the same four forms.
const v = (forms, ...reps) => forms.map((f, i) => [f, reps.map((r) => r[i])]);

// Stock AI phrases. Rows with a trailing comma catch the phrase at the start of a sentence.
export const PHRASES = [
  ["in today's fast-paced world,", ["", "These days,"]],
  ["in today's fast-paced world", ["today", "these days"]],
  ["in today's digital age,", ["", "These days,"]],
  ["in today's digital age", ["today", "now"]],
  ["in today's world,", ["", "Today,"]],
  ["in today's world", ["today", "these days"]],
  ["in the ever-changing", ["in the fast-changing", "in the changing"]],
  ["it is important to note that", [""]],
  ["it's important to note that", [""]],
  ["it is important to note", ["note"]],
  ["it's important to note", ["note"]],
  ["it is worth noting that", [""]],
  ["it is worth noting", ["note"]],
  ["it's worth mentioning that", [""]],
  ["it's worth mentioning", ["note"]],
  ["it can be argued that", [""]],
  ["it goes without saying that", [""]],
  ["needless to say,", [""]],
  ["plays a vital role in", ["is key to", "matters a lot for"]],
  ["plays a crucial role in", ["is key to", "matters a lot for"]],
  ["plays a pivotal role in", ["is key to", "matters a lot for"]],
  ["play a vital role in", ["matter a lot for", "matter a lot to"]],
  ["play a vital role", ["matter a lot"]],
  ["play a crucial role in", ["matter a lot for", "matter a lot to"]],
  ["play a crucial role", ["matter a lot"]],
  ["play a pivotal role in", ["matter a lot for", "matter a lot to"]],
  ["play a pivotal role", ["matter a lot"]],
  ["plays a vital role", ["matters a lot", "is key"]],
  ["plays a crucial role", ["matters a lot", "is key"]],
  ["plays a pivotal role", ["matters a lot", "is key"]],
  ["a wide range of", ["many", "all kinds of"]],
  ["in conclusion,", ["", "So,", "In short,"]],
  ["in conclusion", ["in short"]],
  ["in summary,", ["", "In short,"]],
  ["in summary", ["in short"]],
  ["to sum up,", ["", "In short,"]],
  ["to sum up", ["in short"]],
  ["navigate the complexities of", ["deal with", "work through"]],
  ["navigate the complexities", ["deal with the details"]],
  ["navigating the complexities of", ["dealing with", "working through"]],
  ["navigating the", ["handling the", "dealing with the"]],
  ["double-edged sword", ["mixed blessing"]],
  ["in the realm of", ["in"]],
  ["stands as a testament to", ["shows"]],
  ["is a testament to", ["shows"]],
  ["a testament to", ["proof of", "a sign of"]],
  ["paves the way for", ["opens the door to", "makes room for"]],
  ["pave the way for", ["open the door to", "make room for"]],
  ["paved the way for", ["opened the door to"]],
  ["paving the way for", ["opening the door to"]],
  ["paves the way", ["opens the door"]],
  ["pave the way", ["open the door"]],
  ["has shed light on", ["has explained", "has cleared up"]],
  ["have shed light on", ["have explained", "have cleared up"]],
  ["had shed light on", ["had explained"]],
  ["shed light on", ["explain", "clear up"]],
  ["sheds light on", ["explains", "clears up"]],
  ["shedding light on", ["explaining"]],
  ["a myriad of", ["lots of", "many"]],
  ["a plethora of", ["plenty of", "lots of"]],
  ["in essence,", ["", "Basically,"]],
  ["in essence", ["basically"]],
  ["at its core,", ["", "Basically,"]],
  ["at its core", ["at heart"]],
  ["stands as a", ["is a"]],
  ["stands as an", ["is an"]],
  ["stands as one of", ["is one of"]],
  ["serves as a", ["is a", "works as a"]],
  ["serves as an", ["is an", "works as an"]],
  ["a rich tapestry of", ["a rich mix of"]],
  ["tapestry of", ["mix of"]],
  ["transformed the landscape of", ["changed", "reshaped"]],
  ["transforms the landscape of", ["changes", "reshapes"]],
  ["transform the landscape of", ["change", "reshape"]],
  ["transforming the landscape of", ["changing", "reshaping"]],
  ["reshaped the landscape of", ["changed"]],
  ["changed the landscape of", ["changed"]],
  ["in this landscape", ["here", "in this market"]],
  ["the digital landscape", ["the digital world"]],
  ["the business landscape", ["the business world"]],
  ["the competitive landscape", ["the market"]],
  ["the current landscape", ["the current scene"]],
  ["the ever-changing landscape", ["the changing scene"]],
  ["a game-changer", ["a big deal"]],
  ["game-changer", ["big change"]],
  ["game changer", ["big change"]],
  ["at the cutting-edge of", ["at the front of"]],
  ["at the cutting edge of", ["at the front of"]],
  ["cutting-edge", ["latest", "modern"]],
  ["most optimal", ["best"]],
  ["ever-evolving", ["fast-changing", "changing"]],
  ["keen eye", ["sharp eye"]],
  ["embark on", ["start"]],
  ["embarks on", ["starts"]],
  ["embarked on", ["started"]],
  ["embarking on", ["starting"]],
  ["unlock the full potential of", ["get the most out of"]],
  ["ensure that", ["make sure that"]],
  ["ensures that", ["makes sure that"]],
  ["ensured that", ["made sure that"]],
  ["ensuring that", ["making sure that"]],
  ["leverage the", ["use the"]],
  ["leverage our", ["use our"]],
  ["leverage their", ["use their"]],
  ["leverage its", ["use its"]],
  ["leverage your", ["use your"]],
  ["leverage this", ["use this"]],
  ["leverage these", ["use these"]],
  ["foster a", ["build a", "encourage a"]],
  ["foster the", ["build the", "encourage the"]],
  ["foster an", ["build an"]],
  ["foster greater", ["build greater"]],
  ["harness the", ["use the"]],
  ["harness its", ["use its"]],
  ["harness their", ["use their"]],
  ["unlock the potential of", ["make the most of"]]
];

// Wordy phrases that a person would say shorter.
export const WORDY = [
  ["in order to", ["to"]],
  ["due to the fact that", ["because"]],
  ["owing to the fact that", ["because"]],
  ["in light of the fact that", ["since"]],
  ["despite the fact that", ["although"]],
  ["in spite of the fact that", ["although"]],
  ["has the ability to", ["can"]],
  ["have the ability to", ["can"]],
  ["is able to", ["can"]],
  ["are able to", ["can"]],
  ["make a decision", ["decide"]],
  ["makes a decision", ["decides"]],
  ["made a decision", ["decided"]],
  ["making a decision", ["deciding"]],
  ["at this point in time", ["now"]],
  ["at the present time", ["now"]],
  ["in the event that", ["if"]],
  ["with regard to", ["about"]],
  ["with respect to", ["about"]],
  ["in regard to", ["about"]],
  ["prior to", ["before"]],
  ["subsequent to", ["after"]],
  ["a large number of", ["many"]],
  ["a significant number of", ["many"]],
  ["the majority of the", ["most of the"]],
  ["the majority of", ["most"]],
  ["a large number of the", ["many of the"]],
  ["a significant number of the", ["many of the"]],
  ["for the purpose of", ["for"]],
  ["provide assistance to", ["help"]],
  ["conduct an analysis of", ["analyze"]],
  ["give consideration to", ["consider"]],
  ["take into consideration", ["consider"]],
  ["on a daily basis", ["daily", "every day"]],
  ["on a regular basis", ["regularly"]],
  ["until such time as", ["until"]]
];

// Single stiff or AI-flavored words.
export const WORDS = [
  ...v(["utilize", "utilizes", "utilized", "utilizing"], ["use", "uses", "used", "using"]),
  // "leverage" alone is often a noun; only the verb phrases in PHRASES are replaced.
  ...v(["leverages", "leveraged", "leveraging"], ["uses", "used", "using"], ["draws on", "drew on", "drawing on"]),
  ...v(["delve", "delves", "delved", "delving"], ["dig", "digs", "dug", "digging"], ["look", "looks", "looked", "looking"]),
  // "foster" alone is often a noun ("foster care") or a name; only verb phrases are replaced.
  ...v(["fosters", "fostered", "fostering"], ["builds", "built", "building"], ["encourages", "encouraged", "encouraging"]),
  // "elevated" is usually an adjective ("elevated blood pressure"), so it is left alone.
  ...v(["elevate", "elevates", "elevating"], ["improve", "improves", "improving"], ["raise", "raises", "raising"]),
  // "harness" and "harnesses" are also nouns ("climbing harness").
  ...v(["harnessed", "harnessing"], ["used", "using"]),
  ...v(["empower", "empowers", "empowered", "empowering"], ["help", "helps", "helped", "helping"]),
  ...v(["showcase", "showcases", "showcased", "showcasing"], ["show", "shows", "showed", "showing"]),
  ...v(["underscore", "underscores", "underscored", "underscoring"], ["show", "shows", "showed", "showing"], ["highlight", "highlights", "highlighted", "highlighting"]),
  ...v(["facilitate", "facilitates", "facilitated", "facilitating"], ["help", "helps", "helped", "helping"], ["ease", "eases", "eased", "easing"]),
  ...v(["commence", "commences", "commenced", "commencing"], ["start", "starts", "started", "starting"]),
  // "unlocked" is usually an adjective ("the door was unlocked").
  ...v(["unlock", "unlocks", "unlocking"], ["open up", "opens up", "opening up"]),
  ...v(["enhance", "enhances", "enhanced", "enhancing"], ["improve", "improves", "improved", "improving"]),
  ...v(["streamline", "streamlines", "streamlined", "streamlining"], ["simplify", "simplifies", "simplified", "simplifying"]),
  ...v(["bolster", "bolsters", "bolstered", "bolstering"], ["boost", "boosts", "boosted", "boosting"]),
  ...v(["demonstrate", "demonstrates", "demonstrated", "demonstrating"], ["show", "shows", "showed", "showing"]),
  ...v(["embark", "embarks", "embarked", "embarking"], ["set out", "sets out", "set out", "setting out"]),
  ["seamless", ["smooth"]],
  ["seamlessly", ["smoothly"]],
  ["robust", ["strong", "solid"]],
  ["pivotal", ["key"]],
  ["crucial", ["key", "important"]],
  ["intricate", ["complex", "detailed"]],
  ["meticulous", ["careful"]],
  ["meticulously", ["carefully"]],
  ["fundamentally", ["deeply", "completely"]],
  ["transformative", ["major", "big"]],
  ["holistic", ["complete", "all-round"]],
  ["synergy", ["teamwork"]],
  ["bustling", ["busy"]],
  ["vibrant", ["lively"]],
  ["nestled", ["tucked", "set"]],
  ["unwavering", ["steady", "firm"]],
  ["commendable", ["impressive", "good"]],
  ["realm", ["area", "field"]],
  ["myriad", ["countless"]],
  ["plethora", ["wealth"]],
  ["numerous", ["many"]],
  ["individuals", ["people"]],
  ["approximately", ["about", "around"]],
  ["subsequently", ["later", "then"]],
  ["comprehensive", ["full", "complete"]],
  ["optimal", ["best"]],
  ["paramount", ["key"]],
  ["multifaceted", ["complex"]],
  ["innovative", ["new", "fresh"]],
  ["groundbreaking", ["new", "big"]]
];

// Linking words at the start of a sentence. "neutral" works in any tone; "casual" adds options for casual and blog.
export const OPENERS = {
  "Moreover": { neutral: ["", "Also,"], casual: ["And", "Plus,"] },
  "Furthermore": { neutral: ["", "Also,"], casual: ["And", "Plus,"] },
  "Additionally": { neutral: ["", "Also,"], casual: ["And", "Plus,"] },
  "In addition": { neutral: ["", "Also,"], casual: ["And", "Plus,"] },
  "Notably": { neutral: ["", "In particular,"], casual: [] },
  "Importantly": { neutral: [""], casual: [] },
  "Consequently": { neutral: ["So,", "As a result,"], casual: ["So"] },
  "Ultimately": { neutral: ["In the end,", ""], casual: [] },
  "Overall": { neutral: ["All in all,", ""], casual: [] },
  "Thus": { neutral: ["So,"], casual: ["So"] },
  "Firstly": { neutral: ["First,"], casual: [] },
  "Secondly": { neutral: ["Second,"], casual: [] }
};

// Contractions, applied only when the phrase does not end a clause.
export const CONTRACTIONS = [
  ["it is", "it's"], ["that is", "that's"], ["there is", "there's"], ["do not", "don't"], ["does not", "doesn't"],
  ["did not", "didn't"], ["is not", "isn't"], ["are not", "aren't"], ["was not", "wasn't"], ["cannot", "can't"],
  ["will not", "won't"], ["would not", "wouldn't"], ["should not", "shouldn't"], ["they are", "they're"],
  ["we are", "we're"], ["you are", "you're"], ["i am", "I'm"], ["it will", "it'll"], ["we will", "we'll"], ["they will", "they'll"]
];

// Bangla stock phrases.
export const BN_PHRASES = [
  ["উল্লেখ্য যে", [""]],
  ["এক্ষেত্রে উল্লেখ্য", ["এখানে বলে রাখি"]],
  ["এটি লক্ষণীয় যে", [""]],
  ["এটা বলা বাহুল্য", [""]],
  ["বলা বাহুল্য", [""]],
  ["উপসংহারে বলা যায়", ["শেষে বলি", "সব মিলিয়ে"]],
  ["পরিশেষে বলা যায়", ["শেষে বলি", "সব মিলিয়ে"]],
  ["পরিশেষে", ["শেষে"]],
  ["নিঃসন্দেহে বলা যায়", ["সত্যি বলতে"]],
  ["নিঃসন্দেহে", ["অবশ্যই", "নিশ্চয়ই"]],
  ["এক কথায় বলা যায়", ["এক কথায়"]],
  ["বর্তমান যুগে", ["এখন", "আজকাল"]],
  ["আধুনিক যুগে", ["এখনকার দিনে", "আজকাল"]],
  ["প্রযুক্তির এই যুগে", ["এখন", "আজকাল"]],
  ["একবিংশ শতাব্দীতে", ["এখন", "এই সময়ে"]],
  ["অত্যন্ত গুরুত্বপূর্ণ ভূমিকা", ["খুব বড় ভূমিকা"]],
  ["গুরুত্বপূর্ণ ভূমিকা পালন করে", ["অনেক কাজে লাগে", "বড় ভূমিকা রাখে"]],
  ["সর্বোপরি", ["সবচেয়ে বড় কথা", "সব মিলিয়ে"]],
  ["তাছাড়া", ["আর", "পাশাপাশি"]],
  ["এছাড়াও", ["আর", "পাশাপাশি"]],
  ["অধিকন্তু", ["আর", "তার ওপর"]],
  ["বিভিন্ন ক্ষেত্রে", ["নানা কাজে", "অনেক জায়গায়"]],
  ["ব্যাপক পরিসরে", ["বড় পরিসরে", "অনেক বড় আকারে"]],
  ["একটি গুরুত্বপূর্ণ বিষয়", ["একটা বড় ব্যাপার", "জরুরি বিষয়"]],
  ["সামগ্রিকভাবে", ["সব মিলিয়ে"]],
  ["সার্বিকভাবে", ["সব মিলিয়ে"]],
  ["অপরিহার্য", ["খুব দরকারি", "জরুরি"]],
  ["অনস্বীকার্য", ["মানতেই হবে"]],
  ["গুরুত্ব অপরিসীম", ["গুরুত্ব অনেক"]],
  ["অপরিসীম", ["অনেক", "বিশাল"]],
  ["সুদূরপ্রসারী", ["দীর্ঘমেয়াদি"]],
  ["যুগান্তকারী", ["বড়", "নতুন ধরনের"]],
  ["বহুমাত্রিক", ["নানা দিকের"]],
  ["বিশেষভাবে উল্লেখযোগ্য", ["চোখে পড়ার মতো"]],
  ["দিন দিন বৃদ্ধি পাচ্ছে", ["দিন দিন বাড়ছে"]],
  ["আমাদের দৈনন্দিন জীবনে", ["রোজকার জীবনে"]]
];

// AI phrases that have no rule on purpose.
export const SKIP = {
  "landscape": "Also a plain word for scenery; only phrases such as 'the digital landscape' are replaced.",
  "testament": "Also a religious and legal word; only 'a testament to' and its forms are replaced.",
  "tapestry": "Also a real woven picture; only 'tapestry of' is replaced.",
  "stands as": "Often literal ('it stands as it did'); only 'stands as a', 'stands as an' and 'stands as one of' are replaced.",
  "leverage": "Also a noun ('gained leverage'); only verb uses such as 'to leverage' and 'leverages' are replaced.",
  "foster": "Also a noun and a name ('foster care', 'Jodie Foster'); only verb uses such as 'to foster' are replaced.",
  "harness": "Also a noun ('climbing harness'); only verb uses such as 'to harness' are replaced."
};

// Safe near-synonyms, used only to offer alternatives for a single sentence the visitor clicks.
export const SIBLINGS = [
  ["strong", "solid"], ["smooth", "easy"], ["careful", "thorough"],
  ["latest", "modern"], ["fast-changing", "changing"], ["impressive", "remarkable"],
  ["carefully", "closely"], ["mixed blessing", "two-sided thing"]
];
export const OPENER_SIBLINGS = [
  ["Also,", "Plus,", "On top of that,"], ["So,", "As a result,"], ["In the end,", "Finally,"],
  ["In short,", "All in all,"], ["These days,", "Today,"], ["First,", "To start,"], ["Second,", "Next,"]
];

// Options that read as casual. Formal and Academic tones skip them; when only casual options are left,
// the original wording stays.
export const CASUAL = new Set([
  "These days,", "these days", "Basically,", "basically", "lots of", "a big deal", "plenty of", "all kinds of",
  "matters a lot", "matter a lot", "matters a lot for", "matter a lot for", "matter a lot to", "make room for", "makes room for",
  "dig", "digs", "dug", "digging", "clear up", "clears up", "has cleared up", "have cleared up",
  "Plus,", "On top of that,", "And", "So", "So,"
]);

// "leverage", "foster" and "harness" are also nouns, so their base form is replaced only in a verb
// position: after "to", a modal, "that"/"which"/"who", a pronoun or "and"/"or".
const VERB_BEFORE = ["to", "must", "can", "could", "should", "will", "would", "may", "might", "that", "which", "who",
  "we", "they", "you", "i", "and", "or", "also", "help", "helps", "cannot", "can't"];
for (const [verb, reps] of [["leverage", ["use", "draw on"]], ["foster", ["build", "encourage"]], ["harness", ["use"]]]) {
  for (const w of VERB_BEFORE) PHRASES.push([`${w} ${verb}`, reps.map((r) => `${w} ${r}`)]);
}
