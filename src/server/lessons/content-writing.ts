/**
 * 🧩 Interactive intervention lessons (Update 40): ORIGINAL teaching content for the writing skill families and
 * for the three kinds of skills of the 🔤 Grammar bank (Grammar & Usage, Mechanics, Writing / Revision) whose
 * skill name does not match a more specific lesson (see `lessonForSkill` in ./content.ts).
 *
 * Same format and rules as ./content-language.ts: model texts of 70–170 words written for this platform
 * (Grades 4–6, Arabic-speaking learners of English), `clues` are exact sentences of the text, no abbreviations with
 * a full stop inside a model text.
 */
import type { LessonContent } from "./content";

const P = (...paras: string[]) => paras.join("\n\n");

export const WRITING_LESSONS: LessonContent[] = [
  {
    family: "writing-argument", name: "Argumentative / Opinion Writing",
    definition: "In opinion writing, you state what you think (your claim) and give reasons and evidence to support it. A strong piece also answers the other side and ends by repeating the claim.",
    steps: ["State your claim clearly in the first paragraph.", "Give two or three reasons, each with a fact or an example.", "Use linking words: first, also, for example, because.", "Answer the other side: “Some people say … However …”.", "End by restating your claim in new words."],
    signalWords: ["I believe / should", "first / second", "for example", "however", "for these reasons"],
    passage: {
      title: "Every Class Needs a Reading Corner",
      text: P(
        "Every classroom in our school should have a reading corner. A reading corner is a quiet place with books, cushions and good light. I believe it would help students in two important ways.",
        "First, students would read more. When books are close, people pick them up in their free minutes. Second, a reading corner gives students a calm place to rest their minds after a hard lesson.",
        "Some people say reading corners take too much space. However, a small corner needs only two cushions and one shelf. For these reasons, every class should build a reading corner this year.",
      ),
      clues: ["Every classroom in our school should have a reading corner.", "For these reasons, every class should build a reading corner this year."],
    },
    worked: { question: "Which sentence states the writer's claim (opinion)?", answer: "Every classroom in our school should have a reading corner.", why: "It tells what the writer thinks should happen, and the rest of the text gives reasons for it. The last sentence restates the same claim." },
    thinkAloud: [
      "I notice the word should in the first sentence: it tells an opinion.",
      "I ask myself: do the other sentences support this idea? Yes, they give reasons.",
      "I notice First and Second: each starts a reason.",
      "I notice “Some people say … However …”: the writer answers the other side.",
      "So the claim is the first sentence, and the last sentence says it again.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["I believe ___ because ___.", "Some people think ___. However, ___."],
    reteach: [
      { title: "Table legs", how: "Draw a table: the top is the claim and each leg is a reason. Students write the claim and two reasons from the text, then add one reason of their own." },
      { title: "Agree or disagree line", how: "Read a claim (“Homework should be shorter.”). Students stand on an agree/disagree line and give one reason each. Then they write the claim and their best reason." },
    ],
    warmUp: "Ask: should our school day start later? Students answer with “I believe … because …”.",
  },
  {
    family: "writing-informative", name: "Informative / Expository Writing",
    definition: "Informative writing teaches the reader about a topic with facts. It has a topic sentence, details grouped by idea, linking words, and a conclusion.",
    steps: ["Write a topic sentence that tells what the whole text is about.", "Group your facts: one main idea for each paragraph.", "Add details: facts, examples and definitions of new words.", "Join ideas with linking words: also, for example, in addition, because.", "End with a conclusion that sums up the topic."],
    signalWords: ["for example", "also / in addition", "because", "another", "in conclusion"],
    passage: {
      title: "How Camels Live in the Desert",
      text: P(
        "Camels have special body parts that help them live in the hot, dry desert. Each part solves a different problem.",
        "First, a camel's hump stores fat, not water. When food is hard to find, the camel's body uses this fat for energy. Camels can also drink a very large amount of water at one time when they find it.",
        "Another problem in the desert is blowing sand. Camels have long eyelashes that keep sand out of their eyes, and they can close their nostrils. Their wide, flat feet help them walk on soft sand without sinking. In conclusion, a camel's body is built for desert life.",
      ),
      clues: ["Camels have special body parts that help them live in the hot, dry desert."],
    },
    worked: { question: "Which sentence is the topic sentence that tells what the whole text is about?", answer: "Camels have special body parts that help them live in the hot, dry desert.", why: "Every paragraph after it explains one of these body parts, so it covers the whole text." },
    thinkAloud: [
      "I ask myself: what is every paragraph about? A camel's body in the desert.",
      "I notice the first sentence says exactly that.",
      "I notice paragraph two is about food and water, and paragraph three is about sand.",
      "I notice linking words: First, also, Another, In conclusion.",
      "So the topic sentence is the first sentence, and the last sentence is the conclusion.",
    ],
    organizer: "CENTRAL_IDEA_DETAILS",
    frames: ["This text teaches that ___.", "One fact is ___. Another fact is ___."],
    reteach: [
      { title: "Hand plan", how: "Trace a hand: the palm is the topic sentence and each finger is one fact. Students fill the hand for the camel text, then plan a new topic the same way." },
      { title: "Sort the facts", how: "Give fact cards about an animal mixed up. Students group them into two paragraphs and write a topic sentence for each group." },
    ],
    warmUp: "Ask: what three facts do you know about the sun? Write them and choose a sentence that could introduce all three.",
  },
  {
    family: "writing-narrative", name: "Narrative Writing",
    definition: "A narrative tells a story. It has characters, a setting, a problem, events in order and an ending. Good stories show feelings through actions and words, and use time words to move the story along.",
    steps: ["Introduce the character and the setting.", "Show the problem early.", "Tell the events in order with time words: first, next, then, finally.", "Show feelings with actions and dialogue, not only with feeling words.", "End by solving the problem and showing how the character feels."],
    signalWords: ["first / next / then", "suddenly", "finally", "said / asked", "at the end"],
    passage: {
      title: "The Missing Key",
      text: P(
        "On Thursday afternoon, Faisal came home from school and reached into his pocket. His house key was gone. His parents would not be home until six.",
        "First, he walked back to the bus stop, looking at the ground the whole way. Next, he asked the shopkeeper on the corner if anyone had found a key. The man shook his head.",
        "Faisal sat on the front step, tired and hungry. Then his neighbor waved a small silver key from her window. \"You dropped this by the gate this morning,\" she said. Faisal laughed with relief and thanked her twice.",
      ),
      clues: ["His house key was gone."],
    },
    worked: { question: "Which sentence tells the main problem of the story?", answer: "His house key was gone.", why: "Everything Faisal does next (walking back, asking the shopkeeper, waiting) is to solve this problem." },
    thinkAloud: [
      "I notice the first sentence gives the character, Faisal, and the setting, home on Thursday afternoon.",
      "I ask myself: what goes wrong? His house key was gone.",
      "I notice First, Next and Then move the events in order.",
      "I notice “sat on the front step, tired and hungry” shows his feelings.",
      "So the problem comes early, and the ending solves it when the neighbor finds the key.",
    ],
    organizer: "PLOT_MAP",
    frames: ["At the beginning, ___. The problem is ___.", "First, ___. Then, ___. Finally, ___."],
    reteach: [
      { title: "Story mountain", how: "Draw a mountain: beginning, problem, events going up, the top moment, and the ending going down. Students place each paragraph of the story on the mountain." },
      { title: "Show, don't tell", how: "Give a telling sentence (“Faisal was sad.”). Students rewrite it to show the feeling with an action or words, then find a showing sentence in the story." },
    ],
    warmUp: "Ask: tell a partner about a time you lost something. What was the problem, and how did it end?",
  },
  {
    family: "writing-poetry", name: "Poetry Writing",
    definition: "A poem uses few words to paint a picture or share a feeling. Poets choose strong words, use lines and stanzas, and often add sound tools like rhyme, repetition and alliteration (words that start with the same sound).",
    steps: ["Choose one topic and one feeling about it.", "List what you see, hear, smell, touch and taste.", "Write short lines; start a new stanza for a new idea.", "Add a sound tool: rhyme, repetition or alliteration.", "Read it aloud and change any weak word for a stronger one."],
    signalWords: ["line", "stanza", "rhyme", "repeat", "same first sound", "senses"],
    passage: {
      title: "Morning in the Courtyard",
      text: P(
        "The sun climbs over the courtyard wall.\nIt paints the palm tree gold.\nThe sparrows start their singing call.\nThe morning air is cold.",
        "My mother pours the mint tea slow.\nThe steam swirls soft and sweet.\nThe tiles are warm, the shadows grow,\nand dust dances at my feet.",
        "I listen for the school bus horn.\nI grab my bag and run.\nGoodbye, my quiet courtyard morn.\nHello, my day of fun.",
      ),
      clues: ["The steam swirls soft and sweet."],
    },
    worked: { question: "Which line uses alliteration (several words that start with the same sound)?", answer: "The steam swirls soft and sweet.", why: "Steam, swirls, soft and sweet all begin with the s sound, which makes the line sound smooth like steam." },
    thinkAloud: [
      "I notice the poem has three stanzas with four lines each.",
      "I notice wall and call, gold and cold: the lines rhyme.",
      "I read each line aloud and listen to the first sounds of the words.",
      "I hear s, s, s, s in “The steam swirls soft and sweet.”",
      "So that line uses alliteration, and it helps me hear and see the tea.",
    ],
    organizer: "NONE",
    frames: ["My poem is about ___, and I want the reader to feel ___.", "I used ___ in the line “___”."],
    reteach: [
      { title: "Senses list", how: "Students choose a place they love and fill five boxes (see, hear, smell, touch, taste). They turn the best three boxes into three lines of a poem." },
      { title: "Sound play", how: "Give a plain line (“The cat sat on the mat.”). Students change it to use alliteration (“The sleepy cat sat still”) and read both versions aloud." },
    ],
    warmUp: "Ask: what words describe rain? Students say words that start with the same sound (rain races, drops dance).",
  },
  {
    family: "writing-research", name: "Research and Sources",
    definition: "Research means finding information to answer questions. Good researchers use more than one trusted source, take notes in their own words, check facts that seem strange, and write down where each fact came from.",
    steps: ["Write the questions you want to answer.", "Find at least two trusted sources, such as a library book and an expert website.", "Take short notes in your own words.", "Check a fact in a second source when you are not sure.", "Write down the title and author of every source."],
    signalWords: ["source", "notes", "in my own words", "check", "title and author"],
    passage: {
      title: "How Faris Researched Sea Turtles",
      text: P(
        "Faris wanted to write a report about sea turtles. First, he wrote three questions about what they eat, where they lay eggs and why they are in danger.",
        "He found a website from a wildlife group and a library book by a marine scientist. He took notes in his own words and wrote down the title and author of each source.",
        "One website said that all sea turtles eat only jellyfish. Faris was not sure, so he checked his library book. The book said different kinds of turtles eat different foods, such as seagrass, crabs and jellyfish. Faris used only the facts that his good sources agreed on.",
      ),
      clues: ["Faris was not sure, so he checked his library book."],
    },
    worked: { question: "Which sentence shows Faris checking a fact in a second source?", answer: "Faris was not sure, so he checked his library book.", why: "He did not trust one website alone; he looked in another source to see whether the fact was true." },
    thinkAloud: [
      "I notice Faris starts with questions, so he knows what to look for.",
      "I notice he uses two kinds of sources: a website and a library book.",
      "I notice he writes notes in his own words and records the title and author.",
      "I ask myself: when does he check a fact? When the website says all turtles eat only jellyfish.",
      "So the sentence about checking the library book shows good research.",
    ],
    organizer: "CLAIM_EVIDENCE",
    frames: ["My question is ___. Source 1 says ___, and source 2 says ___.", "I trust this source because ___."],
    reteach: [
      { title: "Two-source check", how: "Give two short cards about one animal with one fact that does not match. Students find the fact that disagrees and decide which source to trust and why." },
      { title: "Note shrink", how: "Read one sentence from a source. Students cover it and write the idea in five words or fewer, then add the source title under the note." },
    ],
    warmUp: "Ask: if a friend says “Camels store water in their humps”, how could you check whether it is true?",
  },
  {
    family: "precise-language", name: "Precise Language, Style and Tone",
    definition: "Precise language means choosing exact words instead of general ones (sprinted instead of went, dozens instead of a lot). Style and tone mean using words that fit your reader: formal words for a report, friendly words for a note to a friend.",
    steps: ["Find general words such as good, bad, nice, thing, stuff, a lot, went.", "Ask: what exactly did I see, hear or mean?", "Replace each general word with an exact noun, a strong verb or a clear adjective.", "Check the reader: formal for school reports, friendly for friends.", "Read it aloud: does the new sentence paint a clearer picture?"],
    signalWords: ["exact noun", "strong verb", "formal / informal", "stuff / thing / a lot (replace)", "tone"],
    passage: {
      title: "Nasser Revises His Report",
      text: P(
        "Nasser wrote a report about a sandstorm. His first sentence was: The wind was really bad and stuff got everywhere.",
        "His teacher asked him to choose more exact words. Nasser thought about what he saw and heard that day. He rewrote the sentence: The howling wind threw sand against the windows and covered the cars in a thick yellow coat.",
        "He also changed “a lot of” to “dozens of” and “kids” to “students”, because a report should sound formal. His new report was clearer and more interesting to read.",
      ),
      clues: ["He rewrote the sentence: The howling wind threw sand against the windows and covered the cars in a thick yellow coat."],
    },
    worked: { question: "Which sentence uses the most precise, vivid words?", answer: "He rewrote the sentence: The howling wind threw sand against the windows and covered the cars in a thick yellow coat.", why: "Howling, threw and “thick yellow coat” tell exactly what the wind did, instead of “really bad” and “stuff”." },
    thinkAloud: [
      "I notice the first sentence uses “really bad” and “stuff”. Those words are not exact.",
      "I ask myself: what did Nasser really see and hear? A howling wind and sand on the cars.",
      "I find the rewritten sentence with strong verbs like threw and covered.",
      "I notice he changed kids to students because a report is formal.",
      "So precise words help the reader see the sandstorm clearly.",
    ],
    organizer: "SENTENCE_FIX",
    frames: ["Instead of ___, I wrote ___ because it shows ___.", "For this reader I used a ___ tone, so I chose ___."],
    reteach: [
      { title: "Word ladder", how: "Write a general word at the bottom of a ladder (went). Students add more exact words on each step (walked, hurried, raced, sprinted) and choose the best one for a sentence." },
      { title: "Formal or friendly", how: "Show the same message to a friend and to a head teacher. Students circle the words that change and explain why." },
    ],
    warmUp: "Say: “The food was good.” Ask students to tell exactly how it was good, using one precise word.",
  },
  // ------------------------------------------------------------------ the Grammar bank's general kinds
  {
    family: "gr.grammar-usage", name: "Grammar and Usage: Editing Sentences",
    definition: "Good grammar helps readers understand you. When we edit, we check each sentence for the most common mistakes: a missing verb (is, are), a verb that does not agree with its subject, a missing a, an or the, and the wrong tense.",
    steps: ["Read one sentence at a time, slowly.", "Check the verb: is there one, and does it agree with the subject?", "Check the nouns: is there an article (a, an, the) and the right plural?", "Check the time: does the tense match the time words?", "Rewrite the sentence correctly and read it aloud."],
    signalWords: ["is / are", "verb + s", "a / an / the", "yesterday / now / tomorrow", "plural after a number"],
    passage: {
      title: "Ahmad's Draft: My Best Friend (with three mistakes)",
      text: P(
        "My best friend is called Yousef. He lives in the house next to mine. Every morning, we walk to school together.",
        "Yousef very funny. He tells jokes at lunch, and everyone laughs. He have two little sisters, and they love his jokes too.",
        "Last week, Yousef helped me with my math homework. He explained the problems slowly and drew pictures for me. I got all ten answer right. Now I want to help him with his English story.",
      ),
      clues: ["Yousef very funny."],
    },
    worked: { question: "Which sentence in Ahmad's draft is missing the verb is?", answer: "“Yousef very funny.” Fix: “Yousef is very funny.”", why: "Every English sentence needs a verb. Here the linking verb is is missing between the subject Yousef and the describing words." },
    thinkAloud: [
      "I read each sentence and look for its verb first.",
      "I notice “Yousef very funny.” has a subject and a describing word, but no verb.",
      "So I add is: “Yousef is very funny.”",
      "I notice “He have”: he is one person, so the verb should be has.",
      "I notice “all ten answer”: after ten I need the plural answers.",
    ],
    organizer: "SENTENCE_FIX",
    frames: ["The sentence ___ is missing ___.", "I changed ___ to ___ because ___."],
    reteach: [
      { title: "Checklist card", how: "Give a three-box checklist: verb? agreement? plural/article? Students check one sentence at a time and tick each box before moving on." },
      { title: "Read it like a teacher", how: "Students read the draft aloud with a pencil. Each time something sounds wrong, they stop, say what is missing, and write the fix above the line." },
    ],
    warmUp: "Say: “My sister teacher.” Ask what word is missing and say the sentence correctly together.",
  },
  {
    family: "gr.mechanics", name: "Capitals and Punctuation: Editing",
    definition: "Mechanics are the rules for capital letters, punctuation and spelling that make writing easy to read. When we edit, we check that each sentence starts with a capital, names have capitals, and every sentence has the right end mark and commas.",
    steps: ["Check the first word of each sentence for a capital letter.", "Check names of people, places, days and months for capitals.", "Check the end mark: . ? or !", "Check the commas in lists and after opening words.", "Read the sentence again after each fix."],
    signalWords: ["capital letter", "names and places", ". ? !", "commas in lists", "edit"],
    passage: {
      title: "Dana's Draft: Our School Trip (with three mistakes)",
      text: P(
        "On Wednesday, our class went to the aquarium. We saw sharks, turtles, jellyfish and a huge octopus. The octopus changed color when it moved.",
        "our guide told us that octopuses have three hearts. Everyone was amazed. Then we watched the divers feed the fish.",
        "After lunch we bought small gifts in the shop. My friend maryam chose a blue pencil with a fish on it. I chose a postcard of the octopus. Can we go back next year?",
      ),
      clues: ["our guide told us that octopuses have three hearts."],
    },
    worked: { question: "Which sentence in Dana's draft is missing a capital letter at the start?", answer: "“our guide told us that octopuses have three hearts.” Fix: “Our guide told us that octopuses have three hearts.”", why: "Every sentence must begin with a capital letter, and this one starts with a small o." },
    thinkAloud: [
      "I look at the first letter of every sentence.",
      "I notice paragraph two starts with “our”, a small letter, so it needs a capital O.",
      "I notice “maryam” is a person's name, so it needs a capital M.",
      "I notice “After lunch” is an opening phrase, so a comma should follow it.",
      "So I fix all three mistakes and read the draft again.",
    ],
    organizer: "SENTENCE_FIX",
    frames: ["___ needs a capital letter because ___.", "I added a ___ after ___ because ___."],
    reteach: [
      { title: "Two-color edit", how: "Students read the draft twice: first with a green pencil for capitals only, then with a red pencil for punctuation only. Then they compare their marks with a partner." },
      { title: "Editing marks", how: "Teach three marks: three lines under a letter (make it a capital), a circle for a full stop, and a small comma above a caret. Students mark the draft and rewrite it." },
    ],
    warmUp: "Write “yesterday ali went to the park” on the board. Students find two capitals and one end mark to add.",
  },
  {
    family: "gr.writing-revision", name: "Revising a Draft",
    definition: "Revising means making a draft clearer and stronger. Writers cut repeated ideas, join short choppy sentences, add details, and replace general words with exact ones.",
    steps: ["Read the draft aloud and listen for places that sound choppy or repeated.", "Cut sentences that repeat the same idea.", "Join short sentences that share words.", "Add one detail that helps the reader see or understand.", "Change general words to exact words."],
    signalWords: ["repeat", "choppy", "join", "add a detail", "exact word"],
    passage: {
      title: "Lama's Draft: The New Park (before revising)",
      text: P(
        "A new park opened near my house. The park is big. The park has a lake. It opened last month. My family walks there after dinner.",
        "There is a playground with swings and a long slide. Children play there every afternoon. The playground is nice.",
        "My favorite place is the lake. Ducks swim across the water, and families feed them bread. I like the lake the most because it is my favorite place.",
      ),
      clues: ["I like the lake the most because it is my favorite place."],
    },
    worked: { question: "Which sentence repeats an idea that the draft already says, so it can be cut or changed?", answer: "I like the lake the most because it is my favorite place.", why: "The paragraph already says “My favorite place is the lake.” This sentence repeats it without adding a new reason." },
    thinkAloud: [
      "I read the draft aloud and notice “The park is big. The park has a lake.” sounds choppy.",
      "I could join them: “The big new park has a lake.”",
      "I notice “The playground is nice.” Nice is a general word; I could say what makes it fun.",
      "I notice the last sentence says the lake is her favorite place again.",
      "So that sentence repeats an idea, and Lama could replace it with a real reason.",
    ],
    organizer: "SENTENCE_FIX",
    frames: ["I cut ___ because it repeats ___.", "I joined ___ and ___ into ___."],
    reteach: [
      { title: "Keep, cut, join", how: "Write each sentence of the draft on a strip. Students sort the strips into Keep, Cut and Join piles, then build the revised paragraph." },
      { title: "Add a detail", how: "Students choose one plain sentence and ask the five senses questions. They add one detail and read the old and new sentences aloud." },
    ],
    warmUp: "Read: “The dog is brown. The dog is small. The dog barks.” Ask students to revise it into one sentence.",
  },
];
