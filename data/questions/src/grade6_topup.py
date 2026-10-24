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


# ============================================================ NAFS topup 2: V.SYNANT / RC.DETAIL / IAE.INFER
# Grows three thin NAFS-mapped skills: synonyms-antonyms (NAFS.V.SYNANT), text-evidence
# (NAFS.RC.DETAIL) and character (NAFS.IAE.INFER — Grade 6's curriculum does not offer
# character-perspective or make-predictions as separate families, so new inference items
# use "character" only). All reading items here are self-contained (a short original
# excerpt inside the stem), so they do not depend on the existing numbered passages.

# ---- synonyms-antonyms (NAFS.V.SYNANT) ----
mc("synonyms-antonyms", "L.6.5.c", 2, "Which word is a synonym for “meticulous”?",
   "precise", [("careless", "This is an antonym."), ("curious", "This is unrelated."), ("hasty", "This is the opposite characteristic.")],
   "Meticulous and precise both describe extreme care with details.", "Formal synonyms like meticulous often replace simpler words such as careful.")
mc("synonyms-antonyms", "L.6.5.c", 3, "Which word is an antonym for “reluctant”?",
   "eager", [("hesitant", "Hesitant is a synonym of reluctant."), ("nervous", "Nervous is a different meaning, about fear."), ("quiet", "Quiet is unrelated.")],
   "Reluctant means unwilling; eager means very willing — opposites.", "Picture someone dragging their feet versus someone racing to start.")
dd("synonyms-antonyms", "L.6.5.c", 3, "Choose the synonym: “The lawyer presented a ____ (convincing) argument to the jury.”",
   "persuasive", [("confusing", "This describes the opposite effect."), ("brief", "This describes length, not persuasiveness."), ("loud", "This describes volume, not the quality of the argument.")],
   "Persuasive and convincing both describe an argument that changes people’s minds.", "Match the meaning in parentheses exactly, not just a related idea.")
match("synonyms-antonyms", "L.6.5.c", 4, "Match each word with its SYNONYM.",
      [("meticulous", "precise"), ("persuasive", "convincing"), ("reluctant", "hesitant"), ("candid", "honest")],
      "Each pair shares nearly the same meaning.", "Replace one word with its match in a sentence to check the meaning holds.")
tf("synonyms-antonyms", "L.6.5.c", 2, "A candid witness answers every question directly, while a deceptive witness twists the facts to hide the truth. True or false: this contrast means “candid” and “deceptive” are synonyms.", False,
   "Candid means open and honest; deceptive means misleading — opposites, not synonyms.",
   "If one word describes honesty and the other describes dishonesty, they are antonyms.")
mc("synonyms-antonyms", "L.6.5.c", 4, "Which word is an antonym for “abundant”?",
   "scarce", [("plentiful", "Plentiful is a synonym of abundant."), ("useful", "Useful is an unrelated meaning."), ("fresh", "Fresh is an unrelated meaning.")],
   "Abundant means existing in large amounts; scarce means existing in very small amounts — opposites.", "Think of a harvest with plenty of food compared to one with almost none.")
mc("synonyms-antonyms", "L.6.5.c", 3, "Read: “Unlike his impulsive younger brother, Khalid always paused to weigh the consequences before acting.” Which word could replace “impulsive” without changing the sentence’s meaning?",
   "rash", [("cautious", "This describes Khalid, the opposite of impulsive."), ("patient", "This is the opposite quality."), ("curious", "This is an unrelated meaning.")],
   "Impulsive and rash both describe acting quickly without thinking of consequences.", "Use the contrast in the sentence (Khalid pausing) as a clue to the opposite meaning of impulsive.")
dd("synonyms-antonyms", "L.6.5.c", 4, "Choose the antonym: “The committee’s decision was ____ (unanimous); several members strongly disagreed.”",
   "divided", [("agreed", "This is similar to unanimous, not opposite."), ("quick", "This describes speed, not agreement."), ("official", "This is an unrelated meaning.")],
   "Unanimous means everyone agrees; divided means people disagree — opposites, which fits the sentence’s own contrast.", "Look for a word that fits the contrast the sentence itself describes.")
mc("synonyms-antonyms", "L.6.5.c", 3, "Which word is a synonym for “ambiguous”?",
   "unclear", [("obvious", "This is an antonym of ambiguous."), ("lengthy", "This describes length, not clarity."), ("formal", "This is an unrelated meaning.")],
   "Ambiguous and unclear both describe something that can be understood in more than one way, or not understood at all.", "Ambiguous is a more formal word for unclear or confusing.")
mc("synonyms-antonyms", "L.6.5.c", 5, "Which pair of words are near-synonyms with DIFFERENT levels of intensity?",
   "annoyed / furious", [("hot / cold", "These are opposites, not near-synonyms."), ("fast / quick", "These are near-synonyms, but at nearly the SAME level of intensity."), ("happy / sad", "These are opposites, not near-synonyms.")],
   "Annoyed and furious both describe anger, but furious is a much stronger degree of the same feeling.", "Near-synonyms can share a meaning but differ in strength or degree.")
match("synonyms-antonyms", "L.6.5.c", 5, "Match each word with its ANTONYM.",
      [("abundant", "scarce"), ("ambiguous", "clear"), ("candid", "deceptive"), ("meticulous", "careless")],
      "Each pair has opposite meanings.", "Check that each pair truly contrasts, not just that the words are different.")
mc("synonyms-antonyms", "L.6.5.c", 4, "Complete the analogy: honest : deceptive :: confident : ____",
   "insecure", [("humble", "Humble is not necessarily an opposite of confident."), ("brave", "Brave is similar to confident, not its opposite."), ("proud", "Proud is similar to confident, not its opposite.")],
   "Honest and deceptive are opposites, so confident should pair with its opposite: insecure.", "Analogies keep the same relationship — here, antonym pairs — on both sides.")
tf("synonyms-antonyms", "L.6.5.c", 3, "True or false: “scarce” and “abundant” describe the same amount of something.", False,
   "Scarce means very little is available; abundant means a lot is available — these describe opposite amounts.",
   "Compare the actual quantities each word suggests.")
mc("synonyms-antonyms", "L.6.5.c", 3, "Read: “The witness gave a candid account of the accident, unlike the driver’s evasive answers.” Which word is an antonym for “candid” as used here?",
   "evasive", [("honest", "This is a synonym of candid."), ("brief", "This is unrelated to honesty."), ("loud", "This is an unrelated meaning.")],
   "Candid means open and honest; evasive means avoiding giving a direct answer — opposites, as the sentence itself contrasts.", "The sentence’s own contrast (unlike) often names the antonym directly.")
dd("synonyms-antonyms", "L.6.5.c", 2, "Choose the synonym: “The volunteers showed ____ (plentiful) kindness toward the flood victims.”",
   "abundant", [("scarce", "This is an antonym."), ("brief", "This is an unrelated meaning."), ("formal", "This is an unrelated meaning.")],
   "Abundant and plentiful both describe a large amount of something.", "Match the meaning in parentheses to the best synonym, not a similar-sounding word.")

# ---- text-evidence (NAFS.RC.DETAIL) ----
mc("text-evidence", "RI.6.1", 4, "Read: “Renewable energy sources like wind and solar now generate over 12 percent of global electricity, a figure that has tripled in the past decade.” Which detail is evidence that renewable energy use is growing rapidly?",
   "“a figure that has tripled in the past decade.”",
   [("“generate over 12 percent of global electricity.”", "This states the current amount, not the rate of growth."), ("“wind and solar.”", "This only names the sources."), ("“global electricity.”", "This only names the category.")],
   "Tripling in just ten years is direct evidence of rapid growth.", "Evidence of growth usually compares a past amount with a present one.")
ms("text-evidence", "RI.6.1", 5, "Read: “The city’s new bike-sharing program cut traffic near downtown by 8 percent in its first year, though some residents complained that stations were often empty during rush hour.” Which TWO details give a balanced view of the program’s first year?",
   ["“cut traffic near downtown by 8 percent”", "“stations were often empty during rush hour”"],
   [("“The city’s new bike-sharing program.”", "This only names the program, not a result."), ("“its first year.”", "This only tells the time frame.")],
   "A balanced view includes both the positive result (less traffic) and a real complaint (empty stations).", "A balanced summary uses evidence from both sides of an issue.")
mc("text-evidence", "RL.6.1", 4, "Read: “Mr. Aziz ran his thumb along the cracked door frame he had repaired decades earlier and said nothing for a long moment before speaking again.” Which detail suggests that the repair held a deep personal meaning for Mr. Aziz?",
   "“he ran his thumb along the cracked door frame... and said nothing for a long moment”",
   [("“he had repaired decades earlier.”", "This gives a timeframe, not evidence of feeling."), ("“before speaking again.”", "This only marks a transition."), ("“the door frame.”", "This only names the object.")],
   "Pausing silently while touching his old work suggests a strong, quiet emotional connection to it.", "A long pause or silence in dialogue often signals strong, unspoken feeling.")
mc("text-evidence", "RI.6.1", 3, "Read: “Deep-sea anglerfish produce their own light through a chemical reaction in a special organ, which attracts prey in the pitch-black water.” Which detail explains the PURPOSE of the anglerfish’s light?",
   "“which attracts prey in the pitch-black water.”",
   [("“produce their own light through a chemical reaction.”", "This explains how the light is made, not why."), ("“a special organ.”", "This only names a body part."), ("“pitch-black water.”", "This only describes the setting.")],
   "Attracting prey is the stated reason the anglerfish produces light.", "Separate the explanation of HOW something happens from the explanation of WHY.")
tf("text-evidence", "RI.6.1", 3, "Read: “Although four-day school weeks can save districts money on transportation and utilities, researchers found that younger students’ reading scores dropped slightly compared to five-day schools.” True or false: the text claims four-day school weeks have no drawbacks.", False,
   "The text names a specific drawback — a drop in younger students’ reading scores — so it does not claim there are no drawbacks.",
   "Watch for absolute claims like ‘no drawbacks’ when the text actually lists a cost.")
mc("text-evidence", "RL.6.1", 3, "Read: “Huda crossed out her first three drafts of the letter, each one angrier than the last, before finally writing one that calmly explained her concerns.” Which detail shows that Huda chose to communicate respectfully rather than react in anger?",
   "“crossed out her first three drafts... before finally writing one that calmly explained her concerns.”",
   [("“each one angrier than the last.”", "This describes her early anger, not her final choice."), ("“the letter.”", "This only names the object."), ("“her concerns.”", "This only names the topic.")],
   "Rewriting until she found a calm tone shows she deliberately chose respect over anger.", "Look at the FINAL version of a character’s words or actions, not just the early drafts.")
mc("text-evidence", "RI.6.1", 4, "Read: “A single mature oak tree can absorb roughly 22 kilograms of carbon dioxide each year, which is why city planners increasingly favor planting them along busy streets.” Which detail supports the claim that oak trees help with pollution from traffic?",
   "“can absorb roughly 22 kilograms of carbon dioxide each year”",
   [("“city planners increasingly favor planting them along busy streets.”", "This describes a decision made because of the fact, not the evidence itself."), ("“A single mature oak tree.”", "This only names the subject."), ("“busy streets.”", "This only names a location.")],
   "Absorbing carbon dioxide — a pollutant released by traffic — is the direct evidence for the claim.", "Trace the claim back to the specific number or fact that supports it.")
ms("text-evidence", "RL.6.1", 5, "Read: “Yasmin woke at five every morning to practice before school, enjoyed listening to music on the bus, and kept a log of every mistake she made in rehearsal.” Which TWO details show Yasmin’s strong discipline?",
   ["“woke at five every morning to practice before school”", "“kept a log of every mistake she made in rehearsal”"],
   [("“enjoyed listening to music on the bus.”", "This is a personal preference, not evidence of discipline."), ("“before school.”", "This only tells when, not evidence by itself.")],
   "A strict daily routine and tracking her own mistakes both show serious self-discipline.", "Look for repeated habits and self-monitoring as strong evidence of discipline.")
mc("text-evidence", "RI.6.1", 3, "Read: “Lightning can heat the surrounding air to temperatures hotter than the surface of the sun, causing the air to expand explosively and produce the sound we hear as thunder.” Which detail explains WHY thunder happens?",
   "“causing the air to expand explosively”",
   [("“Lightning can heat the surrounding air to temperatures hotter than the surface of the sun.”", "This explains the heat, but the explosive expansion is the direct cause of the sound."), ("“the surface of the sun.”", "This is only a comparison, not the cause of thunder."), ("“we hear as thunder.”", "This only names the result, not the explanation.")],
   "The explosive expansion of superheated air is the direct cause of the sound of thunder.", "Find the exact phrase describing the physical cause, not just a related fact.")
mc("text-evidence", "RL.6.1", 4, "Read: “Huda signed her letter to the city council ‘Respectfully,’ even after writing three paragraphs disagreeing firmly with their plan.” Which detail shows that Huda disagreed without being disrespectful?",
   "“signed her letter... ‘Respectfully,’ even after writing three paragraphs disagreeing firmly”",
   [("“disagreeing firmly with their plan.”", "This shows firm disagreement alone, not the respectful tone."), ("“the city council.”", "This only names who received the letter."), ("“three paragraphs.”", "This only tells the length.")],
   "Closing respectfully despite strong disagreement shows she kept a respectful, constructive tone.", "Compare the content of an argument with the TONE used to express it.")
tf("text-evidence", "RI.6.1", 2, "Read: “Though bats are often feared, a single bat can eat more than a thousand insects in one night, making them valuable for controlling pests naturally.” True or false: the text presents bats as only dangerous to humans.", False,
   "The text actually presents bats as valuable pest controllers, not as dangerous.",
   "Check whether a statement matches the text’s actual claim, especially after a word like ‘though.’")
mc("text-evidence", "RI.6.1", 4, "Read: “Switching a school’s lighting to LED bulbs cost the district $40,000 upfront, but the resulting savings on electricity paid back that cost within just three years.” Which detail shows that the LED switch was a good long-term investment?",
   "“the resulting savings on electricity paid back that cost within just three years.”",
   [("“cost the district $40,000 upfront.”", "This states the cost, not evidence that it was worthwhile."), ("“LED bulbs.”", "This only names the product."), ("“a school’s lighting.”", "This only names what was changed.")],
   "Paying back the cost in just three years, with savings continuing after, shows a strong long-term benefit.", "Compare the initial cost with the eventual payoff to judge whether something is a good investment.")
mc("text-evidence", "RL.6.1", 3, "Read: “Sara flipped through her notes one last time, closed the folder, and walked into the interview room without checking her phone even once.” Which detail shows that Sara stayed focused on the interview?",
   "“walked into the interview room without checking her phone even once.”",
   [("“flipped through her notes one last time.”", "This shows preparation, not sustained focus during the walk."), ("“closed the folder.”", "This is a small action, not strong evidence of focus."), ("“the interview room.”", "This only names a location.")],
   "Not checking her phone, a common distraction, shows she stayed mentally focused.", "Look for what a character avoids doing as evidence of focus or self-control.")
mc("text-evidence", "RI.6.1", 4, "Read: “Coastal mangrove forests can reduce the height of incoming storm waves by up to 66 percent, protecting the villages behind them from the worst flooding.” Which detail is the strongest evidence that mangroves protect coastal communities?",
   "“can reduce the height of incoming storm waves by up to 66 percent”",
   [("“protecting the villages behind them from the worst flooding.”", "This states the result of the evidence, repeating the claim rather than giving new proof."), ("“Coastal mangrove forests.”", "This only names the subject."), ("“storm waves.”", "This only names the threat.")],
   "The specific percentage reduction in wave height is the measurable evidence behind the claim.", "A number or statistic is often the strongest kind of evidence for a claim.")
ms("text-evidence", "RI.6.1", 5, "Read: “The region’s new desalination plant provides clean drinking water to 50,000 residents, but it also uses large amounts of electricity and releases concentrated salt water back into the sea.” Which TWO details describe a cost of the desalination plant?",
   ["“uses large amounts of electricity”", "“releases concentrated salt water back into the sea”"],
   [("“provides clean drinking water to 50,000 residents.”", "This describes the benefit, not a cost.")],
   "High electricity use and releasing concentrated salt water are both environmental costs of the plant.", "Separate the stated benefit from the stated costs before choosing.")

# ---- character (NAFS.IAE.INFER) ----
mc("character", "RL.6.3", 3, "Read: “When the team’s presentation software crashed minutes before judging, Layla calmly grabbed a marker and sketched the diagrams by hand while her teammates panicked.” Which word best describes Layla?",
   "resourceful", [("careless", "Her quick, calm solution shows the opposite of carelessness."), ("anxious", "She stays calm; her teammates panic instead."), ("indifferent", "She actively solves the problem, not ignoring it.")],
   "Finding a quick, creative solution under pressure shows Layla is resourceful.", "A character’s response to an unexpected problem often reveals a trait.")
mc("character", "RL.6.3", 4, "Read: “Despite knowing the answer, Khalid let his quieter teammate present the group’s findings, coaching her through the key points beforehand instead of taking the spotlight himself.” Which word best describes Khalid?",
   "generous", [("competitive", "Stepping back from the spotlight is the opposite of trying to compete for credit."), ("insecure", "Coaching her confidently shows the opposite of insecurity."), ("careless", "Preparing her carefully shows the opposite of carelessness.")],
   "Giving up the spotlight to help a teammate shine shows generosity.", "Notice when a character gives up personal credit to help someone else.")
tf("character", "RL.6.3", 2, "Read: “Mariam re-checked the lab results three times before reporting them, even though her partner insisted the first result was obviously correct.” True or false: this detail shows Mariam is easily influenced by others’ opinions.", False,
   "Checking three times despite her partner’s pressure shows independence and thoroughness, not being easily influenced.",
   "Look for whether a character sticks to their own standards despite pressure from others.")
mc("character", "RL.6.3", 4, "Read: “Omar admitted to the whole class that he had copied the homework answer, even though no one had noticed and he could easily have stayed silent.” Which word best describes Omar?",
   "honest", [("foolish", "Telling the truth voluntarily is admirable, not foolish."), ("nervous", "The text shows a choice to admit, not a feeling of fear."), ("careless", "Copying was the mistake, but admitting it shows the trait being tested: honesty.")],
   "Confessing a mistake no one would have noticed shows strong honesty.", "A character’s choice to tell the truth when they could easily hide it reveals honesty.")
mc("character", "RL.6.3", 3, "Read: “Even after three failed attempts to code the robot’s arm correctly, Dana reread the manual, asked a mentor one specific question, and tried a fourth approach before lunch.” Which word best describes Dana?",
   "persistent", [("discouraged", "Trying a fourth approach shows the opposite of giving up."), ("careless", "Rereading the manual and asking a focused question shows careful effort."), ("impatient", "Taking time to reread and ask questions shows patience, not impatience.")],
   "Continuing to try new approaches after repeated failure shows persistence.", "Repeated attempts after failure are strong evidence of persistence.")
mc("character", "RL.6.3", 4, "Read: “Yusuf noticed the new transfer student eating alone every day that week, so on Friday he invited him to sit with his usual group, even though it meant explaining the inside jokes all over again.” Which word best describes Yusuf?",
   "inclusive", [("shy", "Inviting someone over confidently is not shy behavior."), ("indifferent", "Noticing and acting shows the opposite of indifference."), ("annoyed", "Nothing shows annoyance; he willingly includes the new student.")],
   "Actively including someone who was left out, despite the extra effort, shows Yusuf is inclusive.", "Notice how a character treats someone who does not belong to the usual group.")
tf("character", "RL.6.3", 3, "Read: “Huda spent the entire bus ride rehearsing excuses for being late, even though her coach had texted that practice was cancelled.” True or false: this detail shows that Huda is confident she will not be blamed for anything.", False,
   "Rehearsing excuses, even unnecessarily, shows Huda expects to be blamed, not that she feels confident she is safe from blame.",
   "A character’s private thoughts, like rehearsed excuses, often reveal a hidden worry.")
mc("character", "RL.6.3", 3, "Read: “Sami offered to carry the heaviest box up three flights of stairs without being asked, then went back down for a second trip while his friends rested.” Which word best describes Sami?",
   "considerate", [("lazy", "Volunteering for the heaviest box and a second trip is the opposite of lazy."), ("proud", "Nothing shows him bragging about the task."), ("careless", "Carrying boxes carefully does not show carelessness.")],
   "Volunteering for the hardest task, twice, without being asked, shows Sami thinks of his tired friends — he is considerate.", "An unprompted offer to take on hard work for others is strong evidence of a considerate trait.")
mc("character", "RL.6.3", 4, "Read: “Noura’s essay argued strongly against her own first opinion once new evidence changed her mind, and she rewrote the entire conclusion the night before it was due.” Which word best describes Noura?",
   "open-minded", [("stubborn", "Changing her opinion based on evidence is the opposite of stubborn."), ("careless", "Rewriting the conclusion carefully shows the opposite of carelessness."), ("indecisive", "She makes a firm decision based on evidence, not indecision.")],
   "Being willing to change her opinion when new evidence appeared shows Noura is open-minded.", "A willingness to change one’s mind based on evidence often reveals open-mindedness.")
mc("character", "RL.6.3", 3, "Read: “Tariq always double-checked the exits and the fire extinguisher locations whenever he entered an unfamiliar building, a habit his friends often teased him about.” Which word best describes Tariq?",
   "cautious", [("careless", "Checking exits carefully is the opposite of careless."), ("arrogant", "Nothing shows him bragging about this habit."), ("lazy", "The habit requires effort, not laziness.")],
   "Consistently checking for safety exits, even when teased, shows Tariq is cautious.", "A repeated habit, even one that invites teasing, can reveal a consistent trait.")
mc("character", "RL.6.3", 4, "Read: “Rather than arguing when the referee made a clearly wrong call against her team, Amal shook the referee’s hand after the match and thanked him for officiating.” Which word best describes Amal?",
   "gracious", [("resentful", "Shaking hands and thanking him shows the opposite of resentment."), ("aggressive", "Her calm, respectful reaction is the opposite of aggressive."), ("indifferent", "Choosing to thank him shows she cares about sportsmanship, not indifference.")],
   "Responding to an unfair call with respect, rather than anger, shows graciousness.", "How a character responds to being treated unfairly often reveals their true character.")
ms("character", "RL.6.3", 5, "Read: “Khalid volunteered to tutor the younger students every Tuesday for free, enjoyed drawing comics in his free time, kept a careful record of each student’s progress, and stayed late twice to help a struggling student catch up before an exam.” Which TWO details show that Khalid takes his tutoring role seriously?",
   ["“kept a careful record of each student’s progress”", "“stayed late twice to help a struggling student catch up before an exam”"],
   [("“volunteered to tutor the younger students every Tuesday for free.”", "This shows generosity in starting, but is not itself evidence of ongoing seriousness and effort."), ("“enjoyed drawing comics in his free time.”", "This is a personal hobby, unrelated to his tutoring role.")],
   "Tracking progress carefully and staying late to help show Khalid takes real, ongoing responsibility for his students’ learning.", "Look for evidence of sustained effort over time, not just the initial decision to help.")
mc("character", "RL.6.3", 3, "Read: “When her little brother accidentally deleted her science project files the night before the deadline, Rania took a breath, said, ‘It’s okay, accidents happen,’ and started rebuilding the project together with him.” Which word best describes Rania?",
   "patient", [("furious", "Her calm words show the opposite of fury."), ("careless", "Rebuilding carefully with her brother shows responsibility, not carelessness."), ("indifferent", "She actively helps rebuild, showing she cares about the outcome.")],
   "Responding calmly to a stressful accident, instead of reacting in anger, shows patience.", "A character’s reaction to someone else’s mistake often reveals a trait.")
mc("character", "RL.6.3", 4, "Read: “Yasmin refused to sign her name to the group project until every teammate’s contribution was listed accurately, even the smallest tasks.” Which word best describes Yasmin?",
   "fair", [("selfish", "Insisting on crediting everyone equally is the opposite of selfish."), ("lazy", "Checking every detail requires effort, not laziness."), ("careless", "Checking accuracy carefully is the opposite of careless.")],
   "Making sure every teammate gets accurate credit, even for small tasks, shows Yasmin values fairness.", "Look for a character’s insistence on fairness or accuracy toward others.")
tf("character", "RL.6.3", 3, "Read: “Mr. Aziz polished the same old doorknob he had installed decades earlier, smiling faintly, before telling Sara, ‘There is not much to tell.’” True or false: this detail suggests Mr. Aziz feels no pride in his long career.", False,
   "Smiling while polishing his old work suggests quiet pride, even though he downplays it in words.",
   "A character’s actions can reveal feelings that their words try to hide.")


# ============================================================ grade 6 thin curriculum families topup 3
# Grows six Grade 6 skill families that had 0-3 items: word-choice-tone, multiple-meaning,
# plot-setting, word-relationships, evaluate-argument, text-structure. Reading items reuse
# existing Grade 6 passages (G6-P1 ... G6-P11); the vocabulary-strategy items (multiple-meaning,
# word-relationships) are self-contained, like the NAFS topup above, since those skills test
# words and word-pair relationships rather than a specific text.

# ---- word-choice-tone (AUTHORS_CRAFT: word choice shapes tone) ----
mc("word-choice-tone", "RL.6.4", 4, "How does the phrase “its red taillights shrinking down the hill” affect the tone of the opening of “The Last Bus Home”?",
   "It creates a quiet, disappointed tone by picturing the bus getting farther and farther out of reach.",
   [("It creates an exciting tone, as if Yusuf is about to catch up.", "The bus is shrinking away, not getting closer."),
    ("It creates a comic tone meant to make the moment funny.", "Nothing about missing the last bus is played for laughs."),
    ("It creates a frightening tone, warning of danger ahead.", "The moment is disappointing, not dangerous.")],
   "Watching the lights shrink away pictures the bus as already out of reach, matching Yusuf's disappointment.",
   "Picture the image a word choice creates, then ask what feeling that image gives.", "G6-P1")
tf("word-choice-tone", "RI.6.6", 4, "True or false: the author's tone toward the claim that students would rather stay home anyway, in “Should Schools Switch to a Four-Day Week?”, is accepting and respectful.", False,
   "The author calls it something “everyone knows” with no evidence, which is a dismissive, skeptical way to treat a claim, not a respectful one.",
   "Test a description of tone against the author's actual word choices, not just the topic.", "G6-P2")
mc("word-choice-tone", "RI.6.4", 4, "How does describing bleached coral as “starving” rather than simply “pale” affect the tone of paragraph 3 in “Coral Reefs Under Pressure”?",
   "It creates a more urgent, concerned tone by stressing that the coral is in real danger, not just changing color.",
   [("It creates a playful tone, comparing coral to a picky eater.", "Starving signals real danger, not a joke about appetite."),
    ("It creates a hopeful tone, suggesting coral will recover quickly.", "Starving emphasizes risk, not quick recovery."),
    ("It creates a flat, purely clinical tone with no feeling at all.", "A word like starving adds emotional weight that a clinical term would not.")],
   "“Starving” frames bleaching as a survival crisis, which raises the emotional urgency of the paragraph.",
   "Compare a word choice to a plainer synonym to see what extra feeling it adds.", "G6-P3")
mc("word-choice-tone", "RL.6.4", 3, "How does Mr. Aziz's clipped dialogue in Scene 1 of “The Interview,” such as “I fix things. I clean things,” shape the tone of the opening?",
   "It creates a plain, modest tone that fits a man who does not think his own story is worth telling.",
   [("It creates a comic tone meant to make the audience laugh at him.", "His short answers are sincere, not played for laughs."),
    ("It creates an angry tone, showing he resents Sara's questions.", "He is brief and shy, not hostile."),
    ("It creates a mysterious tone meant to confuse the audience.", "His answers are plain and clear, just very short.")],
   "Short, simple sentences from a character often reflect a plain, modest attitude rather than drama or mystery.",
   "A character's sentence length and word choice can reveal their attitude before any action happens.", "G6-P5")
mc("word-choice-tone", "RI.6.6", 5, "How does listing specific details like “carved wooden doors,” “copper workshops,” and “spice sellers” affect the tone of paragraph 3 in the souq letter?",
   "It creates an admiring, affectionate tone by naming specific, cherished features that make the souq irreplaceable.",
   [("It creates a tone of complaint about buildings falling apart.", "The details celebrate the souq's features, not its disrepair."),
    ("It creates a sarcastic tone that mocks how old the souq is.", "The details are offered with pride, not mockery."),
    ("It creates a flat, list-like tone with no feeling behind it.", "Naming cherished, specific features adds warmth, not a neutral list.")],
   "Naming specific, beloved details shows affection and pride rather than a plain inventory.",
   "Specific, well-chosen details often carry more feeling than a general statement would.", "G6-P8")

# ---- multiple-meaning (VOCABULARY_STRATEGY: words with more than one meaning) ----
mc("multiple-meaning", "L.6.4.a", 3, "Read: “The coach decided to bench the injured player for the rest of the match.” What does bench mean in this sentence?",
   "to keep a player out of the game",
   [("to build a long seat for players", "The sentence is about a decision affecting the player, not building furniture."),
    ("to sit calmly and watch quietly", "Bench here is an action the coach takes, not a calm feeling."),
    ("to repair damaged sports equipment", "Nothing in the sentence is being repaired.")],
   "Benching a player means removing them from play, often because of injury.",
   "Multiple-meaning words can shift from naming an object (a bench) to naming an action (to bench someone).")
mc("multiple-meaning", "L.6.4.a", 3, "Read: “After the heavy rain, a fresh spring bubbled up at the base of the hill.” What does spring mean here?",
   "a natural source of water flowing up from the ground",
   [("the season between winter and summer", "No season is being described in this sentence."),
    ("a coiled piece of metal that stretches", "Nothing mechanical is described here."),
    ("to jump upward suddenly", "The sentence describes water, not a jumping motion.")],
   "The surrounding words “bubbled up” and “base of the hill” describe water emerging from the ground.",
   "Look closely at the words right around a multiple-meaning word to find which definition fits.")
mc("multiple-meaning", "L.6.4.a", 4, "Read: “The boxer's trainer told him to guard his right side.” What does right mean in this sentence?",
   "a direction, as opposed to left",
   [("correct or accurate", "The sentence is about a body position, not accuracy."),
    ("a legal entitlement, such as a right to vote", "No laws or entitlements are mentioned here."),
    ("immediately, as in “right now”", "The sentence is not describing timing.")],
   "In a sentence about guarding a side of the body during boxing, right names a direction.",
   "Think about the overall topic of a sentence to narrow down which meaning of a word fits.")
mc("multiple-meaning", "L.6.4.a", 4, "Read: “The elephant's trunk was strong enough to lift the fallen branch.” What does trunk mean here?",
   "an elephant's long, flexible nose",
   [("the thick main stem of a tree", "The sentence is about an elephant, not a tree."),
    ("a large box used for storage", "Nothing about storage is described."),
    ("the rear storage area of a car", "No car appears in this sentence.")],
   "The sentence describes an elephant lifting something, which points to its long, flexible nose.",
   "Multiple-meaning words can mean very different things depending on the subject of the sentence.")
mc("multiple-meaning", "L.6.4.a", 3, "Read: “Because he parked illegally, Omar had to pay a fine.” What does fine mean here?",
   "a sum of money paid as a penalty",
   [("in good health or condition, as in “I feel fine”", "The sentence describes a penalty for parking, not a feeling."),
    ("very thin or delicate, like fine sand", "No texture or thinness is described."),
    ("to carefully adjust something, as in “fine-tune”", "No adjustment of an object is described.")],
   "Paying something after parking illegally points directly to a monetary penalty.",
   "Look for words like “pay” or “penalty” nearby to identify this meaning of fine.")
dd("multiple-meaning", "L.6.4.a", 4, "Choose the meaning that fits: in “Hassan will table the proposal until the next meeting,” table means ____.",
   "to postpone discussing something",
   [("a piece of furniture with a flat top", "Here table is a verb describing an action, not naming furniture."),
    ("a chart that organizes numbers", "No chart or data is being organized in this sentence."),
    ("to place food in front of guests", "The sentence is about delaying a proposal, not serving food.")],
   "As a verb in a meeting context, table means to put something off until later.",
   "Check whether a multiple-meaning word is being used as a noun or a verb — that often changes its meaning.")
match("multiple-meaning", "L.6.4.a", 4, "Match each sentence with the meaning of the underlined multiple-meaning word as it is used in that sentence.",
      [("The committee will table the new policy until next month.", "to postpone discussing something"),
       ("We set extra chairs around the table for our guests.", "a piece of furniture with a flat top"),
       ("The pilot had to bank sharply to avoid the storm clouds.", "to tilt or turn to one side"),
       ("Hassan opened a savings account at the local bank.", "a business that holds and manages money")],
      "Context in each sentence shows which meaning of “table” and “bank” the author intends.",
      "Mentally replace the underlined word with its definition to check that the sentence still makes sense.")
ms("multiple-meaning", "L.6.4.a", 5, "Read these two sentences: “The students will note the date of the field trip on the calendar” and “Tariq left a short note on the fridge for his brother.” Which TWO meanings below correctly match note as used in the FIRST and SECOND sentence, in that order?",
   ["to write something down so it is remembered", "a brief written message"],
   [("a single musical sound", "This meaning does not fit either sentence."), ("to become famous or well known", "This meaning does not fit either sentence.")],
   "In the first sentence note is a verb meaning to record; in the second it is a noun meaning a short written message.",
   "Check each sentence separately — a multiple-meaning word's part of speech often signals which meaning fits.")

# ---- plot-setting (AUTHORS_CRAFT: how setting is established and used) ----
mc("plot-setting", "RL.6.3", 2, "Where does most of the action in “The Last Bus Home” take place?",
   "along Yusuf's walk home, ending at Mrs. Qadri's bakery",
   [("entirely inside Yusuf's house", "Most of the story follows Yusuf's walk, not a scene at home."),
    ("at the robotics club meeting", "The club is only mentioned; the meeting itself is never shown."),
    ("on the bus itself", "Yusuf misses the bus and never actually rides it in the story.")],
   "The story follows Yusuf's forty-minute walk, passing specific places like the bakery, after missing the bus.",
   "Track every place a character physically moves through to map out a story's setting.", "G6-P1")
mc("plot-setting", "RL.6.3", 4, "How does the detail that the bakery's “lights were still on” late at night affect the mood of that scene in “The Last Bus Home”?",
   "It creates a warm, welcoming feeling right after Yusuf's worried walk through the dark.",
   [("It creates a frightening feeling of being watched.", "The bakery is friendly and familiar, not threatening."),
    ("It suggests the bakery has been abandoned for the night.", "Lights being on shows the bakery is open and active."),
    ("It shows that Yusuf is in physical danger.", "Nothing in this detail suggests danger.")],
   "A lit, open bakery appearing after a dark, worried walk feels safe and welcoming, setting up the warm ending.",
   "A setting detail, like light appearing in the dark, can build mood before the plot explains why it matters.", "G6-P1")
mc("plot-setting", "RL.6.3", 2, "What is the setting of “The Interview”?",
   "a quiet storage room at the school during the last week of the school year",
   [("a busy newspaper office downtown", "The narrator specifies a school storage room, not an office."),
    ("Sara's home kitchen", "No scene takes place at Sara's home."),
    ("an empty school gym", "The flooded gym is only mentioned in Mr. Aziz's story, not shown as the setting.")],
   "The narrator states both the time and the place at the very start of the play.",
   "In drama, the opening narration or stage directions usually establish the setting.", "G6-P5")
mc("plot-setting", "RL.6.3", 3, "How are the settings of “The New Field” and “Transplant” similar?",
   "Both describe something being moved from a familiar place to a new, unfamiliar one.",
   [("Both take place entirely at the seaside.", "Yasmin moves away from the coast, and the tree leaves its courtyard."),
    ("Both take place within a single afternoon.", "Both unfold over several weeks, not one afternoon."),
    ("Both are set inside a classroom.", "Neither text is set in a classroom.")],
   "Yasmin moves from the coast to the mountains, and the lemon tree is lifted from its courtyard — both settings begin with displacement.",
   "Paired texts in different genres can still share a similar kind of setting or situation.", "G6-P6")
tf("plot-setting", "RL.6.3", 2, "True or false: the poem “Desert Night” is set during the daytime.", False,
   "Details like the sun slipping under the dunes and the sky described as black and scattered with stars show a nighttime setting.",
   "Time-of-day clues, such as a setting sun or visible stars, reveal when a scene is taking place.", "G6-P7")
mc("plot-setting", "RL.6.3", 3, "Over what span of time is the setting of “The Old Olive Tree” described?",
   "many decades, spanning the grandfather's and the speaker's lifetimes",
   [("a single afternoon", "The poem describes seasons of drought and wars passing, far more than one afternoon."),
    ("one autumn season only", "Autumn is mentioned, but the setting's timespan reaches back much further."),
    ("the speaker's one birthday", "No birthday or single-day event is mentioned in the poem.")],
   "References to “seasons of drought,” “wars that passed,” and “decades of patient toil” show a setting that spans a long time.",
   "A poem's setting can stretch across years or generations, not just a single scene.", "G6-P11")
mc("plot-setting", "RL.6.3", 4, "Where does the speaker stand while reflecting in the final stanza of “Ladder”?",
   "climbing the ladder, reaching for apples in the present",
   [("sitting beside the storm-felled tree", "The fallen tree became the ladder; the speaker now climbs it, in the present."),
    ("inside the grandfather's house", "No indoor scene is described anywhere in the poem."),
    ("watching a storm through a window", "The storm already happened years before the poem's present moment.")],
   "“I climb it now to reach the apples” places the speaker in a present-day setting built from a past memory.",
   "Look for present-tense verbs to find the “current” setting of a poem that also describes past memories.", "G6-P4")

# ---- word-relationships (VOCABULARY_STRATEGY: part/whole, cause/effect, item/category, etc.) ----
mc("word-relationships", "L.6.5.b", 3, "Which pair shows a WHOLE-to-PART relationship — the reverse order of part-to-whole?",
   "tree : branch",
   [("hour : minute", "This is a relationship between units of time, not a whole object and its part."),
    ("fish : school", "This is item-to-category: a fish is one member of the group called a school."),
    ("cold : hot", "This is a pair of antonyms, not a whole and its part.")],
   "A tree is the whole object, and a branch is one part of it — the whole is named first here.",
   "Decide which word names the whole object and which names a smaller piece of it, then check the order.")
mc("word-relationships", "L.6.5.b", 4, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "practice : improvement",
   [("teacher : student", "This describes two roles in a classroom, not a cause and its effect."),
    ("hungry : food", "Being hungry does not cause food to exist; it is simply a feeling about needing food."),
    ("book : chapter", "This is a part-to-whole relationship, not cause and effect.")],
   "Practicing a skill is what causes improvement to happen over time.",
   "Test a pair by making the sentence “X causes Y” — if it makes sense, the pair shows cause and effect.")
dd("word-relationships", "L.6.5.b", 4, "Choose the word that completes the ITEM-to-CATEGORY analogy: trumpet : instrument :: oak : ____",
   "tree",
   [("leaf", "A leaf would be a PART of an oak, which is a different relationship than item-to-category."),
    ("forest", "A forest is a group of many trees, not the general category that oak belongs to."),
    ("wood", "Wood names a material, not the broader category an oak belongs to.")],
   "An oak is one specific example within the broader category “tree,” just as a trumpet is one example within “instrument.”",
   "Ask: is the first word ONE SPECIFIC EXAMPLE of the second, more general word?")
match("word-relationships", "L.6.5.b", 5, "Match each word pair with the relationship it shows.",
      [("slice : pizza", "part to whole"), ("key : lock", "tool to the object it operates"),
       ("wolf : pack", "member to group"), ("melt : puddle", "cause to effect")],
      "Each pair follows a different logical relationship between the two words.",
      "Say the relationship aloud as a full sentence, such as “A slice is PART OF a pizza,” to test it.")
tf("word-relationships", "L.6.5.b", 3, "True or false: in the pair “spark : wildfire,” spark is the EFFECT and wildfire is the CAUSE.", False,
   "A spark is what starts, or causes, a wildfire; the wildfire itself is the effect, not the cause.",
   "Identify which event happens first in time — that event is usually the cause.")
ms("word-relationships", "L.6.5.b", 5, "Which TWO pairs below show a PART-to-WHOLE relationship? Choose two.",
   ["chapter : novel", "ingredient : recipe"],
   [("author : reader", "These name two different roles, not a part contained within a whole."), ("hot : cold", "This is a pair of antonyms, not part-to-whole.")],
   "A chapter is one part of a whole novel, and an ingredient is one part of a whole recipe.",
   "Check whether the first word names a small piece contained within the second, larger thing.")
fill("word-relationships", "L.6.5.b", 3, "Complete the analogy by writing one word: finger : hand :: toe : ____",
     ["foot"],
     "A finger is part of a hand, just as a toe is part of a foot — the same part-to-whole relationship on both sides.",
     "Keep the exact same relationship between the words on both sides of an analogy.")

# ---- evaluate-argument (AUTHORS_CRAFT: evaluate claims, evidence and reasoning) ----
mc("evaluate-argument", "RI.6.8", 5, "Is the reasoning behind “schools should be cautious” adequately supported by the evidence that follows it in “Should Schools Switch to a Four-Day Week?”?",
   "Yes, because the article follows with a specific study on math scores, cost data, and a concern about childcare.",
   [("No, because the author never gives any evidence to support caution.", "The article provides a study, cost data, and a specific family concern."),
    ("No, because the article only offers one opinion with no facts.", "Multiple kinds of evidence are given, not a single unsupported opinion."),
    ("Yes, but only because the author repeats the claim three times.", "Repetition alone does not support a claim; specific evidence does.")],
   "The article backs its cautious claim with a study on scores, cost data, and a concrete family concern, which together make the reasoning well supported.",
   "To evaluate an argument, check whether specific evidence — not just a repeated claim — actually backs it up.", "G6-P2")
tf("evaluate-argument", "RI.6.8", 4, "True or false: the four-day week article provides sufficient evidence to evaluate its claim about cost savings, because it cites a specific percentage from named reports.", True,
   "The article states that savings are “often less than two percent of the budget,” citing reports as its source, which counts as specific, checkable evidence.",
   "A specific number tied to a named source usually counts as sufficient evidence, unlike a vague, unsupported claim.", "G6-P2")
mc("evaluate-argument", "RI.6.8", 6, "A classmate claims the four-day week article is NOT persuasive because it never considers the supporters' point of view. Is this a fair evaluation of the argument?",
   "No, because the article states each of the supporters' claims before responding to it with evidence.",
   [("Yes, because the article completely ignores why anyone would want a four-day week.", "The article opens each point by stating the supporters' claim first."),
    ("Yes, because the article only discusses cost, never learning.", "Learning is actually the first and most developed point in the article."),
    ("No, but only because the article ultimately agrees with the supporters.", "The article disagrees with the supporters in its conclusion.")],
   "The article consistently states a supporting claim first, then responds to it with evidence — a structure that does consider the other side fairly.",
   "To evaluate a claim about an argument's fairness, check whether it actually addresses opposing views point by point.", "G6-P2")
mc("evaluate-argument", "RI.6.8", 5, "Which type of support does Huda rely on MOST to persuade the council in her souq letter, based on the letter as a whole?",
   "personal and emotional appeals, such as her family's connection to the souq",
   [("statistical data about tourist numbers", "No statistics or survey numbers are given anywhere in the letter."),
    ("expert testimony from historians", "No outside experts are quoted or cited in the letter."),
    ("a formal economic comparison of both options", "No cost or economic analysis appears in the letter.")],
   "Huda's strongest support comes from personal history and emotional appeal, since the letter contains no statistics, experts, or formal analysis.",
   "Evaluate what KIND of evidence — personal, statistical, or expert — an argument actually relies on.", "G6-P8")
mc("evaluate-argument", "RI.6.8", 6, "Is Huda's suggestion to “repair its roof, improve its lighting and add signs in several languages” a strong part of her argument?",
   "Yes, because it offers the council a realistic alternative instead of only criticizing their plan.",
   [("No, because she never explains what the council should do instead.", "She lists three specific actions the council could take."),
    ("No, because repairs would clearly cost more than a new shopping center.", "Costs are never compared anywhere in the letter."),
    ("Yes, but only because it is the longest paragraph in the letter.", "Its practicality, not its length, is what makes the suggestion effective.")],
   "A persuasive argument is stronger when it offers a workable alternative rather than only a complaint, which is exactly what this paragraph does.",
   "Strong arguments often propose a specific solution, not just an objection to the opposing plan.", "G6-P8")
ms("evaluate-argument", "RI.6.8", 5, "Which TWO qualities make Huda's souq-letter argument more convincing to a fair-minded reader? Choose two.",
   ["She directly answers the council's own reasoning about attracting visitors.", "She proposes a specific, practical alternative instead of only objecting."],
   [("She insults the council members personally.", "She never insults anyone anywhere in the letter."), ("She repeats the same sentence many times for emphasis.", "She does not rely on repeating a sentence for emphasis.")],
   "Directly addressing the opposing reasoning and offering a workable solution are two hallmarks of a convincing, fair argument.",
   "Evaluate an argument's persuasiveness by looking for direct responses to the other side and practical solutions, not strong feelings alone.", "G6-P8")
mc("evaluate-argument", "RI.6.8", 6, "Does the author of “Should Homework Be Optional?” adequately address the concern that optional homework could let struggling students fall behind?",
   "Yes, because the author offers a specific counter-reason: teachers could give struggling students more targeted attention.",
   [("No, because the author never mentions this concern at all.", "Paragraph 4 directly raises and responds to exactly this concern."),
    ("No, because the author admits optional homework would hurt struggling students.", "The author argues the opposite — that support could actually improve."),
    ("Yes, but only by repeating the original claim more forcefully.", "The author gives a genuinely new reason, not just a louder repetition.")],
   "The author directly answers the concern with a new, specific reason — more precise, individualized teacher attention — rather than ignoring it or simply repeating the claim.",
   "A strong rebuttal offers a NEW reason to support its position, not just a restatement of the original claim.", "G6-P10")

# ---- text-structure (AUTHORS_CRAFT: how a text is organized) ----
mc("text-structure", "RI.6.5", 4, "Which organizational structure does the author use across paragraphs 2 and 3 of “Coral Reefs Under Pressure”?",
   "cause and effect — paragraph 2 explains the coral-algae partnership, and paragraph 3 explains what happens when warm water breaks it down",
   [("compare and contrast — the two paragraphs compare two different reef locations", "No two separate reef locations are compared anywhere in the text."),
    ("chronological order — the paragraphs describe events on a historical timeline", "No dates or historical timeline structure appear in these paragraphs."),
    ("problem and solution — paragraph 3 proposes a fix for a problem raised in paragraph 2", "Paragraph 3 describes a problem; the proposed fix does not appear until paragraph 4.")],
   "Paragraph 2 sets up the normal partnership, and paragraph 3 shows the effect of a cause — warm water — breaking that partnership down.",
   "Look for signal words like “when” or “because” that connect a cause to its effect.", "G6-P3")
mc("text-structure", "RI.6.5", 5, "What is the OVERALL organizational structure of “Coral Reefs Under Pressure”?",
   "a problem-and-solution structure — it explains why reefs matter, the threat they face, and how scientists are responding",
   [("a simple list of unrelated reef facts", "The paragraphs build logically from importance, to threat, to response, rather than listing unrelated facts."),
    ("a step-by-step set of instructions for building a reef", "The text explains and informs rather than giving instructions to follow."),
    ("a comparison between two very different kinds of coral reefs", "Only one general kind of reef is discussed throughout the text.")],
   "The text moves from the value of reefs, to the threat of bleaching, to the scientific response — a clear problem-and-solution pattern.",
   "Ask whether a whole informational text introduces a problem and then describes a response to find its overall structure.", "G6-P3")
order("text-structure", "RI.6.5", 5, "Put these paragraph functions from “Coral Reefs Under Pressure” in the order they appear in the text.",
      ["Describe why reefs matter to ocean life", "Explain how the coral-algae partnership normally works",
       "Explain how warm water breaks down that partnership (bleaching)", "Describe how scientists are responding to help reefs"],
      "The text builds logically: importance, how it normally works, what goes wrong, and how people are responding.",
      "Identify what JOB each paragraph does, then put those jobs in the order they appear.", "G6-P3")
tf("text-structure", "RI.6.5", 3, "True or false: the final paragraph of “Coral Reefs Under Pressure” is organized as a physical description of what coral looks like.", False,
   "The final paragraph describes scientists' efforts and responses to bleaching, not a description of coral's appearance.",
   "Check what a paragraph is actually DOING — describing, explaining, or arguing — rather than assuming from its topic.", "G6-P3")
mc("text-structure", "RI.6.5", 5, "How does the author organize the body paragraphs of “Should Schools Switch to a Four-Day Week?”?",
   "Each body paragraph states one of the supporters' claims, then responds to it with evidence or reasoning.",
   [("Each paragraph describes a different school's daily schedule.", "No specific school schedules are described anywhere in the article."),
    ("The paragraphs are organized in simple time order, from Monday to Friday.", "There is no day-by-day account of a school week."),
    ("Each paragraph compares two different countries' school systems.", "No countries are compared in this article.")],
   "Each body paragraph follows a claim-and-response pattern: it states what supporters believe, then evaluates that claim with evidence.",
   "In argumentative texts, look for a repeating pattern across paragraphs, such as claim followed by a response.", "G6-P2")
match("text-structure", "RI.6.5", 6, "Match each paragraph's main structural job in “Should Schools Switch to a Four-Day Week?” with its paragraph number.",
      [("Paragraph 1", "introduces the issue and states the author's cautious claim"),
       ("Paragraph 2", "responds to the rest-and-achievement claim with learning evidence"),
       ("Paragraph 3", "responds to the money-saving claim with cost data"),
       ("Paragraph 5", "restates the claim to close the argument")],
      "Each numbered paragraph plays a specific structural role in building the overall argument.",
      "Identify the JOB each paragraph does within the text's overall structure.", passage="G6-P2")
mc("text-structure", "RI.6.5", 4, "What organizational structure does Huda use across her souq letter as a whole?",
   "problem-and-solution — she explains why the council's plan is a problem, then proposes a specific solution",
   [("a strict chronological retelling of her grandfather's entire life", "Her grandfather's story is one supporting detail, not the structure of the whole letter."),
    ("a side-by-side comparison of two different cities' souqs", "No second city's souq is described anywhere in the letter."),
    ("a plain physical description of the souq's architecture only", "Architecture is only one supporting detail among several, not the letter's overall structure.")],
   "Huda explains the problem, argues the souq's importance, answers a counterargument, and proposes a specific solution — a problem-and-solution structure.",
   "In a persuasive letter, look for a shift from describing a problem to proposing a specific action.", "G6-P8")
tf("text-structure", "RI.6.5", 4, "True or false: Huda's souq letter uses a cause-and-effect structure, where each paragraph explains a different physical cause of damage to the building.", False,
   "The letter is organized as problem-and-solution, built around persuasion, rather than a chain of physical causes and effects on the building itself.",
   "Do not assume a structure type just from a text's topic — check how the paragraphs actually connect to one another.", "G6-P8")
