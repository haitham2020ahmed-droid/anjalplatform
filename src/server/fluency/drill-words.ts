/**
 * ⚡ The speed-drill word bank: sound / spelling patterns for Grades 4–6 readers, each with an original list of words
 * (written for this platform — common school words, no copied lists) and a rule that finds the pattern in any word.
 * Used by the 60-second drill (src/server/fluency/drill.ts) and to tag the words students miss in the Coach.
 */
export interface DrillPattern {
  code: string;
  label: string;
  /** a short tip in simple words */
  tip: string;
  /** finds the pattern in a word (lower case, letters only) */
  test: RegExp;
  /** finds the pattern in the AI's pattern notes ("-tion endings", "vowel team ea"…) */
  note: RegExp;
  words: string[];
}

export const DRILL_PATTERNS: DrillPattern[] = [
  {
    code: "TION", label: "-tion / -sion endings", tip: "-tion says “shun”: na-tion. -sion says “shun” or “zhun”: man-sion, vi-sion.",
    test: /(tion|sion)s?$/, note: /tion|sion/i,
    words: ["nation", "station", "action", "motion", "lotion", "caution", "fraction", "section", "mention", "question", "direction", "invention", "collection", "attention", "addition", "position", "vision", "mission", "decision", "television", "explosion", "division"],
  },
  {
    code: "AI_AY", label: "vowel team ai / ay", tip: "ai and ay both say the long a sound, like in rain and day.",
    test: /ai|ay/, note: /\bai\b|\bay\b|ai\/ay|vowel team a/i,
    words: ["rain", "paint", "chain", "snail", "trail", "brain", "plain", "waiting", "explain", "remain", "daisy", "afraid", "stay", "spray", "tray", "delay", "today", "sway", "holiday", "crayon", "player", "maybe"],
  },
  {
    code: "EA_EE", label: "vowel team ee / ea", tip: "ee and ea usually say the long e sound: tree, beach. Sometimes ea says short e: bread.",
    test: /ee|ea/, note: /\bee\b|\bea\b|ee\/ea|vowel team e/i,
    words: ["green", "sleep", "street", "sweet", "between", "feeling", "teeth", "sixteen", "beach", "dream", "teacher", "season", "reason", "peaceful", "eager", "stream", "bread", "heavy", "weather", "ready", "feather", "breakfast"],
  },
  {
    code: "OA_OW", label: "vowel team oa / ow / oe", tip: "oa, ow and oe can say the long o sound: boat, snow, toe.",
    test: /oa|oe|ow$|own$|owing|ows$/, note: /\boa\b|long o|ow \(long/i,
    words: ["boat", "coach", "float", "toast", "throat", "soap", "goal", "approach", "loaf", "roast", "snow", "window", "yellow", "follow", "shadow", "grown", "tomorrow", "pillow", "toe", "hoe", "borrow", "elbow"],
  },
  {
    code: "OU_OI", label: "ou / ow and oi / oy sounds", tip: "ou and ow can say “ow!” like in cloud and town. oi and oy say “oy” like in coin and boy.",
    test: /ou|oi|oy|ow(?!$)/, note: /\bou\b|\boi\b|\boy\b|diphthong/i,
    words: ["cloud", "mouth", "ground", "proud", "fountain", "thousand", "around", "shout", "crowd", "flower", "tower", "frown", "power", "coin", "voice", "point", "noise", "avoid", "enjoy", "loyal", "royal", "destroy"],
  },
  {
    code: "AR_OR", label: "r-controlled ar / or", tip: "When r comes after a vowel, the vowel changes: car, corn. Say the r clearly.",
    test: /ar|or/, note: /\bar\b|\bor\b|r-controlled|bossy r/i,
    words: ["farm", "garden", "sharp", "market", "carpet", "starve", "party", "alarm", "harvest", "partner", "storm", "border", "orbit", "forest", "morning", "sport", "shore", "important", "corner", "report", "chorus", "normal"],
  },
  {
    code: "ER_IR_UR", label: "r-controlled er / ir / ur", tip: "er, ir and ur all make the same sound, like in her, bird and turn.",
    test: /er|ir|ur/, note: /\ber\b|\bir\b|\bur\b|er\/ir\/ur/i,
    words: ["person", "herd", "perfect", "under", "silver", "thunder", "water", "bird", "first", "circle", "thirsty", "skirt", "dirty", "birthday", "turn", "church", "purple", "surface", "turtle", "burst", "hurry", "nurse"],
  },
  {
    code: "SILENT", label: "silent letters (kn, wr, mb, gh, igh)", tip: "Some letters are quiet: the k in knee, the w in write, the b in climb, the gh in night.",
    test: /^kn|^wr|mb$|mbs$|igh|ough|augh|^gn|stle$|sten$|^wh|lk$|alf$/, note: /silent/i,
    words: ["knee", "knife", "knock", "knowledge", "write", "wrong", "wrist", "wrap", "climb", "thumb", "lamb", "comb", "night", "bright", "flight", "frighten", "daughter", "caught", "thought", "listen", "castle", "half"],
  },
  {
    code: "SH_CH", label: "digraphs sh / ch / tch / wh", tip: "Two letters, one sound: sh in ship, ch in chair, tch in watch, wh in when.",
    test: /sh|ch|wh/, note: /\bsh\b|\bch\b|tch|digraph|\bwh\b/i,
    words: ["shell", "shiny", "fresh", "finish", "shelter", "chalk", "cheese", "chicken", "reach", "lunch", "watch", "kitchen", "stretch", "sketch", "catch", "while", "whisper", "wheel", "whale", "white", "splash", "brush"],
  },
  {
    code: "TH", label: "th sounds", tip: "Put your tongue between your teeth for th: think (no voice), this (with voice). It is not s, t, z or d.",
    test: /th/, note: /\bth\b|th sound/i,
    words: ["think", "thank", "three", "thick", "thunder", "thirty", "path", "month", "mouth", "earth", "this", "that", "these", "those", "there", "mother", "father", "brother", "weather", "together", "breathe", "smooth"],
  },
  {
    code: "ED", label: "-ed endings (t, d, id)", tip: "-ed has three sounds: jumped (t), played (d), wanted (id). Say only one syllable unless the word ends in t or d.",
    test: /[a-z]{2,}ed$/, note: /-?ed\b|past tense|ending ed/i,
    words: ["jumped", "walked", "helped", "laughed", "watched", "pushed", "played", "cleaned", "opened", "called", "smiled", "carried", "wanted", "needed", "landed", "started", "painted", "decided", "visited", "planted", "shouted", "added"],
  },
  {
    code: "MULTI", label: "long words (3+ syllables)", tip: "Break long words into parts and say each part: fan-tas-tic, cel-e-brate.",
    test: /^(?=(?:[^aeiouy]*[aeiouy]+){3})[a-z]{7,}$/, note: /multisyllab|syllable|long word/i,
    words: ["fantastic", "celebrate", "remember", "important", "adventure", "dinosaur", "volcano", "elephant", "beautiful", "community", "different", "electric", "furniture", "hospital", "library", "medicine", "operation", "population", "temperature", "vegetable", "understanding", "experiment"],
  },
  {
    code: "SOFT_CG", label: "soft c and soft g", tip: "c before e, i or y says “s” (city). g before e, i or y often says “j” (giant).",
    test: /c[eiy]|g[eiy]/, note: /soft c|soft g/i,
    words: ["city", "cent", "circle", "cycle", "pencil", "dance", "fence", "decide", "notice", "center", "giant", "gentle", "giraffe", "energy", "magic", "large", "bridge", "orange", "change", "village", "danger", "engine"],
  },
  {
    code: "CLUSTER", label: "consonant blends (str, spl, scr, nd, st)", tip: "Say every sound in the blend with no extra vowel: “street”, not “istreet” or “sitreet”.",
    test: /^(str|spr|spl|scr|squ|thr|shr)|^[bcdfgkpst][lr]|^s[ckmnptw]|[nlr][dtk]s?$|sts$|xts?$|mpt$/, note: /blend|cluster/i,
    words: ["street", "strong", "spring", "spray", "splash", "split", "scream", "scratch", "square", "throw", "shrink", "planet", "bright", "crops", "glass", "sparkle", "stamp", "friends", "hands", "texts", "tests", "attempt"],
  },
  {
    code: "MAGIC_E", label: "silent e (long vowel)", tip: "A silent e at the end makes the vowel say its name: hop → hope, kit → kite.",
    test: /[aeiou][bcdfgklmnprstvz]e$/, note: /silent e|magic e|vce/i,
    words: ["hope", "kite", "cube", "plane", "smile", "stone", "flute", "shine", "brave", "globe", "invite", "escape", "complete", "inside", "explore", "mistake", "costume", "describe", "volume", "excuse", "athlete", "suppose"],
  },
  {
    code: "PH_GH", label: "ph and gh saying “f”", tip: "ph and sometimes gh say the “f” sound: phone, laugh.",
    test: /ph|[ao]ugh(s|ter|est|ly|ed)?$/, note: /\bph\b|gh/i,
    words: ["phone", "photo", "graph", "elephant", "alphabet", "dolphin", "trophy", "nephew", "orphan", "sphere", "phrase", "physical", "paragraph", "microphone", "laugh", "rough", "tough", "enough", "cough", "laughter", "toughest", "roughly"],
  },
  {
    code: "AFFIX", label: "prefixes and suffixes", tip: "Find the base word first, then add the parts: un-help-ful, re-build, care-less-ness.",
    test: /^(un|re|dis|pre|mis|non)[a-z]{3,}|(ful|less|ness|ment|able|ly)$/, note: /prefix|suffix|affix/i,
    words: ["unhappy", "unlock", "rebuild", "return", "disagree", "dislike", "preview", "misplace", "nonstop", "careful", "helpful", "careless", "endless", "kindness", "darkness", "movement", "payment", "readable", "comfortable", "quickly", "suddenly", "carefully"],
  },
  {
    code: "P_B", label: "p and b sounds", tip: "p is a puff of air with no voice: put your hand in front of your mouth and feel it for “pen”. b uses your voice: “ben”.",
    test: /p/, note: /\bp\b.*\bb\b|p\/b/i,
    words: ["paper", "people", "picnic", "pepper", "pocket", "happy", "puppy", "simple", "apple", "power", "repeat", "spend", "copy", "pump", "keep", "stop", "map", "plan", "spoon", "open", "upset", "camping"],
  },
  {
    code: "V_F", label: "v and f sounds", tip: "Top teeth on your bottom lip for both. f is only air; v adds your voice (it buzzes): fan / van.",
    test: /v/, note: /\bv\b.*\bf\b|v\/f/i,
    words: ["very", "voice", "visit", "video", "seven", "eleven", "river", "travel", "never", "over", "every", "give", "move", "brave", "leave", "heavy", "vowel", "victory", "vacation", "vegetable", "solve", "service"],
  },
];

export const PATTERN_BY_CODE = new Map(DRILL_PATTERNS.map((p) => [p.code, p]));

const letters = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");

/** Patterns found in a word (the most specific first; P_B and V_F only when the word has those letters). */
export function patternsOfWord(word: string): string[] {
  const w = letters(word);
  if (w.length < 2) return [];
  return DRILL_PATTERNS.filter((p) => p.test.test(w)).map((p) => p.code);
}

/** Pattern codes named in the AI's notes ("-tion endings" → TION). */
export function patternsOfNotes(notes: string[]): string[] {
  const out = new Set<string>();
  for (const n of notes) for (const p of DRILL_PATTERNS) if (p.note.test(n)) out.add(p.code);
  return [...out];
}

/** The pattern of a missed word: the AI's note when it fits the word, else the first pattern found in it. */
export function patternForError(word: string, notes: string[]): string | null {
  const inWord = patternsOfWord(word);
  const fromNotes = patternsOfNotes(notes).filter((c) => inWord.includes(c));
  // P_B and V_F are very wide (any p or v): use them only when nothing else fits
  const wide = new Set(["P_B", "V_F"]);
  return fromNotes[0] ?? inWord.find((c) => !wide.has(c)) ?? inWord[0] ?? null;
}
