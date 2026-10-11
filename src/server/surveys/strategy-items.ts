/**
 * 🧭 Reading Strategy Survey (metacomprehension) — 18 ORIGINAL items written for this platform: 6 before, 6 during and
 * 6 after reading. Each item is a short reading situation with four choices; exactly one shows an effective strategy
 * (tagged), the others are common but weak habits. Simple English for Grades 4–6. For grouping only, never placement.
 */
export type Phase = "BEFORE" | "DURING" | "AFTER";
export type ReadingStrategy = "PREVIEW" | "PREDICT" | "PURPOSE" | "BACKGROUND" | "SELF_QUESTION" | "FIX_UP" | "VISUALIZE" | "SUMMARIZE";

export const PHASES: Phase[] = ["BEFORE", "DURING", "AFTER"];
export const PHASE_LABEL: Record<Phase, string> = { BEFORE: "Before reading", DURING: "During reading", AFTER: "After reading" };
export const STRATEGY_LABEL: Record<ReadingStrategy, string> = {
  PREVIEW: "Previewing the text", PREDICT: "Predicting", PURPOSE: "Setting a purpose", BACKGROUND: "Using background knowledge",
  SELF_QUESTION: "Asking yourself questions", FIX_UP: "Rereading & fix-up", VISUALIZE: "Visualizing", SUMMARIZE: "Summarizing",
};
/** a short teaching move for each strategy group (used on the teacher's grouping page) */
export const STRATEGY_TIP: Record<ReadingStrategy, string> = {
  PREVIEW: "Model a 1-minute text walk: title, headings, pictures, bold words, captions. Students say what the text will be about.",
  PREDICT: "Stop at 2–3 points in a story; students write “I think … because …” and check the guess as they read on.",
  PURPOSE: "Before each text, students finish the sentence “I am reading to find out …” and check it at the end.",
  BACKGROUND: "Quick “What do I already know?” list before reading; after reading, mark what was new or different.",
  SELF_QUESTION: "Teach question starters (Who? Why? What if?). Partners ask and answer one question per page.",
  FIX_UP: "Teach the fix-up ladder: slow down → reread → read on → look at the picture → ask. Practise on a tricky paragraph.",
  VISUALIZE: "Read a descriptive paragraph aloud; students sketch the picture in their head and label it with words from the text.",
  SUMMARIZE: "Somebody–Wanted–But–So–Then for stories; main idea + 2 details for information texts. Keep it to 2–3 sentences.",
};

export interface SurveyItem { id: string; phase: Phase; strategy: ReadingStrategy; prompt: string; choices: [string, string, string, string]; best: 0 | 1 | 2 | 3 }

export const STRATEGY_ITEMS: SurveyItem[] = [
  // ---------------------------------------------------------------- BEFORE reading
  { id: "B1", phase: "BEFORE", strategy: "PREVIEW", prompt: "Your teacher gives you a new science article. What is the best thing to do first?",
    choices: ["Count how many pages it has.", "Look at the title, the headings and the pictures to see what it is about.", "Start reading the last paragraph.", "Find the longest word in the article."], best: 1 },
  { id: "B2", phase: "BEFORE", strategy: "PURPOSE", prompt: "You must read a page about volcanoes to answer three questions. Before you read, you should…",
    choices: ["read the three questions so you know what to look for.", "read as fast as you can.", "copy the first sentence into your notebook.", "look only at the pictures."], best: 0 },
  { id: "B3", phase: "BEFORE", strategy: "PREDICT", prompt: "A story is called “The Lost Key.” The cover shows a boy looking under his bed. What can you do before reading?",
    choices: ["Decide the story is too easy.", "Ask a friend to tell you the ending.", "Guess what will happen, then read to check your guess.", "Skip the title and the cover."], best: 2 },
  { id: "B4", phase: "BEFORE", strategy: "BACKGROUND", prompt: "You are going to read about camels in the desert. What helps you get ready?",
    choices: ["Think about what you already know about camels and deserts.", "Look up every word in the dictionary first.", "Read it with the book upside down.", "Wait until the end to think about the topic."], best: 0 },
  { id: "B5", phase: "BEFORE", strategy: "PREVIEW", prompt: "Your book chapter has bold words and a chart. Before you begin, it is smart to…",
    choices: ["ignore the bold words because they are hard.", "close the book and wait for the teacher.", "read only the page numbers.", "glance at the bold words and the chart to learn the main topics."], best: 3 },
  { id: "B6", phase: "BEFORE", strategy: "PURPOSE", prompt: "You choose a book about football for fun. What should you think about before you start?",
    choices: ["How quickly you can finish it.", "What you want to find out or enjoy in the book.", "Which page has the most pictures.", "Nothing — just open it anywhere."], best: 1 },
  // ---------------------------------------------------------------- DURING reading
  { id: "D1", phase: "DURING", strategy: "FIX_UP", prompt: "You read a sentence and it does not make sense to you. What should you do?",
    choices: ["Keep going and hope it gets better.", "Stop reading the whole book.", "Go back and read the sentence again, more slowly.", "Change the words to something else."], best: 2 },
  { id: "D2", phase: "DURING", strategy: "VISUALIZE", prompt: "The story describes a busy market full of colors, smells and noise. A good reader…",
    choices: ["makes a picture of the market in their mind.", "skips the describing words.", "counts the sentences in the paragraph.", "reads it as fast as possible."], best: 0 },
  { id: "D3", phase: "DURING", strategy: "SELF_QUESTION", prompt: "While reading, you wonder why the main character is so angry. What is the best thing to do?",
    choices: ["Forget about it.", "Ask yourself the question and look for clues as you keep reading.", "Decide the character is a bad person.", "Close the book."], best: 1 },
  { id: "D4", phase: "DURING", strategy: "FIX_UP", prompt: "You meet a new word, “enormous,” in the middle of a sentence. What can you do first?",
    choices: ["Skip the whole page.", "Say any word that starts with “e”.", "Stop and give up on the story.", "Read the words around it to work out its meaning."], best: 3 },
  { id: "D5", phase: "DURING", strategy: "PREDICT", prompt: "Halfway through a mystery, you find a new clue. A good reader…",
    choices: ["changes or checks their guess about what will happen next.", "stops thinking about the mystery.", "jumps to the last page to see the answer.", "reads the clue without thinking about it."], best: 0 },
  { id: "D6", phase: "DURING", strategy: "VISUALIZE", prompt: "An information text explains the steps of how rain forms. To understand it, you can…",
    choices: ["read only the first step.", "skip the steps and look at the title again.", "picture each step in your head, like a short movie.", "say the steps without listening to them."], best: 2 },
  // ---------------------------------------------------------------- AFTER reading
  { id: "A1", phase: "AFTER", strategy: "SUMMARIZE", prompt: "You finished a story and your friend asks what it was about. The best answer is…",
    choices: ["to read the whole story to them again.", "to tell the most important events in a few sentences.", "to say only the title.", "to tell one small detail you liked."], best: 1 },
  { id: "A2", phase: "AFTER", strategy: "FIX_UP", prompt: "A question after the text asks for a fact you do not remember. What should you do?",
    choices: ["Guess any answer.", "Leave it empty.", "Write what your neighbor wrote.", "Look back in the text to find the part that answers it."], best: 3 },
  { id: "A3", phase: "AFTER", strategy: "SELF_QUESTION", prompt: "After reading, how can you check that you really understood the text?",
    choices: ["Ask yourself questions about it and try to answer them.", "Count the paragraphs.", "Think only about the last sentence.", "Read the title one more time."], best: 0 },
  { id: "A4", phase: "AFTER", strategy: "SUMMARIZE", prompt: "You read a long article about recycling. What helps you remember it?",
    choices: ["Copy every sentence.", "Remember only the pictures.", "Write the main idea and two key details.", "Forget it until the test."], best: 2 },
  { id: "A5", phase: "AFTER", strategy: "BACKGROUND", prompt: "You read that some birds fly thousands of kilometers each year. After reading, it helps to…",
    choices: ["say it is not true because you never saw it.", "connect it to what you already knew and see what is new for you.", "stop thinking about birds.", "read a different page instead."], best: 1 },
  { id: "A6", phase: "AFTER", strategy: "SUMMARIZE", prompt: "Your teacher asks for the main idea of a paragraph. The best way to find it is to…",
    choices: ["pick the longest sentence.", "pick the word that appears first.", "choose the most interesting detail.", "think about what all the sentences are mostly about."], best: 3 },
];
