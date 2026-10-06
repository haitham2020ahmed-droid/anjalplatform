"""
Grade 6 question bank, expansion 1: skills that had no items.
Original passages and items written for this platform (no publisher text).
Imported by build_bank.py after the earlier modules, so existing refs never change.
"""
from qb import P, dd, err, fill, grade, match, mc, ms, order, tf

grade(6)

# ------------------------------------------------------------------ passages

P5 = P("G6-P5", "The Interview", "Drama", """
CAST: SARA, a sixth grader who writes for the school newspaper; MR. AZIZ, the school’s retiring custodian; NARRATOR

NARRATOR: It is the last week of school. In a quiet storage room filled with mops, paint cans and a battered radio, Sara has arranged an interview.

SCENE 1
[SARA sits on an upturned bucket with a notebook. MR. AZIZ polishes a brass doorknob and does not look up.]

SARA: Thank you for meeting me, Mr. Aziz. Our readers want to know about your thirty years here.

MR. AZIZ: [shrugging] There is not much to tell. I fix things. I clean things.

SARA: [aside, to the audience] He has answered every question with six words or fewer. My editor wants five hundred.

SARA: [pointing at the radio] Does that radio still work?

MR. AZIZ: [stopping, then smiling for the first time] That radio was on the day the old gym flooded. I carried two hundred chairs to the library, one by one, while it played the evening news. [He sets down the doorknob.] Sit closer. That was 1998…

SCENE 2
[Two hours later. SARA’s notebook is full. The radio plays softly.]

SARA: [closing the notebook] I came for a short article. I think I’m leaving with a book.

MR. AZIZ: [handing her the doorknob] Take this. It was on the first door I ever fixed here. Some things last if you look after them.
""")

P6 = P("G6-P6", "Starting Over: A Story and a Poem", "Paired Texts", """
Text 1: The New Field (story)

When Yasmin’s family moved from the coast to the mountains, she left behind the only football team she had ever known. At her new school, the girls played on a field of rocky, uneven ground, and the ball bounced in every direction but the one she aimed for.

For the first week, Yasmin sat on the bench and watched. She missed the flat green field by the sea, where she knew every patch of grass. On Thursday, the coach tossed her a ball. “Learn this field,” he said, “and it will learn you.”

So Yasmin came early every morning. She kicked the ball against the same stone wall a hundred times, studying how it rolled across the slopes. By the end of the month, she could bend a pass around a rock that tripped everyone else. When her new teammates cheered her first goal, she realized she had stopped comparing the two fields.

Text 2: Transplant (poem)

They lifted the small lemon tree
from the courtyard where it grew,
roots wrapped in burlap, leaves trembling
at a sky it never knew.

For weeks it dropped its yellow light
and bowed its narrow head,
until one morning, green and bright,
new buds broke out instead.
""")

P7 = P("G6-P7", "Desert Night", "Poetry", """
When the sun slips under the dunes like a coin into a pocket,
the sand gives back the day’s heat in slow, warm breaths.
A cool wind combs the ridges, whispering through dry grass,
and the sky unrolls its black carpet, scattered with salt.

Somewhere a camel groans, low as a cello string;
the coffee pot hisses on the coals, bitter and gold with cardamom.
I hold the small cup with both hands
and taste the smoke, the spice, the vast and silent dark.
""")

P8 = P("G6-P8", "Letter to the Editor: Save the Old Souq", "Argumentative Text", """
To the Editor:

The city council plans to replace our old covered souq with a modern shopping center. I am a sixth grader, and I urge the council to change its plan.

The souq is more than a place to shop. My grandfather sold spices there for forty years, and my mother bought my first school bag from the leather maker beside his stall. When I walk under its arches, I am walking through my family’s history and my city’s history.

The council says a shopping center would bring more visitors. However, visitors travel to see what is special about a place. They can visit a shopping center in any city in the world, but they can find our carved wooden doors, our copper workshops and our spice sellers only here.

Instead of tearing down the souq, the council could repair its roof, improve its lighting and add signs in several languages. These changes would protect our heritage and welcome visitors at the same time.

Please do not let our history disappear behind a glass wall.

Respectfully,
Huda Al-Mansour, Grade 6
""")

# ---------------------------------------------------- drama elements (RL.6.5)

mc("drama-elements", "RL.6.5", 2, "What is the role of the NARRATOR in “The Interview”?",
   "To introduce the setting and situation before the action begins",
   [("To play a character in the interview", "The narrator does not take part in the scenes."),
    ("To give stage directions to actors", "Stage directions are in brackets."),
    ("To interview Mr. Aziz", "Sara conducts the interview.")],
   "The narrator explains when and where the play takes place and why Sara is there.",
   "A narrator in a play speaks to the audience to provide background.", P5)
mc("drama-elements", "RL.6.5", 3, "What is an aside, as used by Sara in Scene 1?",
   "A comment spoken to the audience that other characters do not hear",
   [("A stage direction about where to stand", "An aside is spoken, not a direction."),
    ("A long speech to another character", "That is a monologue."),
    ("A change of scene", "Scene changes are marked with scene headings.")],
   "Sara’s aside reveals her frustration to the audience without Mr. Aziz hearing it.",
   "Asides let the audience know a character’s private thoughts.", P5)
tf("drama-elements", "RL.6.5", 2, "In “The Interview,” Scene 2 takes place two hours after Scene 1.", True,
   "The stage directions for Scene 2 say “Two hours later.”",
   "Scene headings and stage directions show changes in time and place.", P5)
mc("drama-elements", "RL.6.5", 4, "How does the stage direction [stopping, then smiling for the first time] contribute to the plot?",
   "It marks the turning point when Mr. Aziz begins to open up.",
   [("It shows that Mr. Aziz is finished working for the day.", "He continues to talk, not to leave."),
    ("It introduces a new character.", "No new character appears."),
    ("It explains why the gym flooded.", "The flood is explained in his dialogue.")],
   "After this moment his short answers change into a long story, which shifts the interview.",
   "Stage directions can mark important changes in a character or in the plot.", P5)
mc("drama-elements", "RL.6.5", 5, "Why did the playwright divide the play into two short scenes instead of one?",
   "To skip the long interview and show its result: Sara’s full notebook and changed attitude",
   [("To introduce a second setting far from the school", "Both scenes are in the storage room."),
    ("To give the narrator more lines", "The narrator speaks only at the start."),
    ("To show a different character’s point of view", "Both scenes focus on Sara and Mr. Aziz.")],
   "Jumping two hours ahead lets the audience see how much the interview changed things.",
   "A scene break can compress time and highlight a change.", P5)
match("drama-elements", "RL.6.5", 6, "Match each element of “The Interview” with how it contributes to the play.",
      [("The narrator’s opening", "Sets the time, place and purpose"),
       ("Sara’s aside", "Reveals her private frustration to the audience"),
       ("The radio", "Triggers Mr. Aziz’s memories"),
       ("The doorknob gift", "Expresses the play’s message about care")],
      "Each element plays a specific role in the structure and meaning of the drama.",
      "Ask what each part of a play does for the audience.", passage=P5)

# ------------------------------------------------------- inference (RL.6.1, RI.6.1)

mc("inference", "RL.6.1", 2, "What can you infer about Mr. Aziz at the start of Scene 1?",
   "He does not think his own work is interesting.",
   [("He is angry with Sara.", "He is brief, not angry."),
    ("He has forgotten his years at the school.", "He later remembers details from 1998."),
    ("He wants to stop working immediately.", "He keeps polishing the doorknob.")],
   "He says, “There is not much to tell,” which suggests he undervalues his own story.",
   "An inference combines text evidence with what you already know.", P5)
mc("inference", "RL.6.1", 3, "Why does Sara ask about the radio?",
   "She is looking for a way to get Mr. Aziz talking.",
   [("She wants to buy the radio.", "Nothing suggests she wants to buy it."),
    ("She wants to listen to the news.", "Her goal is the interview."),
    ("She thinks the radio is broken and wants to fix it.", "She is a writer, not fixing things.")],
   "Her aside shows she needs longer answers, so she tries a new question about an object in the room.",
   "Use a character’s goal to infer the reason for their actions.", P5)
mc("inference", "RL.6.1", 4, "What does Mr. Aziz’s final line suggest about how he sees his job?",
   "He believes caring for things over time gives them lasting value.",
   [("He thinks doorknobs are worth a lot of money.", "The value he means is not money."),
    ("He regrets working at the school.", "His tone is proud and gentle."),
    ("He wants Sara to become a custodian.", "He is giving her a keepsake, not career advice.")],
   "“Some things last if you look after them” reflects pride in thirty years of care.",
   "Characters’ final lines often reveal their deeper values.", P5)
mc("inference", "RI.6.1", 4, "Which inference about the letter writer is BEST supported by the text?",
   "She feels a personal connection to the souq through her family.",
   [("She has never visited the souq.", "She describes walking under its arches."),
    ("She works for the city council.", "She is a sixth-grade student."),
    ("She dislikes visitors to the city.", "She suggests ways to welcome visitors.")],
   "She mentions her grandfather’s spice stall and her first school bag bought there.",
   "Cite specific details that support your inference.", P8)
tf("inference", "RI.6.1", 3, "The letter suggests that Huda believes old buildings and tourism can work together.", True,
   "She proposes repairs and signs in several languages to “protect our heritage and welcome visitors at the same time.”",
   "Inferences must be supported by evidence in the text.", P8)
ms("inference", "RL.6.1", 6, "Which TWO details support the inference that Mr. Aziz has hidden depths?",
   ["He tells a detailed story about carrying two hundred chairs during a flood.",
    "Sara’s notebook is full after two hours."],
   [("He polishes a brass doorknob.", "This shows his work, not hidden depths."),
    ("He shrugs at the first question.", "This shows his reserve, not depth.")],
   "The vivid flood story and the full notebook show how much he had to share.",
   "Look for evidence that contrasts with first impressions.", P5)

# ----------------------------------------------------- author's purpose (RI.6.6)

mc("author-purpose", "RI.6.6", 2, "What is Huda’s main purpose in writing her letter?",
   "To persuade the council to save the old souq",
   [("To describe how spices are grown", "Spices are mentioned only as part of family history."),
    ("To entertain readers with a funny story", "The letter is serious and persuasive."),
    ("To explain how shopping centers are built", "She argues against one; she does not explain construction.")],
   "She writes, “I urge the council to change its plan.”",
   "Persuasive writing tries to convince readers to think or act in a certain way.", P8)
mc("author-purpose", "RI.6.6", 3, "Why does Huda include the story of her grandfather’s stall?",
   "To show that the souq is part of real families’ history",
   [("To prove that spices are expensive", "Prices are not mentioned."),
    ("To complain about her grandfather", "She speaks of him warmly."),
    ("To give directions to the souq", "No directions are given.")],
   "Personal history makes her argument about heritage feel real and emotional.",
   "Ask how each detail serves the author’s purpose.", P8)
mc("author-purpose", "RI.6.6", 4, "How does Huda respond to the council’s argument about visitors?",
   "She argues that visitors come for what is unique, which the souq offers and a mall does not.",
   [("She agrees that a mall would bring more visitors.", "She disagrees with this argument."),
    ("She says visitors are not important.", "She wants to welcome visitors."),
    ("She ignores the council’s argument.", "She addresses it directly with “However.”")],
   "She turns the council’s own goal into a reason to keep the souq.",
   "Strong persuasive writers answer opposing arguments.", P8)
tf("author-purpose", "RI.6.6", 3, "The closing image “disappear behind a glass wall” is meant to create an emotional reaction.", True,
   "The image of history vanishing behind glass appeals to readers’ feelings.",
   "Word choice can convey an author’s point of view.", P8)
mc("author-purpose", "RI.6.6", 5, "Which phrase BEST shows Huda’s point of view about the shopping center?",
   "“They can visit a shopping center in any city in the world”",
   [("“The city council plans to replace our old covered souq”", "This states a fact about the plan."),
    ("“I am a sixth grader”", "This introduces the writer."),
    ("“Respectfully”", "This is a polite closing.")],
   "The phrase suggests a mall is ordinary and replaceable, unlike the souq.",
   "Look for phrases that reveal what the author values.", P8)
mc("author-purpose", "RI.6.6", 6, "How does Huda make her letter persuasive WITHOUT being rude to the council?",
   "She offers practical alternatives and closes respectfully.",
   [("She threatens the council with consequences.", "She makes no threats."),
    ("She uses insults to show strong feeling.", "She does not insult anyone."),
    ("She refuses to mention the council’s view.", "She addresses their view directly.")],
   "Suggesting repairs, lighting and signs shows a constructive attitude, and “Respectfully” keeps a polite tone.",
   "An author’s purpose shapes tone as well as content.", P8)

# ----------------------------------------------- compare texts across genres (RL.6.9)

mc("compare-texts", "RL.6.9", 2, "What theme do “The New Field” and “Transplant” share?",
   "Adjusting to a new place takes time but can lead to growth.",
   [("Football is more important than gardening.", "The poem is not about football."),
    ("Moving is always a terrible experience.", "Both texts end with growth."),
    ("Trees and people cannot change.", "Both the tree and Yasmin change.")],
   "Yasmin learns the new field; the lemon tree grows new buds after a hard period.",
   "Compare how different genres approach the same theme.", P6)
mc("compare-texts", "RL.6.9", 3, "How is the lemon tree’s experience similar to Yasmin’s?",
   "Both struggle at first after being moved, then adapt.",
   [("Both are moved by a coach.", "Only Yasmin has a coach."),
    ("Both live by the sea.", "Yasmin moves away from the sea."),
    ("Both refuse to change.", "Both change and grow.")],
   "Yasmin sits on the bench and misses home; the tree drops its leaves. Both later thrive.",
   "Look for parallel stages in each text.", P6)
mc("compare-texts", "RL.6.9", 4, "How does the poem’s form change the way the theme is presented compared with the story?",
   "The poem uses a single image and rhyme to suggest the theme; the story shows it through events and dialogue.",
   [("The poem gives more details about football practice.", "The poem does not mention football."),
    ("The story uses rhyme and stanzas.", "The story is prose."),
    ("Both use the same characters.", "The poem has a tree, not Yasmin.")],
   "The poem compresses the idea into images; the story develops it through a character’s actions over time.",
   "Genre affects how an author develops a theme.", P6)
tf("compare-texts", "RL.6.9", 3, "In both texts, a turning point shows the main subject beginning to thrive.", True,
   "Yasmin scores her first goal; the tree breaks out in new buds.",
   "Compare the structure as well as the theme.", P6)
match("compare-texts", "RL.6.9", 5, "Match each detail from the story with a similar detail from the poem.",
      [("Yasmin leaves her team by the sea", "The tree is lifted from its courtyard"),
       ("Yasmin sits on the bench missing home", "The tree drops its yellow light"),
       ("Yasmin scores her first goal", "New buds break out")],
      "The texts follow parallel stages: leaving, struggling, thriving.",
      "Pair details that play the same role in each text.", passage=P6)
mc("compare-texts", "RL.6.9", 6, "Which statement BEST explains a DIFFERENCE between the texts?",
   "The story credits effort and practice for the change, while the poem presents growth as something that comes with time.",
   [("The story is sad, but the poem is happy throughout.", "Both move from hardship to hope."),
    ("Only the poem has a hopeful ending.", "Both end hopefully."),
    ("The poem explains how to care for lemon trees.", "The poem is not instructional.")],
   "Yasmin practices every morning; the tree simply recovers “one morning.”",
   "Compare not only what happens but why it happens in each text.", P6)

# ------------------------------------------------------- imagery (RL.6.4)

mc("imagery", "RL.6.4", 2, "Which line from “Desert Night” appeals mainly to the sense of taste?",
   "“and taste the smoke, the spice, the vast and silent dark”",
   [("“A cool wind combs the ridges”", "This appeals to touch and sight."),
    ("“Somewhere a camel groans”", "This appeals to hearing."),
    ("“the sky unrolls its black carpet”", "This appeals to sight.")],
   "The speaker tastes smoke and spice from the coffee.",
   "Sensory language appeals to sight, sound, smell, taste and touch.", P7)
mc("imagery", "RL.6.4", 3, "What does the simile “like a coin into a pocket” suggest about the sunset?",
   "The sun disappears quickly and neatly below the dunes.",
   [("The sun is made of metal.", "The comparison is figurative."),
    ("The sunset is very slow.", "A coin slipping into a pocket is quick."),
    ("Someone has stolen the sun.", "The image is playful, not about theft.")],
   "A coin slips out of sight smoothly and fast, like the sun sinking.",
   "A simile compares two things using like or as.", P7)
tf("imagery", "RL.6.4", 2, "“The coffee pot hisses on the coals” appeals to the sense of hearing.", True,
   "“Hisses” is a sound word.",
   "Sound words create auditory imagery.", P7)
mc("imagery", "RL.6.4", 4, "What does the metaphor “the sky unrolls its black carpet, scattered with salt” describe?",
   "The night sky spreading out, full of white stars",
   [("A sandstorm covering the sky", "The image is calm and dark, not stormy."),
    ("Salt being spilled on a rug", "The language is figurative."),
    ("Black clouds before rain", "The “salt” represents stars, not rain.")],
   "The black carpet is the dark sky, and the scattered salt is the stars.",
   "A metaphor describes one thing as if it were another.", P7)
match("imagery", "RL.6.4", 5, "Match each image from “Desert Night” with the sense it appeals to most.",
      [("the sand gives back the day’s heat", "Touch"), ("a camel groans, low as a cello string", "Hearing"),
       ("bitter and gold with cardamom", "Taste"), ("the sky unrolls its black carpet", "Sight")],
      "The poet uses every sense to place the reader in the desert.",
      "Identify the sense each detail relies on.", passage=P7)
mc("imagery", "RL.6.4", 6, "How does the imagery in the last two lines shift the poem’s focus?",
   "From the wide desert landscape to the speaker’s close, personal experience",
   [("From night to morning", "It is still night at the end."),
    ("From calm to frightening", "The tone remains peaceful."),
    ("From the speaker to the camel", "The focus moves to the speaker, not away.")],
   "“I hold the small cup with both hands” brings the reader close to the speaker’s senses.",
   "Notice when a poem moves from wide images to close-up ones.", P7)

# ============================================================ grammar & language

# ------------------------------------------------- subjects and predicates (L.6.1)

mc("subjects-predicates", "L.6.1", 2, "What is the subject of the command “Close the window, please”?",
   "you (understood)",
   [("window", "The window receives the action."),
    ("please", "“Please” is a polite word, not the subject."),
    ("There is no subject.", "Commands have an understood subject: you.")],
   "In an imperative sentence, the subject “you” is understood.",
   "Commands have an understood subject.")
mc("subjects-predicates", "L.6.1", 3, "What is the simple subject? “Neither of the answers on the board was correct.”",
   "Neither",
   [("answers", "“Answers” is part of the prepositional phrase “of the answers.”"),
    ("board", "This is part of a prepositional phrase."),
    ("correct", "This is a predicate adjective.")],
   "Remove “of the answers on the board”; the subject is “Neither.”",
   "The subject is never inside a prepositional phrase.")
mc("subjects-predicates", "L.6.1", 4, "Find the subject: “Here are the results of the survey.”",
   "results",
   [("Here", "“Here” is an adverb, not the subject."),
    ("survey", "This is the object of the preposition “of.”"),
    ("are", "This is the verb.")],
   "Rearranged: “The results of the survey are here.” The subject is “results.”",
   "In sentences beginning with here or there, the subject follows the verb.")
tf("subjects-predicates", "L.6.1", 3, "In “The team and its coach celebrated and posed for photos,” the sentence has a compound subject and a compound predicate.", True,
   "Subjects: team, coach. Predicates: celebrated, posed.",
   "Find all subjects, then all verbs.")
mc("subjects-predicates", "L.6.1", 5, "What is the complete predicate? “During the storm, the old fishing boat drifted slowly toward the rocks.”",
   "drifted slowly toward the rocks",
   [("During the storm, the old fishing boat", "This includes an introductory phrase and the subject."),
    ("the old fishing boat", "This is the complete subject."),
    ("toward the rocks", "This is only part of the predicate.")],
   "The complete predicate is the verb and everything that tells about it.",
   "Introductory phrases are not part of the subject.")
fill("subjects-predicates", "L.6.1", 6, "Write the simple predicate (main verb phrase): “By next June, the new library will have opened its doors.” ____",
     ["will have opened"],
     "The simple predicate includes all helping verbs: will have opened.",
     "Include every helping verb in the simple predicate.")

# ----------------------------------------- compound sentences and conjunctions (L.6.1, L.6.2)

mc("compound-sentences", "L.6.2", 2, "Which compound sentence is punctuated correctly?",
   "The museum closed early, but the café stayed open.",
   [("The museum closed early but, the café stayed open.", "The comma goes before the conjunction."),
    ("The museum closed early, the café stayed open.", "A comma alone cannot join two independent clauses."),
    ("The museum, closed early but the café stayed open.", "The comma is misplaced.")],
   "Use a comma before a coordinating conjunction joining two independent clauses.",
   "FANBOYS: for, and, nor, but, or, yet, so.")
mc("compound-sentences", "L.6.2", 3, "Which sentence correctly uses a semicolon?",
   "The rain stopped; the players returned to the field.",
   [("The rain stopped; and the players returned.", "Do not use a semicolon with a coordinating conjunction this way."),
    ("The rain; stopped the players returned.", "The semicolon must separate two complete clauses."),
    ("The rain stopped the; players returned.", "The semicolon is in the wrong place.")],
   "A semicolon can join two closely related independent clauses without a conjunction.",
   "Each side of a semicolon should be a complete sentence.")
dd("compound-sentences", "L.6.1", 3, "Choose the conjunction: “He was exhausted, ____ he finished the race.”",
   "yet",
   [("so", "“So” shows a result, but finishing despite exhaustion is a contrast."),
    ("for", "“For” gives a reason."),
    ("or", "“Or” gives a choice.")],
   "“Yet” shows a surprising contrast.",
   "yet/but = contrast; so = result; for = reason; or = choice.")
dd("compound-sentences", "L.6.1", 4, "Choose the conjunction: “Neither the coach was ready, ____ were the players.”",
   "nor",
   [("or", "“Neither” pairs with “nor.”"),
    ("and", "This does not complete the negative pair."),
    ("but", "This does not complete “neither.”")],
   "“Neither … nor” is a correlative pair.",
   "Pairs: either/or, neither/nor, both/and, not only/but also.")
err("compound-sentences", "L.6.2", 5, ["The library was quiet", ", students", " read silently", " at every table."], 1, "; students",
    "Two independent clauses joined only by a comma create a comma splice; use a semicolon (or add a conjunction).",
    "A comma alone cannot join two complete sentences.")
mc("compound-sentences", "L.6.1", 6, "Which revision best combines the ideas to show cause and effect? “The bridge was closed. Traffic moved slowly all morning.”",
   "The bridge was closed, so traffic moved slowly all morning.",
   [("The bridge was closed, but traffic moved slowly all morning.", "“But” shows contrast, not cause."),
    ("The bridge was closed, or traffic moved slowly all morning.", "“Or” shows a choice."),
    ("The bridge was closed, traffic moved slowly all morning.", "This is a comma splice.")],
   "“So” shows that the closed bridge caused the slow traffic.",
   "Choose the conjunction that matches the logical relationship.")

# ---------------------------------------------------------- adverbs (L.6.1)

mc("adverbs", "L.6.1", 2, "Which word is an adverb? “The choir sang beautifully at the ceremony.”",
   "beautifully",
   [("choir", "This is a noun."),
    ("sang", "This is a verb."),
    ("ceremony", "This is a noun.")],
   "“Beautifully” tells how the choir sang.",
   "Adverbs tell how, when, where or to what extent.")
mc("adverbs", "L.6.1", 3, "What question does the adverb answer? “We will leave tomorrow.”",
   "When?",
   [("How?", "“Tomorrow” tells when, not how."),
    ("Where?", "It does not name a place."),
    ("To what extent?", "It does not show degree.")],
   "“Tomorrow” tells when we will leave.",
   "Adverbs of time: today, soon, later, tomorrow.")
dd("adverbs", "L.6.1", 3, "Choose the relative adverb: “I still remember the day ____ we moved to a new city.”",
   "when",
   [("where", "“Where” refers to a place, not a time."),
    ("why", "“Why” refers to a reason."),
    ("which", "“Which” is a relative pronoun.")],
   "“When” introduces a clause that tells about a time: the day.",
   "Relative adverbs: where (place), when (time), why (reason).")
dd("adverbs", "L.6.1", 4, "Choose the correct form: “Of all the runners, Nasser finished ____.”",
   "most quickly",
   [("more quickly", "“More” compares two; this compares all the runners."),
    ("quickliest", "This is not a word."),
    ("most quick", "An adverb is needed: quickly.")],
   "Use “most” + adverb to compare three or more.",
   "-ly adverbs: more/most + adverb.")
err("adverbs", "L.6.1", 5, ["She did", " good", " on the test", " this morning."], 1, " well",
    "“Well” is the adverb that describes how she did; “good” is an adjective.",
    "Use well (adverb) to describe actions; good (adjective) to describe nouns.")
mc("adverbs", "L.6.1", 6, "Which word does the adverb “extremely” modify? “The extremely tired hikers rested by the stream.”",
   "tired",
   [("hikers", "Adverbs do not modify nouns."),
    ("rested", "“Extremely” describes how tired, not how they rested."),
    ("stream", "This is a noun.")],
   "“Extremely” modifies the adjective “tired,” telling to what extent.",
   "Adverbs can modify verbs, adjectives or other adverbs.")

# ---------------------------------- pronouns, contractions and homophones (L.6.1)

dd("pronoun-homophones", "L.6.1", 2, "Choose the correct word: “____ turn is it to present?”",
   "Whose",
   [("Who’s", "“Who’s” means “who is.”"),
    ("Whos", "This is not a word."),
    ("Who", "The sentence needs a possessive.")],
   "“Whose” shows ownership: whose turn.",
   "Who’s = who is/who has; whose = belonging to whom.")
dd("pronoun-homophones", "L.6.1", 3, "Choose the correct word: “The students said ____ ready to present their project.”",
   "they’re",
   [("their", "“Their” shows ownership."),
    ("there", "“There” refers to a place."),
    ("theyre", "The apostrophe is missing.")],
   "“They are ready to present” makes sense, so the contraction “they’re” is correct.",
   "Expand the contraction to check if it fits.")
mc("pronoun-homophones", "L.6.1", 3, "Which sentence uses its and it’s correctly?",
   "It’s clear that the team lost its focus.",
   [("Its clear that the team lost it’s focus.", "Both are reversed."),
    ("It’s clear that the team lost it’s focus.", "The second should be possessive “its.”"),
    ("Its clear that the team lost its focus.", "The first should be “It’s” (it is).")],
   "It’s = it is; its = belonging to it.",
   "Possessive pronouns never use apostrophes.")
match("pronoun-homophones", "L.6.1", 4, "Match each word with its meaning.",
      [("your", "belonging to you"), ("you’re", "you are"), ("who’s", "who is"), ("whose", "belonging to whom")],
      "Contractions contain apostrophes; possessive pronouns do not.",
      "Replace the word with its expanded form to test it.")
err("pronoun-homophones", "L.6.1", 5, ["If your", " finished,", " put your books", " on the shelf."], 0, "If you’re",
    "“You’re” (you are) is needed: “If you are finished.” The second “your” is correct.",
    "Check each your/you’re in the sentence separately.")
mc("pronoun-homophones", "L.6.1", 6, "Which sentence is completely correct?",
   "There are two reasons why they’re late: their bus broke down, and its replacement was delayed.",
   [("Their are two reasons why there late: they’re bus broke down, and it’s replacement was delayed.", "Every homophone is wrong."),
    ("There are two reasons why their late: there bus broke down, and its replacement was delayed.", "“their late” and “there bus” are wrong."),
    ("There are two reasons why they’re late: there bus broke down, and it’s replacement was delayed.", "“there bus” and “it’s replacement” are wrong.")],
   "There (existence), they’re (they are), their (possession), its (possession) are all used correctly.",
   "Test every homophone in a long sentence one at a time.")

# ------------------------------------------------- Greek and Latin prefixes (L.6.4.b)

mc("prefixes", "L.6.4.b", 2, "What does the prefix mis- mean in “misunderstand”?",
   "wrongly",
   [("again", "That is re-."),
    ("before", "That is pre-."),
    ("not", "That is un- or in-.")],
   "To misunderstand is to understand wrongly.",
   "mis- = wrongly or badly.")
mc("prefixes", "L.6.4.b", 3, "Using the prefix inter- (between), what does “international” mean?",
   "between or among nations",
   [("inside one nation", "That would be intra- or domestic."),
    ("without a nation", "No prefix here means “without.”"),
    ("before nations existed", "That would need pre-.")],
   "inter- + national = between nations.",
   "inter- = between; intra- = within.")
match("prefixes", "L.6.4.b", 4, "Match each prefix with its meaning.",
      [("sub-", "under"), ("trans-", "across"), ("anti-", "against"), ("auto-", "self")],
      "These Greek and Latin prefixes appear in many academic words.",
      "Think of an example: submarine, transport, antibiotic, autograph.")
dd("prefixes", "L.6.4.b", 4, "Choose the word that means “heat before”: “Please ____ the oven before you put the bread inside.”",
   "preheat",
   [("reheat", "re- means again, not before."),
    ("overheat", "over- means too much."),
    ("unheat", "This is not a word.")],
   "pre- means before: preheat = heat before.",
   "Combine the prefix meaning with the base word.")
mc("prefixes", "L.6.4.b", 5, "If “bi-” means two and “tri-” means three, what is a “tripod”?",
   "a stand with three legs",
   [("a stand with two legs", "That would be “bipod.”"),
    ("a vehicle with three wheels", "That is a tricycle; “pod” refers to feet or legs."),
    ("a book in three parts", "That is a trilogy.")],
   "tri- (three) + pod (foot) = three-footed stand.",
   "Use both the prefix and the root to find the meaning.")
mc("prefixes", "L.6.4.b", 6, "In “The scientist’s findings were later proven to be a misinterpretation,” what does the prefix help you understand?",
   "The findings had been explained incorrectly.",
   [("The findings were explained again.", "That would be re-interpretation."),
    ("The findings were explained before the study.", "That would need pre-."),
    ("The findings were explained across many countries.", "That would need trans- or inter-.")],
   "mis- (wrongly) + interpretation = a wrong explanation.",
   "Prefixes change meaning even in long academic words.")
