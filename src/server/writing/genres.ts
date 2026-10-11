/**
 * ✍️ Writing genres: the 4-trait rubric of each genre (scores 1–4, kid-friendly descriptors), the student's
 * self-check (yes / no) before submitting, the plan organizer with sentence frames, and the revision moves a
 * teacher (or an approved AI draft) can give for a weak trait.
 *
 * All wording is original to this platform. FREE writing keeps the older 0–4 rubric (Ideas · Organization ·
 * Language · Conventions) so existing tasks and scores stay valid.
 */
import { ValidationError } from "../curriculum-admin";

export const GENRES = ["NARRATIVE", "INFORMATIONAL", "OPINION", "HOW_TO", "RESEARCH", "FREE"] as const;
export type Genre = (typeof GENRES)[number];
export const isGenre = (v: unknown): v is Genre => typeof v === "string" && (GENRES as readonly string[]).includes(v);

export const GENRE_LABEL: Record<Genre, string> = {
  NARRATIVE: "Narrative (a story)", INFORMATIONAL: "Informational (teach about a topic)", OPINION: "Opinion (give reasons)",
  HOW_TO: "How-to (explain the steps)", RESEARCH: "Research (use sources)", FREE: "Free writing",
};
export const GENRE_ICON: Record<Genre, string> = { NARRATIVE: "📖", INFORMATIONAL: "🔎", OPINION: "💬", HOW_TO: "🧭", RESEARCH: "📚", FREE: "✍️" };

/** One rubric trait: key, name, what it checks, and a descriptor per score (4 → 1, or 4 → 0 for the older rubric). */
export interface Trait { key: string; name: string; what: string; levels: Record<number, string> }
export interface Rubric { min: number; max: number; traits: Trait[] }

/** The older rubric (0–4), still used by FREE writing and by every task made before genres. */
export const FREE_RUBRIC: Rubric = {
  min: 0, max: 4, traits: [
    { key: "ideas", name: "Ideas", what: "Answers the prompt with clear ideas and details / evidence.", levels: {} },
    { key: "organization", name: "Organization", what: "Beginning, middle and end; ideas in a logical order; linking words.", levels: {} },
    { key: "language", name: "Language", what: "Precise words, varied sentences, a voice that fits the purpose.", levels: {} },
    { key: "conventions", name: "Conventions", what: "Grammar, capitals, punctuation and spelling.", levels: {} },
  ],
};

const conventions: Trait = {
  key: "conventions", name: "Conventions", what: "Grammar, capital letters, punctuation and spelling.",
  levels: {
    4: "Almost no mistakes. My sentences are complete and easy to read.",
    3: "A few small mistakes, but they do not get in the way of my meaning.",
    2: "Many mistakes in grammar, capitals, punctuation or spelling. The reader has to slow down.",
    1: "So many mistakes that the reader cannot follow my meaning.",
  },
};

const R = (traits: Trait[]): Rubric => ({ min: 1, max: 4, traits: [...traits, conventions] });

export const GENRE_RUBRICS: Record<Exclude<Genre, "FREE">, Rubric> = {
  NARRATIVE: R([
    { key: "focus", name: "Purpose & Focus", what: "The story stays on one experience or event and has a clear point.", levels: {
      4: "My whole story is about one event, and the reader understands why it matters.",
      3: "My story is mostly about one event, with a small part that wanders off.",
      2: "My story jumps between ideas, so the main event is hard to find.",
      1: "It is not clear what my story is about.",
    } },
    { key: "organization", name: "Organization", what: "A beginning that hooks, events in order with time words, and a real ending.", levels: {
      4: "Strong beginning, events in a clear order with time words, and an ending that wraps it up.",
      3: "Beginning, middle and end are there; a few time words help the order.",
      2: "The order is sometimes confusing, or the beginning or ending is missing.",
      1: "The events are mixed up and there is no clear beginning or ending.",
    } },
    { key: "craft", name: "Story Elements & Craft", what: "Characters, setting and a problem, shown with dialogue, feelings and describing words.", levels: {
      4: "My characters, setting and problem come alive with dialogue, feelings and vivid words.",
      3: "I name the characters, setting and problem and add some details or dialogue.",
      2: "Characters or setting are thin; I mostly tell what happened, with few details.",
      1: "There are almost no story elements or details.",
    } },
  ]),
  INFORMATIONAL: R([
    { key: "focus", name: "Purpose & Focus", what: "Introduces the topic clearly and stays on it.", levels: {
      4: "I introduce my topic clearly, and every part teaches the reader about it.",
      3: "My topic is clear, and most parts stay on it.",
      2: "My topic is unclear or some parts are about something else.",
      1: "The reader cannot tell what my topic is.",
    } },
    { key: "organization", name: "Organization", what: "Groups facts into parts, uses linking words, and ends with a conclusion.", levels: {
      4: "Facts are grouped into clear parts with linking words (also, for example, another), and I end with a conclusion.",
      3: "Most facts are grouped, with some linking words and a short ending.",
      2: "Facts are in a list or jump around; few linking words; weak or no ending.",
      1: "There is no plan the reader can follow.",
    } },
    { key: "evidence", name: "Evidence & Elaboration", what: "Facts, definitions, examples and details that explain the topic.", levels: {
      4: "I use several exact facts, examples or definitions and explain each one.",
      3: "I use some facts and examples, with a little explanation.",
      2: "I give only a few facts, or general ideas without examples.",
      1: "There are almost no facts or details.",
    } },
  ]),
  OPINION: R([
    { key: "focus", name: "Opinion & Focus", what: "States a clear opinion and keeps it the whole way.", levels: {
      4: "I state my opinion clearly at the start and every part supports it.",
      3: "My opinion is clear; most parts support it.",
      2: "My opinion is hard to find or changes in the middle.",
      1: "I do not state an opinion.",
    } },
    { key: "organization", name: "Organization", what: "Reasons in a logical order with linking words, and a conclusion that restates the opinion.", levels: {
      4: "My reasons are in a logical order with linking words (first, because, also) and my ending restates my opinion.",
      3: "My reasons are in order with some linking words and an ending.",
      2: "My reasons are mixed up, or there is no ending.",
      1: "The reader cannot follow my reasons.",
    } },
    { key: "evidence", name: "Reasons & Evidence", what: "Reasons backed up by facts, examples or details from texts.", levels: {
      4: "I give two or more strong reasons, each backed up with facts or examples.",
      3: "I give reasons with some facts or examples.",
      2: "My reasons are weak or have no facts or examples.",
      1: "I give no reasons.",
    } },
  ]),
  HOW_TO: R([
    { key: "focus", name: "Purpose & Focus", what: "Says clearly what the reader will make or do.", levels: {
      4: "The reader knows exactly what they will make or do, and every step helps.",
      3: "The goal is clear and most steps help.",
      2: "The goal is unclear or some steps do not belong.",
      1: "The reader cannot tell what to make or do.",
    } },
    { key: "organization", name: "Steps in Order", what: "Materials first, then every step in order with order words.", levels: {
      4: "Materials first, then every step in the right order with order words (first, next, then, finally).",
      3: "The steps are in order with some order words.",
      2: "A step is missing or out of order.",
      1: "The steps are mixed up.",
    } },
    { key: "details", name: "Details & Precise Words", what: "Exact amounts, times, tools and action verbs so the reader can follow.", levels: {
      4: "I use exact words (two cups, stir for one minute) and strong action verbs.",
      3: "I give some exact details and action verbs.",
      2: "My steps are vague (put some, do it).",
      1: "The reader could not follow my steps.",
    } },
  ]),
  RESEARCH: R([
    { key: "focus", name: "Purpose & Focus", what: "Answers the research question and stays on it.", levels: {
      4: "I answer the research question clearly, and every part helps answer it.",
      3: "I answer the question, with a small part that wanders off.",
      2: "My answer to the question is hard to find.",
      1: "I do not answer the research question.",
    } },
    { key: "organization", name: "Organization", what: "An introduction, grouped information with linking words, and a conclusion.", levels: {
      4: "Clear introduction, information grouped by idea with linking words, and a conclusion.",
      3: "Introduction, body and conclusion are there; some linking words.",
      2: "The information is in a list or jumps around.",
      1: "There is no plan the reader can follow.",
    } },
    { key: "evidence", name: "Evidence from Sources", what: "Uses facts from the sources, in own words, and names each source.", levels: {
      4: "I use facts from more than one source, in my own words, and I name each source (According to …).",
      3: "I use facts from a source and name it at least once.",
      2: "I use a fact or two but do not say where they come from, or I copy whole sentences.",
      1: "I do not use the sources.",
    } },
  ]),
};

/** The rubric of a task: the genre's 1–4 rubric, or the older 0–4 rubric for FREE writing. */
export function rubricFor(genre: unknown): Rubric {
  return isGenre(genre) && genre !== "FREE" ? GENRE_RUBRICS[genre] : FREE_RUBRIC;
}

// ------------------------------------------------------------------ the self-check before submitting

export interface CheckItem { id: string; text: string }
export const CHECKLISTS: Record<Genre, CheckItem[]> = {
  NARRATIVE: [
    { id: "n1", text: "My beginning makes the reader want to keep reading." },
    { id: "n2", text: "I named my characters and told where and when the story happens." },
    { id: "n3", text: "My story has a problem the characters try to solve." },
    { id: "n4", text: "I used time words (first, later, after that, at last) to show the order." },
    { id: "n5", text: "I showed feelings with dialogue or actions, not only “happy” or “sad”." },
    { id: "n6", text: "My ending tells how the problem was solved or what the character learned." },
    { id: "n7", text: "Each sentence starts with a capital letter and ends with a punctuation mark." },
  ],
  INFORMATIONAL: [
    { id: "i1", text: "My first sentence tells the reader what my topic is." },
    { id: "i2", text: "I put facts about the same idea together in one part." },
    { id: "i3", text: "I gave at least three facts, examples or definitions." },
    { id: "i4", text: "I used linking words (also, another, for example, because)." },
    { id: "i5", text: "I explained any hard words for the reader." },
    { id: "i6", text: "My last sentence sums up what the reader learned." },
    { id: "i7", text: "I checked my capitals, punctuation and spelling." },
  ],
  OPINION: [
    { id: "o1", text: "I wrote my opinion clearly at the beginning." },
    { id: "o2", text: "I gave at least two reasons." },
    { id: "o3", text: "Each reason has a fact or an example to back it up." },
    { id: "o4", text: "I used linking words (first, because, also, for example)." },
    { id: "o5", text: "Every part of my writing supports my opinion." },
    { id: "o6", text: "My ending says my opinion again in new words." },
    { id: "o7", text: "I checked my capitals, punctuation and spelling." },
  ],
  HOW_TO: [
    { id: "h1", text: "My title or first sentence says what the reader will make or do." },
    { id: "h2", text: "I listed the materials or tools first." },
    { id: "h3", text: "My steps are in the right order and none is missing." },
    { id: "h4", text: "I used order words (first, next, then, finally)." },
    { id: "h5", text: "Each step starts with an action verb (mix, cut, pour, press)." },
    { id: "h6", text: "I gave exact details (how much, how long, where)." },
    { id: "h7", text: "I checked my capitals, punctuation and spelling." },
  ],
  RESEARCH: [
    { id: "r1", text: "My writing answers the research question." },
    { id: "r2", text: "I used facts from the sources, not only what I already knew." },
    { id: "r3", text: "I named my sources (According to …, The article … says …)." },
    { id: "r4", text: "I wrote the facts in my own words." },
    { id: "r5", text: "I grouped the information by idea, with linking words." },
    { id: "r6", text: "My conclusion sums up the answer to the question." },
    { id: "r7", text: "I checked my capitals, punctuation and spelling." },
  ],
  FREE: [
    { id: "f1", text: "I answered what the task asked." },
    { id: "f2", text: "My ideas are in an order that makes sense." },
    { id: "f3", text: "I added details so the reader understands." },
    { id: "f4", text: "I read my writing again to check it makes sense." },
    { id: "f5", text: "I checked my capitals, punctuation and spelling." },
    { id: "f6", text: "Every sentence is complete." },
  ],
};
/** The self-check is required before submitting for every genre except FREE (kept as before). */
export const checklistRequired = (genre: unknown) => isGenre(genre) && genre !== "FREE";

/** The ticked items, or the message for the first one left; every item must be answered “yes”. */
export function checkChecklist(genre: Genre, ticks: Record<string, unknown> | null | undefined): { ok: true; value: Record<string, true> } | { ok: false; error: string } {
  const list = CHECKLISTS[genre];
  const value: Record<string, true> = {};
  for (const c of list) {
    if (ticks?.[c.id] !== true && ticks?.[c.id] !== "1" && ticks?.[c.id] !== "on") return { ok: false, error: `Check your writing first: “${c.text}” Fix it, then tick it.` };
    value[c.id] = true;
  }
  return { ok: true, value };
}

// ------------------------------------------------------------------ the plan organizer and sentence frames

export interface PlanField { key: string; label: string; help: string; required: boolean }
export interface Organizer { title: string; fields: PlanField[]; frames: string[] }
const f = (key: string, label: string, help: string, required = true): PlanField => ({ key, label, help, required });

export const ORGANIZERS: Record<Genre, Organizer> = {
  NARRATIVE: {
    title: "Story map", fields: [
      f("characters", "Characters", "Who is in the story? One word about each."),
      f("setting", "Setting", "Where and when does it happen?"),
      f("problem", "Problem", "What goes wrong, or what does the character want?"),
      f("events", "Events", "Three things that happen, in order."),
      f("ending", "Ending", "How is the problem solved? How does the character feel?"),
    ],
    frames: ["One morning, ___ was ___ when ___.", "At first, ___. Then ___.", "“___,” said ___ in a ___ voice.", "Suddenly, ___.", "After that, ___ decided to ___.", "In the end, ___ felt ___ because ___."],
  },
  INFORMATIONAL: {
    title: "Topic web", fields: [
      f("topic", "Topic", "What will you teach the reader about?"),
      f("part1", "First idea + facts", "One idea and two facts about it."),
      f("part2", "Second idea + facts", "Another idea and its facts."),
      f("part3", "Third idea + facts", "One more idea (optional).", false),
      f("conclusion", "Conclusion", "What should the reader remember?"),
    ],
    frames: ["Have you ever wondered about ___?", "___ is a ___ that ___.", "One important fact is that ___.", "Another way ___ is ___.", "For example, ___.", "This means that ___.", "Now you know that ___."],
  },
  OPINION: {
    title: "Opinion planner", fields: [
      f("opinion", "My opinion", "What do you think? One sentence."),
      f("reason1", "Reason 1 + example", "Why? Add a fact or an example."),
      f("reason2", "Reason 2 + example", "Another reason with a fact or an example."),
      f("reason3", "Reason 3 + example", "One more reason (optional).", false),
      f("conclusion", "Conclusion", "Say your opinion again in new words."),
    ],
    frames: ["I believe that ___ because ___.", "First, ___. For example, ___.", "Another reason is that ___.", "Also, ___. This shows that ___.", "Some people think ___, but ___.", "For these reasons, I think ___."],
  },
  HOW_TO: {
    title: "Steps planner", fields: [
      f("goal", "What we will make or do", "The goal in one sentence."),
      f("materials", "Materials", "Everything the reader needs."),
      f("steps", "Steps", "Each step in order, one per line."),
      f("tip", "Final tip", "A safety tip or a way to check it worked.", false),
    ],
    frames: ["Do you want to learn how to ___?", "You will need ___, ___ and ___.", "First, ___.", "Next, ___ for ___ minutes.", "After that, ___.", "Finally, ___.", "Be careful to ___."],
  },
  RESEARCH: {
    title: "Research notes", fields: [
      f("question", "Research question", "What are you finding out?"),
      f("source1", "Notes from source 1", "Two facts in your own words."),
      f("source2", "Notes from source 2", "Two facts in your own words.", false),
      f("answer", "My answer", "What do the sources tell you? One sentence."),
    ],
    frames: ["In this report, I will explain ___.", "According to “___”, ___.", "The article “___” says that ___.", "Both sources show that ___.", "This is important because ___.", "To sum up, ___."],
  },
  FREE: {
    title: "Quick plan", fields: [
      f("idea", "Main idea", "What is your writing about?"),
      f("details", "Details", "Three details you will use.", false),
    ],
    frames: ["I want to tell you about ___.", "One detail is ___.", "This is important because ___."],
  },
};

/** The organizer filled in: trimmed text per field (at most 1000 characters each); required fields must be filled. */
export function checkPlan(genre: Genre, plan: Record<string, unknown> | null | undefined, finish: boolean): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const value: Record<string, string> = {};
  for (const fl of ORGANIZERS[genre].fields) {
    const v = String(plan?.[fl.key] ?? "").replace(/\r/g, "").trim().slice(0, 1000);
    if (v) value[fl.key] = v;
    else if (finish && fl.required) return { ok: false, error: `Fill in “${fl.label}” before you start your draft.` };
  }
  return { ok: true, value };
}

// ------------------------------------------------------------------ revision moves (1–2 per revision)

/** Small, targeted moves for a weak trait (what to do in the REVISE stage). */
export const REVISION_MOVES: Record<string, { id: string; text: string }[]> = {
  focus: [
    { id: "focus-1", text: "Underline your main idea (or opinion). Cross out one sentence that is not about it." },
    { id: "focus-2", text: "Rewrite your first sentence so it tells the reader exactly what your writing is about." },
  ],
  organization: [
    { id: "org-1", text: "Add a linking or time word (first, next, also, because, finally) at the start of two sentences." },
    { id: "org-2", text: "Add a closing sentence that sums up your writing." },
    { id: "org-3", text: "Check the order: move one sentence or step to the place where it makes more sense." },
  ],
  evidence: [
    { id: "ev-1", text: "Add one more fact or example, and explain it with “This shows that …”." },
    { id: "ev-2", text: "Name where a fact comes from: “According to …” or “The text says …”." },
  ],
  details: [
    { id: "det-1", text: "Make two steps more exact: add how much, how long or where." },
    { id: "det-2", text: "Start each step with a strong action verb." },
  ],
  craft: [
    { id: "craft-1", text: "Add one line of dialogue that shows how a character feels." },
    { id: "craft-2", text: "Add two describing words or a detail about the setting (what you see, hear or smell)." },
  ],
  ideas: [
    { id: "ideas-1", text: "Add one more detail or example that answers the task." },
  ],
  language: [
    { id: "lang-1", text: "Replace two plain words (good, nice, big) with more exact ones." },
    { id: "lang-2", text: "Join two short sentences with and, but, so or because." },
  ],
  conventions: [
    { id: "conv-1", text: "Read your writing aloud slowly and fix every capital letter and end mark." },
    { id: "conv-2", text: "Check each verb: does it match its subject and the time (past, present, future)?" },
  ],
};
export const REVISION_MOVE_BY_ID = new Map(Object.values(REVISION_MOVES).flat().map((m) => [m.id, m.text]));

/** The revision moves that fit a rubric (its trait keys). */
export function movesForRubric(rubric: Rubric): { trait: string; id: string; text: string }[] {
  return rubric.traits.flatMap((t) => (REVISION_MOVES[t.key] ?? []).map((m) => ({ trait: t.key, ...m })));
}

/**
 * 1–2 targeted revision moves from the feedback: the first move of each of the (at most two) lowest traits below
 * the top score; when every trait has the top score, one move of the lowest trait anyway (there is always a step).
 */
export function pickMoves(rubric: Rubric, scores: Record<string, number> | null | undefined): string[] {
  const ranked = rubric.traits.map((t, i) => ({ key: t.key, v: Number(scores?.[t.key] ?? rubric.max), i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const weak = ranked.filter((r) => r.v < rubric.max).slice(0, 2);
  const traits = weak.length ? weak : ranked.slice(0, 1);
  const out = traits.map((r) => REVISION_MOVES[r.key]?.[0]?.id).filter((x): x is string => Boolean(x));
  // a single weak trait: give its second move too when it is far below the top
  if (weak.length === 1 && weak[0].v <= rubric.max - 2 && REVISION_MOVES[weak[0].key]?.[1]) out.push(REVISION_MOVES[weak[0].key][1].id);
  return out.slice(0, 2);
}

/** The teacher's chosen moves (1–2, each fitting the rubric). */
export function checkMoves(rubric: Rubric, ids: unknown): string[] {
  const allowed = new Set(movesForRubric(rubric).map((m) => m.id));
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)).filter(Boolean))];
  if (list.some((x) => !allowed.has(x))) throw new ValidationError("A revision step does not fit this task's rubric.");
  if (list.length > 2) throw new ValidationError("Choose one or two revision steps.");
  return list;
}
