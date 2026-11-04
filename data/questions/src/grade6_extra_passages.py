from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(6)

# ============================ PASSAGES (new) ============================
LIGHTHOUSE = P("G6-P9", "The Lighthouse Keeper's Apprentice", "Historical Fiction", """
Alexandria, 1887.

Fourteen-year-old Yusra climbed the two hundred and three steps to the lamp room for the first time without her uncle beside her, her palms damp against the cold iron railing. He had been the keeper of the harbor light for eleven years, but a fever had kept him in bed for three days, and tonight the lamp needed tending whether he was well or not.

At the top, the great lens loomed over her—a cluster of curved glass prisms nearly as tall as she was, built to bend a single flame into a beam that could be seen for twenty miles. She knew the theory from watching her uncle a hundred times: trim the wick, check the oil reservoir, wind the mechanism that rotated the lens so the light flashed rather than shone steadily, a pattern sailors used to identify this harbor and no other.

Her hands moved through the familiar motions, but her mind kept circling back to a warning her uncle had given her only that morning: "The clockwork is old. If it binds, do not force it. A broken gear tonight means no light for a week, and a dozen ships will have to guess where the rocks are."

Halfway through winding the mechanism, she felt it catch—a faint grinding where smooth motion should have been. Her first instinct was to keep turning the crank, to finish the job quickly and climb back down to her uncle's side. Instead, she stopped, took a slow breath, and ran her fingers along the gear train in the lamplight until she found a sliver of displaced metal, no longer than a fingernail, wedged between two teeth of the largest gear.

She worked it free with the tip of a thin file, so carefully that the only sound in the lamp room was her own breathing and the distant slap of waves against the harbor wall. When she wound the mechanism again, it turned smoothly, and the great lens began its slow, steady rotation.

Three miles out, aboard a merchant ship beating against a crosswind, a sailor called out that he had sighted the harbor light, flashing twice every ten seconds exactly as the charts promised. He had no way of knowing that the beam reaching him through the dark had very nearly not come at all, or that it now shone because a fourteen-year-old girl had chosen patience over speed.
""")

HOMEWORK = P("G6-P10", "Should Homework Be Optional?", "Argumentative Text", """
Every evening, students across the country spend hours on homework after already spending seven hours in class. Some educators now argue that homework should be optional rather than required—and the research increasingly supports them.

Supporters of mandatory homework often claim that practice outside class improves test scores. Yet a review of multiple studies found that for students in elementary and middle school, the connection between homework and achievement is weak at best. In fact, several studies found no meaningful difference in test scores between students who received heavy homework loads and those who received very little.

Making homework optional does not mean eliminating it altogether. Teachers could still assign practice problems, but students who already understand a skill—demonstrated through a quick in-class check—could use that time for reading, projects, or rest instead. This approach respects that students learn at different speeds without punishing anyone for mastering material quickly.

Critics worry that optional homework would let struggling students fall further behind. However, the opposite may be true: when homework is required for everyone regardless of need, teachers have less time to notice which specific students actually need extra practice, because every assignment blends together. A flexible system could target support more precisely.

Finally, excessive mandatory homework has a documented cost: multiple surveys link heavy homework loads to higher stress and reduced sleep in middle and high school students, both of which harm learning more than extra practice problems help it.

Making homework optional, guided by what each student actually needs, would likely improve both wellbeing and learning more than the current one-size-fits-all approach.
""")

OLIVE = P("G6-P11", "The Old Olive Tree", "Poetry", """
The old olive tree outside our gate
has stood since long before my birth,
its trunk grown wide with seasons of drought,
yet still it clings its roots to the earth.

My grandfather says it remembers
the hands that first pressed seed to soil,
the wars that passed like weather overhead,
the quiet decades of patient toil.

Each autumn it offers its harvest
though no one waters it, no one tends,
small fists of green and deepening black,
a gift that never completely ends.

I used to think a tree was simply there,
unmoving, waiting out the years,
but now I see it as a kind of elder,
bent low by time, but never disappears.
""")

# ============================ THE LIGHTHOUSE KEEPER'S APPRENTICE ============================
mc("theme", "RL.6.2", 4, "Which sentence best expresses the theme of “The Lighthouse Keeper's Apprentice”?",
   "Careful patience in a difficult moment can matter more than speed.",
   [("Lighthouses are difficult machines to build.", "This is a fact about the setting, not a lesson about life."), ("Sailors always trust what lighthouses tell them.", "This describes the sailor's trust, not the story's deeper message."), ("Fevers can be dangerous for lighthouse keepers.", "The uncle's illness starts the plot but is not the theme.")],
   "Yusra's choice to stop and work carefully, rather than force the mechanism, is what saves the night's light—exactly the theme the final paragraph emphasizes.",
   "Look at the character's key decision and its result to find the theme.", LIGHTHOUSE)
mc("character", "RL.6.3", 3, "How does Yusra feel as she climbs the stairs at the beginning of the story?",
   "nervous, since this is her first time tending the lamp completely alone",
   [("bored, because she has done this job too many times to count", "This is her FIRST time alone, so boredom does not fit."), ("excited to finally be rid of her uncle's rules", "Her damp palms and careful memory of his warning show worry, not relief."), ("confused about how the lamp mechanism works", "She clearly knows the steps from watching her uncle many times.")],
   "Her “damp” palms against the railing are a physical clue to her nervousness about this new responsibility.",
   "Physical details, like sweaty palms, often reveal a character's inner feelings.", LIGHTHOUSE)
mc("plot-setting", "RL.6.3", 2, "What is the setting of the story?",
   "a harbor lighthouse in Alexandria in 1887",
   [("a merchant ship at sea in the present day", "The ship appears only briefly, near the very end, from a distance."), ("a classroom where Yusra studies mechanics", "No classroom appears in the story."), ("a modern lighthouse run by machines", "The story specifies 1887 and describes a hand-wound, old-fashioned mechanism.")],
   "The story opens by naming the place and year, and the lamp room's details confirm a historical, hand-operated lighthouse.",
   "Specific dates and location names at the start of a story usually establish its setting.", LIGHTHOUSE)
mc("point-of-view", "RL.6.6", 4, "The story is told in third person. Whose thoughts and feelings does the narration follow most closely?",
   "Yusra's", [("her uncle's", "Her uncle is sick in bed and does not appear in the lamp room scene."), ("the sailor's", "The sailor appears only in the final paragraph, and his thoughts are not described."), ("the reader's", "The reader is not a character whose thoughts the narration follows.")],
   "The narration describes Yusra's memories, instincts, and physical sensations throughout the climb and repair.",
   "A third-person narrator can still stay close to a single character's experience.", LIGHTHOUSE)
order("plot-events", "RL.6.5", 4, "Order these events from “The Lighthouse Keeper's Apprentice.”",
      ["Yusra climbs the stairs alone because her uncle is sick with a fever.", "She remembers her uncle's warning about the old, fragile clockwork.",
       "She feels the mechanism catch and stops instead of forcing the crank.", "A sailor sights the harbor light flashing correctly from three miles out."],
      "The plot unfolds in a clear sequence from the problem, to the warning, to the careful fix, to the result far out at sea.",
      "Look for details that show cause and effect between each event.", LIGHTHOUSE)
mc("inference", "RL.6.1", 5, "Why does Yusra stop turning the crank instead of forcing it when she feels it catch?",
   "She remembers her uncle's warning and infers that forcing it could break the gear completely.",
   [("She decides the lamp does not need to be lit tonight.", "She continues working to get the lamp lit correctly."), ("She is too tired to keep turning the crank.", "Tiredness is never mentioned as her reason for stopping."), ("She wants to let her uncle finish the job instead.", "Her uncle is sick in bed and cannot help her.")],
   "Her uncle's exact warning about forcing a binding gear directly explains why she chooses to stop and investigate instead.",
   "Connect a character's earlier advice to a decision made later in the story.", LIGHTHOUSE)
mc("figurative-language", "RL.6.4", 5, "“The great lens loomed over her.” What does the word loomed suggest about the lens?",
   "It appeared large and almost overwhelming, adding to the pressure Yusra feels.",
   [("It was actually moving toward her on its own.", "The lens is a fixed object; loomed describes its appearance, not real motion."), ("It was glowing brightly with colored light.", "The passage does not describe the lens glowing at this point."), ("It was small and easy for her to overlook.", "Loomed suggests something large and noticeable, not something small.")],
   "Loomed is often used for something large that feels imposing, which fits Yusra's nervousness at facing this responsibility alone.",
   "A word like loomed adds feeling to a description beyond its literal meaning.", LIGHTHOUSE)
ms("text-evidence", "RL.6.1", 5, "Which TWO details show that Yusra chooses patience over speed while fixing the mechanism? Choose two.",
   ["She stops and takes a slow breath instead of continuing to force the crank.", "She works the metal sliver free carefully with the tip of a thin file."],
   [("She had watched her uncle tend the lamp a hundred times.", "This shows her experience, not a choice made in this specific moment."), ("The lens could bend a flame into a beam seen for twenty miles.", "This is a fact about the lighthouse, not an action Yusra takes.")],
   "Both details describe a deliberate, careful choice Yusra makes instead of rushing through the repair.",
   "Choose evidence that describes an action taken in the key moment the question asks about.", LIGHTHOUSE)
mc("context-clues", "L.6.4.a", 4, "What does reservoir mean in “check the oil reservoir”?",
   "a container that holds a supply of liquid",
   [("a small flame used for light", "A flame is lit from the oil; it is not the reservoir itself."), ("a tool used to wind machinery", "Winding tools are mentioned separately in the passage."), ("a window that lets light escape", "Windows or lenses are described elsewhere, not as part of the reservoir.")],
   "Checking the oil reservoir makes sense only if it is a container that holds the oil supply for the lamp.",
   "Think about what object would logically need to be “checked” before lighting a lamp.", LIGHTHOUSE)
mc("context-clues", "L.6.4.a", 5, "What does wedged mean in “a sliver of displaced metal... wedged between two teeth of the largest gear”?",
   "tightly stuck in a narrow space",
   [("completely melted away", "If the metal had melted, it would not be blocking the gear's motion."), ("painted a bright color", "Color is never mentioned in this description."), ("thrown far away from the gear", "The sliver is stuck in place, not thrown elsewhere.")],
   "The sliver is causing a grinding problem by being caught tightly between the gear's teeth.",
   "Picture the small object causing a mechanical problem to understand what wedged means.", LIGHTHOUSE)
mc("cause-effect", "RL.6.3", 4, "What was the effect of removing the sliver of metal from the gear?",
   "The mechanism turned smoothly again, and the lens resumed its steady rotation.",
   [("The lamp went out completely for the rest of the night.", "The story says the lens began rotating properly after the repair."), ("The uncle's fever immediately got better.", "The fever and the gear repair are unrelated events."), ("The sailor's ship changed its course toward the harbor.", "The ship's course is not described as changing because of the repair.")],
   "Once Yusra removes the metal sliver, “it turned smoothly, and the great lens began its slow, steady rotation.”",
   "Find the sentence describing what happens immediately after the obstacle is removed.", LIGHTHOUSE)
mc("connotation", "RL.6.4", 5, "The author describes the sound as “a faint grinding where smooth motion should have been.” What feeling does the word grinding create?",
   "a sense that something is wrong or damaged",
   [("a sense of calm and safety", "Grinding usually signals trouble, not calm."), ("a sense of excitement and joy", "Nothing about this moment is described as joyful."), ("a sense of boredom", "The moment is tense, not dull.")],
   "Grinding connotes friction and malfunction, warning the reader—and Yusra—that something needs attention.",
   "Connotation is the feeling a word creates beyond its literal dictionary definition.", LIGHTHOUSE)
mc("word-choice-tone", "RL.6.6", 5, "How does the author's description in the final paragraph affect the story's tone?",
   "It creates a quietly powerful tone by showing how little the sailor knows about the danger that was just avoided.",
   [("It creates a comic tone by making fun of the sailor's confusion.", "The sailor is not mocked; the passage is sincere, not comic."), ("It creates a frightening tone by describing a shipwreck.", "No shipwreck happens; the light is successfully repaired."), ("It creates a confusing tone that leaves the ending unclear.", "The ending is clear: the light works, and the sailor is safe.")],
   "Describing what the sailor doesn't know creates quiet dramatic irony that highlights the importance of Yusra's careful choice.",
   "Notice when an author reveals something a character in the story does not know.", LIGHTHOUSE)

# ============================ SHOULD HOMEWORK BE OPTIONAL? ============================
mc("author-claim", "RI.6.8", 3, "What is the author's central claim in this article?",
   "Homework should be optional, guided by what individual students actually need, rather than mandatory for everyone.",
   [("Homework should be eliminated completely for all students.", "The author says making homework optional does not mean eliminating it."), ("Students should spend more hours on homework each night.", "The author argues against heavy mandatory homework loads."), ("Only high school students should ever receive homework.", "Grade level restrictions like this are not the author's claim.")],
   "The introduction and conclusion both state that optional, individualized homework is the author's main position.",
   "The central claim is the position the entire article is built to support.", HOMEWORK)
mc("author-claim", "RI.6.8", 5, "Which evidence best supports the claim that mandatory homework may not improve achievement?",
   "A review of multiple studies found a weak connection between homework and achievement in elementary and middle school.",
   [("Students spend seven hours in class already.", "This describes students' schedules, not evidence about achievement."), ("Teachers could assign practice problems selectively.", "This describes a proposed solution, not evidence of a weak connection."), ("Surveys link heavy homework to stress and reduced sleep.", "This evidence supports a wellbeing claim, not the test-score claim specifically.")],
   "A review of multiple research studies is strong, direct evidence connected specifically to the claim about achievement.",
   "Match evidence to the EXACT claim it is meant to support.", HOMEWORK)
mc("author-claim", "RI.6.8", 6, "How does the author respond to the concern that optional homework would let struggling students fall behind?",
   "The author argues that a flexible system could actually help teachers target support more precisely.",
   [("The author ignores the concern completely.", "Paragraph 4 directly addresses this concern."), ("The author agrees and abandons the main claim.", "The author offers a counter-reason instead of agreeing."), ("The author says struggling students should repeat the grade.", "Repeating a grade is never mentioned in the article.")],
   "This is a concession-and-rebuttal structure: the author acknowledges the worry, then explains why the opposite may be true.",
   "Strong arguments respond directly to objections instead of ignoring them.", HOMEWORK)
mc("evaluate-argument", "RI.6.8", 6, "Which piece of evidence in the article is the MOST credible support for the author's claim?",
   "a review of multiple research studies comparing homework loads and test scores",
   [("a general statement that students are often tired after school", "This is a general observation, not evidence drawn from research."), ("the idea that students would probably prefer less homework", "A preference is an opinion, not evidence."), ("a claim that every teacher agrees homework should be optional", "The article never states that every teacher agrees.")],
   "A review of multiple studies is a stronger, more reliable form of evidence than a general observation or an assumed preference.",
   "Credible evidence usually comes from research, not from assumptions about what people want.", HOMEWORK)
mc("cause-effect", "RI.6.5", 5, "According to the article, what is one effect of requiring the same homework for every student regardless of need?",
   "Teachers have less time to notice which specific students actually need extra practice.",
   [("Students automatically get better grades.", "The article argues the connection to achievement is weak."), ("Parents are required to help with every assignment.", "Parental involvement is not discussed in the article."), ("Schools save money on classroom supplies.", "Money and supplies are not mentioned in this article.")],
   "The article explains that uniform assignments make it harder for teachers to identify who truly needs more help.",
   "Look for the sentence describing what happens BECAUSE every assignment blends together.", HOMEWORK)
mc("context-clues", "L.6.4.a", 4, "What does mandatory mean in “Should Homework Be Optional?” when the article discusses “mandatory homework”?",
   "required for everyone, with no choice",
   [("suggested but not required", "That meaning fits “optional,” the opposite of mandatory."), ("graded very strictly", "The article is about whether homework is required, not how it's graded."), ("assigned only to advanced students", "Mandatory homework, as described, applies to all students, not just some.")],
   "The article contrasts mandatory homework with optional homework throughout, showing that mandatory means required for all.",
   "Look at the word the author contrasts it with to understand its meaning.", HOMEWORK)
mc("context-clues", "L.6.4.a", 5, "What does documented mean in “excessive mandatory homework has a documented cost”?",
   "recorded and supported by evidence, such as surveys or studies",
   [("imaginary and not actually true", "The sentence specifically references surveys, meaning it is evidence-based."), ("kept completely secret", "A documented cost is the opposite of secret; it has been recorded and studied."), ("illegal in most schools", "Legality is never discussed in this article.")],
   "The sentence immediately mentions “multiple surveys,” showing that documented means backed by recorded evidence.",
   "Check the words right after a tricky term for the proof or evidence being referenced.", HOMEWORK)
ms("text-evidence", "RI.6.1", 5, "Which TWO details support the claim that heavy mandatory homework can be harmful? Choose two.",
   ["Several studies found no meaningful difference in test scores between heavy and light homework loads.", "Surveys link heavy homework loads to higher stress and reduced sleep."],
   [("Teachers could use quick in-class checks to see what students already know.", "This describes a proposed solution, not harm caused by mandatory homework."), ("Students already spend seven hours in class each day.", "This describes students' schedules, not direct evidence of harm from homework.")],
   "Both chosen details are direct evidence the article uses to argue that heavy, required homework can cause harm without clear benefit.",
   "Select evidence that directly supports the specific harm the question describes.", HOMEWORK)
tf("author-claim", "RI.6.8", 3, "True or false: The author wants homework eliminated completely for every student.", False,
   "The article clearly states that making homework optional “does not mean eliminating it altogether.”",
   "Watch for extreme words like “completely” or “always” that may not match a nuanced argument.", HOMEWORK)
mc("connotation", "L.6.5.c", 5, "What feeling does the phrase “one-size-fits-all approach” create in the final paragraph?",
   "a sense that the current system ignores individual students' different needs",
   [("a sense that the current system is carefully personalized", "“One-size-fits-all” suggests the opposite of personalization."), ("a sense that the current system is extremely expensive", "Cost is not what this phrase emphasizes."), ("a sense that the current system changes too often", "The phrase suggests the system stays the same for everyone, not that it changes.")],
   "“One-size-fits-all” connotes a rigid system that treats everyone the same, regardless of their actual needs.",
   "Some phrases carry a built-in judgment beyond their literal words.", HOMEWORK)
mc("word-choice-tone", "RI.6.6", 5, "How would you best describe the author's tone toward critics who disagree with optional homework?",
   "respectful but unconvinced, directly addressing their concern with a counterargument",
   [("dismissive, mocking critics for disagreeing", "The author engages with the concern seriously, rather than mocking it."), ("fully persuaded, agreeing that critics are right", "The author offers a rebuttal rather than agreeing with the critics."), ("uninterested, ignoring critics' concerns entirely", "The article specifically names and responds to a concern critics raise.")],
   "The author states the critics' worry fairly, then offers reasoning for a different conclusion—a respectful but firm tone.",
   "Look at how directly and fairly an author restates an opposing view before responding to it.", HOMEWORK)

# ============================ THE OLD OLIVE TREE ============================
mc("poetry-elements", "RL.6.5", 2, "How many stanzas does “The Old Olive Tree” have?",
   "four stanzas", [("three stanzas", "Count the groups of lines separated by blank lines: there are four."), ("sixteen stanzas", "Sixteen is the total number of lines, not the number of stanzas."), ("two stanzas", "The poem has more than two separate groups of lines.")],
   "A stanza is a group of lines set apart from others; this poem has four such groups.",
   "Count the blocks of text separated by blank lines to find the number of stanzas.", OLIVE)
mc("poetry-elements", "RL.6.5", 3, "Which pair of words from the poem rhyme?",
   "soil / toil", [("gate / birth", "These words do not share an ending sound."), ("harvest / tends", "These words end differently."), ("there / elder", "These words do not rhyme with each other.")],
   "Soil and toil both end with the same “-oil” sound, making them a rhyming pair.",
   "Rhyming words share the same ending sound, even if spelled a little differently.", OLIVE)
mc("figurative-language", "RL.6.4", 5, "In the last stanza, the speaker calls the tree “a kind of elder.” What type of figurative language is this, and what does it suggest?",
   "a metaphor that compares the tree to a wise, respected older person",
   [("a simile that compares the tree to a child", "There is no like or as, and the comparison is to an elder, not a child."), ("an example of alliteration", "Alliteration is about repeated beginning sounds, not comparison."), ("a literal statement that the tree is an actual person", "The tree is not literally a person; the comparison is figurative.")],
   "Calling the tree “a kind of elder” directly states it IS an elder, which is a metaphor suggesting wisdom and respect earned through age.",
   "A metaphor says one thing IS another, without using like or as.", OLIVE)
mc("imagery", "RL.6.4", 4, "What does the image “small fists of green and deepening black” most likely describe?",
   "unripe and ripening olives on the tree",
   [("the tree's roots pushing into the ground", "Roots are mentioned earlier, in a different stanza."), ("storm clouds gathering above the tree", "Weather appears earlier as “wars that passed like weather,” not here."), ("the shadows the tree casts at sunset", "Shadows are not described anywhere in the poem.")],
   "Olives often appear green when unripe and turn dark, almost black, as they ripen—matching this vivid image.",
   "Use sensory details (shape and color) to picture what the poet is actually describing.", OLIVE)
mc("connotation", "RL.6.4", 5, "What feeling does the phrase “bent low by time” create about the tree, rather than a purely negative idea of weakness?",
   "a sense of dignity and endurance despite age",
   [("a sense of complete failure", "The poem presents the tree with respect, not as a failure."), ("a sense of danger to people nearby", "No danger from the tree is suggested anywhere in the poem."), ("a sense of confusion about its age", "The poem states clearly how long the tree has stood; there's no confusion.")],
   "Paired with “but never disappears,” the phrase suggests the tree bends under time's weight yet endures with quiet dignity.",
   "Read the words right after a phrase to see whether they soften or change its connotation.", OLIVE)
mc("theme", "RL.6.2", 5, "Which statement best expresses the theme of “The Old Olive Tree”?",
   "Living things that quietly endure across generations deserve a new kind of respect and attention.",
   [("Trees need regular watering to survive drought.", "This is a factual detail about plant care, not the poem's deeper message."), ("Grandparents know more about nature than anyone else.", "The grandfather is a source of knowledge, but this is not the poem's central message."), ("Olives are the most valuable crop a family can grow.", "The poem's emphasis is on endurance and perspective, not crop value.")],
   "The final stanza's shift from seeing the tree as “simply there” to seeing it as an elder reveals this central idea about respect for endurance.",
   "A theme in poetry often appears as a shift in how the speaker understands something by the end.", OLIVE)
mc("point-of-view", "RL.6.6", 3, "From what point of view is this poem written?",
   "first person — the speaker uses “I” and “my grandfather”",
   [("third person — a narrator describes the speaker from outside", "Words like “I” and “my” show the speaker is part of the poem, not an outside narrator."), ("second person — the poem speaks directly to “you”", "The word “you” never appears in the poem."), ("third person — the tree narrates its own life", "The tree does not speak; the human speaker describes the tree.")],
   "Pronouns like “I,” “my mother's,” and “my grandfather” show this poem is told from a first-person point of view.",
   "Look for I/me/my to identify first-person point of view.", OLIVE)
mc("inference", "RL.6.1", 5, "Why does the speaker's view of the tree change by the end of the poem?",
   "Learning the tree's long history from the grandfather helps the speaker see it as something wise and enduring, not just an object.",
   [("The tree suddenly grows taller than before.", "No physical change in the tree is described in the poem."), ("The speaker plants a brand-new tree nearby.", "No new tree is mentioned anywhere in the poem."), ("The grandfather tells the speaker to stop visiting the tree.", "The grandfather shares memories about the tree; he never tells the speaker to stay away.")],
   "The middle stanzas about the tree's long memory and quiet labor explain why the speaker comes to see it differently by the final stanza.",
   "Trace how new information earlier in a poem can explain a change in the speaker's thinking later.", OLIVE)
mc("context-clues", "L.6.4.a", 4, "What does toil mean in “the quiet decades of patient toil”?",
   "hard, steady work", [("a kind of storm", "Weather is described separately as “wars that passed like weather.”"), ("a type of fruit", "Fruit (the olives) is described in a later stanza, not here."), ("a short rest", "“Patient toil” across “decades” suggests ongoing effort, not resting.")],
   "Pairing toil with “patient” and “decades” suggests a long, steady kind of hard work.",
   "Look at the words describing HOW LONG and HOW something is done to find a word's meaning.", OLIVE)
ms("text-evidence", "RL.6.1", 5, "Which TWO details from the poem show that the olive tree endures hardship? Choose two.",
   ["its trunk grown wide with seasons of drought", "the wars that passed like weather overhead"],
   [("small fists of green and deepening black", "This describes the tree's harvest, not a hardship it survives."), ("the hands that first pressed seed to soil", "This describes the tree's planting, not an ongoing hardship.")],
   "Both details describe difficult conditions—drought and war—that the tree has lived through over time.",
   "Choose details that describe a difficulty, not simply a feature or a memory.", OLIVE)
mc("word-choice-tone", "RL.6.4", 5, "How does describing the tree as “a kind of elder” affect the overall tone of the final stanza?",
   "It creates a respectful, almost reverent tone toward the tree.",
   [("It creates a humorous tone that makes fun of old age.", "The comparison is sincere and admiring, not mocking."), ("It creates a frightening tone, as if the tree were haunted.", "Nothing in the stanza suggests fear or the supernatural."), ("It creates a neutral, purely factual tone with no feeling.", "Calling the tree an “elder” adds clear emotional respect, not plain neutrality.")],
   "Comparing the tree to a respected elder elevates it beyond a plant, creating a tone of quiet admiration.",
   "Notice how a single figurative comparison can shift the emotional tone of an entire stanza.", OLIVE)
