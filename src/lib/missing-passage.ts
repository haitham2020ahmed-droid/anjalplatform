/**
 * 🧾 “Needs a missing passage” (owner, r68): a question whose wording depends on a passage, story, text, poem, chart
 * or picture that is NOT attached to it. Such a question cannot be answered, so it is removed from the platform
 * (soft-deleted: hidden everywhere, answers kept) — in the bundled data files at the source, and in a school's bank by
 * the Fix stuck questions job and the admin action “Remove questions that need a missing passage”.
 *
 * Pure and shared (no imports). The rules, on the stem with every quoted part taken out (a grammar or vocabulary
 * question that quotes its own sentence — “Read the sentence: “…the story…”” — is about that sentence):
 *
 *   TEXT      “the passage”, “the story”, “the text”, “the poem”, “the selection”, “the excerpt”, “the article” (as a text:
 *             “in / from / of / according to the article”, not the grammar word) … — unless the stem itself
 *             introduced that text a moment before (“A story has a problem. How is the story's problem solved?”)
 *   PART      “paragraph 2”, “stanza 3”, “lines 4–6”, “the first paragraph”, “the last stanza”
 *   AUTHOR    “the author”, “the poet”, “the writer”, “the narrator”, “the speaker” — unless the stem introduced the
 *             text it belongs to (“An ad says … What is the author's purpose?”)
 *   VISUAL    “the chart / graph / table / diagram / map / picture / illustration / photo / timeline / caption” read as a
 *             source (“look at the map”, “according to the chart”, “the graph shows”) — when no picture is attached
 *   TITLE     a text named by its title (“a theme of “The Final Round”?”, “In “Night Rain,” the poet …”) — not
 *             “the words from “All Summer in a Day”” (a vocabulary question lists its own words)
 *   PURPOSE   “A funny story about a talking cat is mainly written to—” (the owner's example: a text that is only
 *             described, with the question left to complete)
 *
 * Never flagged: a question with a passage (or, for the VISUAL rule and every other, a picture), and a question that
 * carries its own text (a quotation of 12+ words, 25+ words after a colon, or a stem of 45+ words).
 */

export type MissingPassageRule = "TEXT" | "PART" | "AUTHOR" | "VISUAL" | "TITLE" | "PURPOSE";
export interface MissingPassageHit { rule: MissingPassageRule; words: string }

const TEXT_NOUN = "passage|passages|story|stories|text|texts|poem|poems|selection|selections|excerpt|excerpts|essay|speech|fable|myth|legend|folktale|biography|autobiography|drama";
const INTRO_NOUN = `${TEXT_NOUN}|article|book|letter|ad|advertisement|recipe|report|play|paragraph|diary|journal|email|note|poster|sign|brochure|review|blog|post|website|interview|news|newspaper|summary|script`;

/** people a question may introduce before speaking of “the author” / “the story” (“A poet writes …”) */
const PEOPLE = "author|authors|poet|poets|writer|writers|speaker|narrator|character|characters|film|movie|script|scientist|student|reporter";

const QUOTED = /“[^”]*”|"[^"]*"/g;
const words = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;

/** The question carries its own text (a long quotation, a long part after a colon, a long stem). */
export function carriesOwnText(stem: string): boolean {
  const t = String(stem ?? "");
  for (const m of t.matchAll(/["“]([^"”]{20,})["”]/g)) if (words(m[1]) >= 12) return true;
  const colon = t.indexOf(":");
  if (colon >= 0 && words(t.slice(colon + 1)) >= 25) return true;
  return words(t) >= 45;
}

/** “a / an … story” earlier in the stem: the text is described by the question itself. */
function introduced(before: string, noun: RegExp): boolean {
  return new RegExp(`\\b(?:a|an|any|each|every|one|some|your|their|his|her|another)\\s+(?:[\\w'’-]+\\s+){0,4}?(?:${noun.source})\\b`, "i").test(before);
}

/** A quoted title: short, no end punctuation, mostly capitalised words (“The Final Round”, “Night Rain”). */
function titleQuote(q: string): boolean {
  const t = q.trim().replace(/[,]$/, "");
  if (!t || /[.?!;:]$/.test(t)) return false;
  const w = t.split(/\s+/);
  if (w.length < 2 || w.length > 9) return false;
  if (!/^[A-Z0-9]/.test(w[0])) return false;
  const small = /^(a|an|the|of|in|on|at|to|for|and|or|but|with|from|by|as|is|it|my|our|your)$/i;
  return w.filter((x) => /^[A-Z0-9“"']/.test(x) || small.test(x)).length === w.length;
}

/** The rule and the words that make a question depend on a text it does not carry, or null. Pure. */
export function missingPassageHit(stem: string): MissingPassageHit | null {
  const raw = String(stem ?? "").replace(/\s+/g, " ").trim();
  if (!raw || carriesOwnText(raw)) return null;

  // TITLE: a text named by its title (before quotes are removed)
  for (const m of raw.matchAll(/["“]([^"”]{2,70})["”]/g)) {
    const at = m.index ?? 0;
    if (!titleQuote(m[1])) continue;
    const lead = raw.slice(Math.max(0, at - 50), at).toLowerCase().trimEnd();
    if (/\b(?:words?|vocabulary)\b[^.?!]{0,40}$/.test(lead)) continue;   // “Match each word from “Title” …”
    if (at === 0 || /\b(?:in|from|of|about|by|read|reread|reading|called|titled|named)$/.test(lead)) return { rule: "TITLE", words: `“${m[1].trim().replace(/,$/, "")}”` };
  }

  // the rest: on the stem without its quotations
  const t = raw.replace(QUOTED, " “…” ");

  // PURPOSE: “A funny story about a talking cat is mainly written to—”
  const purpose = t.match(new RegExp(`\\b(?:a|an)\\s+[^.?!]{0,60}?\\b(?:${INTRO_NOUN})\\b[^.?!]{0,80}?\\bis (?:mainly |mostly |probably |most likely |usually )?written to\\s*[—–-]*\\s*$`, "i"));
  if (purpose) return { rule: "PURPOSE", words: purpose[0].trim() };

  // PART: paragraph 2, stanza 3, lines 4–6, the first paragraph
  const part = t.match(/\b(?:paragraphs?|stanzas?|lines?|sections?)\s+(?:\d+|one|two|three|four|five|six|seven|eight)\b|\b(?:the|this)\s+(?:first|second|third|fourth|fifth|last|final|opening|closing|next|concluding)\s+(?:paragraph|stanza|section)s?\b/i);
  if (part && !/\bline\s+\d+\s*(?:of|in)\s+(?:the|this)\s+(?:table|list)\b/i.test(t)) return { rule: "PART", words: part[0] };

  // the stem is its own text: it quotes a line (“In the line “…”, the poet uses …”), has a blank to fill
  // (“The poet chose ____ instead of rhyme.”), gives the items to judge (“Is each sentence … the writer's opinion?”)
  // or asks for a word / sentence among the choices (“Which sentence shows the author refining a claim?”)
  const quotesLine = [...raw.matchAll(/["“]([^"”]+)["”]/g)].some((m) => words(m[1]) >= 3 && !titleQuote(m[1]));
  const blank = /_{2,}|\.{4,}/.test(raw);
  const items = /\b(?:each|every)\s+(?:sentence|line|statement|detail|example|word|phrase|quotation|item)\b/i.test(t);
  const choose = /^(?:which|choose|select|find|pick)\b[^?]*?\b(?:word|words|sentence|sentences|phrase|phrases|transition|verb|line|quotation|ending|title)\b/i.test(t);
  // a general idea about reading, not one text: “readers”, “beyond the text”, “Is the speaker always the poet?”
  const general = /\b(?:a|any|good|the|most)\s+readers?\b|\breaders\b|\bwhat can a reader\b|\bbeyond the text\b|\b(?:always|usually|often|generally|typically)\b/i.test(t);
  // the stem describes the text itself (“A poet writes …”, “Who is the speaker of a poem?”), anywhere in it
  const described = introduced(t, new RegExp(`${INTRO_NOUN}|${PEOPLE}`));
  const own = quotesLine || blank || items;

  // TEXT: the passage / the story / the text … (the article only as a text)
  for (const m of t.matchAll(new RegExp(`\\b(?:the|this|these)\\s+(${TEXT_NOUN})\\b(?!\\s+(?:structures?|features?|evidence|types?|message|clues?|connections?|unit|lesson|genre|week|-?to-?))`, "gi"))) {
    if (own || general || described) break;
    // “Which ending gives the story …” (the choices are the text) — but not “Which sentence from the story …”
    if (choose && !/\b(?:from|in|of|according to|throughout)\s*$/i.test(t.slice(0, m.index ?? 0))) continue;
    return { rule: "TEXT", words: m[0] };
  }
  const article = t.match(/\b(?:in|from|of|according to|throughout|reread)\s+(?:the|this)\s+article\b|\b(?:the|this)\s+article\s+(?:says|states|tells|explains|describes|shows|mainly|mostly|is mostly|is mainly|is about|suggests)\b/i);
  if (article && !own && !introduced(t.slice(0, article.index ?? 0), /article|articles/)) return { rule: "TEXT", words: article[0] };
  const reading = t.match(/\b(?:based on|according to|from|after)\s+(?:the|this)\s+reading\b(?!\s+(?:lesson|skill|skills|level|log|time|class|test|strategy))/i);
  if (reading && !own) return { rule: "TEXT", words: reading[0] };

  // AUTHOR: the author / the poet / the writer / the narrator / the speaker
  const author = t.match(/\b(?:the|this)\s+(author|authors|poet|writer|narrator|speaker)(?:'s|’s)?\b/i);
  if (author && !own && !choose && !general && !described) return { rule: "AUTHOR", words: author[0] };

  // VISUAL: the chart / map / picture … read as a source (“on the table” is a table to sit at)
  const VIS = "chart|charts|graph|graphs|diagram|diagrams|map|maps|picture|pictures|image|images|illustration|illustrations|photo|photos|photograph|photographs|timeline|infographic|bar graph|pie chart|flowchart|flow chart";
  const visual = t.match(new RegExp(`\\b(?:look at|according to|based on|use|using|study|shown in)\\s+(?:the|this)\\s+(?:${VIS}|table)\\b|\\b(?:in|on|from)\\s+(?:the|this)\\s+(?:${VIS})\\b(?!\\s+(?:word|words))|\\b(?:the|this)\\s+(?:${VIS}|table)\\s+(?:shows?|tells?|below|above|explains?|is mostly about)\\b|\\bwhich (?:heading|subheading|sidebar|diagram|chart|timeline)\\b(?!\\s+would)`, "i"));
  if (visual && !blank && !introduced(t.slice(0, visual.index ?? 0), new RegExp(VIS))) return { rule: "VISUAL", words: visual[0] };
  return null;
}

/** The question needs a passage / picture it does not have. */
export function needsMissingPassage(stem: string, have: { passage: boolean; image: boolean }): MissingPassageHit | null {
  if (have.passage || have.image) return null;
  return missingPassageHit(stem);
}

/** A plain reason for lists: “The question refers to “the story”, but no passage is attached.” */
export function missingPassageReason(hit: MissingPassageHit): string {
  return hit.rule === "VISUAL" ? `The question refers to “${hit.words}”, but no picture is attached.` : `The question refers to ${hit.rule === "TITLE" ? `the text ${hit.words}` : `“${hit.words}”`}, but no passage is attached.`;
}
