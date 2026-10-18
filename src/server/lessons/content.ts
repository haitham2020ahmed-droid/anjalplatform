/**
 * 🧩 Interactive intervention lessons: the ORIGINAL teaching content for every reading and vocabulary skill family.
 *
 * The lesson design follows a gradual-release intervention model (I do → we do → you do → quick check, with a
 * re-teach by a different approach when the check is missed). Every definition, strategy step, signal-word list,
 * model passage, think-aloud, sentence frame and re-teach idea below was written for this platform: Grades 4–6,
 * Arabic-speaking learners of English, neutral topics.
 *
 * Model passages: 90–140 words, paragraphs separated by a blank line; `clues` are exact sentences of the passage
 * that are highlighted when the teacher-voice models the strategy.
 */

export type OrganizerKind =
  | "CAUSE_EFFECT" | "COMPARE" | "SEQUENCE" | "PROBLEM_SOLUTION" | "CENTRAL_IDEA_DETAILS"
  | "PLOT_MAP" | "CHARACTER_TRAITS" | "CLAIM_EVIDENCE" | "CONTEXT_CLUE" | "WORD_PARTS" | "RULE_EXAMPLES" | "SENTENCE_FIX" | "NONE";

export interface ReteachApproach { title: string; how: string }

export interface LessonContent {
  family: string;
  name: string;
  /** a kid-friendly definition (one or two short sentences) */
  definition: string;
  /** 3–5 strategy steps, in order */
  steps: string[];
  /** signal words / structure words to look for */
  signalWords: string[];
  passage: { title: string; text: string; clues: string[] };
  /** a worked example on the model passage */
  worked: { question: string; answer: string; why: string };
  /** 4–6 short “I notice … I ask myself … so …” sentences */
  thinkAlound?: never;
  thinkAloud: string[];
  organizer: OrganizerKind;
  frames: [string, string];
  /** two alternate re-teach approaches (approach 1 and 2; approach 0 is the standard lesson) */
  reteach: [ReteachApproach, ReteachApproach];
  /** a 2-minute warm-up for the teacher's small-group script */
  warmUp: string;
}

const P = (...paras: string[]) => paras.join("\n\n");

// Update 40: the grammar, language (mechanics), spelling and writing lessons live in their own files
import { LANGUAGE_LESSONS } from "./content-language";
import { WRITING_LESSONS } from "./content-writing";

export const LESSONS: LessonContent[] = [
  // ------------------------------------------------------------------ literature
  {
    family: "theme", name: "Theme",
    definition: "A theme is the life lesson a story teaches. It is not what happens; it is what the story wants you to learn.",
    steps: ["Find what the main character wants or struggles with.", "Notice how the character changes by the end.", "Ask: what did the character learn?", "Say the lesson as a sentence that fits any person, not only this character."],
    signalWords: ["learned", "realized", "from then on", "finally understood", "next time", "changed"],
    passage: {
      title: "The Hundred-Piece Puzzle",
      text: P(
        "Reem opened the new puzzle box and poured out one hundred pieces. She wanted to finish it before dinner, so she pushed pieces together quickly. Many of them did not fit, and soon she was frowning.",
        "Her little brother Adel sat down and began sorting the pieces by color. \"Edges first,\" he said quietly. Reem rolled her eyes, but she watched him work.",
        "After a while, Reem began to sort too. Blue sky pieces went in one pile and green garden pieces in another. The picture grew slowly. When the last piece clicked into place, Reem smiled at Adel. She realized that slow and careful work had beaten her fast and messy work.",
      ),
      clues: ["Many of them did not fit, and soon she was frowning.", "She realized that slow and careful work had beaten her fast and messy work."],
    },
    worked: { question: "Which sentence best states the theme of the story?", answer: "Patient, careful work often gets better results than rushing.", why: "Reem rushes and fails, then works slowly with her brother and succeeds. The word “realized” shows the lesson she learned." },
    thinkAloud: [
      "I notice Reem wants to finish fast, but the pieces do not fit.",
      "I ask myself: what changes by the end of the story?",
      "I notice she starts sorting slowly, like Adel.",
      "I see the signal word “realized” in the last paragraph, so the lesson is close by.",
      "So the theme is a lesson for anyone: careful work beats rushing.",
    ],
    organizer: "CENTRAL_IDEA_DETAILS",
    frames: ["At first, the character ___, but by the end the character ___.", "The story teaches that ___ because ___."],
    reteach: [
      { title: "Change chart", how: "Draw two boxes: “Beginning” and “End”. Write how the character acts in each box, then write what made the difference. The difference is the lesson." },
      { title: "Fable link", how: "Compare the story with a short fable the student already knows. Both stories teach a lesson; say each lesson as “People should …”." },
    ],
    warmUp: "Tell a two-sentence story about a time someone learned something by making a mistake. Ask: what is the lesson for everyone?",
  },
  {
    family: "summarize", name: "Summarize",
    definition: "A summary tells the most important ideas of a text in a few sentences, in your own words. It leaves out small details and opinions.",
    steps: ["Read the whole text first.", "Find the most important idea in each paragraph.", "Cross out small details and examples.", "Join the important ideas into two or three sentences in your own words."],
    signalWords: ["mostly", "the main", "overall", "most important", "in short", "first / then / finally"],
    passage: {
      title: "Trees That Live in the Sea",
      text: P(
        "Mangrove trees grow along the warm coasts of the Red Sea and the Arabian Gulf. Unlike most trees, they can live in salty water. Their roots push out salt, and some leaves store extra salt and then drop off.",
        "Mangroves are important homes for animals. Small fish and crabs hide between the tangled roots, and birds build nests in the branches above.",
        "Mangroves also protect the land. Their thick roots slow down waves and hold the sand in place, so the coast does not wash away during storms. Today, many people plant young mangroves to keep the coasts healthy.",
      ),
      clues: ["Mangroves are important homes for animals.", "Mangroves also protect the land."],
    },
    worked: { question: "Which is the best summary of the text?", answer: "Mangrove trees can live in salty water, give homes to animals, and protect coasts from waves.", why: "It joins the big idea of each paragraph and leaves out small details such as crabs or birds' nests." },
    thinkAloud: [
      "I notice each paragraph begins with a big idea.",
      "I ask myself: what is paragraph two mostly about? Homes for animals.",
      "I notice crabs and birds are examples, so they are details I can leave out.",
      "I ask myself: is my summary in my own words and short?",
      "So my summary has three parts: salty water, animal homes, coast protection.",
    ],
    organizer: "CENTRAL_IDEA_DETAILS",
    frames: ["This text is mostly about ___.", "First, ___. Also, ___. Finally, ___."],
    reteach: [
      { title: "One-line per paragraph", how: "Cover the text and write one short line for each paragraph (no more than eight words). Then read the lines together as the summary." },
      { title: "Keep or cut", how: "Write each sentence of the text on a strip. Sort the strips into “Keep: big idea” and “Cut: small detail”. Summarize only the kept strips." },
    ],
    warmUp: "Summarize yesterday's lesson in exactly ten words. Compare two summaries: which kept the big ideas?",
  },
  {
    family: "character", name: "Character Traits & Development",
    definition: "A character trait is a word that tells what a character is like inside, such as brave, kind or selfish. We learn traits from what a character says, does and thinks.",
    steps: ["Notice what the character says, does and thinks.", "Ask: what kind of person acts like this?", "Name the trait with one describing word.", "Find a second action that proves the same trait.", "Check whether the character changes by the end."],
    signalWords: ["said", "decided", "thought", "felt", "instead", "even though"],
    passage: {
      title: "The New Student",
      text: P(
        "On the first day of school, a new boy named Faris stood alone near the door of the classroom. He held his bag tightly and looked at the floor.",
        "Yusuf noticed him right away. Even though his friends were waving him over, Yusuf walked to Faris instead. \"You can sit next to me,\" he said. \"I'll show you where the library is at break.\"",
        "At break, Yusuf shared half of his sandwich because Faris had forgotten his lunch. Later, when the teacher asked who could help Faris with the math pages, Yusuf raised his hand first.",
      ),
      clues: ["Even though his friends were waving him over, Yusuf walked to Faris instead.", "At break, Yusuf shared half of his sandwich because Faris had forgotten his lunch."],
    },
    worked: { question: "Which word best describes Yusuf?", answer: "Kind", why: "He leaves his friends to help Faris, shares his sandwich, and offers to help with math. Three actions show the same trait." },
    thinkAloud: [
      "I notice Yusuf walks to Faris even though his friends are calling him.",
      "I ask myself: what kind of person does that?",
      "I notice he also shares his sandwich and offers to help.",
      "I ask myself: do all these actions point to one trait?",
      "So Yusuf is kind, and I have three actions as proof.",
    ],
    organizer: "CHARACTER_TRAITS",
    frames: ["___ is ___ because in the text he/she ___.", "I can tell ___ is ___ when ___."],
    reteach: [
      { title: "Act it out", how: "Act out one action from the text without words. The group guesses the trait, then finds the sentence that matches the action." },
      { title: "Trait word bank", how: "Give a bank of six trait words with simple meanings. Match each action from the text to one trait word, then choose the trait with the most matches." },
    ],
    warmUp: "Show a quick action (holding the door for someone). Ask: what does this action tell you about the person?",
  },
  {
    family: "character-perspective", name: "Character Perspective",
    definition: "A character's perspective is how that character sees and feels about something. Two characters can see the same event in very different ways.",
    steps: ["Find the event that the characters share.", "Find what each character says or thinks about it.", "Name how each one feels.", "Explain why each character feels that way."],
    signalWords: ["thought", "felt", "believed", "to him", "to her", "on the other hand"],
    passage: {
      title: "Rain on Saturday",
      text: P(
        "On Saturday morning, rain fell on the city for the first time in months. Noura pressed her face against the window and clapped. \"Finally!\" she said. \"The plants in our garden will drink at last, and the air smells so fresh.\"",
        "Her cousin Ziad sat on the sofa with his football in his lap. He had waited all week for the match at the park. \"Now the field will be mud,\" he groaned. \"This rain ruined my whole day.\"",
        "Grandmother smiled at both of them. \"The same rain,\" she said, \"but two very different days.\"",
      ),
      clues: ["\"The plants in our garden will drink at last, and the air smells so fresh.\"", "\"This rain ruined my whole day.\""],
    },
    worked: { question: "How is Ziad's view of the rain different from Noura's?", answer: "Noura is happy because the rain helps the garden; Ziad is upset because the rain spoils his football match.", why: "Each character's own words show a feeling and a reason." },
    thinkAloud: [
      "I notice both characters see the same rain.",
      "I notice Noura claps and says “Finally!”, so she is happy.",
      "I ask myself: why is Ziad groaning? His match will be cancelled.",
      "I ask myself: what does each one care about? Plants and football.",
      "So their perspectives are different because they want different things.",
    ],
    organizer: "COMPARE",
    frames: ["___ feels ___ about ___ because ___.", "While ___ thinks ___, ___ thinks ___."],
    reteach: [
      { title: "Two speech bubbles", how: "Draw two faces with speech and thought bubbles. Copy what each character says, then write what each one is thinking but not saying." },
      { title: "Hot seat", how: "One student is a character and answers the group's questions (“How do you feel? Why?”). Swap to the other character and compare." },
    ],
    warmUp: "Ask: how might a farmer and a child at the beach each feel about a very hot day?",
  },
  {
    family: "point-of-view", name: "Point of View and Perspective",
    definition: "Point of view tells who is telling the story. In first person, the narrator is in the story and uses I and we. In third person, the narrator is outside and uses he, she and they.",
    steps: ["Look at the pronouns outside the quotation marks.", "If you see I, me, my or we, the narrator is a character (first person).", "If you see he, she or they, the narrator is outside the story (third person).", "Ask what the narrator can and cannot know."],
    signalWords: ["I", "me", "my", "we", "he", "she", "they"],
    passage: {
      title: "My First Falcon Show",
      text: P(
        "I had never seen a real falcon up close before last winter. My uncle took me to the falcon show outside the city, and I held my breath when the trainer lifted the bird into the air.",
        "The falcon flew in wide circles and then dived so fast that I almost missed it. Everyone around me cheered. My heart was pounding, and I grabbed my uncle's sleeve.",
        "I wondered what the falcon was thinking as it landed on the trainer's glove. Was it proud? Was it tired? I could not tell, but I knew I wanted to come back next year.",
      ),
      clues: ["I wondered what the falcon was thinking as it landed on the trainer's glove.", "I could not tell, but I knew I wanted to come back next year."],
    },
    worked: { question: "From which point of view is the story told?", answer: "First person: the narrator is a child at the show who uses I and my.", why: "The narrator uses I, me and my outside of quotation marks, and cannot know what the falcon thinks." },
    thinkAloud: [
      "I notice the word “I” in the very first sentence, and it is not in quotation marks.",
      "I ask myself: is the narrator part of the story? Yes, the child is at the show.",
      "I notice the narrator wonders what the falcon thinks.",
      "So the narrator cannot read other minds, which fits first person.",
      "So this story is told in the first-person point of view.",
    ],
    organizer: "NONE",
    frames: ["The story is told in ___ person because the narrator uses ___.", "The narrator knows ___, but cannot know ___."],
    reteach: [
      { title: "Pronoun hunt", how: "Highlight every pronoun outside quotation marks in one color and every pronoun inside them in another. Count only the first color to decide." },
      { title: "Rewrite a sentence", how: "Rewrite two sentences from the text in the other point of view (I → he/she). Say what changes and what the narrator can now know." },
    ],
    warmUp: "Say one sentence about your morning with “I”, then say it again as if someone else is telling it with “he” or “she”.",
  },
  {
    family: "plot-conflict", name: "Plot: Conflict and Resolution",
    definition: "The conflict is the main problem a character faces. The resolution is how the problem is solved or ends.",
    steps: ["Find what the character wants.", "Find what gets in the way: that is the conflict.", "Follow what the character tries.", "Find how the problem ends: that is the resolution."],
    signalWords: ["but", "problem", "suddenly", "tried", "finally", "in the end"],
    passage: {
      title: "The Leaning Tower",
      text: P(
        "Maha and Salem had one week to build a tower for the school science fair. They used straws and tape, but every time the tower reached the height of a ruler, it leaned and fell.",
        "\"It is too heavy at the top,\" Salem said. They tried adding more tape, but that only made it heavier. Maha wanted to give up.",
        "Then Maha remembered how the old wind towers in her grandfather's village were wide at the bottom. They rebuilt the tower with a wide base of triangles. In the end, it stood straight and tall, and the judges gave it a blue ribbon.",
      ),
      clues: ["They used straws and tape, but every time the tower reached the height of a ruler, it leaned and fell.", "They rebuilt the tower with a wide base of triangles."],
    },
    worked: { question: "How is the conflict resolved?", answer: "They rebuild the tower with a wide base of triangles, so it stands.", why: "The problem is the falling tower; the last paragraph shows the fix and the signal words “In the end”." },
    thinkAloud: [
      "I notice the word “but” in the first paragraph: the tower keeps falling.",
      "I ask myself: what do Maha and Salem want? A tall tower for the fair.",
      "I notice their first try, more tape, makes it worse.",
      "I see “Then” and “In the end”, so the solution is coming.",
      "So the resolution is the wide base of triangles that makes the tower stand.",
    ],
    organizer: "PROBLEM_SOLUTION",
    frames: ["The main problem is ___.", "The problem is solved when ___."],
    reteach: [
      { title: "Story mountain", how: "Draw a mountain. Write the problem at the bottom left, the tries going up, the turning point at the top, and the resolution going down." },
      { title: "Problem cards", how: "Read three tiny stories on cards. For each, point to the “but” sentence (the problem) and the “finally” sentence (the resolution) before returning to the lesson text." },
    ],
    warmUp: "Describe a problem: “I wanted to play outside, but it was too hot.” Ask two students for different resolutions.",
  },
  {
    family: "plot-events", name: "Plot: Sequence of Events",
    definition: "The sequence of events is the order in which things happen in a story: beginning, middle and end.",
    steps: ["Find the first event of the story.", "Look for time and order words.", "List each important event in order.", "Check that each event leads to the next one."],
    signalWords: ["first", "next", "then", "after", "before", "later", "while", "finally"],
    passage: {
      title: "Bread with Grandfather",
      text: P(
        "Early on Friday, Khalid helped his grandfather bake bread. First, they mixed flour, water, salt and a spoon of yeast in a big bowl. Then Khalid pressed and folded the dough until his arms were tired.",
        "Next, they covered the bowl with a cloth and waited. While the dough rose, Grandfather told stories about his own childhood.",
        "After an hour, the dough was twice as big. They shaped it into flat rounds and slid them into the hot oven. Finally, the kitchen filled with a warm smell, and the whole family sat down to eat.",
      ),
      clues: ["First, they mixed flour, water, salt and a spoon of yeast in a big bowl.", "After an hour, the dough was twice as big."],
    },
    worked: { question: "What happens right after Khalid and his grandfather cover the bowl?", answer: "They wait while the dough rises, and Grandfather tells stories.", why: "The word “Next” starts the waiting step, and “While” shows the stories happen at the same time." },
    thinkAloud: [
      "I notice the signal word “First”, so the story begins with mixing.",
      "I notice “Then” and “Next”, so I can list the steps in order.",
      "I ask myself: what does “While” mean here? Two things happen at the same time.",
      "I notice “After an hour” jumps forward in time.",
      "So the order is mix, knead, wait, shape, bake, eat.",
    ],
    organizer: "SEQUENCE",
    frames: ["First, ___. Then, ___. After that, ___. Finally, ___.", "Before ___, ___ happened."],
    reteach: [
      { title: "Picture strip", how: "Draw four quick boxes, one picture per event. Cut them apart, mix them up, and put them back in order while saying the signal words." },
      { title: "Timeline with a finger", how: "Read slowly and stop at every signal word. Move a finger one step along a drawn timeline and say the event aloud." },
    ],
    warmUp: "Ask students to tell how they got ready this morning in four steps, using first, then, next, finally.",
  },
  {
    family: "plot-setting", name: "Plot: Setting",
    definition: "The setting is where and when a story happens. Details about the place, time and weather help you picture it.",
    steps: ["Look for place words (where).", "Look for time words (when: time of day, season, past or present).", "Notice details about weather, sounds and light.", "Ask how the setting affects the characters."],
    signalWords: ["at", "in", "on", "that night", "in the morning", "during", "long ago"],
    passage: {
      title: "Night at the Desert Camp",
      text: P(
        "The sun had set behind the red dunes, and the desert camp grew quiet. Our tents stood in a half circle around a small fire, and the sand was already cool under my feet.",
        "Above us, the sky was so dark that thousands of stars appeared, more than I had ever seen in the city. A light wind carried the smell of smoke and cardamom coffee.",
        "Somewhere far away, a camel made a low sound. My sister moved closer to the fire. In the middle of the empty desert, at night, every small noise seemed loud.",
      ),
      clues: ["The sun had set behind the red dunes, and the desert camp grew quiet.", "In the middle of the empty desert, at night, every small noise seemed loud."],
    },
    worked: { question: "Where and when does the story take place?", answer: "At a camp in the desert, at night after sunset.", why: "“The sun had set behind the red dunes” gives the place and the time at once." },
    thinkAloud: [
      "I notice “the sun had set”, so it is evening or night.",
      "I notice “red dunes” and “desert camp”, so the place is the desert.",
      "I ask myself: what details help me picture it? Stars, cool sand, fire.",
      "I ask myself: how does the setting affect the characters? The sister moves closer to the fire.",
      "So the setting is a quiet desert camp at night, and it makes noises feel loud.",
    ],
    organizer: "PLOT_MAP",
    frames: ["The story takes place in ___ during ___.", "The setting matters because ___."],
    reteach: [
      { title: "Sketch the place", how: "Draw the setting using only details from the text. Label each detail with the line number it came from." },
      { title: "Where-when sort", how: "Sort phrases from the text into two columns: Where? and When? Then build one sentence from each column." },
    ],
    warmUp: "Describe our classroom right now as a story setting: one place detail, one time detail, one sound.",
  },
  {
    family: "plot-flashback", name: "Plot: Flashback",
    definition: "A flashback is a part of a story that goes back in time to show something that happened earlier. It helps you understand a character's feelings now.",
    steps: ["Notice where the time changes in the story.", "Look for words that send you back (remembered, years ago, when she was little).", "Find where the story returns to the present.", "Ask why the author included the earlier event."],
    signalWords: ["remembered", "years ago", "back then", "when she was", "had been", "now"],
    passage: {
      title: "The Deep End",
      text: P(
        "Huda stood at the edge of the pool and looked at the deep water. Her swimming test would start in five minutes, and her legs felt shaky.",
        "She remembered the summer when she was six. A wave at the beach had pushed her under, and she had come up coughing and crying. Back then, she had promised herself never to swim again.",
        "Now the coach blew the whistle. Huda took a deep breath, the way she had practiced for months, and jumped. When her head came up, she was smiling.",
      ),
      clues: ["She remembered the summer when she was six.", "Now the coach blew the whistle."],
    },
    worked: { question: "Why does the author include the memory of the beach?", answer: "To show why Huda is afraid of deep water and why jumping in is brave for her.", why: "The flashback (“She remembered…”) explains her shaky legs in the present." },
    thinkAloud: [
      "I notice Huda is nervous at the pool, in the present.",
      "I notice the words “She remembered the summer when she was six”, so the story goes back in time.",
      "I ask myself: what happened back then? A wave scared her.",
      "I notice the word “Now”, so the story returns to the present.",
      "So the flashback explains her fear and makes her jump more brave.",
    ],
    organizer: "SEQUENCE",
    frames: ["The flashback begins when ___ and ends when ___.", "The flashback helps me understand that ___."],
    reteach: [
      { title: "Two-color timeline", how: "Draw a timeline. Put present events in one color and the flashback in another, in the real order they happened." },
      { title: "Then-and-now table", how: "Make a two-column table, “Then” and “Now”. Sort each sentence of the text, then explain how “Then” changes how we see “Now”." },
    ],
    warmUp: "Ask: what is something you remember from when you were small? How does that memory change how you feel today?",
  },
  {
    family: "plot-foreshadowing", name: "Plot: Foreshadowing",
    definition: "Foreshadowing is a hint the author gives early in a story about something that will happen later.",
    steps: ["Notice details that seem a little strange or worrying early in the story.", "Ask: why would the author mention this?", "Make a guess about what might happen.", "Check your guess as you read the ending."],
    signalWords: ["little did", "for now", "strange", "creaked", "if only", "a feeling"],
    passage: {
      title: "The Old Ladder",
      text: P(
        "Grandfather's ladder had lived in the storeroom for twenty years. When Bandar pulled it out to reach the dates on the tall palm, one of the wooden steps creaked loudly. \"It's fine,\" he told his sister, and he climbed up.",
        "The dates were brown and sweet. Bandar filled the basket and called down to Laila to hold the ladder still. She noticed a thin crack running along the third step.",
        "On the way down, Bandar stepped on that third step. With a sharp snap, it broke, and he slid to the ground with the basket in his arms. Luckily, only a few dates were lost.",
      ),
      clues: ["one of the wooden steps creaked loudly.", "She noticed a thin crack running along the third step."],
    },
    worked: { question: "Which detail foreshadows the ladder breaking?", answer: "The step creaks loudly, and Laila sees a thin crack on the third step.", why: "These worrying details come early, and later the same third step breaks." },
    thinkAloud: [
      "I notice the ladder is twenty years old and a step creaks.",
      "I ask myself: why would the author tell me about a creak?",
      "I notice Laila sees a crack on the third step.",
      "So I predict the step might break.",
      "So when the third step snaps, I know those details were foreshadowing.",
    ],
    organizer: "PLOT_MAP",
    frames: ["The author hints that ___ when the text says ___.", "This clue made me predict ___."],
    reteach: [
      { title: "Clue detective", how: "Read only the first half. Underline anything that “feels worrying”. Make a prediction, then read the ending and tick the clues that came true." },
      { title: "Weather sign", how: "Compare foreshadowing to dark clouds before rain. Match each early clue in the text to the later event it warned about." },
    ],
    warmUp: "Say: “The boy put his phone on the very edge of the table.” Ask: what might happen later? Why did I tell you that?",
  },
  {
    family: "make-predictions", name: "Make Predictions",
    definition: "A prediction is a smart guess about what will happen next, based on clues in the text and what you already know.",
    steps: ["Stop and look at what has happened so far.", "Find clues about the characters and the problem.", "Add what you already know about how things usually go.", "Make a prediction and give a reason.", "Keep reading and check or change your prediction."],
    signalWords: ["will", "might", "probably", "planned", "decided", "getting ready"],
    passage: {
      title: "Sami's Seeds",
      text: P(
        "Sami saved the seeds from every watermelon his family ate that summer. He dried them on a plate by the window and kept them in a small jar with a label.",
        "In autumn, he asked his father for a corner of the garden. He dug the soil, mixed in old leaves, and made neat rows with a stick. Every morning before school, he filled the watering can.",
        "One day, Sami noticed tiny green leaves pushing up through the soil in every row. He ran to get his notebook and a ruler, and he began to draw what he saw.",
      ),
      clues: ["Every morning before school, he filled the watering can.", "He ran to get his notebook and a ruler, and he began to draw what he saw."],
    },
    worked: { question: "What will Sami most likely do next?", answer: "He will keep caring for the plants and measure and record how they grow.", why: "He waters every day, and he gets a notebook and a ruler, which people use to track growth." },
    thinkAloud: [
      "I notice Sami is very careful: he labels, digs, and waters every morning.",
      "I ask myself: what do the tiny green leaves mean? The seeds are growing.",
      "I notice he takes a notebook and a ruler.",
      "I know that a ruler is used to measure, so he wants to track growth.",
      "So I predict he will keep watering and record the plants' growth.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["I predict ___ because the text says ___.", "My prediction was ___; now I think ___ because ___."],
    reteach: [
      { title: "Stop-and-guess cards", how: "Read the text in three parts. After each part, write a guess on a sticky note with one clue. Move or change the note after the next part." },
      { title: "Clue + me = guess", how: "Use a three-box equation: “Text clue” + “What I know” = “Prediction”. Fill it in together for the lesson text." },
    ],
    warmUp: "Show a picture idea: a boy putting on a helmet and holding a bicycle. Ask: what will happen next, and which clue tells you?",
  },
  {
    family: "visualize", name: "Visualize",
    definition: "To visualize is to make a picture in your mind using the words in the text. Strong describing words help you see, hear, smell and feel the scene.",
    steps: ["Read slowly and notice describing words.", "Find words for each sense: see, hear, smell, touch, taste.", "Build the picture in your mind piece by piece.", "Check your picture against the text and fix what does not match."],
    signalWords: ["looked like", "sounded", "smelled", "felt", "bright", "colors and shapes"],
    passage: {
      title: "Morning at the Market",
      text: P(
        "At six in the morning, the old market was already busy. Sellers pulled back colorful cloth covers, and the first rays of sun turned the piles of oranges into small glowing hills.",
        "The air smelled of fresh mint, warm bread and strong coffee. A man pushed a squeaky cart of melons past a stall full of shiny copper pots.",
        "Mona held her mother's hand and walked carefully over the wet stones of the path. Every few steps, a seller called out prices in a loud, singing voice, and pigeons flew up from the roof in a grey cloud.",
      ),
      clues: ["the first rays of sun turned the piles of oranges into small glowing hills.", "The air smelled of fresh mint, warm bread and strong coffee."],
    },
    worked: { question: "Which details help you picture how the market smells?", answer: "Fresh mint, warm bread and strong coffee.", why: "The sentence that begins “The air smelled of” lists three smells." },
    thinkAloud: [
      "I notice “colorful cloth covers” and “glowing hills” of oranges, so I see bright colors.",
      "I notice “smelled of fresh mint, warm bread and strong coffee”, so I add smells to my picture.",
      "I ask myself: what do I hear? A squeaky cart, sellers singing, pigeons.",
      "I notice “wet stones”, so I imagine the ground feels slippery.",
      "So my mind picture is a bright, noisy, sweet-smelling morning market.",
    ],
    organizer: "NONE",
    frames: ["In my mind I can see ___ because the text says ___.", "The words ___ help me hear/smell/feel ___."],
    reteach: [
      { title: "Five-senses sketch", how: "Fold a page into five boxes, one for each sense. Draw or write one detail from the text in each box, then describe the full scene aloud." },
      { title: "Eyes-closed reading", how: "The teacher reads one paragraph slowly while students close their eyes. Students describe their picture, then check every detail against the text." },
    ],
    warmUp: "Close your eyes. I will say one sentence about rain on a hot day. What do you see, hear and feel?",
  },
  {
    family: "ask-answer-questions", name: "Ask and Answer Questions",
    definition: "Good readers ask questions before, during and after reading, and then look for the answers in the text.",
    steps: ["Before reading, look at the title and ask what you want to know.", "During reading, ask who, what, where, when, why and how.", "Find the sentence that answers each question.", "If the text does not answer it, say so, or think about where to find out."],
    signalWords: ["who", "what", "where", "when", "why", "how", "because"],
    passage: {
      title: "The Falcon's Eyes",
      text: P(
        "Why can a falcon see a small bird from very far away? The answer is in its eyes. A falcon's eyes are very large compared to the size of its head.",
        "Inside each eye, a falcon has two special spots that help it see clearly. One spot looks to the side, and the other looks straight ahead. Because of this, a falcon can watch two directions at once.",
        "Falcons can also see colors that people cannot see. This helps them spot the trails that small animals leave on the ground. With eyes like these, a falcon can find its food from high in the sky.",
      ),
      clues: ["A falcon's eyes are very large compared to the size of its head.", "Because of this, a falcon can watch two directions at once."],
    },
    worked: { question: "How can a falcon watch two directions at once?", answer: "Each eye has two special spots: one looks to the side and one looks straight ahead.", why: "The answer is in paragraph 2, in the sentences before and after the signal word “Because”." },
    thinkAloud: [
      "I notice the text starts with a question, so I read to find the answer.",
      "I ask myself a new question: how can it watch two directions?",
      "I notice paragraph 2 talks about two special spots.",
      "I notice the signal words “Because of this”, which connect the spots to the answer.",
      "So I can answer my question with words from paragraph 2.",
    ],
    organizer: "NONE",
    frames: ["I wonder ___? The text answers this when it says ___.", "My question was ___; the answer is ___."],
    reteach: [
      { title: "Question words fan", how: "Use a fan of six cards (who, what, where, when, why, how). Pick a card, ask one question about the text, and find the answer sentence together." },
      { title: "Answer-in-the-text check", how: "Write three questions about the text. Sort them: “answered right there”, “answered by putting parts together”, “not answered”." },
    ],
    warmUp: "Show only the title “The Falcon's Eyes”. Ask each student to say one question they hope the text will answer.",
  },
  {
    family: "reread", name: "Reread to Clarify",
    definition: "When a part of the text is confusing, stop and read it again slowly. Rereading helps you fix misunderstandings.",
    steps: ["Notice when you are confused or lost.", "Go back to the start of the confusing part.", "Read it again slowly, maybe aloud.", "Look for key words, numbers or signal words you missed.", "Say the idea in your own words."],
    signalWords: ["but", "however", "not", "actually", "instead", "this means"],
    passage: {
      title: "What Is in a Camel's Hump?",
      text: P(
        "Many people think that a camel's hump is full of water. However, this is not true. The hump actually stores fat, not water.",
        "When food is hard to find in the desert, the camel's body uses this fat for energy. As the fat is used, the hump becomes smaller and may even lean to one side.",
        "Camels can still go many days without drinking. This is because their bodies lose very little water. When a thirsty camel does find water, it can drink more than one hundred liters in a few minutes.",
      ),
      clues: ["However, this is not true. The hump actually stores fat, not water.", "This is because their bodies lose very little water."],
    },
    worked: { question: "What does a camel's hump store?", answer: "Fat, which the camel uses for energy.", why: "Rereading the first paragraph shows the signal word “However”: the common idea about water is not true." },
    thinkAloud: [
      "I notice the first sentence says the hump is full of water.",
      "I notice the word “However”, so the text is about to disagree.",
      "I ask myself: did I read too fast? I reread and see “actually stores fat, not water”.",
      "I ask myself: then how do camels go days without drinking? I reread paragraph 3.",
      "So after rereading, I understand: fat in the hump, and very little water lost.",
    ],
    organizer: "NONE",
    frames: ["At first I thought ___, but when I reread I found ___.", "The part that confused me was ___; now I understand ___."],
    reteach: [
      { title: "Read like a robot, then a reporter", how: "Reread the confusing sentence word by word, then read it again with expression. Stop at “not”, “however” and numbers, and say what each changes." },
      { title: "Fix-up checklist", how: "Use a three-question card: Which words did I skip? What does “not” or “however” change? Can I say it in my own words? Answer each for the lesson text." },
    ],
    warmUp: "Read aloud: “It is not true that all deserts are hot.” Ask: what does the sentence say? Reread it together and find the trap word.",
  },
  {
    family: "drama-elements", name: "Elements of Drama",
    definition: "A drama, or play, is a story written to be performed. It has a cast of characters, dialogue after each name, and stage directions in brackets that tell actors what to do.",
    steps: ["Read the cast list to meet the characters.", "Read the stage directions to learn the setting and actions.", "Follow the dialogue: each line starts with the speaker's name.", "Ask what the stage directions show that the dialogue does not."],
    signalWords: ["cast", "scene", "stage directions", "[brackets]", "enters", "exits"],
    passage: {
      title: "The Lost Library Book",
      text: P(
        "CAST: ALI, a fifth grader; MS. HANAN, the librarian",
        "SCENE: The school library, just before the bell. [ALI enters slowly, looking at the floor.]",
        "MS. HANAN: Good morning, Ali. Are you returning the book about planets?",
        "ALI: [quietly] I can't find it. I looked under my bed and in my bag.",
        "MS. HANAN: [smiling and holding up a blue book] Was it this one? Your classmate found it on the bus yesterday.",
        "ALI: [jumping up] Yes! Thank you! I was so worried. I will take better care of it next time.",
        "MS. HANAN: Then you may borrow the next one in the series. [She hands him a second book. ALI exits happily.]",
      ),
      clues: ["[ALI enters slowly, looking at the floor.]", "[jumping up]"],
    },
    worked: { question: "What do the stage directions show about how Ali feels at the beginning?", answer: "He feels worried or ashamed: he enters slowly, looks at the floor and speaks quietly.", why: "The words in brackets show actions and tone that the dialogue alone does not say." },
    thinkAloud: [
      "I notice the cast list tells me there are two characters.",
      "I notice the words in brackets are stage directions, not lines to say aloud.",
      "I ask myself: how does Ali walk in? Slowly, looking at the floor.",
      "I notice his feelings change when the stage direction says “jumping up”.",
      "So the stage directions show Ali goes from worried to happy.",
    ],
    organizer: "NONE",
    frames: ["The stage direction ___ shows that ___.", "In this scene, the setting is ___ and the characters are ___."],
    reteach: [
      { title: "Perform it twice", how: "Read the scene aloud once without stage directions and once acting them out. Talk about what the audience learns only from the actions." },
      { title: "Story to script", how: "Turn two sentences of a short story into a script: names, dialogue and one stage direction. Then label each part of the lesson play the same way." },
    ],
    warmUp: "Say a line “I can't find it” in three different ways (sad, angry, surprised). Ask: what stage direction would tell the actor which way?",
  },
  {
    family: "poetry-elements", name: "Poetry: Structure, Rhyme, Meter and Form",
    definition: "A poem is made of lines grouped into stanzas. Many poems use rhyme (words that end with the same sound) and rhythm (a beat you can tap).",
    steps: ["Count the lines and the stanzas.", "Read the poem aloud and tap the beat.", "Find the words that rhyme at the ends of lines.", "Ask what each stanza is mostly about."],
    signalWords: ["line", "stanza", "rhyme", "repeat", "beat", "verse"],
    passage: {
      title: "The Palm Tree",
      text: P(
        "Beside our house the palm tree stands,\nIt's taller than the roofs and sands,\nIts branches wave like giant hands\nTo greet the wind from distant lands.",
        "In summer when the sun is high,\nIts dates turn gold against the sky,\nThe birds that hurry, swooping by,\nStop in its shade before they fly.",
        "At night it whispers, soft and low,\nTo moonlit dunes that sleep below,\nIt's seen a hundred summers go,\nAnd still it has more years to grow.",
        "So when I'm grown and far away,\nI'll think of it on every day,\nThat patient tree in green and grey\nWho taught me how to stand and stay.",
      ),
      clues: ["In summer when the sun is high,", "So when I'm grown and far away,"],
    },
    worked: { question: "How is the poem organized?", answer: "Four stanzas of four lines each; in each stanza all four lines rhyme with each other.", why: "Counting the groups of lines gives four stanzas, and the end words (stands, sands, hands, lands) share one sound." },
    thinkAloud: [
      "I notice the lines are grouped with spaces between them, so these are stanzas.",
      "I count four stanzas with four lines in each.",
      "I notice the end words stands, sands, hands, lands all sound alike, so they rhyme.",
      "I ask myself: what is each stanza about? Day, summer, night, and the future.",
      "So the poem uses rhyme and stanzas to move through time with the palm tree.",
    ],
    organizer: "NONE",
    frames: ["The poem has ___ stanzas with ___ lines each.", "The words ___ and ___ rhyme, which makes the poem sound ___."],
    reteach: [
      { title: "Clap the beat", how: "Clap or tap each line while reading aloud. Mark the end word of each line and connect rhyming words with the same color." },
      { title: "Poem vs paragraph", how: "Rewrite one stanza as a normal sentence. Compare: what did the poem have (lines, stanzas, rhyme) that the sentence lost?" },
    ],
    warmUp: "Say “cat, hat, ___”. Students add rhyming words. Then ask: where do rhymes usually come in a poem?",
  },
  {
    family: "sound-devices", name: "Sound Devices (Assonance, Consonance, Alliteration)",
    definition: "Sound devices are ways poets play with sounds. Alliteration repeats the first sound of nearby words; assonance repeats vowel sounds; consonance repeats consonant sounds inside or at the end of words.",
    steps: ["Read the lines aloud slowly.", "Listen for the same sound repeated in nearby words.", "Decide where the sound is: start of words, vowel sound, or consonant sound inside or at the end.", "Ask what feeling or effect the sound creates."],
    signalWords: ["repeated sound", "beginning sound", "vowel sound", "ending sound", "rhythm", "echo"],
    passage: {
      title: "Sea Song",
      text: P(
        "Silver sand slides softly to the sea,\nWhere waves wash white and wild and free.\nThe gulls glide gently, round and round,\nAbove the surf's soft, rushing sound.",
        "The boats float slowly, low and old,\nWith ropes and sails of green and gold.\nThe deep sea sleeps, the breeze is weak,\nAnd small fish creep from creek to creek.",
        "When night comes near, the tide will rise,\nA bright white light lights up the skies,\nAnd all along the rocky shore\nThe sea will whisper, nothing more.",
      ),
      clues: ["Silver sand slides softly to the sea,", "The boats float slowly, low and old,"],
    },
    worked: { question: "Which sound device is used in “Silver sand slides softly to the sea”?", answer: "Alliteration: many words begin with the same s sound.", why: "Silver, sand, slides, softly, sea all start with s, and the repeated sound is soft like waves." },
    thinkAloud: [
      "I notice when I read the first line aloud, I hear “s” again and again.",
      "I ask myself: is the sound at the beginning of the words? Yes, so it is alliteration.",
      "I notice in “boats float slowly, low and old” the long o vowel repeats.",
      "So that line uses assonance.",
      "I ask myself: what is the effect? The soft sounds feel calm, like the sea.",
    ],
    organizer: "NONE",
    frames: ["The poet repeats the ___ sound in ___, which is called ___.", "This sound makes the poem feel ___."],
    reteach: [
      { title: "Sound sorting", how: "Write the repeated words on cards. Sort them into three piles: same first sound, same vowel sound, same consonant inside or at the end. Name each pile." },
      { title: "Tongue twisters", how: "Make up a short tongue twister together (alliteration), then change it so a vowel repeats instead (assonance). Compare with the poem's lines." },
    ],
    warmUp: "Say “Busy bees buzz by the blue bench.” Ask: what sound do you hear again and again? Where in the words is it?",
  },
  {
    family: "imagery", name: "Imagery and Sensory Language",
    definition: "Imagery is language that helps the reader see, hear, smell, taste and feel. Authors use sensory words to make a scene feel real.",
    steps: ["Find the describing words and phrases.", "Decide which sense each one speaks to.", "Ask what mood or feeling the images create.", "Explain why the author chose those words."],
    signalWords: ["glittered", "crackled", "smelled", "tasted", "felt", "like"],
    passage: {
      title: "The First Rain",
      text: P(
        "For weeks the street had been dusty and burning hot. Then, one afternoon, the sky turned the color of a dark bruise, and the first fat drops of rain smacked against the windows.",
        "Jana ran outside. The rain was cool on her arms, and the air suddenly smelled of wet earth and dust. Thunder rumbled like a giant clearing its throat.",
        "Water rushed along the gutters, gurgling and splashing. The leaves of the lemon tree glittered, and when Jana caught a raindrop on her tongue, it tasted clean and a little sweet. She laughed as her clothes grew heavy and dripping.",
      ),
      clues: ["the air suddenly smelled of wet earth and dust.", "Water rushed along the gutters, gurgling and splashing."],
    },
    worked: { question: "Which phrase appeals to the sense of hearing?", answer: "“Water rushed along the gutters, gurgling and splashing.”", why: "Gurgling and splashing are sounds; they help the reader hear the rain." },
    thinkAloud: [
      "I notice “dark bruise” helps me see the sky's color.",
      "I notice “smelled of wet earth and dust”, so the author uses smell.",
      "I ask myself: which words are sounds? Rumbled, gurgling, splashing.",
      "I notice “tasted clean and a little sweet”, so even taste is used.",
      "So the imagery makes the first rain feel exciting and real.",
    ],
    organizer: "NONE",
    frames: ["The words ___ help me ___ (see/hear/smell/taste/feel) the scene.", "The author's imagery creates a feeling of ___."],
    reteach: [
      { title: "Sense chart", how: "Make five columns with a symbol for each sense. Copy each image from the text into the right column. Which sense has the most?" },
      { title: "Plain vs vivid", how: "Compare “It rained.” with a vivid sentence from the text. Underline the words that changed it, then turn another plain sentence vivid together." },
    ],
    warmUp: "Hold up a lemon (or say “a lemon”). Students give one word for each sense to describe it.",
  },
  {
    family: "inference", name: "Make Inferences",
    definition: "An inference is a smart conclusion you make by putting text clues together with what you already know. The author does not say it directly.",
    steps: ["Read the question and decide what you need to figure out.", "Find clues in the text (actions, words, details).", "Add what you know from your own life.", "Make an inference and check that the text supports it."],
    signalWords: ["probably", "most likely", "suggests", "shows", "I can tell", "must have"],
    passage: {
      title: "Muddy Shoes",
      text: P(
        "When Basma came home, her shoes were covered in mud and her hair was full of small leaves. She was holding a jar with holes poked in the lid.",
        "\"Look!\" she said to her mother, lifting the jar to the light. Inside, a green insect sat on a twig. \"Its legs fold like a person praying, and it turns its head to look at me.\"",
        "Her mother sighed at the shoes, but she smiled when she saw the notebook in Basma's other hand. It was full of drawings of insects, each with a date and a careful label.",
      ),
      clues: ["She was holding a jar with holes poked in the lid.", "It was full of drawings of insects, each with a date and a careful label."],
    },
    worked: { question: "What can you infer about Basma?", answer: "She loves studying insects and was searching for them outdoors.", why: "Clues: mud, leaves, a jar with air holes, and a notebook of labeled insect drawings. The text never says “she loves insects”." },
    thinkAloud: [
      "I notice mud on her shoes and leaves in her hair.",
      "I ask myself: where has she been? I know that means she was outside in a garden or park.",
      "I notice the jar has holes in the lid, and I know holes let a small animal breathe.",
      "I notice a notebook of labeled insect drawings.",
      "So I can infer she is a careful young scientist who loves insects.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["The text says ___, and I know ___, so I can infer ___.", "I can tell that ___ because ___."],
    reteach: [
      { title: "Detective bag", how: "Show three real objects (a ticket, sunscreen, sand). Students infer where someone went. Then match each clue in the text to an object-style clue." },
      { title: "It says / I know / So", how: "Fill a three-column chart: “It says” (text clue), “I know” (my experience), “So” (inference). Do one row together and one alone." },
    ],
    warmUp: "Say: “Ahmed walked in holding an umbrella, and his coat was dripping.” Ask: what is the weather? How do you know?",
  },
  {
    family: "text-evidence", name: "Cite Text Evidence",
    definition: "Text evidence is the exact words from the text that prove your answer. A good answer names the evidence and explains how it supports the idea.",
    steps: ["Answer the question in your own words.", "Go back and find the sentence that proves it.", "Quote the exact words or name where they are.", "Explain how the evidence supports your answer."],
    signalWords: ["the text says", "according to", "for example", "in paragraph", "this shows", "proves"],
    passage: {
      title: "Busy Bees",
      text: P(
        "Honeybees are some of the hardest workers in nature. A single bee may visit hundreds of flowers in one day to collect nectar.",
        "Bees also help plants grow fruit. As a bee moves from flower to flower, yellow pollen sticks to its fuzzy body and rubs off on the next flower. Without this help, many fruit trees, such as apple and almond trees, would produce much less fruit.",
        "Inside the hive, every bee has a job. Some clean, some guard the door, and some care for young bees. Working together, a hive can make several kilograms of honey in a year.",
      ),
      clues: ["Without this help, many fruit trees, such as apple and almond trees, would produce much less fruit.", "A single bee may visit hundreds of flowers in one day to collect nectar."],
    },
    worked: { question: "Which sentence best supports the idea that bees are important to farmers?", answer: "“Without this help, many fruit trees, such as apple and almond trees, would produce much less fruit.”", why: "It directly shows what farmers would lose without bees; other sentences are about bees but not about farms." },
    thinkAloud: [
      "I notice the question asks about farmers, so I need a sentence about crops or fruit.",
      "I ask myself: which paragraph talks about fruit? Paragraph 2.",
      "I notice “Without this help, many fruit trees… would produce much less fruit.”",
      "I ask myself: does this prove my idea or just talk about bees? It proves it.",
      "So I cite paragraph 2 and explain that bees help fruit trees make fruit.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["The text says, “___.” This shows that ___.", "In paragraph ___, the author writes ___, which proves ___."],
    reteach: [
      { title: "Prove it with a finger", how: "For each answer, the student must put a finger on the exact proof sentence before speaking. No finger, no answer. Practice with three quick questions." },
      { title: "Strong or weak evidence", how: "Give two sentences for one claim: one that proves it and one that is only on the same topic. Sort them and explain why one is stronger." },
    ],
    warmUp: "Make a claim: “Our class likes football.” Ask students to give evidence. Which evidence is strongest? Why?",
  },
  {
    family: "compare-texts", name: "Compare and Contrast Texts",
    definition: "When you compare two texts on the same topic, you find how they are alike and how they are different, such as their facts, point of view or purpose.",
    steps: ["Read both texts and name the shared topic.", "Note the main points of each text.", "Find what both texts say (alike).", "Find what only one text says, or how the views differ (different).", "Explain why the authors might differ."],
    signalWords: ["both", "also", "similarly", "however", "but", "unlike", "while"],
    passage: {
      title: "Two Visits to the Museum",
      text: P(
        "Text 1 (Hessa's diary): Today our class visited the national museum. My favorite room had old pots, coins and jewelry found in the desert. Our guide told us that some objects were thousands of years old. I wish we had more time there.",
        "Text 2 (Museum website): The national museum has eight galleries that tell the story of the region, from ancient times to today. Visitors can see objects found by archaeologists, watch short films, and use touch screens. School groups can book a free guided tour on weekdays.",
        "Both texts describe the same museum, but they were written for different reasons.",
      ),
      clues: ["Our guide told us that some objects were thousands of years old.", "School groups can book a free guided tour on weekdays."],
    },
    worked: { question: "How is Text 1 different from Text 2?", answer: "Text 1 tells one student's personal experience and feelings; Text 2 gives general facts to inform visitors.", why: "Text 1 uses I and my and “I wish”; Text 2 lists galleries, films and tour information." },
    thinkAloud: [
      "I notice both texts are about the national museum, so that is the shared topic.",
      "I notice Text 1 uses “I” and “my favorite”, so it shares feelings.",
      "I notice Text 2 lists facts like eight galleries and free tours.",
      "I ask myself: what do both say? Both mention very old objects found in the region.",
      "So they are alike in topic but different in point of view and purpose.",
    ],
    organizer: "COMPARE",
    frames: ["Both texts ___.", "Text 1 ___, while Text 2 ___."],
    reteach: [
      { title: "Two-color highlight", how: "Highlight facts that appear in both texts in one color, and facts that appear in only one text in another. Build the comparison from the colors." },
      { title: "Who, why, how", how: "For each text, answer three questions on a card: Who wrote it? Why? How does it sound? Lay the cards side by side and compare." },
    ],
    warmUp: "Compare a postcard and a map of the same city: what does each tell you? Why are they different?",
  },
  // ------------------------------------------------------------------ informational
  {
    family: "central-idea", name: "Central Idea and Relevant Details",
    definition: "The central idea is the most important point the author makes about the topic. Relevant details are the facts and examples that support it.",
    steps: ["Name the topic in one or two words.", "Ask: what does the author want me to know about the topic?", "Check the first and last sentences of paragraphs.", "Find three details that support that idea.", "Make sure the central idea covers the whole text, not one part."],
    signalWords: ["most important", "in fact", "for example", "also", "because", "overall"],
    passage: {
      title: "Why Sleep Matters",
      text: P(
        "Sleep is not just resting. While you sleep, your body and brain do important work that keeps you healthy.",
        "During sleep, your brain sorts and saves what you learned during the day. Students who sleep well often remember their lessons better. Sleep also helps your body grow and repair itself, because growth happens mostly at night.",
        "Children your age need about nine to eleven hours of sleep. Without enough sleep, people may feel grumpy, find it hard to focus, and get sick more often. A regular bedtime and a quiet, dark room can help you get the rest you need.",
      ),
      clues: ["While you sleep, your body and brain do important work that keeps you healthy.", "During sleep, your brain sorts and saves what you learned during the day."],
    },
    worked: { question: "What is the central idea of the text?", answer: "Sleep is important because the body and brain do work during sleep that keeps us healthy.", why: "The first paragraph states it, and every later paragraph gives details that support it." },
    thinkAloud: [
      "I notice the topic is sleep.",
      "I ask myself: what does the author want me to know about sleep?",
      "I notice the first paragraph says the body and brain do important work.",
      "I notice the details: remembering lessons, growing, and getting sick less.",
      "So the central idea is that sleep keeps us healthy, and the details support it.",
    ],
    organizer: "CENTRAL_IDEA_DETAILS",
    frames: ["The central idea is ___.", "One detail that supports this is ___."],
    reteach: [
      { title: "Table and legs", how: "Draw a table: the top is the central idea and each leg is a detail. If a detail cannot hold up the top, it is not relevant." },
      { title: "Headline writer", how: "Write a newspaper headline (six words or fewer) for the whole text. Check the headline against each paragraph: does it fit them all?" },
    ],
    warmUp: "List: apples, bananas, dates, grapes. Ask: what is the big idea that covers them all? Then add a word that does not fit.",
  },
  {
    family: "compare-contrast", name: "Text Structure: Compare and Contrast",
    definition: "A compare-and-contrast text shows how two or more things are alike and how they are different.",
    steps: ["Find the two things being compared.", "Look for signal words that show alike or different.", "List what is the same about both.", "List what is different about each.", "Ask why the author compares them."],
    signalWords: ["both", "alike", "similar", "also", "however", "but", "unlike", "while", "on the other hand"],
    passage: {
      title: "Two Desert Survivors",
      text: P(
        "The camel and the fennec fox both live in hot, dry deserts. Both animals can go a long time without drinking, and both have thick fur that protects them from the sun during the day and the cold at night.",
        "However, they are very different in size. A camel can be taller than a grown man, while a fennec fox is smaller than a pet cat.",
        "They also stay cool in different ways. The fennec fox has huge ears that release heat, and it rests in an underground den during the hottest hours. Unlike the fox, the camel stays out in the sun and saves water by sweating very little.",
      ),
      clues: ["However, they are very different in size.", "Unlike the fox, the camel stays out in the sun and saves water by sweating very little."],
    },
    worked: { question: "How are the camel and the fennec fox alike?", answer: "Both live in deserts, can go a long time without water, and have thick fur.", why: "The first paragraph uses the signal word “both” three times." },
    thinkAloud: [
      "I notice the text compares two animals: the camel and the fennec fox.",
      "I notice the word “both” many times in paragraph 1, so these are the likenesses.",
      "I notice “However” and “while”, so paragraph 2 shows a difference in size.",
      "I notice “Unlike the fox”, so paragraph 3 shows how they stay cool differently.",
      "So the structure is compare and contrast: alike first, then different.",
    ],
    organizer: "COMPARE",
    frames: ["___ and ___ are alike because both ___.", "___ is different from ___ because ___, while ___."],
    reteach: [
      { title: "Human Venn", how: "Two hoops on the floor. Students hold detail cards and stand in the camel hoop, the fox hoop, or the overlap. Then fill the paper Venn together." },
      { title: "Signal word traffic light", how: "Mark alike signal words in green and different signal words in red in the text. Read only the green parts, then only the red parts." },
    ],
    warmUp: "Compare a pencil and a pen: one way they are alike, one way they are different. Which words did you use?",
  },
  {
    family: "cause-effect", name: "Text Structure: Cause and Effect",
    definition: "A cause is why something happens. An effect is what happens as a result. Cause-and-effect texts explain how one event leads to another.",
    steps: ["Find what happened (the effect).", "Ask why it happened (the cause).", "Look for signal words like because, so and as a result.", "Check if one cause has several effects, or one effect has several causes.", "Test it with “Because ___, ___.”"],
    signalWords: ["because", "so", "since", "as a result", "therefore", "due to", "led to", "caused"],
    passage: {
      title: "When the Dust Storm Comes",
      text: P(
        "In spring, strong winds sometimes blow across the dry deserts of Arabia. Because the ground is loose and dry, the wind lifts huge amounts of sand and dust into the air. As a result, a wall of dust can move toward a city.",
        "Dust storms cause many problems. The air becomes so thick that drivers cannot see the road, so schools sometimes close and flights may be delayed. The fine dust can also make it hard for people with asthma to breathe.",
        "Since dust storms can be dangerous, weather centers send warnings, and families stay indoors with windows closed.",
      ),
      clues: ["Because the ground is loose and dry, the wind lifts huge amounts of sand and dust into the air.", "The air becomes so thick that drivers cannot see the road, so schools sometimes close and flights may be delayed."],
    },
    worked: { question: "What causes the wind to lift so much dust into the air?", answer: "The ground is loose and dry.", why: "The signal word “Because” introduces the cause in paragraph 1." },
    thinkAloud: [
      "I notice the signal word “Because” in paragraph 1.",
      "I ask myself: what happened? The wind lifts sand and dust.",
      "I ask myself: why? Because the ground is loose and dry. That is the cause.",
      "I notice “As a result” and “so”, which show more effects: dust walls, closed schools.",
      "So I can say: Because the ground is dry, the wind lifts dust, and schools close.",
    ],
    organizer: "CAUSE_EFFECT",
    frames: ["Because ___, ___.", "___ happened as a result of ___."],
    reteach: [
      { title: "Domino chain", how: "Stand up dominoes and label each with an event from the text. Push the first one: each falling domino is the effect of the one before and the cause of the next." },
      { title: "Why? What then?", how: "Ask only two questions for each event: “Why did this happen?” and “What happened because of it?” Write the answers on arrows connecting boxes." },
    ],
    warmUp: "Drop a pencil. Ask: what was the cause? What was the effect? Use “because” and “so” in your answers.",
  },
  {
    family: "problem-solution", name: "Text Structure: Problem and Solution",
    definition: "A problem-and-solution text describes a problem, then explains one or more ways people tried to solve it and whether it worked.",
    steps: ["Find the problem: what is wrong or difficult?", "Find who has the problem and why it matters.", "Find each solution that was tried.", "Check the result: did the solution work?"],
    signalWords: ["problem", "issue", "solve", "solution", "to fix this", "as a result", "if… then"],
    passage: {
      title: "Too Much Food in the Bin",
      text: P(
        "At Al-Noor School, the cafeteria had a problem. Every day, students threw away trays of uneaten rice, bread and fruit. The bins filled up by noon, and good food was wasted.",
        "The student council decided to solve the problem. First, they asked students why they left food. Many said the portions were too big. To fix this, the cafeteria offered small and large plates so students could choose.",
        "The council also started a \"Clean Plate Week\" with posters and a class prize. As a result, food waste dropped by almost half in one month. The leftover fruit that was still fresh was given to a local charity.",
      ),
      clues: ["Every day, students threw away trays of uneaten rice, bread and fruit.", "To fix this, the cafeteria offered small and large plates so students could choose."],
    },
    worked: { question: "What was one solution to the cafeteria's problem?", answer: "The cafeteria offered small and large plates so students could choose their portion.", why: "The signal words “To fix this” introduce the solution in paragraph 2." },
    thinkAloud: [
      "I notice the word “problem” in the very first sentence.",
      "I ask myself: what is the problem? Students throw away a lot of food.",
      "I notice the council asked students why, so they found the cause first.",
      "I notice “To fix this” and “also started”, so there are two solutions.",
      "So I check the result: “As a result, food waste dropped by almost half.” The solutions worked.",
    ],
    organizer: "PROBLEM_SOLUTION",
    frames: ["The problem is ___. One solution is ___.", "The solution worked because ___."],
    reteach: [
      { title: "Real-life fix", how: "Pick a small class problem (lost pencils). Brainstorm two solutions and predict results. Then map the text the same way: problem, tries, result." },
      { title: "Question cards", how: "Use three question cards for each paragraph: What is wrong? What did they try? Did it work? Answer only the card that fits each paragraph." },
    ],
    warmUp: "Say: “The plants in our class are dying.” Ask for two possible solutions. How would we know if a solution worked?",
  },
  {
    family: "sequence", name: "Text Structure: Sequence and Chronology",
    definition: "A sequence text explains steps or events in the order they happen. Chronology means time order.",
    steps: ["Find what process or event the text explains.", "Look for order words and dates.", "Number the steps in order.", "Check that each step makes sense after the one before."],
    signalWords: ["first", "second", "next", "then", "after", "before", "finally", "in 1990", "later"],
    passage: {
      title: "From Old Paper to New",
      text: P(
        "Recycling paper saves trees, water and energy. But how does an old newspaper become a new notebook? It happens in several steps.",
        "First, people put used paper into recycling bins, and trucks carry it to a recycling plant. Next, the paper is mixed with water and chopped until it becomes a soft, wet mush called pulp.",
        "Then the pulp is cleaned to remove ink, tape and staples. After that, it is spread in thin sheets and pressed between large hot rollers to squeeze out the water. Finally, the dry paper is rolled up, cut, and sent to factories to become new paper products.",
      ),
      clues: ["Next, the paper is mixed with water and chopped until it becomes a soft, wet mush called pulp.", "Then the pulp is cleaned to remove ink, tape and staples."],
    },
    worked: { question: "What happens right after the pulp is cleaned?", answer: "It is spread in thin sheets and pressed between hot rollers to remove the water.", why: "The signal words “After that” come right after the cleaning step." },
    thinkAloud: [
      "I notice the text asks how old paper becomes new, so it explains a process.",
      "I notice the signal words First, Next, Then, After that, Finally.",
      "I number the steps: collect, make pulp, clean, press, roll and cut.",
      "I ask myself: does each step need the one before? Yes, you cannot clean pulp before you make it.",
      "So the structure is sequence, and I can retell it in order.",
    ],
    organizer: "SEQUENCE",
    frames: ["First, ___. Next, ___. Then, ___. Finally, ___.", "Before ___ can happen, ___ must happen."],
    reteach: [
      { title: "Step cards", how: "Write each step on a card, mix them, and put them back in order without the text. Then check against the signal words." },
      { title: "Act the process", how: "Students each take one step and stand in a line in the right order, saying their signal word and step aloud." },
    ],
    warmUp: "Tell the steps for washing your hands in four steps with signal words. What happens if two steps swap?",
  },
  {
    family: "text-features", name: "Text Features",
    definition: "Text features are parts of a text that help you find and understand information quickly: titles, headings, bold words, captions, diagrams, maps and charts.",
    steps: ["Preview the title and headings before reading.", "Read captions and labels on pictures and diagrams.", "Notice bold words and their meanings.", "Ask what each feature adds that the main text does not."],
    signalWords: ["heading", "caption", "diagram", "label", "bold", "chart", "map", "glossary"],
    passage: {
      title: "The Arabian Oryx",
      text: P(
        "## A Rescue Story",
        "The Arabian oryx is a white antelope with long, straight horns. By 1972, it had disappeared from the wild because of too much hunting.",
        "## Back to the Desert",
        "Scientists raised oryx in protected parks. In the 1980s, they began to release small herds back into the desert. Today, more than one thousand oryx live in the wild again.",
        "FIG: Photo | An oryx herd | Caption: Oryx rest in the shade during the hottest part of the day. Their white coats reflect sunlight.",
        "## Fast Facts",
        "An oryx can smell rain from far away and walk long distances to find fresh plants after a storm.",
      ),
      clues: ["Caption: Oryx rest in the shade during the hottest part of the day. Their white coats reflect sunlight.", "## Back to the Desert"],
    },
    worked: { question: "What information does the caption add?", answer: "It explains that oryx rest in the shade at the hottest time and that their white coats reflect sunlight.", why: "The main text does not explain the white coat; only the caption under the photo does." },
    thinkAloud: [
      "I notice headings that split the article into three parts.",
      "I ask myself: where would I look to learn how the oryx came back? Under “Back to the Desert”.",
      "I notice a photo with a caption.",
      "I ask myself: what does the caption tell me that the paragraphs do not? Why their coats are white.",
      "So each text feature gives a shortcut or extra information.",
    ],
    organizer: "NONE",
    frames: ["The ___ (feature) helps me understand ___.", "I would look at the ___ to find ___."],
    reteach: [
      { title: "Feature scavenger hunt", how: "Give a list of features (heading, caption, photo, bold word). Students find and label each one in the text, then say what it is for." },
      { title: "Cover and compare", how: "Cover all the features and read only the paragraphs. Then uncover them one by one and say what new information each feature adds." },
    ],
    warmUp: "Hold up a book. Ask students to point to the title, a heading and a picture caption, and say what each one is for.",
  },
  {
    family: "author-perspective", name: "Author's Perspective",
    definition: "An author's perspective is how the author thinks or feels about the topic. Word choices, opinions and the details the author picks show the perspective.",
    steps: ["Find the topic.", "Look for opinion words and strong feeling words.", "Notice which details the author includes and leaves out.", "Say the author's perspective in one sentence."],
    signalWords: ["I believe", "should", "wonderful", "sadly", "best", "unfortunately", "important"],
    passage: {
      title: "Every School Needs a Garden",
      text: P(
        "In my opinion, a school garden is one of the best classrooms a child can have. When students plant seeds and care for them, they learn science in a way no textbook can teach.",
        "Gardens also teach patience and teamwork. Sadly, many schools have only concrete playgrounds, and children rarely touch soil or watch a plant grow.",
        "A garden does not need to be large. A few boxes of tomatoes, mint and beans on a sunny wall are enough to start. I believe every school should give its students this wonderful chance to grow something with their own hands.",
      ),
      clues: ["In my opinion, a school garden is one of the best classrooms a child can have.", "I believe every school should give its students this wonderful chance to grow something with their own hands."],
    },
    worked: { question: "What is the author's perspective on school gardens?", answer: "The author strongly believes school gardens are valuable and every school should have one.", why: "Words like “In my opinion”, “best”, “Sadly”, “I believe” and “wonderful” show the author's feelings." },
    thinkAloud: [
      "I notice the author starts with “In my opinion”.",
      "I notice strong positive words: best, wonderful.",
      "I notice the word “Sadly” when the author talks about concrete playgrounds.",
      "I ask myself: does the author give any reasons against gardens? No.",
      "So the author's perspective is that every school should have a garden.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["The author thinks ___ because the text says ___.", "The words ___ and ___ show the author feels ___."],
    reteach: [
      { title: "Feeling word thermometer", how: "Copy feeling words from the text onto a thermometer from “negative” to “positive”. Decide where the author stands on the topic." },
      { title: "Swap the author", how: "Rewrite one sentence as if the author disliked gardens. Compare the two versions to see which words carried the perspective." },
    ],
    warmUp: "Say two sentences: “Homework is a helpful habit.” / “Homework steals our free time.” Ask: how does each speaker feel?",
  },
  {
    family: "author-purpose", name: "Author's Purpose",
    definition: "The author's purpose is the reason the author wrote the text: to inform (teach facts), to persuade (make you think or do something), or to entertain (tell a story or make you laugh).",
    steps: ["Read the whole text and notice what kind of text it is.", "Ask: is the author teaching, convincing or entertaining?", "Look for clues: facts and numbers, opinions and calls to act, or a story.", "Check that your purpose fits the whole text."],
    signalWords: ["you should", "join", "don't miss", "facts", "once upon a time", "did you know"],
    passage: {
      title: "Join the Reading Club!",
      text: P(
        "Do you love stories? Do you want to travel to new places without leaving your chair? Then the Reading Club is for you!",
        "Every Tuesday after school, club members meet in the library to read, talk about books and play word games. Last year, members read more than five hundred books together, and many said reading became their favorite hobby.",
        "Reading every day helps you learn new words, think creatively and do better in every subject. Don't miss this chance! Sign up with Ms. Hanan in the library before Thursday. Bring a friend, too. The more readers, the more fun we have!",
      ),
      clues: ["Then the Reading Club is for you!", "Sign up with Ms. Hanan in the library before Thursday."],
    },
    worked: { question: "What is the author's main purpose?", answer: "To persuade students to join the Reading Club.", why: "The text asks questions to the reader, gives reasons to join, and says “Don't miss this chance! Sign up…”." },
    thinkAloud: [
      "I notice the text talks directly to me with questions.",
      "I notice facts, like five hundred books, but they are used as reasons.",
      "I notice commands: “Don't miss this chance! Sign up”.",
      "I ask myself: what does the author want me to do? Join the club.",
      "So the main purpose is to persuade.",
    ],
    organizer: "NONE",
    frames: ["The author's purpose is to ___ because ___.", "The author wants the reader to ___."],
    reteach: [
      { title: "PIE sort", how: "Sort six short texts (an ad, a recipe, a joke, a news fact…) into Persuade, Inform, Entertain. Then place the lesson text and explain the clue." },
      { title: "Job interview", how: "Ask the text three questions: Do you teach me facts? Do you want me to do something? Do you tell me a story? The loudest “yes” is the purpose." },
    ],
    warmUp: "Read three one-line texts: an ad, a fact, a joke. Students show 1, 2 or 3 fingers for persuade, inform, entertain.",
  },
  {
    family: "author-claim", name: "Author's Claim and Evidence",
    definition: "A claim is what the author wants you to believe. Reasons explain why, and evidence (facts, numbers, examples) supports the reasons.",
    steps: ["Find the claim: the author's main point.", "Find each reason the author gives.", "Find the evidence for each reason.", "Decide whether the evidence really supports the claim."],
    signalWords: ["should", "because", "for example", "studies show", "in fact", "this proves"],
    passage: {
      title: "Give Us a Walking Break",
      text: P(
        "Students should have a five-minute walking break between morning lessons. Short breaks help both our bodies and our brains.",
        "First, moving helps students focus. In fact, one study of school children found that students who walked for a few minutes paid attention better in the next lesson.",
        "Second, sitting for a long time is not healthy. Doctors say children need at least one hour of activity every day, but many students sit for most of the school day.",
        "A walking break is easy and free. For example, a class can walk once around the courtyard and be back in their seats in five minutes.",
      ),
      clues: ["Students should have a five-minute walking break between morning lessons.", "In fact, one study of school children found that students who walked for a few minutes paid attention better in the next lesson."],
    },
    worked: { question: "Which evidence supports the reason that moving helps students focus?", answer: "A study found that students who walked for a few minutes paid attention better in the next lesson.", why: "The signal words “In fact” introduce the study right after the reason." },
    thinkAloud: [
      "I notice the word “should” in the first sentence, so this is the claim.",
      "I notice “First” and “Second”, so these start the reasons.",
      "I ask myself: what proves the first reason? “In fact, one study…”.",
      "I ask myself: is the study about focus? Yes, it is about paying attention.",
      "So the claim is supported by reasons, and each reason has evidence.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["The author claims that ___.", "One reason is ___, and the evidence is ___."],
    reteach: [
      { title: "Claim house", how: "Draw a house: the roof is the claim, the walls are the reasons, the bricks are the evidence. Place sentences from the text in each part." },
      { title: "Debate cards", how: "Give claim, reason and evidence cards from the text mixed up. Students build the argument in order and read it aloud like a debater." },
    ],
    warmUp: "Claim: “We should have a class pet.” Ask for one reason and one piece of evidence. Which is which?",
  },
  {
    family: "description", name: "Text Structure: Description",
    definition: "A description text tells about one topic by giving its features, characteristics and examples, so the reader can understand or picture it.",
    steps: ["Find the topic being described.", "Find each feature or characteristic.", "Notice examples and describing words.", "Group the details into categories (looks, behavior, place)."],
    signalWords: ["for example", "such as", "looks like", "is made of", "also", "has", "features"],
    passage: {
      title: "A Coral Reef",
      text: P(
        "A coral reef is an underwater city full of life. It is built by tiny animals called coral polyps. Each polyp builds a hard skeleton, and over many years these skeletons form huge, rocky reefs.",
        "Reefs come in many shapes and colors. Some corals look like branches of a tree, while others look like giant brains or flat plates. They can be pink, yellow, purple or green.",
        "Many animals make their home on the reef, such as clownfish, sea turtles, crabs and colorful parrotfish. The Red Sea has some of the most beautiful coral reefs in the world.",
      ),
      clues: ["Some corals look like branches of a tree, while others look like giant brains or flat plates.", "Many animals make their home on the reef, such as clownfish, sea turtles, crabs and colorful parrotfish."],
    },
    worked: { question: "How does the author organize the information about coral reefs?", answer: "By describing features: how reefs are built, what they look like, and which animals live there.", why: "Each paragraph describes one characteristic of the same topic, with examples after “such as” and “look like”." },
    thinkAloud: [
      "I notice the whole text is about one topic: a coral reef.",
      "I notice paragraph 1 tells what reefs are made of.",
      "I notice paragraph 2 describes shapes and colors with “look like”.",
      "I notice “such as” in paragraph 3, giving examples of animals.",
      "So the structure is description: features grouped by paragraph.",
    ],
    organizer: "CENTRAL_IDEA_DETAILS",
    frames: ["The text describes ___ by telling about its ___.", "One feature of ___ is ___; for example, ___."],
    reteach: [
      { title: "Web it", how: "Draw the topic in a circle and three spokes: Built from, Looks like, Animals. Fill each spoke from one paragraph." },
      { title: "Mystery object", how: "Describe a classroom object by features only. Students guess it. Then show how the lesson text does the same for coral reefs." },
    ],
    warmUp: "Describe your bag in three features (color, size, what's inside). Ask: what kind of text structure did you just use?",
  },
  // ------------------------------------------------------------------ vocabulary
  {
    family: "context-clues", name: "Context Clues",
    definition: "Context clues are words and sentences around an unknown word that help you figure out its meaning.",
    steps: ["Find the unknown word.", "Reread the sentence and the sentences around it.", "Look for a clue: a definition, a synonym, an opposite, or an example.", "Guess the meaning and put your meaning in place of the word to check."],
    signalWords: ["or", "which means", "is called", "like", "such as", "but", "unlike"],
    passage: {
      title: "A Dry Land",
      text: P(
        "Much of the Arabian Peninsula is arid, which means it gets very little rain. In some places, years can pass without a single storm.",
        "Plants that grow in this land must be tough. The ghaf tree, for example, sends its roots deep underground to reach hidden water. Unlike delicate garden flowers that wilt in one hot afternoon, the ghaf stays green all year.",
        "After a long drought, when the ground is parched and cracked, even a short rain can change everything. Within days, tiny green plants appear where there was only dry sand.",
      ),
      clues: ["Much of the Arabian Peninsula is arid, which means it gets very little rain.", "Unlike delicate garden flowers that wilt in one hot afternoon, the ghaf stays green all year."],
    },
    worked: { question: "What does the word delicate mean in paragraph 2?", answer: "Easily hurt or damaged; not tough.", why: "The clue word “Unlike” compares delicate flowers that wilt with the tough ghaf tree, so delicate is the opposite of tough." },
    thinkAloud: [
      "I notice the word “delicate” and I am not sure what it means.",
      "I notice the clue word “Unlike”, so delicate is the opposite of something.",
      "I ask myself: opposite of what? The ghaf tree that is tough and stays green.",
      "I notice the flowers “wilt in one hot afternoon”.",
      "So delicate means easily hurt, and “easily hurt flowers” makes sense in the sentence.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["I think ___ means ___ because the clue ___ tells me ___.", "The clue is a ___ (definition / synonym / opposite / example) clue."],
    reteach: [
      { title: "Nonsense word", how: "Replace the word with a made-up word (“The flowers were blorpy and wilted fast”). Students guess the meaning from clues only, then go back to the real word." },
      { title: "Clue-type cards", how: "Give four cards: Definition, Synonym, Opposite, Example. For each sentence, students hold up the card that names the clue, then say the meaning." },
    ],
    warmUp: "Say: “The room was frigid, so cold that we could see our breath.” Ask: what does frigid mean? Which words told you?",
  },
  {
    family: "multiple-meaning", name: "Multiple-Meaning Words",
    definition: "A multiple-meaning word is spelled and said the same way but has more than one meaning. The sentence tells you which meaning is used.",
    steps: ["Find the word and think of all the meanings you know.", "Read the whole sentence around it.", "Put each meaning into the sentence.", "Choose the meaning that makes sense here."],
    signalWords: ["in this sentence", "as used", "here", "means", "meaning"],
    passage: {
      title: "A Day at the Park",
      text: P(
        "On Saturday, we went to the big park near the river. Dad tried to park the car under a tree, but every shady spot was taken.",
        "My brother brought his new bat and ball. When the sun went down, a real bat flew out from the trees, and he nearly dropped his ball in surprise.",
        "We sat on the bank of the river to watch the water. Mom said she needed to go to the bank tomorrow to put money into her account. Before we left, I picked up a light stone, so light it felt like plastic, and the sky was still light enough to see the path.",
      ),
      clues: ["We sat on the bank of the river to watch the water.", "Dad tried to park the car under a tree, but every shady spot was taken."],
    },
    worked: { question: "What does bank mean in “We sat on the bank of the river”?", answer: "The land along the side of a river.", why: "“of the river” and “to watch the water” show it is a place by the water, not a building for money." },
    thinkAloud: [
      "I notice the word “bank” appears twice in paragraph 3.",
      "I ask myself: what meanings of bank do I know? A place for money, and the side of a river.",
      "I notice the first “bank” is followed by “of the river”.",
      "I try “the money building of the river” and it does not make sense.",
      "So in that sentence bank means the land beside a river.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["In this sentence, ___ means ___ because ___.", "Another meaning of ___ is ___, but it does not fit here."],
    reteach: [
      { title: "Two-picture cards", how: "Draw two quick pictures for each word (a bat animal, a bat for games). Read each sentence and point to the picture that fits." },
      { title: "Swap test", how: "Write each meaning on a strip. Lay each strip over the word in the sentence and read it aloud. Keep the one that sounds right." },
    ],
    warmUp: "Say: “I can't watch TV without my watch.” Ask: what are the two meanings of watch?",
  },
  {
    family: "homographs-homophones", name: "Homographs and Homophones",
    definition: "Homophones sound the same but are spelled differently and mean different things (sea / see). Homographs are spelled the same but can mean different things, and some are said differently (wind / wind).",
    steps: ["Notice a word that sounds or looks like another word.", "Ask: is it the same spelling (homograph) or the same sound (homophone)?", "Use the sentence to decide the meaning.", "For homophones, check that the spelling matches the meaning."],
    signalWords: ["sounds like", "spelled", "same spelling", "different meaning", "said differently"],
    passage: {
      title: "The Windy Walk",
      text: P(
        "Last week our class went for a walk by the sea. The wind was so strong that we could see the waves crashing against the rocks.",
        "Our teacher showed us how to wind a long rope around a post so the boat would not drift away. Then she asked us to read the sign by the dock. It was painted bright red.",
        "Before we left, each of us wrote two sentences about the trip. Hamad wrote, \"Their boat is over there, and they're painting it blue.\" Our teacher said he used all three words correctly. I read his sentences aloud to the class.",
      ),
      clues: ["The wind was so strong that we could see the waves crashing against the rocks.", "Our teacher showed us how to wind a long rope around a post so the boat would not drift away."],
    },
    worked: { question: "Which word in paragraph 2 is a homograph of “wind” in paragraph 1?", answer: "“wind” in “how to wind a long rope”, which means to wrap around and is said with a long i.", why: "Both words are spelled w-i-n-d, but one is moving air and the other is an action of wrapping." },
    thinkAloud: [
      "I notice the word “wind” in paragraph 1 and again in paragraph 2.",
      "I ask myself: are they spelled the same? Yes.",
      "I notice the first is moving air, but the second is something you do to a rope.",
      "So they are homographs: same spelling, different meaning and sound.",
      "I also notice “sea / see” and “read / red”, which sound alike but are spelled differently: homophones.",
    ],
    organizer: "NONE",
    frames: ["___ and ___ are homophones because they sound the same but ___.", "In this sentence, ___ means ___, so it is spelled ___."],
    reteach: [
      { title: "Sound vs spelling sort", how: "Make two hoops: “Same sound” and “Same spelling”. Sort word pairs from the text and say each pair aloud." },
      { title: "Picture spelling", how: "Draw a tiny picture inside the different letters of each homophone (an eye in “see”, waves in “sea”) to remember which meaning goes with which spelling." },
    ],
    warmUp: "Write “their / there / they're” on the board. Students make one sentence for each, out loud.",
  },
  {
    family: "synonyms-antonyms", name: "Synonyms and Antonyms",
    definition: "Synonyms are words with the same or almost the same meaning (big / huge). Antonyms are words with opposite meanings (big / small).",
    steps: ["Find the word and say what it means.", "Look for nearby words that mean the same or the opposite.", "Check signal words: or, also, like (same); but, unlike, instead (opposite).", "Test the pair in the sentence."],
    signalWords: ["or", "also", "like", "but", "however", "unlike", "instead", "not"],
    passage: {
      title: "Two Kinds of Days at Sea",
      text: P(
        "On calm days, the sea near our town is peaceful and still. The water is so smooth that fishing boats glide across it easily, and children splash in the gentle waves.",
        "But on stormy days, the sea becomes wild and rough. Enormous waves, huge walls of grey water, crash onto the shore. The boats stay tied in the harbor, and nobody swims.",
        "My grandfather was a fisherman for forty years. He says a wise sailor is cautious, or careful, and never foolish enough to sail into a storm.",
      ),
      clues: ["But on stormy days, the sea becomes wild and rough.", "He says a wise sailor is cautious, or careful, and never foolish enough to sail into a storm."],
    },
    worked: { question: "Which word is an antonym of “calm” in the text?", answer: "Stormy (also wild and rough).", why: "The signal word “But” starts paragraph 2, which describes the opposite kind of day." },
    thinkAloud: [
      "I notice paragraph 1 is about calm days and paragraph 2 starts with “But”.",
      "I ask myself: what is the opposite of calm? The text says stormy, wild and rough.",
      "I notice “Enormous waves, huge walls”, so enormous and huge are synonyms.",
      "I notice “cautious, or careful”, so “or” shows another synonym pair.",
      "So signal words help me find words that mean the same or the opposite.",
    ],
    organizer: "COMPARE",
    frames: ["___ and ___ are synonyms because they both mean ___.", "___ is an antonym of ___ because ___."],
    reteach: [
      { title: "Word ladder", how: "Put words on a ladder from weak to strong (cool → cold → freezing). Words close on the ladder are synonyms; the top and bottom of opposite ladders are antonyms." },
      { title: "Opposite charades", how: "Act out a word from the text; partners act out its antonym. Then find both words in the text and the signal word between them." },
    ],
    warmUp: "Say “happy”. Students give one synonym and one antonym, then use one in a sentence.",
  },
  {
    family: "prefixes", name: "Prefixes",
    definition: "A prefix is a word part added to the beginning of a base word. It changes the meaning: un- and dis- mean not, re- means again, pre- means before.",
    steps: ["Cover the prefix and read the base word.", "Say what the base word means.", "Say what the prefix means.", "Put the meanings together and check the meaning in the sentence."],
    signalWords: ["un- (not)", "dis- (not, opposite)", "re- (again)", "pre- (before)", "mis- (wrongly)", "non- (not)"],
    passage: {
      title: "The Unfinished Model",
      text: P(
        "Laith's model volcano was still unfinished the night before the science fair. He had misread the instructions and used too much glue, so the walls were uneven and soft.",
        "He felt disappointed, but his sister helped him. Together they reread the instructions carefully. Laith had to rebuild one side, and they prepaid for an extra bottle of paint at the corner shop before it closed.",
        "By ten o'clock, the volcano was ready. On the day of the fair, it erupted with red foam, and Laith was anything but unhappy.",
      ),
      clues: ["He had misread the instructions and used too much glue, so the walls were uneven and soft.", "Together they reread the instructions carefully."],
    },
    worked: { question: "What does “reread” mean?", answer: "To read again.", why: "re- means again, and the base word is read." },
    thinkAloud: [
      "I notice the word “reread” and I see the prefix re-.",
      "I cover re- and see the base word “read”.",
      "I know re- means again.",
      "I put them together: read again.",
      "So reread means read again, and it makes sense because he misread the first time.",
    ],
    organizer: "WORD_PARTS",
    frames: ["The prefix ___ means ___, so ___ means ___.", "When I add ___ to ___, the meaning changes to ___."],
    reteach: [
      { title: "Prefix flip cards", how: "Write base words on cards and prefixes on flaps. Flip a prefix onto a base word and say the new meaning in a full sentence." },
      { title: "Prefix detective", how: "Find every word with a prefix in the text. Draw a line between prefix and base, and write the meaning above each part." },
    ],
    warmUp: "Say “happy, kind, lock”. Add un- to each and say what the new word means.",
  },
  {
    family: "suffixes", name: "Suffixes",
    definition: "A suffix is a word part added to the end of a base word. It changes the meaning or the job of the word: -ful means full of, -less means without, -ness makes a noun, -able means can be.",
    steps: ["Find the base word inside the longer word.", "Find the suffix at the end.", "Say what the suffix means or how it changes the word.", "Put the meanings together and check the sentence."],
    signalWords: ["-ful (full of)", "-less (without)", "-ness (state of)", "-able (can be)", "-er (one who)", "-ly (in a way)"],
    passage: {
      title: "The Helpful Robot",
      text: P(
        "In our school's robot club, we built a small helpful robot named Nour. It could carry books from the library to our classroom, and it moved carefully around chairs.",
        "At first, Nour was useless on the stairs. It rolled to the edge and stopped. Our teacher, a patient and thoughtful builder, suggested adding tiny wheels that could climb.",
        "After many tries, the robot became reliable. Everyone noticed the kindness of the older students who helped us test it. Now Nour is the most famous member of our club, and every visitor is amazed by how washable its plastic cover is.",
      ),
      clues: ["At first, Nour was useless on the stairs.", "In our school's robot club, we built a small helpful robot named Nour."],
    },
    worked: { question: "What does “useless” mean in paragraph 2?", answer: "Not able to be used; without use.", why: "The suffix -less means without, and the robot “stopped” on the stairs." },
    thinkAloud: [
      "I notice the word “useless”.",
      "I find the base word “use” and the suffix -less.",
      "I know -less means without.",
      "So useless means without use, or not helpful.",
      "I check the sentence: it rolled to the edge and stopped. Yes, it was not useful.",
    ],
    organizer: "WORD_PARTS",
    frames: ["The suffix ___ means ___, so ___ means ___.", "___ is the base word, and ___ is the suffix."],
    reteach: [
      { title: "Build-a-word blocks", how: "Use paper blocks: one color for base words and one for suffixes. Build words from the text and read the meaning of each block aloud." },
      { title: "Opposite pairs", how: "Pair -ful and -less words (careful / careless, helpful / helpless). Sort sentences from the text into each pair and explain the difference." },
    ],
    warmUp: "Say “hope”. Students build hopeful and hopeless and use each in a short sentence.",
  },
  {
    family: "greek-latin-roots", name: "Greek and Latin Roots",
    definition: "A root is the main part of a word that carries its meaning. Many English words come from Greek and Latin roots, such as tele (far), photo (light), graph (write) and port (carry).",
    steps: ["Find the root inside the word.", "Remember what the root means.", "Look at the other parts (prefix, suffix, second root).", "Put the meanings together and check the sentence."],
    signalWords: ["tele (far)", "photo (light)", "graph (write, draw)", "port (carry)", "aqua (water)", "scope (see)", "geo (earth)"],
    passage: {
      title: "A Trip to the Science Center",
      text: P(
        "At the science center, our class looked through a telescope to see the craters on the moon. The guide explained that tele means far and scope means to look, so a telescope helps us see things that are far away.",
        "In the next room, we watched water animals in a giant aquarium. Then we used a microscope to look at a tiny drop of pond water.",
        "Before we left, a photographer took a group photograph. Our teacher reminded us that our portable water bottles should not be left behind, so we carried them out to the bus.",
      ),
      clues: ["The guide explained that tele means far and scope means to look, so a telescope helps us see things that are far away.", "Our teacher reminded us that our portable water bottles should not be left behind, so we carried them out to the bus."],
    },
    worked: { question: "Using the root port, what does “portable” mean?", answer: "Able to be carried easily.", why: "port means carry and -able means can be, and the students carried the bottles to the bus." },
    thinkAloud: [
      "I notice the word “portable” and I see the root port.",
      "I know port means carry.",
      "I notice the suffix -able, which means can be.",
      "So portable means can be carried.",
      "I check the sentence: “we carried them out to the bus.” It fits.",
    ],
    organizer: "WORD_PARTS",
    frames: ["The root ___ means ___, so ___ probably means ___.", "Other words with the root ___ are ___ and ___."],
    reteach: [
      { title: "Root tree", how: "Draw a tree with the root in the trunk and family words on the branches (port: transport, export, airport). Say how each branch keeps the root's meaning." },
      { title: "Root match-up", how: "Match root cards to meaning cards, then find each root in a word from the text and explain the meaning out loud." },
    ],
    warmUp: "Write “phone, photo, graph”. Ask: what do telephone, photograph and autograph share? Guess what tele and auto mean.",
  },
  {
    family: "idioms-adages", name: "Idioms, Adages and Proverbs",
    definition: "An idiom is a group of words with a meaning that is different from the meanings of the single words. Adages and proverbs are short, well-known sayings that give advice.",
    steps: ["Notice a phrase that would sound strange if you took it word for word.", "Picture it literally and see that it does not fit.", "Use the situation in the text to find the real meaning.", "Restate the sentence in plain words."],
    signalWords: ["as they say", "the saying goes", "like my grandmother says", "once in a blue moon"],
    passage: {
      title: "Test Day",
      text: P(
        "On the morning of the spelling test, Rashid had butterflies in his stomach. He had studied all week, but he still felt nervous.",
        "His friend Majed laughed. \"Don't worry. For you, this test will be a piece of cake.\" Rashid smiled, but he wasn't sure.",
        "When the test began, the words were ones he had practiced again and again. He finished early and checked every answer twice. When he got his paper back with a perfect score, his grandmother hugged him. \"You see?\" she said. \"Practice makes perfect. The early bird catches the worm.\"",
      ),
      clues: ["On the morning of the spelling test, Rashid had butterflies in his stomach.", "\"Don't worry. For you, this test will be a piece of cake.\""],
    },
    worked: { question: "What does “had butterflies in his stomach” mean?", answer: "He felt nervous.", why: "The next sentence says “he still felt nervous”; real butterflies would not make sense." },
    thinkAloud: [
      "I notice the phrase “butterflies in his stomach”.",
      "I picture it for real, and it does not make sense: there are no real butterflies.",
      "I ask myself: what is happening? It is the morning of a test.",
      "I notice the next sentence says he “felt nervous”.",
      "So the idiom means feeling nervous.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["The phrase ___ does not mean ___; it means ___.", "The saying ___ gives the advice that ___."],
    reteach: [
      { title: "Draw it literally", how: "Draw the funny literal picture of the idiom (a cake shaped like a test). Next to it, write the real meaning. Laugh, then explain the difference." },
      { title: "Idiom match", how: "Match five idioms to plain-English meanings on cards. Then find the sentence clue in the text that proves each meaning." },
    ],
    warmUp: "Say: “It's raining cats and dogs.” Ask: what would it look like for real? What does it really mean?",
  },
  {
    family: "figurative-language", name: "Figurative Language (Similes, Metaphors, Personification, Hyperbole)",
    definition: "Figurative language uses words in a creative way, not their exact meaning. A simile compares with like or as; a metaphor says one thing is another; personification gives human actions to things; hyperbole is a big exaggeration.",
    steps: ["Find the words that cannot be true exactly as written.", "Decide the type: like/as (simile), is/was (metaphor), human action (personification), huge exaggeration (hyperbole).", "Ask what two things are being connected.", "Explain what the author really means."],
    signalWords: ["like", "as", "is a", "was a", "a million", "whispered", "danced"],
    passage: {
      title: "The Hottest Day",
      text: P(
        "It was the hottest day of the year. The sun was a giant oven in the sky, and the street was as hot as a frying pan.",
        "Ahmed and his sister walked home from school slowly. \"I'm so thirsty I could drink the whole sea,\" Ahmed groaned.",
        "When they reached their house, the old fan in the kitchen groaned and coughed as it started to turn. Their mother handed them cold glasses of laban. The cool drink ran down Ahmed's throat like a river after the rain, and he smiled for the first time all afternoon.",
      ),
      clues: ["The sun was a giant oven in the sky, and the street was as hot as a frying pan.", "\"I'm so thirsty I could drink the whole sea,\" Ahmed groaned."],
    },
    worked: { question: "Which type of figurative language is “I'm so thirsty I could drink the whole sea”?", answer: "Hyperbole: a huge exaggeration to show he is very thirsty.", why: "No person could drink the sea; the exaggeration shows how strong his thirst is." },
    thinkAloud: [
      "I notice “The sun was a giant oven”: the sun is not really an oven, and there is no like or as, so it is a metaphor.",
      "I notice “as hot as a frying pan” uses as, so it is a simile.",
      "I ask myself: can anyone drink the whole sea? No, so it is hyperbole.",
      "I notice the fan “groaned and coughed”, which are human actions, so that is personification.",
      "So each figure shows how hot and tired the characters feel.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["The author compares ___ to ___ to show ___.", "This is a ___ because ___."],
    reteach: [
      { title: "Real or not real", how: "Read each phrase and hold up a card: Real or Not Real. For every Not Real phrase, name the type and say the plain meaning." },
      { title: "Make your own", how: "Write one simile, one metaphor and one hyperbole about the weather today, then match each to an example in the text." },
    ],
    warmUp: "Finish the sentence: “The classroom was as quiet as ___.” What type of figurative language is this?",
  },
  {
    family: "connotation", name: "Connotation and Denotation",
    definition: "Denotation is a word's dictionary meaning. Connotation is the feeling a word gives: positive, negative or neutral. Words with similar meanings can have very different feelings.",
    steps: ["Find the word and its dictionary meaning.", "Think of words with almost the same meaning.", "Decide whether the word feels positive, negative or neutral.", "Ask why the author chose this word instead of another."],
    signalWords: ["positive", "negative", "neutral", "feels", "suggests", "tone"],
    passage: {
      title: "Two Reviews of the Same Shop",
      text: P(
        "Review 1: The little bookshop on Palm Street is cozy and charming. The shelves are packed with treasures, and the owner is a curious man who loves to ask what you are reading. Prices are thrifty, so you can always take home something new.",
        "Review 2: The bookshop on Palm Street is cramped and old-fashioned. The shelves are crowded with clutter, and the owner is nosy, always asking what you are reading. The prices are cheap, and so are many of the books.",
        "Both writers visited the same shop. Only their word choices are different.",
      ),
      clues: ["The little bookshop on Palm Street is cozy and charming.", "The bookshop on Palm Street is cramped and old-fashioned."],
    },
    worked: { question: "How do “curious” and “nosy” differ in connotation?", answer: "Both mean wanting to know things, but curious feels positive and nosy feels negative.", why: "Review 1 praises the shop, and Review 2 complains about it, using the negative word." },
    thinkAloud: [
      "I notice both reviews describe the same shop.",
      "I notice “cozy” in Review 1 and “cramped” in Review 2. Both mean small.",
      "I ask myself: which one feels nice? Cozy is positive; cramped is negative.",
      "I notice “curious” and “nosy” both describe the owner asking questions.",
      "So the denotation is similar, but the connotation shows each writer's feeling.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["___ and ___ both mean ___, but ___ feels positive and ___ feels negative.", "The author chose ___ to make the reader feel ___."],
    reteach: [
      { title: "Feeling line", how: "Put a line on the floor from negative to positive. Students stand on the line holding word cards (cramped, small, cozy) and explain their spot." },
      { title: "Word swap", how: "Swap one word in a sentence from Review 1 with its partner from Review 2. Read both aloud and say how the feeling changed." },
    ],
    warmUp: "Ask: would you rather be called “thrifty” or “stingy”? Both mean careful with money. Why does one feel better?",
  },
  {
    family: "reference-materials", name: "Dictionary, Glossary and Thesaurus",
    definition: "Reference materials help you learn about words. A dictionary gives meanings, pronunciation and parts of speech; a glossary explains key words in one book; a thesaurus gives synonyms and antonyms.",
    steps: ["Decide what you need: a meaning, a pronunciation, or a better word.", "Choose the right tool: dictionary, glossary or thesaurus.", "Use alphabetical order and guide words to find the entry.", "Pick the meaning that fits your sentence."],
    signalWords: ["entry", "guide words", "part of speech", "pronunciation", "definition", "synonym"],
    passage: {
      title: "Finding the Right Meaning",
      text: P(
        "Dana read the sentence \"The scientist will record the results\" and was not sure what record meant here. She opened her dictionary. At the top of the page were the guide words \"recipe\" and \"red\", so she knew record would be on that page.",
        "The entry showed two pronunciations. RE-cord (noun) means a written account of something, such as a school record. re-CORD (verb) means to write down or save information.",
        "Because the sentence said the scientist \"will record\", Dana knew it was an action, a verb. She chose the second meaning: to write down the results. Later, she used a thesaurus to find another word for write down and found \"note\".",
      ),
      clues: ["At the top of the page were the guide words \"recipe\" and \"red\", so she knew record would be on that page.", "Because the sentence said the scientist \"will record\", Dana knew it was an action, a verb."],
    },
    worked: { question: "Why does Dana choose the verb meaning of record?", answer: "Because “will record” shows an action in the sentence, so record is a verb meaning to write down.", why: "The part of speech in the entry must match how the word is used in the sentence." },
    thinkAloud: [
      "I notice Dana needs a meaning, so a dictionary is the right tool.",
      "I notice guide words “recipe” and “red”, and record comes between them in ABC order.",
      "I notice the entry gives two meanings with two parts of speech.",
      "I ask myself: how is record used in the sentence? “will record” is an action.",
      "So she picks the verb meaning, and later uses a thesaurus for a synonym.",
    ],
    organizer: "NONE",
    frames: ["I would use a ___ to find ___.", "The word ___ is a ___ (part of speech) here, so the meaning is ___."],
    reteach: [
      { title: "Guide-word race", how: "Give pairs of guide words and a list of words. Students decide quickly if each word is on that page, before or after." },
      { title: "Which tool?", how: "Read six questions (How do I say this word? What's a stronger word for big?). Students hold up Dictionary, Glossary or Thesaurus cards." },
    ],
    warmUp: "Put five words in ABC order together. Then ask: which tool would tell us a synonym for “happy”?",
  },
  {
    family: "academic-vocabulary", name: "Academic and Domain-Specific Vocabulary",
    definition: "Academic words are used in school subjects, such as observe, compare and evidence. Domain-specific words belong to one subject, such as evaporation in science. Texts often explain them right away.",
    steps: ["Notice words that are new and important for the topic.", "Look for an explanation in the same sentence or the next one.", "Check text features: bold words, a glossary, a diagram.", "Say the meaning in your own words and use the word in a sentence."],
    signalWords: ["is called", "which means", "this process", "known as", "in other words", "for example"],
    passage: {
      title: "The Water Cycle",
      text: P(
        "Water on Earth moves in a never-ending path called the water cycle. When the sun heats water in seas and lakes, some of it turns into an invisible gas called water vapor. This process is called evaporation.",
        "As the vapor rises, the air higher up is cooler. The vapor cools and changes back into tiny drops of water that form clouds. This is known as condensation.",
        "When the drops in a cloud join together and become heavy, they fall as rain, snow or hail. Scientists call this precipitation. In other words, precipitation is any water that falls from the sky.",
      ),
      clues: ["When the sun heats water in seas and lakes, some of it turns into an invisible gas called water vapor. This process is called evaporation.", "In other words, precipitation is any water that falls from the sky."],
    },
    worked: { question: "What does “condensation” mean in the text?", answer: "When water vapor cools and changes back into tiny drops of water.", why: "The text explains it right before the signal words “This is known as condensation.”" },
    thinkAloud: [
      "I notice science words: evaporation, condensation, precipitation.",
      "I notice each one comes with signal words like “This process is called”.",
      "I ask myself: what happens just before “known as condensation”? Vapor cools into drops.",
      "I notice “In other words” before precipitation, which restates the meaning.",
      "So the text teaches each word right where it uses it.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["In science, ___ means ___.", "The text explains ___ when it says ___."],
    reteach: [
      { title: "Word wall with gestures", how: "Give each science word a gesture (fingers rising for evaporation). Say the word, do the gesture, and read the sentence that defines it." },
      { title: "Diagram labels", how: "Draw the water cycle and label the arrows with the three words. Students must copy the defining sentence next to each label." },
    ],
    warmUp: "Hold up a cold glass with drops on the outside (or describe it). Ask: where did the drops come from? Introduce “condensation”.",
  },
  {
    family: "puns", name: "Puns and Wordplay",
    definition: "A pun is a joke that plays with a word that has two meanings, or with words that sound alike. To get the joke, you notice both meanings at once.",
    steps: ["Find the word that makes the sentence funny.", "Think of two meanings or two sound-alike words.", "Ask which meaning the sentence uses and which one is the joke.", "Explain the joke in your own words."],
    signalWords: ["two meanings", "sounds like", "joke", "play on words", "double meaning"],
    passage: {
      title: "Jokes at the Class Party",
      text: P(
        "At the end of the term, our class held a joke contest. Huda went first. \"Why did the student eat his homework?\" she asked. \"Because the teacher said it was a piece of cake!\"",
        "Next, Tariq held up a picture of a sleeping cow. \"This cow is in a bad mood,\" he said. \"She's having a moo-dy day.\" Everyone groaned and laughed.",
        "The winner was our teacher. She said, \"I used to be a banker, but I lost interest.\" At first we did not get it. Then she explained that interest is the extra money a bank pays, and it also means wanting to do something.",
      ),
      clues: ["She said, \"I used to be a banker, but I lost interest.\"", "Then she explained that interest is the extra money a bank pays, and it also means wanting to do something."],
    },
    worked: { question: "Why is “I used to be a banker, but I lost interest” funny?", answer: "Interest means extra money from a bank and also means wanting to do something, so both meanings fit a banker who quit.", why: "The joke works because the word has two meanings at once." },
    thinkAloud: [
      "I notice the teacher's joke uses the word “interest”.",
      "I ask myself: what meanings of interest do I know?",
      "I notice the text explains two: money from a bank, and wanting to do something.",
      "I ask myself: do both meanings fit a banker? Yes.",
      "So the pun is funny because one word means two things at the same time.",
    ],
    organizer: "NONE",
    frames: ["The word ___ is a pun because it means ___ and also ___.", "The joke is funny because ___."],
    reteach: [
      { title: "Two-meaning drawing", how: "Draw both meanings of the pun word side by side. Then read the joke and point to both pictures at the funny moment." },
      { title: "Sound-alike pairs", how: "Say pairs like mood / moo-d and sea / see. Students make up a mini joke with one pair, then find the pair used in the text." },
    ],
    warmUp: "Tell: “Why did the cookie go to the doctor? It felt crummy.” Ask: what two meanings make this funny?",
  },
  // ------------------------------------------------------------------ added for the Grade 6 curriculum rebuild (Update 82)
  {
    family: "word-choice-tone", name: "Word Choice and Tone",
    definition: "Word choice is the specific words an author picks. Tone is the feeling or attitude those words create — such as tense, calm, playful or hopeful.",
    steps: ["Find a strong or unusual word in the passage.", "Ask whether that word feels calm, tense, happy or sad.", "Compare it with a plainer word that could replace it.", "Decide what tone the author's word choice creates, and why."],
    signalWords: ["suggests", "creates a feeling of", "word choice", "tone", "mood", "instead of"],
    passage: {
      title: "The Storm Warning",
      text: P(
        "Black clouds smothered the sky, and the wind screamed through the palm trees outside the clinic. Doctors rushed past the windows, their faces tight with worry.",
        "Inside, Nurse Huda hummed quietly as she folded clean blankets, her hands slow and steady. She had seen a hundred storms before, and panic never helped anyone.",
        "When the first patient arrived, soaked and shaking, Huda knelt beside him and spoke in a calm, low voice. \"You are safe now,\" she said. Outside, the storm still roared, but inside the small room, nothing seemed urgent at all.",
      ),
      clues: ["the wind screamed through the palm trees outside the clinic.", "Huda knelt beside him and spoke in a calm, low voice."],
    },
    worked: { question: "How does the word choice in the first paragraph create a tense tone, while the second paragraph feels calm?", answer: "Words like “smothered” and “screamed” make the storm feel violent and frightening, while “hummed” and “steady” create a calm, controlled tone.", why: "Smothered and screamed are strong, violent words, while hummed and steady are soft, controlled words, so the two paragraphs feel very different." },
    thinkAloud: [
      "I notice the words “smothered” and “screamed” describing the storm outside.",
      "I ask myself: do these words feel calm or violent? Violent, so the outside tone is tense.",
      "I notice “hummed” and “steady” describing Nurse Huda inside.",
      "I ask myself: how does this word choice make me feel? Calm and safe.",
      "So the author's word choice creates two very different tones in the same short passage.",
    ],
    organizer: "CONTEXT_CLUE",
    frames: ["The word ___ creates a tone of ___.", "Instead of a plain word like ___, the author chose ___ to make the reader feel ___."],
    reteach: [
      { title: "Word swap", how: "Replace a strong word in a sentence with a plain word (screamed → blew). Read both sentences aloud and discuss how the tone changes." },
      { title: "Tone meter", how: "Draw a line from calm to tense. Place word cards from the passage (smothered, hummed, steady, screamed) where they belong on the line." },
    ],
    warmUp: "Say the sentence “The wind blew.” then “The wind screamed.” Ask: which one feels scarier? Why?",
  },
  {
    family: "evaluate-argument", name: "Evaluate Argument and Claims",
    definition: "Evaluating an argument means deciding whether an author's claims are backed up by real reasons and evidence, or whether they rest only on an assumption or opinion.",
    steps: ["Find each claim the author makes.", "Check whether each claim has a reason and real evidence (facts, numbers, studies) behind it.", "Watch for words like “everyone knows” or “obviously,” which often signal an unsupported claim.", "Decide which claims are strong and which are weak, and explain why."],
    signalWords: ["because", "studies show", "evidence", "however", "everyone knows", "in fact"],
    passage: {
      title: "Should the Library Stay Open Late?",
      text: P(
        "Our school library should stay open until six o'clock every day. Many students want this change, but not every reason for it is equally strong.",
        "One strong reason is that a survey of 200 students found that most finish their sports practice after five o'clock and have nowhere quiet to study until the bus comes. That is a real problem backed by real numbers.",
        "Another reason some students give is that everyone prefers studying at school instead of at home. This claim has no survey or evidence behind it at all; it is simply an assumption.",
        "A longer library schedule would cost the school very little, since the librarian already stays until six most days to finish her own work.",
      ),
      clues: ["One strong reason is that a survey of 200 students found that most finish their sports practice after five o'clock and have nowhere quiet to study until the bus comes.", "Another reason some students give is that everyone prefers studying at school instead of at home."],
    },
    worked: { question: "Which claim in the text is weaker because it is not backed by evidence?", answer: "The claim that everyone prefers studying at school instead of at home.", why: "This claim has no survey, study or data behind it — it is stated as if everyone already agrees, which is an assumption, not evidence." },
    thinkAloud: [
      "I notice the first paragraph makes the claim that the library should stay open later.",
      "I ask myself: what evidence backs up this claim? A survey of 200 students.",
      "I notice the next claim about everyone preferring school has no survey or numbers.",
      "I ask myself: is this a fact or an assumption? It sounds like an assumption.",
      "So the first reason is strong evidence, but the second reason is a weak, unsupported claim.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["The claim that ___ is strong because the evidence is ___.", "The claim that ___ is weak because ___."],
    reteach: [
      { title: "Strong or weak sort", how: "Write each claim from the text on a card. Sort the cards into two piles: “Has real evidence” and “Just an assumption.” Discuss each sort." },
      { title: "Evidence detective", how: "Underline every number, study or named source in the text in one color, and every opinion word (“everyone,” “obviously”) in another. Compare the colors next to each claim." },
    ],
    warmUp: "Say: “Everyone knows pizza is the best food.” Ask: is this a fact with evidence, or just an opinion? Why?",
  },
  {
    family: "text-structure", name: "Text Structure",
    definition: "Text structure is the way an author organizes ideas — such as cause-and-effect, problem-and-solution, compare-and-contrast or chronological order. Noticing the structure helps a reader predict what comes next.",
    steps: ["Read the whole text and notice how ideas connect from one paragraph to the next.", "Look for signal words that hint at the structure (because, as a result, first/next, to solve this problem).", "Name the structure: cause-effect, problem-solution, compare-contrast, chronological or description.", "Explain how that structure helps organize the author's ideas."],
    signalWords: ["because", "as a result", "problem", "solution", "first", "next", "finally"],
    passage: {
      title: "Why Streets Flood After Storms",
      text: P(
        "Many old city streets flood after heavy rain, creating a serious problem for drivers and shop owners. Because the drains beneath these streets were built decades ago, they cannot carry away a sudden, heavy storm.",
        "As a result, water rises quickly, blocking roads and seeping into shops along the street. Business owners lose income every time this happens, and cars are sometimes stranded for hours.",
        "To solve this problem, the city is installing wider drains and raised sidewalks in the worst areas. First, engineers map out exactly where water collects. Next, they replace the old pipes with ones built for today's heavier storms.",
      ),
      clues: ["Because the drains beneath these streets were built decades ago, they cannot carry away a sudden, heavy storm.", "To solve this problem, the city is installing wider drains and raised sidewalks in the worst areas."],
    },
    worked: { question: "What overall text structure does the author use to organize this text?", answer: "Problem-and-solution: the text explains the flooding problem and its cause, then describes the city's solution.", why: "Paragraphs 1 and 2 describe the problem and its cause, and paragraph 3 begins with “To solve this problem,” introducing the solution." },
    thinkAloud: [
      "I notice paragraph 1 names a problem: streets flood after storms.",
      "I notice the signal word “Because”, which explains the cause of the problem.",
      "I notice paragraph 2 begins with “As a result”, showing an effect of that cause.",
      "I notice paragraph 3 begins with “To solve this problem”, which signals a solution is coming.",
      "So the text structure moves from a problem and its cause to a solution.",
    ],
    organizer: "PROBLEM_SOLUTION",
    frames: ["The problem is ___, and the solution is ___.", "This text uses a ___ structure because ___."],
    reteach: [
      { title: "Structure word hunt", how: "Underline every structure signal word (because, as a result, first, next, to solve this). Use only those words to guess the structure before reading closely." },
      { title: "Structure match", how: "Give four short paragraphs, each using a different structure (cause-effect, compare-contrast, sequence, description). Match each paragraph to its structure name card." },
    ],
    warmUp: "Say: “It rained, so the game was canceled.” Ask: is this cause-effect or compare-contrast? How do you know?",
  },
  {
    family: "word-relationships", name: "Word Relationships (Part-Whole, Item-Category)",
    definition: "Word relationships show how words connect — such as a part belonging to a whole (pedal : bicycle), or an item belonging to a category (salmon : fish). Seeing one pair's relationship helps you complete a similar pair.",
    steps: ["Decide how the first pair of words is connected (part-to-whole, item-to-category, or something else).", "Say the relationship in a sentence: “A ___ is a part of a ___” or “A ___ is a kind of ___.”", "Find a word that completes the second pair the same way.", "Check your answer by saying the full relationship sentence with both pairs."],
    signalWords: ["is a part of", "is a kind of", "belongs to", "is a type of", "category", "whole"],
    passage: {
      title: "Sorting Words That Belong Together",
      text: P(
        "Some words name a whole thing, and other words name just one part of that whole. A doorknob is a part of a door, and a keyboard is a part of a laptop. Learning these part-to-whole pairs helps readers picture exactly what a word describes.",
        "Other words name a whole category, and smaller words name one item inside that category. Salmon, trout and tuna are all specific kinds of fish, so fish is the category word. A reader who knows that cars, trucks and motorcycles all belong to the category vehicles can guess the meaning of an unfamiliar vehicle name from context.",
        "Noticing these relationships also helps on analogy questions, such as \"petal is to flower as pedal is to bicycle,\" because both pairs show a part connected to its whole.",
      ),
      clues: ["A doorknob is a part of a door, and a keyboard is a part of a laptop.", "Salmon, trout and tuna are all specific kinds of fish, so fish is the category word."],
    },
    worked: { question: "In the pair “petal is to flower as pedal is to bicycle,” what relationship connects each pair of words?", answer: "Part-to-whole: a petal is part of a flower, and a pedal is part of a bicycle.", why: "Both pairs show a smaller part that belongs to a larger whole, so the relationship between the two pairs is the same." },
    thinkAloud: [
      "I notice the text gives examples like doorknob and door, keyboard and laptop.",
      "I ask myself: is the first word a part of the second word? Yes, in each pair.",
      "I notice salmon, trout and tuna are all named as kinds of fish.",
      "I ask myself: what is the category word for all three? Fish.",
      "So I can describe word relationships as part-to-whole or item-to-category.",
    ],
    organizer: "COMPARE",
    frames: ["A ___ is a part of a ___.", "___, ___ and ___ are all kinds of ___."],
    reteach: [
      { title: "Picture sort", how: "Give picture or word cards (wheel, car, apple, fruit). Sort each card under “Part” or “Whole” and under “Item” or “Category,” then say the relationship aloud." },
      { title: "Analogy frames", how: "Give the first half of an analogy (sleeve is to shirt as ___). Students find a matching part-to-whole or item-to-category pair and explain why it matches." },
    ],
    warmUp: "Ask: is a wheel a part of a car, or a kind of car? Ask the same about a convertible. What's the difference?",
  },
  // ------------------------------------------------------------------ grammar, language, spelling, writing (Update 40)
  ...LANGUAGE_LESSONS,
  ...WRITING_LESSONS,
];

export const LESSON_BY_FAMILY = new Map(LESSONS.map((l) => [l.family, l]));
export const lessonFor = (familyCode: string | null | undefined): LessonContent | null => (familyCode ? LESSON_BY_FAMILY.get(familyCode) ?? null : null);

/**
 * The 🔤 Grammar bank's skills (code G4.grammar.g4-u1w1-s1) belong to three broad families (gr.grammar-usage,
 * gr.mechanics, gr.writing-revision). Their skill name says what they teach, so it chooses the specific lesson
 * (“Irregular Verbs: Past Tense” → irregular-verbs); a name that matches nothing gets the family's general editing
 * lesson. First match wins, so the more specific patterns come first.
 */
export const GRAMMAR_NAME_LESSONS: [RegExp, string][] = [
  [/capitaliz|capital letter|^proper adjectives/i, "capitalization"],
  [/quotation|dialogue|direct speech|italics/i, "quotations-dialogue"],
  [/title|abbreviation|letter|e-?mail|product name|hyphen/i, "titles-abbreviations"],
  [/homophone|confused words|troublesome|its\/it's|possessive pronouns vs\.? contraction|plurals vs\.? possessives vs\.? contraction/i, "pronoun-homophones"],
  [/fragment|run-?on|comma splice/i, "fragments-run-ons"],
  [/negative/i, "negatives"],
  [/contraction|apostroph/i, "apostrophes-contractions"],
  [/spelling comparative/i, "comparatives"],
  [/spelling plural|plurals of nouns|plural nouns|irregular plural|singular and plural/i, "plural-nouns"],
  [/possessive nouns? vs|plural vs\.? possessive|possessive noun/i, "possessive-nouns"],
  [/\bcommas?\b|punctuat|end mark|semicolon|colon|parenthes|dash|interjection|appositive/i, "commas"],
  [/combin|expand|varying sentence/i, "combining-sentences"],
  [/pronoun-verb agreement|pronouns with have and be/i, "subject-verb-agreement"],
  [/complex|clause|subordinat|relative pronoun/i, "clauses-complex"],
  [/pronoun/i, "pronouns"],
  [/agreement|locating the subject/i, "subject-verb-agreement"],
  [/perfect tense|progressive/i, "verb-tenses"],
  [/irregular verb|principal parts|participle|misused verb/i, "irregular-verbs"],
  [/tense/i, "verb-tenses"],
  [/compound subject|subjects? and (complete |compound )?predicate|simple and complete subject/i, "subjects-predicates"],
  [/compound sentence|simple and compound|coordinat|correlative|conjunction/i, "compound-sentences"],
  [/sentence|statements|kinds of|types of/i, "sentences"],
  [/preposition/i, "prepositions"],
  [/adjective or adverb|good\/well/i, "adverbs"],
  [/compar|more and most|more\/most|-er\/-est|good and bad|good \(|bad \(|many, much|superlative/i, "comparatives"],
  [/adverb|intensifier/i, "adverbs"],
  [/\bverbs?\b|direct object|indirect object|modal|predicate noun/i, "verbs"],
  [/noun/i, "nouns"],
  [/adjective|article|demonstrative/i, "adjectives"],
  [/formal|register|dialect|varieties|nonstandard|precise|style|tone|choosing words|word choice/i, "precise-language"],
];

/**
 * The lesson of a skill: its family's lesson, else (for a Grammar-bank skill) the lesson its name points to, else
 * the general lesson of its Grammar-bank kind. Every lookup (student lessons, teacher lessons, script cards, RTI
 * weekly plan) goes through here so they always agree.
 */
export function lessonForSkill(skill: { familyCode?: string | null; code?: string | null; name?: string | null }): LessonContent | null {
  const fam = String(skill.familyCode ?? "").trim();
  const own = lessonFor(fam) ?? lessonFor(familyOfSkillCode(String(skill.code ?? "")));
  if (own && !fam.startsWith("gr.")) return own;
  const isGrammarBank = fam.startsWith("gr.") || /\.grammar\./i.test(String(skill.code ?? ""));
  if (!isGrammarBank) return own;
  const name = String(skill.name ?? "").replace(/^TEST\s+/i, "");
  for (const [re, f] of GRAMMAR_NAME_LESSONS) if (re.test(name)) return lessonFor(f);
  return own ?? lessonFor(fam) ?? (/\.grammar\./i.test(String(skill.code ?? "")) ? lessonFor("gr.grammar-usage") : null);
}

/** The boxes of each organizer: an optional single box on top (`head`), a grid, and an optional box below (`foot`). */
export interface OrganizerSpec {
  kind: OrganizerKind;
  title: string;
  head?: string;
  columns: string[];
  rows: number;
  /** labels for the rows (sequence steps, plot map parts); otherwise numbered */
  rowLabels?: string[];
  /** how many rows must be complete (every column filled) */
  requiredRows: number;
  foot?: string;
}

export const ORGANIZERS: Record<Exclude<OrganizerKind, "NONE">, OrganizerSpec> = {
  CAUSE_EFFECT: { kind: "CAUSE_EFFECT", title: "Cause and effect chain", columns: ["Cause (why)", "Effect (what happened)"], rows: 3, requiredRows: 2 },
  COMPARE: { kind: "COMPARE", title: "Compare and contrast", columns: ["Only the first", "Both", "Only the second"], rows: 3, requiredRows: 2 },
  SEQUENCE: { kind: "SEQUENCE", title: "Sequence chain", columns: ["What happens"], rows: 4, rowLabels: ["First", "Next", "Then", "Finally"], requiredRows: 4 },
  PROBLEM_SOLUTION: { kind: "PROBLEM_SOLUTION", title: "Problem and solution", head: "Problem", columns: ["What was tried", "Result"], rows: 2, requiredRows: 1 },
  CENTRAL_IDEA_DETAILS: { kind: "CENTRAL_IDEA_DETAILS", title: "Central idea and details", head: "Central idea (or lesson)", columns: ["Supporting detail"], rows: 3, requiredRows: 3 },
  PLOT_MAP: { kind: "PLOT_MAP", title: "Plot map", columns: ["What the text says"], rows: 5, rowLabels: ["Setting", "Characters", "Problem or clue", "Key events", "Ending"], requiredRows: 4 },
  CHARACTER_TRAITS: { kind: "CHARACTER_TRAITS", title: "Character trait map", head: "Character", columns: ["Trait", "Evidence from the text"], rows: 3, requiredRows: 2 },
  CLAIM_EVIDENCE: { kind: "CLAIM_EVIDENCE", title: "Claim and evidence", head: "My answer / claim", columns: ["Evidence (text clue)", "How it supports my answer"], rows: 2, requiredRows: 2 },
  CONTEXT_CLUE: { kind: "CONTEXT_CLUE", title: "Context clue map", head: "Word or phrase", columns: ["Clue in the text", "Kind of clue"], rows: 2, requiredRows: 1, foot: "What I think it means" },
  WORD_PARTS: { kind: "WORD_PARTS", title: "Word parts", head: "Word", columns: ["Part", "Meaning of the part"], rows: 3, requiredRows: 2, foot: "Meaning of the whole word" },
  RULE_EXAMPLES: { kind: "RULE_EXAMPLES", title: "Rule and examples", head: "The rule in my own words", columns: ["Example from the text", "How it follows the rule"], rows: 3, requiredRows: 2 },
  SENTENCE_FIX: { kind: "SENTENCE_FIX", title: "Sentence fixer", columns: ["Sentence from the text", "What I changed and why", "My new sentence"], rows: 3, requiredRows: 2 },
};

/** The family code of a skill code ("G4.context-clues" → "context-clues"). */
export const familyOfSkillCode = (code: string) => String(code ?? "").replace(/^G\d+\./i, "").trim();
