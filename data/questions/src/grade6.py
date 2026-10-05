from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(6)

# ============================ PASSAGES (original) ============================
BUS = P("G6-P1", "The Last Bus Home", "Realistic Fiction", """
The 6:40 bus was the last one that ran past Yusuf's neighborhood, and he had never missed it. Tonight, though, the robotics club had stayed late to fix a jammed gear, and when Yusuf finally burst through the school doors, the bus was already pulling away, its red taillights shrinking down the hill.

He checked his phone: four percent battery. He typed a quick message to his mother—"Missed bus. Walking."—and watched the screen go black before it sent.

The walk would take forty minutes. Yusuf zipped his jacket and started down the hill, rehearsing what he would say. It wasn't my fault, he practiced. The gear was stuck. Everyone stayed.

Halfway home, he passed Mrs. Qadri's bakery. The lights were still on, and through the window he saw his younger sister, Mariam, sitting at a table with a cup of cocoa. She waved wildly. Mrs. Qadri opened the door. "Your mother called every shop on this street," she said. "Mariam insisted on waiting here because she knew you'd pass by."

Yusuf felt the excuses dissolve. He had spent twenty minutes preparing a defense, and no one had been angry at all—only worried.

Mariam handed him a second cup. "I told Mama you'd walk the bakery way," she said. "You always do."

Yusuf laughed. All this time he had thought of his little sister as someone to look after. He had never considered that she might be looking after him.
""")

WEEK = P("G6-P2", "Should Schools Switch to a Four-Day Week?", "Argumentative Text", """
More schools are considering a four-day week with longer school days. Supporters believe it would improve learning, but the evidence suggests schools should be cautious.

Supporters argue that a three-day weekend gives students more rest. However, a study of several districts that adopted four-day weeks found that, on average, students' math scores grew more slowly than in similar five-day schools. Longer days also mean that younger students may grow tired by the final hours, when focus is hardest to maintain.

Another claim is that a four-day week saves money. Districts do save some money on buses and heating, but reports show these savings are usually small—often less than two percent of the budget—because teacher salaries, the largest cost, do not change.

Finally, families must find care for children on the fifth day. For working parents, this can be expensive and stressful. Everyone knows that students would rather stay home anyway, so a four-day week would only make them lazier.

A school calendar should be built around what helps students learn most. Until stronger evidence shows that a four-day week improves learning, schools should keep the five-day schedule.
""")

REEF = P("G6-P3", "Coral Reefs Under Pressure", "Informational Text", """
Coral reefs cover less than one percent of the ocean floor, yet scientists estimate that they support about a quarter of all marine species. Fish shelter in their branches, sea turtles feed on reef plants, and coastlines are protected because reefs break the force of storm waves.

A reef is built by tiny animals called coral polyps. Each polyp lives with microscopic algae inside its tissues. The algae produce food through photosynthesis and share it with the coral; in return, the coral provides the algae with shelter. This partnership also gives coral its brilliant colors.

When ocean water becomes too warm, the partnership breaks down. Stressed corals expel their algae, and without them, the corals turn white—a process called bleaching. Bleached coral is not dead, but it is starving. If temperatures stay high for weeks, the coral may die.

Scientists are responding in several ways. Some grow young corals in underwater nurseries and transplant them onto damaged reefs. Others search for "heat-tolerant" corals that survive warmer water and breed them. These efforts help, but researchers agree that reefs can only recover on a large scale if ocean temperatures stop rising.
""")

LADDER = P("G6-P4", "Ladder", "Poetry", """
My grandfather built a ladder
from the branches of a storm-felled tree,
each rung a different width,
each one a year he gave to me.

The first rung, wide and steady,
the year I learned to read;
the third rung, thin and narrow,
the winter I was sick and weak.

I climb it now to reach the apples
that he planted long ago—
each step a story under my feet,
each branch a thing I know.
""")

# ============================ LITERATURE (RL.6) ============================
mc("plot-events", "RL.6.3", 3, "What event sets the plot of “The Last Bus Home” in motion?",
   "Yusuf misses the last bus after robotics club runs late.",
   [("Mariam waits at the bakery.", "This happens later, as part of the resolution."), ("Yusuf's phone battery dies.", "This makes the problem worse, but it isn't the first event."), ("Mrs. Qadri opens the door.", "This happens near the end.")],
   "Missing the 6:40 bus creates the problem that drives the rest of the story.",
   "The inciting incident is the first event that creates the story's problem.", BUS)
mc("character", "RL.6.3", 5, "How does Yusuf respond to his problem during the walk home?",
   "He rehearses excuses because he expects to be blamed.",
   [("He calls his mother every few minutes.", "His phone is dead."), ("He runs to catch the bus at the next stop.", "He decides to walk the whole way."), ("He forgets about the problem completely.", "He spends twenty minutes preparing a defense.")],
   "The italic lines (“It wasn't my fault…”) show him preparing to defend himself.",
   "RL.6.3: notice how characters respond as the plot moves forward.", BUS)
mc("character", "RL.6.3", 6, "How does Yusuf change by the end of the story?",
   "He realizes his younger sister cares for him, not just the other way around.",
   [("He decides to quit the robotics club.", "The club is never mentioned again."), ("He becomes angry at his mother for worrying.", "He laughs and feels relieved."), ("He learns to always charge his phone.", "This lesson is never stated.")],
   "The last paragraph states his new understanding about Mariam.",
   "Character change is often revealed in the final thoughts of the main character.", BUS)
mc("point-of-view", "RL.6.6", 5, "The story is told in third person but follows only Yusuf's thoughts. How does this affect the reader?",
   "Readers share Yusuf's worry, so they are surprised along with him that no one is angry.",
   [("Readers know from the start that his family is not angry.", "We only learn this when Yusuf does."), ("Readers understand Mariam's thoughts during the whole story.", "We don't hear Mariam's thoughts."), ("Readers learn about every character equally.", "The narration stays close to Yusuf.")],
   "A limited narrator lets readers discover the truth at the same moment as the character.",
   "RL.6.6: ask how the narrator's point of view develops the story.", BUS)
mc("theme", "RL.6.2", 5, "Which statement best expresses a theme of the story?",
   "People who care about us may be worried rather than angry when things go wrong.",
   [("Robotics clubs should end earlier.", "This is a detail, not a universal message."), ("Bakeries are good places to wait.", "This is about the setting."), ("Phones should always be charged.", "This is practical advice, not the theme.")],
   "Yusuf prepares a defense, but discovers his family was only worried. That realization is the theme.",
   "A theme is a universal statement, not a summary of the plot.", BUS)
mc("figurative-language", "RL.6.4", 6, "“Yusuf felt the excuses dissolve.” What does the word dissolve suggest?",
   "His prepared excuses disappeared because they were no longer needed.",
   [("He forgot how to speak.", "He talks and laughs afterward."), ("The cocoa melted his excuses.", "Dissolve is figurative here."), ("He wrote his excuses on paper.", "The excuses were only in his mind.")],
   "Like sugar in water, the excuses vanish once he sees no one is angry.",
   "When a word is used figuratively, think about its literal meaning first, then apply it.", BUS)
ms("text-evidence", "RL.6.1", 5, "Which TWO details best support the idea that Mariam knows her brother well?",
   ["“I told Mama you'd walk the bakery way.”", "“You always do.”"],
   [("“She waved wildly.”", "This shows excitement, not knowledge of Yusuf."), ("“Your mother called every shop on this street.”", "This is about the mother.")],
   "Mariam predicted Yusuf's route because she knows his habits.",
   "RL.6.1: choose evidence that directly supports the specific claim.", BUS)
order("plot-events", "RL.6.5", 4, "Order these events from “The Last Bus Home.”",
      ["The robotics club stays late.", "Yusuf watches the bus pull away.", "His phone dies after a quick message.",
       "He rehearses excuses while walking.", "He finds Mariam waiting at the bakery."],
      "The plot unfolds as a series of connected episodes from problem to resolution.",
      "Each episode leads to the next; look for cause and effect.", BUS)

mc("poetry-elements", "RL.6.5", 5, "How does the second stanza contribute to the poem “Ladder”?",
   "It explains that the different rungs stand for different years in the speaker's life.",
   [("It describes how to build a ladder.", "The poem is not instructions."), ("It introduces the grandfather for the first time.", "He appears in stanza 1."), ("It changes the topic to apple trees.", "Apples appear in stanza 3.")],
   "Stanza 2 links rung widths to specific years—an easy year, a hard year—developing the central metaphor.",
   "RL.6.5: ask what each stanza adds to the whole poem.", LADDER)
mc("figurative-language", "RL.6.4", 6, "What does the ladder represent in the poem?",
   "the speaker's life and the grandfather's care that supports it",
   [("a tool the speaker needs to fix the house", "The ladder is used to reach the grandfather's apples."), ("the storm that destroyed the tree", "The storm only explains where the branches came from."), ("the speaker's fear of heights", "Fear is never mentioned.")],
   "Each rung is “a year he gave to me,” so the ladder stands for years of the speaker's life shaped by the grandfather.",
   "A symbol is an object that stands for a bigger idea.", LADDER)
mc("connotation", "RL.6.4", 5, "In “the third rung, thin and narrow,” what feeling do the words thin and narrow create?",
   "a sense of difficulty and weakness", [("a sense of joy", "Joy would match words like wide and steady."), ("a sense of anger", "No words suggest anger."), ("a sense of boredom", "The year is described as hard, not dull.")],
   "Thin and narrow connote fragility, matching “the winter I was sick and weak.”",
   "Connotation = the feeling a word suggests beyond its dictionary meaning.", LADDER)

# ============================ INFORMATIONAL (RI.6) ============================
mc("author-claim", "RI.6.8", 3, "What is the author's central claim?",
   "Schools should keep the five-day week until there is stronger evidence for a four-day week.",
   [("Four-day weeks save schools a lot of money.", "The author argues the savings are small."), ("Students need more rest on weekends.", "This is the supporters' argument."), ("Teachers should earn higher salaries.", "Salaries are mentioned only to explain costs.")],
   "The introduction and conclusion both state the claim.", "The claim is the position the whole text argues for.", WEEK)
mc("author-claim", "RI.6.8", 5, "Which piece of evidence best supports the claim that a four-day week may hurt learning?",
   "Math scores grew more slowly in districts that switched to four days.",
   [("Districts save money on buses.", "This is about cost, not learning."), ("Families must find care for the fifth day.", "This is about families, not learning."), ("Supporters believe students need rest.", "This is the opposing view.")],
   "A study comparing math growth is direct evidence about learning.", "Relevant evidence must connect directly to the specific claim.", WEEK)
mc("author-claim", "RI.6.8", 7, "Which claim in the text is NOT supported by reasons or evidence?",
   "Everyone knows that students would rather stay home anyway, so a four-day week would only make them lazier.",
   [("Districts do save some money on buses and heating.", "This is supported by reports."), ("Savings are usually small because salaries do not change.", "The author explains why with a reason."), ("Students' math scores grew more slowly.", "This is supported by a study.")],
   "“Everyone knows” is a sweeping generalization with no evidence; it weakens the argument.",
   "RI.6.8: distinguish supported claims from unsupported ones. Watch for “everyone,” “always,” and “never.”", WEEK)
mc("author-claim", "RI.6.8", 6, "How does the author treat the claim that a four-day week saves money?",
   "The author admits there are some savings, then shows they are small.",
   [("The author ignores it completely.", "Paragraph 3 addresses it."), ("The author agrees it is the strongest reason.", "The author argues the savings are small."), ("The author says it costs more money.", "The author says districts do save some.")],
   "This is a concession and rebuttal: “Districts do save some money … but … these savings are usually small.”",
   "Strong arguments acknowledge the other side, then respond with evidence.", WEEK)
tf("author-claim", "RI.6.8", 4, "True or false: The author's concluding paragraph restates the claim.", True,
   "The final sentence repeats that schools should keep the five-day schedule.", "Conclusions in arguments usually restate the claim.", WEEK)

mc("central-idea", "RI.6.2", 4, "What is the central idea of “Coral Reefs Under Pressure”?",
   "Coral reefs are vital to ocean life but are threatened by warming water, and scientists are working to protect them.",
   [("Coral polyps are tiny animals.", "This is a supporting detail."), ("Sea turtles eat reef plants.", "This is one example of reef life."), ("Algae make coral colorful.", "This is a detail about the partnership.")],
   "The text explains why reefs matter, the threat of bleaching, and scientists' responses.",
   "RI.6.2: the central idea is developed across the whole text.", REEF)
mc("summarize", "RI.6.2", 5, "Which is the best summary of paragraph 3?",
   "Warm water causes coral to expel its algae and turn white; if the heat lasts, the coral can die.",
   [("Coral is beautiful and white.", "White coral is bleached and starving."), ("Scientists grow coral in nurseries.", "That is paragraph 4."), ("Coral reefs protect coastlines from storms.", "That is paragraph 1.")],
   "A good summary keeps only the key ideas of the paragraph, without opinions.",
   "Summaries are short, objective, and include only the most important points.", REEF)
mc("cause-effect", "RI.6.5", 4, "According to the text, what causes coral bleaching?",
   "Water that is too warm makes corals expel their algae.",
   [("Fish eat the algae.", "The text does not say this."), ("Storm waves break the coral.", "Reefs break waves; this does not cause bleaching."), ("Polyps produce too much food.", "The algae produce the food.")],
   "“When ocean water becomes too warm … stressed corals expel their algae.”",
   "Look for “when” and “as a result” to find causes.", REEF)
mc("compare-contrast", "RI.6.5", 6, "How does paragraph 2 contribute to the development of ideas in the text?",
   "It explains the coral–algae partnership so readers understand why bleaching is harmful.",
   [("It introduces the scientists' solutions.", "Solutions come in paragraph 4."), ("It argues that reefs cannot be saved.", "The text describes hopeful efforts."), ("It lists animals that live on reefs.", "That is paragraph 1.")],
   "Without knowing the algae feed the coral, readers wouldn't see why losing them means starving.",
   "RI.6.5: analyze how a paragraph fits into the overall structure.", REEF)
mc("context-clues", "L.6.4.a", 5, "Bleached coral is “not dead, but it is starving.” What does expel mean in “stressed corals expel their algae”?",
   "push out", [("feed", "If the algae were fed, the coral would not starve."), ("grow", "Growing would not lead to bleaching."), ("protect", "Protection would keep the algae inside.")],
   "Because the algae leave and the coral turns white and starves, expel must mean force out.",
   "L.6.4.a: use the overall meaning of the paragraph as a clue.", REEF)
mc("author-perspective", "RI.6.6", 6, "What is the author's point of view about efforts to save reefs?",
   "The efforts are helpful, but reefs need ocean temperatures to stop rising to fully recover.",
   [("The efforts are useless and should stop.", "The author says they help."), ("The efforts have already saved all reefs.", "The author says large-scale recovery depends on temperature."), ("Only nurseries matter.", "Two efforts are described.")],
   "The final sentence balances hope (“these efforts help”) with a limit (“only … if ocean temperatures stop rising”).",
   "RI.6.6: words like but and only signal the author's view.", REEF)

# ============================ VOCABULARY (L.6.4–6.5) ============================
mc("greek-latin-roots", "L.6.4.b", 4, "The Latin root aud means hear. Which word means “able to be heard”?",
   "audible", [("auditorium", "An auditorium is a place for hearing."), ("audience", "An audience is a group that listens."), ("audition", "An audition is a hearing for a performance.")],
   "Aud (hear) + -ible (able to be) = audible.", "L.6.4.b: Greek or Latin affixes and roots are clues to meaning.")
mc("greek-latin-roots", "L.6.4.b", 5, "Bio means life and logy means study of. What does a biologist study?",
   "living things", [("rocks and minerals", "That is geology."), ("stars and planets", "That is astronomy."), ("the past", "That is history.")],
   "Bio (life) + logy (study) + -ist (person) = a person who studies life.", "Split the word into parts and translate each one.")
match("greek-latin-roots", "L.6.4.b", 6, "Match each word to its meaning using roots.",
      [("chronological", "in time order"), ("benefit", "something good"), ("transport", "carry across"), ("autograph", "self-written signature")],
      "chron = time, bene = good, trans = across + port = carry, auto = self + graph = write.",
      "Roots appear in many related words: chronic, beneficial, portable, automatic.")
mc("reference-materials", "L.6.4.c", 3, "Which part of a dictionary entry tells you how to say a word?",
   "the pronunciation in parentheses or slashes", [("the definition", "Definitions give meaning."), ("the guide words", "Guide words help you find the page."), ("the example sentence", "Examples show usage.")],
   "Dictionaries show pronunciation with special symbols and stress marks.", "L.6.4.c: consult reference materials for pronunciation and meaning.")
mc("reference-materials", "L.6.4.c", 4, "The guide words on a dictionary page are cobalt and coconut. Which word would be on that page?",
   "cockpit", [("coast", "Coast (co-a) comes before cobalt (co-b)."), ("coffee", "Coffee (co-f) comes after coconut (co-c)."), ("cozy", "Cozy (co-z) comes after coconut.")],
   "Cockpit (co-c-k) comes after cobalt (co-b) and before coconut (co-c-o).", "Compare letter by letter until the words differ.")
mc("figurative-language", "L.6.5.a", 4, "“The wind whispered secrets through the trees.” What figure of speech is this?",
   "personification", [("hyperbole", "Hyperbole is extreme exaggeration."), ("simile", "No like or as."), ("alliteration", "The sentence doesn't repeat beginning sounds as its main effect.")],
   "Whispering secrets is a human action given to the wind.", "L.6.5.a: interpret figures of speech in context.")
mc("figurative-language", "L.6.5.a", 5, "“I've told you a million times to close the door!” What does this hyperbole mean?",
   "The speaker has said it many times and is frustrated.",
   [("The speaker counted exactly a million reminders.", "Hyperbole is not meant literally."), ("The door is broken.", "The sentence is about repeated reminders."), ("The speaker is happy.", "The tone is frustrated.")],
   "Hyperbole exaggerates for emphasis.", "Ask: is this exaggeration meant to show a feeling?")
mc("synonyms-antonyms", "L.6.5.b", 4, "Which pair shows a PART-to-WHOLE relationship?",
   "page : book", [("happy : joyful", "These are synonyms."), ("rain : flood", "This is cause and effect."), ("hammer : tool", "This is item and category.")],
   "A page is one part of a whole book.", "L.6.5.b: relationships include cause/effect, part/whole, item/category.")
match("synonyms-antonyms", "L.6.5.b", 5, "Match each word pair to its relationship.",
      [("spark : fire", "cause / effect"), ("wheel : bicycle", "part / whole"), ("violin : instrument", "item / category"), ("ancient : modern", "antonyms")],
      "Identifying the relationship helps you understand both words.", "Make a sentence: “A spark CAUSES a fire,” “A wheel is PART OF a bicycle.”")
mc("connotation", "L.6.5.c", 4, "Which word has the most POSITIVE connotation for describing someone who saves money?",
   "thrifty", [("cheap", "Cheap suggests being unwilling to spend, a negative feeling."), ("stingy", "Stingy is negative."), ("greedy", "Greedy is negative and means wanting too much.")],
   "Thrifty suggests wisely careful with money.", "Words with similar denotations can feel very different.")
mc("connotation", "L.6.5.c", 6, "Which sentence makes the speaker sound most critical of the plan?",
   "The committee's scheme was announced on Monday.",
   [("The committee's plan was announced on Monday.", "Plan is neutral."), ("The committee's proposal was announced on Monday.", "Proposal is neutral or positive."), ("The committee's strategy was announced on Monday.", "Strategy sounds thoughtful.")],
   "Scheme connotes a sneaky or dishonest plan.", "Check how each word makes you feel, not just what it means.")
mc("idioms-adages", "L.6.5", 4, "“Don't put all your eggs in one basket” advises you to —",
   "spread your risks instead of depending on one thing",
   [("carry eggs carefully", "This is too literal."), ("buy more baskets", "The saying isn't about baskets."), ("eat eggs for breakfast", "The saying gives advice about risk.")],
   "If the one basket falls, everything is lost.", "Proverbs give general advice about life.")
mc("homographs-homophones", "L.6.4.a", 5, "In which sentence does object mean “to disagree”?",
   "I object to the new rule about phones.",
   [("That shiny object is a coin.", "Here object is a thing."), ("The object of the game is to score.", "Here object means goal."), ("Place the object on the table.", "Here object is a thing.")],
   "OBject (noun) = thing or goal; obJECT (verb) = to disagree.", "Homographs can change meaning AND stress.")

# ============================ GRAMMAR (L.6.1) ============================
mc("pronouns", "L.6.1.a", 3, "Choose the correct pronoun: “The coach gave the trophy to Laila and ____.”",
   "me", [("I", "After a preposition (to), use the objective case."), ("myself", "Myself is reflexive; there is no I in the sentence."), ("mine", "Mine is possessive.")],
   "To is a preposition, so its object must be in the objective case: me.", "L.6.1.a: subjective (I, he), objective (me, him), possessive (my, his).")
mc("pronouns", "L.6.1.a", 5, "Which sentence uses pronoun case correctly?",
   "She and I presented the science project.",
   [("Her and me presented the science project.", "Subjects need subjective pronouns."), ("Me and her presented the science project.", "Me and her are objective."), ("She and me presented the science project.", "Me cannot be a subject.")],
   "Both pronouns are subjects, so both must be subjective: she and I.", "Test each pronoun alone: “She presented.” “I presented.”")
mc("pronouns", "L.6.1.b", 4, "Which sentence uses an INTENSIVE pronoun?",
   "The principal herself handed out the awards.",
   [("The principal handed herself an award.", "Here herself is reflexive (the object)."), ("The principal handed out the awards.", "There is no -self pronoun."), ("She handed out the awards.", "She is a subject pronoun.")],
   "An intensive pronoun emphasizes a noun and could be removed without changing the meaning.",
   "Remove the -self word: if the sentence still works, it's intensive.")
mc("pronouns", "L.6.1.c", 5, "Which sentence has an inappropriate shift in pronoun person?",
   "When students study hard, you get better grades.",
   [("When students study hard, they get better grades.", "Students and they are both third person."), ("When you study hard, you get better grades.", "Both are second person."), ("When I study hard, I get better grades.", "Both are first person.")],
   "The sentence shifts from students (third person) to you (second person).", "L.6.1.c: keep pronoun number and person consistent.")
mc("pronouns", "L.6.1.d", 6, "Which sentence has a VAGUE pronoun?",
   "Omar told Sami that he had won the contest.",
   [("Omar told Sami that Sami had won the contest.", "The noun is repeated, so it is clear."), ("Omar told Sami, “You won the contest!”", "The quotation makes it clear."), ("Omar told Sami that Omar had won.", "The noun makes it clear.")],
   "He could mean Omar or Sami, so the reader can't tell who won.", "L.6.1.d: fix pronouns that could refer to more than one noun.")
err("pronouns", "L.6.1.d", 6, ["The teacher spoke to the students,", "and they", "were very proud of it."], 2, "were very proud of the results",
    "“It” has no clear antecedent—proud of what? Replace it with a specific noun.", "If you can't point to the exact noun a pronoun replaces, rewrite it.")
mc("verb-tenses", "L.6.1", 4, "Which sentence uses the past perfect tense correctly?",
   "The game had ended before we reached the stadium.",
   [("The game has ended before we reached the stadium.", "Has ended is present perfect."), ("The game ended before we had reach the stadium.", "Reach should be reached."), ("The game will have ended before we reached it.", "Will have is future perfect.")],
   "Past perfect (had ended) shows the earlier of two past actions.", "Had + past participle = past perfect.")
err("irregular-verbs", "L.6.1", 4, ["She had", "already wrote", "three chapters", "before lunch."], 1, "already written",
    "After had, use the past participle: write → wrote → written.", "Irregular verbs have special past participles: go/gone, eat/eaten, write/written.")
mc("fragments-run-ons", "L.6.1", 4, "Which is a run-on sentence?",
   "The library closes at six we need to hurry.",
   [("The library closes at six, so we need to hurry.", "A comma and so join the clauses correctly."), ("Because the library closes at six.", "This is a fragment, not a run-on."), ("The library closes at six; we need to hurry.", "A semicolon joins two clauses correctly.")],
   "Two independent clauses run together without punctuation.", "Fix with a period, semicolon, or comma + coordinating conjunction.")
mc("nouns", "L.6.1", 3, "Which word is a collective noun? “The team celebrated after the final whistle.”",
   "team", [("celebrated", "Celebrated is a verb."), ("whistle", "Whistle is a common noun but not collective."), ("final", "Final is an adjective.")],
   "A collective noun names a group as one unit: team, class, flock.", "Collective nouns are usually singular: The team IS ready.")
mc("plural-nouns", "L.6.1", 4, "Which shows the correct plural possessive? “The ____ uniforms were washed.”",
   "players'", [("player's", "This is singular possessive."), ("players's", "Do not add 's after a plural ending in s."), ("players", "This is plural without possession.")],
   "For plural nouns ending in s, add only an apostrophe: players'.", "Singular: player's. Plural: players'.")
mc("adjectives", "L.6.1", 3, "Which word is a demonstrative adjective? “Those shoes belong to my brother.”",
   "Those", [("shoes", "Shoes is a noun."), ("my", "My is a possessive pronoun/adjective."), ("belong", "Belong is a verb.")],
   "Those points to specific nouns (shoes); demonstratives are this, that, these, those.", "Demonstrative adjectives come right before a noun.")
mc("clauses-complex", "L.6.1", 5, "Which sentence is complex?",
   "Because the storm knocked out power, school was canceled.",
   [("The storm knocked out power, and school was canceled.", "This is compound."), ("The storm knocked out power.", "This is simple."), ("Knocked out power during the storm.", "This is a fragment.")],
   "A complex sentence has one independent clause and at least one dependent clause.", "Subordinating conjunctions (because, although, when) start dependent clauses.")

# ============================ MECHANICS (L.6.2) ============================
mc("commas", "L.6.2.a", 5, "Which sentence correctly punctuates the nonrestrictive element?",
   "My cousin, who lives in Jeddah, is visiting next week.",
   [("My cousin who lives in Jeddah, is visiting next week.", "A nonrestrictive clause needs commas on both sides."), ("My cousin, who lives in Jeddah is visiting next week.", "The closing comma is missing."), ("My cousin who lives, in Jeddah, is visiting next week.", "The commas are in the wrong places.")],
   "The clause adds extra information, so it is set off with commas.", "L.6.2.a: use commas, parentheses, or dashes for nonrestrictive elements.")
mc("commas", "L.6.2.a", 6, "Which sentence uses dashes correctly to set off extra information?",
   "The answer—which surprised everyone—was zero.",
   [("The answer which—surprised everyone—was zero.", "The dash must come before which."), ("The answer—which surprised everyone was zero.", "A second dash is needed."), ("The—answer which surprised everyone—was zero.", "The dash splits the subject.")],
   "Pairs of dashes surround the interrupting element.", "Dashes, like commas, come in pairs around extra information in the middle of a sentence.")
tf("commas", "L.6.2.a", 6, "True or false: In “Students who finish early may read quietly,” the clause who finish early should be set off with commas.", False,
   "The clause is restrictive—it tells WHICH students may read—so it does not take commas.", "If removing the clause changes the meaning, do not use commas.")
mc("quotations-dialogue", "L.6.2", 4, "Which sentence is punctuated correctly?",
   "“I'll bring the map,” said Hana, “if you bring the snacks.”",
   [("“I'll bring the map” said Hana, “if you bring the snacks.”", "A comma is needed before the closing quotation mark."), ("“I'll bring the map,” said Hana, “If you bring the snacks.”", "The sentence continues, so if is lowercase."), ("“I'll bring the map, said Hana, if you bring the snacks.”", "The speaker tag must be outside the quotation marks.")],
   "When a quotation is interrupted by a speaker tag, use commas and keep the second part lowercase.", "Punctuation stays inside the quotation marks.")
fill("spelling", "L.6.2.b", 4, "Spell the word correctly: The tour guide will ____ (accommodate) twenty visitors.", ["accommodate"],
     "Accommodate has two c's and two m's.", "Memory trick: it accommodates two c's and two m's.")

# ============================ LANGUAGE USE & WRITING ============================
mc("sentences", "L.6.3.a", 5, "Which revision best varies the sentence pattern? Original: “The sun set. The sky turned orange. Birds flew home.”",
   "As the sun set, the sky turned orange and birds flew home.",
   [("The sun set. The sky turned orange. The birds flew home.", "This keeps the same short pattern."), ("The sun set and the sky turned orange and birds flew home and it was evening.", "Too many ands makes it stringy."), ("Sun set. Sky orange. Birds home.", "These are fragments.")],
   "Combining with an introductory clause creates variety and flow.", "L.6.3.a: vary sentence patterns for meaning, interest, and style.")
mc("precise-language", "L.6.3.b", 5, "Which sentence keeps a consistent formal style in a research report?",
   "The results indicate that students who sleep eight hours perform better on tests.",
   [("The results show that kids who sleep a ton do way better.", "A ton and way better are informal."), ("So basically, sleep = good grades!", "Casual and uses a symbol."), ("Sleep is awesome for tests, LOL.", "LOL and awesome are informal.")],
   "Formal writing uses precise, neutral language.", "L.6.3.b: maintain consistency in style and tone.")
mc("writing-argument", "W.6.1.b", 5, "Which evidence is most credible to support the claim that exercise improves concentration?",
   "A university study found students focused longer after 20 minutes of activity.",
   [("My friend says running makes him smarter.", "One opinion is not credible evidence."), ("Exercise is fun for most people.", "Fun is not evidence about concentration."), ("An ad for sneakers says exercise boosts brain power.", "Ads are biased sources.")],
   "Research from a reliable institution is credible and relevant.", "W.6.1.b: use credible sources and relevant evidence.")
mc("writing-argument", "W.6.1.c", 4, "Which transition best introduces a counterclaim?",
   "Some people argue that", [("For example,", "This introduces evidence, not an opposing view."), ("In conclusion,", "This ends an essay."), ("First of all,", "This introduces a first reason.")],
   "Counterclaims present the other side before you respond to it.", "W.6.1.c: use words and phrases to clarify relationships among claims and reasons.")
mc("writing-informative", "W.6.2.c", 4, "Choose the best transition: “Coral reefs protect coastlines. ____, they provide homes for thousands of species.”",
   "Furthermore", [("Nevertheless", "This shows contrast."), ("For instance", "The second sentence isn't an example of the first."), ("Consequently", "The second idea is not a result of the first.")],
   "Furthermore adds another important idea.", "W.6.2.c: use transitions to clarify relationships among ideas.")
mc("writing-research", "W.6.8", 6, "Which source would be most reliable for a report on coral bleaching?",
   "a marine research institute's website", [("an anonymous social media post", "Anonymous sources cannot be checked."), ("a travel company's beach advertisement", "Advertisements have a commercial purpose."), ("a fictional story about mermaids", "Fiction is not factual evidence.")],
   "Research institutes have experts and publish evidence.", "W.6.8: assess the credibility of each source.")
order("writing-narrative", "W.6.3.c", 5, "Order the sentences to signal shifts in time and setting in a narrative.",
      ["That morning, the harbor was calm and gray.", "By noon, dark clouds had gathered over the water.",
       "Meanwhile, on the hill above town, my grandmother watched the sky.", "Hours later, the storm finally passed."],
      "Transitions (That morning, By noon, Meanwhile, Hours later) signal shifts in time and place.",
      "W.6.3.c: use transitions to convey sequence and signal shifts.")
