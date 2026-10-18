/**
 * 👪 Things to practise at home, in simple words (weekly family report — family-week.ts): a skill's name is matched
 * to one plain-language topic with ONE simple home activity. Every text here is an interface string (English source,
 * Arabic in src/i18n/ar.ts), never a level or tier word.
 */
export interface HomeTopic { key: string; title: string; activity: string; /** r79: the platform skill behind the topic (its practice is linked on the page) */ skillId?: string }

export const HOME_TOPICS: readonly (HomeTopic & { match: RegExp })[] = [
  { key: "main-idea", match: /main idea|summar|central idea|key detail/i, title: "Finding the main idea", activity: "After reading a short story or article together, ask: “What is it mostly about?” Let your child answer in one sentence." },
  { key: "details", match: /evidence|detail|support|cite|explicit|ask and answer/i, title: "Finding details in the text", activity: "Ask one question about a page you read together and let your child point to the sentence that answers it." },
  { key: "inference", match: /infer|conclusion|predict|imply/i, title: "Reading between the lines", activity: "When your child tells you how a character feels, ask: “How do you know?” and look for the clue together." },
  { key: "story", match: /character|plot|story|theme|setting|narrat|poem|poetry|drama|point of view|sequence/i, title: "Understanding stories", activity: "Ask your child to retell a story you read together: the beginning, the middle and the end." },
  { key: "info", match: /informational|text structure|text feature|compare|contrast|cause|effect|author|purpose|reason/i, title: "Understanding information texts", activity: "Read a short news item, recipe or leaflet together and ask: “What does the writer want us to know?”" },
  { key: "words", match: /vocab|word|context|meaning|affix|prefix|suffix|root|synonym|antonym|figurative|idiom|simile|metaphor|dictionary|concept/i, title: "Learning new words", activity: "Choose three new words this week (from a book, a sign or the news) and use each one in a sentence at dinner." },
  { key: "sentences", match: /grammar|verb|noun|pronoun|adjective|adverb|sentence|clause|conjunction|preposition|tense|agreement|usage|language/i, title: "Writing correct sentences", activity: "Write a short message or shopping list together, then check it: does each sentence start with a capital letter and end with a full stop?" },
  { key: "spelling", match: /spell|capital|punctuat|comma|apostrophe|mechanic/i, title: "Spelling and punctuation", activity: "Dictate three short sentences; your child writes them, then you check the spelling and the full stops together." },
  { key: "fluency", match: /fluen|read aloud|aloud|phonic|decod|syllable/i, title: "Reading aloud smoothly", activity: "Read aloud together for 10 minutes: take turns reading a page, slowly and clearly." },
  { key: "writing", match: /writ|essay|paragraph|opinion|argument|explanatory/i, title: "Writing a few sentences", activity: "Ask your child to write three sentences about their day, then read them aloud to you." },
  { key: "reading", match: /.^/, title: "Reading every day", activity: "Read together for 15 minutes a day and talk about the book: what did you like, and why?" },
];

/** The topic of a skill's name (or a topic key); "Reading every day" when nothing matches. */
export function homeTopicFor(nameOrKey: string): HomeTopic {
  const byKey = HOME_TOPICS.find((t) => t.key === nameOrKey);
  const t = byKey ?? HOME_TOPICS.find((x) => x.match.test(nameOrKey)) ?? HOME_TOPICS[HOME_TOPICS.length - 1];
  return { key: t.key, title: t.title, activity: t.activity };
}
