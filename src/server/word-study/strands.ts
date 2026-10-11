/**
 * 🔤 The decoding screener's word lists: 8 phonics / word-study strands, in teaching order. Each strand has 5 patterns,
 * and each pattern one REAL word and one MADE-UP (nonsense) word, so every strand has 5 real + 5 made-up words.
 *
 * The student hears the word (browser speech) and picks its spelling from 4 look-alike choices. Every word, made-up
 * word and distractor below is ORIGINAL to this platform (the strand order follows the usual phonics scope and
 * sequence; no list is copied from a published program).
 *
 * Distractors model the confusions of Arabic-speaking learners where they fit: p/b and v/f swaps, short-vowel swaps,
 * a letter missing from a consonant cluster or an extra vowel inside it, a silent letter left out.
 *  - REAL words: the distractors may sound the same (brane for brain): the student must know the spelling.
 *  - MADE-UP words: the distractors always SOUND DIFFERENT (vot / fot / vut / vat): only decoding the sounds
 *    finds the answer, so these words measure decoding itself, without memory of known words.
 * choices[0] is always the right spelling; the order shown to the student is shuffled per screen.
 */

export interface ScreenWord {
  word: string;
  real: boolean;
  /** the right spelling first, then 3 look-alike distractors */
  choices: [string, string, string, string];
}
export interface ScreenPattern { code: string; label: string; words: [ScreenWord, ScreenWord] }
export interface Strand { n: number; code: string; name: string; short: string; patterns: ScreenPattern[] }

const R = (word: string, a: string, b: string, c: string): ScreenWord => ({ word, real: true, choices: [word, a, b, c] });
const M = (word: string, a: string, b: string, c: string): ScreenWord => ({ word, real: false, choices: [word, a, b, c] });
const P = (code: string, label: string, real: ScreenWord, madeUp: ScreenWord): ScreenPattern => ({ code, label, words: [real, madeUp] });

export const STRANDS: Strand[] = [
  { n: 1, code: "SHORT_VOWELS", name: "Short vowels", short: "Short vowels", patterns: [
    P("short-a", "short a", R("rag", "reg", "rug", "rig"), M("jat", "jet", "jot", "jit")),
    P("short-e", "short e", R("pet", "bet", "pit", "pat"), M("vep", "fep", "vip", "vap")),
    P("short-i", "short i", R("lid", "led", "lad", "lud"), M("mib", "mip", "meb", "mab")),
    P("short-o", "short o", R("mop", "mob", "map", "mup"), M("vot", "fot", "vut", "vat")),
    P("short-u", "short u", R("bun", "pun", "ban", "bin"), M("dup", "dub", "dap", "dop")),
  ] },
  { n: 2, code: "DIGRAPHS_BLENDS", name: "Consonant digraphs & blends", short: "Digraphs & blends", patterns: [
    P("sh", "sh", R("shrub", "srub", "shurub", "shrab"), M("shemp", "semp", "chemp", "shemb")),
    P("ch", "ch", R("chimp", "shimp", "cimp", "chimb"), M("chelp", "shelp", "chlep", "chelb")),
    P("th", "th", R("thick", "thik", "tick", "thich"), M("glath", "galath", "glash", "glat")),
    P("initial-blend", "beginning blends", R("scrap", "scap", "sacrap", "scrab"), M("sprunk", "sbrunk", "sprank", "sprun")),
    P("final-blend", "ending blends", R("blend", "bled", "belend", "plend"), M("trusp", "tursp", "trusb", "trus")),
  ] },
  { n: 3, code: "SILENT_E", name: "Silent e (VCe)", short: "Silent e", patterns: [
    P("a_e", "a_e", R("brave", "brav", "brafe", "braive"), M("vabe", "fabe", "vab", "vobe")),
    P("i_e", "i_e", R("spine", "spin", "spien", "sbine"), M("grike", "grik", "grake", "girike")),
    P("o_e", "o_e", R("slope", "slop", "sloap", "slobe"), M("plome", "plom", "blome", "plume")),
    P("u_e", "u_e", R("flute", "flut", "floot", "vlute"), M("stume", "stum", "stame", "situme")),
    P("e_e", "e_e", R("theme", "them", "theem", "thime"), M("plede", "pled", "plade", "blede")),
  ] },
  { n: 4, code: "VOWEL_TEAMS", name: "Vowel teams", short: "Vowel teams", patterns: [
    P("ai", "ai", R("brain", "brane", "bran", "brayn"), M("smaid", "smad", "smeed", "smoad")),
    P("ay", "ay", R("spray", "sprai", "spra", "sbray"), M("snay", "sna", "snee", "smay")),
    P("ee", "ee", R("sweep", "sweap", "swep", "sweip"), M("dreep", "drep", "drip", "dreeb")),
    P("ea", "ea", R("dream", "dreem", "drem", "dreme"), M("gleat", "glet", "glat", "gloat")),
    P("oa", "oa", R("toast", "tost", "toste", "towst"), M("floam", "flom", "flam", "vloam")),
  ] },
  { n: 5, code: "R_CONTROLLED", name: "R-controlled vowels", short: "R-controlled", patterns: [
    P("ar", "ar", R("garden", "gurden", "gadden", "gardin"), M("darv", "darf", "dav", "dorv")),
    P("or", "or", R("storm", "sturm", "stom", "starm"), M("sporn", "spon", "sparn", "sborn")),
    P("er", "er", R("perch", "purch", "pech", "berch"), M("plerk", "plek", "plark", "blerk")),
    P("ir", "ir", R("thirst", "thurst", "therst", "thist"), M("blirk", "blik", "blark", "blork")),
    P("ur", "ur", R("church", "chirch", "cherch", "chuch"), M("murt", "mut", "mart", "mort")),
  ] },
  { n: 6, code: "DIPHTHONGS", name: "Diphthongs & variant vowels", short: "Diphthongs", patterns: [
    P("ou", "ou", R("cloud", "clowd", "clod", "cloued"), M("plouk", "pluk", "plok", "blouk")),
    P("ow", "ow (as in cow)", R("crown", "croun", "cron", "crowen"), M("drowl", "drol", "drawl", "trowl")),
    P("oi-oy", "oi / oy", R("spoil", "spoyl", "spol", "sboil"), M("froy", "fro", "vroy", "fray")),
    P("au-aw", "au / aw", R("launch", "lawnch", "lanch", "launsh"), M("gawt", "gat", "got", "gowt")),
    P("oo", "oo", R("shook", "shuk", "shoock", "shok"), M("smoob", "smob", "smub", "smoop")),
  ] },
  { n: 7, code: "INFLECTIONS", name: "Inflections & suffixes", short: "Endings", patterns: [
    P("doubling", "doubling before -ed / -ing", R("stopped", "stoped", "stopt", "stobbed"), M("trobbing", "trobing", "tropping", "trabbing")),
    P("drop-e", "drop the e before -ing", R("smiling", "smileing", "smilling", "smilin"), M("vaming", "vamming", "faming", "voming")),
    P("y-to-i", "y → i before -ed / -es", R("carried", "carryed", "caried", "carred"), M("blompied", "blomped", "plompied", "blumpied")),
    P("er-est", "-er / -est", R("softest", "softist", "sofest", "soffest"), M("plindest", "plinest", "blindest", "plondest")),
    P("ed-sounds", "-ed endings", R("jumped", "jumpt", "jumbed", "jumpd"), M("glented", "glentd", "clented", "glanted")),
  ] },
  { n: 8, code: "MULTISYLLABLE", name: "Multisyllable words & prefixes", short: "Multisyllable", patterns: [
    P("un", "un- / -ful", R("unhelpful", "unhelpfull", "unhelpfl", "unhelbful"), M("unbradful", "unbredful", "unpradful", "unbraful")),
    P("re", "re-", R("reconnect", "reconect", "rekonnect", "reconnet"), M("rekimbot", "rekimpot", "rekombot", "rekibbot")),
    P("pre", "pre-", R("preview", "preveiw", "prefiew", "previw"), M("prestomic", "prestamic", "brestomic", "prestonic")),
    P("mis", "mis-", R("misplaced", "missplaced", "misblaced", "misplased"), M("misfendle", "misvendle", "misfandle", "misfeddle")),
    P("closed-open", "longer words (syllables)", R("invisible", "invisable", "infisible", "invisble"), M("subtrandish", "subtrendish", "suptrandish", "subtradish")),
  ] },
];

export const STRAND_BY_N = new Map(STRANDS.map((s) => [s.n, s]));
export const STRAND_BY_CODE = new Map(STRANDS.map((s) => [s.code, s]));
