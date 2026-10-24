from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(4)

# ============================ PASSAGES (new) ============================
POTTER = P("G4-P14", "The Potter Who Outwitted the Governor", "Folktale", """
Long ago, in a village beside a wide river, there lived a potter named Tarek. He made the finest clay jars in the land, but he owned nothing else of much value.

One day the governor of the village decided he wanted the most beautiful jar for himself, free of charge. He sent a guard to Tarek's workshop. "Give the governor your best jar," the guard said, "or he will take your workshop instead."

Tarek did not argue. He wrapped his finest jar in cloth and carried it to the governor's palace himself.

"Before I give you this jar," Tarek said, bowing low, "I must warn you. This jar holds an old secret. Whoever owns it must fill it completely with gold within a year, or the jar will crack and bring its owner ten years of bad luck."

The governor's eyes narrowed. He loved beautiful things, but he loved his gold even more. "Keep your jar, potter," he said quickly. "I have no need for cursed pottery cluttering my palace."

Tarek bowed again and walked home with his jar still wrapped safely in his arms. From that day on, the governor never bothered him again, and villagers came from far away just to hear how the clever potter had outwitted the greedy governor with nothing but a few clever words.
""")

CAMELS = P("G4-P15", "Camels: Built for the Desert", "Informational Text", """
Camels are often called "ships of the desert" because they can carry heavy loads across sand for many days without stopping for water.

A Body Made for Heat
A camel's body is specially suited to desert life. Its hump does not store water, as many people believe. Instead, it stores fat, which the camel's body slowly turns into energy and water when food is scarce. Camels also have thick eyelashes and nostrils that close tightly, keeping out blowing sand.

Saving Every Drop
Camels can drink more than 100 liters of water in just ten minutes, then go without drinking again for up to two weeks. Their kidneys and intestines are so efficient that very little water is lost, even in their waste. Unlike most animals, a camel's body temperature can rise several degrees during the day, which means it sweats less and saves water.

Wide, Soft Feet
A camel's feet spread out wide when it steps, like built-in snowshoes for sand. This keeps the heavy animal from sinking into loose dunes, letting it travel for hours without tiring.

Because of these features, camels have helped desert traders and travelers cross some of the hottest, driest places on Earth for thousands of years.
""")

SCRIBE = P("G4-P16", "The Apprentice Scribe", "Historical Fiction", """
Nile Valley, nearly four thousand years ago.

Senwosret knelt beside his father's writing table, grinding a lump of soot into fine black powder. At eleven years old, he had studied in the scribe school for three years, copying the same hieroglyphs until his wrist ached, but he had never been allowed to write anything that mattered.

"Today is different," his father said, unrolling a fresh sheet of papyrus. "The temple needs a record of this year's grain harvest. You will write the first column. I will check every symbol before it is sealed."

Senwosret's hand trembled as he dipped his reed pen into the ink. He drew the symbol for wheat, then the symbol for baskets, counting carefully on his fingers before each number.

Halfway down the column, he made a mistake—he drew the symbol for ten baskets when he meant one hundred. His stomach tightened. Ruined papyrus could not simply be thrown away; it was far too costly to waste.

He almost called out to his father in panic. Instead, he remembered what his teacher always said: "A scribe who panics makes a second mistake to cover the first." Senwosret studied the symbol calmly, then carefully painted over it with a thin wash of water and gently blotted it, lifting away the wrong mark before it dried completely. He redrew the correct symbol in its place, slightly smaller than the others but perfectly clear.

When his father finally checked the column, he paused at that one spot, running his finger over the slightly uneven ink. "You fixed something here."

"Yes, Father. I used too few baskets, then too many. I made it right," Senwosret said, bracing himself for a scolding.

His father rolled the papyrus carefully. "A scribe who can fix his own mistakes without ruining the work is more valuable than one who never risks writing at all." He placed the scroll in Senwosret's hands. "Carry it to the temple yourself. Tell them a scribe recorded this harvest."

Senwosret walked the river road with the scroll held tightly against his chest, prouder of the small correction than of any perfect line he had ever copied before.
""")

# ============================ THE POTTER WHO OUTWITTED THE GOVERNOR ============================
mc("theme", "RL.4.2", 3, "Which sentence best states the theme of “The Potter Who Outwitted the Governor”?",
   "Cleverness can solve problems that strength or money cannot.",
   [("Clay jars are more valuable than gold.", "The story is not really about the value of jars."),
    ("Governors always get what they want.", "The ending shows the opposite is true."),
    ("Rivers are useful for making pottery.", "The river is only part of the setting.")],
   "Tarek has no soldiers or riches, but a few clever words protect his workshop and his jar.",
   "A theme is the lesson a story teaches about life, not a fact from the setting.", POTTER)
mc("character", "RL.4.3", 2, "How does Tarek react when the guard threatens to take his workshop?",
   "calmly, without arguing",
   [("angrily, shouting at the guard", "The text never shows him shouting."),
    ("fearfully, by running away", "He walks straight to the palace instead of fleeing."),
    ("sadly, by giving up pottery forever", "He keeps his jar and his workshop in the end.")],
   "Tarek “did not argue” and simply carried the jar to the palace himself—a calm, confident reaction.",
   "Look at what a character does right after a problem begins.", POTTER)
mc("plot-conflict", "RL.4.3", 3, "What is the central conflict at the beginning of the story?",
   "The governor wants Tarek's best jar for free, and Tarek must find a way to keep it.",
   [("The jar cracks before Tarek can finish it.", "The jar never actually cracks in the story."),
    ("Tarek wants to sell jars in a different village.", "Nothing suggests Tarek wants to move."),
    ("The river floods and destroys the workshop.", "There is no flood in the story.")],
   "The guard's threat creates the problem Tarek must solve using only his wits.",
   "The central conflict is the main problem a character faces and must resolve.", POTTER)
mc("point-of-view", "RL.4.6", 3, "Which clue tells you that this folktale is told in third person?",
   "The narrator refers to Tarek and the governor as “he,” never as “I.”",
   [("The narrator speaks directly to the reader as “you.”", "This tale never addresses the reader this way."),
    ("Tarek describes his own feelings using the word “I.”", "Tarek is always called “he” or by name, not “I.”"),
    ("The governor explains his own plans using the word “I.”", "The governor is also called “he,” not “I,” throughout.")],
   "Third-person narration uses he/she/names instead of I/me, which is exactly how this tale refers to both characters.",
   "Scan for pronouns like “he,” “she,” or “I” to identify a story's point of view.", POTTER)
mc("inference", "RL.4.1", 5, "Why does the governor change his mind so quickly after hearing about the jar's “secret”?",
   "He cares more about keeping his gold than about owning a beautiful jar.",
   [("He suddenly feels sorry for Tarek.", "Nothing in the story suggests sympathy."),
    ("He does not believe jars can be beautiful.", "He clearly wanted the jar until he heard the warning."),
    ("He plans to buy a different jar instead.", "The story never mentions another jar.")],
   "The text says he “loved his gold even more,” so the thought of filling the jar with gold scares him off.",
   "An inference combines a text clue with what you already know about the character.", POTTER)
ms("text-evidence", "RL.4.1", 5, "Which TWO details from the story are clues that Tarek is clever? Choose two.",
   ["He invents a warning about the jar instead of refusing the guard.", "He speaks politely while still protecting what is his."],
   [("He makes the finest clay jars in the land.", "This shows skill as a potter, not cleverness in this situation."),
    ("He owns nothing else of much value.", "This describes his wealth, not his cleverness.")],
   "Tarek's invented warning is a clever trick, and his polite, bowing manner keeps him safe without conflict.",
   "Text evidence must directly support the specific idea being asked about.", POTTER)
order("plot-events", "RL.4.3", 3, "Put the events of “The Potter Who Outwitted the Governor” in order.",
      ["The governor sends a guard to demand Tarek's best jar.", "Tarek wraps the jar and carries it to the palace himself.",
       "Tarek warns the governor that the jar is cursed unless filled with gold.", "The governor tells Tarek to keep the jar."],
      "The story moves from the threat, to Tarek's response, to his clever trick, to the result.",
      "Look for the order in which each character acts and speaks.", POTTER)
tf("theme", "RL.4.2", 4, "True or false: The story suggests that greed can sometimes work against the greedy person.", True,
   "The governor's own love of gold is exactly what makes him refuse the jar, so his greed backfires.",
   "Ask whether a character's flaw ends up helping or hurting them by the end.", POTTER)
mc("context-clues", "L.4.4.a", 4, "In the last paragraph, what does outwitted mean?",
   "beat someone by being smarter, not stronger",
   [("beat someone by being faster", "Speed is never mentioned in the story."),
    ("beat someone by being richer", "Tarek has little money; his gold warning is a trick, not real wealth."),
    ("beat someone by being louder", "Tarek speaks calmly and politely, not loudly.")],
   "The sentence says Tarek outwitted the governor “with nothing but a few clever words,” which points to cleverness, not force.",
   "Look at HOW a character wins to figure out what a word like outwitted means.", POTTER)
mc("multiple-meaning", "L.4.4.a", 3, "In this story, the word crack means “to break apart.” Which sentence uses crack with a DIFFERENT meaning?",
   "My brother always tells a crack joke at dinner.",
   [("The jar will crack if it is not filled with gold.", "This uses crack the same way the story does—to break."),
    ("The old plate had a crack down the middle.", "This crack is a break in an object, the same meaning as in the story."),
    ("Ice can crack if you stand on it too long.", "This also means to break apart.")],
   "Here crack describes a type of joke, not something breaking—a different meaning of the same word.",
   "Multiple-meaning words need the rest of the sentence to tell you which meaning fits.", POTTER)
mc("make-predictions", "RL.4.1", 4, "Based on how Tarek solves his first problem, what would he most likely do if the governor's guard returned next year?",
   "Think of another clever, calm way to protect what is his",
   [("Give up and hand over all of his jars", "Nothing in his character suggests he would give up easily."),
    ("Yell at the guard and refuse to speak with him", "He stayed calm and polite the first time."),
    ("Move away from the village immediately", "There is no hint that he plans to leave.")],
   "Tarek's calm, clever approach the first time is a strong clue to how he would act again.",
   "Predict future actions using a character's pattern of behavior earlier in the story.", POTTER)
mc("character-perspective", "RL.4.6", 5, "How might the governor's opinion of Tarek differ from how the villagers see him?",
   "The governor may see Tarek as someone to be wary of, while the villagers see him as a hero.",
   [("The governor and the villagers both think Tarek is dishonest.", "The villagers clearly admire him, retelling the story proudly."),
    ("The governor wants to reward Tarek, while the villagers are jealous.", "The governor never offers a reward."),
    ("Both the governor and villagers forget about Tarek quickly.", "The story says villagers still come from far away to hear the tale.")],
   "The governor avoids Tarek afterward, a sign of caution, while villagers celebrate his cleverness as a story worth retelling.",
   "Different characters can view the same event in very different ways.", POTTER)

# ============================ CAMELS: BUILT FOR THE DESERT ============================
mc("central-idea", "RI.4.2", 3, "What is the central idea of “Camels: Built for the Desert”?",
   "Camels have special body features that help them survive and travel in the desert.",
   [("Camels are called ships because they float on sand.", "“Ships of the desert” is a nickname, not a literal fact."),
    ("Camels need to drink water every single day.", "The text says camels can go up to two weeks without drinking."),
    ("Camel feet are the most important desert animal feature.", "Feet are one detail among several described in the text.")],
   "Every section—heat, water, and feet—explains a different way camels are built for desert survival.",
   "The central idea is supported by every section of an informational text, not just one.", CAMELS)
mc("text-features", "RI.4.7", 2, "Under which heading would you learn why a camel's hump is useful?",
   "A Body Made for Heat", [("Saving Every Drop", "That section focuses on water and kidneys."), ("Wide, Soft Feet", "That section explains how camels walk on sand."), ("Camels: Built for the Desert", "That is the title of the whole article.")],
   "The first section explains that the hump stores fat, which is used for energy and water.",
   "Headings preview what information appears in the section below them.", CAMELS)
mc("text-features", "RI.4.7", 3, "A reader is confused about the phrase “built-in snowshoes for sand.” Which heading should they reread to understand it?",
   "Wide, Soft Feet", [("A Body Made for Heat", "That heading is about the hump and eyelashes, with no mention of snowshoes."), ("Saving Every Drop", "That heading focuses on drinking and kidneys, not walking on sand."), ("Camels: Built for the Desert", "This is only the article's title, not a specific section to reread.")],
   "The snowshoe comparison appears in the section about feet, since both describe spreading weight out over sand.",
   "When a phrase is confusing, find the heading whose topic matches it, then reread that section.", CAMELS)
mc("cause-effect", "RI.4.3", 3, "According to the article, what is an EFFECT of a camel's hump storing fat?",
   "The fat can turn into energy and water when food is scarce.",
   [("The hump fills completely with water.", "The article corrects this common myth directly."), ("The camel grows a second hump.", "The article never mentions a second hump."), ("The camel needs to eat more often.", "Storing fat actually helps the camel go longer without eating.")],
   "“It stores fat, which the camel's body slowly turns into energy and water” describes the effect of storing fat.",
   "Find the sentence right after the cause to locate its effect.", CAMELS)
mc("cause-effect", "RI.4.3", 5, "Why does a camel sweat less than most animals during a hot day?",
   "Its body temperature is allowed to rise several degrees instead of staying constant.",
   [("Its thick eyelashes block sweat from forming.", "Eyelashes protect the eyes from sand, not from sweating."), ("It stores extra water in its feet.", "Feet are described for walking, not water storage."), ("It drinks constantly throughout the day.", "The article says camels can go up to two weeks without drinking.")],
   "“A camel's body temperature can rise several degrees during the day, which means it sweats less and saves water.”",
   "Signal words like “which means” connect a cause to its effect.", CAMELS)
mc("compare-contrast", "RI.4.5", 5, "How is a camel's body temperature different from that of most animals, according to the article?",
   "A camel's temperature can rise during the day, while most animals keep a steady temperature.",
   [("A camel's temperature never changes at all.", "The article says it can rise several degrees."), ("Most animals' temperatures rise more than a camel's.", "The article highlights the camel as unusual, not typical."), ("A camel's temperature only changes at night.", "The article specifies the rise happens during the day.")],
   "The word “unlike” signals that the article is contrasting camels with most other animals.",
   "Words such as unlike and most often introduce a comparison.", CAMELS)
mc("context-clues", "L.4.4.a", 4, "In the article, what does scarce mean in “turns into energy and water when food is scarce”?",
   "hard to find; in short supply",
   [("very tasty", "Taste is not discussed in this sentence."), ("spoiled or rotten", "Nothing in the sentence is about spoiled food."), ("plentiful and easy to find", "This is the opposite of how scarce is used here.")],
   "The camel needs stored fat exactly when food is NOT easy to find, so scarce must mean hard to find.",
   "Think about why the camel would need a backup energy source.", CAMELS)
mc("context-clues", "L.4.4.a", 5, "What does efficient mean in “Their kidneys and intestines are so efficient that very little water is lost”?",
   "working very well without wasting anything",
   [("working very slowly", "Slow would not explain why so little water is lost."), ("working only sometimes", "The sentence suggests reliable, constant performance."), ("working loudly", "Sound is never mentioned.")],
   "Because the kidneys lose “very little water,” efficient must mean they work well without waste.",
   "Use the result described in the sentence to figure out the word's meaning.", CAMELS)
ms("text-evidence", "RI.4.1", 5, "Which TWO details show that a camel's body is good at saving water? Choose two.",
   ["Its kidneys and intestines lose very little water.", "It can go without drinking again for up to two weeks."],
   [("It can carry heavy loads across sand.", "This is about strength and carrying, not water."), ("Its feet spread out wide when it steps.", "This detail is about walking on sand, not water.")],
   "Both chosen details directly describe how little water the camel's body loses or needs.",
   "Text evidence should match the exact idea the question asks about.", CAMELS)
tf("text-evidence", "RI.4.1", 3, "True or false: According to the article, a camel's hump is mainly filled with water.", False,
   "The article directly corrects this idea: the hump stores fat, not water.",
   "Watch for sentences that correct a common myth; they often signal an important fact.", CAMELS)
mc("author-purpose", "RI.4.8", 4, "Why did the author probably organize this article with three separate headings?",
   "to group related facts about the camel's body so readers can find information easily",
   [("to make the article look longer than it is", "Headings organize ideas; they do not just add length."), ("to show that camels have three legs", "Camels have four legs; the headings are about body features."), ("to list the article in alphabetical order", "The headings are grouped by topic, not alphabetically.")],
   "Each heading introduces a different desert-survival feature, helping readers locate facts quickly.",
   "Authors use headings to organize information into clear, related groups.", CAMELS)

# ============================ THE APPRENTICE SCRIBE ============================
mc("theme", "RL.4.2", 4, "Which sentence best expresses the theme of “The Apprentice Scribe”?",
   "Fixing a mistake carefully can be more valuable than never taking a risk.",
   [("Papyrus is too expensive to ever use for practice.", "Cost is mentioned, but it is not the story's lesson."), ("Fathers should always check their children's work.", "This describes an action, not the story's deeper message."), ("Scribes must count every number twice before writing.", "This is a practical tip, not the theme.")],
   "The father's final words directly state that fixing a mistake well is more valuable than avoiding risk entirely.",
   "Look for a character's closing statement—it often reveals the theme.", SCRIBE)
mc("character", "RL.4.3", 3, "How does Senwosret feel right after he realizes his mistake?",
   "anxious, but he manages to stay calm enough to fix it",
   [("proud, because the mistake made his work look better", "He is clearly worried, not proud, about the mistake."), ("angry at his father for giving him the task", "He is scared of being caught, not angry at his father."), ("relieved, because he decides to ignore it", "He does not ignore the mistake; he carefully corrects it.")],
   "“His stomach tightened,” showing worry, but he remembers his teacher's advice and stays calm enough to fix the error.",
   "A character can feel one emotion while still choosing a calm action.", SCRIBE)
mc("plot-conflict", "RL.4.3", 3, "What is the central conflict in the story?",
   "Senwosret makes a costly mistake on an important document and must decide how to handle it.",
   [("Senwosret does not want to learn hieroglyphs.", "He has studied for three years and wants to do this task."), ("The temple refuses to accept the harvest record.", "The temple is not shown refusing anything."), ("Senwosret's father cannot read hieroglyphs.", "The father reads and checks the column carefully.")],
   "The mistake on the papyrus creates the problem Senwosret must solve calmly and carefully.",
   "The central conflict is the main problem driving the character's choices.", SCRIBE)
mc("point-of-view", "RL.4.6", 4, "This story is told in third person. What does that allow the narrator to describe that a first-person account by only Senwosret might not easily show?",
   "his father's calm, approving reaction after checking the corrected column",
   [("the trembling feeling in Senwosret's own hand", "A first-person narrator could still describe his own physical feelings."),
    ("the worry Senwosret feels after making the mistake", "Senwosret could easily describe his own worry even as a first-person narrator."),
    ("the moment Senwosret decides to fix the mark calmly", "Senwosret could describe his own decision even if he told the story himself.")],
   "A third-person narrator can describe other characters' reactions, like the father's, without being limited to only one character's own thoughts.",
   "Third-person narration can move beyond a single character's own perspective.", SCRIBE)
order("plot-events", "RL.4.3", 4, "Put the events of “The Apprentice Scribe” in order.",
      ["Senwosret's father gives him the first column of the harvest record to write.", "Senwosret draws the wrong symbol for the number of baskets.",
       "Senwosret carefully removes the wrong mark and redraws the correct symbol.", "His father says a scribe who fixes mistakes is valuable, and sends him to the temple."],
      "The story follows a clear time order: the task, the mistake, the fix, and the father's response.",
      "Look for time clues like “today,” “halfway down,” and “when his father finally checked.”", SCRIBE)
mc("inference", "RL.4.1", 5, "Why does Senwosret's father say a scribe who fixes mistakes is “more valuable” than one who never takes risks?",
   "Because a scribe who is too afraid to try difficult work will never grow skilled enough to do it well.",
   [("Because mistakes always look better than correct work.", "The father values the correction, not the mistake itself."), ("Because risky scribes are paid more money.", "Money is never mentioned in the story."), ("Because the temple prefers messy papyrus.", "The temple expects careful, clear records.")],
   "The father's comment suggests that avoiding all risk means never improving, while fixing mistakes shows real skill.",
   "An inference uses the character's exact words plus logical reasoning.", SCRIBE)
ms("text-evidence", "RL.4.1", 5, "Which TWO details show that Senwosret stays calm under pressure? Choose two.",
   ["He remembers his teacher's advice instead of panicking.", "He carefully removes the wrong mark before it dries."],
   [("His hand trembled as he dipped his pen in the ink.", "This shows nervousness, not calm action."), ("His stomach tightened when he saw the mistake.", "This describes his feeling, not a calm action he takes.")],
   "Remembering advice and carefully fixing the mark both show deliberate, calm problem-solving.",
   "Text evidence for “staying calm” should describe an action, not just a feeling.", SCRIBE)
mc("figurative-language", "RL.4.4", 4, "What does the phrase “his stomach tightened” most likely show about Senwosret?",
   "He feels a sudden rush of worry or fear.",
   [("He is hungry and needs to eat soon.", "The phrase describes an emotion, not actual hunger."), ("He has a stomachache from the heat.", "No illness is mentioned in the story."), ("He is excited to finish his work.", "The context after this phrase shows fear, not excitement.")],
   "Writers often describe a physical feeling, like a tight stomach, to show a character's fear or nervousness.",
   "When a body part reacts strongly, think about what emotion usually causes that feeling.", SCRIBE)
mc("context-clues", "L.4.4.a", 4, "In the story, what does papyrus mean?",
   "a material made for writing on, like paper",
   [("a tool used to grind soot into powder", "That tool is separate; papyrus is what gets written on."), ("a king's official seal", "Seals are not mentioned in the story."), ("a type of hieroglyph symbol", "Papyrus is the material, not a symbol drawn on it.")],
   "The father “unrolls a fresh sheet of papyrus” and Senwosret writes a column on it, so papyrus must be a writing material.",
   "Picture what the character does with the object to figure out its meaning.", SCRIBE)
mc("context-clues", "L.4.4.a", 3, "What does trembled mean in “Senwosret's hand trembled as he dipped his reed pen into the ink”?",
   "shook slightly",
   [("moved very slowly", "Trembling is about shaking, not speed."), ("reached forward", "This describes motion, but not the shaking itself."), ("felt completely still", "Trembling is the opposite of being still.")],
   "A trembling hand shakes slightly, which fits a nervous young scribe about to write something important.",
   "Think about how a nervous person's hand might move while doing something important.", SCRIBE)
tf("theme", "RL.4.2", 5, "True or false: Senwosret's father scolds him harshly for making the mistake.", False,
   "Instead of scolding him, the father praises the careful correction and calls him valuable.",
   "Compare what you expect a character to do with what actually happens in the text.", SCRIBE)
mc("character-perspective", "RL.4.6", 5, "How does the father's view of mistakes differ from what Senwosret feared he would think?",
   "Senwosret expects a scolding, but his father actually values the careful correction.",
   [("Both the father and Senwosret think the mistake ruined the papyrus.", "The father does not see it as ruined once it is fixed."), ("The father is angrier about the mistake than Senwosret expected.", "The father's reaction is calmer and more approving than expected."), ("Senwosret is proud of the mistake, but his father is not.", "Senwosret braces for a scolding; he is not proud at first.")],
   "Senwosret braces himself for a scolding, but his father's response shows a completely different, more understanding perspective.",
   "Compare a character's expectation with what another character actually says or does.", SCRIBE)
