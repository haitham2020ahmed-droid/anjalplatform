"""
Grade 6 question bank, top-up 1: brings every Grade 6 quiz skill to at least 6 items,
filling missing difficulty levels. Original items; reading items use existing Grade 6
passages (G6-P1 … G6-P8). Imported after all earlier modules.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

grade(6)

# ================================================================== grammar

# adjectives (has L2 L3) -> L1 L4 L5 L6
mc("adjectives", "L.6.1", 1, "Which word describes the noun “camel” in “The patient camel waited in the shade”?",
   "patient", [("waited", "This is the verb."), ("shade", "This is a noun."), ("The", "This is an article.")],
   "“Patient” tells what kind of camel.", "Adjectives describe nouns.")
mc("adjectives", "L.6.1", 4, "Which sentence uses a predicate adjective?",
   "The desert air felt cool after sunset.", [("The cool air arrived after sunset.", "“Cool” comes before the noun here."), ("Sunset came quickly.", "“Quickly” is an adverb."), ("We watched the sunset.", "There is no predicate adjective.")],
   "“Cool” follows the linking verb “felt” and describes the subject.", "Predicate adjectives follow linking verbs.")
dd("adjectives", "L.6.1", 5, "Choose the correct form: “Of the two routes, the coastal road is ____.”",
   "more scenic", [("most scenic", "With two items, use the comparative."), ("scenicer", "Long adjectives use “more.”"), ("more scenicer", "Never combine more with -er.")],
   "Comparing exactly two routes: more scenic.", "Two → comparative; three+ → superlative.")
err("adjectives", "L.6.1", 6, ["She bought", " a new, wooden,", " jewelry box", " in the souq."], 1, " a new wooden",
    "No comma between adjectives that are not coordinate (you would not say “new and wooden jewelry box” naturally), and never a comma before the noun.",
    "Use commas only between coordinate adjectives, and never before the noun.")

# clauses and complex sentences (has L5) -> L2 L3 L4 L6 L7
mc("clauses-complex", "L.6.1", 2, "Which clause is dependent? “Unless the bus arrives soon, we will be late.”",
   "Unless the bus arrives soon", [("we will be late", "This can stand alone."), ("the bus arrives", "This is part of the dependent clause."), ("we will", "This is incomplete.")],
   "“Unless” makes the clause dependent.", "Dependent clauses begin with subordinating conjunctions or relative pronouns.")
mc("clauses-complex", "L.6.1", 3, "Which sentence contains a relative clause?",
   "The coach who trained us retired this year.", [("The coach retired this year.", "No relative clause."), ("Because the coach retired, we were sad.", "This has an adverb clause."), ("The coach retired, and we were sad.", "This is compound.")],
   "“who trained us” describes the coach.", "Relative clauses begin with who, which, that, whose.")
dd("clauses-complex", "L.6.1", 4, "Choose the relative pronoun: “The book ____ cover is torn belongs to the library.”",
   "whose", [("who’s", "This means who is."), ("which", "This does not show possession."), ("that", "This does not show possession.")],
   "“Whose” shows the cover belongs to the book.", "whose = possession.")
mc("clauses-complex", "L.6.1", 6, "Which sentence is compound-complex?",
   "When the power failed, we lit candles, and Mariam told stories.",
   [("When the power failed, we lit candles.", "This is complex."), ("We lit candles, and Mariam told stories.", "This is compound."), ("We lit candles.", "This is simple.")],
   "It has two independent clauses and one dependent clause.", "Compound-complex = 2+ independent + 1+ dependent.")
mc("clauses-complex", "L.6.1", 7, "Which revision places the relative clause correctly to avoid confusion?",
   "The vase that my aunt made sat on the shelf.",
   [("The vase sat on the shelf that my aunt made.", "This suggests the aunt made the shelf."), ("That my aunt made, the vase sat on the shelf.", "The clause is misplaced."), ("The vase sat that my aunt made on the shelf.", "This is confusing.")],
   "A relative clause should sit right after the noun it describes.", "Place modifiers next to what they modify.")

# fragments and run-ons (has L4) -> L2 L3 L5 L6 L7
mc("fragments-run-ons", "L.6.1", 2, "Which is a fragment?",
   "Because the robotics club stayed late.", [("The robotics club stayed late.", "This is complete."), ("Yusuf missed the bus.", "This is complete."), ("He walked home.", "This is complete.")],
   "A dependent clause alone is a fragment.", "Ask: Because… what happened?")
mc("fragments-run-ons", "L.6.1", 3, "Which is a comma splice?",
   "The reef is fragile, it needs protection.", [("The reef is fragile; it needs protection.", "A semicolon is correct."), ("The reef is fragile, so it needs protection.", "Correct with a conjunction."), ("The reef is fragile.", "Simple sentence.")],
   "Two independent clauses joined only by a comma form a comma splice.", "Comma alone ≠ enough to join sentences.")
mc("fragments-run-ons", "L.6.1", 5, "Which revision fixes the run-on? “Scientists grow corals in nurseries they transplant them to reefs.”",
   "Scientists grow corals in nurseries; then they transplant them to reefs.",
   [("Scientists grow corals in nurseries, they transplant them to reefs.", "This is a comma splice."), ("Scientists grow corals in nurseries they, transplant them.", "Misplaced comma."), ("Scientists grow corals. In nurseries they transplant them to reefs.", "Changes meaning.")],
   "A semicolon correctly joins the two clauses.", "Use a period, semicolon, or comma + conjunction.")
tf("fragments-run-ons", "L.6.1", 6, "“Hoping to finish the model before the deadline and working late every night” is a complete sentence.", False,
   "It contains only participial phrases; there is no subject and main verb.", "Long word groups can still be fragments.")
mc("fragments-run-ons", "L.6.1", 7, "Which paragraph revision contains NO fragments or run-ons?",
   "The souq is old. Its arches are carved, and its shops sell spices.",
   [("The souq is old. Its arches carved. Shops sell spices.", "“Its arches carved” is a fragment."), ("The souq is old its arches are carved.", "Run-on."), ("The souq is old, its arches are carved, its shops sell spices.", "Comma splices.")],
   "Each sentence is complete and correctly joined.", "Check every sentence in a paragraph.")

# irregular verbs (has L4) -> L2 L3 L5 L6 L7
dd("irregular-verbs", "L.6.1", 2, "Choose the past tense: “The bell ____ at noon.”",
   "rang", [("ringed", "“Ring” is irregular."), ("rung", "“Rung” needs a helping verb."), ("rings", "This is present.")],
   "ring → rang → rung.", "Past participle needs has/have/had.")
match("irregular-verbs", "L.6.1", 3, "Match each verb with its past participle.",
      [("freeze", "frozen"), ("steal", "stolen"), ("forgive", "forgiven"), ("shake", "shaken")],
      "These verbs form the past participle with -en.", "Test with “I have ___.”")
dd("irregular-verbs", "L.6.1", 5, "Choose: “By the time we arrived, the guests had already ____.”",
   "gone", [("went", "After “had,” use the past participle."), ("goed", "Not a word."), ("go", "After “had,” use the past participle.")],
   "had + gone (past participle of go).", "go → went → gone.")
err("irregular-verbs", "L.6.1", 6, ["The coral", " had", " sank", " to the bottom."], 2, " sunk",
    "After “had,” use the past participle “sunk.”", "sink → sank → (had) sunk.")
mc("irregular-verbs", "L.6.1", 7, "Which sentence uses lie/lay correctly?",
   "Yesterday the tired dog lay in the shade.",
   [("Yesterday the tired dog laid in the shade.", "“Laid” needs an object."), ("Yesterday the tired dog lied in the shade.", "“Lied” means told a lie."), ("Yesterday the tired dog layed in the shade.", "Not a word.")],
   "lie (rest) → lay (past). lay (put) → laid (past).", "Lie = recline; lay = put something down.")

# nouns (has L1 L3) -> L2 L4 L5 L6
mc("nouns", "L.6.1", 2, "Which word is an abstract noun? “Mariam’s loyalty surprised her brother.”",
   "loyalty", [("Mariam’s", "This is a proper possessive noun."), ("brother", "This is concrete."), ("surprised", "This is a verb.")],
   "Loyalty is a quality, not something you touch.", "Abstract nouns name ideas and feelings.")
mc("nouns", "L.6.1", 4, "In “Mrs. Qadri gave Yusuf a cup,” what is “Yusuf”?",
   "the indirect object", [("the subject", "Mrs. Qadri is the subject."), ("the direct object", "The cup is the direct object."), ("the verb", "Yusuf is a noun.")],
   "Yusuf receives the cup: indirect object.", "Gave WHAT? (direct) To WHOM? (indirect).")
mc("nouns", "L.6.1", 5, "Which noun is used as a predicate noun? “The ladder was a gift.”",
   "gift", [("ladder", "This is the subject."), ("was", "This is a linking verb."), ("a", "This is an article.")],
   "“Gift” follows the linking verb and renames the subject.", "Predicate nouns rename the subject.")
ms("nouns", "L.6.1", 6, "Which TWO words are nouns used as appositives? “My sister, a talented artist, painted the mural with Huda, her best friend.”",
   ["artist", "friend"], [("sister", "This is the subject."), ("mural", "This is the direct object.")],
   "“A talented artist” renames sister; “her best friend” renames Huda.", "Appositives rename nearby nouns.")

# plural nouns (has L4) -> L2 L3 L5 L6 L7
dd("plural-nouns", "L.6.1", 2, "Choose the plural of “ox”: “Two strong ____ pulled the heavy cart.”",
   "oxen", [("oxes", "“Ox” has an irregular plural."), ("ox’s", "An apostrophe shows possession."), ("oxs", "This is not a word.")],
   "ox → oxen, an irregular plural from Old English.", "Irregular plurals: ox/oxen, child/children.")
mc("plural-nouns", "L.6.1", 3, "What is the plural of “analysis”?",
   "analyses", [("analysises", "Words ending in -is change to -es."), ("analysis", "This is singular."), ("analysi", "This is not correct.")],
   "Greek -is plurals change to -es: analysis → analyses.", "crisis → crises; thesis → theses.")
match("plural-nouns", "L.6.1", 5, "Match each singular noun with its plural.",
      [("cactus", "cacti"), ("phenomenon", "phenomena"), ("criterion", "criteria"), ("larva", "larvae")],
      "These plurals come from Latin and Greek.", "Learn academic plurals.")
err("plural-nouns", "L.6.2", 6, ["Both", " of my brother-in-laws", " work", " at the port."], 1, " of my brothers-in-law",
    "In compound nouns, pluralize the main word: brothers-in-law.", "Pluralize the important word in a compound noun.")
mc("plural-nouns", "L.6.2", 7, "Which sentence uses plurals and possessives correctly?",
   "The scientists’ data show that the reefs’ health is declining.",
   [("The scientist’s data shows that the reef’s health are declining.", "Agreement errors."), ("The scientists data show that the reefs health is declining.", "Missing apostrophes."), ("The scientists’ datas show that the reefs’ health is declining.", "“Data” is already plural.")],
   "Plural possessives (scientists’, reefs’) and the plural “data … show.”", "Check plurals, possessives and agreement together.")

# sentences (has L1 L5) -> L2 L3 L4 L6
mc("sentences", "L.6.1", 2, "Which sentence is an exclamation?",
   "What an incredible view from the dunes!", [("The view from the dunes is wide.", "Statement."), ("Can you see the dunes?", "Question."), ("Look at the dunes.", "Command.")],
   "It expresses strong feeling and ends with “!”.", "Exclamations show strong emotion.")
mc("sentences", "L.6.1", 3, "Which sentence is a simple sentence with a compound predicate?",
   "Mariam waved and smiled.", [("Mariam waved, and Yusuf smiled.", "Compound sentence."), ("When Mariam waved, Yusuf smiled.", "Complex sentence."), ("Mariam and Yusuf smiled.", "Compound subject.")],
   "One subject, two verbs, one clause.", "Simple sentences can have compound parts.")
mc("sentences", "L.6.1", 4, "Which sentence begins with an introductory prepositional phrase?",
   "Under the bright lanterns, the market came alive.", [("The market came alive under the lanterns.", "The phrase is at the end."), ("The market, bright and busy, came alive.", "This has an adjective pair."), ("Bright lanterns lit the market.", "No introductory phrase.")],
   "“Under the bright lanterns” opens the sentence.", "Varying sentence openings improves style.")
mc("sentences", "L.6.1", 6, "Which revision best combines these sentences with varied structure? “The tide rose. The boats lifted. The fishermen cheered.”",
   "As the tide rose and the boats lifted, the fishermen cheered.",
   [("The tide rose, the boats lifted, the fishermen cheered.", "Comma splices."), ("The tide rose and the boats lifted and the fishermen cheered.", "Repetitive."), ("Rising tide, lifting boats, cheering fishermen.", "Fragment.")],
   "A dependent clause with a compound subject-verb pair creates variety.", "Combine choppy sentences for flow.")

# verb tenses (has L4) -> L2 L3 L5 L6 L7
dd("verb-tenses", "L.6.1", 2, "Choose the present perfect: “Mariam ____ in the choir for two years.”",
   "has sung", [("sang", "This is simple past."), ("sings", "This is simple present."), ("will sing", "This is future.")],
   "has/have + past participle = present perfect.", "Present perfect connects past to now.")
mc("verb-tenses", "L.6.1", 3, "Which sentence is in the future progressive tense?",
   "At noon tomorrow, we will be sailing.", [("We sailed at noon.", "Past."), ("We have sailed.", "Present perfect."), ("We are sailing.", "Present progressive.")],
   "will be + -ing = future progressive.", "Progressive = ongoing action.")
mc("verb-tenses", "L.6.1", 5, "Which sentence has a correct sequence of tenses?",
   "After Yusuf had missed the bus, he walked home.",
   [("After Yusuf misses the bus, he walked home.", "Shift from present to past."), ("After Yusuf had missed the bus, he walks home.", "Shift to present."), ("After Yusuf will miss the bus, he walked home.", "Illogical.")],
   "Past perfect (had missed) shows the earlier past action.", "Use past perfect for the earlier of two past events.")
err("verb-tenses", "L.6.1", 6, ["Every morning, Mariam", " walked", " to the bakery and", " buys bread."], 3, " bought bread.",
    "Keep tenses consistent: walked … bought.", "Avoid unnecessary tense shifts.")
mc("verb-tenses", "L.6.1", 7, "Which sentence uses verb mood correctly (subjunctive)?",
   "If I were the principal, I would keep the five-day week.",
   [("If I was the principal, I would keep the five-day week.", "Use “were” for an unreal condition."), ("If I am the principal, I would keep the five-day week.", "Mixed tenses."), ("If I be the principal, I would keep the five-day week.", "Not standard.")],
   "Unreal conditions use the subjunctive “were.”", "If I were… = imagining something not true.")

# ================================================================= language

# commas (has L5 L6 L6 L7) -> L3 L4
mc("commas", "L.6.2", 3, "Which sentence correctly uses commas around an appositive?",
   "Mrs. Qadri, the baker, opened the door.", [("Mrs. Qadri the baker, opened the door.", "Comma missing before the appositive."), ("Mrs. Qadri, the baker opened the door.", "Comma missing after."), ("Mrs. Qadri the baker opened, the door.", "Wrong place.")],
   "Nonessential appositives are set off by commas on both sides.", "Two commas around extra information.")
err("commas", "L.6.2", 4, ["My grandfather", " who planted the orchard", " built", " a ladder."], 1, ", who planted the orchard,",
    "A nonrestrictive clause about a specific person needs commas on both sides.", "Extra information about a specific noun is set off by commas.")

# quotations and dialogue (has L4) -> L2 L3 L5 L6 L7
mc("quotations-dialogue", "L.6.2.b", 2, "Which sentence punctuates the quotation correctly?",
   "Mariam said, “I knew you’d walk the bakery way.”", [("Mariam said “I knew you’d walk the bakery way.”", "Comma missing after said."), ("Mariam said, “i knew you’d walk the bakery way.”", "Capitalize the first word."), ("Mariam said, I knew you’d walk the bakery way.", "Quotation marks missing.")],
   "Comma after the tag; capitalized quotation inside quotation marks.", "Tag, comma, “Quotation.”")
mc("quotations-dialogue", "L.6.2.b", 3, "Which sentence correctly punctuates a question in dialogue?",
   "“Does that radio still work?” Sara asked.", [("“Does that radio still work,” Sara asked.", "A question needs a question mark."), ("“Does that radio still work”? Sara asked.", "The question mark goes inside."), ("Does that radio still work? Sara asked.", "Quotation marks missing.")],
   "The question mark belongs to the quotation and goes inside.", "End marks stay with the spoken words.")
mc("quotations-dialogue", "L.6.2.b", 5, "Which sentence correctly uses a quotation within a quotation?",
   "“My grandfather always said, ‘Some things last if you look after them,’” Sara explained.",
   [("“My grandfather always said, “Some things last…,”” Sara explained.", "Use single marks inside double."), ("‘My grandfather always said, “Some things last…”’ Sara explained.", "Reversed marks."), ("“My grandfather always said, Some things last…,” Sara explained.", "Inner quotation marks missing.")],
   "Use single quotation marks for a quotation inside a quotation.", "Double outside, single inside.")
err("quotations-dialogue", "L.6.2.b", 6, ["“I came for a short article,”", " Sara said.", " “I’m leaving with a book”", "."], 2, " “I’m leaving with a book.”",
    "The period belongs inside the closing quotation mark.", "Periods and commas go inside quotation marks.")
mc("quotations-dialogue", "L.6.2.b", 7, "Which sentence correctly integrates a short quotation from a text?",
   "Huda argues that visitors come for “what is special about a place.”",
   [("Huda argues that visitors come for, “what is special about a place.”", "No comma when the quotation is part of your sentence."), ("Huda argues that visitors come for “What is special about a place.”", "Do not capitalize a quoted fragment."), ("Huda argues that visitors come for “what is special about a place”.", "The period goes inside.")],
   "A quoted fragment blends into your sentence without a comma or capital.", "Integrate quotations smoothly.")

# =============================================================== vocabulary

# connotation (has L4 L5 L6 L7) -> L2 L3
mc("connotation", "L.6.5", 2, "Which word has the most NEGATIVE connotation for a crowded market?",
   "chaotic", [("lively", "Positive."), ("busy", "Neutral."), ("bustling", "Mostly positive.")],
   "“Chaotic” suggests disorder.", "Connotation = feeling a word carries.")
mc("connotation", "RL.6.4", 3, "In “Desert Night,” why does the poet say the sand gives back heat “in slow, warm breaths”?",
   "To make the desert feel alive and comforting", [("To make the desert seem dangerous", "“Warm breaths” sounds gentle."), ("To show it is cold", "The sand is warm."), ("To describe a storm", "No storm.")],
   "“Breaths” and “warm” carry gentle, living connotations.", "Word choice shapes feeling.", "G6-P7")

# context clues (has L5) -> L2 L3 L4 L6 L7
mc("context-clues", "L.6.4.a", 2, "In “The Last Bus Home,” the battery is at “four percent” before the screen goes black. What does this suggest the screen did?",
   "turned off because the battery ran out", [("broke into pieces", "No damage is described."), ("showed a picture", "It went black."), ("grew brighter", "It went black.")],
   "Low battery + black screen = it shut off.", "Use cause clues nearby.", "G6-P1")
mc("context-clues", "L.6.4.a", 3, "In the coral article, “transplant them onto damaged reefs” most likely means…",
   "move and plant them in a new place", [("feed them to fish", "Not stated."), ("photograph them", "Not stated."), ("throw them away", "The goal is to help reefs.")],
   "They grow corals in nurseries, then move them to reefs.", "Use the purpose of the action.", "G6-P3")
mc("context-clues", "L.6.4.a", 4, "Read: “Mr. Aziz was so taciturn that he answered every question in six words or fewer.” What does taciturn mean?",
   "saying very little", [("very talkative", "He uses few words."), ("very angry", "No anger shown."), ("forgetful", "Not suggested.")],
   "The clue “six words or fewer” defines the word.", "Example clues show meaning.")
mc("context-clues", "L.6.4.a", 6, "In the souq letter, what does “heritage” mean in “protect our heritage”?",
   "traditions and history passed down from earlier generations", [("modern shopping", "The letter contrasts heritage with a new mall."), ("tourist signs", "Signs are a suggestion."), ("lighting", "Not related.")],
   "Huda links the souq to her grandfather and city history.", "Use surrounding ideas to define abstract words.", "G6-P8")
mc("context-clues", "L.6.4.a", 7, "Read: “Despite the meager harvest, the farmers shared what little they had.” What does meager mean, and which clue helps most?",
   "very small; “what little they had”", [("very large; “the farmers shared”", "Sharing does not mean large."), ("delicious; “harvest”", "Taste is not mentioned."), ("late; “Despite”", "“Despite” signals contrast, not lateness.")],
   "“What little they had” restates the meaning.", "Restatement clues repeat the meaning in other words.")

# figurative language (has L4 L5 L6 L6) -> L2 L3
mc("figurative-language", "L.6.5.a", 2, "“A camel groans, low as a cello string.” What kind of figurative language is this?",
   "simile", [("metaphor", "It uses “as,” so it is a simile."), ("hyperbole", "Not an exaggeration."), ("idiom", "Not a common saying.")],
   "A comparison using “as” is a simile.", "Simile = like/as.", "G6-P7")
mc("figurative-language", "RL.6.4", 3, "In “Transplant,” the tree “bowed its narrow head.” What does this personification suggest?",
   "The tree seemed sad and weak after being moved.", [("The tree was praying.", "Not literal."), ("The tree was growing fast.", "It drooped."), ("The tree was angry.", "Bowing suggests sadness.")],
   "Giving the tree a human gesture shows it struggling.", "Personification = human traits for things.", "G6-P6")

# Greek and Latin roots (has L4 L5 L6) -> L2 L3 L7
mc("greek-latin-roots", "L.6.4.b", 2, "The Latin root “struct” means build. What does “reconstruct” mean?",
   "build again", [("break apart", "rupt = break."), ("look again", "spect = look."), ("write again", "scrib = write.")],
   "re (again) + struct (build).", "Combine prefix and root.")
match("greek-latin-roots", "L.6.4.b", 3, "Match each root with its meaning.",
      [("rupt", "break"), ("ject", "throw"), ("cred", "believe"), ("mal", "bad")],
      "These roots appear in erupt, project, credible and malfunction.", "Think of a word with each root.")
mc("greek-latin-roots", "L.6.4.b", 7, "Using roots, what does “incredible” literally mean, and how is it used in everyday speech?",
   "“not believable”; people use it to mean amazing", [("“very believable”; it means boring", "in- means not."), ("“able to be thrown”; it means far", "That would be ject."), ("“badly built”; it means broken", "That would be mal + struct.")],
   "in (not) + cred (believe) + ible (able to be).", "Roots give literal meaning; usage can extend it.")

# homographs and homophones (has L5) -> L2 L3 L4 L6 L7
dd("homographs-homophones", "L.6.5.c", 2, "Choose: “The camel walked across the ____.”",
   "desert", [("dessert", "A dessert is a sweet food."), ("dezert", "Misspelled."), ("deserts’", "Possessive plural.")],
   "A desert is a dry land; a dessert is a sweet.", "Dessert has two s’s like “sweet stuff.”")
mc("homographs-homophones", "L.6.5.c", 3, "In which sentence does “tear” rhyme with “bear”?",
   "Be careful not to tear the map.", [("A tear ran down her cheek.", "Here it rhymes with “here.”"), ("The tear in her eye sparkled.", "Rhymes with “here.”"), ("She wiped away a tear.", "Rhymes with “here.”")],
   "To tear (rip) rhymes with bear.", "Homographs may differ in sound.")
mc("homographs-homophones", "L.6.5.c", 4, "“The coral may die in a minute amount of warmer water over many weeks.” How is “minute” pronounced and what does it mean?",
   "my-NOOT; very small", [("MIN-it; sixty seconds", "That meaning does not fit."), ("MIN-it; very small", "Wrong pronunciation for this meaning."), ("my-NOOT; sixty seconds", "Mixed up.")],
   "Minute (my-NOOT) means tiny.", "Use context to choose meaning and sound.")
mc("homographs-homophones", "L.6.5.c", 6, "Which sentence uses “refuse” to mean garbage?",
   "The workers collected the refuse from the market.", [("I refuse to give up.", "Verb: say no."), ("They refuse the offer.", "Verb."), ("Do not refuse help.", "Verb.")],
   "REF-use (noun) = garbage; re-FUSE (verb) = decline.", "Part of speech changes meaning and stress.")
err("homographs-homophones", "L.6.5.c", 7, ["The council’s", " plan will", " effect", " the whole city."], 2, " affect",
    "“Affect” is the verb meaning to influence; “effect” is usually a noun (result).", "Affect = action (verb); effect = end result (noun).")

# idioms and adages (has L4) -> L2 L3 L5 L6 L7
mc("idioms-adages", "L.6.5.b", 2, "What does “bite off more than you can chew” mean?",
   "take on more than you can handle", [("eat too fast", "Not literal."), ("be very hungry", "Not literal."), ("share food", "Not the meaning.")],
   "It warns against taking on too much.", "Idioms have nonliteral meanings.")
mc("idioms-adages", "L.6.5.b", 3, "After the coach gave his offer, he said, “The ball is in your court.” What did he mean?",
   "It is your turn to decide.", [("Go play tennis.", "Not literal."), ("You lost the game.", "Not the meaning."), ("The court is closed.", "Not literal.")],
   "The decision is now the other person’s.", "Use the situation to interpret.")
mc("idioms-adages", "L.6.5.b", 5, "Missing the bus turned out to be “a blessing in disguise” for Yusuf. Why?",
   "It led him to discover how much his sister cared.", [("He found money on the road.", "Not in the story."), ("He got home faster.", "He walked forty minutes."), ("He avoided homework.", "Not in the story.")],
   "Something bad (missing the bus) led to something good.", "Connect the idiom to story events.", "G6-P1")
mc("idioms-adages", "L.6.5.b", 6, "Which adage BEST fits Huda’s letter about saving the souq?",
   "“You don’t know what you’ve got until it’s gone.”", [("“Too many cooks spoil the broth.”", "About crowding, not heritage."), ("“The early bird catches the worm.”", "About starting early."), ("“Haste makes waste.”", "Not related.")],
   "Huda warns that the souq’s value will be lost if it is torn down.", "Match the adage to the main message.", "G6-P8")
match("idioms-adages", "L.6.5.b", 7, "Match each saying with its meaning.",
      [("Every cloud has a silver lining", "something good can come from bad"), ("The pen is mightier than the sword", "words can be more powerful than force"),
       ("Costs an arm and a leg", "very expensive"), ("When in Rome, do as the Romans do", "follow local customs")],
      "Each saying carries a lesson or comment about life.", "Think of situations where each fits.")

# reference materials (has L3 L4) -> L2 L5 L6 L7
mc("reference-materials", "L.6.4.c", 2, "Which resource tells you the origin (etymology) of a word?",
   "a dictionary entry’s etymology section", [("an atlas", "Maps."), ("a calendar", "Dates."), ("an index", "Page numbers.")],
   "Many dictionaries show where a word came from.", "Etymology = word history.")
mc("reference-materials", "L.6.4.c", 5, "A dictionary lists “con·tent (n.) KON-tent: what is inside; (adj.) kuhn-TENT: satisfied.” Which fits “Mariam was content to wait”?",
   "kuhn-TENT, satisfied", [("KON-tent, what is inside", "Not a noun here."), ("Both", "Only one fits."), ("Neither", "The adjective fits.")],
   "Here it describes Mariam, so it is the adjective.", "Use part of speech to choose the entry.")
mc("reference-materials", "L.6.4.c", 6, "When would a thesaurus be MORE useful than a dictionary?",
   "when you want a more precise word with a similar meaning", [("when you need a pronunciation", "Dictionary."), ("when you need a definition", "Dictionary."), ("when you need a word’s origin", "Dictionary.")],
   "Thesauruses list synonyms and antonyms.", "Choose the tool for the task.")
order("reference-materials", "L.6.4.c", 7, "Put these words in dictionary order.",
      ["coral", "corridor", "cottage", "council", "counsel"],
      "Compare letters in order: cor-a, cor-r, cot, coun-c, coun-s.", "Keep comparing until letters differ.", qtype="WORD_ORDER")

# synonyms and antonyms (has L2 L4 L5) -> L3 L6 L7
mc("synonyms-antonyms", "L.6.5.c", 3, "Which word is the strongest synonym for “tired”?",
   "exhausted", [("sleepy", "Milder."), ("restful", "Different meaning."), ("energetic", "Antonym.")],
   "Exhausted means extremely tired.", "Synonyms vary in intensity.")
mc("synonyms-antonyms", "L.6.5.c", 6, "Complete the analogy: brittle : fragile :: sturdy : ____",
   "strong", [("weak", "Antonym of sturdy."), ("broken", "Not similar."), ("small", "Not related.")],
   "Brittle and fragile are synonyms, so sturdy pairs with strong.", "Analogies keep the same relationship.")
mc("synonyms-antonyms", "L.6.5.c", 7, "Which pair are near-synonyms with OPPOSITE connotations?",
   "confident / arrogant",
   [("happy / joyful", "Both are positive."), ("hot / cold", "These are antonyms, not synonyms."), ("run / sprint", "These differ in intensity, not in positive or negative feeling.")],
   "Both describe self-belief, but “confident” is positive and “arrogant” is negative.", "Near-synonyms can carry very different feelings.")

# ============================================================== word study

mc("spelling", "L.6.2.b", 2, "Which word is spelled correctly?",
   "embarrass", [("embarass", "Two r’s and two s’s."), ("embarras", "Missing the final s."), ("imbarrass", "It begins with em-.")],
   "embarrass: double r, double s.", "Embarrassed people turn Really Red and Smile Shyly.")
mc("spelling", "L.6.2.b", 3, "Which word is spelled correctly?",
   "rhythm", [("rythm", "Missing h after r."), ("rhythem", "No e."), ("rhithm", "y, not i.")],
   "rhythm: r-h-y-t-h-m.", "Rhythm Helps Your Two Hips Move.")
fill("spelling", "L.6.2.b", 5, "Write the noun form of “occur”: “The rare ____ of snow in the desert surprised everyone.”",
     ["occurrence"], "occurrence: double c, double r, -ence.", "Double the r before -ence.")
mc("spelling", "L.6.2.b", 6, "Which sentence has every word spelled correctly?",
   "It is a privilege to possess such a beautiful rhythm.",
   [("It is a priviledge to possess such a beautiful rhythm.", "No d in privilege."), ("It is a privilege to posess such a beautiful rhythm.", "possess has two double s’s."), ("It is a privilege to possess such a beutiful rhythm.", "beautiful.")],
   "privilege, possess, beautiful, rhythm are correct.", "Check each tricky word.")
mc("spelling", "L.6.2.b", 7, "Which word is spelled correctly?",
   "guarantee", [("garantee", "Missing u."), ("guarentee", "a, not e."), ("guarante", "Final e missing.")],
   "guarantee: g-u-a-r-a-n-t-e-e.", "Guard + an + tee.")

# ============================================================ precise language

mc("precise-language", "L.6.3", 3, "Which revision is most precise? “The coral got bad because the water got hot.”",
   "The coral bleached because the water temperature rose.", [("The coral got worse because of the heat stuff.", "Vague."), ("Bad things happened to the coral.", "Vague."), ("The coral changed a lot.", "Vague.")],
   "Domain terms (bleached, temperature) are precise.", "Use specific vocabulary.")
mc("precise-language", "W.6.2.d", 4, "Which sentence maintains a formal style?",
   "The district saved less than two percent of its budget.", [("The district barely saved anything, honestly.", "Informal."), ("They saved, like, a tiny bit.", "Informal."), ("Savings were kinda small.", "Informal.")],
   "Formal writing avoids slang and uses exact numbers.", "Avoid slang in reports.")
mc("precise-language", "L.6.3", 6, "Which word best replaces “said” to show Sara’s frustration in her aside?",
   "muttered", [("announced", "Too loud and public."), ("sang", "Not fitting."), ("declared", "Too formal and loud.")],
   "Muttered suggests quiet frustration to the audience.", "Choose verbs that fit the mood.", "G6-P5")
mc("precise-language", "W.6.2.d", 7, "Which sentence uses precise language and a consistent formal tone?",
   "Researchers transplant nursery-grown corals to restore damaged reefs.",
   [("Researchers move some corals around to fix reefs and stuff.", "Vague and informal."), ("People help corals a lot.", "Vague."), ("Scientists totally save reefs by planting corals.", "Informal.")],
   "Specific verbs and terms with a formal tone.", "Precise + formal = academic style.")

# ================================================================== reading
# P1 The Last Bus Home, P2 Four-Day Week (argument), P3 Coral Reefs, P4 Ladder (poem),
# P5 The Interview (drama), P6 story + poem (paired), P7 Desert Night (poem), P8 Souq letter

# author's perspective (has L6) -> L2 L3 L4 L5 L7
mc("author-perspective", "RI.6.6", 2, "What is the author’s position in “Should Schools Switch to a Four-Day Week?”",
   "Schools should keep the five-day week until there is stronger evidence.", [("Schools should switch immediately.", "The author advises caution."), ("Weekends should be shorter.", "Not argued."), ("Teachers should be paid less.", "Not argued.")],
   "The conclusion says schools “should keep the five-day schedule.”", "Look at the conclusion for the position.", "G6-P2")
mc("author-perspective", "RI.6.6", 3, "Which word in the first paragraph signals the author’s cautious view?",
   "cautious", [("considering", "Neutral."), ("longer", "Describes the days."), ("improve", "Describes supporters’ belief.")],
   "“Schools should be cautious” shows the author’s attitude.", "Attitude words reveal perspective.", "G6-P2")
mc("author-perspective", "RI.6.6", 4, "How does Huda establish her perspective in the souq letter?",
   "She uses personal family history to show why the souq matters to her.", [("She lists shopping prices.", "No prices."), ("She quotes the council’s budget.", "No budget figures."), ("She describes a mall she likes.", "She opposes the mall.")],
   "Her grandfather’s stall and her school bag connect her to the souq.", "Personal experience shapes perspective.", "G6-P8")
mc("author-perspective", "RI.6.6", 5, "How does the author of the coral article show a balanced perspective in the last paragraph?",
   "By praising scientists’ efforts while noting reefs need ocean temperatures to stop rising", [("By saying the efforts are useless", "The author says they help."), ("By ignoring warming", "Warming is named."), ("By blaming fish", "Fish are not blamed.")],
   "“These efforts help, but…” shows both value and limits.", "“But” often signals a qualification.", "G6-P3")
mc("author-perspective", "RI.6.8", 7, "Which sentence in the four-day week argument WEAKENS the author’s credibility?",
   "“Everyone knows that students would rather stay home anyway, so a four-day week would only make them lazier.”",
   [("“Districts do save some money on buses and heating…”", "This fairly admits a point."), ("“…students’ math scores grew more slowly…”", "This cites evidence."), ("“For working parents, this can be expensive and stressful.”", "This is a reasonable point.")],
   "It overgeneralizes (“Everyone knows”) and makes an unsupported claim.", "Unsupported generalizations weaken an argument.", "G6-P2")

# cause and effect (has L4) -> L2 L3 L5 L6 L7
mc("cause-effect", "RI.6.3", 2, "Why did Yusuf miss the 6:40 bus?",
   "The robotics club stayed late to fix a jammed gear.", [("His phone battery died.", "That happened after."), ("He went to the bakery first.", "He passed it later."), ("His sister delayed him.", "She was at the bakery.")],
   "The club’s late repair made him miss the bus.", "Find what happened first.", "G6-P1")
mc("cause-effect", "RI.6.3", 3, "According to the coral article, what is the effect of corals expelling their algae?",
   "The corals turn white and begin to starve.", [("The corals grow faster.", "They starve."), ("Fish disappear immediately.", "Not stated."), ("The water cools down.", "Not stated.")],
   "Without algae, corals lose color and food.", "Follow the chain of causes.", "G6-P3")
mc("cause-effect", "RI.6.3", 5, "Why are a four-day week’s savings usually small, according to the article?",
   "Teacher salaries, the largest cost, do not change.", [("Buses cost more.", "Buses save money."), ("Heating costs rise.", "Heating saves money."), ("Schools hire more staff.", "Not stated.")],
   "The biggest expense stays the same.", "Look for “because.”", "G6-P2")
order("cause-effect", "RI.6.3", 6, "Put the chain of events in coral bleaching in order.",
      ["Ocean water becomes too warm.", "Stressed corals expel their algae.", "The corals turn white.", "If heat lasts for weeks, the coral may die."],
      "Each event causes the next.", "Cause-and-effect chains have an order.", "G6-P3")
mc("cause-effect", "RL.6.3", 7, "In “The New Field,” what causes Yasmin to stop comparing the two fields?",
   "Her daily practice helps her master the new field and score.", [("The coach moves the team to the coast.", "Not stated."), ("The field is flattened.", "Not stated."), ("She quits the team.", "She stays.")],
   "Practice → skill → first goal → acceptance.", "Trace the causes behind a change.", "G6-P6")

# central idea (has L4) -> L2 L3 L5 L6 L7
mc("central-idea", "RI.6.2", 2, "What is the central idea of the souq letter?",
   "The souq should be repaired and kept because it is part of the city’s history.", [("Shopping centers are always bad.", "Too broad."), ("Visitors dislike malls.", "Not the main idea."), ("Huda’s grandfather sold spices.", "Supporting detail.")],
   "Every paragraph argues for keeping the souq.", "The central idea ties all paragraphs together.", "G6-P8")
mc("central-idea", "RI.6.2", 3, "Which detail BEST supports the central idea that reefs are important?",
   "They support about a quarter of all marine species.", [("Polyps are tiny animals.", "Describes structure."), ("Algae produce food.", "Describes partnership."), ("Some scientists grow corals.", "Describes responses.")],
   "The statistic shows reefs’ importance.", "Choose the detail most closely linked to the idea.", "G6-P3")
mc("central-idea", "RI.6.2", 5, "How does the central idea of the four-day week article develop?",
   "Each paragraph tests one supporters’ claim against evidence, building toward caution.", [("It tells a story about one school.", "No narrative."), ("It lists schedules for every day.", "No schedules."), ("It describes buses in detail.", "Buses are one detail.")],
   "Learning, money and families are each examined.", "Track how paragraphs build an idea.", "G6-P2")
ms("central-idea", "RI.6.2", 6, "Which TWO sentences belong in an objective summary of the coral article’s central ideas?",
   ["Reefs support many species but cover little of the ocean floor.", "Warming water causes bleaching, and scientists are trying to help reefs recover."],
   [("Reefs are the most beautiful places on Earth.", "Opinion."), ("Everyone should visit a reef.", "Opinion.")],
   "Objective summaries avoid opinions.", "Keep only central, factual ideas.", "G6-P3")
mc("central-idea", "RI.6.2", 7, "Which statement best captures the central idea of the coral article in one sentence?",
   "Coral reefs are vital but threatened by warming water, and recovery depends on both science and cooler oceans.",
   [("Coral reefs are colorful because of algae.", "Detail."), ("Scientists grow corals in nurseries.", "Detail."), ("Reefs break storm waves.", "Detail.")],
   "It combines importance, threat and response.", "A strong central idea covers the whole text.", "G6-P3")

# character (has L5 L6) -> L2 L3 L4 L7
mc("character", "RL.6.3", 2, "Which word best describes Mariam in “The Last Bus Home”?",
   "perceptive", [("careless", "She predicts his route."), ("angry", "She is kind."), ("shy", "She waves wildly.")],
   "She knows Yusuf’s habits well enough to wait at the bakery.", "Use actions to infer traits.", "G6-P1")
mc("character", "RL.6.3", 3, "How does Mr. Aziz respond when Sara first asks about his thirty years?",
   "He gives short answers and does not look up.", [("He tells a long story.", "That comes later."), ("He leaves the room.", "He stays."), ("He asks her to stop.", "He does not.")],
   "His brief replies show he is reserved at first.", "First reactions reveal character.", "G6-P5")
mc("character", "RL.6.3", 4, "What does Yasmin’s decision to practice every morning reveal about her?",
   "She is determined to adapt rather than give up.", [("She dislikes her teammates.", "Not suggested."), ("She wants to move back immediately.", "She adapts."), ("She is careless.", "She practices carefully.")],
   "Daily practice shows perseverance.", "Choices reveal traits.", "G6-P6")
mc("character", "RL.6.3", 7, "How does Mariam’s action change the way Yusuf sees his role in the family?",
   "He realizes his little sister also looks after him.", [("He decides to quit robotics.", "Not stated."), ("He becomes angry at his mother.", "No one is angry."), ("He thinks Mariam is careless.", "He sees her care.")],
   "“He had never considered that she might be looking after him.”", "Characters change through others’ actions.", "G6-P1")

# compare and contrast / how parts contribute (has L6) -> L2 L3 L4 L5 L7
mc("compare-contrast", "RI.6.5", 2, "What is the role of the first paragraph of the four-day week article?",
   "It introduces the issue and states the author’s cautious claim.", [("It gives the final evidence.", "Evidence comes later."), ("It tells a personal story.", "No story."), ("It lists supporters’ names.", "No names.")],
   "Introductions present the topic and claim.", "Ask what each paragraph does.", "G6-P2")
mc("compare-contrast", "RI.6.5", 3, "How does paragraph 3 of the coral article fit into the whole text?",
   "It explains the main threat (bleaching) after paragraph 2 explains the partnership.", [("It repeats paragraph 1.", "New information."), ("It concludes the article.", "Paragraph 4 concludes."), ("It describes fish.", "Fish are in paragraph 1.")],
   "Paragraph 2 sets up how the partnership works; paragraph 3 shows how it breaks down.", "Look at how ideas build.", "G6-P3")
mc("compare-contrast", "RI.6.5", 4, "Why does Huda place her solution paragraph near the end of her letter?",
   "To offer a practical alternative after explaining the souq’s value and answering the council", [("To start the letter strongly", "It is near the end."), ("To list prices", "No prices."), ("To introduce her grandfather", "He appears earlier.")],
   "Problem → value → counterargument → solution → appeal.", "Structure supports persuasion.", "G6-P8")
mc("compare-contrast", "RI.6.5", 5, "What does the sentence “However, visitors travel to see what is special about a place” do in the letter?",
   "It turns to a counterargument against the council’s claim.", [("It introduces the topic.", "That is paragraph 1."), ("It closes the letter.", "That is the final line."), ("It describes Huda’s family.", "That is paragraph 2.")],
   "“However” signals a rebuttal.", "Transition words show how parts connect.", "G6-P8")
mc("compare-contrast", "RI.6.5", 7, "How do the second and third paragraphs of the four-day week article differ in focus?",
   "Paragraph 2 examines learning and fatigue; paragraph 3 examines cost savings.", [("Both examine cost.", "Only paragraph 3."), ("Both examine families.", "Families come in paragraph 4."), ("Paragraph 2 concludes the argument.", "The conclusion is last.")],
   "Each body paragraph tests one supporters’ claim.", "Compare how sections contribute differently.", "G6-P2")

# plot events (has L3 L4) -> L2 L5 L6 L7
mc("plot-events", "RL.6.3", 2, "What is the climax of “The Last Bus Home”?",
   "Yusuf finds Mariam waiting at the bakery and learns everyone was worried, not angry.", [("The bus pulls away.", "Inciting event."), ("His phone dies.", "Rising action."), ("He starts walking.", "Rising action.")],
   "This is the turning point that changes his understanding.", "The climax is the turning point.", "G6-P1")
mc("plot-events", "RL.6.5", 5, "How does the scene break in “The Interview” affect the plot?",
   "It skips the long interview and shows its result, highlighting the change.", [("It introduces the narrator.", "The narrator appears before Scene 1."), ("It changes the setting to a classroom.", "Same room."), ("It ends the conflict before it starts.", "The conflict is resolved across the scenes.")],
   "Scene 2 begins two hours later with a full notebook.", "Scene breaks shape pacing.", "G6-P5")
mc("plot-events", "RL.6.3", 6, "Which event is the resolution of “The New Field”?",
   "Her teammates cheer her first goal and she stops comparing fields.", [("She moves to the mountains.", "Exposition."), ("She sits on the bench.", "Rising action."), ("The coach tosses her a ball.", "Rising action.")],
   "The final paragraph resolves her struggle.", "Resolution follows the climax.", "G6-P6")
mc("plot-events", "RL.6.5", 7, "Why does the author reveal that Mariam is at the bakery only halfway through Yusuf’s walk?",
   "So Yusuf and the reader expect anger, making the surprise of worry and care stronger", [("To explain the bus schedule", "Already explained."), ("To introduce the robotics club", "Already introduced."), ("To show the bakery’s menu", "Not relevant.")],
   "Delaying the reveal builds tension and contrast.", "Event order shapes the reader’s experience.", "G6-P1")

# poetry elements (has L5) -> L2 L3 L4 L6 L7
mc("poetry-elements", "RL.6.5", 2, "Which repeated word links the stanzas of “Ladder” together?",
   "each", [("ladder", "It appears only in the first line."), ("apples", "It appears only in the last stanza."), ("winter", "It appears only once.")],
   "“Each rung,” “each one,” “each step,” “each branch” repeat across the poem.", "Poets use repetition to connect stanzas.", "G6-P4")
mc("poetry-elements", "RL.6.5", 3, "“Desert Night” does not rhyme regularly. What is this form called?",
   "free verse", [("sonnet", "Sonnets have 14 rhyming lines."), ("haiku", "Haiku have three short lines."), ("limerick", "Limericks rhyme and are humorous.")],
   "Free verse has no regular rhyme or meter.", "Poems can be structured or free.", "G6-P7")
mc("poetry-elements", "RL.6.5", 4, "In “Ladder,” what does each rung represent?",
   "a year of the speaker’s life with the grandfather", [("a branch of the apple tree", "The branches are separate."), ("a storm", "The tree fell in a storm."), ("a step to the roof", "Not stated.")],
   "“Each one a year he gave to me.”", "Look for the poem’s central metaphor.", "G6-P4")
mc("poetry-elements", "RL.6.5", 6, "How does the final stanza of “Ladder” change the poem’s time frame?",
   "It moves from past memories to the speaker climbing in the present.", [("It moves into the future.", "“I climb it now.”"), ("It stays in the past.", "“Now” signals present."), ("It describes the storm.", "The storm is in stanza 1.")],
   "“I climb it now” shifts to the present.", "Watch for time words.", "G6-P4")
mc("poetry-elements", "RL.6.5", 7, "How does the structure of “Transplant” mirror its meaning?",
   "Stanza 1 shows the move and struggle; stanza 2 turns to new growth.", [("Each stanza is about a different tree.", "One tree."), ("It has no stanzas.", "Two stanzas."), ("Both stanzas describe the courtyard.", "Only the first.")],
   "The turn between stanzas matches the turn from struggle to growth.", "Form can echo meaning.", "G6-P6")

# point of view (has L5) -> L2 L3 L4 L6 L7
mc("point-of-view", "RL.6.6", 2, "Which line from “Ladder” shows that the poem is told in the first person?",
   "“My grandfather built a ladder”", [("“from the branches of a storm-felled tree”", "No first-person pronoun."), ("“the first rung, wide and steady,”", "No first-person pronoun."), ("“that he planted long ago”", "This uses “he,” not “I” or “my.”")],
   "“My” shows the speaker is telling about their own life.", "First person uses I, me, my, we.", "G6-P4")
mc("point-of-view", "RL.6.6", 3, "What does Sara’s aside reveal that Mr. Aziz does not know?",
   "She is frustrated because she needs much longer answers.", [("She wants to leave.", "She stays."), ("She knows about the flood.", "She learns later."), ("She dislikes Mr. Aziz.", "No sign of dislike.")],
   "Asides show a character’s private view to the audience.", "Dramatic irony: the audience knows more.", "G6-P5")
mc("point-of-view", "RL.6.6", 4, "How does the narration of “The New Field” shape what readers know?",
   "It follows Yasmin’s feelings closely while telling the story in third person.", [("It is told by the coach.", "He is “he.”"), ("It is told in first person by Yasmin.", "She is “she.”"), ("It shows every teammate’s thoughts.", "Only Yasmin’s.")],
   "“She missed the flat green field” shows her inner view.", "Third-person limited follows one character.", "G6-P6")
mc("point-of-view", "RL.6.6", 6, "How would “The Last Bus Home” change if told from Mariam’s point of view?",
   "Readers would know from the start that the family is worried, not angry, which removes the surprise.", [("The bus would not leave.", "Events stay."), ("Yusuf would not walk.", "Events stay."), ("It would become a poem.", "Form stays.")],
   "Point of view controls what information is revealed and when.", "Consider what each narrator knows.", "G6-P1")
mc("point-of-view", "RL.6.6", 7, "Why might the playwright let Sara speak directly to the audience in an aside?",
   "To create humor and let the audience share her private struggle", [("To replace the narrator", "The narrator still speaks."), ("To give stage directions", "Asides are spoken lines."), ("To end the play", "It is early in Scene 1.")],
   "The aside builds connection and humor with the audience.", "Consider the effect of narrative choices.", "G6-P5")

# summarize (has L5) -> L2 L3 L4 L6 L7
mc("summarize", "RL.6.2", 2, "Which is the best summary of “The Last Bus Home”?",
   "After missing the last bus, Yusuf walks home expecting trouble but discovers his family was only worried and his sister had been looking out for him.",
   [("Yusuf likes robotics and cocoa.", "Too narrow."), ("A bakery stays open late.", "Detail."), ("Yusuf’s phone dies.", "Detail.")],
   "Includes problem, turning point and insight.", "Summaries cover beginning, middle and end.", "G6-P1")
mc("summarize", "RI.6.2", 3, "Which detail should be LEFT OUT of a summary of the four-day week article?",
   "Buses and heating are examples of savings.", [("Math scores grew more slowly.", "Key evidence."), ("Savings are usually small.", "Key point."), ("Families need childcare on the fifth day.", "Key point.")],
   "Specific examples are less essential than the main points.", "Keep main points; drop examples.", "G6-P2")
mc("summarize", "RI.6.2", 4, "Which is the most objective summary of the souq letter?",
   "A student urges the council to repair the souq instead of replacing it, citing history and tourism.",
   [("A wise student bravely saves the best market ever.", "Opinion words."), ("The council is wrong and foolish.", "Judgment."), ("The souq has copper workshops.", "Detail only.")],
   "Objective summaries avoid judgments.", "Report, don’t evaluate.", "G6-P8")
mc("summarize", "RL.6.2", 6, "Which summary of “The Interview” keeps the important events in order?",
   "A student interviews a reserved custodian, a question about a radio unlocks his stories, and he gives her a doorknob as a keepsake.",
   [("A custodian gives a student a doorknob, then she asks about the radio.", "Order is wrong."), ("A radio plays music in a storage room.", "Detail only."), ("Sara writes for the school newspaper.", "Background only.")],
   "Correct sequence of key events.", "Keep events in order.", "G6-P5")
mc("summarize", "RL.6.2", 7, "Which sentence summarizes BOTH texts in the paired passage without adding opinions?",
   "A girl and a transplanted tree each struggle after moving and eventually thrive.",
   [("Moving is the worst thing that can happen.", "Opinion."), ("Lemon trees and football are both fun.", "Opinion and inaccurate."), ("Yasmin practices against a stone wall.", "Detail from one text.")],
   "It captures the shared pattern objectively.", "Summaries of paired texts note what both share.", "G6-P6")

# text evidence (has L5) -> L2 L3 L4 L6 L7
mc("text-evidence", "RI.6.1", 2, "Which sentence supports the claim that reefs protect coastlines?",
   "“Coastlines are protected because reefs break the force of storm waves.”", [("“Fish shelter in their branches.”", "About fish."), ("“A reef is built by tiny animals called coral polyps.”", "About structure."), ("“Bleached coral is not dead.”", "About bleaching.")],
   "This states the protective function directly.", "Match evidence to the exact claim.", "G6-P3")
mc("text-evidence", "RI.6.1", 3, "Which quotation supports the claim that four-day weeks may harm learning?",
   "“students’ math scores grew more slowly than in similar five-day schools.”", [("“Districts do save some money.”", "About cost."), ("“families must find care for children.”", "About families."), ("“More schools are considering a four-day week.”", "Background.")],
   "Slower score growth is evidence about learning.", "Choose evidence that matches the claim’s topic.", "G6-P2")
mc("text-evidence", "RL.6.1", 4, "Which detail shows that Yusuf expected to be in trouble?",
   "“It wasn’t my fault, he practiced.”", [("“She waved wildly.”", "About Mariam."), ("“The walk would take forty minutes.”", "About distance."), ("“Yusuf laughed.”", "His later reaction.")],
   "Rehearsing excuses shows he feared blame.", "Inner thoughts are strong evidence of feelings.", "G6-P1")
ms("text-evidence", "RL.6.1", 6, "Which TWO quotations support the inference that Mr. Aziz takes pride in his work?",
   ["“I carried two hundred chairs to the library, one by one.”", "“Some things last if you look after them.”"],
   [("“There is not much to tell.”", "He downplays his work here."), ("“Sit closer. That was 1998…”", "This begins the story but does not show pride.")],
   "His careful effort and his belief in looking after things show pride.", "Choose evidence that clearly supports the inference.", "G6-P5")
mc("text-evidence", "RI.6.1", 7, "A reader claims Huda respects the council even while disagreeing. Which quotation is the STRONGEST evidence?",
   "“Respectfully, Huda Al-Mansour”", [("“I urge the council to change its plan.”", "Shows disagreement, not respect."), ("“Please do not let our history disappear behind a glass wall.”", "An emotional appeal."), ("“The city council plans to replace our old covered souq.”", "A fact.")],
   "Her respectful closing and constructive tone support the claim; the closing states it directly.", "The best evidence most directly proves the claim.", "G6-P8")

# theme (has L5 L7) -> L2 L3 L4 L6
mc("theme", "RL.6.2", 2, "Which theme does “Ladder” express?",
   "The love and lessons of family stay with us as we grow.", [("Ladders are dangerous.", "Not the message."), ("Storms destroy everything.", "The tree became a gift."), ("Apples are the best fruit.", "Not a theme.")],
   "Each rung holds a year he gave; the speaker now reaches what he planted.", "Themes are messages about life.", "G6-P4")
mc("theme", "RL.6.2", 3, "Which detail best develops the theme of “The Interview”?",
   "Mr. Aziz gives Sara the doorknob from the first door he fixed.", [("Sara sits on a bucket.", "Setting detail."), ("The radio plays softly.", "Atmosphere."), ("It is the last week of school.", "Setting.")],
   "The gift connects to “Some things last if you look after them.”", "Find details tied to the message.", "G6-P5")
mc("theme", "RL.6.2", 4, "What theme do “The New Field” and “Transplant” share?",
   "Adapting to change takes time, but growth follows.", [("Football is better than gardening.", "Not a theme."), ("Never move away from home.", "Both texts show growth after moving."), ("Mountains are better than coasts.", "Not a theme.")],
   "Both show struggle after moving, then success.", "Shared themes can appear in different genres.", "G6-P6")
mc("theme", "RL.6.2", 6, "How does the setting of “Desert Night” support its theme of peace and wonder?",
   "The vast, silent desert under the stars creates a feeling of calm awe.", [("The busy city noise creates excitement.", "There is no city."), ("The storm creates fear.", "There is no storm."), ("The classroom creates focus.", "There is no classroom.")],
   "Quiet sounds, warm sand and a starry sky create calm wonder.", "Setting can help develop theme.", "G6-P7")
