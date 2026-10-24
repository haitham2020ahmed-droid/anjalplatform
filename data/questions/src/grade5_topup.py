"""
Grade 5 question bank, top-up 1: brings every Grade 5 quiz skill to at least 6 items,
filling missing difficulty levels. Original items; reading items use existing Grade 5
passages (G5-P1 … G5-P12). Imported after all earlier modules.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

grade(5)

# ================================================================== grammar

# adverbs (has L4) -> L1 L2 L3 L5 L6
mc("adverbs", "L.5.1", 1, "Which word is an adverb? “The fox crept silently through the grass.”",
   "silently", [("fox", "This is a noun."), ("crept", "This is the verb."), ("grass", "This is a noun.")],
   "“Silently” tells how the fox crept.", "Adverbs tell how, when, where or how often.")
dd("adverbs", "L.5.1", 2, "Choose the adverb that tells HOW OFTEN: “Our family ____ eats dinner together.”",
   "always", [("delicious", "This is an adjective."), ("kitchen", "This is a noun."), ("hungry", "This is an adjective.")],
   "“Always” tells how often.", "Frequency adverbs: always, usually, often, sometimes, never.")
mc("adverbs", "L.5.1", 3, "Which word does the adverb “almost” describe in “The jar was almost empty”?",
   "empty", [("jar", "Adverbs do not describe nouns."), ("was", "“Almost” tells how empty, not how it was."), ("The", "This is an article.")],
   "“Almost” tells to what extent the jar was empty.", "Adverbs can describe adjectives.")
dd("adverbs", "L.5.1", 5, "Choose the correct form: “Of everyone in the choir, Reem sings ____.”",
   "most clearly", [("more clearly", "“More” compares only two."), ("clearliest", "This is not a word."), ("clearest", "An adverb form is needed to describe how she sings.")],
   "Comparing many people uses “most” + adverb.", "Two → more; three or more → most.")
err("adverbs", "L.5.1", 6, ["The team played", " real well", " in the", " final match."], 1, " really well",
    "“Really” is the adverb that describes “well”; “real” is an adjective.", "Use an adverb to describe another adverb.")

# clauses and complex sentences (has L5 L6) -> L2 L3 L4 L7
mc("clauses-complex", "L.5.1", 2, "Which group of words is a dependent clause?",
   "until the rain stops", [("The rain stopped.", "This is an independent clause."), ("We played outside.", "This is an independent clause."), ("the heavy rain", "This has no verb, so it is not a clause.")],
   "It has a subject and verb but begins with “until,” so it cannot stand alone.", "Subordinating conjunctions make clauses dependent.")
mc("clauses-complex", "L.5.1", 3, "What is the independent clause? “Although the test was long, Salma finished early.”",
   "Salma finished early", [("Although the test was long", "This is dependent."), ("the test was long", "This is part of the dependent clause."), ("finished early", "This has no subject.")],
   "“Salma finished early” can stand alone.", "Remove the clause that starts with although/because/when.")
dd("clauses-complex", "L.5.1", 4, "Choose the subordinating conjunction: “Please wait here ____ I get the tickets.”",
   "while", [("but", "“But” is coordinating."), ("and", "“And” is coordinating."), ("so", "“So” is coordinating.")],
   "“While” makes a dependent clause about time.", "Subordinating: while, because, although, unless, until.")
mc("clauses-complex", "L.5.1", 7, "Which revision turns two choppy sentences into ONE complex sentence with the clearest meaning? “The museum was closed. We visited the park.”",
   "Because the museum was closed, we visited the park.",
   [("The museum was closed, we visited the park.", "This is a comma splice."),
    ("The museum was closed and we visited the park.", "This is compound and does not show why."),
    ("Although we visited the park, the museum was closed.", "This changes the logic.")],
   "“Because” shows that the closed museum caused the change of plan.", "Choose the conjunction that matches the relationship.")

# combining sentences (has L4) -> L2 L3 L5 L6 L7
mc("combining-sentences", "L.5.3", 2, "Combine: “Hala likes chess. Hala likes painting.”",
   "Hala likes chess and painting.", [("Hala likes chess Hala likes painting.", "This is a run-on."), ("Hala likes chess, likes painting.", "A word is missing."), ("Chess and painting likes Hala.", "This changes the meaning.")],
   "Join the two objects with “and” and remove repeated words.", "Combine words that repeat.")
mc("combining-sentences", "L.5.3", 3, "Combine using an appositive: “Dr. Noor is a dentist. Dr. Noor lives next door.”",
   "Dr. Noor, a dentist, lives next door.", [("Dr. Noor a dentist lives next door.", "Appositives need commas."), ("Dr. Noor lives next door a dentist.", "The appositive is misplaced."), ("A dentist lives next door Dr. Noor.", "This is confusing.")],
   "The appositive “a dentist” renames Dr. Noor and is set off by commas.", "Place the appositive right after the noun.")
mc("combining-sentences", "L.5.3", 5, "Which is the BEST combined sentence? “The cat jumped. The cat landed on the table. The table was wooden.”",
   "The cat jumped onto the wooden table.", [("The cat jumped and the cat landed and the table was wooden.", "This is wordy."), ("Jumping, landing, wooden, the cat.", "This is a fragment."), ("The cat jumped, it landed, the table was wooden.", "This is a comma splice.")],
   "One clear sentence keeps all the information without repeating.", "Cut repeated words and combine actions.")
mc("combining-sentences", "L.5.3", 6, "Combine with a participial phrase: “Ali opened the box. He found a letter.”",
   "Opening the box, Ali found a letter.", [("Opening the box, a letter was found by Ali.", "The phrase must describe the subject (Ali)."), ("Ali opening the box found a letter.", "Commas are needed."), ("Ali opened the box, found a letter.", "A conjunction is missing.")],
   "The -ing phrase describes Ali, the subject that follows it.", "An introductory phrase must describe the subject right after the comma.")
err("combining-sentences", "L.5.3", 7, ["Walking to school,", " the rain soaked", " my backpack", " and my shoes."], 1, " I got soaked by the rain, including",
    "The phrase “Walking to school” must describe the person walking, not the rain (dangling modifier).", "Check who is doing the action in an introductory phrase.")

# comparatives (has L4) -> L1 L2 L3 L5 L6
dd("comparatives", "L.5.1", 1, "Choose: “A cheetah is ____ than a horse.”",
   "faster", [("fastest", "Use -est for three or more."), ("more fast", "Short adjectives add -er."), ("fast", "A comparing form is needed.")],
   "Two animals → -er: faster.", "Two things: -er; many: -est.")
dd("comparatives", "L.5.1", 2, "Choose: “Mount Everest is the ____ mountain in the world.”",
   "highest", [("higher", "This compares only two."), ("most high", "Short adjectives add -est."), ("high", "A superlative is needed.")],
   "Comparing with all mountains → highest.", "“In the world” signals a superlative.")
mc("comparatives", "L.5.1", 3, "Which sentence uses “less” or “fewer” correctly?",
   "This bag has fewer apples than that one.", [("This bag has less apples than that one.", "Use “fewer” with things you can count."), ("This bag has fewer sugar than that one.", "Use “less” with amounts you cannot count."), ("This bag has lesser apples.", "This is not correct here.")],
   "Apples can be counted, so “fewer.”", "fewer = countable; less = not countable.")
err("comparatives", "L.5.1", 5, ["My new bike", " is", " more lighter", " than my old one."], 2, " lighter",
    "Use -er OR more, never both.", "Do not double comparatives.")
mc("comparatives", "L.5.1", 6, "Which sentence is correct?",
   "Of the two essays, Hadi’s is the stronger.",
   [("Of the two essays, Hadi’s is the strongest.", "With only two, use the comparative."),
    ("Of the two essays, Hadi’s is the most strong.", "Use -er for short words, and comparative for two."),
    ("Of the two essays, Hadi’s is the more stronger.", "Never use more with -er.")],
   "When comparing exactly two, use the comparative form.", "Two items → comparative, even with “the.”")

# compound sentences (has L3 L4 L5) -> L1 L2 L6
mc("compound-sentences", "L.5.1", 1, "Which coordinating conjunction can mean “because”? “We hurried home, ____ a storm was coming.”",
   "for", [("but", "“But” shows contrast."), ("or", "“Or” shows a choice."), ("so", "“So” shows a result, not a reason.")],
   "“For” gives a reason, like “because.”", "FANBOYS: for = reason; so = result.")
mc("compound-sentences", "L.5.2", 2, "Which compound sentence is punctuated correctly?",
   "The phone rang, so Majed answered it.", [("The phone rang so, Majed answered it.", "The comma goes before “so.”"), ("The phone rang, Majed answered it.", "A conjunction is needed."), ("The phone, rang so Majed answered it.", "The comma is misplaced.")],
   "Comma + coordinating conjunction joins two independent clauses.", "Comma before FANBOYS.")
mc("compound-sentences", "L.5.1", 6, "Which sentence correctly uses “not only … but also”?",
   "Hessa not only won the race but also broke the record.",
   [("Hessa not only won the race but broke also the record.", "“Also” is misplaced."),
    ("Hessa not only won the race also broke the record.", "“But” is missing."),
    ("Not only Hessa won the race but also broke the record.", "The pair must sit next to parallel parts.")],
   "“Not only won … but also broke” joins two parallel verb phrases.", "Correlative pairs join matching parts.")

# nouns (has L1) -> L2 L3 L4 L5 L6
ms("nouns", "L.5.1", 2, "Which TWO words are common nouns? “The scientist studied the volcano near Naples.”",
   ["scientist", "volcano"], [("Naples", "This is a proper noun."), ("studied", "This is a verb.")],
   "Common nouns name general people, places or things.", "Proper nouns are capitalized; common nouns are not.")
mc("nouns", "L.5.1", 3, "Which word is a concrete noun?",
   "telescope", [("curiosity", "This is abstract."), ("freedom", "This is abstract."), ("honesty", "This is abstract.")],
   "You can see and touch a telescope.", "Concrete nouns can be sensed.")
mc("nouns", "L.5.1", 4, "In “My parents walked the dog around the park,” how is “dog” used?",
   "as a direct object", [("as the subject", "“Parents” is the subject."), ("as the object of a preposition", "“Park” is the object of “around.”"), ("as a verb", "“Dog” is a noun here.")],
   "The dog receives the action of “walked.”", "A direct object answers “what?” or “whom?” after the verb.")
mc("nouns", "L.5.1", 5, "Which word is the object of a preposition? “The kite drifted over the hills.”",
   "hills", [("kite", "This is the subject."), ("drifted", "This is the verb."), ("over", "This is the preposition.")],
   "“Hills” comes after the preposition “over.”", "Preposition + noun = object of the preposition.")
mc("nouns", "L.5.1", 6, "Which sentence uses a collective noun with a singular verb correctly?",
   "The committee meets every Monday.",
   [("The committee meet every Monday.", "Acting as one group, it takes “meets.”"),
    ("The committees meets every Monday.", "A plural subject takes “meet.”"),
    ("The committee are meeting every Monday.", "Acting as one group, use a singular verb.")],
   "A committee acting together is one unit, so the verb is singular.", "Collective nouns usually take singular verbs.")

# prepositions (has L4) -> L1 L2 L3 L5 L6
mc("prepositions", "L.5.1", 1, "Which word is a preposition? “The cat hid behind the sofa.”",
   "behind", [("cat", "This is a noun."), ("hid", "This is a verb."), ("sofa", "This is a noun.")],
   "“Behind” shows where the cat hid.", "Prepositions show position, direction or time.")
dd("prepositions", "L.5.1", 2, "Choose the preposition of time: “The shop closes ____ midnight.”",
   "at", [("on", "Use “on” with days and dates."), ("in", "Use “in” with months and years."), ("over", "This shows position.")],
   "Use “at” with clock times.", "at + time; on + day; in + month/year.")
mc("prepositions", "L.5.1", 3, "What is the prepositional phrase? “Students from every grade joined the parade.”",
   "from every grade", [("Students from", "A phrase ends with a noun."), ("joined the parade", "This is the predicate."), ("every grade joined", "This mixes parts.")],
   "The phrase begins with “from” and ends with the noun “grade.”", "Preposition → … → noun.")
ms("prepositions", "L.5.1", 5, "Which TWO prepositional phrases tell WHERE? “During the trip, we camped beside a lake under the stars.”",
   ["beside a lake", "under the stars"], [("During the trip", "This tells when."), ("we camped", "This is the subject and verb.")],
   "“Beside” and “under” show location.", "Ask what each phrase answers: when or where?")
err("prepositions", "L.5.1", 6, ["The letter", " was addressed", " to my brother and I", " by mistake."], 2, " to my brother and me",
    "After the preposition “to,” use the object pronoun “me.”", "Objects of prepositions use me, him, her, us, them.")

# pronoun homophones (has L6) -> L1 L2 L3 L4 L5
dd("pronoun-homophones", "L.5.1", 1, "Choose: “The dog wagged ____ tail.”",
   "its", [("it’s", "“It’s” means it is."), ("its’", "This is not a word."), ("it is", "This does not make sense.")],
   "“Its” shows the tail belongs to the dog.", "its = belonging to it.")
dd("pronoun-homophones", "L.5.1", 2, "Choose: “Please put your shoes over ____.”",
   "there", [("their", "“Their” shows ownership."), ("they’re", "“They’re” means they are."), ("thier", "This is misspelled.")],
   "“There” names a place.", "there contains “here”: it is about place.")
dd("pronoun-homophones", "L.5.1", 3, "Choose: “____ been to the new science museum?”",
   "Who’s", [("Whose", "“Whose” shows ownership."), ("Whos", "The apostrophe is missing."), ("Who", "This needs a verb: who has.")],
   "Who’s = who has.", "who’s = who is / who has.")
match("pronoun-homophones", "L.5.1", 4, "Match each word with its meaning.",
      [("its", "belonging to it"), ("it’s", "it is"), ("their", "belonging to them"), ("they’re", "they are")],
      "Contractions have apostrophes; possessive pronouns do not.", "Expand each word to test it.")
mc("pronoun-homophones", "L.5.1", 5, "Which sentence is correct?",
   "You’re welcome to borrow your cousin’s bike.",
   [("Your welcome to borrow you’re cousin’s bike.", "Both words are reversed."),
    ("You’re welcome to borrow you’re cousin’s bike.", "The second should be “your.”"),
    ("Your welcome to borrow your cousin’s bike.", "The first should be “You’re.”")],
   "You’re = you are; your = belonging to you.", "Check each one by expanding it.")

# pronouns (has L4) -> L1 L2 L3 L5 L6
mc("pronouns", "L.5.1", 1, "Which word is a pronoun? “They planted three trees.”",
   "They", [("planted", "This is a verb."), ("three", "This is an adjective."), ("trees", "This is a noun.")],
   "“They” replaces the names of people.", "Pronouns replace nouns.")
dd("pronouns", "L.5.1", 2, "Choose the possessive pronoun: “The blue umbrella is ____.”",
   "hers", [("her’s", "Possessive pronouns never have apostrophes."), ("she", "This is a subject pronoun."), ("herself", "This is reflexive.")],
   "“Hers” shows ownership.", "mine, yours, his, hers, ours, theirs.")
dd("pronouns", "L.5.1", 3, "Choose the reflexive pronoun: “I taught ____ to juggle.”",
   "myself", [("me", "When the subject is “I,” use myself."), ("mine", "This is possessive."), ("meself", "This is not a word.")],
   "Reflexive pronouns refer back to the subject.", "-self / -selves.")
err("pronouns", "L.5.1", 5, ["Each of the boys", " brought", " their own", " lunch."], 2, " his own",
    "“Each” is singular, so the pronoun should be singular: his.", "Pronouns agree in number with their antecedents.")
mc("pronouns", "L.5.1", 6, "Which sentence has a clear pronoun reference?",
   "When Lina met Sara, Lina gave her a gift.",
   [("When Lina met Sara, she gave her a gift.", "“She” could mean either girl."),
    ("Lina told Sara that she won.", "“She” is unclear."),
    ("They gave them a gift.", "No antecedents are clear.")],
   "Naming Lina again removes the confusion.", "Make sure each pronoun clearly points to one noun.")

# verb tenses (has L4 L5 L5 L6) -> L2 L3
dd("verb-tenses", "L.5.1", 2, "Choose the past progressive: “At eight o’clock, we ____ dinner.”",
   "were eating", [("eat", "This is present."), ("will eat", "This is future."), ("have eaten", "This is present perfect.")],
   "Past progressive = was/were + -ing.", "Progressive tenses show ongoing action.")
mc("verb-tenses", "L.5.1", 3, "Which sentence uses the future perfect tense?",
   "By June, I will have finished the book.", [("I finished the book in June.", "This is past."), ("I am finishing the book.", "This is present progressive."), ("I have finished the book.", "This is present perfect.")],
   "will have + past participle = future perfect.", "Perfect tenses use has/have/had/will have.")

# verbs (has L1) -> L2 L3 L4 L5 L6
dd("verbs", "L.5.1", 2, "Choose the LINKING verb: “After the long race, Omar ____ exhausted.”",
   "felt", [("ran", "“Ran” is an action verb and does not link to “exhausted.”"), ("quickly", "This is an adverb."), ("jumped", "This is an action verb.")],
   "“Felt” links Omar to the word that describes him, “exhausted.”", "Linking verbs: is, seem, feel, become, look, appear.")
dd("verbs", "L.5.1", 3, "Choose the helping verb: “The guests ____ arriving soon.”",
   "will be", [("is", "“Guests” is plural."), ("has", "“Has” does not fit with “arriving.”"), ("was", "“Was” is singular and past.")],
   "“Will be arriving” is a verb phrase showing the future.", "Helping verb + main verb = verb phrase.")
mc("verbs", "L.5.1", 4, "Which sentence has a transitive verb (an action done TO something)?",
   "Huda painted a mural.", [("Huda laughed.", "There is no object."), ("Huda seemed tired.", "“Seemed” is linking."), ("Huda arrived early.", "There is no object.")],
   "“Painted” acts on the object “a mural.”", "Transitive verbs have a direct object.")
dd("verbs", "L.5.1", 5, "Choose the modal that shows ability: “I ____ swim across the pool now.”",
   "can", [("must", "This shows obligation."), ("should", "This shows advice."), ("may", "This shows permission or possibility.")],
   "“Can” shows ability.", "can = able; must = required; should = advised.")
ms("verbs", "L.5.1", 6, "Which TWO sentences use a verb phrase with a helping verb?",
   ["The team has practiced every day.", "We are reading a mystery."],
   [("The team practiced yesterday.", "This is a single verb."), ("We read a mystery.", "This is a single verb.")],
   "has practiced and are reading each contain a helping verb.", "Look for has/have/is/are/will before the main verb.")

# ================================================================= language

# commas (has L2 L2 L3 L4 L5) -> L6
err("commas", "L.5.2", 6, ["Yes", " Mr. Salem,", " the report", " is ready."], 0, "Yes,",
    "A comma follows the introductory word “Yes.” (The comma after the name is already correct.)", "Introductory words and direct address both need commas.")

# titles and abbreviations (has L4) -> L1 L2 L3 L5 L6
mc("titles-abbreviations", "L.5.2", 1, "Which is the abbreviation for “Street”?",
   "St.", [("st", "Capitalize and add a period."), ("Str", "This is not standard."), ("ST", "Use a capital S, lowercase t and a period.")],
   "Street → St.", "Address abbreviations: St., Ave., Rd.")
mc("titles-abbreviations", "L.5.2", 2, "How should a song title be written?",
   "in quotation marks", [("underlined", "Underline long works like albums."), ("in all capital letters", "Titles are not written in all caps."), ("with no marks", "Song titles need quotation marks.")],
   "Short works (songs, poems, articles) use quotation marks.", "Short works → quotation marks.")
mc("titles-abbreviations", "L.5.2", 3, "Which sentence writes a magazine title and an article title correctly?",
   "I read “Saving the Reefs” in Ocean World.",
   [("I read Saving the Reefs in “Ocean World.”", "Reversed: article in quotes, magazine in italics."),
    ("I read “saving the reefs” in Ocean World.", "Capitalize important words in titles."),
    ("I read Saving The Reefs in ocean world.", "Missing marks and capitals.")],
   "Article titles take quotation marks; magazine titles are italicized.", "Part → quotes; whole → italics.")
mc("titles-abbreviations", "L.5.2", 5, "Which date uses abbreviations correctly?",
   "Mon., Sept. 7", [("mon., sept. 7", "Abbreviations of days and months are capitalized."), ("Mon Sept 7", "Periods are needed."), ("MON., SEPT. 7", "Only the first letter is capitalized.")],
   "Abbreviated days and months keep a capital letter and take a period.", "Mon., Tues., Jan., Feb.")
mc("titles-abbreviations", "L.5.2", 6, "Which sentence is correct?",
   "Dr. Hamid’s book, The Desert Garden, won an award.",
   [("Dr Hamid’s book, “The Desert Garden,” won an award.", "Book titles are italicized; Dr. needs a period."),
    ("dr. Hamid’s book, The desert garden, won an award.", "Capitalization errors."),
    ("Dr. Hamid’s book, the Desert Garden, won an award.", "Capitalize the first word of a title.")],
   "Title abbreviation with a period; book title italicized with capitals.", "Check abbreviation, marks and capitals.")

# ================================================================== reading
# P1 The Second Try, P2 Catching Water in the Desert, P3 The Storm: Two Accounts (paired),
# P4 City Morning, P5 Why the Moon Changes Shape, P6 The Last Repair, P7 The Two Wells,
# P8 The Volcano That Would Not Erupt, P9 Every School Needs a Garden, P10 Sea Turtles,
# P11 Harbor at Dawn, P12 garden + turtles (paired)

# author's purpose (has L6) -> L2 L3 L4 L5 L7
mc("author-purpose", "RI.5.6", 2, "What is the main purpose of “Why the Moon Changes Shape”?",
   "to explain why the Moon looks different during the month", [("to persuade readers to visit space", "It does not persuade."), ("to tell a story about astronauts", "It is not a story."), ("to describe how calendars are printed", "Calendars are mentioned only briefly.")],
   "The article explains moon phases.", "Ask: inform, persuade or entertain?", "G5-P5")
mc("author-purpose", "RI.5.6", 3, "Why does the author of “Catching Water in the Desert” begin by describing rare rain?",
   "to show the problem that the solutions address", [("to complain about the weather", "The author explains rather than complains."), ("to describe a holiday", "No holiday is mentioned."), ("to explain how clouds form", "Cloud formation is not explained.")],
   "The opening sets up the problem of saving water.", "Openings often introduce the problem or topic.", "G5-P2")
mc("author-purpose", "RI.5.6", 4, "How is the purpose of the news report different from Rania’s journal in “The Storm: Two Accounts”?",
   "The report informs with facts; the journal shares personal feelings.",
   [("Both mainly share feelings.", "The report gives numbers and facts."), ("The journal gives exact rainfall.", "The report gives rainfall."), ("The report is fiction.", "It reports real events in the scenario.")],
   "The report lists wind speeds and outages; the journal says “I was scared.”", "Compare purpose through the details each writer chooses.", "G5-P3")
mc("author-purpose", "RI.5.6", 5, "Why does the turtle article include a glossary?",
   "to help readers understand a key word", [("to persuade readers to protect turtles", "A glossary defines words."), ("to tell a story", "Glossaries do not tell stories."), ("to list every turtle species", "It defines only “hatchling.”")],
   "The glossary defines “hatchling.”", "Text features support the author’s purpose.", "G5-P10")
mc("author-purpose", "RI.5.6", 7, "The author of “Catching Water in the Desert” ends with engineers combining ancient ideas and modern materials. What point of view does this ending suggest?",
   "Old solutions are still valuable and can be improved, not replaced.",
   [("Modern materials make ancient ideas useless.", "The author says they are combined."),
    ("Engineers should stop using cisterns.", "The text praises cisterns."),
    ("Desert farming is impossible.", "The text shows it is possible.")],
   "The final sentence shows respect for ancient methods and hope for improvement.", "Endings often reveal the author’s attitude.", "G5-P2")

# cause and effect (has L4 L6) -> L2 L3 L5 L7
mc("cause-effect", "RI.5.3", 2, "In “Catching Water in the Desert,” what causes rainwater to disappear quickly?",
   "It rushes over hard, dry ground.", [("People drink it immediately.", "Not stated."), ("Cisterns leak.", "Cisterns store water."), ("Check dams block it.", "Check dams help it soak in.")],
   "The text says water “rushes over the hard, dry ground and disappears.”", "Find what makes something happen.", "G5-P2")
mc("cause-effect", "RI.5.3", 3, "What is an effect of check dams?",
   "Water soaks into the soil instead of running away.", [("Rain falls more often.", "Check dams do not change rainfall."), ("Cisterns become larger.", "They are separate methods."), ("The ground becomes harder.", "The ground holds more moisture.")],
   "The walls slow the water, “giving it time to soak into the soil.”", "Signal words like “giving” can show effects.", "G5-P2")
mc("cause-effect", "RI.5.3", 5, "In “The Storm: Two Accounts,” what was an effect of the 120 millimeters of rain?",
   "Flooding on six streets", [("Lightning at 3 a.m.", "Lightning is not caused by rain."), ("Power restored by noon", "That was the result of repairs."), ("Winds of 90 kilometers per hour", "Wind is not caused by rain.")],
   "Heavy rain in six hours flooded streets.", "Connect each cause with its direct result.", "G5-P3")
match("cause-effect", "RI.5.3", 7, "Match each cause from the turtle article with its effect.",
      [("Warmer sand in the nest", "More hatchlings become females"), ("Bright lights from buildings", "Hatchlings crawl the wrong way"),
       ("Eggs stay warm for about two months", "Hatchlings dig their way out")],
      "Each effect in the article follows from a condition on the beach.", "Use “because” to test each pair.", passage="G5-P10")

# central idea (has L5 L5 L7) -> L2 L3 L4
mc("central-idea", "RI.5.2", 2, "What is the central idea of “Why the Moon Changes Shape”?",
   "The Moon’s shape seems to change because we see different amounts of its lit half.",
   [("The Moon makes its own light.", "It reflects sunlight."), ("Full moons happen every week.", "Every 29.5 days."), ("Calendars were invented by farmers.", "This is a detail.")],
   "Every paragraph explains our changing view of the lit half.", "The central idea connects all paragraphs.", "G5-P5")
mc("central-idea", "RI.5.2", 3, "Which detail BEST supports the central idea of the turtle article?",
   "Females lay about one hundred eggs on sandy beaches.", [("A caption describes a photo.", "This is a text feature, not a key detail."), ("Hatchling is defined in the glossary.", "This is a definition."), ("The Red Sea is warm.", "This is background.")],
   "The article is about how Red Sea turtles nest and the dangers hatchlings face.", "Supporting details develop the main idea.", "G5-P10")
mc("central-idea", "RI.5.2", 4, "Which sentence best states the central idea of “The Last Repair”?",
   "Under pressure, Khalid succeeds by remembering to slow down.",
   [("Jeddah smells of sea salt and cardamom.", "This is setting."), ("Captains need pocket watches.", "This is a detail."), ("Uncle Faris has a fever.", "This explains why Khalid works alone.")],
   "The story turns on Khalid calming himself and finding the spring.", "Ask what the whole story is mostly about.", "G5-P6")

# character (has L5 L6) -> L2 L3 L4 L7
mc("character", "RL.5.3", 2, "Which word BEST describes Dana in “The Second Try”?",
   "supportive", [("jealous", "She encourages the narrator."), ("bored", "She pays attention and helps."), ("rude", "She speaks kindly.")],
   "She whispers encouragement and gives advice.", "Use dialogue to describe a character.", "G5-P1")
mc("character", "RL.5.3", 3, "How does Salma solve the problem in “The Two Wells”?",
   "She observes carefully and leads the children to dig a new well.", [("She buys water from Hamdan.", "She avoids buying."), ("She asks the king for help.", "There is no king."), ("She leaves the village.", "She stays.")],
   "She notices the green grove and digs there.", "Characters’ actions show their traits.", "G5-P7")
mc("character", "RL.5.3", 4, "What does Yusuf’s question about the baking soda show about him?",
   "He thinks logically when something goes wrong.", [("He wants to blame Layla.", "He calmly asks a question."), ("He has given up.", "He looks for the cause."), ("He forgot the vinegar.", "He poured the vinegar.")],
   "Instead of panicking, he checks the steps.", "Problem-solving shows character.", "G5-P8")
mc("character", "RL.5.3", 7, "How does Khalid change between the moment the spring disappears and the end of “The Last Repair”?",
   "He moves from panic to calm, careful action.",
   [("He moves from calm to anger.", "He starts in panic and becomes calm."), ("He gives up and asks the captain for help.", "He solves it himself."), ("He stays panicked until the end.", "He calms down and succeeds.")],
   "He knocks screws over in panic, then counts to ten and searches slowly.", "Track how a character’s behavior changes.", "G5-P6")

# compare texts (has L4 L5) -> L2 L3 L6 L7  (paired passages only)
mc("compare-texts", "RI.5.9", 2, "What topic do both accounts in “The Storm: Two Accounts” describe?",
   "the same storm on March 12", [("two different storms", "Both describe the March 12 storm."), ("a school play", "Not mentioned."), ("a car accident", "A car is flooded but there is no accident.")],
   "Both are dated March 12 and describe the storm.", "Find the shared topic first.", "G5-P3")
mc("compare-texts", "RI.5.9", 3, "Which detail appears in BOTH accounts?",
   "There was flooding in the streets.", [("Winds reached 90 kilometers per hour.", "Only in the news report."), ("Rania hid in her sister’s bed.", "Only in the journal."), ("Electricity returned by noon.", "Only in the news report.")],
   "Rania says the street was a river; the report says six streets flooded.", "Look for facts both writers mention.", "G5-P3")
mc("compare-texts", "RI.5.9", 6, "Using BOTH articles in the paired passage, which statement is true?",
   "One argues for gardens with reasons; the other explains facts about turtles with headings.",
   [("Both argue for protecting turtles.", "Only Text 2 is about turtles, and it informs."), ("Both use headings.", "Only Text 2 uses headings."), ("Both are stories.", "Both are nonfiction.")],
   "The texts differ in purpose and structure.", "Compare purpose and structure across texts.", "G5-P12")
mc("compare-texts", "RI.5.9", 7, "A student writes a report about the storm’s effect on families. Why is using BOTH accounts better than using one?",
   "The report gives exact facts, and the journal shows how it felt to live through it.",
   [("The journal has more numbers.", "The report has the numbers."), ("Both say the same thing.", "They give different kinds of information."), ("The report describes Rania’s fear.", "Only the journal does.")],
   "Combining facts and personal experience gives a fuller picture.", "Different sources add different kinds of information.", "G5-P3")

# inference (has L4) -> L2 L3 L5 L6 L7
mc("inference", "RL.5.1", 2, "Why does the narrator of “The Second Try” leave the note cards in the desk?",
   "To speak naturally instead of reading", [("Because the cards were lost", "The narrator chose to leave them."), ("Because the teacher took them", "Not stated."), ("Because they were wet", "Not stated.")],
   "Dana advised, “Just talk like you’re telling me.”", "Link actions to earlier advice.", "G5-P1")
mc("inference", "RL.5.1", 3, "What can you infer about Hamdan at the start of “The Two Wells”?",
   "He cares more about money than about his neighbors.", [("He is generous.", "He charges for water."), ("He is poor.", "He is rich."), ("He dislikes water.", "He sells it.")],
   "He charges a silver coin even as poor families go thirsty.", "Actions reveal values.", "G5-P7")
tf("inference", "RL.5.1", 5, "In “The Last Repair,” the captain is pleased with Khalid’s work.", True,
   "“The captain’s smile told him everything.”", "Facial expressions support inferences.", "G5-P6")
mc("inference", "RI.5.1", 6, "Why did the news report most likely include “No injuries were reported”?",
   "To reassure readers that no one was hurt", [("To show the storm was weak", "It was powerful."), ("To blame the city", "No blame is given."), ("To describe Rania’s family", "The report does not mention her.")],
   "Reports often include safety information readers want.", "Think about what readers need to know.", "G5-P3")
mc("inference", "RL.5.1", 7, "In “City Morning,” why does the speaker say “That minute, friend, is mine”?",
   "The speaker treasures a quiet moment before the busy day.",
   [("The speaker owns the city.", "This is not literal."), ("The speaker is late for work.", "No lateness is suggested."), ("The speaker dislikes friends.", "The speaker addresses a friend warmly.")],
   "The last stanza contrasts the quiet golden sky with the loud day.", "Read the final lines in context.", "G5-P4")

# poetry elements (has L4) -> L1 L2 L3 L5 L6
mc("poetry-elements", "RL.5.5", 1, "How many stanzas are in “Harbor at Dawn”?",
   "two", [("one", "There is a break between two groups of lines."), ("three", "Count the groups."), ("eight", "Eight is the number of lines.")],
   "There are two groups of four lines.", "Stanzas are separated by blank lines.", "G5-P11")
mc("poetry-elements", "RL.5.5", 2, "Which pair of words rhymes in “Harbor at Dawn”?",
   "light / night", [("gulls / thread", "These do not rhyme."), ("ropes / breeze", "These do not rhyme."), ("boats / wet", "These do not rhyme.")],
   "“Light” and “night” end lines 1 and 2 and rhyme.", "Check line endings.", "G5-P11")
mc("poetry-elements", "RL.5.5", 3, "What is the rhyme pattern of “Harbor at Dawn”?",
   "rhyming pairs (couplets)", [("no rhyme at all", "Lines rhyme in pairs."), ("every other line", "Lines 1 and 2 rhyme, not 1 and 3."), ("only the last line", "Many lines rhyme.")],
   "light/night, thread/red, knees/breeze, wet/net.", "Couplets: two rhyming lines in a row.", "G5-P11")
mc("poetry-elements", "RL.5.5", 5, "In “City Morning,” how does the sentence run from stanza 2 into stanza 3?",
   "The question continues across the stanza break.", [("Each stanza is a separate sentence.", "The question spans two stanzas."), ("The poem has no punctuation.", "It does have punctuation."), ("Stanza 3 repeats stanza 2.", "It continues it.")],
   "“don’t you miss / The quiet way…” carries the thought into stanza 3 (enjambment).", "Lines and stanzas can continue a sentence.", "G5-P4")
mc("poetry-elements", "RL.5.5", 6, "How does the structure of “Harbor at Dawn” support its meaning?",
   "Two short rhyming stanzas move from the sky to the boats, like a scene slowly waking.",
   [("Each stanza tells a different character’s story.", "There are no characters."), ("The stanzas are numbered steps in a process.", "It is a description, not steps."), ("It has no stanzas.", "It has two.")],
   "Stanza 1 shows sky and town; stanza 2 the harbor sounds and boats waking.", "Ask how form and meaning work together.", "G5-P11")

# point of view (has L3 L6 L7) -> L2 L4 L5
mc("point-of-view", "RL.5.6", 2, "From what point of view is “The Two Wells” told?",
   "third person", [("first person", "No narrator says “I.”"), ("second person", "“You” is not used."), ("Salma’s first person", "Salma is “she.”")],
   "The narrator uses she, he and they.", "Pronouns reveal point of view.", "G5-P7")
mc("point-of-view", "RL.5.6", 4, "How does Rania’s first-person journal affect what readers learn?",
   "Readers learn her personal feelings, like fear and amazement.", [("Readers learn exact wind speeds.", "Those are in the report."), ("Readers learn every family’s story.", "She tells only her own."), ("Readers learn the officials’ plans.", "Not in the journal.")],
   "First person shares the narrator’s inner thoughts.", "Narrator choice shapes information.", "G5-P3")
mc("point-of-view", "RL.5.6", 5, "If “The Volcano That Would Not Erupt” were told by Ms. Dawood, what might change?",
   "We would see the scene from the teacher’s view, perhaps without knowing about the missing baking soda.",
   [("The volcano would be made of metal.", "Props would not change."), ("Layla would disappear.", "She stays in the events."), ("The science fair would be canceled.", "Events would not change.")],
   "A different narrator knows and notices different things.", "Imagine the story through another character.", "G5-P8")

# problem and solution (has L3 L4) -> L2 L5 L6 L7
mc("problem-solution", "RI.5.5", 2, "What is the solution in “The Two Wells”?",
   "The children dig a new well.", [("Hamdan builds a wall.", "That is the problem."), ("Families go thirsty.", "That is an effect of the problem."), ("The village moves.", "Not stated.")],
   "The new well gives free water.", "Solution = what fixes the problem.", "G5-P7")
tf("problem-solution", "RI.5.5", 5, "In the turtle article, the author gives a full solution for the problem of bright lights.", False,
   "The section explains the danger but does not describe a solution.", "Not every problem in a text is solved.", "G5-P10")
mc("problem-solution", "RI.5.5", 6, "How do cisterns and check dams solve the SAME problem in different ways?",
   "Cisterns store water in tanks; check dams help water soak into the ground.",
   [("Both pump water from wells.", "Neither is a pump."), ("Both make it rain more.", "Neither changes rainfall."), ("Cisterns are for animals only.", "Not stated.")],
   "Both save scarce rainwater, using storage or soil.", "Compare how two solutions work.", "G5-P2")
mc("problem-solution", "RI.5.5", 7, "Why does the author of the garden letter offer starting small with containers?",
   "To solve the problem that gardens may cost too much", [("To show gardens are useless", "The author supports gardens."), ("To make gardens larger", "It suggests starting small."), ("To save time on reading", "Not related.")],
   "This answers the cost objection with a practical solution.", "Persuasive texts can include solutions to objections.", "G5-P9")

# sequence (has L3 L4) -> L2 L5 L6 L7
mc("sequence", "RI.5.3", 2, "In “The Last Repair,” what happens right after the spring disappears?",
   "Khalid knocks a box of screws to the floor.", [("He finds the spring.", "That comes later."), ("The captain leaves the watch.", "That happened in the morning."), ("He closes the case.", "That comes at the end.")],
   "His panic follows immediately.", "Track time order.", "G5-P6")
order("sequence", "RI.5.3", 5, "Put the steps of collecting rainwater in a cistern in order.",
      ["Rain falls on the rooftop.", "Gutters guide the water into pipes.", "Pipes lead the water to the cistern.", "The covered tank keeps the water cool."],
      "The article describes the path from roof to tank.", "Follow the path of the water.", "G5-P2")
order("sequence", "RI.5.3", 6, "Put the events in the news report in time order.",
      ["The storm strikes early Thursday morning.", "Streets flood and power goes out.", "City crews begin clearing drains at 7 a.m.", "Electricity is restored by noon."],
      "The report moves from the storm to the recovery.", "Use times as clues.", "G5-P3")
mc("sequence", "RI.5.5", 7, "After a full moon, what happens next in the cycle described in the article?",
   "The pattern reverses until the next new moon.", [("The Moon becomes a crescent immediately.", "It shrinks gradually."), ("The Moon stops reflecting light.", "It always reflects light."), ("A full moon happens again the next night.", "The cycle takes 29.5 days.")],
   "The article says, “Then the pattern reverses until the next new moon.”", "Cycles return to their starting point.", "G5-P5")

# sound devices (has L5) -> L2 L3 L4 L6 L7
mc("sound-devices", "RL.5.4", 2, "Which line from “City Morning” uses onomatopoeia?",
   "“The coffee kettles hiss;”", [("“The city yawns and stretches wide,”", "This is personification."), ("“Above the rooftop line?”", "No sound word."), ("“That minute, friend, is mine.”", "No sound word.")],
   "“Hiss” imitates a sound.", "Onomatopoeia = sound words.", "G5-P4")
mc("sound-devices", "RL.5.4", 3, "Which words in “Harbor at Dawn” show alliteration?",
   "“salt and diesel… stitch the sky with silver”", [("“the last stars folding up the night”", "Mostly different sounds."), ("“fishing boats, still beaded wet”", "These words begin with different sounds."), ("“the bread oven breathes”", "Only two b words.")],
   "Many words repeat the s sound: stitch, sky, silver, salt.", "Listen for repeated beginning sounds.", "G5-P11")
mc("sound-devices", "RL.5.4", 4, "Which sound device appears in “Ropes creak”?",
   "onomatopoeia", [("rhyme", "There is no rhyme in these two words."), ("alliteration", "Different beginning sounds."), ("repetition", "No word repeats.")],
   "“Creak” imitates the sound of ropes.", "Sound words imitate real sounds.", "G5-P11")
match("sound-devices", "L.5.5", 6, "Match each example from “City Morning” with its sound device.",
      [("hiss", "Onomatopoeia"), ("busy, bustling, buzzing", "Alliteration"), ("wide / side", "Rhyme")],
      "Each example uses sound in a different way.", "Say each aloud.", passage="G5-P4")
mc("sound-devices", "RL.5.4", 7, "Why does the poet use the alliteration “busy, bustling, buzzing throng”?",
   "The repeated b sounds create a noisy, rushing feeling like a crowd.", [("To slow the poem down", "The sounds feel fast."), ("To describe silence", "The line is noisy."), ("To make the poem rhyme", "Alliteration is not rhyme.")],
   "The fast repeated b sounds echo the energy of the crowd.", "Sound devices support meaning.", "G5-P4")

# text evidence (has L5) -> L2 L3 L4 L6 L7
mc("text-evidence", "RL.5.1", 2, "Which sentence shows that the narrator of “The Second Try” was nervous at first?",
   "“My hands shook.”", [("“Heads lifted.”", "This describes the audience."), ("“I was smiling.”", "This shows success."), ("“Dana leaned over.”", "This describes Dana.")],
   "Shaking hands show nervousness.", "Choose evidence that directly shows the idea.", "G5-P1")
mc("text-evidence", "RI.5.1", 3, "Which sentence supports the idea that cisterns are an old invention?",
   "“Archaeologists have found cisterns that are more than two thousand years old.”", [("“Gutters on rooftops guide rainwater.”", "This explains how they work."), ("“Farmers build low walls of earth.”", "This is about check dams."), ("“Rain falls only a few times each year.”", "This is about the problem.")],
   "Two-thousand-year-old cisterns prove they are ancient.", "Match evidence to the claim.", "G5-P2")
mc("text-evidence", "RL.5.1", 4, "Which evidence shows that the villagers valued sharing?",
   "“they shared it freely, as they always had.”", [("“every bucket costs a silver coin.”", "This shows Hamdan’s view."), ("“Their hands blistered.”", "This shows effort."), ("“Hamdan’s gate stayed locked.”", "This describes Hamdan.")],
   "The villagers choose to share the new well freely.", "Quote words that prove the point.", "G5-P7")
ms("text-evidence", "RI.5.1", 6, "Which TWO quotations support the idea that the storm was serious?",
   ["“winds of up to 90 kilometers per hour”", "“power outages affecting about 4,000 homes”"],
   [("“No injuries were reported.”", "This shows safety, not seriousness."), ("“electricity was restored to most homes by noon.”", "This shows recovery.")],
   "High winds and many outages show a serious storm.", "Choose evidence that fits the claim.", "G5-P3")
mc("text-evidence", "RL.5.1", 7, "A student claims, “Layla learned from her mistake.” Which quotation is the STRONGEST evidence?",
   "“You check every step, and you never panic.”", [("“The judges come at ten o’clock.”", "This is about time."), ("“Everything is ruined!”", "This shows panic before learning."), ("“The baking soda… is still in my backpack.”", "This shows the mistake, not the lesson.")],
   "Her final line states what she learned.", "The best evidence directly proves the claim.", "G5-P8")

# theme (has L4 L6) -> L2 L3 L5 L7
mc("theme", "RL.5.2", 2, "What is a theme of “The Two Wells”?",
   "Sharing is worth more than profit.", [("Deserts are hot.", "This is a fact, not a theme."), ("Children should not dig.", "The children succeed."), ("Merchants are always kind.", "Hamdan is not kind at first.")],
   "Hamdan admits shared water is worth more than sold water.", "Theme = message about life.", "G5-P7")
mc("theme", "RL.5.2", 3, "Which detail BEST supports the theme of “The Last Repair”?",
   "“A watchmaker’s hands must be slower than the sand.”", [("“The narrow lanes smelled of sea salt.”", "This is setting."), ("“Uncle Faris had a fever.”", "This explains a situation."), ("“The ship’s horn sounded.”", "This is an event.")],
   "The uncle’s lesson about patience is the message of the story.", "Find the line that states the lesson.", "G5-P6")
mc("theme", "RL.5.2", 5, "What theme does “The Volcano That Would Not Erupt” express?",
   "Staying calm and checking your work helps you solve problems.",
   [("Science fairs are unfair.", "The judges are not unfair."), ("Volcanoes are dangerous.", "It is a model volcano."), ("Partners always cause problems.", "Yusuf helps solve it.")],
   "Layla’s last line states the lesson: check every step and never panic.", "A theme is a message about life.", "G5-P8")
mc("theme", "RL.5.2", 7, "How does the turtle memory in “The Second Try” help develop the theme?",
   "The turtles keep going after being knocked back, just as the narrator does.", [("It shows turtles are dangerous.", "Not the point."), ("It explains how to give a speech.", "It is about persistence."), ("It distracts from the story.", "It is central to the theme.")],
   "“Being knocked back… isn’t the same as being beaten.”", "Symbols and memories can carry themes.", "G5-P1")

# =============================================================== vocabulary

# context clues (has L3 L4 L5 L6) -> L2 L7
mc("context-clues", "L.5.4.a", 2, "Read: “The puppy was so lethargic after the long walk that it slept all afternoon.” What does lethargic mean?",
   "very tired and slow", [("very excited", "It slept all afternoon."), ("very hungry", "Food is not mentioned."), ("very loud", "Sleeping is quiet.")],
   "The clue “slept all afternoon” shows tiredness.", "Use the effect described in the sentence.")
mc("context-clues", "L.5.4.a", 7, "Read: “Unlike his loquacious cousin, who chatted for hours, Tamer rarely spoke more than a few words.” What does loquacious mean?",
   "very talkative", [("very quiet", "The cousin chatted for hours."), ("very rude", "Rudeness is not described."), ("very tall", "Height is not mentioned.")],
   "The contrast word “Unlike” and “chatted for hours” show the meaning.", "Contrast clues show the opposite of a nearby word.")

# figurative language (has L3 L3 L4 L6) -> L2 L5
mc("figurative-language", "L.5.5.a", 2, "“The baker sings a sugared song.” What kind of figurative language describes the song as “sugared”?",
   "a metaphor suggesting the song is sweet", [("a simile using “like”", "There is no “like” or “as.”"), ("onomatopoeia", "“Sugared” is not a sound word."), ("a literal description", "Songs are not made of sugar.")],
   "The song is described as if it were sweet like sugar.", "Metaphors compare without like or as.", "G5-P4")
mc("figurative-language", "RL.5.4", 5, "In “Harbor at Dawn,” what does “The harbor yawns” suggest?",
   "The harbor is just waking up, like a sleepy person.", [("The harbor is bored.", "It suggests waking at dawn."), ("The harbor is wide open and empty forever.", "It is morning activity starting."), ("The harbor makes a loud noise.", "Yawning is quiet.")],
   "Personification gives the harbor a human action at dawn.", "Personification gives human traits to things.", "G5-P11")

# Greek and Latin roots (has L3 L5 L6) -> L2 L4 L7
mc("greek-latin-roots", "L.5.4.b", 2, "The Latin root “aqua” means water. Which word names a tank for fish?",
   "aquarium", [("auditorium", "aud = hear."), ("planetarium", "Related to planets."), ("terrarium", "terra = earth or land.")],
   "aqua (water) + -arium (place) = aquarium.", "Roots carry the core meaning.")
mc("greek-latin-roots", "L.5.4.b", 4, "The Greek root “chron” means time. What is a chronological list?",
   "a list in time order", [("a list in size order", "That would not use chron."), ("a list of colors", "Not related."), ("a list in alphabetical order", "That is alphabetical.")],
   "chron (time) → in the order things happened.", "Think of chronicle, chronometer.")
mc("greek-latin-roots", "L.5.4.b", 7, "Using roots, what does “benevolent” most likely mean?",
   "wishing to do good for others",
   [("wishing harm on others", "bene = good, not harm."), ("very strong", "Not related to strength."), ("able to fly", "Not related.")],
   "bene (good) + vol (wish) = wishing good.", "Combine root meanings to define new words.")

# homographs and homophones (has L4 L5) -> L2 L3 L6 L7
dd("homographs-homophones", "L.5.5.c", 2, "Choose the correct word: “The hikers walked for an ____.”",
   "hour", [("our", "“Our” shows ownership."), ("are", "This is a verb."), ("ower", "This is not a word.")],
   "“Hour” means sixty minutes.", "Homophones sound alike but differ in meaning.")
mc("homographs-homophones", "L.5.5.c", 3, "In which sentence does “lead” rhyme with “bed”?",
   "The pencil’s lead broke during the test.", [("The guide will lead us up the trail.", "Here it rhymes with “seed.”"), ("Please lead the line to lunch.", "This means to guide."), ("Who will lead the team?", "This means to guide.")],
   "Lead (the metal or pencil core) rhymes with bed.", "Homographs can have different pronunciations.")
mc("homographs-homophones", "L.5.5.c", 6, "“The farm was used to produce produce.” How do the two words differ?",
   "The first is a verb (make); the second is a noun (fruits and vegetables), with different stress.",
   [("They mean the same thing.", "One is an action and one is food."), ("Both are nouns.", "The first is a verb."), ("They are spelled differently.", "They are spelled the same.")],
   "pro-DUCE (verb) vs. PRO-duce (noun).", "Stress can change with part of speech.")
err("homographs-homophones", "L.5.5.c", 7, ["The principle", " announced that", " the school", " would close early."], 0, "The principal",
    "A principal is the head of a school; a principle is a rule or belief.", "Principal = a pal who leads the school.")

# idioms and adages (has L4 L5 L6) -> L2 L3 L7
mc("idioms-adages", "L.5.5.b", 2, "What does “under the weather” mean?",
   "feeling sick", [("standing in the rain", "Not literal."), ("very happy", "Opposite meaning."), ("checking the forecast", "Not literal.")],
   "“Under the weather” means feeling unwell.", "Idioms are not literal.")
mc("idioms-adages", "L.5.5.b", 3, "Maryam “spilled the beans” about the surprise party. What did she do?",
   "She told the secret.", [("She dropped food.", "Not literal."), ("She cooked dinner.", "Not related."), ("She hid the gifts.", "Opposite meaning.")],
   "To spill the beans is to reveal a secret.", "Use context to understand idioms.")
match("idioms-adages", "L.5.5.b", 7, "Match each proverb with its meaning.",
      [("Look before you leap", "think carefully before acting"), ("Many hands make light work", "working together makes jobs easier"),
       ("Don’t judge a book by its cover", "don’t judge by appearances"), ("Better late than never", "doing something late is better than not doing it")],
      "Proverbs share advice about life.", "Think of a situation where each applies.")

# prefixes (has L2) -> L1 L3 L4 L5 L6
dd("prefixes", "L.5.4.b", 1, "Choose the word that means “not possible”: “Climbing that cliff without ropes is ____.”",
   "impossible", [("possibly", "-ly makes an adverb meaning “perhaps.”"), ("unpossible", "This is not a word; the prefix for “possible” is im-."), ("repossible", "This is not a word.")],
   "im- means not: impossible = not possible.", "Before p, b or m, “not” is often spelled im-.")
dd("prefixes", "L.5.4.b", 3, "Choose the word that means “to spell wrongly”: “Be careful not to ____ the new words.”",
   "misspell", [("respell", "re- means again."), ("unspell", "This is not a word."), ("prespell", "This is not a word.")],
   "mis- means wrongly.", "mis- = wrongly.")
mc("prefixes", "L.5.4.b", 4, "What does “nonfiction” mean?",
   "writing that is not made up", [("writing that is made up", "That is fiction."), ("writing about the future", "Not the meaning."), ("poems", "Poems can be fiction or not.")],
   "non- means not: not fiction.", "non- = not.")
match("prefixes", "L.5.4.b", 5, "Match each prefix with its meaning.",
      [("pre-", "before"), ("dis-", "opposite of"), ("over-", "too much"), ("non-", "not")],
      "Prefixes change the meaning of base words.", "Use example words: preview, disagree, overflow, nonstop.")
mc("prefixes", "L.5.4.b", 6, "Which word means “to judge someone before knowing them”?",
   "prejudge", [("rejudge", "re- means again."), ("misjudge", "mis- means wrongly, not before."), ("unjudge", "This is not a word.")],
   "pre- (before) + judge = judge beforehand.", "Choose the prefix that matches the meaning.")

# synonyms and antonyms (has L4) -> L1 L2 L3 L5 L6
mc("synonyms-antonyms", "L.5.5.c", 1, "Which word is a synonym for “shout”?",
   "yell", [("whisper", "This is an antonym."), ("listen", "Different meaning."), ("sing", "Different meaning.")],
   "Shout and yell both mean to speak very loudly.", "Synonyms = similar meanings.")
mc("synonyms-antonyms", "L.5.5.c", 2, "Which word is an antonym for “visible”?",
   "hidden", [("seen", "This is a synonym."), ("clear", "Similar meaning."), ("bright", "Not an opposite.")],
   "Visible means able to be seen; hidden means not seen.", "Antonyms = opposites.")
mc("synonyms-antonyms", "L.5.5.c", 3, "Which word is the BEST synonym for “furious”?",
   "enraged", [("annoyed", "Annoyed is weaker."), ("calm", "This is an antonym."), ("tired", "Different meaning.")],
   "Furious and enraged both mean extremely angry.", "Match the strength of the feeling.")
match("synonyms-antonyms", "L.5.5.c", 5, "Match each word with its SYNONYM.",
      [("swift", "fast"), ("ancient", "old"), ("courageous", "brave"), ("gigantic", "huge")],
      "Each pair has a similar meaning.", "Synonyms can replace each other in a sentence.")
mc("synonyms-antonyms", "L.5.5.c", 6, "Which pair shows antonyms with the strongest contrast?",
   "scorching / freezing", [("warm / cool", "These are mild opposites."), ("hot / warm", "These are similar."), ("cold / chilly", "These are similar.")],
   "Scorching and freezing are extreme opposites.", "Antonyms can show degrees of contrast.")

# ============================================================== word study

# spelling (has L2 L4 L5) -> L1 L3 L6
mc("spelling", "L.5.2.e", 1, "Which word is spelled correctly?",
   "neighbor", [("nieghbor", "e before i in neighbor."), ("naybor", "Misspelled."), ("neighbour", "This is British spelling; use neighbor here.")],
   "neighbor: n-e-i-g-h-b-o-r.", "Weigh and neighbor: ei says long a.")
fill("spelling", "L.5.2.e", 3, "Add -ly to happy: “The children played ____.”",
     ["happily"], "Change y to i before adding -ly: happily.", "Consonant + y → i before a suffix.")
mc("spelling", "RF.5.3.a", 6, "Which sentence has every word spelled correctly?",
   "Our committee will definitely receive the separate reports.",
   [("Our comittee will definitely receive the separate reports.", "committee has double m and double t."),
    ("Our committee will definately receive the separate reports.", "definitely: -nite-."),
    ("Our committee will definitely recieve the seperate reports.", "receive (ei after c) and separate.")],
   "committee, definitely, receive, separate are tricky words spelled correctly.", "Check commonly misspelled words carefully.")

# ============================================================ precise language

mc("precise-language", "L.5.3", 2, "Which word is more precise than “walked” in: “The tired hiker ____ up the hill”?",
   "trudged", [("went", "Not more precise."), ("moved", "Not more precise."), ("did", "Not a movement word.")],
   "“Trudged” shows slow, heavy walking.", "Choose verbs that show how.")
mc("precise-language", "L.5.3", 3, "Which sentence uses the most precise language?",
   "The hawk swooped down and snatched a lizard from the rock.",
   [("The bird went down and got something.", "Vague."), ("The bird did a thing.", "Very vague."), ("The bird moved fast.", "General.")],
   "Specific nouns (hawk, lizard) and verbs (swooped, snatched) create a clear picture.", "Replace general words with exact ones.")
mc("precise-language", "W.5.2.d", 4, "Which domain-specific word fits a science report? “The water turned into vapor through ____.”",
   "evaporation", [("disappearing", "Too informal."), ("going away", "Vague."), ("magic", "Not scientific.")],
   "Evaporation is the scientific term.", "Use subject-specific vocabulary in reports.")
mc("precise-language", "W.5.2.d", 6, "Which revision is MOST precise for a report? “A lot of people came to the event.”",
   "About 1,200 visitors attended the science fair.", [("Tons of people came to the event.", "Informal and vague."), ("Many people came.", "Still vague."), ("People came to the thing.", "Vague.")],
   "Exact numbers and specific nouns make writing precise.", "Replace “a lot” with a number.")
mc("precise-language", "L.5.3", 7, "Which sentence uses precise language to create a formal tone?",
   "The committee postponed the meeting because of the sandstorm warning.",
   [("They put off the meeting ’cause of the storm thing.", "Informal and vague."), ("The meeting got moved, like, later.", "Informal."), ("Stuff happened, so no meeting.", "Vague and informal.")],
   "Precise verbs (postponed) and nouns (sandstorm warning) suit formal writing.", "Formal writing avoids slang.")


# ============================================================ NAFS topup 2: V.SYNANT / RC.DETAIL / IAE.INFER
# Grows three thin NAFS-mapped skills: synonyms-antonyms (NAFS.V.SYNANT), text-evidence
# (NAFS.RC.DETAIL) and character / character-perspective / make-predictions (NAFS.IAE.INFER).
# All reading items here are self-contained (a short original excerpt inside the stem), so
# they do not depend on the existing numbered passages.

# ---- synonyms-antonyms (NAFS.V.SYNANT) ----
mc("synonyms-antonyms", "L.5.5.c", 1, "Which word is a synonym for “anxious”?",
   "nervous", [("confident", "Confident is close to the opposite of anxious."), ("joyful", "Joyful is a different, positive feeling."), ("tired", "Tired is a different meaning, about energy.")],
   "Anxious and nervous both describe feeling worried or uneasy.", "Synonyms describe the same feeling or idea in different words.")
mc("synonyms-antonyms", "L.5.5.c", 3, "Which word is an antonym for “humble”?",
   "arrogant", [("modest", "Modest is a synonym of humble."), ("shy", "Shy is not the opposite of humble."), ("quiet", "Quiet is unrelated to humility.")],
   "Humble means not boastful; arrogant means overly proud — opposites.", "Think of someone who brags constantly — that is the opposite of humble.")
dd("synonyms-antonyms", "L.5.5.c", 2, "Choose the synonym: “The lion crept ____ (quietly) toward its prey.”",
   "stealthily", [("loudly", "This is an antonym."), ("quickly", "This describes speed, not quietness."), ("clumsily", "This describes awkwardness, not quietness.")],
   "Stealthily means moving in a quiet, sneaky way, matching “quietly.”", "Replace the word in parentheses and see which choice keeps the same meaning.")
match("synonyms-antonyms", "L.5.5.c", 4, "Match each word with its SYNONYM.",
      [("vast", "enormous"), ("fragile", "delicate"), ("eager", "enthusiastic"), ("reluctant", "unwilling")],
      "Each pair describes almost the same idea.", "Try substituting one word for the other in a sentence to test if they match.")
tf("synonyms-antonyms", "L.5.5.c", 2, "A generous classmate shares her lunch without being asked, while a stingy classmate refuses to lend even a pencil. True or false: this contrast means “generous” and “stingy” are synonyms.", False,
   "Generous means willing to give; stingy means unwilling to share — these are opposites.",
   "If two words describe opposite behavior with money or gifts, they are antonyms.")
mc("synonyms-antonyms", "L.5.5.c", 3, "Which word is a synonym for “stubborn”?",
   "obstinate", [("agreeable", "Agreeable is close to the opposite of stubborn."), ("curious", "Curious is a different meaning, about wanting to know."), ("cheerful", "Cheerful is a different, unrelated feeling.")],
   "Stubborn and obstinate both describe refusing to change one’s mind.", "Some synonyms sound more formal than the original word, like obstinate for stubborn.")
mc("synonyms-antonyms", "L.5.5.c", 4, "Which word is an antonym for “cautious”?",
   "reckless", [("careful", "Careful is a synonym of cautious."), ("curious", "Curious is an unrelated meaning."), ("calm", "Calm is not necessarily the opposite of cautious.")],
   "Cautious means careful to avoid danger; reckless means acting without thinking of danger — opposites.", "Picture someone driving carefully versus someone driving without any caution.")
dd("synonyms-antonyms", "L.5.5.c", 3, "Choose the antonym: “The desert was scorching at noon but ____ at midnight.”",
   "frigid", [("warm", "Warm is closer to scorching than its opposite."), ("damp", "Damp describes wetness, not temperature."), ("bright", "Bright describes light, not temperature.")],
   "Scorching means extremely hot; frigid means extremely cold — a strong contrast.", "Antonyms can show strong, dramatic opposites, like scorching and frigid.")
mc("synonyms-antonyms", "L.5.5.c", 2, "Which word is a synonym for “exhausted”?",
   "drained", [("energetic", "This is an antonym."), ("curious", "This is unrelated."), ("confused", "This is an unrelated meaning.")],
   "Exhausted and drained both describe having no energy left.", "Look for words that both describe the same level of tiredness.")
match("synonyms-antonyms", "L.5.5.c", 5, "Match each word with its ANTONYM.",
      [("vast", "tiny"), ("cautious", "reckless"), ("humble", "arrogant"), ("generous", "stingy")],
      "Each pair has opposite meanings.", "Check that the meanings are true opposites, not just different.")
mc("synonyms-antonyms", "L.5.5.c", 3, "Read: “Compared to her shy younger brother, Dana was remarkably outgoing at the family gathering.” Which word is closest in meaning to “outgoing” as used here?",
   "sociable", [("nervous", "This is the opposite of outgoing in this context."), ("quiet", "This describes shy, the opposite of outgoing."), ("tired", "This is an unrelated meaning.")],
   "Outgoing and sociable both describe someone who enjoys talking with others.", "Use the contrast with “shy” in the sentence as a clue to the opposite meaning.")
mc("synonyms-antonyms", "L.5.5.c", 4, "Which word is an antonym for “transparent” (as in see-through)?",
   "opaque", [("clear", "Clear is a synonym of transparent."), ("colorful", "Colorful is unrelated to transparency."), ("shiny", "Shiny is unrelated to whether light passes through.")],
   "Transparent means light passes through; opaque means light cannot pass through — opposites.", "Picture glass (transparent) compared to a brick wall (opaque).")
tf("synonyms-antonyms", "L.5.5.c", 3, "A volunteer who is “eager” races to sign up first, but a volunteer who is “reluctant” drags their feet and hopes nobody notices. True or false: these two behaviors show the words are antonyms.", True,
   "Eager means wanting to do something very much; reluctant means not wanting to do it — opposite feelings.",
   "Antonyms often describe opposite levels of willingness.")
mc("synonyms-antonyms", "L.5.5.c", 2, "Which word is a synonym for “vast”?",
   "immense", [("narrow", "Narrow describes width, closer to an antonym of vast."), ("short", "Short describes length or height, not size overall."), ("bright", "Bright is unrelated to size.")],
   "Vast and immense both describe something extremely large.", "Synonyms for size describe the same scale, whether big or small.")
dd("synonyms-antonyms", "L.5.5.c", 4, "Choose the synonym: “The detective made a ____ (correct) guess about the thief.”",
   "accurate", [("careless", "This is closer to the opposite of correct."), ("quick", "This describes speed, not correctness."), ("funny", "This is an unrelated meaning.")],
   "Accurate and correct both describe being right or exact.", "Match the meaning given in parentheses, not just a similar-sounding word.")

# ---- text-evidence (NAFS.RC.DETAIL) ----
mc("text-evidence", "RI.5.1", 3, "Read: “Coral reefs cover less than 1 percent of the ocean floor, yet they support about 25 percent of all known marine species.” Which detail is evidence that coral reefs are vital to ocean life?",
   "“they support about 25 percent of all known marine species.”",
   [("“Coral reefs cover less than 1 percent of the ocean floor.”", "This shows how small reefs are, not how important they are."), ("“the ocean floor.”", "This is only part of the sentence."), ("“marine species.”", "This names a topic, not evidence of importance.")],
   "Supporting a quarter of all marine species despite their tiny size shows how vital reefs are.", "Compare the small space with the large effect to see the real evidence.")
ms("text-evidence", "RI.5.1", 4, "Read: “Microplastics have been found in Arctic sea ice and in rainwater collected far from any city. Scientists are still studying their effects on human health, and some researchers use special microscopes to detect the tiny particles.” Which TWO details show that microplastic pollution has spread very widely?",
   ["“found in Arctic sea ice”", "“rainwater collected far from any city”"],
   [("“Scientists are still studying their effects on human health.”", "This is about ongoing research, not about how widespread the pollution is."), ("“some researchers use special microscopes to detect the tiny particles.”", "This describes a research method, not the spread of pollution.")],
   "Finding microplastics in the Arctic and in rainwater far from cities shows pollution has reached remote places.", "Choose evidence that matches the exact claim — here, how far pollution has spread.")
mc("text-evidence", "RL.5.1", 3, "Read: “Dana’s heart pounded as she walked toward the microphone, but when she saw her best friend give her a thumbs-up from the front row, her shoulders relaxed.” Which detail shows that Dana’s friend helped calm her nerves?",
   "“when she saw her best friend give her a thumbs-up... her shoulders relaxed.”",
   [("“Dana’s heart pounded as she walked toward the microphone.”", "This shows nervousness before her friend’s support."), ("“she walked toward the microphone.”", "This is only an action."), ("“the front row.”", "This only tells where her friend sat.")],
   "Her shoulders relaxing right after seeing the thumbs-up shows the support helped calm her.", "Find the detail that happens right after the cause you are checking.")
mc("text-evidence", "RI.5.1", 4, "Read: “Ancient cisterns carved from rock could hold over two million liters of rainwater. Archaeologists have found some still partly filled after thousands of years.” Which detail supports the idea that these cisterns were built extremely well?",
   "“Archaeologists have found some still partly filled after thousands of years.”",
   [("“Ancient cisterns carved from rock could hold over two million liters of rainwater.”", "This shows large capacity, not lasting quality."), ("“rainwater.”", "This names what they held, not evidence of quality."), ("“thousands of years.”", "This only names a span of time without context.")],
   "Still holding water after thousands of years proves the cisterns were extremely well built.", "Evidence of lasting quality usually mentions how something performs over time.")
tf("text-evidence", "RL.5.1", 2, "Read: “Khalid double-checked the rope, tested each knot twice, and only then let his younger cousin begin the climb.” True or false: this detail shows that Khalid was careless about his cousin’s safety.", False,
   "Double-checking the rope and testing each knot shows Khalid was extremely careful, not careless.",
   "Compare the statement to what the text actually describes.")
mc("text-evidence", "RI.5.1", 3, "Read: “A single beehive can produce more than 25 kilograms of honey in one season, and the bees travel the equivalent of several times around the world to collect enough nectar.” Which detail shows how much effort bees put into making honey?",
   "“the bees travel the equivalent of several times around the world to collect enough nectar.”",
   [("“A single beehive can produce more than 25 kilograms of honey in one season.”", "This shows the amount of honey, not the effort of travel."), ("“one season.”", "This only names a time period."), ("“nectar.”", "This names what they collect, not the amount of effort.")],
   "Traveling the distance of several trips around the world shows an enormous amount of effort.", "Separate the result (honey) from the evidence about the process (travel).")
ms("text-evidence", "RL.5.1", 5, "Read: “During the group hike, Omar carried extra water for anyone who ran low, counted the trail markers out loud for fun, and gave up his own seat on the final bus ride.” Which TWO details show that Omar was thoughtful of others during the trip?",
   ["“carried extra water for anyone who ran low”", "“gave up his own seat on the final bus ride”"],
   [("“counted the trail markers out loud for fun.”", "This is a personal habit, not an act of kindness toward others."), ("“During the group hike.”", "This only tells when, not an action showing thoughtfulness.")],
   "Sharing water and giving up his seat are both actions that put others’ needs first.", "Look for actions that directly benefit someone else, not just personal habits.")
mc("text-evidence", "RI.5.1", 4, "Read: “Villagers built small stone walls across dry streambeds to slow rushing rainwater, giving it time to soak into the ground instead of running off.” Which detail explains the PURPOSE of the stone walls?",
   "“giving it time to soak into the ground instead of running off.”",
   [("“Villagers built small stone walls across dry streambeds.”", "This describes the action, not the purpose."), ("“rushing rainwater.”", "This names the problem, not the reason for the walls."), ("“dry streambeds.”", "This only names the location.")],
   "Letting water soak in instead of running off is the stated purpose of the walls.", "A purpose explains WHY something was done, not just what was done.")
mc("text-evidence", "RL.5.1", 3, "Read: “Layla read the instructions three times and laid out every tool in order before she finally picked up the screwdriver.” Which detail BEST shows that Layla was being methodical?",
   "“read the instructions three times and laid out every tool in order”",
   [("“picked up the screwdriver.”", "This is just the final step, not evidence of careful planning."), ("“only then.”", "This is a transition word, not evidence by itself."), ("Layla", "This just names the character.")],
   "Reading instructions multiple times and organizing tools before starting shows careful, methodical behavior.", "Look for repeated or extra careful actions before the main task begins.")
tf("text-evidence", "RI.5.1", 3, "Read: “Urban gardens can lower a neighborhood’s summer temperature by several degrees because plants release moisture that cools the surrounding air.” True or false: the text explains a reason why urban gardens cool their neighborhoods.", True,
   "The text gives the reason — plants releasing moisture — which explains how gardens cool the air.",
   "A ‘because’ clause usually signals the reason the text is giving.")
mc("text-evidence", "RI.5.1", 4, "Read: “After the new traffic light was installed, the number of accidents at the intersection dropped from twelve per year to only two.” Which detail is the strongest evidence that the traffic light improved safety?",
   "“the number of accidents at the intersection dropped from twelve per year to only two.”",
   [("“After the new traffic light was installed.”", "This only tells when, not the result."), ("“the intersection.”", "This only names the location."), ("“twelve per year.”", "This is only part of the comparison, not the full evidence.")],
   "The sharp drop in accidents, compared before and after, is the clearest evidence of improved safety.", "Look for numbers that are compared before and after a change.")
mc("text-evidence", "RL.5.1", 4, "Read: “Hamdan insisted the new well belonged to everyone, even though he had paid for most of the digging himself.” Which detail shows that Hamdan valued the community over his own gain?",
   "“he insisted the new well belonged to everyone, even though he had paid for most of the digging himself.”",
   [("“the new well.”", "This only names the object."), ("“the digging.”", "This names an action, not evidence of his values."), ("“himself.”", "This is only a pronoun, not evidence.")],
   "Sharing something he paid for shows he values the community more than personal profit.", "Look for a contrast between what a character could have kept and what they chose to do.")
ms("text-evidence", "RI.5.1", 5, "Read: “Solar panels need very little maintenance, but they produce far less electricity on cloudy days, and the panels themselves are expensive to install at first.” Which TWO details describe a DRAWBACK of solar panels?",
   ["“they produce far less electricity on cloudy days”", "“the panels themselves are expensive to install at first”"],
   [("“Solar panels need very little maintenance.”", "This describes an advantage, not a drawback.")],
   "Less electricity on cloudy days and high installation cost are both disadvantages mentioned in the text.", "Separate the advantages from the disadvantages before choosing.")
mc("text-evidence", "RL.5.1", 3, "Read: “Noor’s drawing won no ribbon at the fair, but she pinned it above her desk anyway and started sketching a new one that same evening.” Which detail shows that Noor did not let disappointment stop her?",
   "“she pinned it above her desk anyway and started sketching a new one that same evening.”",
   [("“Noor’s drawing won no ribbon at the fair.”", "This describes the disappointment, not her response to it."), ("“the fair.”", "This only names the event."), ("“a new one.”", "This is only part of the sentence.")],
   "Starting a new drawing right away, instead of giving up, shows she kept going despite disappointment.", "Look for what a character does immediately AFTER a setback.")
mc("text-evidence", "RI.5.1", 3, "Read: “Public libraries lend more than just books; many now lend tools, musical instruments, and even seeds for home gardens.” Which detail supports the idea that libraries offer more than books?",
   "“many now lend tools, musical instruments, and even seeds for home gardens.”",
   [("“Public libraries lend more than just books.”", "This states the claim itself, not the supporting evidence."), ("“books.”", "This is the opposite of what the detail should show."), ("“home gardens.”", "This is only part of the list, not full evidence.")],
   "Naming specific items beyond books — tools, instruments, seeds — proves libraries offer more.", "The supporting evidence gives specific examples, not just a repeated claim.")

# ---- character / character-perspective / make-predictions (NAFS.IAE.INFER) ----
mc("character", "RL.5.3", 3, "Read: “When the team captain was injured, Rania quietly took over organizing practices without ever mentioning it to the coach, letting him think he had planned it himself.” Which word best describes Rania?",
   "modest", [("boastful", "Boastful would mean bragging, the opposite of hiding her role."), ("careless", "Taking over organizing shows responsibility, not carelessness."), ("jealous", "Nothing shows jealousy of the captain.")],
   "Rania does important work without taking credit, showing she is modest.", "Notice whether a character seeks credit for their actions or avoids it.")
mc("character", "RL.5.3", 4, "Read: “Faisal spent his Saturday rebuilding the neighbor’s fence that his dog had knocked down, refusing any payment for his time.” Which word best describes Faisal?",
   "responsible", [("stingy", "Refusing payment shows generosity, the opposite of stingy."), ("lazy", "Spending a Saturday rebuilding a fence is the opposite of lazy."), ("proud", "Nothing shows him bragging about it.")],
   "Taking responsibility for his dog’s damage and fixing it himself shows Faisal is responsible.", "A character’s response to a mistake — theirs or someone else’s — often reveals a trait.")
tf("character", "RL.5.3", 2, "Read: “Yara read the entire instruction manual twice before assembling the bookshelf, even though her brother said it was a waste of time.” True or false: this detail shows Yara is impulsive.", False,
   "Reading instructions carefully twice shows she is careful and thorough, not impulsive.",
   "Impulsive means acting quickly without thinking; look for the opposite behavior here.")
mc("character", "RL.5.3", 3, "Read: “Even after losing the chess match for the third time, Khalid asked his opponent to explain the winning move so he could learn from it.” Which word best describes Khalid?",
   "determined", [("sore", "Asking to learn shows he accepts the loss well, not that he is a bad loser."), ("careless", "Wanting to understand his mistake is the opposite of careless."), ("arrogant", "Asking for help shows humility, not arrogance.")],
   "Wanting to learn from repeated losses instead of giving up shows determination.", "Look at how a character handles failure to find a trait.")
mc("character", "RL.5.3", 4, "Read: “Dalia noticed her little cousin struggling with his shoelaces at the party, so she knelt down and showed him the trick slowly, twice, without anyone asking her to.” Which word best describes Dalia?",
   "caring", [("impatient", "Showing him slowly and twice shows patience, not impatience."), ("shy", "Kneeling down to help in front of others shows confidence, not shyness."), ("bossy", "Helping gently is not the same as being bossy.")],
   "Noticing someone’s struggle and helping patiently, without being asked, shows caring.", "An unprompted act of kindness is strong evidence of a caring trait.")
mc("character-perspective", "RL.5.6", 3, "Read: “The whole class groaned when the teacher announced a surprise quiz, but Amira pulled out a pencil calmly, since she had reviewed her notes every night that week.” What is Amira’s perspective on the surprise quiz?",
   "She is not worried, because she feels prepared.",
   [("She is upset like the rest of the class.", "Her calm reaction is different from the class’s groaning."), ("She is confused about what a quiz is.", "Nothing suggests confusion."), ("She thinks the quiz is unfair.", "Nothing in the text shows this opinion.")],
   "Her calm reaction, explained by her nightly review, shows she feels prepared rather than worried.", "When a character reacts differently from the group, look for a reason given in the text.")
mc("character-perspective", "RL.5.6", 4, "Read: “Tariq thought the old clock tower should be torn down because it no longer worked, but his grandfather believed it should stay because it reminded the town of its history.” How do Tariq and his grandfather see the clock tower differently?",
   "Tariq values its usefulness, while his grandfather values its connection to history.",
   [("Both think it should be torn down.", "The grandfather wants it to stay."), ("Both value its history equally.", "Tariq focuses on it no longer working, not its history."), ("Tariq wants to keep it, and the grandfather wants it removed.", "This is the opposite of what the text says.")],
   "Tariq judges the tower by whether it works; his grandfather judges it by its meaning to the town.", "Compare the REASON each character gives for their opinion.")
tf("character-perspective", "RL.5.6", 2, "Read: “The coach called the scrimmage a success, but Sara kicked the grass and would not meet anyone’s eyes afterward.” True or false: Sara agrees with the coach’s view of the scrimmage.", False,
   "Sara’s frustrated body language shows she does not share the coach’s positive view.",
   "A character’s actions can reveal a perspective that contradicts what another character says.")
mc("character-perspective", "RL.5.6", 3, "Read: “Grandma Zainab called the crowded, noisy souk ‘wonderfully alive,’ while her grandson Omar found it exhausting and could not wait to leave.” How is Omar’s perspective different from his grandmother’s?",
   "Grandma Zainab enjoys the souk’s energy, while Omar finds it tiring.",
   [("Both enjoy the souk equally.", "Omar wants to leave, showing he does not enjoy it as much."), ("Omar loves the noise, and Grandma Zainab hates it.", "This is the opposite of the text."), ("Neither of them likes the souk.", "Grandma Zainab calls it wonderfully alive.")],
   "The same experience feels exciting to one character and exhausting to the other.", "The same event can feel different depending on who is experiencing it.")
mc("character-perspective", "RL.5.6", 5, "A story about a school trip is told only through the diary entries of one student, Huda. How would the story change if it also included her teacher’s diary entries?",
   "Readers would also learn the teacher’s private thoughts and concerns about the trip.",
   [("The events of the trip would change.", "Adding another perspective does not change what happened."), ("Huda’s diary entries would disappear.", "Her entries would likely remain alongside the teacher’s."), ("The trip’s location would change.", "Perspective does not affect where the story takes place.")],
   "Adding a second point of view lets readers hear another character’s private thoughts, not just events.", "More than one perspective means readers hear more than one character’s inner thoughts.")
mc("make-predictions", "RL.5.1", 3, "Read: “Sami had ignored every warning about the incoming sandstorm and left his bike outside the shed, uncovered, right next to the open gate.” What will most likely happen?",
   "The bike will likely be damaged or blown around by the sandstorm.",
   [("The bike will stay perfectly clean.", "Leaving it uncovered in a storm makes this unlikely."), ("The sandstorm will not affect the bike at all.", "This ignores the direct exposure described."), ("The gate will close itself.", "Nothing suggests this will happen.")],
   "Leaving a bike uncovered and exposed during a storm makes damage likely.", "Think about what usually happens when something is left exposed to a danger that was already warned about.")
tf("make-predictions", "RL.5.1", 2, "Read: “Lina had saved exactly half of the money for the bicycle and had three more months of allowance before the sale ended.” Based on this, it makes sense to predict that Lina will probably be able to afford the bicycle in time.", True,
   "If she already has half the money and has enough time left to save more, she will likely reach her goal.",
   "Predictions about money often depend on comparing what is saved with what is still needed and how much time is left.")
mc("make-predictions", "RL.5.1", 4, "Read: “Scientists noticed a volcano’s steam vents releasing gas more quickly than usual and recorded several small tremors over the past week.” What is the BEST prediction based on these clues?",
   "The volcano may be building toward a larger eruption soon.",
   [("The volcano has become completely safe.", "Increased gas and tremors suggest rising activity, not safety."), ("The volcano will stop all activity permanently.", "Nothing suggests activity is ending."), ("The tremors are unrelated to the volcano.", "The tremors are reported alongside the volcano’s activity, suggesting a connection.")],
   "Increasing gas release and small tremors are warning signs scientists use to predict a possible eruption.", "Combine several related clues, not just one, to make a stronger prediction.")
mc("make-predictions", "RL.5.1", 3, "Read: “Despite being told the bridge was closed for repairs, two hikers decided to climb over the barrier and cross it anyway.” Which detail BEST supports the prediction that the hikers are taking a serious risk?",
   "“despite being told the bridge was closed for repairs”",
   [("“two hikers decided to climb over the barrier.”", "This describes the action, but the warning about repairs is the stronger clue for risk."), ("“and cross it anyway.”", "This only confirms the action, not the specific danger."), ("“the bridge.”", "This only names the object.")],
   "Ignoring a warning about repairs, specifically, is what signals real danger ahead.", "Look for the exact detail that names the danger, not just the action taken.")
mc("make-predictions", "RL.5.1", 4, "Read: “After weeks of drought, dark clouds finally gathered over the dry farmland, and the wind carried the smell of rain for the first time in a month.” What will most likely happen next?",
   "It will probably rain soon, bringing relief to the farmland.",
   [("The drought will continue with no change.", "The clouds and smell of rain suggest a change is coming."), ("A sandstorm will begin instead.", "Nothing in the text mentions sand or a storm of that kind."), ("The farmland will flood immediately.", "A first rain after a drought does not usually cause sudden flooding.")],
   "Dark clouds and the smell of rain are classic signs that rain is about to fall.", "Weather predictions often rely on recognizing familiar signs described in the text.")
