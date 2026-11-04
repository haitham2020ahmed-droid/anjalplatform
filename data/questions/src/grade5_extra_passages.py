from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(5)

# ============================ PASSAGES (new) ============================
PROJECT = P("G5-P13", "The Group Project", "Drama", """
CHARACTERS: NOUR, age 11; SAMI, her project partner; MR. FARID, their teacher

SCENE: A classroom after school. Poster boards and markers are scattered across a table.

NOUR: (frustrated, capping a marker) We have one day left, and half our poster is still blank.
SAMI: (not looking up from his phone) I did my half already. The volcano diagram's done.
NOUR: Your half is done, but what about the written report? That was supposed to be both of ours.
SAMI: (finally looking up) I thought you said you'd handle the writing since you're better at it.
NOUR: I said I'd START it. Not finish the whole thing alone.
(MR. FARID enters, carrying a stack of graded tests.)
MR. FARID: How's the volcano project coming along, you two?
NOUR: (hesitating) It's... coming along.
SAMI: (quietly) Actually, we're stuck. We split the work, but we never really talked about what "our half" meant.
MR. FARID: That happens more than you'd think. Good partners don't just divide the work—they check in along the way.
NOUR: (sighing) Okay. Let's make a real plan. You finish labeling the diagram tonight, and I'll draft the report. Tomorrow morning, we read each other's parts before class.
SAMI: Deal. And next time, we talk BEFORE we split anything up.
MR. FARID: (smiling, heading for the door) Now that sounds like a plan worth grading.
""")

GOOSEBUMPS = P("G5-P14", "Why Do We Get Goosebumps?", "Expository Text", """
Have you ever felt a sudden chill and noticed tiny bumps rising on your arms? That reaction is called goosebumps, and it is actually a leftover tool from our very distant ancestors.

A Useful Trick for Hairier Ancestors
Underneath each hair on your skin is a tiny muscle. When you feel cold or frightened, these muscles tighten and pull the hair follicle upright, creating a small bump. For animals covered in thick fur, this trick works well: raised fur traps a layer of warm air next to the skin, and in a threatening situation, raised fur makes the animal look bigger and more frightening to a predator.

Why Humans Still Have Them
Humans no longer have thick fur, so goosebumps do not keep us warm or make us look larger. However, the tiny muscles under our skin still react exactly the way they did thousands of years ago. Our bodies kept this old reflex even after it stopped being very useful.

More Than Just Cold
Goosebumps are not only caused by cold temperatures. Strong emotions—such as fear, awe, or even listening to a moving piece of music—can trigger the same nervous system signal that cold does. Scientists believe this happens because emotional reactions and temperature reactions share some of the same nerve pathways in the body.

So the next time chills run down your arms during a scary movie, you can thank a reflex that your distant, furrier ancestors relied on every day.
""")

SPELLING = P("G5-P15", "The Spelling Bee", "Realistic Fiction", """
Yasmin's palms were sweating before she even reached the stage. She had practiced every word on the list for three weeks, whispering them under her breath on the bus, in the shower, even in her sleep, according to her brother.

Now, standing behind the microphone with sixty parents watching, every word she had memorized seemed to have evaporated from her mind.

"Your word is 'conscience,'" the judge said.

Yasmin's mind went blank. She could picture the page in her workbook where she had written the word twenty times, but the actual letters refused to appear.

She closed her eyes and pictured her tutor, Ms. Adel, tapping a pencil on the table. "When you panic," Ms. Adel always said, "go back to the parts you know. Break it down."

Con, Yasmin thought. That part is easy.

She opened her mouth. "C-O-N..." The next part came slower, but it came. "...S-C-I-E-N-C-E. Conscience."

"Correct," the judge said, and a small ripple of applause moved through the audience.

Yasmin didn't win the spelling bee that afternoon—she was eliminated two rounds later on a much harder word. But walking off the stage, she realized something important: the panic hadn't beaten her. She had found a way through it, one small piece at a time, and that felt like its own kind of victory.
""")

# ============================ THE GROUP PROJECT ============================
mc("drama-elements", "RL.5.5", 2, "In “The Group Project,” which words are stage directions rather than dialogue?",
   "(frustrated, capping a marker)",
   [("We have one day left, and half our poster is still blank.", "This is dialogue—the words Nour says aloud."),
    ("NOUR:", "This label shows who is speaking, not an action."),
    ("MR. FARID enters, carrying a stack of graded tests.", "This is a stage direction, but it is not in parentheses next to a character's line; the question asks about the bracketed action cue.")],
   "Stage directions appear in parentheses and describe a character's actions, tone, or movement.",
   "Dialogue is spoken aloud; stage directions in parentheses tell actors how to move or feel.", PROJECT)
mc("drama-elements", "RL.5.5", 3, "What is the setting of the play?",
   "a classroom after school, with poster boards and markers on a table",
   [("a stage at a spelling bee", "That setting belongs to a different story."), ("the school cafeteria during lunch", "The scene is set in a classroom, not a cafeteria."), ("Mr. Farid's office", "The teacher enters the classroom; the scene never moves to an office.")],
   "The opening SCENE line describes a classroom after school with poster boards and markers scattered on a table.",
   "In a play script, the word SCENE introduces the setting before any dialogue begins.", PROJECT)
mc("character", "RL.5.3", 3, "How does Nour feel at the start of the play?",
   "frustrated because she believes she is doing more than her fair share of the work",
   [("confident that the project will be finished early", "The stage direction and her words show worry, not confidence."), ("bored because the project is too easy", "Her tone shows stress, not boredom."), ("proud of how the poster looks so far", "She says half the poster is still blank, which is not something to be proud of.")],
   "The stage direction “(frustrated, capping a marker)” and her complaint about the blank poster both show frustration.",
   "In drama, stage directions and word choice both reveal a character's feelings.", PROJECT)
mc("plot-conflict", "RL.5.3", 3, "What is the central conflict in “The Group Project”?",
   "Nour and Sami disagree about how much of the project each of them was supposed to finish.",
   [("Nour and Sami disagree about which topic to research.", "They already share the same topic, the volcano project."), ("Mr. Farid refuses to grade their project.", "He offers advice, not a refusal to grade."), ("Sami wants to switch partners.", "Switching partners is never mentioned.")],
   "Their argument centers on what “our half” of the work was supposed to mean.",
   "The central conflict is the specific disagreement that drives the characters' dialogue.", PROJECT)
mc("theme", "RL.5.2", 5, "Which statement best expresses the theme of the play?",
   "Good partners communicate clearly about their plans instead of assuming the other understands.",
   [("Teachers should always check on group projects.", "This describes Mr. Farid's action, not the deeper lesson."), ("Working alone is always better than working with a partner.", "The play never suggests this; it shows how to fix teamwork."), ("Projects about volcanoes are more interesting than other topics.", "The topic of the project is not the story's message.")],
   "Mr. Farid's comment and the partners' new plan to “check in along the way” both point to this lesson about communication.",
   "In drama, a character often states the theme directly in a key line of dialogue.", PROJECT)
mc("inference", "RL.5.1", 5, "Why does Sami avoid looking up from his phone when Nour first complains?",
   "He may feel uncomfortable or guilty, suspecting the report is not actually finished.",
   [("He did not hear Nour speaking at all.", "He answers her directly, so he clearly hears her."), ("He is finishing an important phone call for his family.", "The play never mentions a phone call."), ("He thinks the project is already perfect.", "He later admits they are “stuck,” showing he knows it isn't finished.")],
   "His later admission that they are stuck suggests he already sensed a problem, which explains his earlier avoidance.",
   "Combine a character's later words with an earlier action to make an inference.", PROJECT)
ms("text-evidence", "RL.5.1", 5, "Which TWO details show that Nour and Sami's problem was caused by unclear communication, not laziness? Choose two.",
   ["Sami says, “We split the work, but we never really talked about what ‘our half’ meant.”", "Nour says, “I said I'd START it. Not finish the whole thing alone.”"],
   [("Sami says he already finished the volcano diagram.", "This shows he did complete work, which argues against laziness."), ("Mr. Farid enters carrying graded tests.", "This detail is about the teacher, not the cause of their problem.")],
   "Both lines show the two partners had different understandings of the plan, not that either one refused to work.",
   "Choose evidence that explains the CAUSE of the conflict, not just any true detail.", PROJECT)
order("plot-events", "RL.5.3", 4, "Put the events of “The Group Project” in order.",
      ["Nour complains that the poster and report are still unfinished.", "Mr. Farid asks how the project is going.",
       "Sami admits that they never agreed on what “their half” meant.", "Nour and Sami make a clear plan and agree to check in the next morning."],
      "The play moves from the conflict, to the teacher's question, to the honest admission, to the resolution.",
      "Look for the moment each character's attitude or understanding changes.", PROJECT)
mc("point-of-view", "RL.5.6", 4, "Unlike a story with a narrator, how does the audience learn how Nour feels during the play?",
   "through her own dialogue and the stage directions describing her tone and actions",
   [("through a narrator who explains her thoughts directly", "A play script has no narrator explaining thoughts."), ("through Sami's opinion of her feelings", "Sami never describes Nour's feelings for the audience."), ("through a written letter Nour reads aloud", "No letter appears in the play.")],
   "Plays reveal feelings only through dialogue and stage directions, since there is no narrator.",
   "In drama, point of view is shown through what characters say and do, not through narration.", PROJECT)
mc("context-clues", "L.5.4.a", 4, "What does hesitating mean in “NOUR: (hesitating) It's... coming along”?",
   "pausing because of uncertainty or doubt",
   [("speaking loudly and clearly", "The pause and trailing “...” suggest the opposite of clear, confident speech."), ("leaving the room quickly", "Nour stays in the scene and keeps speaking."), ("laughing at a joke", "Nothing in the stage direction suggests humor.")],
   "The pause shown by “...” and the stage direction together suggest Nour is unsure how honest to be.",
   "Stage directions and punctuation like “...” can both hint at a word's meaning.", PROJECT)
mc("context-clues", "L.5.4.a", 3, "In this play, Sami says they are “stuck.” What does stuck mean in this sentence?",
   "unable to make progress on a problem",
   [("physically unable to move", "No one in the play is physically trapped."), ("glued to an object", "Nothing describes anything sticky in the play."), ("finished with all their work", "They are NOT finished; that is the opposite of stuck here.")],
   "Sami explains right after that they never agreed on the plan, which is why their progress has stopped.",
   "Read the sentence right after a tricky word—it often explains what is really happening.", PROJECT)
mc("character-perspective", "RL.5.6", 5, "How do Nour's and Sami's understandings of “our half” differ at the start of the play?",
   "Nour thought she only had to start the report, while Sami thought she would finish it alone.",
   [("Both of them thought Sami would write the entire report.", "Sami believed Nour would do the writing, not himself."), ("Both of them thought the diagram still needed to be finished.", "Sami already finished the diagram."), ("Nour thought Sami would do the writing, and Sami agreed.", "Sami believed NOUR would do the writing, which is the opposite.")],
   "Nour says she agreed only to START the report, while Sami believed she would finish the whole thing herself.",
   "Comparing two characters' expectations often reveals the true cause of a conflict.", PROJECT)

# ============================ WHY DO WE GET GOOSEBUMPS? ============================
mc("central-idea", "RI.5.2", 3, "What is the central idea of “Why Do We Get Goosebumps?”",
   "Goosebumps are a leftover reflex from furrier ancestors that no longer serves the same purpose in humans.",
   [("Goosebumps only happen when people are cold.", "The article explains that strong emotions can cause them too."), ("Animals with fur never get goosebumps.", "The article explains that fur made the reflex useful for animals, not that it doesn't happen to them."), ("Scientists do not understand why goosebumps happen.", "The article explains the cause clearly, in detail.")],
   "Every section builds on the idea that goosebumps are an old, now mostly useless, inherited reflex.",
   "A central idea is supported across the whole text, not just one paragraph.", GOOSEBUMPS)
mc("text-features", "RI.5.5", 2, "Under which heading would you find out that fur makes animals look bigger to predators?",
   "A Useful Trick for Hairier Ancestors",
   [("Why Humans Still Have Them", "That section explains why the reflex continues without fur."), ("More Than Just Cold", "That section is about emotional triggers, not predators."), ("Why Do We Get Goosebumps?", "That is the title of the whole article.")],
   "The first section explains that raised fur traps warm air and makes an animal look larger to a threat.",
   "Headings organize an article's ideas into clearly labeled sections.", GOOSEBUMPS)
mc("cause-effect", "RI.5.3", 3, "According to the article, what is an EFFECT of fur rising on a cold animal?",
   "A layer of warm air becomes trapped near the animal's skin.",
   [("The tiny muscles under the skin disappear.", "The muscles stay; they are what causes the fur to rise."), ("The animal's temperature drops even lower.", "The trapped air helps keep the animal warmer, not colder."), ("The animal loses its sense of touch.", "The article never mentions a change in touch.")],
   "“Raised fur traps a layer of warm air next to the skin,” which is the direct effect described.",
   "Look for the result that follows directly after a described cause.", GOOSEBUMPS)
mc("cause-effect", "RI.5.3", 5, "Why do humans still get goosebumps even though they no longer have thick fur?",
   "The tiny muscles under the skin still react the same old way, even though the reaction is no longer useful.",
   [("Human skin grows fur quickly when cold.", "The article says humans no longer have thick fur."), ("Goosebumps now help humans see better in the cold.", "Goosebumps are never linked to eyesight in the article."), ("Doctors have not found a way to stop the reflex.", "The article frames this as an old, inherited reflex, not a medical problem to solve.")],
   "The article explains that the ancient reflex stayed in our bodies even after it stopped being very useful.",
   "Look for words like “however” that signal why something continues despite no longer being useful.", GOOSEBUMPS)
mc("compare-contrast", "RI.5.5", 5, "How is the goosebump reflex different in humans compared to furry animals?",
   "In furry animals it provides warmth and protection, but in humans it no longer serves either purpose.",
   [("In humans it keeps them warmer than furry animals.", "The article says humans no longer have the fur needed for warmth."), ("In furry animals it is only caused by fear, never cold.", "The article says cold is the main cause, and fear is a bonus survival effect."), ("Humans and furry animals get goosebumps for exactly the same practical reason today.", "The article clearly states the reflex is no longer useful for humans.")],
   "The article contrasts a useful ancient purpose in furry animals with an outdated, less useful reflex in humans today.",
   "Look for a paragraph that directly compares two groups' experience of the same feature.", GOOSEBUMPS)
mc("context-clues", "L.5.4.a", 4, "What does reflex mean in “Our bodies kept this old reflex even after it stopped being very useful”?",
   "an automatic reaction the body makes without thinking about it",
   [("a decision someone makes carefully", "A reflex happens automatically, not after careful thought."), ("a type of fur found on animals", "Reflex describes a body reaction, not a body covering."), ("a muscle used only for walking", "The reflex described involves the skin's hair muscles, not walking.")],
   "Goosebumps rising automatically, without anyone deciding to make them happen, is the clue that reflex means an automatic reaction.",
   "Think about whether the body's action happens on purpose or automatically.", GOOSEBUMPS)
mc("context-clues", "L.5.4.a", 5, "What does trigger mean in “can trigger the same nervous system signal that cold does”?",
   "to cause or set off",
   [("to prevent or stop", "The sentence says emotions CAUSE the signal, not stop it."), ("to measure or record", "Nothing about measuring is discussed here."), ("to weaken or slow down", "The sentence compares two things that both cause the same signal.")],
   "Since both cold and strong emotion lead to the exact same nervous system signal, trigger must mean to cause or set off.",
   "Compare the word to something else in the sentence that causes the same result.", GOOSEBUMPS)
ms("text-evidence", "RI.5.1", 5, "Which TWO details show that emotions, not just cold, can cause goosebumps? Choose two.",
   ["Fear, awe, or moving music can trigger the same nervous system signal that cold does.", "Emotional reactions and temperature reactions share some of the same nerve pathways."],
   [("Underneath each hair on your skin is a tiny muscle.", "This describes the body part involved, not what triggers it."), ("Humans no longer have thick fur.", "This explains why goosebumps are less useful, not what causes them.")],
   "Both details directly explain how emotional reactions can produce the very same goosebump response as cold.",
   "Choose evidence that matches the exact claim—here, that emotions ALSO cause goosebumps.", GOOSEBUMPS)
tf("text-evidence", "RI.5.1", 3, "True or false: According to the article, goosebumps are caused only by cold temperatures.", False,
   "The article states that strong emotions, such as fear or awe, can trigger the same reaction as cold.",
   "Watch for words like “only” in true/false statements; informational texts often show more than one cause.", GOOSEBUMPS)
mc("author-purpose", "RI.5.8", 4, "What is the author's main purpose in explaining that fur made goosebumps useful for animals?",
   "to help readers understand why humans still have a reflex that no longer fully makes sense for them",
   [("to convince readers that humans should grow more body hair", "The article never suggests humans should change."), ("to argue that animals are smarter than humans", "Intelligence is never compared in the article."), ("to list every animal that has fur", "The article focuses on the purpose of fur, not a list of animals.")],
   "Explaining the old purpose of the reflex helps readers understand why it survives in humans even without a clear use today.",
   "Ask why an author includes background information before explaining a modern mystery.", GOOSEBUMPS)
mc("summarize", "RI.5.2", 5, "Which is the best summary of the “More Than Just Cold” section?",
   "Strong emotions can cause goosebumps because they trigger some of the same nerve pathways as cold does.",
   [("Scientists do not know what causes goosebumps.", "The section gives a clear scientific explanation."), ("Music always feels better when you have goosebumps.", "This is an opinion, not information from the text."), ("Fear is the only emotion that can cause goosebumps.", "The text also mentions awe and moving music as triggers.")],
   "A good summary keeps only the key, factual point of the section without adding opinions.",
   "A summary should state the main scientific point in your own words.", GOOSEBUMPS)

# ============================ THE SPELLING BEE ============================
mc("theme", "RL.5.2", 4, "Which sentence best expresses the theme of “The Spelling Bee”?",
   "Working through panic calmly, one small step at a time, is its own kind of success.",
   [("Spelling bees are only fun for people who never make mistakes.", "Yasmin does get eliminated, yet still feels successful."), ("Practicing is a waste of time if you don't win.", "Yasmin's practice clearly helps her get through her panic."), ("Judges are usually too strict during competitions.", "The judge in the story is neutral, not strict or unfair.")],
   "The final paragraph states directly that finding a way through panic “felt like its own kind of victory.”",
   "Look at the character's final realization to find the theme.", SPELLING)
mc("character", "RL.5.3", 2, "How does Yasmin feel just before the spelling bee begins?",
   "nervous", [("bored", "Sweating palms and racing thoughts show nerves, not boredom."), ("angry", "Nothing suggests she is upset with anyone."), ("confident and relaxed", "Her blank mind and sweating palms show the opposite of relaxed confidence.")],
   "“Yasmin's palms were sweating” and her memorized words “seemed to have evaporated,” both showing nervousness.",
   "Physical reactions, like sweating, are strong clues to a character's feelings.", SPELLING)
mc("plot-conflict", "RL.5.3", 3, "What is the central conflict Yasmin faces on stage?",
   "Panic makes her forget a word she had already memorized.",
   [("She forgets to study for the spelling bee.", "She studied for three weeks, so this is not the problem."), ("Another speller cheats during the competition.", "No cheating is mentioned in the story."), ("The judge asks her an unfair question.", "The judge simply gives her the next word on the list.")],
   "Despite weeks of practice, panic makes the word's letters seem to disappear from her memory.",
   "The central conflict is the specific obstacle the character must overcome in the moment.", SPELLING)
mc("point-of-view", "RL.5.6", 3, "The story is told in third person, but whose thoughts does the reader follow most closely?",
   "Yasmin's", [("the judge's", "The judge only speaks a few words; we never hear the judge's thoughts."), ("Ms. Adel's", "Ms. Adel appears only in Yasmin's memory."), ("the audience's", "The audience's thoughts are never described.")],
   "The narration stays close to Yasmin's thoughts and feelings throughout the passage.",
   "A third-person narrator can still focus closely on one character's inner thoughts.", SPELLING)
mc("inference", "RL.5.1", 5, "Why does Yasmin feel a sense of victory even though she does not win the spelling bee?",
   "She successfully managed her panic instead of letting it defeat her completely.",
   [("She secretly did not want to win the competition.", "Nothing suggests she wanted to lose."), ("She believes the word 'conscience' was unfair.", "She never complains that the word was unfair."), ("She is happy the competition is finally over.", "Relief that it's over is not the victory she describes.")],
   "The last paragraph explains that overcoming the panic, not winning the whole event, is what felt like a victory to her.",
   "An inference about feelings should match the character's own stated realization.", SPELLING)
mc("figurative-language", "RL.5.4", 4, "“Every word she had memorized seemed to have evaporated from her mind.” What does this figurative language suggest?",
   "Her memorized words suddenly felt completely gone, as if they had vanished into thin air.",
   [("Her memory turned into water.", "The sentence is figurative, not literal."), ("She forgot how to spell forever.", "She successfully spells the word moments later."), ("She decided to stop studying.", "The sentence describes a sudden panic, not a choice to quit.")],
   "Comparing memorized words to evaporating water emphasizes how suddenly and completely they seemed to disappear.",
   "Picture the literal action in the figurative phrase, then apply that feeling to the character's situation.", SPELLING)
ms("text-evidence", "RL.5.1", 5, "Which TWO details show that Yasmin manages her panic instead of being completely controlled by it? Choose two.",
   ["She remembers Ms. Adel's advice to break the word down.", "She spells the easy part, “con,” first and then continues."],
   [("Her palms were sweating before she reached the stage.", "This shows she is nervous, not that she is managing the panic."), ("Sixty parents were watching the competition.", "This describes the audience, not Yasmin's response to panic.")],
   "Both chosen details show Yasmin taking a deliberate, calm step to work through her panic rather than freezing completely.",
   "Choose evidence that shows an ACTION the character takes, not just a feeling she has.", SPELLING)
order("plot-events", "RL.5.3", 4, "Put the events of “The Spelling Bee” in order.",
      ["Yasmin practices her spelling words for three weeks.", "Her mind goes blank when the judge gives her the word 'conscience.'",
       "She remembers her tutor's advice to break the word into smaller parts.", "She spells the word correctly and hears applause."],
      "The story moves in time order from practice, to panic, to remembered advice, to success.",
      "Look for time clues such as “for three weeks,” “now,” and “she opened her mouth.”", SPELLING)
mc("context-clues", "L.5.4.a", 4, "What does evaporated mean in “every word she had memorized seemed to have evaporated from her mind”?",
   "disappeared completely, as if turned into vapor and gone",
   [("grew much larger", "Evaporating involves disappearing, not growing."), ("became easier to remember", "This is the opposite of what the sentence describes."), ("was written down on paper", "The sentence is about memory, not writing.")],
   "Comparing memorized words to evaporating water suggests they felt like they had completely vanished.",
   "Think about what evaporating water actually does: it disappears into the air.", SPELLING)
mc("context-clues", "L.5.4.a", 3, "What does ripple mean in “a small ripple of applause moved through the audience”?",
   "a gradual spreading motion, like a small wave",
   [("a loud explosion", "A ripple is usually small and gentle, not an explosion."), ("complete silence", "Applause, even if small, is the opposite of silence."), ("a single loud clap from one person", "The word “moved through the audience” suggests it spread, not from just one person.")],
   "Comparing the applause to a ripple suggests it spread gently and gradually through the crowd, like a ripple on water.",
   "Picture the literal meaning of a word (a ripple on water) to understand its figurative use.", SPELLING)
tf("theme", "RL.5.2", 5, "True or false: Yasmin wins the spelling bee at the end of the story.", False,
   "The text clearly states she “didn't win the spelling bee” and was eliminated two rounds later.",
   "Check the text carefully; a character can feel successful without actually winning a competition.", SPELLING)
mc("character-perspective", "RL.5.6", 5, "How does Yasmin's idea of “winning” change from the beginning to the end of the story?",
   "At first winning probably meant finishing first; by the end, she sees overcoming her panic as its own kind of win.",
   [("She decides winning does not matter to her at all.", "She clearly values the moment; she just redefines what counts as success."), ("She believes only the judge's opinion matters.", "The final paragraph is about her own realization, not the judge's view."), ("Her idea of winning never changes in the story.", "The final paragraph shows a clear shift in how she views success.")],
   "The final paragraph shows she has redefined success to include overcoming panic, not just placing first.",
   "Look for a shift in a character's thinking between the start and the end of a story.", SPELLING)
