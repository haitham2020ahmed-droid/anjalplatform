"""
Grade 4 question bank, top-up 1: brings every Grade 4 quiz skill to at least 6 items,
filling the difficulty levels each skill was missing. Original items; reading items use
the existing Grade 4 passages (G4-P1 … G4-P13). Imported after all earlier modules.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

grade(4)

# ================================================================== grammar

# adjectives (has L5) -> L1 L2 L3 L4 L6
mc("adjectives", "L.4.1", 1, "Which word is an adjective? “A shiny bike leaned against the wall.”",
   "shiny", [("bike", "This is a noun."), ("leaned", "This is a verb."), ("wall", "This is a noun.")],
   "“Shiny” describes the bike.", "Adjectives describe nouns: what kind, how many, which one.")
dd("adjectives", "L.4.1", 2, "Choose the adjective that tells HOW MANY: “We saw ____ camels near the road.”",
   "seven", [("brown", "“Brown” tells what kind, not how many."), ("tall", "“Tall” tells what kind."), ("slowly", "This is an adverb.")],
   "“Seven” tells how many camels.", "Number words are adjectives that tell how many.")
mc("adjectives", "L.4.1", 3, "Which sentence uses “a” and “an” correctly?",
   "I ate an apple and a banana.",
   [("I ate a apple and a banana.", "Use “an” before a vowel sound: an apple."),
    ("I ate an apple and an banana.", "Use “a” before a consonant sound: a banana."),
    ("I ate a apple and an banana.", "Both articles are wrong.")],
   "“An” comes before vowel sounds; “a” comes before consonant sounds.", "Say the next word aloud to hear its first sound.")
dd("adjectives", "L.4.1", 4, "Choose the adjective: “That was the ____ storm we have had all year.”",
   "worst", [("baddest", "“Bad” is irregular: bad, worse, worst."), ("most bad", "Use the irregular form “worst.”"), ("worse", "“Worse” compares two; “all year” compares many.")],
   "Comparing more than two, the superlative of “bad” is “worst.”", "good–better–best; bad–worse–worst.")
mc("adjectives", "L.4.1", 6, "Which sentence uses an adjective correctly after the verb “smells”?",
   "The fresh bread smells wonderful.",
   [("The fresh bread smells wonderfully.", "After a linking verb like “smells,” use an adjective, not an adverb."),
    ("The freshly bread smells wonderful.", "“Freshly” is an adverb; a noun needs the adjective “fresh.”"),
    ("The fresh bread smell wonderful.", "“Bread” is singular, so the verb is “smells.”")],
   "“Smells” links the bread to a describing word, so the adjective “wonderful” is correct.",
   "After linking verbs (is, seems, smells, tastes), use adjectives.")

# adverbs (has L4) -> L1 L2 L3 L5 L6
mc("adverbs", "L.4.1", 1, "Which word tells HOW the turtle moved? “The turtle moved slowly across the sand.”",
   "slowly", [("turtle", "This is a noun."), ("moved", "This is the verb."), ("sand", "This is a noun.")],
   "“Slowly” is an adverb that tells how.", "Many adverbs end in -ly.")
dd("adverbs", "L.4.1", 2, "Choose the adverb that tells WHEN: “We will visit the museum ____.”",
   "tomorrow", [("quietly", "This tells how."), ("upstairs", "This tells where."), ("museum", "This is a noun.")],
   "“Tomorrow” tells when.", "Adverbs answer how, when or where.")
mc("adverbs", "L.4.1", 3, "Which word is an adverb that tells WHERE? “The children played outside after lunch.”",
   "outside", [("children", "This is a noun."), ("played", "This is a verb."), ("lunch", "This is a noun.")],
   "“Outside” tells where they played.", "Where-adverbs: here, there, outside, inside, upstairs.")
dd("adverbs", "L.4.1", 5, "Choose the relative adverb: “Nobody knows the reason ____ the bell rang early.”",
   "why", [("where", "“Where” refers to a place."), ("when", "“When” refers to a time."), ("who", "“Who” is a relative pronoun for people.")],
   "“Why” goes with “the reason.”", "Relative adverbs: where (place), when (time), why (reason).")
err("adverbs", "L.4.1", 6, ["Faisal", " ran", " very quick", " to catch the bus."], 2, " very quickly",
    "“Quickly” is the adverb that tells how he ran; “quick” is an adjective.", "Use an adverb to describe a verb.")

# comparatives (has L4) -> L1 L2 L3 L5 L6
dd("comparatives", "L.4.1", 1, "Choose the word: “A whale is ____ than a dolphin.”",
   "bigger", [("biggest", "Use -est to compare three or more."), ("big", "You need a comparing word."), ("more big", "Add -er to short adjectives.")],
   "Comparing two animals uses -er: bigger.", "Two things: -er. Three or more: -est.")
dd("comparatives", "L.4.1", 2, "Choose the word: “Of the three puppies, Coco is the ____.”",
   "smallest", [("smaller", "“Smaller” compares only two."), ("most small", "Add -est to short adjectives."), ("small", "You need a comparing word.")],
   "Comparing three puppies uses -est.", "“Of the three” signals a superlative.")
mc("comparatives", "L.4.1", 3, "Which sentence compares two things correctly?",
   "This puzzle is more difficult than that one.",
   [("This puzzle is difficulter than that one.", "Long adjectives use “more,” not -er."),
    ("This puzzle is most difficult than that one.", "“Most” compares three or more."),
    ("This puzzle is more difficulter than that one.", "Do not use “more” and -er together.")],
   "Long adjectives use “more” to compare two things.", "Long words: more/most. Short words: -er/-est.")
err("comparatives", "L.4.1", 5, ["Today is", " the most hottest", " day", " of the summer."], 1, " the hottest",
    "Use -est OR most, never both: “the hottest.”", "Never double up comparing words.")
mc("comparatives", "L.4.1", 6, "Which sentence uses comparing words correctly?",
   "Huda’s drawing is good, Rami’s is better, and Sami’s is the best.",
   [("Huda’s drawing is good, Rami’s is gooder, and Sami’s is the goodest.", "“Good” is irregular."),
    ("Huda’s drawing is good, Rami’s is better, and Sami’s is the bestest.", "“Best” already means the most good."),
    ("Huda’s drawing is good, Rami’s is more better, and Sami’s is the best.", "Do not add “more” to “better.”")],
   "good → better → best.", "Irregular comparatives must be memorized.")

# fragments and run-ons (has L3 L5) -> L1 L2 L4 L6
tf("fragments-run-ons", "L.4.1", 1, "“Ran to the gate” is a complete sentence.", False,
   "It has no subject: who ran? It is a fragment.", "A sentence needs a subject and a verb.")
mc("fragments-run-ons", "L.4.1", 2, "Which group of words is a fragment?",
   "The girl with the red umbrella.",
   [("The girl opened her red umbrella.", "This has a subject and a verb."),
    ("It started to rain.", "This is complete."),
    ("She stayed dry.", "This is complete.")],
   "There is a subject but no verb, so it is not a complete thought.", "Ask: What did the girl do?")
mc("fragments-run-ons", "L.4.1", 4, "Which is a correct way to fix this run-on? “The power went out we lit candles.”",
   "The power went out. We lit candles.",
   [("The power went out we, lit candles.", "The comma is in the wrong place."),
    ("The power went out, we lit candles.", "A comma alone cannot join two sentences."),
    ("The power went out and, we lit candles.", "The comma belongs before “and.”")],
   "Splitting the run-on into two sentences fixes it.", "Fix run-ons with a period, or a comma and a conjunction.")
mc("fragments-run-ons", "L.4.1", 6, "Which revision fixes the fragment? “When the bell rang. We lined up.”",
   "When the bell rang, we lined up.",
   [("When the bell rang. we lined up.", "The fragment is still separate."),
    ("When the bell rang we. Lined up.", "This creates two fragments."),
    ("The bell. When we lined up.", "This creates new fragments.")],
   "Join the dependent clause to the main clause with a comma.", "A clause starting with “When” needs a main clause.")

# irregular verbs (has L5) -> L1 L2 L3 L4 L6
dd("irregular-verbs", "L.4.1", 1, "Choose the past tense: “Yesterday I ____ to the market.”",
   "went", [("goed", "“Go” is irregular."), ("goes", "This is present tense."), ("going", "This needs a helping verb.")],
   "go → went.", "Irregular verbs change their spelling in the past.")
dd("irregular-verbs", "L.4.1", 2, "Choose the past tense: “Last night Mama ____ a story.”",
   "told", [("telled", "“Tell” is irregular."), ("tells", "This is present tense."), ("tolled", "This is a different word.")],
   "tell → told.", "Say “Yesterday she…” to test.")
match("irregular-verbs", "L.4.1", 3, "Match each verb with its past tense.",
      [("swim", "swam"), ("write", "wrote"), ("sing", "sang"), ("fly", "flew")],
      "These verbs change their vowel in the past tense.", "Many irregular verbs change a vowel.")
dd("irregular-verbs", "L.4.1", 4, "Choose the correct form: “Have you ever ____ a camel?”",
   "ridden", [("rode", "After “have,” use the past participle."), ("rided", "This is not a word."), ("ride", "After “have,” use the past participle.")],
   "have + past participle: have ridden.", "ride → rode → (have) ridden.")
mc("irregular-verbs", "L.4.1", 6, "Which sentence uses irregular verbs correctly?",
   "The bell rang, and the students began to write.",
   [("The bell ringed, and the students began to write.", "ring → rang."),
    ("The bell rang, and the students begun to write.", "“Begun” needs a helping verb."),
    ("The bell rung, and the students began to write.", "“Rung” needs a helping verb.")],
   "rang and began are correct past-tense forms.", "Past tense stands alone; past participles need has/have/had.")

# negatives (has L5) -> L1 L2 L3 L4 L6
mc("negatives", "L.4.1", 1, "Which word is a negative?",
   "never", [("always", "This is positive."), ("often", "This is positive."), ("sometimes", "This is positive.")],
   "“Never” means “not ever.”", "Negatives: no, not, never, nobody, nothing, nowhere.")
dd("negatives", "L.4.1", 2, "Choose the correct word: “I don’t have ____ homework tonight.”",
   "any", [("no", "“Don’t” + “no” is a double negative."), ("none", "This makes a double negative."), ("nothing", "This makes a double negative.")],
   "Use only one negative: “don’t” + “any.”", "One negative per sentence.")
tf("negatives", "L.4.1", 3, "“Nobody never cleans the board” is correct.", False,
   "It has two negatives. Correct: “Nobody ever cleans the board.”", "Change one negative to a positive word.")
dd("negatives", "L.4.1", 4, "Choose the correct word: “There wasn’t ____ in the box.”",
   "anything", [("nothing", "“Wasn’t” + “nothing” is a double negative."), ("nobody", "This is a double negative."), ("none", "This is a double negative.")],
   "“Wasn’t” is negative, so use the positive “anything.”", "After n’t, use any-words.")
err("negatives", "L.4.1", 6, ["We couldn’t find", " our cat", " nowhere", " in the house."], 2, " anywhere",
    "“Couldn’t” is already negative, so “nowhere” must become “anywhere.”", "Look for n’t plus another negative.")

# nouns (has L1) -> L2 L3 L4 L5 L6
mc("nouns", "L.4.1", 2, "Which word names a SPECIFIC river and is a proper noun?",
   "Nile", [("river", "This is a common noun for any river."), ("boat", "This is a common noun."), ("water", "This is a common noun.")],
   "“Nile” names one particular river, so it is capitalized.", "Proper nouns name specific people, places and things.")
ms("nouns", "L.4.1", 3, "Which TWO words are nouns? “The farmer fed the hungry goats.”",
   ["farmer", "goats"], [("fed", "This is a verb."), ("hungry", "This is an adjective.")],
   "A noun names a person, place, thing or idea.", "Test: can you put “the” before it?")
mc("nouns", "L.4.1", 4, "Which word is an abstract noun (an idea or feeling)?",
   "courage", [("helmet", "You can touch a helmet."), ("teacher", "A teacher is a person."), ("garden", "A garden is a place.")],
   "Courage is a quality you cannot see or touch.", "Abstract nouns name ideas and feelings.")
mc("nouns", "L.4.1", 5, "Which word is a collective noun?",
   "flock", [("bird", "This names one animal."), ("feather", "This is a thing."), ("nest", "This is a thing.")],
   "A collective noun names a group: a flock of birds.", "Collective nouns: team, class, family, flock, herd.")
mc("nouns", "L.4.1", 6, "In “Her kindness surprised the whole class,” which words are nouns?",
   "kindness, class", [("kindness, surprised", "“Surprised” is a verb."), ("whole, class", "“Whole” is an adjective."), ("Her, kindness", "“Her” is a pronoun.")],
   "“Kindness” is an abstract noun; “class” is a collective noun.", "Nouns can be people, places, things or ideas.")

# plural nouns (has L2 L4) -> L1 L3 L5 L6
dd("plural-nouns", "L.4.1", 1, "Choose the plural: “I have two ____.”",
   "pencils", [("pencil", "This is singular."), ("pencil’s", "An apostrophe shows ownership."), ("pencilss", "This is misspelled.")],
   "Most nouns add -s to make plurals.", "Add -s to most nouns.")
dd("plural-nouns", "L.4.2", 3, "Choose the plural: “The ____ played in the yard.”",
   "puppies", [("puppys", "Consonant + y: change y to i and add -es."), ("puppy’s", "This shows ownership."), ("puppyes", "Change y to i first.")],
   "puppy → puppies.", "Consonant + y → -ies.")
mc("plural-nouns", "L.4.1", 5, "Which sentence uses plural nouns correctly?",
   "The women gave the children some knives and forks.",
   [("The womans gave the childs some knifes and forks.", "These are irregular plurals."),
    ("The women gave the childrens some knives and forks.", "“Children” is already plural."),
    ("The women gave the children some knifes and forks.", "knife → knives.")],
   "women, children, knives are irregular plurals.", "Learn irregular plurals by heart.")
match("plural-nouns", "L.4.2", 6, "Match each singular noun with its plural.",
      [("mouse", "mice"), ("tooth", "teeth"), ("wolf", "wolves"), ("sheep", "sheep")],
      "These plurals do not just add -s.", "Some plurals change vowels or stay the same.")

# prepositions (has L3) -> L1 L2 L4 L5 L6
mc("prepositions", "L.4.1", 1, "Which word is a preposition? “The ball rolled under the car.”",
   "under", [("ball", "This is a noun."), ("rolled", "This is a verb."), ("car", "This is a noun.")],
   "“Under” shows where the ball rolled.", "Prepositions show position or direction.")
dd("prepositions", "L.4.1", 2, "Choose the preposition: “Put the books ____ the shelf.”",
   "on", [("slowly", "This is an adverb."), ("blue", "This is an adjective."), ("books", "This is a noun.")],
   "“On” shows where to put the books.", "Common prepositions: on, in, under, over, between, behind.")
mc("prepositions", "L.4.1", 4, "What is the object of the preposition? “We walked along the narrow path.”",
   "path", [("along", "This is the preposition."), ("narrow", "This describes the object."), ("walked", "This is the verb.")],
   "The object is the noun after the preposition: path.", "Preposition + (describing words) + noun = phrase.")
ms("prepositions", "L.4.1", 5, "Which TWO are prepositional phrases? “After school, the cat slept beside the window.”",
   ["After school", "beside the window"], [("the cat slept", "This is the subject and verb."), ("slept beside", "This is a verb and preposition only.")],
   "Each phrase starts with a preposition and ends with a noun.", "Find the preposition, then its noun.")
err("prepositions", "L.4.1", 6, ["The keys", " were hidden", " between of", " the cushions."], 2, " between",
    "“Between” is the preposition; “of” is not needed.", "Use one preposition before the object.")

# pronoun homophones (has L2 L3 L4) -> L1 L5 L6
dd("pronoun-homophones", "L.4.1.g", 1, "Choose the correct word: “Is this ____ backpack?”",
   "your", [("you’re", "“You’re” means “you are.”"), ("yore", "This means long ago."), ("youre", "This is misspelled.")],
   "“Your” shows ownership.", "your = belongs to you; you’re = you are.")
err("pronoun-homophones", "L.4.1.g", 5, ["They put", " there coats", " on the hooks", " by the door."], 1, " their coats",
    "The coats belong to them, so use “their.”", "their = belonging to them.")
mc("pronoun-homophones", "L.4.1.g", 6, "Which sentence is correct?",
   "They’re bringing their kites over there.",
   [("Their bringing there kites over they’re.", "All three are wrong."),
    ("There bringing their kites over they’re.", "The first and last are wrong."),
    ("They’re bringing there kites over their.", "The second and last are wrong.")],
   "They’re = they are; their = belonging to them; there = a place.", "Test each word separately.")

# pronouns (has L3 L5) -> L1 L2 L4 L6
mc("pronouns", "L.4.1", 1, "Which pronoun can replace “Sara” in “Sara likes art”?",
   "She", [("He", "“He” is for a boy or man."), ("They", "“They” is plural."), ("It", "“It” is for things.")],
   "Sara is one girl, so “she.”", "Pronouns take the place of nouns.")
dd("pronouns", "L.4.1", 2, "Choose the pronoun: “Mom gave the gift to ____.”",
   "me", [("I", "Use “me” after a verb or preposition."), ("mine", "This shows ownership."), ("myself", "Use only when the subject is also “I.”")],
   "After “to,” use the object pronoun “me.”", "I is a subject; me is an object.")
dd("pronouns", "L.4.1", 4, "Choose the relative pronoun: “The book ____ I borrowed was exciting.”",
   "that", [("who", "“Who” refers to people."), ("whose", "This shows ownership."), ("where", "This is a relative adverb.")],
   "“That” refers to things like the book.", "who = people; which/that = things.")
err("pronouns", "L.4.1", 6, ["Ali and me", " finished", " the puzzle", " together."], 0, "Ali and I",
    "As part of the subject, use “I.” Test: “I finished,” not “me finished.”", "Remove the other person to test.")

# sentences (has L1) -> L2 L3 L4 L5 L6
mc("sentences", "L.4.1", 2, "Which sentence is a command?",
   "Please close the door.", [("The door is closed.", "This is a statement."), ("Is the door closed?", "This is a question."), ("What a heavy door!", "This is an exclamation.")],
   "A command tells someone to do something.", "Commands often begin with a verb.")
dd("sentences", "L.4.1", 3, "Choose the end mark: “What a beautiful sunset____”",
   "!", [(".", "This shows strong feeling, so it needs an exclamation mark."), ("?", "This is not a question."), (",", "A comma cannot end a sentence.")],
   "Exclamations show strong feeling.", "! = strong feeling.")
match("sentences", "L.4.1", 4, "Match each sentence with its type.",
      [("The museum opens at nine.", "Statement"), ("When does the museum open?", "Question"),
       ("Buy the tickets now.", "Command"), ("What an amazing museum!", "Exclamation")],
      "Each type has a purpose and an end mark.", "Look at the end mark and the purpose.")
mc("sentences", "L.4.1", 5, "Which sentence is a statement that ends correctly?",
   "The train leaves at noon.",
   [("The train leaves at noon?", "A statement ends with a period."),
    ("Does the train leave at noon.", "A question ends with a question mark."),
    ("the train leaves at noon.", "Sentences begin with a capital letter.")],
   "A statement tells something and ends with a period.", "Capital letter at the start, period at the end.")
mc("sentences", "L.4.1", 6, "Change the statement into a question: “Laila can speak three languages.”",
   "Can Laila speak three languages?",
   [("Laila can speak three languages?", "Moving the helping verb makes a clearer question."),
    ("Laila can speak, three languages?", "The comma does not belong."),
    ("Can Laila speaks three languages?", "After “can,” use “speak.”")],
   "Move the helping verb “can” to the front to form a question.", "Questions often start with a helping verb.")

# subject-verb agreement (has L3 L6) -> L1 L2 L4 L5
dd("subject-verb-agreement", "L.4.1", 1, "Choose the verb: “The dog ____ at the mail carrier.”",
   "barks", [("bark", "One dog needs “barks.”"), ("barking", "This needs a helping verb."), ("are barking", "“Are” does not agree with one dog.")],
   "One dog → barks.", "Singular subject → verb with -s.")
dd("subject-verb-agreement", "L.4.1", 2, "Choose the verb: “My brothers ____ football every Friday.”",
   "play", [("plays", "“Brothers” is plural."), ("is playing", "“Is” does not agree with “brothers.”"), ("has played", "“Has” does not agree with “brothers.”")],
   "Plural subject → no -s: play.", "Plural subject → verb without -s.")
dd("subject-verb-agreement", "L.4.1", 4, "Choose the verb: “The plates on the shelf ____ clean.”",
   "are", [("is", "The subject is “plates,” not “shelf.”"), ("was", "“Was” does not agree with “plates.”"), ("has been", "“Has” does not agree with “plates.”")],
   "“On the shelf” does not change the subject; “plates” is plural, so “are.”", "Cover the prepositional phrase to find the real subject.")
mc("subject-verb-agreement", "L.4.1", 5, "Which sentence has correct agreement?",
   "Either my aunt or my uncle drives us to school.",
   [("Either my aunt or my uncle drive us to school.", "With “or,” the verb agrees with the nearer subject (uncle)."),
    ("Either my aunt or my uncle are driving us to school.", "“Are” does not agree with “uncle.”"),
    ("Either my aunt or my uncle have driven us.", "“Have” does not agree with “uncle.”")],
   "With “either … or,” the verb agrees with the nearer subject: uncle drives.", "or/nor: match the closest subject.")

# verb tenses (has L3 L4) -> L1 L2 L5 L6
dd("verb-tenses", "L.4.1", 1, "Choose the FUTURE tense: “Tomorrow we ____ the zoo.”",
   "will visit", [("visited", "This is past tense."), ("visit", "This is present tense."), ("visiting", "This needs a helping verb.")],
   "“Will” + verb shows the future.", "Future = will + verb.")
mc("verb-tenses", "L.4.1", 2, "Which sentence is in the PAST tense?",
   "We painted the fence yesterday.",
   [("We paint the fence today.", "This is present."), ("We will paint the fence tomorrow.", "This is future."), ("We are painting the fence now.", "This is present progressive.")],
   "“Painted” and “yesterday” show the past.", "Time words help show tense.")
dd("verb-tenses", "L.4.1", 5, "Choose the verb (present progressive): “Look! The bus ____ right now.”",
   "is leaving", [("left", "This is past."), ("will leave", "This is future."), ("was leaving", "This is past progressive.")],
   "“Right now” shows an action happening now: is leaving.", "Present progressive = am/is/are + -ing.")
err("verb-tenses", "L.4.1", 6, ["Yesterday", " we walk", " to the park", " and fed the ducks."], 1, " we walked",
    "“Yesterday” and “fed” show the past, so “walk” must be “walked.”", "Keep verb tenses consistent.")

# verbs (has L4) -> L1 L2 L3 L5 L6
mc("verbs", "L.4.1", 1, "Which word is an action verb? “The baby giggled at the clown.”",
   "giggled", [("baby", "This is a noun."), ("clown", "This is a noun."), ("at", "This is a preposition.")],
   "“Giggled” shows an action.", "Action verbs show what someone does.")
mc("verbs", "L.4.1", 2, "Which word is a linking verb? “The soup is hot.”",
   "is", [("soup", "This is a noun."), ("hot", "This is an adjective."), ("The", "This is an article.")],
   "“Is” links the soup to the word that describes it.", "Linking verbs: am, is, are, was, were, seem, become.")
dd("verbs", "L.4.1", 3, "Choose the helping verb: “The students ____ finished their projects.”",
   "have", [("has", "“Students” is plural."), ("is", "“Is finished” changes the meaning."), ("having", "This is not a complete verb.")],
   "“Have finished” is a verb phrase with a helping verb.", "Helping verbs: have, has, had, is, are, will, can.")
mc("verbs", "L.4.1", 5, "Which modal verb shows possibility? “It ____ rain this afternoon.”",
   "might", [("must", "“Must” shows something required or certain."), ("will", "“Will” sounds certain, not possible."), ("shall", "“Shall” is used for offers and plans.")],
   "“Might” shows something possible but not certain.", "might/may = possible; must = required.")
ms("verbs", "L.4.1", 6, "Which TWO words are verbs? “Huda seemed tired, so she rested.”",
   ["seemed", "rested"], [("tired", "This is an adjective."), ("so", "This is a conjunction.")],
   "“Seemed” is a linking verb; “rested” is an action verb.", "Find every word that shows action or links.")

# ================================================================= language

# capitalization (has L1 L2) -> L3 L4 L5 L6
mc("capitalization", "L.4.2.a", 3, "Which sentence is capitalized correctly?",
   "On Friday, we visited the Red Sea Museum.",
   [("On friday, we visited the Red Sea Museum.", "Days are capitalized."),
    ("On Friday, we visited the red sea museum.", "Names of places are capitalized."),
    ("on Friday, we visited the Red Sea Museum.", "The first word is capitalized.")],
   "Capitalize days, names of places and the first word.", "Proper nouns get capitals.")
mc("capitalization", "L.4.2.a", 4, "Which title is capitalized correctly?",
   "The Boy Who Planted Trees",
   [("The boy who planted trees", "Important words in a title are capitalized."),
    ("The Boy who Planted trees", "“Trees” is an important word."),
    ("the Boy Who Planted Trees", "The first word is always capitalized.")],
   "Capitalize the first word and the important words in a title.", "Short words like “a” and “of” stay lowercase unless first.")
mc("capitalization", "L.4.2.a", 5, "Which sentence capitalizes a family title correctly?",
   "Yesterday Grandma told us a story.",
   [("Yesterday grandma told us a story.", "Used as a name, “Grandma” is capitalized."),
    ("Yesterday my Grandma told us a story.", "After “my,” it is not a name, so it stays lowercase."),
    ("yesterday Grandma told us a story.", "The first word is capitalized.")],
   "Family titles used as names are capitalized; after “my” they are not.", "Test: can you replace it with a name?")
err("capitalization", "L.4.2.a", 6, ["My cousin", " moved to", " dammam", " in August."], 2, " Dammam",
    "City names are proper nouns and need capital letters.", "Capitalize the names of cities and countries.")

# commas (has L3) -> L2 L4 L5 L6 L7
mc("commas", "L.4.2", 2, "Which sentence uses commas in a list correctly?",
   "We bought dates, figs, and grapes.",
   [("We bought dates figs and grapes.", "Commas separate items in a list."),
    ("We bought, dates, figs, and grapes.", "No comma after “bought.”"),
    ("We bought dates, figs, and, grapes.", "No comma after “and.”")],
   "Commas separate three or more items in a series.", "Use commas between items in a list.")
mc("commas", "L.4.2", 4, "Which sentence uses a comma after an introductory word correctly?",
   "Yes, I would like some tea.",
   [("Yes I would like, some tea.", "The comma belongs after “Yes.”"),
    ("Yes I, would like some tea.", "The comma is misplaced."),
    ("Yes I would like some tea", "A comma and a period are needed.")],
   "Use a comma after an introductory word such as yes, no or well.", "Pause words at the start get a comma.")
mc("commas", "L.4.2", 5, "Which sentence uses a comma in direct address correctly?",
   "Fatima, please hand me the ruler.",
   [("Fatima please, hand me the ruler.", "The comma goes right after the name."),
    ("Fatima please hand me the ruler.", "A comma is needed after the name."),
    ("Fatima, please hand, me the ruler.", "There is an extra comma.")],
   "Use a comma to set off the name of the person being spoken to.", "Name + comma when you speak to someone.")
err("commas", "L.4.2", 6, ["On March 3", " 2026", " the new library", " opened its doors."], 0, "On March 3,",
    "A comma goes between the day and the year in a date.", "Dates: month day, year.")
mc("commas", "L.4.2", 7, "Which sentence uses ALL commas correctly?",
   "Well, Rania, we need flour, eggs, and milk before Tuesday, March 12.",
   [("Well Rania, we need flour, eggs, and milk before Tuesday March 12.", "Commas are missing after “Well” and “Tuesday.”"),
    ("Well, Rania we need flour eggs, and milk before Tuesday, March 12.", "Commas are missing after “Rania” and “flour.”"),
    ("Well, Rania, we need, flour, eggs, and milk before Tuesday, March 12.", "No comma after “need.”")],
   "Commas follow the introductory word, set off the name, separate list items and separate the day from the date.", "Check each comma rule one at a time.")

# quotations and dialogue (has L4) -> L2 L3 L5 L6 L7
mc("quotations-dialogue", "L.4.2.b", 2, "Which words should be inside quotation marks? Majed said I love reading.",
   "I love reading", [("Majed said", "These words tell who is speaking."), ("Majed said I love reading", "Only the spoken words go in quotation marks."), ("said I", "This splits the speaker’s words.")],
   "Quotation marks go around the exact words someone says.", "Put only the spoken words inside.")
mc("quotations-dialogue", "L.4.2.b", 3, "Which sentence is punctuated correctly?",
   "“Let’s go to the beach,” said Hessa.",
   [("“Let’s go to the beach” said Hessa.", "A comma is needed before the closing quotation mark."),
    ("Let’s go to the beach, said Hessa.", "Quotation marks are missing."),
    ("“Let’s go to the beach”, said Hessa.", "The comma belongs inside the quotation marks.")],
   "The comma goes inside the closing quotation marks.", "Comma, then closing quotation mark.")
mc("quotations-dialogue", "L.4.2.b", 5, "Which question is punctuated correctly?",
   "“Where is my notebook?” asked Saad.",
   [("“Where is my notebook,” asked Saad.", "The quotation is a question, so it needs a question mark."),
    ("“Where is my notebook”? asked Saad.", "The question mark goes inside."),
    ("Where is my notebook? asked Saad.", "Quotation marks are missing.")],
   "A question mark that belongs to the quotation goes inside the quotation marks.", "The end mark stays with the spoken words.")
err("quotations-dialogue", "L.4.2.b", 6, ["Mr. Saleh said, ", "“please line up quietly.”"], 1, "“Please line up quietly.”",
    "The first word of a quotation that is a complete sentence is capitalized.", "Start quotations with a capital letter.")
order("quotations-dialogue", "L.4.2.b", 7, "Put the pieces in order to make a correctly punctuated sentence.",
      ["“After lunch,”", "said Coach,", "“we will practice passing.”"],
      "The speaker tag interrupts the quotation and is set off by commas.", "Interrupted quotation: “part one,” tag, “part two.”")

# ================================================================== reading
# passages: P1 Kite Repair, P2 Nature's Engineers, P3 Our School Needs a Garden, P4 Night Rain,
# P5 The Missing Map, P6 Stick Bridge, P7 Pearl Diver's Daughter, P8 Honeybees, P9 Dripping Taps,
# P10 Clay Oven, P11 Rain on the Roof, P12 Bees in the Mountains

# author's claim (has L2 L4 L5 L7) -> L3 L6
mc("author-claim", "RI.4.8", 3, "Which sentence from “Our School Needs a Garden” states the author’s claim?",
   "“Our school should turn the empty lot behind the library into a vegetable garden.”",
   [("“Learning by doing helps facts stick.”", "This supports a reason; it is not the main claim."),
    ("“Each class could care for its own bed.”", "This is a detail about teamwork."),
    ("“The empty lot is wasted space right now.”", "This is a supporting point in the conclusion.")],
   "The first sentence tells exactly what the author wants the school to do.", "The claim is often in the first sentence.", "G4-P3")
mc("author-claim", "RI.4.8", 6, "Which piece of evidence would make the garden argument STRONGER?",
   "A survey showing students ate more vegetables after a nearby school started a garden",
   [("A picture of the author’s favorite flower", "This is personal and does not prove a reason."),
    ("A list of all the classes in the school", "This does not support any reason."),
    ("A sentence saying gardens are pretty", "This is an opinion, not evidence.")],
   "Real data that matches one of the author’s reasons strengthens the claim.", "Facts and data are stronger than opinions.", "G4-P3")

# author's perspective (has L6) -> L2 L3 L4 L5 L7
mc("author-perspective", "RI.4.6", 2, "How does the author of “Our School Needs a Garden” feel about the empty lot?",
   "It is being wasted.", [("It should stay empty.", "The author wants to change it."), ("It is too small for anything.", "The author plans a garden there."), ("It is the best part of the school.", "The author calls it “wasted space.”")],
   "The author calls it “wasted space right now.”", "Look for words that show feelings.", "G4-P3")
mc("author-perspective", "RI.4.6", 3, "Which word in “The Dripping Taps” shows how the author first viewed the problem?",
   "worrying", [("bright", "This describes the signs."), ("full", "This describes the cup."), ("lower", "This describes the bill.")],
   "The students “noticed something worrying,” which shows concern.", "Authors reveal their view through word choice.", "G4-P9")
tf("author-perspective", "RI.4.8", 4, "The author of “Nature’s Engineers” thinks beavers only cause problems.", False,
   "The author admits dams can flood roads but says many scientists think benefits are greater.",
   "Check whether the author presents more than one side.", "G4-P2")
mc("author-perspective", "RI.4.8", 5, "How does the author of “Nature’s Engineers” show a balanced point of view?",
   "By mentioning that dams can flood roads, then explaining why scientists still value beavers",
   [("By saying beavers are dangerous to people", "The text does not say this."),
    ("By describing only how beavers build lodges", "That would show only one side."),
    ("By telling a story about one beaver", "The article is not a story.")],
   "The last paragraph admits problems and weighs them against benefits.", "Balanced writing presents more than one side.", "G4-P2")
mc("author-perspective", "RI.4.6", 7, "How does the author of “The Dripping Taps” show the students’ success instead of just giving an opinion?",
   "By reporting results that were checked: the taps stopped dripping and the water bill was lower.",
   [("By saying the students were the best class in the school", "This is an opinion the text does not state."),
    ("By describing the colors of the signs", "Sign colors do not show success."),
    ("By telling the reader to save water at home", "The author reports events rather than giving commands.")],
   "The author points to evidence collected “a month later,” which shows a reporting point of view.", "Notice whether an author proves a point with facts or with opinions.", "G4-P9")

# author's purpose (has L6) -> L2 L3 L4 L5 L7
mc("author-purpose", "RI.4.6", 2, "What is the author’s main purpose in “Baking Bread in a Clay Oven”?",
   "To explain how bread is baked in a clay oven", [("To persuade readers to buy bread", "The text explains; it does not persuade."), ("To tell a funny story about a baker", "There is no story or humor."), ("To compare clay ovens with metal ones", "Metal ovens are not mentioned.")],
   "The article walks through the steps of baking.", "Ask: Is the author informing, persuading or entertaining?", "G4-P10")
mc("author-purpose", "RI.4.6", 3, "Why did the author write “Our School Needs a Garden”?",
   "To persuade the school to build a garden", [("To teach readers how to grow tomatoes", "Growing steps are not explained."), ("To entertain with a garden adventure", "It is not a story."), ("To describe a garden that already exists", "The garden does not exist yet.")],
   "The author gives reasons why the school “should” build a garden.", "“Should” often signals persuasion.", "G4-P3")
mc("author-purpose", "RI.4.6", 4, "Why does the author of “How Honeybees Share Directions” explain how scientists studied bees?",
   "To show readers how we know about the bee dances", [("To convince readers to become scientists", "The article does not persuade."), ("To describe the colors of glass", "Glass color is not mentioned."), ("To explain how honey is sold", "Selling honey is not mentioned.")],
   "The last paragraph explains the source of the information.", "Authors include details for a reason.", "G4-P8")
mc("author-purpose", "RI.4.6", 5, "Why does the author of “Nature’s Engineers” use headings?",
   "To organize information so readers can find each part easily", [("To make the article longer", "Headings organize; they do not add length for its own sake."), ("To tell the reader what to believe", "Headings name topics."), ("To show the beaver’s point of view", "Headings are not narration.")],
   "Headings like “Building a Dam” divide the article into topics.", "Text features support the author’s purpose.", "G4-P2")
mc("author-purpose", "RI.4.6", 7, "The author of “The Dripping Taps” ends with: “a small problem, noticed and measured, can lead to a big change.” What purpose does this ending serve?",
   "To share a lesson readers can use in their own lives",
   [("To list the steps the students took", "The steps were already given."),
    ("To introduce a new problem", "The article is ending."),
    ("To describe the plumber’s job", "The plumber is not the focus.")],
   "The final sentence turns the event into a general lesson.", "Endings often show the author’s deeper purpose.", "G4-P9")

# cause and effect (has L3 L5) -> L2 L4 L6 L7
mc("cause-effect", "RI.4.3", 2, "In “The Dripping Taps,” what CAUSED the cup to fill?",
   "Water dripped from the tap.", [("The students drank the water.", "No one drank it."), ("The plumber poured water in.", "The plumber fixed the taps later."), ("Rain fell into the cup.", "The cup was inside.")],
   "The dripping tap slowly filled the cup.", "A cause is why something happens.", "G4-P9")
mc("cause-effect", "RI.4.3", 4, "What was one EFFECT of the class’s signs?",
   "More students turned off the water while soaping.", [("The taps started dripping again.", "The taps were fixed."), ("The principal wrote a letter.", "The students wrote the letter."), ("The cup was placed under the tap.", "That happened before the signs.")],
   "Teachers noticed more students turning off the water.", "An effect is what happens because of a cause.", "G4-P9")
match("cause-effect", "RI.4.3", 6, "Match each cause with its effect.",
      [("The beaver dam slows the stream", "A deep, calm pond forms"), ("The lodge entrances are underwater", "Predators cannot easily reach the family"),
       ("A pond is the only water for miles", "Deer and birds travel to drink there")],
      "Each effect in the article is caused by something beavers build.", "Look for signal words: because, so, as a result.", passage="G4-P2")
mc("cause-effect", "RI.4.3", 7, "In “Baking Bread in a Clay Oven,” why must the oven walls be very hot before the dough is added?",
   "The bread bakes on the hot wall in only a few minutes.",
   [("Hot walls help the dough rise under the cloth.", "The dough rises before it goes in the oven."),
    ("Hot walls make the clay oven stronger.", "The text does not say this."),
    ("Hot walls keep insects away from the bread.", "This is not mentioned.")],
   "The bread is pressed onto the wall and puffs up after a few minutes, which needs a very hot surface.", "Connect a step to its result.", "G4-P10")

# central idea (has L3) -> L2 L4 L5 L6 L7
mc("central-idea", "RI.4.2", 2, "What is the main idea of “Keeping Bees in the Mountains”?",
   "Mountain families carefully keep bees and collect honey.", [("Honey is sold at markets.", "This is a detail."), ("Smoke calms bees.", "This is a detail."), ("Sidr trees grow in mountains.", "This is a detail.")],
   "Every paragraph tells about how the families keep bees and make honey.", "The main idea covers the whole text.", "G4-P12")
mc("central-idea", "RI.4.2", 4, "Which detail BEST supports the main idea of “How Honeybees Share Directions”?",
   "The direction of the waggle tells bees which way to fly.", [("Bees live in colonies.", "This is background."), ("Hives can have glass walls.", "This is about scientists."), ("Bees need food.", "This is general.")],
   "This detail directly explains how bees share directions.", "Supporting details explain the main idea.", "G4-P8")
mc("central-idea", "RI.4.2", 5, "What is the central idea of “The Dripping Taps”?",
   "Students noticed water being wasted and took steps that saved water.", [("Plumbers fix taps.", "This is one detail."), ("Signs should be bright.", "This is a detail."), ("Principals read letters.", "This is a detail.")],
   "The text follows the problem, the actions and the result.", "Ask: What is the whole article mostly about?", "G4-P9")
ms("central-idea", "RI.4.2", 6, "Which TWO details support the main idea of “Nature’s Engineers”?",
   ["Beavers pile sticks, rocks and mud to build dams.", "Beaver ponds give frogs, ducks and fish a home."],
   [("Wolves are predators.", "This is a detail about wolves, not beavers’ engineering."), ("Some roads flood.", "This is a problem, not the main idea.")],
   "The main idea is that beavers change the land and help other living things.", "Supporting details connect to the main idea.", "G4-P2")
mc("central-idea", "RI.4.2", 7, "Which sentence would BEST end a summary of the central idea of “Baking Bread in a Clay Oven”?",
   "Each careful step turns simple ingredients into warm, golden bread.",
   [("The basket is the most important tool.", "The basket is a small detail."),
    ("Clay ovens are found only in villages.", "The text does not say “only.”"),
    ("Bakers wake up early.", "This is a detail, not the central idea.")],
   "It captures the whole process from ingredients to finished bread.", "A central idea ties all the steps together.", "G4-P10")

# character (has L2 L4 L5) -> L3 L6 L7
mc("character", "RL.4.3", 3, "Which word BEST describes Omar in “The Stick Bridge”?",
   "helpful", [("lazy", "He looks for solutions."), ("mean", "He helps his sister."), ("careless", "He notices the crack.")],
   "Omar points out the crack and suggests triangles.", "Use actions to describe a character.", "G4-P6")
mc("character", "RL.4.3", 6, "How does Noura change from the flashback to the present in “The Pearl Diver’s Daughter”?",
   "She stops fearing the sea but starts fearing time without her father.",
   [("She stops loving her father.", "She clearly loves him."),
    ("She becomes afraid of the stars.", "She plans to count the stars."),
    ("She decides to go pearling.", "She stays on shore.")],
   "At five the waves frightened her; at ten she fears “the empty months without him.”", "Compare a character at two times.", "G4-P7")
mc("character", "RL.4.3", 7, "What does the grandmother’s way of helping in “The Kite Repair” show about her?",
   "She teaches by working alongside Omar instead of simply fixing it for him.",
   [("She thinks Omar is too young to help.", "They patch the kite together."),
    ("She does not care about the festival.", "She helps him get ready for it."),
    ("She prefers new kites to old ones.", "She says fixed kites fly better.")],
   "She brings tape and tissue paper, shares a memory, and they patch the kite “together.”", "A character’s methods reveal their values.", "G4-P1")

# compare and contrast: text structure (has L5) -> L2 L3 L4 L6 L7
mc("compare-contrast", "RI.4.5", 2, "Which signal words show compare and contrast?",
   "both, however, unlike", [("first, next, finally", "These show sequence."), ("because, so, as a result", "These show cause and effect."), ("the problem, the solution", "These show problem and solution.")],
   "Compare-contrast texts use words that show likenesses and differences.", "Learn the signal words for each structure.")
mc("compare-contrast", "RI.4.5", 3, "In “How Honeybees Share Directions,” how are the waggle dance and the round dance DIFFERENT?",
   "The waggle dance is for far food; the round dance is for nearby food.",
   [("Both dances are for food that is very far away.", "The round dance is for nearby food."),
    ("Only the round dance happens inside the hive.", "Both happen in the hive."),
    ("The waggle dance is done by scientists.", "Bees do the dances.")],
   "The article contrasts when each dance is used.", "Contrast = how things are different.", "G4-P8")
tf("compare-contrast", "RI.4.5", 4, "The last paragraph of “Nature’s Engineers” contrasts the problems beavers cause with their benefits.", True,
   "It says dams can flood roads, but scientists argue the benefits are greater.", "“However” often signals a contrast.", "G4-P2")
match("compare-contrast", "RI.4.5", 6, "Match each description of a text with the structure it would use.",
      [("Steps for baking bread, from mixing to serving", "Sequence"), ("Students find wasted water and fix it", "Problem and solution"),
       ("Details about how bees dance", "Description"), ("How two kinds of dances are alike and different", "Compare and contrast")],
      "Each structure fits a different kind of information.", "Ask how the information would best be organized.")
mc("compare-contrast", "RI.4.5", 7, "Why might an author use a compare-and-contrast structure to write about beaver dams?",
   "To show the benefits of dams alongside the problems they cause",
   [("To list the steps for building a dam in order", "That would be sequence."),
    ("To tell a story about one beaver family", "That would be narrative."),
    ("To describe only what a lodge looks like", "That would be description.")],
   "Comparing benefits and problems helps readers weigh both sides.", "Structure should match the author’s purpose.", "G4-P2")

# drama elements (has L2 L3) -> L1 L4 L5 L6
mc("drama-elements", "RL.4.5", 1, "In a play, what is the list of characters called?",
   "the cast", [("the stanza", "Stanzas are in poems."), ("the chapter", "Chapters are in books."), ("the caption", "Captions go with pictures.")],
   "Plays begin with a cast list (CHARACTERS).", "Drama words: cast, scene, dialogue, stage directions.", "G4-P5")
mc("drama-elements", "RL.4.5", 4, "What does the stage direction “(KARIM paces back and forth)” show?",
   "Karim is nervous and restless.", [("Karim is calm and relaxed.", "Pacing shows worry."), ("Karim is lost in the dark.", "It is noon."), ("Karim is looking for the ranger.", "He is waiting while Layla thinks.")],
   "Pacing back and forth often shows worry.", "Stage directions show feelings through actions.", "G4-P5")
mc("drama-elements", "RL.4.5", 5, "How is “The Missing Map” different from a story about the same events?",
   "It is told through dialogue and stage directions instead of a narrator.",
   [("It has no characters.", "It has three characters."),
    ("It has no problem.", "The missing map is the problem."),
    ("It rhymes like a poem.", "The play does not rhyme.")],
   "Plays show events through what characters say and do on stage.", "Drama: dialogue + stage directions.", "G4-P5")
mc("drama-elements", "RL.4.5", 6, "Why does Ms. Hassan enter near the END of the play?",
   "To show that Layla solved the problem before any adult arrived",
   [("To find the map for them", "She does not find the map."),
    ("To tell them they took the wrong trail", "She praises their calm thinking."),
    ("To start a new problem", "Her arrival ends the problem.")],
   "Her late entrance lets her praise Layla’s “calm head.”", "Think about why a character enters at a certain moment.", "G4-P5")

# imagery (has L6) -> L2 L3 L4 L5 L7
mc("imagery", "RL.4.4", 2, "Which words from “Night Rain” help you HEAR the rain?",
   "“tapping on my roof”", [("“blurry moons”", "This is something you see."), ("“my blanket to my chin”", "This is something you feel."), ("“a shining stream”", "This is something you see.")],
   "Tapping is a sound.", "Imagery can appeal to hearing.", "G4-P4")
mc("imagery", "RL.4.4", 3, "In “Night Rain,” what are the “blurry moons”?",
   "The street lamps seen through the rain", [("Real moons in the sky", "There is only one moon; the lamps are being described."), ("Puddles on the ground", "The puddles “hold the sleeping sky.”"), ("Raindrops on the window", "The lamps are the “moons.”")],
   "“The lamps are blurry moons” compares the lamps to moons.", "Read the whole line to see what is being compared.", "G4-P4")
tf("imagery", "RL.4.4", 4, "“The bread puffs up and turns golden brown” helps the reader picture the bread baking.", True,
   "You can see the bread rising and changing color.", "Imagery helps you see changes.", "G4-P10")
mc("imagery", "RL.4.4", 5, "Which sense does “I pull my blanket to my chin” appeal to?",
   "touch", [("taste", "Nothing is tasted."), ("smell", "Nothing is smelled."), ("hearing", "This line is about feeling the blanket.")],
   "You can feel the blanket being pulled up.", "Ask which sense the words use.", "G4-P4")
mc("imagery", "RL.4.4", 7, "How does the imagery in the last stanza of “Night Rain” change the feeling of the poem?",
   "It makes the rain feel gentle and comforting as the speaker falls asleep.",
   [("It makes the rain feel loud and frightening.", "The rain is “singing me to sleep.”"),
    ("It shows that the rain has stopped.", "The speaker still listens to the beat."),
    ("It describes a sunny morning.", "It is still night.")],
   "Images like “singing me to sleep” and “soft and silver feet” create a cozy, peaceful feeling.", "Notice how images in the final stanza shape the mood.", "G4-P4")

# inference (has L6) -> L2 L3 L4 L5 L7
mc("inference", "RL.4.1", 2, "Why does Omar kick a stone in “The Kite Repair”?",
   "He is upset that his kite is ruined.", [("He wants to play football.", "Nothing suggests a game."), ("He is happy about the festival.", "He says “It’s ruined.”"), ("He is cleaning the garden.", "He is not cleaning.")],
   "Kicking a stone right after saying “It’s ruined” shows frustration.", "Actions show feelings.", "G4-P1")
mc("inference", "RL.4.1", 3, "What can you infer about Layla in “The Missing Map”?",
   "She stays calm and thinks carefully under pressure.", [("She is afraid of the forest.", "She sits and studies the sign calmly."), ("She doesn’t care about getting lost.", "She works hard to find the way."), ("She knows the trail by heart.", "She has to figure it out.")],
   "She sits on a rock, studies the sign, and uses the sun and the lake.", "Combine clues to understand a character.", "G4-P5")
tf("inference", "RL.4.1", 4, "In “The Pearl Diver’s Daughter,” the white shell will help Noura feel close to her father.", True,
   "He says she will “hear the sea that is carrying me home.”", "Use what characters say to make inferences.", "G4-P7")
mc("inference", "RI.4.1", 5, "Based on “The Dripping Taps,” what can you infer about Mrs. Hassan?",
   "She took the students’ letter seriously.", [("She ignored the problem.", "A plumber came to fix the taps."), ("She was angry with the class.", "Nothing shows anger."), ("She fixed the taps herself.", "A plumber fixed them.")],
   "After the letter, “the school asked a plumber to fix the leaking taps.”", "Inferences use text evidence.", "G4-P9")
mc("inference", "RL.4.1", 7, "In “The Kite Repair,” why does Omar know “the patch was the strongest part of all”?",
   "Because fixing it taught him how the kite works, just as his grandmother said",
   [("Because the patch was made of metal", "It was made of tissue paper and bamboo."),
    ("Because his grandmother told him the color was best", "Color is not mentioned."),
    ("Because the patch fell off", "It held during the gusty wind.")],
   "The kite flew steadily in strong wind, proving his grandmother’s idea about fixing things.", "Connect the ending to earlier dialogue.", "G4-P1")

# plot events (has L3 L4) -> L2 L5 L6 L7
mc("plot-events", "RL.4.3", 2, "What happens FIRST in “The Missing Map”?",
   "Layla finds that the map is gone.", [("Ms. Hassan enters.", "She enters near the end."), ("Layla studies the sign.", "This happens after the map is missing."), ("Karim stops pacing.", "This happens later.")],
   "The play opens with Layla turning her backpack upside down.", "Track events from beginning to end.", "G4-P5")
mc("plot-events", "RL.4.3", 5, "What is the turning point in “The Kite Repair”?",
   "Omar and his grandmother patch the kite and lengthen its tail.",
   [("The wind pushes the kite into the tree.", "This starts the problem."),
    ("Omar kicks a stone.", "This shows his feelings."),
    ("The festival is in two days.", "This is background.")],
   "Fixing the kite changes the direction of the story.", "The turning point changes things for the better or worse.", "G4-P1")
order("plot-events", "RL.4.5", 6, "Put these events from “The Pearl Diver’s Daughter” in the order they are TOLD.",
      ["Noura walks down to the shore.", "Her father asks about her first trip to the shore.", "Noura remembers being five.",
       "Her father gives her a white shell.", "The dhow sails away."],
      "The flashback is told in the middle of the story.", "Order of telling can differ from order of happening.", "G4-P7")
mc("plot-events", "RL.4.3", 7, "Why does the author have the bridge break on Tuesday night instead of during the contest?",
   "So Maya and Omar have time to fix it, which leads to a successful ending.",
   [("So the contest can be canceled", "The contest still happens."),
    ("So the teacher can build a new bridge", "The children fix it themselves."),
    ("So Maya can quit the contest", "She enters and succeeds.")],
   "A break before the contest creates a problem that can still be solved in time.", "Authors place events in an order that builds the plot.", "G4-P6")

# poetry elements (has L2 L3) -> L1 L4 L5 L6
mc("poetry-elements", "RL.4.5", 1, "How many lines are in each stanza of “Rain on the Roof”?",
   "four", [("two", "Count the lines in one group."), ("eight", "Eight is the total for the whole poem."), ("six", "Each group has four lines.")],
   "The poem has two stanzas of four lines each.", "A stanza is a group of lines; count one group.", "G4-P11")
mc("poetry-elements", "RL.4.5", 4, "Which lines in “Rain on the Roof” rhyme?",
   "begins / pins", [("roof / rain", "These do not rhyme."), ("clouds / road", "These do not rhyme."), ("glass / slip", "These do not rhyme.")],
   "“Begins” and “pins” end with the same sound.", "Rhyming words often end lines.", "G4-P11")
mc("poetry-elements", "RL.4.5", 5, "What is the rhyme pattern of the first stanza of “Night Rain”?",
   "Lines 2 and 4 rhyme (slow/below).", [("Every line rhymes.", "“roof” and “drops” do not rhyme."), ("No lines rhyme.", "“slow” and “below” rhyme."), ("Lines 1 and 2 rhyme.", "“roof” and “slow” do not rhyme.")],
   "“Slow” (line 2) and “below” (line 4) rhyme.", "Mark the last word of each line to find the pattern.", "G4-P4")
mc("poetry-elements", "RL.4.5", 6, "How is “Night Rain” organized?",
   "in short lines grouped into stanzas, with some rhyming line endings",
   [("in paragraphs with dialogue", "That describes a story."), ("as a numbered list of steps", "That describes instructions."), ("as a play with a cast list", "That describes a drama.")],
   "Poems are organized in lines and stanzas, often with rhyme.", "Notice the shape of a text on the page.", "G4-P4")

# point of view (has L3) -> L2 L4 L5 L6 L7
mc("point-of-view", "RL.4.6", 2, "Which sentence is written in FIRST person?",
   "I climbed the tall tree.", [("She climbed the tall tree.", "This is third person."), ("They climbed the tall tree.", "This is third person."), ("He climbed the tall tree.", "This is third person.")],
   "First person uses I, me, my, we.", "First person: I/we. Third person: he/she/they.")
mc("point-of-view", "RL.4.6", 4, "From what point of view is “Night Rain” told?",
   "First person: the speaker uses “I” and “my.”", [("Third person: a narrator describes others.", "The speaker says “I pull my blanket.”"), ("Second person: “you” is used.", "“You” is not used."), ("From the rain’s point of view.", "The rain is described, not speaking.")],
   "“I pull my blanket to my chin” shows first person.", "Look for pronouns.", "G4-P4")
tf("point-of-view", "RL.4.6", 5, "“The Pearl Diver’s Daughter” is told in third person.", True,
   "The narrator uses “she” and “her” for Noura.", "Third person uses he, she and they.", "G4-P7")
mc("point-of-view", "RL.4.6", 6, "If “The Kite Repair” were told by the grandmother in first person, what would readers learn?",
   "Her own memories and thoughts about fixing kites",
   [("Omar’s secret thoughts", "A first-person grandmother would not know them for sure."),
    ("Nothing different", "Her thoughts would be shared."),
    ("Why the wind blew", "The narrator change would not explain the wind.")],
   "A first-person narrator shares their own thoughts and memories.", "Narrator choice changes what we know.", "G4-P1")
mc("point-of-view", "RL.4.6", 7, "How would “The Missing Map” feel different if it were told by Karim as a first-person story?",
   "Readers would hear how worried Karim felt while Layla was thinking.",
   [("Layla would no longer be in the story.", "She would still be in it."),
    ("The map would be found in the backpack.", "Events would not change."),
    ("It would become a poem.", "Changing narrator does not change form.")],
   "Karim paces nervously; as narrator he could tell his feelings directly.", "Imagine the story through another character’s eyes.", "G4-P5")

# text evidence (has L4 L5) -> L2 L3 L6 L7
mc("text-evidence", "RL.4.1", 2, "Which sentence from “The Stick Bridge” shows that the bridge succeeded?",
   "“The bridge did not even wobble.”", [("“By Tuesday night the bridge looked perfect.”", "It broke soon after."), ("“At twelve seconds, there was a sharp snap.”", "This shows failure."), ("“Maya’s face felt hot.”", "This shows feelings.")],
   "Not wobbling under the dictionary shows success.", "Choose evidence that directly proves the point.", "G4-P6")
mc("text-evidence", "RI.4.1", 3, "Which detail is evidence that beaver ponds help other animals?",
   "“Frogs lay eggs in the still water, ducks find food.”", [("“Beavers patch any leaks quickly.”", "This is about beavers."), ("“Their dams can flood roads.”", "This is a problem."), ("“A beaver family begins by piling sticks.”", "This is about building.")],
   "This detail names animals that benefit from ponds.", "Evidence must match the idea you are supporting.", "G4-P2")
ms("text-evidence", "RL.4.1", 6, "Which TWO quotations support the idea that Omar’s grandmother is patient?",
   ["“She did not say anything at first.”", "“Together they patched the rip.”"],
   [("“It’s ruined,” Omar said.", "This is Omar speaking."), ("“Omar frowned.”", "This is about Omar.")],
   "She waits quietly, then works alongside him.", "Find quotations about the right character.", "G4-P1")
mc("text-evidence", "RI.4.1", 7, "A student says, “The beekeepers care about their bees.” Which quotation is the STRONGEST evidence?",
   "“They always leave enough honey in the hive for the bees to eat.”",
   [("“Honey from these mountains is famous for its rich taste.”", "This is about the honey."),
    ("“Some families have kept honeybees for generations.”", "This shows tradition, not care."),
    ("“Bees turn the nectar into honey.”", "This is about bees.")],
   "Leaving honey for the bees shows concern for their survival.", "The best evidence clearly proves the claim.", "G4-P12")

# text features (has L2) -> L3 L4 L5 L6 L7
mc("text-features", "RI.4.7", 3, "Which text feature in “Nature’s Engineers” tells what each section is about?",
   "headings", [("captions", "There are no captions in this article."), ("a glossary", "There is no glossary."), ("a map", "There is no map.")],
   "Headings such as “Building a Dam” name each section.", "Headings work like signposts.", "G4-P2")
mc("text-features", "RI.4.7", 4, "Where would you look to find the page about beaver lodges in a long book?",
   "the index", [("the title page", "This shows the title and author."), ("the dedication", "This thanks someone."), ("the last sentence", "This does not list topics.")],
   "The index lists topics alphabetically with page numbers.", "Index = at the back; table of contents = at the front.")
mc("text-features", "RI.4.7", 5, "A diagram of a beaver lodge would MOST help readers understand what?",
   "how the underwater entrances lead into the lodge", [("why scientists like beavers", "A diagram shows parts, not opinions."), ("how many frogs live in the pond", "That would need a chart."), ("the history of beavers", "That would need a timeline.")],
   "Diagrams show parts and how they fit together.", "Choose the feature that fits the information.", "G4-P2")
match("text-features", "RI.4.7", 6, "Match each text feature with what it shows.",
      [("Timeline", "events in time order"), ("Map", "where places are"), ("Chart", "numbers or facts in rows and columns"), ("Bold word", "an important vocabulary word")],
      "Each feature presents a different kind of information.", "Ask what each feature is best at showing.")
mc("text-features", "RI.4.7", 7, "Which heading would BEST fit the last paragraph of “Nature’s Engineers”?",
   "Problems and Benefits", [("Building a Dam", "That heading is already used for the dam section."), ("A Beaver’s Diet", "Diet is not discussed."), ("Life Under the Ice", "Ice is not discussed.")],
   "The paragraph discusses flooding problems and the benefits scientists see.", "A good heading names the paragraph’s main topic.", "G4-P2")

# theme (has L3 L5 L6 L6) -> L2 L4
mc("theme", "RL.4.2", 2, "What lesson does Maya learn in “The Stick Bridge”?",
   "Listen when someone points out a problem.", [("Bridges are boring.", "She enjoys success."), ("Never enter contests.", "She wins."), ("Little brothers are annoying.", "She thanks Omar.")],
   "She says, “Next time, I’ll listen when you find a crack.”", "A theme is a lesson the character learns.", "G4-P6")
mc("theme", "RL.4.2", 4, "Which theme does “The Dripping Taps” suggest?",
   "Taking care of shared resources helps everyone.",
   [("Water is too expensive to use.", "The text is about wasting, not cost alone."),
    ("Taps are dangerous.", "The text does not say this."),
    ("Only adults can solve problems.", "Students solve the problem.")],
   "The students’ care for the school’s water saved water for everyone.", "A theme is a message the text suggests.", "G4-P9")

# =============================================================== vocabulary

# context clues (has L1 L3 L4 L5 L7) -> L2
mc("context-clues", "L.4.4.a", 2, "Read: “The desert was so arid that no plants grew for miles.” What does arid mean?",
   "very dry", [("very cold", "Deserts in the sentence are dry, not cold."), ("very noisy", "Nothing suggests sound."), ("very crowded", "The clue is that no plants grew.")],
   "The clue “no plants grew” shows the land had no water.", "Look for clues that explain the word.")

# Greek and Latin roots (has L5 L6) -> L2 L3 L4 L7
mc("greek-latin-roots", "L.4.4.b", 2, "The root “tele” means far. What is a telescope?",
   "a tool for seeing things that are far away", [("a tool for hearing music", "That would use “phon” (sound)."), ("a tool for writing", "That would use “graph.”"), ("a tool for measuring heat", "That would use “therm.”")],
   "tele (far) + scope (see) = see far.", "Combine root meanings.")
match("greek-latin-roots", "L.4.4.b", 3, "Match each root with its meaning.",
      [("bio", "life"), ("geo", "earth"), ("aqua", "water"), ("phon", "sound")],
      "These roots appear in many science words.", "Think of examples: biology, geography, aquarium, phone.")
mc("greek-latin-roots", "L.4.4.b", 4, "The Latin root “spect” means look or watch. Which word means “a person who watches an event”?",
   "spectator", [("sculptor", "A sculptor shapes art; it has no “spect.”"), ("conductor", "A conductor leads; “duct” means lead."), ("translator", "A translator changes words into another language.")],
   "spect (watch) + -ator (one who) = one who watches.", "Find the root, then the suffix.")
mc("greek-latin-roots", "L.4.4.b", 7, "Using roots, what does “geothermal energy” most likely mean?",
   "heat energy that comes from inside the earth",
   [("energy from water in the ocean", "That would use “aqua” or “hydro.”"),
    ("energy from living plants", "That would use “bio.”"),
    ("sound energy from music", "That would use “phon.”")],
   "geo (earth) + therm (heat) = heat from the earth.", "Break long words into roots.")

# idioms and adages (has L3 L5) -> L2 L4 L6 L7
mc("idioms-adages", "L.4.5.b", 2, "What does “it’s raining cats and dogs” mean?",
   "It is raining very hard.", [("Animals are falling from the sky.", "An idiom is not meant literally."), ("Pets are playing in the rain.", "The words are not about pets."), ("It is a little cloudy.", "The idiom means heavy rain.")],
   "This idiom describes very heavy rain.", "Idioms mean something different from their words.")
mc("idioms-adages", "L.4.5.b", 4, "Kareem was “all ears” when the coach announced the team. What does this mean?",
   "He listened very carefully.", [("He had large ears.", "Idioms are not literal."), ("He could not hear.", "It means the opposite."), ("He covered his ears.", "He wanted to hear.")],
   "“All ears” means paying close attention.", "Use the situation to understand an idiom.")
mc("idioms-adages", "L.4.5.b", 6, "What does the adage “The early bird catches the worm” teach?",
   "People who start early often succeed.", [("Birds should eat worms.", "Adages are lessons, not facts about birds."), ("Never wake up early.", "It praises starting early."), ("Worms are hard to find.", "This misses the lesson.")],
   "The saying encourages getting a head start.", "Adages are short sayings with life lessons.")
match("idioms-adages", "L.4.5.b", 7, "Match each saying with its meaning.",
      [("Break the ice", "start a friendly conversation"), ("Hit the books", "study hard"),
       ("Actions speak louder than words", "what you do matters more than what you say"), ("Practice makes perfect", "doing something often makes you better")],
      "The first two are idioms; the last two are adages.", "Think about when people use each saying.")

# multiple-meaning words (has L2 L4) -> L1 L3 L5 L6
mc("multiple-meaning", "L.4.4.a", 1, "In “The bat flew out of the cave,” what does bat mean?",
   "a flying animal", [("a stick for hitting a ball", "A stick does not fly out of a cave."), ("to hit something", "Here “bat” is a noun."), ("to blink your eyes", "That does not fit.")],
   "Something that flies out of a cave is an animal.", "Use the rest of the sentence to pick the meaning.")
mc("multiple-meaning", "L.4.4.a", 3, "Which sentence uses “light” to mean NOT HEAVY?",
   "The empty box was light enough to carry.", [("Turn on the light.", "Here it means a lamp."), ("Please light the candle.", "Here it means to set on fire."), ("The room was full of light.", "Here it means brightness.")],
   "An empty box that is easy to carry is not heavy.", "Test each meaning in the sentence.")
mc("multiple-meaning", "L.4.4.a", 5, "Read: “The coach told the team to stick together.” What does stick mean here?",
   "stay", [("a piece of wood", "This sentence uses stick as a verb."), ("to glue", "The team is not glued."), ("to poke", "Nobody is poked.")],
   "“Stick together” means stay together as a group.", "Notice whether the word is a noun or a verb.")
ms("multiple-meaning", "L.4.4.a", 6, "In which TWO sentences does “ring” mean a sound?",
   ["I heard the phone ring.", "The bells ring at noon."],
   [("She wore a gold ring.", "Here it is jewelry."), ("The boxers stepped into the ring.", "Here it is a place for boxing.")],
   "Phones and bells make sounds.", "Group sentences by the meaning used.")

# prefixes (has L2 L3) -> L1 L4 L5 L6
dd("prefixes", "L.4.4.b", 1, "Choose the word that means “not tidy”: “Clothes all over the floor made the room ____.”",
   "untidy", [("tidy", "“Tidy” means neat, the opposite of the meaning needed."), ("tidier", "-er compares two things."), ("retidy", "This is not a word.")],
   "un- means not: untidy = not tidy, messy.", "un- = not.")
dd("prefixes", "L.4.4.b", 4, "Choose the word that means “not agree”: “The two friends ____ about the best game.”",
   "disagree", [("reagree", "This is not a word."), ("preagree", "This is not a word."), ("overagree", "This is not a word.")],
   "dis- means not or opposite: disagree.", "dis- = not, opposite of.")
mc("prefixes", "L.4.4.b", 5, "What does “overcooked” mean?",
   "cooked too much", [("cooked again", "re- means again."), ("not cooked", "un- means not."), ("cooked before", "pre- means before.")],
   "over- means too much.", "over- = too much.")
mc("prefixes", "L.4.4.b", 6, "Which word means “not able to be seen”?",
   "invisible", [("visible", "Visible means able to be seen."), ("revisible", "This is not a word."), ("previsible", "This is not a word.")],
   "in- means not: invisible = not able to be seen.", "Some prefixes mean “not”: un-, in-, im-, dis-, non-.")

# suffixes (has L3 L4) -> L1 L2 L5 L6
mc("suffixes", "L.4.4.b", 1, "What does “teacher” mean?",
   "one who teaches", [("the act of teaching", "That would be teaching."), ("full of teaching", "-ful means full of."), ("teaching again", "re- means again.")],
   "-er can mean “one who.”", "-er/-or = one who.")
mc("suffixes", "L.4.4.b", 2, "What does “joyful” mean?",
   "full of joy", [("without joy", "-less means without."), ("one who brings joy", "-er would mean that."), ("joy again", "re- means again.")],
   "-ful means full of.", "-ful = full of.")
dd("suffixes", "L.4.4.b", 5, "Choose the word that means “in a quiet way”: “The baby slept ____.”",
   "quietly", [("quieter", "-er compares."), ("quietness", "-ness makes a noun."), ("quietful", "This is not a word.")],
   "-ly means “in a … way.”", "-ly often makes an adverb.")
mc("suffixes", "L.4.4.b", 6, "How does the suffix change the word in “The movement of the ship made me dizzy”?",
   "-ment turns the verb “move” into a noun.", [("-ment makes the word mean “not move.”", "That is not the meaning."), ("-ment makes the word plural.", "Plurals add -s."), ("-ment means “one who moves.”", "That would be mover.")],
   "move (verb) + -ment = movement (noun).", "Suffixes can change a word’s part of speech.")

# synonyms and antonyms (has L1 L2 L4) -> L3 L5 L6
mc("synonyms-antonyms", "L.4.5.c", 3, "Which word is a synonym for “brave”?",
   "courageous", [("timid", "This is an antonym."), ("lazy", "This has a different meaning."), ("sleepy", "This has a different meaning.")],
   "Courageous and brave mean almost the same.", "Synonyms have similar meanings.")
mc("synonyms-antonyms", "L.4.5.c", 5, "Which word is an antonym for “ancient”?",
   "modern", [("old", "This is a synonym."), ("historic", "This is related, not opposite."), ("dusty", "This is not an opposite.")],
   "Ancient means very old; modern means new.", "Antonyms have opposite meanings.")
match("synonyms-antonyms", "L.4.5.c", 6, "Match each word with its ANTONYM.",
      [("ancient", "modern"), ("generous", "selfish"), ("timid", "bold"), ("rough", "smooth")],
      "Each pair has opposite meanings.", "Think of the opposite meaning first.")

# ============================================================== word study

# spelling (has L3 L4) -> L1 L2 L5 L6
mc("spelling", "L.4.2.d", 1, "Which word is spelled correctly?",
   "because", [("becuase", "The letters a and u are swapped."), ("becaus", "The final e is missing."), ("beacause", "There is an extra a.")],
   "because: b-e-c-a-u-s-e.", "Say each part slowly: be-cause.")
fill("spelling", "L.4.2.d", 2, "Add -ed to the word stop: “The bus ____ at the corner.”",
     ["stopped"], "Double the final consonant before adding -ed: stopped.", "Short vowel + one consonant: double it before -ed.")
mc("spelling", "L.4.2.d", 5, "Which sentence has every word spelled correctly?",
   "We were surprised by the beautiful weather.",
   [("We were suprised by the beautiful weather.", "“Surprised” has an r after u."),
    ("We were surprised by the beatiful weather.", "“Beautiful” is b-e-a-u-t-i-f-u-l."),
    ("We were surprised by the beautiful wether.", "“Weather” has an a.")],
   "surprised, beautiful and weather are spelled correctly.", "Check tricky words letter by letter.")
fill("spelling", "RF.4.3.a", 6, "Add -ing to the word make: “I am ____ a card for my mother.”",
     ["making"], "Drop the silent e before adding -ing: making.", "Silent e + -ing: drop the e.")

# ============================================================ precise language

mc("precise-language", "L.4.3", 2, "Which word is more precise than “said” in: “‘Help!’ he ____.”",
   "shouted", [("talked", "This is not more precise."), ("went", "This is not a speaking word."), ("did", "This is not specific.")],
   "“Shouted” shows how he spoke.", "Precise words give clearer pictures.")
mc("precise-language", "L.4.3", 3, "Which sentence uses the most precise language?",
   "The golden retriever chewed the red sneaker.",
   [("The dog chewed the shoe.", "“Dog” and “shoe” are general."),
    ("The animal did something to the thing.", "This is very vague."),
    ("The dog ate stuff.", "“Stuff” is vague.")],
   "Specific nouns and details create a clear picture.", "Replace general words with specific ones.")
mc("precise-language", "W.4.2.d", 6, "Which sentence is the most precise for a science report?",
   "The water boiled at 100 degrees Celsius after eight minutes.",
   [("The water got really hot after a while.", "This is vague."),
    ("The water did a cool thing.", "This is informal and vague."),
    ("The water boiled pretty fast.", "“Pretty fast” is not exact.")],
   "Reports use exact numbers and terms.", "Use measurements and specific vocabulary in reports.")
mc("precise-language", "L.4.3", 7, "Which revision of “The big storm made a lot of damage” is MOST precise?",
   "The fierce sandstorm tore three palm trees from the ground.",
   [("The storm was really big and bad.", "Still vague."),
    ("The large storm made much damage.", "Only slightly more precise."),
    ("Something happened during the storm.", "Less precise.")],
   "Specific words (fierce sandstorm, three palm trees, tore) show exactly what happened.", "Precise language names exact things, numbers and actions.")
