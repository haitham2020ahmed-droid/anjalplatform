"""Very easy (Levels 1–2) and advanced (Levels 6–7) items so the adaptive engine
can place students at both ends of the range."""
from qb import grade, mc, tf, dd, err

# ------------------------------------------------------------------ Grade 4
grade(4)
mc("nouns", "L.4.1", 1, "Which word is a noun? “The bird sang loudly.”", "bird",
   [("sang", "Sang is a verb—an action."), ("loudly", "Loudly is an adverb that tells how.")],
   "A noun names a person, place, thing, or animal. Bird names an animal.", "Ask: can I put “a” or “the” in front of it?")
mc("sentences", "L.4.1", 1, "Which end mark belongs at the end of this question? “Where is my pencil”", "?",
   [(".", "A period ends a statement, not a question."), ("!", "An exclamation point shows strong feeling."), (",", "A comma never ends a sentence.")],
   "Questions end with a question mark.", "Questions often start with who, what, where, when, why, or how.")
mc("capitalization", "L.4.2.a", 1, "Which name needs a capital letter?", "egypt",
   [("country", "Country is a common noun."), ("river", "River is a common noun."), ("city", "City is a common noun.")],
   "Egypt is the name of a specific place, so it is a proper noun.", "Specific names of people and places get capital letters.")
mc("synonyms-antonyms", "L.4.5.c", 1, "Which word means the opposite of hot?", "cold",
   [("warm", "Warm is close to hot."), ("sunny", "Sunny describes weather, not the opposite of hot."), ("big", "Big is about size.")],
   "Hot and cold are antonyms.", "Antonyms are opposites: up/down, fast/slow.")
mc("plural-nouns", "L.4.1", 2, "What is the plural of box?", "boxes",
   [("boxs", "Words ending in x add -es."), ("boxies", "There is no y to change."), ("box", "Box stays singular.")],
   "Nouns ending in s, x, z, ch, or sh add -es.", "If you hear an extra syllable (box-es), add -es.")
mc("figurative-language", "RL.4.4", 7, "Read: “Grandpa's laugh was thunder rolling across the hills, and the children ran toward it like flowers turning to the sun.” Which statement best explains how the two comparisons work together?",
   "The metaphor shows Grandpa's laugh is big and powerful; the simile shows the children are drawn to its warmth.",
   [("Both comparisons show that the children are afraid of Grandpa.", "Flowers turning to the sun shows attraction, not fear."), ("Both comparisons describe the weather that day.", "Thunder and sun are figurative, not real weather."), ("The simile describes the laugh and the metaphor describes the hills.", "The metaphor describes the laugh; the simile describes the children.")],
   "Thunder suggests a loud, booming laugh, while flowers turning to the sun suggests the children love being near it.",
   "With two comparisons, explain what EACH one describes, then how they connect.")
mc("author-claim", "RI.4.8", 7, "An article claims: “Our town should build bike lanes.” Which reason would be the WEAKEST support?",
   "Bikes come in many bright colors.",
   [("Bike lanes reduce accidents between cars and cyclists.", "This is relevant safety evidence."), ("More people would bike to work, reducing traffic.", "This explains a benefit."), ("A nearby town's bike lanes cut pollution by 10%.", "This is evidence from a similar place.")],
   "The color of bikes has nothing to do with whether lanes should be built.", "Weak reasons are true but unrelated to the claim.")
mc("context-clues", "L.4.4.a", 7, "Read: “Mira's explanation was so lucid that even her little brother understood the science experiment on the first try.” What does lucid mean, and which clue shows it?",
   "clear — “even her little brother understood … on the first try”",
   [("long — “explanation”", "Explanation does not tell the meaning of lucid."), ("confusing — “science experiment”", "The brother understood, so it was not confusing."), ("funny — “her little brother”", "Nothing suggests humor.")],
   "If a young child understood right away, the explanation must have been very clear.", "Use the RESULT described in the sentence as your clue.")
mc("theme", "RL.4.2", 6, "A boy brags that he will win the race, skips practice, and loses to a quieter classmate who trained every day. Which theme fits best?",
   "Hard work matters more than bragging.",
   [("Races are unfair to fast runners.", "Nothing suggests the race was unfair."), ("Quiet people never win.", "The quiet classmate wins."), ("Practice is boring.", "This is not a lesson shown by the events.")],
   "The events show that effort, not boasting, leads to success.", "Themes come from what happens to characters because of their choices.")
err("subject-verb-agreement", "L.4.1", 6, ["Each of the puppies", "have", "a blue collar."], 1, "has",
    "Each is singular, so the verb must be has, even though puppies is plural.", "Words like each, every, and either are singular subjects.")

# ------------------------------------------------------------------ Grade 5
grade(5)
mc("nouns", "L.5.1", 1, "Which word is a proper noun?", "Jeddah",
   [("city", "City is a common noun."), ("beach", "Beach is a common noun."), ("market", "Market is a common noun.")],
   "Jeddah names a specific city, so it is proper and capitalized.", "Proper nouns name specific people, places, or things.")
mc("verbs", "L.5.1", 1, "Which word is the verb in this sentence? “The happy children laughed.”", "laughed",
   [("children", "Children is a noun."), ("happy", "Happy is an adjective describing the children.")],
   "Laughed tells what the children did.", "Verbs show action or being.")
mc("commas", "L.5.2.a", 2, "Which sentence needs commas?", "We saw lions tigers and bears.",
   [("We saw lions.", "One item needs no comma."), ("We saw lions and tigers.", "Two items joined by and need no comma."), ("Lions roar.", "This is a short simple sentence.")],
   "Three items in a series need commas: lions, tigers, and bears.", "Count the items. Three or more? Use commas.")
mc("prefixes", "L.5.4.b", 2, "What does unhappy mean?", "not happy",
   [("very happy", "Un- does not mean very."), ("happy again", "Again is re-."), ("happy before", "Before is pre-.")],
   "The prefix un- means not.", "Cover the prefix, read the base word, then add the prefix meaning.")
mc("spelling", "L.5.2.e", 2, "Which word is spelled correctly?", "friend",
   [("freind", "i before e in friend."), ("frend", "Missing the i."), ("frind", "Missing the e.")],
   "Friend is spelled f-r-i-e-n-d.", "Memory trick: a friend to the end.")
mc("point-of-view", "RL.5.6", 7, "A story about a soccer final is told by the goalkeeper who let in the winning goal. How would the description of the final minute most likely change if the scorer narrated it?",
   "It would focus on excitement and pride instead of disappointment.",
   [("It would describe exactly the same feelings.", "Different narrators experience events differently."), ("It would include no feelings at all.", "First-person narrators share feelings."), ("It would describe the goalkeeper's thoughts in detail.", "The scorer cannot know the goalkeeper's thoughts.")],
   "A narrator's point of view shapes which feelings and details are emphasized.", "RL.5.6: ask how the narrator's experience colors the events.")
mc("central-idea", "RI.5.2", 7, "A text explains that honeybees pollinate crops, that bee numbers are falling, and that farmers are planting wildflower strips to help. Which statement best captures BOTH main ideas?",
   "Bees are essential to farming, and people are acting to reverse their decline.",
   [("Wildflowers are pretty.", "This is a minor detail."), ("Honeybees make honey.", "Honey is not discussed."), ("Farmers grow many crops.", "This misses the bees' decline and the response.")],
   "Grade 5 texts can have two main ideas: why bees matter, and how people help them.", "Check that your summary statement covers every section.")
mc("idioms-adages", "L.5.5.b", 6, "“The early bird catches the worm.” Which situation shows this proverb?",
   "Noura arrived first at the book sale and found the rarest book.",
   [("A bird ate a worm in the garden.", "This is the literal meaning."), ("Omar slept late and missed the bus.", "This shows the opposite outcome, not the proverb."), ("Lina likes birds more than worms.", "This has nothing to do with the advice.")],
   "The proverb means people who act early get the best opportunities.", "Match the proverb's lesson to a real-life example.")
mc("clauses-complex", "L.5.1", 6, "Which sentence correctly combines the ideas using a dependent clause? “It was raining. We played inside.”",
   "Because it was raining, we played inside.",
   [("It was raining, we played inside.", "This is a comma splice."), ("Because it was raining.", "This is a fragment."), ("It was raining because we played inside.", "This reverses the cause and effect.")],
   "Because it was raining is a dependent clause that explains why.", "Put the cause in the because-clause.")
err("pronoun-homophones", "L.5.1", 6, ["The students forgot", "there", "notebooks in the library."], 1, "their",
    "Their shows ownership (the students' notebooks); there tells where.", "their = belongs to them; there = place; they're = they are.")

# ------------------------------------------------------------------ Grade 6
grade(6)
mc("nouns", "L.6.1", 1, "Which word is a common noun?", "teacher",
   [("Ms. Amal", "This is a specific name—a proper noun."), ("Dammam", "This is a specific city."), ("Friday", "Days of the week are proper nouns.")],
   "Teacher names a general person, not a specific one.", "Common nouns are not capitalized unless they start a sentence.")
mc("sentences", "L.6.1", 1, "What kind of sentence is this? “Please close the window.”", "imperative (a command)",
   [("interrogative (a question)", "There is no question mark."), ("exclamatory (strong feeling)", "It doesn't end with !"), ("declarative (a statement)", "It tells someone to do something.")],
   "Imperative sentences give commands or requests.", "Declarative . | Interrogative ? | Exclamatory ! | Imperative (command).")
mc("synonyms-antonyms", "L.6.5.b", 2, "Which word is a synonym for begin?", "start",
   [("finish", "Finish is an antonym."), ("pause", "Pause means stop for a while."), ("forget", "Forget is unrelated.")],
   "Begin and start mean the same thing.", "Swap the words in a sentence: if the meaning stays, they're synonyms.")
mc("adjectives", "L.6.1", 2, "Which word is an adjective? “A tall building shone brightly.”", "tall",
   [("building", "Building is a noun."), ("shone", "Shone is a verb."), ("brightly", "Brightly is an adverb; it tells how the building shone.")],
   "Tall describes what kind of building.", "Adjectives answer: what kind? which one? how many?")
mc("precise-language", "L.6.3.b", 2, "Which word is more formal than kids?", "children",
   [("guys", "Guys is informal."), ("buddies", "Buddies is informal."), ("folks", "Folks is casual.")],
   "Children is the formal, standard word.", "Use formal words in reports and essays.")
mc("author-claim", "RI.6.8", 7, "Which claim would require the strongest evidence to be convincing?",
   "Homework has no effect on student learning at any grade level.",
   [("Some students prefer homework on weekends.", "This is a modest claim about preference."), ("Homework can help students practise skills.", "This is limited and widely supported."), ("Many teachers assign reading homework.", "This is an easily checked fact.")],
   "Absolute claims (“no effect,” “any grade”) need broad, strong evidence because one counterexample can disprove them.", "The bigger the claim, the stronger the evidence it needs.")
mc("theme", "RL.6.2", 7, "In a story, a girl lies to protect her friend; the lie grows, the friendship nearly breaks, and she finally confesses. The friend forgives her. Which theme is developed MOST fully?",
   "Honesty, even when difficult, is necessary for trust between friends.",
   [("Friends should never forgive each other.", "The friend does forgive her."), ("Lying always works out in the end.", "The lie nearly ruins the friendship."), ("Protecting friends is more important than anything.", "The story shows the lie backfired.")],
   "The plot moves from a lie, to consequences, to a confession that restores trust.", "RL.6.2: track how the theme develops through particular details.")
mc("connotation", "L.6.5.c", 7, "A writer wants readers to admire a character who rarely gives up. Which word should the writer choose?",
   "determined", [("stubborn", "Stubborn suggests unreasonable refusal—a negative connotation."), ("pigheaded", "Pigheaded is insulting."), ("inflexible", "Inflexible suggests a weakness.")],
   "Determined has a positive connotation for not giving up.", "Choose words whose feeling matches your purpose.")
err("pronouns", "L.6.1.a", 6, ["Between you and", "I,", "the test was easy."], 1, "me,",
    "Between is a preposition, so it takes the objective case: between you and me.", "After prepositions (between, for, with, to), use me, him, her, us, them.")
mc("commas", "L.6.2.a", 7, "Which sentence correctly uses parentheses to set off nonessential information?",
   "The museum (open since 1985) attracts thousands of visitors.",
   [("The museum (open since 1985 attracts) thousands of visitors.", "The parentheses enclose part of the main sentence."), ("The (museum open since 1985) attracts thousands of visitors.", "The subject is inside the parentheses."), ("The museum open (since 1985) attracts, thousands of visitors.", "The comma and parentheses are misplaced.")],
   "Parentheses go around extra information that could be removed without breaking the sentence.", "Read the sentence without the parentheses—it should still make sense.")
