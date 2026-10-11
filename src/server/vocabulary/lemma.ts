/**
 * 🔤 Word forms → dictionary forms (Update 42C), so a tapped word always finds its meaning:
 *   normalizeWord   case, punctuation, curly quotes / apostrophes, possessive 's
 *   lemmaCandidates the word itself, then its irregular base (went → go) and rule-based bases
 *                   (plurals -s/-es/-ies/-ves, -ed/-ing/-d incl. doubled consonants and -ied, -er/-est, -ly,
 *                   contractions), in the order they are most likely right
 *   isProperNoun    a capitalized word in the middle of a sentence (a name of a person or place)
 * Pure functions: no database, no network.
 */

const VALID = /^[a-z][a-z'-]{0,40}$/;

/** “Ahmed’s,” → “ahmed”; “Don’t” → “don't”; refuses anything that is not one English word. */
export function normalizeWord(raw: string): string | null {
  let w = String(raw ?? "").normalize("NFKC").replace(/[‘’‛ʼ`´′]/g, "'").replace(/[‐‑‒–]/g, "-").trim().toLowerCase();
  w = w.replace(/^[^a-z]+|[^a-z']+$/g, "").replace(/^'+|'+$/g, (m, i) => (i === 0 ? "" : m));
  // possessive: girl's → girl, girls' → girls
  w = w.replace(/'s$/, "").replace(/s'$/, "s").replace(/'+$/, "");
  return VALID.test(w) ? w : null;
}

// ------------------------------------------------------------------ irregular forms (≈300)

/** base: forms (space-separated). Verbs, nouns, adjectives and pronouns whose forms rules cannot find. */
const IRREGULAR_SRC = `
be: am is are was were been being isn't aren't wasn't weren't
have: has had having hasn't haven't hadn't
do: does did done doing doesn't didn't don't
go: goes went gone going
say: says said
make: made
get: got gotten
know: knew known
think: thought
take: took taken
see: saw seen
come: came
give: gave given
find: found
tell: told
become: became
leave: left
feel: felt
bring: brought
begin: began begun
keep: kept
hold: held
write: wrote written
stand: stood
hear: heard
mean: meant
meet: met
run: ran
pay: paid
sit: sat
speak: spoke spoken
lie: lay lain lying
lead: led
grow: grew grown
lose: lost
fall: fell fallen
send: sent
build: built
understand: understood
draw: drew drawn
break: broke broken
spend: spent
rise: rose risen
drive: drove driven
buy: bought
wear: wore worn
choose: chose chosen
seek: sought
throw: threw thrown
catch: caught
deal: dealt
win: won
forget: forgot forgotten
sell: sold
fight: fought
eat: ate eaten
teach: taught
sleep: slept
fly: flew flown flies
swim: swam swum
sing: sang sung
drink: drank drunk
ring: rang rung
shake: shook shaken
steal: stole stolen
hide: hid hidden
ride: rode ridden
bite: bit bitten
blow: blew blown
freeze: froze frozen
wake: woke woken
bear: bore borne
born: born
tear: tore torn
feed: fed
bleed: bled
flee: fled
dig: dug
hang: hung
shine: shone
shoot: shot
stick: stuck
strike: struck
swing: swung
sting: stung
bend: bent
lend: lent
light: lit
slide: slid
sweep: swept
weep: wept
creep: crept
kneel: knelt
dream: dreamt
learn: learnt
burn: burnt
spell: spelt
spill: spilt
smell: smelt
leap: leapt
lay: laid
forgive: forgave forgiven
overcome: overcame
arise: arose arisen
awake: awoke awoken
beat: beaten
bind: bound
breed: bred
cling: clung
forbid: forbade forbidden
spin: spun
spit: spat
string: strung
swear: swore sworn
weave: wove woven
wind: wound
mistake: mistook mistaken
sink: sank sunk
shrink: shrank shrunk
stink: stank stunk
spring: sprang sprung
sew: sewn
show: shown
prove: proven
dive: dove
die: dying
tie: tying
can: could can't cannot couldn't
will: would won't wouldn't
shall: should shan't shouldn't
may: might
must: mustn't
child: children
man: men
woman: women
person: people
mouse: mice
goose: geese
foot: feet
tooth: teeth
ox: oxen
louse: lice
cactus: cacti
fungus: fungi
nucleus: nuclei
radius: radii
stimulus: stimuli
analysis: analyses
crisis: crises
thesis: theses
oasis: oases
phenomenon: phenomena
criterion: criteria
medium: media
potato: potatoes
tomato: tomatoes
hero: heroes
echo: echoes
wolf: wolves
leaf: leaves
life: lives
knife: knives
wife: wives
half: halves
shelf: shelves
loaf: loaves
thief: thieves
calf: calves
self: selves
scarf: scarves
hoof: hooves
good: better best
well: better best
bad: worse worst
many: more most
much: more most
little: less least
far: further farther furthest farthest
old: elder eldest
i: me my mine myself
he: him his himself
she: her hers herself
it: its itself
we: us our ours ourselves
they: them their theirs themselves
you: your yours yourself yourselves
`;

export const IRREGULAR: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const line of IRREGULAR_SRC.split("\n")) {
    const [base, forms] = line.split(":");
    if (!forms) continue;
    for (const f of forms.trim().split(/\s+/)) if (f && f !== base.trim() && !m.has(f)) m.set(f, base.trim());
  }
  return m;
})();

// ------------------------------------------------------------------ rules

const VOWEL = /[aeiou]/;
const isCons = (c: string | undefined) => Boolean(c) && /[a-z]/.test(c!) && !VOWEL.test(c!);
/** stopp → stop (but add, egg, err stay: a 3-letter stem keeps its double letter) */
function undoubled(stem: string): string | null {
  const a = stem[stem.length - 1], b = stem[stem.length - 2];
  if (stem.length >= 4 && a === b && isCons(a) && !/[lsfz]/.test(a)) return stem.slice(0, -1);
  return null;
}
/** letters that rarely end an English word: dance-d, argue-d, solve-d → the “+e” form first */
const NEEDS_E_END = /(?:[^aeiou]v|u|[^aeiou]c|[^aeiou][^aeiou]?g)$/;
/** bak-ed → bake, smil-ing → smile, hop-ed → hope (a short consonant-vowel-consonant stem), but visit-ed → visit */
const needsE = (stem: string) => NEEDS_E_END.test(stem) || (stem.length <= 4 && /[^aeiou][aeiou][^aeiouwxy]$/.test(stem) && !/(?:en|er|on|el|al|et|it|ol|or)$/.test(stem));

/** Words that look like a form but are their own word (never cut: evening is not “even”, news is not “new”). */
const OWN_WORDS = new Set("news means series species clothes physics mathematics politics economics athletics always perhaps sometimes towards afterwards whereas during evening morning nothing something anything everything ceiling wedding pudding sibling darling herring stocking seed speed need weed bleed breed creed wicked naked sacred hundred kindred rugged ragged jagged crooked always early only family holy ugly belly jelly reply supply apply butterfly dragonfly".split(" "));
const hasVowel = (x: string) => /[aeiouy]/.test(x);

/**
 * Rule-based bases. safe: plurals, 3rd person, -ed, -ing, contractions (the base nearly always carries the meaning).
 * risky: -er / -est / -ly (teacher ≠ teach, early ≠ ear): used only when the word itself is in no dictionary.
 */
function ruleBases(w: string): { safe: string[]; risky: string[] } {
  const safe: string[] = [], risky: string[] = [];
  const into = (list: string[]) => (...xs: (string | null | undefined)[]) => { for (const x of xs) if (x && x.length >= 2 && hasVowel(x)) list.push(x); };
  const push = into(safe), maybe = into(risky);
  // contractions: don't → do, can't → can, they're → they, we'll → we
  if (w.endsWith("n't")) { const b = w.slice(0, -3); push(b === "ca" ? "can" : b === "wo" ? "will" : b === "sha" ? "shall" : b); }
  const ap = w.match(/^([a-z]+)'(re|ll|ve|m|d|s)$/); if (ap) push(ap[1]);
  if (w.includes("'") || OWN_WORDS.has(w)) return { safe, risky };
  const n = w.length;
  if (n <= 3) return { safe, risky };
  // -ing
  if (w.endsWith("ying") && n === 5) push(w.slice(0, -4) + "ie", w.slice(0, -3));
  if (w.endsWith("ing") && n > 5) {
    const stem = w.slice(0, -3);
    const u = undoubled(stem);
    if (u) push(u);
    if (needsE(stem)) push(stem + "e", stem); else push(stem, stem + "e");
  }
  // -ied / -ed / -d
  if (w.endsWith("ied") && n > 4) push(w.slice(0, -3) + "y");
  else if (w.endsWith("ed") && n > 4) {
    const stem = w.slice(0, -2);
    const u = undoubled(stem);
    if (u) push(u);
    if (stem.endsWith("e")) push(stem);
    else if (needsE(stem)) push(stem + "e", stem);
    else push(stem, stem + "e");
  }
  // plurals / 3rd person
  if (w.endsWith("ies") && n > 4) push(w.slice(0, -3) + "y", w.slice(0, -1));
  else if (w.endsWith("ves") && n > 4) push(w.slice(0, -3) + "f", w.slice(0, -3) + "fe", w.slice(0, -1));
  else if (w.endsWith("es") && n > 3) {
    if (/(?:ss|x|zz|ch|sh|o)es$/.test(w)) push(w.slice(0, -2), w.slice(0, -1)); else push(w.slice(0, -1), w.slice(0, -2));
  } else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) push(w.slice(0, -1));
  // -ly
  if (w.endsWith("ically")) maybe(w.slice(0, -4));
  if (w.endsWith("ily") && n > 5) maybe(w.slice(0, -3) + "y");
  if (w.endsWith("ly") && n > 5) {
    const stem = w.slice(0, -2);
    if (isCons(stem[stem.length - 1])) maybe(stem + "le");
    maybe(stem);
    if (stem.endsWith("al")) maybe(stem.slice(0, -2));
  }
  // -iest / -est, -ier / -er
  for (const [suf, ysuf] of [["est", "iest"], ["er", "ier"]] as const) {
    if (!w.endsWith(suf) || n <= suf.length + 2) continue;
    if (w.endsWith(ysuf)) { maybe(w.slice(0, -ysuf.length) + "y"); continue; }
    const stem = w.slice(0, -suf.length);
    const u = undoubled(stem);
    if (u) maybe(u);
    if (needsE(stem)) maybe(stem + "e", stem); else maybe(stem, stem + "e");
  }
  return { safe, risky };
}

/**
 * Where to look a word up, best first. safe: the word itself, its irregular base (went → go) and the bases of
 * plurals / verb forms (each also run through the irregular list: children's → children → child). risky: the
 * bases of -er / -est / -ly forms. At most 12 in all, every one a valid word.
 */
export function lemmaTiers(word: string): { safe: string[]; risky: string[] } {
  const w = normalizeWord(word);
  if (!w) return { safe: [], risky: [] };
  const seen = new Set<string>();
  const safe: string[] = [], risky: string[] = [];
  const add = (list: string[], x: string | undefined | null) => { if (x && VALID.test(x) && !seen.has(x) && seen.size < 12) { seen.add(x); list.push(x); } };
  add(safe, w);
  add(safe, IRREGULAR.get(w));
  const parts = [w, ...(w.includes("-") ? [w.split("-").pop()!] : [])];
  for (const p of parts) {
    if (p !== w) { add(safe, p); add(safe, IRREGULAR.get(p)); }
    const r = ruleBases(p);
    for (const b of r.safe) { add(safe, b); add(safe, IRREGULAR.get(b)); }
    for (const b of r.risky) { add(risky, IRREGULAR.get(b) ?? b); add(risky, b); }
  }
  return { safe, risky };
}

/** All look-up forms, best first (safe, then risky). */
export function lemmaCandidates(word: string): string[] {
  const t = lemmaTiers(word);
  return [...t.safe, ...t.risky];
}

// ------------------------------------------------------------------ names

/** Capitalized words that are not names of people or places (the dictionary knows them). */
const NOT_NAMES = new Set(["i", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "english", "arabic", "french", "spanish", "chinese", "god", "mr", "mrs", "ms", "dr", "ok"]);

/**
 * A proper noun: written with a capital letter in the MIDDLE of the sentence (not its first word), e.g. “Yesterday
 * Ahmed visited Dubai.” → Ahmed, Dubai. A word that is capitalized only as the first word is not counted.
 */
export function isProperNoun(raw: string, sentence: string | null | undefined): boolean {
  const surface = String(raw ?? "").replace(/[‘’ʼ]/g, "'").trim().replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, "").replace(/'s$|'$/, "");
  if (!/^[A-Z][a-z]+(?:-[A-Z]?[a-z]+)*$/.test(surface) || NOT_NAMES.has(surface.toLowerCase())) return false;
  const text = String(sentence ?? "").replace(/[‘’ʼ]/g, "'");
  if (!text) return false;
  const re = new RegExp(`(^|[^A-Za-z'-])${surface.replace(/[-]/g, "\\-")}(?![A-Za-z-])`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index + m[1].length).replace(/[\s"“”'‘’()[\]—–-]+$/, "");
    if (before && !/[.!?:;]$/.test(before)) return true;
  }
  return false;
}

export const NAME_DEFINITION = "a name of a person or place";
export const NO_MEANING_HELP = "Look at the sentence for clues. Ask your teacher.";

/** The sentence of `text` that contains `word` (at most 300 letters), for context. */
export function sentenceWith(text: string, word: string): string | null {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const parts = clean.split(/(?<=[.!?])\s+(?=["“‘'(]?[A-Z0-9])/);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = parts.find((p) => new RegExp(`\\b${esc}\\b`).test(p)) ?? parts.find((p) => new RegExp(`\\b${esc}\\b`, "i").test(p));
  return hit ? hit.slice(0, 300) : null;
}
