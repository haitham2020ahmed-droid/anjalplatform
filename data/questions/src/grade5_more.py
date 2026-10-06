"""
Grade 5 question bank, expansion 1: skills that had no items.
Original passages and items written for this platform (no publisher text).
Grammar items follow the rule summaries of the school's Wonders 2023 G5 materials.
Imported by build_bank.py after the earlier modules, so existing refs never change.
"""
from qb import P, dd, err, fill, grade, match, mc, ms, order, tf

grade(5)

# ------------------------------------------------------------------ passages

P6 = P("G5-P6", "The Last Repair", "Historical Fiction", """
In the spring of 1955, the narrow lanes of old Jeddah smelled of sea salt and cardamom. Inside a tiny shop with a carved wooden door, twelve-year-old Khalid bent over his uncle’s workbench.

A ship’s captain had left a gold pocket watch that morning. “My ship sails at sunset,” he had said. “I cannot sail without my watch.” Uncle Faris had a fever and could not work, so the repair was Khalid’s alone.

By late afternoon, Khalid had opened the watch and cleaned every gear. Then, as he lifted the tiny mainspring with his tweezers, his hand shook. The spring leaped into the air and vanished.

Khalid’s heart pounded. He swept his hands across the bench, knocking a box of screws to the floor.

Then he remembered the first day his uncle had let him touch a watch. Khalid had been eight, and he had rushed so fast that he bent a gear. Uncle Faris had turned over a small sand timer and said, “A watchmaker’s hands must be slower than the sand.” They had watched the grains fall together until Khalid’s breathing was calm.

Now Khalid closed his eyes and counted slowly to ten. He picked up the magnifying glass and searched the bench inch by inch. There, caught in the folds of his apron, lay a silver curl no bigger than a fingernail.

He fitted the spring, closed the case, and wound the crown. The watch began to tick just as the ship’s horn sounded across the harbor. Khalid ran all the way to the dock, and the captain’s smile told him everything.
""")

P7 = P("G5-P7", "The Two Wells", "Folktale", """
Long ago, in a village at the edge of a great desert, there was only one well. Every family shared its water, and every child knew the way to it in the dark.

One year, a rich merchant named Hamdan built a wall around the well and placed a gate in it. “From now on,” he announced, “every bucket costs a silver coin.” The poorest families began to go thirsty.

A girl named Salma watched the palm trees outside the village. She noticed that one small grove stayed green even in the hottest month, while all the others turned brown. “Water must be close to the surface there,” she told her grandmother.

Salma and the other children dug beside the green grove for seven days. Their hands blistered, and Hamdan laughed at them from his gate. On the eighth day, the sand turned dark and cool, and clear water seeped into the hole.

The villagers named it the Children’s Well, and they shared it freely, as they always had.

Hamdan’s gate stayed locked, but no one came to buy his water. At last he unlocked it himself. “Water that is shared,” he admitted, “is worth more than water that is sold.”
""")

P8 = P("G5-P8", "The Volcano That Would Not Erupt", "Drama", """
CAST: LAYLA, a fifth grader; YUSUF, her partner; MS. DAWOOD, their science teacher

SCENE 1
[A classroom on the morning of the science fair. A clay volcano sits on a table. LAYLA paces back and forth. YUSUF holds a bottle of vinegar.]

LAYLA: [wringing her hands] The judges come at ten o’clock. If it doesn’t erupt, we’ll lose.

YUSUF: [calmly] We tested it three times last night. It will work.

[YUSUF pours the vinegar. Nothing happens. The room is silent.]

LAYLA: [covering her face] I knew it. Everything is ruined!

YUSUF: [peering into the volcano] Wait. Where did you put the baking soda?

LAYLA: [slowly lowering her hands] The baking soda… is still in my backpack.

SCENE 2
[Ten minutes later. MS. DAWOOD walks in with a clipboard. LAYLA and YUSUF stand proudly beside the volcano.]

MS. DAWOOD: Show me what you have learned.

[YUSUF nods at LAYLA. She pours the vinegar. Red foam bubbles up and spills down the sides.]

MS. DAWOOD: [smiling] Excellent. And what happens when the experiment does not work?

LAYLA: [laughing] You check every step, and you never panic.
""")

P9 = P("G5-P9", "Every School Needs a Garden", "Argumentative Text", """
Every school should have a garden where students grow their own food. A school garden is more than a few plants in the ground. It is an outdoor classroom that improves learning, health and community.

First, gardens make lessons real. When students measure plant growth, they practice math. When they study soil and insects, they practice science. Teachers at schools with gardens often report that students remember these lessons longer because they did the work with their own hands.

Second, gardens help students eat better. Children who grow vegetables are more willing to taste them. A tomato you have watered for weeks is much more interesting than one from a store shelf.

Third, gardens bring people together. Families can volunteer on weekends, and older students can teach younger ones how to plant seeds.

Some people argue that gardens cost too much money and take too much time. However, many gardens start small, with a few containers and donated seeds. Even a sunny corner of a schoolyard can become a place to learn.

Schools spend a great deal on books and computers. They should also invest in a patch of soil, because some of the best lessons grow from the ground up.
""")

P10 = P("G5-P10", "Sea Turtles of the Red Sea", "Expository Text", """
Sea Turtles of the Red Sea

Where Turtles Nest
Green turtles and hawksbill turtles swim in the warm waters of the Red Sea. Each nesting season, females crawl onto quiet sandy beaches to lay their eggs. Some of these beaches are on the coast of Saudi Arabia.

From Egg to Ocean
A female digs a hole with her back flippers and lays around one hundred eggs. She covers the nest and returns to the sea. The eggs stay warm in the sand for about two months. Then the tiny hatchlings dig their way out, usually at night.

[Caption under a photograph: A green turtle hatchling crawls toward the bright horizon of the sea.]

Dangers on the Beach
Hatchlings find the sea by moving toward the brightest horizon, which is normally the moonlit water. Bright lights from buildings can confuse them, and they may crawl the wrong way.

Did You Know? (sidebar)
The temperature of the sand affects whether hatchlings become males or females. Warmer nests produce more females.

Glossary: hatchling (noun) a young animal that has just come out of its egg
""")

P11 = P("G5-P11", "Harbor at Dawn", "Poetry", """
The harbor yawns in pearl-gray light,
the last stars folding up the night.
Gulls stitch the sky with silver thread,
the bread oven breathes, warm and red.

Ropes creak like old men’s knees,
salt and diesel ride the breeze,
and fishing boats, still beaded wet,
shake the sleep from every net.
""")

import qb as _qb
_text = {p["id"]: p for p in _qb.PASSAGES}
PAIR = P("G5-P12", "Two Articles: A School Garden and Red Sea Turtles", "Paired Texts",
         "Text 1: Every School Needs a Garden\n\n" + _text["G5-P9"]["text"] + "\n\nText 2: Sea Turtles of the Red Sea\n\n"
         + _text["G5-P10"]["text"].split("\n\n", 1)[1])

# ------------------------------------------- plot: conflict (RL.5.3)

mc("plot-conflict", "RL.5.3", 2, "What is the main conflict in “The Last Repair”?",
   "Khalid must fix the captain’s watch before the ship sails, but he loses the spring.",
   [("Khalid and his uncle argue about the shop.", "They never argue; the uncle is ill."),
    ("The captain refuses to pay for the repair.", "The captain smiles at the end."),
    ("Khalid wants to become a sailor.", "Nothing in the story suggests this.")],
   "Khalid faces a deadline (sunset) and a sudden problem (the missing spring).",
   "The conflict is the main problem that creates tension in a story.", P6)
mc("plot-conflict", "RL.5.3", 3, "What kind of conflict does Khalid face when his hands shake and the spring flies away?",
   "A conflict with himself (his nerves)",
   [("A conflict with nature", "No storm or natural force causes the problem."),
    ("A conflict with another character", "No one is working against him."),
    ("A conflict with society", "The village or rules are not the problem.")],
   "His shaking hands and pounding heart show that the struggle is inside him.",
   "Conflicts can be with another character, nature, society or oneself.", P6)
mc("plot-conflict", "RL.5.3", 4, "How does Khalid resolve the conflict?",
   "He calms himself, searches slowly, and finds the spring in his apron.",
   [("He buys a new spring from another shop.", "He finds the original spring."),
    ("He waits for Uncle Faris to get well.", "He solves it himself that afternoon."),
    ("He gives the captain a different watch.", "He repairs the captain’s own watch.")],
   "He counts to ten, uses the magnifying glass, and finds the spring caught in his apron.",
   "Look at what the character does differently to solve the problem.", P6)
tf("plot-conflict", "RL.5.3", 3, "In “The Two Wells,” the conflict begins when Hamdan builds a wall around the well.", True,
   "Charging for water makes the poorest families go thirsty, which creates the problem.",
   "The conflict usually begins with an event that changes everyday life.", P7)
mc("plot-conflict", "RL.5.3", 5, "How does the resolution of “The Two Wells” change Hamdan?",
   "He realizes sharing is more valuable than selling and opens the gate.",
   [("He builds a second wall around the new well.", "He opens his gate instead."),
    ("He leaves the village forever.", "He stays and admits his mistake."),
    ("He makes the children pay for their well.", "The Children’s Well is shared freely.")],
   "When no one buys his water, he unlocks the gate and says shared water is worth more.",
   "A strong resolution often shows how a character has changed.", P7)
mc("plot-conflict", "RL.5.3", 6, "Which detail BEST shows that the conflict in “The Two Wells” affects the whole village, not just Salma?",
   "“The poorest families began to go thirsty.”",
   [("“Salma watched the palm trees outside the village.”", "This is about Salma’s observation."),
    ("“Their hands blistered.”", "This shows the children’s effort, not the wider effect."),
    ("“Hamdan laughed at them from his gate.”", "This shows Hamdan’s attitude.")],
   "Many families suffer when water is sold, so the conflict reaches the whole community.",
   "Look for details that show who is affected by a problem.", P7)

# ------------------------------------------- plot: events (RL.5.3, RL.5.5)

order("plot-events", "RL.5.5", 2, "Put the main events of “The Last Repair” in order.",
      ["The captain leaves his watch at the shop.", "Khalid cleans every gear.", "The spring flies away.",
       "Khalid finds the spring in his apron.", "The watch ticks as the ship’s horn sounds."],
      "The events follow the afternoon from the captain’s visit to the ship’s departure.",
      "Plot events build toward a climax and then a resolution.", P6)
mc("plot-events", "RL.5.5", 3, "What is the climax of “The Last Repair”?",
   "Khalid finds the spring and the watch ticks as the horn sounds.",
   [("The captain leaves the watch in the morning.", "This is the beginning (exposition)."),
    ("Khalid cleans the gears.", "This is part of the rising action."),
    ("Khalid runs to the dock.", "This comes after the turning point.")],
   "The moment of greatest tension is solved when the watch starts ticking just in time.",
   "The climax is the turning point, where the tension is highest.", P6)
mc("plot-events", "RL.5.3", 4, "Which event causes Khalid to knock the box of screws to the floor?",
   "He panics after the spring disappears.",
   [("His uncle calls him from the other room.", "His uncle is ill and does not call him."),
    ("The ship’s horn startles him.", "The horn sounds at the very end."),
    ("The captain returns early.", "The captain does not return until the dock.")],
   "After the spring vanishes, Khalid sweeps his hands across the bench in panic.",
   "Events in a plot are often connected by cause and effect.", P6)
mc("plot-events", "RL.5.5", 5, "How does the flashback fit into the structure of the plot?",
   "It interrupts the rising action and gives Khalid the idea that solves the problem.",
   [("It is the opening event of the story.", "The story opens in 1955 in the shop."),
    ("It is the resolution of the story.", "The resolution is the repaired watch."),
    ("It has no connection to the main events.", "It leads directly to Khalid calming down.")],
   "Remembering his uncle’s lesson leads Khalid to slow down and find the spring.",
   "Ask how each part of a story helps the plot move forward.", P6)
ms("plot-events", "RL.5.3", 5, "Which TWO events are part of the rising action in “The Two Wells”?",
   ["Hamdan charges a coin for each bucket.", "The children dig for seven days."],
   [("The villagers name the Children’s Well.", "This is part of the resolution."),
    ("Hamdan unlocks his gate.", "This is the falling action or resolution.")],
   "Rising action is the series of events that build tension before the climax.",
   "Rising action comes after the conflict begins and before the turning point.", P7)
mc("plot-events", "RL.5.5", 6, "Why does the author end “The Two Wells” with Hamdan’s words?",
   "To show the lesson of the story through the character who learned it.",
   [("To introduce a new problem for the village.", "The problem is already solved."),
    ("To describe how the new well was dug.", "The digging happens earlier."),
    ("To explain where Hamdan’s money came from.", "His wealth is not explained.")],
   "Hamdan’s final line states the theme of sharing, closing the story.",
   "The final event of a folktale often states its lesson.", P7)

# ----------------------------------------------- plot: flashback (RL.5.5)

mc("plot-flashback", "RL.5.5", 2, "Which paragraph of “The Last Repair” is a flashback?",
   "The one about Khalid at age eight and the sand timer",
   [("The one about the captain leaving the watch", "That happens on the same day."),
    ("The one about the spring flying away", "That happens in the present."),
    ("The one about the ship’s horn", "That is the ending.")],
   "The story goes back to “the first day his uncle had let him touch a watch,” when he was eight.",
   "A flashback moves back in time to an earlier event.", P6)
mc("plot-flashback", "RL.5.5", 3, "Which words signal the start of the flashback?",
   "“Then he remembered…”",
   [("“By late afternoon…”", "This moves forward in time."),
    ("“Now Khalid closed his eyes…”", "“Now” returns to the present."),
    ("“There, caught in the folds…”", "This is in the present.")],
   "The verb “remembered” tells the reader the story is going back in time.",
   "Look for words like remembered, years ago, or had + verb.", P6)
mc("plot-flashback", "RL.5.5", 4, "What does the flashback reveal about Uncle Faris?",
   "He is a patient teacher who helped Khalid stay calm.",
   [("He is strict and often angry.", "He calmly turns over a sand timer."),
    ("He does not trust Khalid with watches.", "He let Khalid touch a watch at eight."),
    ("He wanted Khalid to become a sailor.", "Nothing in the flashback says this.")],
   "He gently teaches that a watchmaker’s hands must be slower than the sand.",
   "Flashbacks often reveal character traits through past events.", P6)
tf("plot-flashback", "RL.5.5", 2, "The flashback in “The Last Repair” happens before the captain leaves his watch.", True,
   "The flashback is from when Khalid was eight, years before the day of the story.",
   "Compare the time of the flashback with the time of the main story.", P6)
mc("plot-flashback", "RL.5.5", 5, "How would the story change if the author removed the flashback?",
   "Readers would not understand why Khalid suddenly calms down.",
   [("The story would happen in a different city.", "The setting does not depend on the flashback."),
    ("The captain would not need his watch.", "The flashback does not affect the captain."),
    ("Khalid would not have a problem.", "The problem still happens without the flashback.")],
   "The memory of the sand timer explains why Khalid counts slowly and searches calmly.",
   "Ask what a flashback explains that the reader would otherwise miss.", P6)
mc("plot-flashback", "RL.5.5", 6, "The sand timer in the flashback and the ship’s horn at the end are both connected to time. Why does the author include both?",
   "To show Khalid learning to work calmly even under time pressure",
   [("To prove that sand timers are more accurate than watches", "The story makes no comparison of accuracy."),
    ("To show that ships always leave late", "The ship leaves at sunset as planned."),
    ("To explain how sand timers are made", "The story does not explain this.")],
   "The timer teaches patience; the horn shows the deadline. Together they show Khalid using patience against time.",
   "Look for how details in a flashback connect to the main story.", P6)

# ----------------------------------------------- plot: setting (RL.5.3)

mc("plot-setting", "RL.5.3", 2, "Where and when does “The Two Wells” take place?",
   "Long ago, in a village at the edge of a desert",
   [("Today, in a large city", "The story says “Long ago” and describes a village."),
    ("On a ship at sea", "The story happens in a desert village."),
    ("In a mountain forest", "The story describes desert and palm trees.")],
   "The first sentence gives both the time (long ago) and the place (a desert village).",
   "Folktales often begin with a time and place like “Long ago, in…”", P7)
mc("plot-setting", "RL.5.3", 3, "Why is the desert setting important to the conflict?",
   "In a desert, water is scarce, so controlling the only well gives Hamdan power.",
   [("The desert is too hot for the children to play.", "Play is not part of the conflict."),
    ("Deserts have many wells, so water is cheap.", "The village has only one well."),
    ("The desert makes the merchant rich from gold.", "His power comes from water, not gold.")],
   "Because water is rare in a desert, owning the only well lets Hamdan charge for it.",
   "Ask how the place creates or shapes the problem.", P7)
mc("plot-setting", "RL.5.3", 4, "Which detail about the setting helps Salma solve the problem?",
   "One grove of palm trees stays green in the hottest month.",
   [("The village is at the edge of a desert.", "This explains the problem, not the solution."),
    ("Every child knows the way to the well in the dark.", "This shows the well’s importance."),
    ("Hamdan builds a gate.", "This is part of the conflict.")],
   "Salma reasons that green trees in the heat mean water is close to the surface.",
   "Setting details can be clues that characters use.", P7)
mc("plot-setting", "RL.5.3", 4, "Which details show the time period of “The Last Repair”?",
   "The year 1955 and the ship’s captain who needs a pocket watch",
   [("Khalid’s age and his apron", "These are not tied to a time period."),
    ("The magnifying glass and the tweezers", "Watchmakers still use these today."),
    ("The fever and the bench", "These could happen at any time.")],
   "The story names 1955, and a captain depending on a pocket watch fits that time.",
   "Look for dates and objects from a particular period.", P6)
tf("plot-setting", "RL.5.3", 3, "The smells of sea salt and cardamom help show that “The Last Repair” is set in a port city.", True,
   "Sea salt suggests the sea, and the story mentions a harbor and a ship.",
   "Sensory details can show the setting without naming it directly.", P6)
mc("plot-setting", "RL.5.3", 6, "How does the setting of the harbor add to the tension at the end of “The Last Repair”?",
   "The ship’s horn across the harbor shows that time has run out.",
   [("The harbor is noisy, so Khalid cannot work.", "He finishes the repair before the horn."),
    ("The harbor is far away, so the captain cannot be found.", "Khalid reaches the dock in time."),
    ("The harbor floods the shop.", "Nothing floods.")],
   "The horn is a sound from the setting that signals the deadline, adding urgency.",
   "Setting can add tension through sounds, weather or time.", P6)

# ----------------------------------------------- make predictions (RL.5.1)

mc("make-predictions", "RL.5.1", 2, "After Salma notices the green grove, what will she most likely do?",
   "Look for water near the green trees.",
   [("Buy water from Hamdan.", "She thinks there is water near the trees."),
    ("Move to another village.", "Nothing suggests she will leave."),
    ("Cut down the palm trees.", "She values the trees as a clue.")],
   "She says, “Water must be close to the surface there.”",
   "A character’s observations often lead to their next action.", P7)
mc("make-predictions", "RL.5.1", 3, "When Hamdan laughs at the children digging, what can readers predict?",
   "Hamdan will be proven wrong.",
   [("The children will stop digging that day.", "They dig for seven days and keep going."),
    ("Hamdan will help them dig.", "His laughter shows he does not support them."),
    ("The children will buy Hamdan’s water.", "They are digging to avoid buying it.")],
   "In folktales, a character who mocks hard work is often proven wrong.",
   "Use what you know about how folktales usually go.", P7)
tf("make-predictions", "RL.5.1", 2, "After Khalid counts slowly to ten, a reader could predict that he will search more carefully.", True,
   "He has just calmed down, so a careful search is likely, and the story shows it.",
   "Predictions use the character’s change in behavior.", P6)
mc("make-predictions", "RL.5.1", 4, "In the drama, when Yusuf asks, “Where did you put the baking soda?”, what can the audience predict?",
   "The missing baking soda is why the volcano did not erupt.",
   [("The judges will cancel the science fair.", "Nothing suggests this."),
    ("Layla will leave the classroom.", "She stays and solves the problem."),
    ("Ms. Dawood will build a new volcano.", "The students fix their own project.")],
   "Vinegar alone does not react; Yusuf’s question points to the missing ingredient.",
   "Use clues in the dialogue and what you know about science.", P8)
mc("make-predictions", "RL.5.1", 5, "Read: “Noor had practiced her speech every night, but when she saw the crowded hall, her mouth went dry.” What is the BEST prediction?",
   "Noor will feel nervous at first but use her practice to get through the speech.",
   [("Noor will forget everything and run away.", "Her practice makes this unlikely."),
    ("Noor will not need to speak at all.", "Nothing suggests the speech is canceled."),
    ("The hall will be empty when she speaks.", "The hall is crowded.")],
   "Her nerves suggest a challenge, but her practice suggests she can succeed.",
   "Strong predictions weigh all the clues, not just one.")
mc("make-predictions", "RL.5.1", 6, "Which clue in “The Two Wells” BEST helped you predict that the children would find water?",
   "The grove stayed green while the other trees turned brown.",
   [("The children’s hands blistered.", "This shows effort, not whether water is there."),
    ("Hamdan charged a silver coin.", "This explains the problem."),
    ("Every child knew the way to the well.", "This is about the old well.")],
   "Trees stay green only with water, so this clue made finding water likely.",
   "The best clue is the one with the strongest link to the outcome.", P7)

# ------------------------------------------------ drama elements (RL.5.5)

mc("drama-elements", "RL.5.5", 1, "What is the purpose of the CAST list at the top of the play?",
   "It names the characters in the play.",
   [("It tells where the play takes place.", "That is the setting in the stage directions."),
    ("It lists the props needed.", "The cast list names people, not props."),
    ("It gives the lesson of the play.", "The cast list does not state a lesson.")],
   "A cast list (or cast of characters) introduces who appears in the play.",
   "Plays begin with a cast list, then scenes and dialogue.", P8)
mc("drama-elements", "RL.5.5", 2, "Which line is a stage direction?",
   "[YUSUF pours the vinegar. Nothing happens.]",
   [("LAYLA: The judges come at ten o’clock.", "This is dialogue."),
    ("MS. DAWOOD: Show me what you have learned.", "This is dialogue."),
    ("SCENE 2", "This is a scene heading.")],
   "Stage directions in brackets tell actors what to do; they are not spoken.",
   "Stage directions are usually in brackets or italics.", P8)
tf("drama-elements", "RL.5.5", 2, "The words in brackets in a play are spoken aloud by the actors.", False,
   "Words in brackets are stage directions; actors follow them but do not say them.",
   "Only the words after a character’s name are spoken.", P8)
mc("drama-elements", "RL.5.5", 3, "Why does the play have two scenes?",
   "The time changes: Scene 2 happens ten minutes later.",
   [("A new character is the narrator.", "There is no narrator in this play."),
    ("The setting moves to a different school.", "Both scenes are in the classroom."),
    ("Scene 2 tells the story from the beginning again.", "Scene 2 continues the story.")],
   "Scene 2 begins “Ten minutes later,” showing a jump in time.",
   "A new scene often signals a change in time or place.", P8)
mc("drama-elements", "RL.5.5", 4, "What does the stage direction [covering her face] tell the audience about Layla?",
   "She feels embarrassed and upset.",
   [("She is hiding from the judges.", "The judges have not arrived yet."),
    ("She is laughing at Yusuf.", "Covering her face shows distress, not laughter."),
    ("She is tired and wants to sleep.", "Nothing suggests tiredness.")],
   "Covering your face is a common sign of embarrassment or despair.",
   "Stage directions show feelings through actions and gestures.", P8)
match("drama-elements", "RL.5.5", 5, "Match each part of the play with its example.",
      [("Cast list", "LAYLA, YUSUF, MS. DAWOOD"),
       ("Stage direction", "[wringing her hands]"),
       ("Dialogue", "We tested it three times last night."),
       ("Scene heading", "SCENE 2")],
      "Each part of a drama has a different job in telling the story.",
      "Look at the format: names, brackets, spoken lines and headings.", passage=P8)

# ----------------------------------------- character perspective (RL.5.6)

mc("character-perspective", "RL.5.6", 2, "How does Yusuf feel at the beginning of Scene 1?",
   "Calm and confident",
   [("Nervous and upset", "This describes Layla, not Yusuf."),
    ("Angry with Layla", "He speaks calmly and helps her."),
    ("Bored with the project", "He is ready to pour the vinegar.")],
   "The stage direction says he speaks “calmly,” and he says, “It will work.”",
   "Stage directions and dialogue both show a character’s feelings.", P8)
mc("character-perspective", "RL.5.6", 3, "How is Layla’s perspective different from Yusuf’s at the start of the play?",
   "Layla worries the volcano will fail; Yusuf trusts their testing.",
   [("Layla is confident; Yusuf is worried.", "It is the other way around."),
    ("Both think the volcano will fail.", "Yusuf says, “It will work.”"),
    ("Both are bored by the science fair.", "Both care about the fair.")],
   "Layla paces and wrings her hands; Yusuf calmly points to their three tests.",
   "Compare how two characters see the same situation.", P8)
mc("character-perspective", "RL.5.6", 4, "How does Layla’s perspective change by the end of the play?",
   "She learns to stay calm and check each step.",
   [("She decides science is too stressful.", "She laughs and gives a positive lesson."),
    ("She blames Yusuf for the problem.", "She forgot the baking soda herself."),
    ("She thinks the judges were unfair.", "The judges have not judged unfairly.")],
   "Her last line is, “You check every step, and you never panic.”",
   "A character’s last words often show how their perspective changed.", P8)
mc("character-perspective", "RL.5.6", 5, "From whose point of view is “The Two Wells” told?",
   "A third-person narrator who is not a character",
   [("Salma, using “I”", "The story uses “she” for Salma, not “I.”"),
    ("Hamdan, using “I”", "Hamdan is described as “he.”"),
    ("Salma’s grandmother", "The grandmother does not narrate.")],
   "The narrator uses “she,” “he” and “they,” so it is third person.",
   "First person uses I/we; third person uses he/she/they.", P7)
mc("character-perspective", "RL.5.6", 6, "How would “The Two Wells” be different if Hamdan told it?",
   "Readers would learn his reasons for building the wall and how he felt when no one came.",
   [("The villagers would not find the new well.", "The events stay the same."),
    ("Salma would become the merchant.", "Characters keep their roles."),
    ("The story would take place in a city.", "The narrator does not change the setting.")],
   "A first-person narrator shares their own thoughts, so we would hear Hamdan’s side.",
   "Changing the narrator changes whose thoughts and feelings the reader sees.", P7)
tf("character-perspective", "RL.5.6", 3, "At the end of “The Last Repair,” the captain’s smile shows that he is pleased.", True,
   "The text says, “the captain’s smile told him everything,” meaning he was happy with the repair.",
   "Characters’ expressions can show their perspective without words.", P6)

# ------------------------------------------------ author's claim (RI.5.8)

mc("author-claim", "RI.5.8", 2, "What is the author’s main claim in “Every School Needs a Garden”?",
   "Every school should have a garden where students grow food.",
   [("Tomatoes from stores taste better.", "The author suggests the opposite."),
    ("Gardens are too expensive for schools.", "The author argues against this view."),
    ("Students should only learn indoors.", "The author calls the garden an outdoor classroom.")],
   "The first sentence states the claim directly.",
   "A claim is the main point an author wants you to agree with.", P9)
mc("author-claim", "RI.5.8", 3, "Which reason supports the claim that gardens make lessons real?",
   "Students practice math by measuring plant growth.",
   [("Families can volunteer on weekends.", "This supports the community reason."),
    ("Children are more willing to taste vegetables.", "This supports the health reason."),
    ("Schools spend money on computers.", "This is not a reason about lessons.")],
   "Measuring growth is a real math activity, which supports the first reason.",
   "Match each piece of evidence to the reason it supports.", P9)
match("author-claim", "RI.5.8", 4, "Match each reason in the article with its supporting detail.",
      [("Gardens make lessons real", "Measuring growth practices math"),
       ("Gardens help students eat better", "Children taste vegetables they grew"),
       ("Gardens bring people together", "Families volunteer on weekends")],
      "Each paragraph gives one reason followed by a detail that supports it.",
      "In an argument, reasons are supported by evidence or examples.", passage=P9)
mc("author-claim", "RI.5.8", 4, "How does the author respond to people who say gardens cost too much?",
   "By explaining that gardens can start small with containers and donated seeds",
   [("By agreeing that gardens should be canceled", "The author still supports gardens."),
    ("By saying money does not matter at all", "The author gives a practical answer about cost."),
    ("By ignoring the objection completely", "The author directly addresses it.")],
   "The author presents the counterclaim and then answers it with a low-cost solution.",
   "Strong arguments respond to the opposing side (a counterclaim).", P9)
mc("author-claim", "RI.5.8", 5, "Which piece of evidence is the WEAKEST support for the claim?",
   "“A tomato you have watered for weeks is much more interesting than one from a store shelf.”",
   [("“When students measure plant growth, they practice math.”", "This is a clear, specific example."),
    ("“Teachers… often report that students remember these lessons longer.”", "This is evidence from teachers’ reports."),
    ("“Older students can teach younger ones how to plant seeds.”", "This is a specific example of cooperation.")],
   "Saying a tomato is “more interesting” is an opinion, not evidence that can be checked.",
   "Evidence is stronger when it can be checked; opinions are weaker support.", P9)
tf("author-claim", "RI.5.8", 3, "The author of “Every School Needs a Garden” includes an opposing view.", True,
   "The paragraph beginning “Some people argue…” presents the opposing view.",
   "Look for signal words like “some people argue” or “however.”", P9)

# -------------------------------------------- author's perspective (RI.5.6, RI.5.8)

mc("author-perspective", "RI.5.6", 2, "How does the author of “Every School Needs a Garden” feel about school gardens?",
   "Strongly in favor of them",
   [("Against them", "The author argues for gardens throughout."),
    ("Unsure about them", "The author makes a confident claim."),
    ("Bored by them", "The author is enthusiastic.")],
   "The author says every school “should” have a garden and gives three reasons.",
   "An author’s perspective is their attitude or point of view about a topic.", P9)
mc("author-perspective", "RI.5.6", 3, "Which phrase BEST shows the author’s positive perspective?",
   "“some of the best lessons grow from the ground up”",
   [("“a few plants in the ground”", "This phrase is neutral."),
    ("“donated seeds”", "This is a plain fact."),
    ("“Some people argue that gardens cost too much”", "This is the opposing view.")],
   "Calling garden lessons “some of the best” shows strong approval.",
   "Look for words that show the author’s feelings.", P9)
mc("author-perspective", "RI.5.6", 4, "How is the perspective in “Every School Needs a Garden” different from “Sea Turtles of the Red Sea”?",
   "The garden article tries to persuade; the turtle article mainly informs.",
   [("Both articles try to persuade readers.", "The turtle article mainly gives facts."),
    ("The turtle article argues against gardens.", "It does not mention gardens."),
    ("Both articles are told by a character.", "Neither has a character narrator.")],
   "The garden text makes a claim with reasons; the turtle text explains facts with headings.",
   "Compare the author’s purpose and attitude in each text.", PAIR)

mc("author-perspective", "RI.5.8", 5, "Why does the author compare spending on books and computers with spending on a garden?",
   "To suggest that a garden is as worthy an investment as other school materials",
   [("To argue that schools should stop buying books", "The author does not oppose books."),
    ("To show that computers are better than gardens", "The author says schools should ALSO invest in gardens."),
    ("To explain how much a garden costs", "No cost is given.")],
   "The final paragraph places gardens alongside books and computers as worth paying for.",
   "Authors use comparisons to strengthen their perspective.", P9)
tf("author-perspective", "RI.5.6", 2, "An author’s perspective can be found in the words the author chooses.", True,
   "Word choice, such as “best” or “should,” reveals how an author feels.",
   "Notice strong or emotional words.")
mc("author-perspective", "RI.5.8", 6, "Which sentence would an author with the OPPOSITE perspective most likely write?",
   "School time is limited, so it should be spent on core subjects indoors.",
   [("Gardens help students eat better.", "This agrees with the original author."),
    ("Families enjoy volunteering in school gardens.", "This supports gardens."),
    ("Even a sunny corner can become a place to learn.", "This is from the original argument.")],
   "This sentence argues against gardens, so it shows an opposing perspective.",
   "An opposing perspective disagrees with the author’s claim.", P9)

# ----------------------------------------------- text features (RI.5.7)

mc("text-features", "RI.5.7", 2, "Which heading would help you find out how hatchlings reach the sea?",
   "From Egg to Ocean",
   [("Where Turtles Nest", "This section is about nesting beaches."),
    ("Did You Know?", "This sidebar is about sand temperature."),
    ("Glossary", "The glossary defines a word.")],
   "“From Egg to Ocean” describes the eggs hatching and the hatchlings leaving the nest.",
   "Headings tell you what each section is about.", P10)
mc("text-features", "RI.5.7", 2, "Where can you find the meaning of “hatchling”?",
   "In the glossary",
   [("In the caption", "The caption describes a photograph."),
    ("In the sidebar", "The sidebar gives an extra fact."),
    ("In the heading “Dangers on the Beach”", "That heading names a section.")],
   "The glossary at the end gives the meaning of “hatchling.”",
   "A glossary defines important words from the text.", P10)
mc("text-features", "RI.5.7", 3, "What does the caption add to the article?",
   "It explains what the photograph shows.",
   [("It lists the dangers turtles face.", "That is in the section “Dangers on the Beach.”"),
    ("It tells how many eggs turtles lay.", "That is in the main text."),
    ("It defines a difficult word.", "That is the glossary’s job.")],
   "A caption is a short description next to a picture.",
   "Captions connect pictures to the text.", P10)
tf("text-features", "RI.5.7", 3, "The “Did You Know?” sidebar gives information that is NOT in the main sections.", True,
   "The fact about sand temperature appears only in the sidebar.",
   "Sidebars add interesting extra facts.", P10)
mc("text-features", "RI.5.7", 4, "How does the caption connect to the section “Dangers on the Beach”?",
   "It shows a hatchling moving toward the bright horizon, which explains how hatchlings find the sea.",
   [("It shows a beach covered in buildings.", "The caption describes a hatchling and the sea."),
    ("It shows a mother turtle laying eggs.", "The caption shows a hatchling."),
    ("It shows the glossary word.", "Captions describe pictures.")],
   "The section explains that hatchlings move toward the brightest horizon, which the photograph shows.",
   "Text features work together with the main text.", P10)
match("text-features", "RI.5.7", 5, "Match each text feature with its purpose.",
      [("Heading", "Tells what a section is about"),
       ("Caption", "Explains a photograph"),
       ("Sidebar", "Adds an extra interesting fact"),
       ("Glossary", "Defines important words")],
      "Each feature helps readers find or understand information in a different way.",
      "Ask: What job does this feature do for the reader?", passage=P10)

# ------------------------------- compare and contrast: text structure (RI.5.5)

mc("compare-contrast", "RI.5.5", 3, "How is “Every School Needs a Garden” organized?",
   "A claim, followed by reasons with evidence and a response to the other side",
   [("Events in the order they happened", "It is an argument, not a story in time order."),
    ("Sections with headings about one animal", "That describes the turtle article."),
    ("A problem with one solution", "It argues for gardens rather than solving one problem.")],
   "The article states a claim, gives first, second and third reasons, answers a counterclaim, and concludes.",
   "Argumentative texts use a claim-and-reasons structure.", P9)
mc("compare-contrast", "RI.5.5", 4, "How is the structure of “Sea Turtles of the Red Sea” different from “Every School Needs a Garden”?",
   "The turtle article uses headings to describe facts; the garden article uses reasons to persuade.",
   [("Both use reasons to persuade.", "The turtle article informs, it does not persuade."),
    ("Both tell a story with characters.", "Neither is a story."),
    ("The garden article uses headings; the turtle article does not.", "It is the other way around.")],
   "The turtle text is organized by topic headings; the garden text by claim and reasons.",
   "Compare how each author organizes information.", PAIR)

tf("compare-contrast", "RI.5.5", 2, "The section “From Egg to Ocean” is mostly organized in time order.", True,
   "It moves from laying eggs, to two months in the sand, to hatchlings digging out.",
   "Different sections of one text can use different structures.", P10)
mc("compare-contrast", "RI.5.5", 5, "Which structure does the section “Dangers on the Beach” use?",
   "Cause and effect",
   [("Chronological order", "It does not follow events over time."),
    ("Compare and contrast", "It does not compare two things."),
    ("Problem and solution", "It explains a danger but gives no solution.")],
   "Bright lights (cause) confuse hatchlings so they crawl the wrong way (effect).",
   "Signal words such as “can confuse” and “may” show causes and effects.", P10)
ms("compare-contrast", "RI.5.5", 5, "Which TWO statements about both articles are true?",
   ["Both give information about a real-world topic.", "Both use paragraphs to group related ideas."],
   [("Both use a sidebar.", "Only the turtle article has a sidebar."),
    ("Both answer an opposing argument.", "Only the garden article does this.")],
   "Both are nonfiction texts organized into paragraphs, but only one has text features and only one argues.",
   "Find what the texts share before listing differences.", PAIR)

mc("compare-contrast", "RI.5.5", 6, "Why did the author of the turtle article choose headings instead of a claim and reasons?",
   "Because the purpose is to inform readers about different parts of the topic",
   [("Because the author wanted to persuade readers to buy turtles", "The article does not persuade."),
    ("Because headings make articles longer", "Structure is chosen for purpose, not length."),
    ("Because turtles cannot be argued about", "Any topic can be argued; the purpose here is to inform.")],
   "Headings let readers find information about nesting, hatching and dangers quickly.",
   "An author’s purpose shapes the structure of a text.", P10)

# --------------------------------------------------- imagery (RL.5.4)

mc("imagery", "RL.5.4", 2, "Which sense does “the bread oven breathes, warm and red” appeal to most?",
   "Touch (feeling warmth) and sight",
   [("Taste only", "Bread is mentioned, but the line describes warmth and color."),
    ("Hearing only", "There is no sound in this line."),
    ("Smell only", "The line focuses on warmth and redness.")],
   "“Warm” appeals to touch, and “red” appeals to sight.",
   "Imagery uses details that appeal to the five senses.", P11)
mc("imagery", "RL.5.4", 3, "Which line from “Harbor at Dawn” appeals to the sense of smell?",
   "“salt and diesel ride the breeze”",
   [("“Gulls stitch the sky with silver thread”", "This appeals to sight."),
    ("“Ropes creak like old men’s knees”", "This appeals to hearing."),
    ("“the last stars folding up the night”", "This appeals to sight.")],
   "You can smell salt and diesel fuel carried on the wind.",
   "Ask which sense each image uses.", P11)
mc("imagery", "RL.5.4", 4, "What does “Gulls stitch the sky with silver thread” help you picture?",
   "Birds flying back and forth, flashing silver in the light",
   [("Birds sewing clothes", "The image is a metaphor, not literal sewing."),
    ("A storm with lightning", "Nothing suggests a storm."),
    ("Gulls sleeping on a boat", "“Stitch” suggests movement.")],
   "Like a needle going in and out, the gulls dart across the sky, catching silver light.",
   "Imagery often uses figurative language to create a picture.", P11)
tf("imagery", "RL.5.4", 3, "“Ropes creak like old men’s knees” appeals to the sense of hearing.", True,
   "A creak is a sound, and the comparison helps you hear it.",
   "Sound words such as creak, buzz and hiss create hearing images.", P11)
match("imagery", "RL.5.4", 5, "Match each image from the poem with the sense it appeals to most.",
      [("salt and diesel ride the breeze", "Smell"), ("Ropes creak", "Hearing"),
       ("pearl-gray light", "Sight"), ("the bread oven breathes, warm", "Touch")],
      "Each image uses a different sense to bring the harbor to life.",
      "Read each image and ask: Do I see, hear, smell, taste or feel this?", passage=P11)
mc("imagery", "RL.5.4", 6, "What overall mood does the imagery in “Harbor at Dawn” create?",
   "A calm, sleepy morning slowly waking up",
   [("A frightening, dangerous night", "The poem describes dawn and gentle sounds."),
    ("A loud, busy afternoon", "It is dawn and things are just waking."),
    ("A sad farewell at sunset", "The poem is about morning.")],
   "Words like “yawns,” “sleep” and “pearl-gray light” suggest a quiet morning waking up.",
   "The images together create the mood of a poem.", P11)

# --------------------------------------------------- visualize (RL.5.7)

mc("visualize", "RL.5.7", 2, "Which stage direction helps you picture Layla’s nervousness?",
   "[LAYLA paces back and forth.]",
   [("[A clay volcano sits on a table.]", "This describes the setting."),
    ("[MS. DAWOOD walks in with a clipboard.]", "This shows the teacher arriving."),
    ("[Red foam bubbles up.]", "This shows the experiment working.")],
   "Pacing back and forth is a picture of someone who is nervous.",
   "Stage directions help readers visualize characters’ actions.", P8)
mc("visualize", "RL.5.7", 3, "What should you picture when you read “Red foam bubbles up and spills down the sides”?",
   "Foam rising from the volcano and running down it",
   [("The volcano breaking into pieces", "Nothing breaks."),
    ("Smoke filling the classroom", "The text describes foam, not smoke."),
    ("Water dripping from the ceiling", "The foam comes from the volcano.")],
   "The verbs “bubbles up” and “spills down” show the foam moving.",
   "Strong verbs help you create a moving picture in your mind.", P8)
tf("visualize", "RL.5.7", 2, "In “The Last Repair,” the description “a silver curl no bigger than a fingernail” helps you picture the spring’s size.", True,
   "Comparing it to a fingernail shows how tiny it is.",
   "Comparisons to familiar objects help you visualize size.", P6)
mc("visualize", "RL.5.7", 4, "Which detail helps you visualize Khalid’s panic?",
   "He swept his hands across the bench, knocking a box of screws to the floor.",
   [("He had opened the watch and cleaned every gear.", "This shows careful work, not panic."),
    ("He closed the case and wound the crown.", "This shows success."),
    ("He picked up the magnifying glass.", "This shows calm searching.")],
   "Sweeping hands and screws scattering show rushed, panicked movement.",
   "Look for actions that show feelings.", P6)
mc("visualize", "RL.5.7", 5, "Reading the play aloud, how should the actor playing Layla say “The baking soda… is still in my backpack”?",
   "Slowly and with embarrassment, pausing at the dots",
   [("Loudly and angrily", "She realizes her own mistake, so anger does not fit."),
    ("Quickly and excitedly", "The ellipsis shows a slow, hesitant pause."),
    ("In a whisper of fear", "She is embarrassed, not frightened.")],
   "The ellipsis (…) and the direction “slowly lowering her hands” suggest a slow, embarrassed realization.",
   "Visualizing a scene includes imagining how lines are spoken.", P8)
mc("visualize", "RL.5.7", 6, "How does visualizing the two scenes help you understand the play?",
   "You can see Layla change from panicked pacing to proudly standing beside the volcano.",
   [("You can see that Ms. Dawood is the main character.", "Layla is the main character."),
    ("You can see that the volcano never works.", "It works in Scene 2."),
    ("You can see that Yusuf leaves the room.", "Yusuf stays in both scenes.")],
   "Picturing the actions in each scene shows Layla’s growth from Scene 1 to Scene 2.",
   "Picture how characters look and move at different points in the story.", P8)

# ------------------------------------------------ summarize (RL.5.2, RI.5.2)

mc("summarize", "RL.5.2", 3, "Which is the BEST summary of “The Two Wells”?",
   "When a merchant charges for the only well, Salma finds a new well, and the merchant learns to share.",
   [("Salma’s hands blistered after seven days.", "This is a detail, not a summary."),
    ("The village had palm trees and a well.", "This leaves out the conflict and resolution."),
    ("Hamdan was rich and had a gate.", "This leaves out what happened.")],
   "A summary includes the problem, the key events and the resolution.",
   "Include the main character, the problem and the outcome.", P7)
mc("summarize", "RI.5.2", 3, "Which sentence BEST summarizes “Sea Turtles of the Red Sea”?",
   "Red Sea turtles nest on beaches, their hatchlings head to the sea, and bright lights can confuse them.",
   [("A hatchling is a young animal just out of its egg.", "This is the glossary definition."),
    ("Warmer nests produce more females.", "This is one sidebar fact."),
    ("Turtles have back flippers.", "This is a small detail.")],
   "The summary covers each main section: nesting, hatching and dangers.",
   "Use the headings to identify the main ideas to summarize.", P10)
tf("summarize", "RL.5.2", 2, "A summary of “The Last Repair” should include what kind of fabric Khalid’s apron is made of.", False,
   "The fabric is not important and is not even mentioned; the apron matters only because the spring is found there.",
   "Summaries leave out small details.", P6)
mc("summarize", "RI.5.2", 4, "Which detail should be LEFT OUT of a summary of “Every School Needs a Garden”?",
   "A tomato you have watered for weeks is more interesting.",
   [("Gardens make lessons real.", "This is a main reason."),
    ("Gardens help students eat better.", "This is a main reason."),
    ("Gardens can start small to save money.", "This answers the counterclaim.")],
   "The tomato line is a vivid example, not one of the main reasons.",
   "Keep the claim and main reasons; drop examples and descriptions.", P9)
order("summarize", "RL.5.2", 5, "Put these sentences in order to summarize “The Last Repair.”",
      ["Khalid must fix a captain’s watch before sunset.", "He loses a tiny spring and panics.",
       "He remembers his uncle’s lesson about patience.", "He finds the spring and finishes just in time."],
      "These four sentences give the beginning, problem, turning point and resolution.",
      "A story summary follows the plot from beginning to end.", P6)
mc("summarize", "RI.5.2", 6, "A student summarized the garden article as “Gardens are great and everyone loves them.” What is the main problem with this summary?",
   "It adds an opinion and leaves out the author’s actual reasons.",
   [("It is too long.", "It is very short."),
    ("It includes too many facts.", "It includes no facts."),
    ("It uses the author’s exact words.", "It does not quote the author.")],
   "A summary should state the author’s claim and main reasons, not a general opinion.",
   "Summaries are objective and include the main ideas.", P9)

# ---------------------------------------------------- reread (RI.5.1)

mc("reread", "RI.5.1", 2, "You are unsure why hatchlings crawl the wrong way. Which section should you reread?",
   "Dangers on the Beach",
   [("Where Turtles Nest", "This section is about nesting beaches."),
    ("Glossary", "The glossary defines a word."),
    ("The title", "The title does not explain the danger.")],
   "This section explains that bright lights confuse hatchlings.",
   "Use headings to choose which part to reread.", P10)
tf("reread", "RI.5.1", 2, "Rereading can help you notice how one paragraph connects to another.", True,
   "A second reading often reveals connections you missed the first time.",
   "Reread slowly and look for links between ideas.")
mc("reread", "RI.5.1", 3, "After rereading “Every School Needs a Garden,” a student understands why the author mentions “donated seeds.” What did rereading help the student see?",
   "The detail answers the claim that gardens cost too much.",
   [("The author wants students to sell seeds.", "Nothing suggests selling seeds."),
    ("Seeds grow faster when donated.", "This is not stated."),
    ("Gardens need no seeds at all.", "The text mentions seeds as a cheap way to start.")],
   "The donated seeds appear in the paragraph that responds to the cost argument.",
   "Reread to understand why the author includes a detail.", P9)
mc("reread", "RI.5.1", 4, "Which question would rereading the first section of the turtle article help you answer?",
   "Which kinds of turtles swim in the Red Sea?",
   [("How long do eggs stay in the sand?", "That is in “From Egg to Ocean.”"),
    ("Why do bright lights confuse hatchlings?", "That is in “Dangers on the Beach.”"),
    ("What does “hatchling” mean?", "That is in the glossary.")],
   "The first section names green turtles and hawksbill turtles.",
   "Know which section answers which question.", P10)
mc("reread", "RI.5.1", 5, "A reader thinks the turtle article says lights help hatchlings. What should the reader do?",
   "Reread the section about dangers to check the information.",
   [("Trust their memory and move on.", "Their memory is wrong; checking would show it."),
    ("Read a different article.", "This article has the answer."),
    ("Look only at the caption.", "The caption alone does not explain the effect of lights.")],
   "Rereading would show that lights confuse hatchlings; they do not help.",
   "Reread to check facts when you are not sure.", P10)
ms("reread", "RI.5.1", 6, "Which TWO details would a careful reread of “From Egg to Ocean” reveal?",
   ["The eggs stay in the sand for about two months.", "Hatchlings usually dig out at night."],
   [("The mother turtle stays to protect the nest.", "She returns to the sea."),
    ("Hatchlings follow their mother to the water.", "They follow the bright horizon.")],
   "Both correct details are stated in the section; the others contradict it.",
   "Rereading helps you separate what the text says from what you assume.", P10)

# ---------------------------------------- ask and answer questions (RI.5.1)

mc("ask-answer-questions", "RI.5.1", 2, "Which question is answered in the sidebar of the turtle article?",
   "What affects whether hatchlings become males or females?",
   [("Where do turtles nest?", "That is answered in the first section."),
    ("How many eggs does a turtle lay?", "That is answered in “From Egg to Ocean.”"),
    ("What is a caption?", "The article does not define caption.")],
   "The sidebar says the temperature of the sand affects this.",
   "Match questions to the part of the text that answers them.", P10)
mc("ask-answer-questions", "RI.5.1", 3, "Which question can be answered by quoting the garden article directly?",
   "What does the author suggest for schools with little money?",
   [("How many schools have gardens?", "No number is given."),
    ("What does the author’s school garden look like?", "The author does not describe a specific garden."),
    ("Which vegetables grow fastest?", "Growth speed is not discussed.")],
   "The text says gardens can start “with a few containers and donated seeds.”",
   "Ask questions that the text can answer with evidence.", P9)
tf("ask-answer-questions", "RI.5.1", 3, "The turtle article explains exactly how many hatchlings survive to adulthood.", False,
   "The article does not give survival numbers; you would need another source.",
   "Notice when a text does NOT answer your question.", P10)
mc("ask-answer-questions", "RI.5.1", 4, "A reader asks, “Why do hatchlings move toward the horizon?” Which sentence answers this?",
   "Hatchlings find the sea by moving toward the brightest horizon, which is normally the moonlit water.",
   [("Green turtles and hawksbill turtles swim in the warm waters of the Red Sea.", "This does not explain the movement."),
    ("She covers the nest and returns to the sea.", "This is about the mother."),
    ("Warmer nests produce more females.", "This is about temperature.")],
   "The sentence explains that the bright horizon leads them to the sea.",
   "Use the question’s key words to find the answer.", P10)
mc("ask-answer-questions", "RI.5.1", 5, "Which question shows the DEEPEST thinking about the garden article?",
   "Would the author’s reasons work for a school in a very dry climate?",
   [("What is the title?", "This is a simple recall question."),
    ("How many reasons are there?", "This only counts."),
    ("Who argues that gardens cost too much?", "The text says only “some people.”")],
   "This question applies the author’s ideas to a new situation.",
   "Strong readers ask questions that go beyond recall.", P9)
mc("ask-answer-questions", "RI.5.1", 6, "Which inference is BEST supported by the turtle article?",
   "Keeping beaches dark at night could help more hatchlings reach the sea.",
   [("Turtles prefer cold beaches.", "The article says warmer sand produces more females, not that turtles prefer cold."),
    ("Hatchlings are never in danger.", "The article describes dangers."),
    ("Hawksbill turtles do not lay eggs.", "Both species nest on beaches.")],
   "If bright lights confuse hatchlings, darker beaches would help them find the moonlit water.",
   "Combine details from the text to answer a question it does not state directly.", P10)

# ============================================================ grammar & language

# ----------------------------------------------------------- sentences (L.5.1)

mc("sentences", "L.5.1", 1, "Which group of words is a complete sentence?",
   "The new library opens on Sunday.",
   [("Opens on Sunday.", "This fragment has no subject."),
    ("The new library on Sunday.", "This fragment has no verb."),
    ("Because the library opens.", "This dependent clause is not a complete thought.")],
   "It has a subject (The new library) and a predicate (opens on Sunday) and expresses a complete thought.",
   "A sentence needs a subject, a verb and a complete thought.")
dd("sentences", "L.5.1", 2, "Choose the end mark: “Have you ever seen a shooting star____”",
   "?",
   [(".", "This sentence asks something, so it needs a question mark."),
    (",", "A comma cannot end a sentence."),
    (";", "A semicolon cannot end a sentence.")],
   "“Have you ever…” asks a question, so it ends with a question mark.",
   "Statements end with periods; questions end with question marks.")
mc("sentences", "L.5.1", 3, "Which interrogative word best begins this question? “____ did the museum close early today?”",
   "Why",
   [("Who", "“Who” asks about a person, not a reason."),
    ("Which", "“Which” needs a noun after it here."),
    ("Whose", "“Whose” asks about ownership.")],
   "The question asks for a reason, so “Why” fits.",
   "Interrogatives: who (person), what (thing), when (time), where (place), why (reason), how (manner).")
mc("sentences", "L.5.1", 4, "Which sentence uses an appositive correctly?",
   "Ms. Rahma, our librarian, ordered new atlases.",
   [("Ms. Rahma our librarian, ordered new atlases.", "The appositive needs a comma on both sides."),
    ("Ms. Rahma, our librarian ordered new atlases.", "The appositive needs a closing comma."),
    ("Our librarian Ms. Rahma, ordered, new atlases.", "The commas are in the wrong places.")],
   "An appositive that renames a noun in the middle of a sentence is set off by commas on both sides.",
   "Appositives explain a nearby noun and are usually set off with commas.")
dd("sentences", "L.5.1", 5, "Choose the correct form: “Of all the players, Majed had the ____ score.”",
   "best",
   [("bestest", "Never add -est to an irregular superlative."),
    ("most best", "Never add “most” to “best.”"),
    ("better", "“Better” compares two; this compares all the players.")],
   "“Best” is the superlative of “good,” used when comparing more than two.",
   "good → better → best; bad → worse → worst.")
err("sentences", "L.5.1", 6, ["This year’s weather", " was", " more worse", " than last year’s."], 2, " worse",
    "“Worse” is already the comparative form of “bad,” so “more” must be removed.",
    "Never add more or most to an irregular comparative form.")

# ------------------------------------------- subjects and predicates (L.5.1)

mc("subjects-predicates", "L.5.1", 2, "What is the complete predicate? “The friendly dog waited patiently for her owner.”",
   "waited patiently for her owner",
   [("The friendly dog", "This is the complete subject."),
    ("dog", "This is the simple subject."),
    ("her owner", "This is part of the predicate only.")],
   "The complete predicate includes the verb and all the words that tell about it.",
   "Complete predicate = everything that tells what the subject did or is.")
mc("subjects-predicates", "L.5.1", 3, "What is the simple subject? “Several excited volunteers from the museum cleaned the beach.”",
   "volunteers",
   [("excited", "This describes the volunteers."),
    ("museum", "This is part of a prepositional phrase."),
    ("beach", "This is part of the predicate.")],
   "Remove describing words and phrases; the main noun is “volunteers.”",
   "The simple subject is never inside a prepositional phrase.")
tf("subjects-predicates", "L.5.1", 3, "In “Under the old bridge lived a family of ducks,” the subject comes after the verb.", True,
   "The verb is “lived”; the subject “a family of ducks” comes after it.",
   "In inverted sentences, ask “Who or what lived?” to find the subject.")
mc("subjects-predicates", "L.5.1", 4, "Which sentence has BOTH a compound subject and a compound predicate?",
   "Reem and Dana wrote the script and directed the play.",
   [("Reem and Dana wrote the script.", "This has a compound subject only."),
    ("Reem wrote the script and directed the play.", "This has a compound predicate only."),
    ("Reem wrote the script, and Dana directed the play.", "This is a compound sentence.")],
   "Two subjects (Reem, Dana) share two predicates (wrote…, directed…).",
   "Find the subjects first, then the verbs.")
mc("subjects-predicates", "L.5.1", 5, "What is the simple predicate? “The students have been practicing their lines all week.”",
   "have been practicing",
   [("practicing", "The simple predicate includes the helping verbs."),
    ("their lines", "This is the object of the verb."),
    ("all week", "This tells when.")],
   "The simple predicate is the whole verb phrase: have been practicing.",
   "Include helping verbs in the simple predicate.")
fill("subjects-predicates", "L.5.1", 6, "Add a simple subject that makes sense: “At dawn, the hungry ____ chirped loudly in the nest.”",
     ["birds", "chicks", "sparrows", "baby birds", "nestlings", "bird", "chick", "robins", "pigeons", "finches"],
     "Something in a nest that chirps, such as “birds,” is a logical subject.",
     "The subject is who or what does the action.")

# -------------------------------------------- fragments and run-ons (L.5.1)

mc("fragments-run-ons", "L.5.1", 2, "Which is a run-on sentence?",
   "I went to the store it was closed.",
   [("I went to the store, but it was closed.", "This is a correct compound sentence."),
    ("I went to the store.", "This is a correct simple sentence."),
    ("When I went to the store.", "This is a fragment, not a run-on.")],
   "Two complete sentences are joined with no conjunction or punctuation.",
   "A run-on joins sentences without the proper conjunction and punctuation.")
mc("fragments-run-ons", "L.5.1", 3, "Which is a sentence fragment?",
   "After the long, rainy weekend.",
   [("The weekend was long and rainy.", "This is a complete sentence."),
    ("We stayed inside all weekend.", "This is a complete sentence."),
    ("It rained, so we played games.", "This is a compound sentence.")],
   "It has no subject and verb that complete a thought.",
   "A fragment leaves the reader asking, “What happened?”")
mc("fragments-run-ons", "L.5.1", 4, "Which is the best way to correct this run-on? “The museum was crowded we waited an hour.”",
   "The museum was crowded, so we waited an hour.",
   [("The museum was crowded, we waited an hour.", "A comma alone cannot join two sentences (comma splice)."),
    ("The museum was crowded we, waited an hour.", "The comma is in the wrong place."),
    ("The museum crowded we waited.", "This removes words and is still a run-on.")],
   "A comma plus the conjunction “so” correctly joins the two independent clauses.",
   "Fix run-ons with a period, or a comma plus and/but/or/so.")
tf("fragments-run-ons", "L.5.1", 3, "“Running down the hallway with a heavy backpack” is a complete sentence.", False,
   "It has no subject and no complete verb; it is a fragment.",
   "Ask: Who is running? A complete sentence would tell you.")
err("fragments-run-ons", "L.5.1", 5, ["Our team practiced hard", ", we", " won the", " championship."], 1, ", and we",
    "A comma alone cannot join two complete sentences; add a conjunction such as “and.”",
    "Two independent clauses need a comma AND a conjunction, or a period.")
mc("fragments-run-ons", "L.5.1", 6, "Which revision fixes BOTH problems? “Because the bus was late. We missed the start of the play we were upset.”",
   "Because the bus was late, we missed the start of the play. We were upset.",
   [("Because the bus was late. We missed the start of the play, we were upset.", "The fragment and a comma splice remain."),
    ("The bus was late we missed the start. Of the play we were upset.", "This creates new run-ons and fragments."),
    ("Because the bus was late, we missed the start of the play we were upset.", "The run-on at the end remains.")],
   "Attaching the fragment to the next clause and splitting the run-on fixes both errors.",
   "Fix fragments by joining them to a sentence; fix run-ons by separating or properly joining clauses.")

# ----------------------------------------------------- plural nouns (L.5.1, L.5.2)

dd("plural-nouns", "L.5.2", 1, "Choose the correct plural: “We packed our ____ for the trip.”",
   "lunches",
   [("lunchs", "Nouns ending in ch add -es."),
    ("lunch’s", "An apostrophe shows possession, not a plural."),
    ("lunchies", "This is not a correct spelling.")],
   "Add -es to nouns ending in s, sh, ch or x: lunch → lunches.",
   "Words ending in s, sh, ch or x add -es.")
dd("plural-nouns", "L.5.2", 2, "Choose the correct plural: “The library has three ____ of that book.”",
   "copies",
   [("copys", "Consonant + y: change y to i and add -es."),
    ("copyes", "Change the y to i first."),
    ("copy’s", "An apostrophe does not form a plural.")],
   "Copy ends in a consonant + y, so change y to i and add -es: copies.",
   "Vowel + y → add s (keys). Consonant + y → ies (copies).")
dd("plural-nouns", "L.5.2", 3, "Choose the correct plural: “Autumn ____ covered the path.”",
   "leaves",
   [("leafs", "Leaf changes f to v and adds -es."),
    ("leafes", "The f must change to v."),
    ("leave", "This is a verb, not the plural of leaf.")],
   "Some nouns ending in f change the f to v and add -es: leaf → leaves.",
   "Watch for f/fe words: leaf/leaves, knife/knives, half/halves.")
mc("plural-nouns", "L.5.1", 4, "Which sentence uses an irregular plural correctly?",
   "Three deer drank from the stream.",
   [("Three deers drank from the stream.", "“Deer” stays the same in the plural."),
    ("The childs played in the yard.", "The plural of child is children."),
    ("My tooths are clean.", "The plural of tooth is teeth.")],
   "“Deer” is the same in singular and plural.",
   "Learn irregular plurals: deer, sheep, fish; tooth/teeth; child/children.")
match("plural-nouns", "L.5.2", 5, "Match each singular noun with its plural.",
      [("piano", "pianos"), ("potato", "potatoes"), ("monkey", "monkeys"), ("woman", "women")],
      "Some -o words add s, others add es; vowel + y adds s; woman is irregular.",
      "Check the letter before the final y or o.")
mc("plural-nouns", "L.5.1", 6, "Which sentence uses a collective noun with the correct verb?",
   "The orchestra plays every Thursday evening.",
   [("The orchestra play every Thursday evening.", "A collective noun acting as one group takes a singular verb."),
    ("The orchestras plays every Thursday evening.", "“Orchestras” is plural and needs “play.”"),
    ("The orchestra are playing every Thursday evening.", "When the group acts as a whole, use a singular verb.")],
   "“Orchestra” names one group acting together, so it takes the singular verb “plays.”",
   "Collective nouns (team, class, family) usually take singular verbs.")

# ----------------------------------------------------- possessive nouns (L.5.2)

dd("possessive-nouns", "L.5.2", 2, "Choose the correct possessive: “____ bicycle has a flat tire.”",
   "Lucas’s",
   [("Lucas", "The name needs to show ownership."),
    ("Luca’s", "The name is Lucas, not Luca."),
    ("Lucases", "This is a plural, not a possessive.")],
   "In your Wonders book, a name ending in s takes an apostrophe and s: Lucas’s.",
   "Names and singular nouns ending in s: add ’s (Lucas’s, the class’s).")
dd("possessive-nouns", "L.5.2", 3, "Choose the correct possessive: “The ____ final project won first prize.”",
   "class’s",
   [("classes", "This is plural, not possessive."),
    ("classes’", "This shows more than one class."),
    ("class", "It needs to show ownership.")],
   "One class owns the project; a singular noun ending in s adds ’s.",
   "Decide whether there is one owner or more than one.")
dd("possessive-nouns", "L.5.2", 3, "Choose the correct possessive: “The ____ uniforms were washed after the match.”",
   "athletes’",
   [("athlete’s", "This shows one athlete, but the uniforms belong to many."),
    ("athletes’s", "Plural nouns ending in s add only an apostrophe."),
    ("athletes", "This is plural, not possessive.")],
   "A plural noun ending in s adds only an apostrophe: athletes’.",
   "Plural ending in s → add only ’.")
mc("possessive-nouns", "L.5.2", 4, "Which phrase is written correctly?",
   "the people’s hometown",
   [("the peoples’ hometown", "“People” is already plural and does not end in s."),
    ("the peoples hometown", "An apostrophe is needed."),
    ("the people’s’ hometown", "Only one apostrophe is used.")],
   "Plural nouns that do not end in s add ’s: people’s.",
   "Irregular plurals (people, women, children, oxen) add ’s.")
err("possessive-nouns", "L.5.2", 5, ["The two", " authors", " books", " offer clues."], 2, " authors’ books",
    "The books belong to two authors, so the plural possessive is “authors’.”",
    "If a plural noun shows ownership, it needs an apostrophe.")
mc("possessive-nouns", "L.5.2", 6, "Which sentence correctly uses both a plural noun and a possessive noun?",
   "The atlas’s index lists all the islands.",
   [("The atlases index lists all the island’s.", "“Island’s” should be the plural “islands.”"),
    ("The atlas index list’s all the islands.", "“Lists” is a verb and needs no apostrophe."),
    ("The atla’s index lists all the islands.", "The word is “atlas,” so the possessive is “atlas’s.”")],
   "“Atlas’s” is a singular possessive; “islands” is a plain plural.",
   "Do not confuse plurals with possessives.")

# ------------------------------------- modals, contractions, its/it’s (L.5.2)

dd("apostrophes-contractions", "L.5.2", 1, "Choose the contraction for “are not”: “The shops ____ open on Fridays.”",
   "aren’t",
   [("arent", "The apostrophe is missing."),
    ("are’nt", "The apostrophe replaces the o in “not.”"),
    ("isn’t", "“Isn’t” means “is not.”")],
   "are + not → aren’t; the apostrophe replaces the o.",
   "The apostrophe goes where letters are left out.")
dd("apostrophes-contractions", "L.5.2", 2, "Choose the correct word: “____ going to love this museum!”",
   "You’re",
   [("Your", "“Your” shows ownership; the sentence needs “you are.”"),
    ("Youre", "The apostrophe is missing."),
    ("Yours", "“Yours” is a possessive pronoun.")],
   "You are → you’re. Test it: “You are going to love this museum.”",
   "Your = belongs to you; you’re = you are.")
mc("apostrophes-contractions", "L.5.2", 3, "Which word is a modal helping verb in “You should wear a helmet”?",
   "should",
   [("wear", "This is the main verb."),
    ("helmet", "This is a noun."),
    ("You", "This is a pronoun.")],
   "Modals such as can, could, may, might, must, should and would express possibility or obligation.",
   "A modal comes before the main verb and changes its meaning.")
mc("apostrophes-contractions", "L.5.2", 4, "Which modal shows that something is REQUIRED? “Visitors ____ show a ticket at the gate.”",
   "must",
   [("might", "“Might” shows possibility, not a requirement."),
    ("could", "“Could” shows ability or possibility."),
    ("may", "“May” shows permission or possibility.")],
   "“Must” expresses obligation.",
   "must = required; may/might = possible; can/could = able.")
dd("apostrophes-contractions", "L.5.2", 5, "Choose the correct pronoun: “The twins built the model by ____.”",
   "themselves",
   [("theirselves", "This is not a standard word."),
    ("themself", "The plural reflexive is “themselves.”"),
    ("their’s", "Possessive pronouns never use apostrophes.")],
   "Plural reflexive pronouns end in -selves: themselves.",
   "-self for one, -selves for more than one.")
err("apostrophes-contractions", "L.5.2", 6, ["The company", " lost", " it’s", " biggest customer."], 2, " its",
    "The customer belongs to the company, so the possessive “its” (no apostrophe) is needed.",
    "Possessive pronouns (its, yours, theirs) never use apostrophes.")

# ------------------------------------------------------- adjectives (L.5.1)

mc("adjectives", "L.5.1", 1, "Which word is an adjective? “The tiny kitten slept on the rug.”",
   "tiny",
   [("kitten", "This is a noun."),
    ("slept", "This is a verb."),
    ("on", "This is a preposition.")],
   "“Tiny” describes the kitten (what kind).",
   "Adjectives tell what kind, how many or how much.")
mc("adjectives", "L.5.1", 2, "Which sentence capitalizes the proper adjective correctly?",
   "We tasted delicious Lebanese bread.",
   [("We tasted delicious lebanese bread.", "Proper adjectives from place names are capitalized."),
    ("We tasted Delicious Lebanese bread.", "“Delicious” is a common adjective."),
    ("We tasted delicious Lebanese Bread.", "“Bread” is a common noun.")],
   "“Lebanese” comes from the proper noun Lebanon, so it is capitalized.",
   "Proper adjectives come from proper nouns.")
dd("adjectives", "L.5.1", 2, "Choose the article: “She ate ____ orange after lunch.”",
   "an",
   [("a", "Use “an” before a vowel sound."),
    ("the", "“The” points to a specific orange; any orange is meant here."),
    ("this", "“This” is a demonstrative adjective, not an article.")],
   "“Orange” begins with a vowel sound, so use “an.”",
   "a + consonant sound; an + vowel sound.")
dd("adjectives", "L.5.1", 3, "Choose the demonstrative adjective: “____ books right here on my desk are new.”",
   "These",
   [("Those", "“Those” points to things far away; “right here” shows they are near."),
    ("This", "“This” is singular; “books” is plural."),
    ("That", "“That” is singular and far.")],
   "Plural and near → “these.”",
   "this/these = near; that/those = far.")
mc("adjectives", "L.5.1", 4, "Which phrase lists the adjectives in the correct order?",
   "two beautiful old chairs",
   [("old two beautiful chairs", "Numbers come first."),
    ("beautiful two old chairs", "Numbers come before opinion words."),
    ("two old beautiful chairs", "Opinion comes before age.")],
   "The order is number, opinion, size, age, color: two (number) beautiful (opinion) old (age).",
   "Number → opinion → size → age → color.")
mc("adjectives", "L.5.1", 6, "Which sentence uses commas with adjectives correctly?",
   "Jorge played a quiet, gentle song on the oud.",
   [("Jorge played a quiet gentle, song on the oud.", "A comma never goes between the last adjective and the noun."),
    ("Jorge played three, quiet songs on the oud.", "A comma does not follow a number."),
    ("Jorge played a, quiet gentle song on the oud.", "No comma follows an article.")],
   "Two adjectives that equally describe the noun are separated by a comma.",
   "Test: if you can put “and” between the adjectives, use a comma.")

# ------------------------------------------------------ irregular verbs (L.5.1)

dd("irregular-verbs", "L.5.1", 1, "Choose the past tense: “Yesterday, Amal ____ the ball.”",
   "caught",
   [("catched", "“Catch” is irregular and does not add -ed."),
    ("catches", "This is present tense."),
    ("catching", "This needs a helping verb.")],
   "catch → caught.",
   "Irregular verbs do not add -ed in the past tense.")
dd("irregular-verbs", "L.5.1", 2, "Choose the past tense: “Last week, we ____ a new route to school.”",
   "chose",
   [("choosed", "“Choose” is irregular."),
    ("chosen", "“Chosen” needs a helping verb (have chosen)."),
    ("choose", "This is present tense.")],
   "choose → chose (past) → have chosen (past participle).",
   "Learn the three forms of irregular verbs.")
match("irregular-verbs", "L.5.1", 3, "Match each verb with its past tense.",
      [("bring", "brought"), ("begin", "began"), ("keep", "kept"), ("drink", "drank")],
      "Each of these verbs forms its past tense irregularly.",
      "Say “Yesterday I…” to test the past tense.")
dd("irregular-verbs", "L.5.1", 4, "Choose the correct form: “By noon, the guests had ____ all the dates.”",
   "eaten",
   [("ate", "After “had,” use the past participle."),
    ("eated", "This is not a word."),
    ("eat", "After “had,” use the past participle.")],
   "had + past participle: had eaten.",
   "Past tense stands alone (ate); the past participle follows have/has/had (eaten).")
err("irregular-verbs", "L.5.1", 5, ["The leaves", " falled", " from the trees", " in the strong wind."], 1, " fell",
    "“Fall” is irregular: the past tense is “fell.”",
    "If a past tense sounds strange with -ed, check whether the verb is irregular.")
mc("irregular-verbs", "L.5.1", 6, "Which sentence uses irregular verbs correctly?",
   "She knew the answer because she had read the chapter twice.",
   [("She knowed the answer because she had readed the chapter twice.", "Know → knew; read → read."),
    ("She knew the answer because she had red the chapter twice.", "“Red” is a color; the past of read is spelled “read.”"),
    ("She known the answer because she had read the chapter twice.", "“Known” needs a helping verb.")],
   "knew (past of know) and had read (past participle of read) are both correct.",
   "Some irregular verbs, like read, keep the same spelling but change pronunciation.")

# --------------------------------------------------------- negatives (L.5.1)

mc("negatives", "L.5.1", 2, "Which sentence uses negatives correctly?",
   "I didn’t do anything wrong.",
   [("I didn’t do nothing wrong.", "This is a double negative."),
    ("I didn’t never do anything wrong.", "This has two negatives."),
    ("I not did nothing wrong.", "This has two negatives and wrong word order.")],
   "Use only one negative per clause: “didn’t” + the positive word “anything.”",
   "Do not use two negatives in the same clause.")
dd("negatives", "L.5.1", 2, "Choose the correct word: “Nobody ____ where the key is.”",
   "knows",
   [("doesn’t know", "“Nobody” is already negative, so this makes a double negative."),
    ("don’t know", "This is a double negative and does not agree with “Nobody.”"),
    ("never knows", "“Nobody” and “never” are two negatives.")],
   "“Nobody knows” has one negative, which is correct.",
   "Negative words include no, not, nobody, nothing, never, no one and nowhere.")
tf("negatives", "L.5.1", 3, "“We don’t want to go nowhere today” is correct.", False,
   "It is a double negative. Correct: “We don’t want to go anywhere today.”",
   "Replace one negative with its positive form.")
dd("negatives", "L.5.1", 4, "Choose the correct word: “There isn’t ____ milk left in the fridge.”",
   "any",
   [("no", "“Isn’t” + “no” is a double negative."),
    ("none", "“Isn’t” + “none” is a double negative."),
    ("nothing", "This creates a double negative.")],
   "“Isn’t” is already negative, so use the positive word “any.”",
   "After a negative verb, use any, anything, anyone, ever or anywhere.")
err("negatives", "L.5.1", 5, ["The new student", " hasn’t", " met nobody", " in our class yet."], 2, " met anybody",
    "“Hasn’t” is negative, so the second word must be positive: “anybody.”",
    "Check each clause for more than one negative word.")
mc("negatives", "L.5.1", 6, "Which pair of revisions BOTH correct “She never says nothing in class”?",
   "“She never says anything in class” or “She says nothing in class”",
   [("“She never doesn’t say anything in class” or “She says nothing never”", "Both still have two negatives."),
    ("“She always says nothing” or “She never says nothing”", "The second one still has a double negative."),
    ("“She doesn’t never say anything” or “She never says nothing”", "Both have double negatives.")],
   "Remove one negative (says nothing) or change one to a positive (never says anything).",
   "A double negative can be fixed two ways: remove one negative, or make it positive.")

# ----------------------------------------------------- capitalization (L.5.2.a)

mc("capitalization", "L.5.2.a", 1, "Which sentence is capitalized correctly?",
   "We visited Riyadh in March.",
   [("We visited riyadh in March.", "City names are proper nouns."),
    ("We visited Riyadh in march.", "Months are capitalized."),
    ("we visited Riyadh in March.", "The first word of a sentence is capitalized.")],
   "Cities, months and the first word of a sentence are capitalized.",
   "Capitalize names of places, days, months and holidays.")
mc("capitalization", "L.5.2.a", 2, "Which group of words is capitalized correctly?",
   "the Red Sea, the Battle of Badr, Saudi National Day",
   [("the red sea, the Battle of Badr, Saudi National Day", "“Red Sea” is a geographical name."),
    ("the Red Sea, the battle of badr, Saudi National Day", "Historical events are capitalized."),
    ("the Red Sea, the Battle of Badr, saudi national day", "Holidays are capitalized.")],
   "Geographical names, historical events and holidays are all proper nouns.",
   "Capitalize each important word in a multi-word proper noun.")
mc("capitalization", "L.5.2.a", 3, "Which abbreviation is written correctly?",
   "Dr. A.K. Hamdi",
   [("dr. A.K. Hamdi", "Titles are capitalized."),
    ("Dr A K Hamdi", "Titles and initials end with periods."),
    ("Dr. a.k. Hamdi", "Initials are capitalized.")],
   "Titles and initials are capitalized and end with a period.",
   "Initial = first letter of a name, capitalized with a period.")
tf("capitalization", "L.5.2.a", 3, "Acronyms such as NASA and the UN are usually written in all capital letters without periods.", True,
   "This matches the rule for acronyms in your grammar book.",
   "Acronyms are formed from the first letters of words in a name.")
mc("capitalization", "L.5.2.a", 4, "Which closing for a letter is capitalized correctly?",
   "Best wishes,",
   [("Best Wishes,", "Capitalize only the first word of a closing."),
    ("best wishes,", "The first word must be capitalized."),
    ("BEST WISHES,", "Only the first word is capitalized.")],
   "In a closing, capitalize only the first word.",
   "Greeting: capitalize the first word and names. Closing: first word only.")
err("capitalization", "L.5.2.a", 6, ["Last thurs.,", " Mrs. Jackson", " read an article", " about the American Heart Association."], 0, "Last Thurs.,",
    "Abbreviations of days are capitalized: Thurs.",
    "Abbreviations of proper nouns keep their capital letters.")

# -------------------------------------------- quotations and dialogue (L.5.2.b)

mc("quotations-dialogue", "L.5.2.b", 2, "Which sentence is punctuated correctly?",
   "“I finished my project,” said Nouf.",
   [("“I finished my project” said Nouf.", "A comma is needed before the closing quotation mark."),
    ("“I finished my project”, said Nouf.", "The comma goes inside the closing quotation marks."),
    ("I finished my project, said Nouf.", "Quotation marks are needed around her words.")],
   "Quotation marks go around the speaker’s words, with the comma inside.",
   "Commas and periods go inside closing quotation marks.")
mc("quotations-dialogue", "L.5.2.b", 3, "Which sentence is punctuated correctly?",
   "Coach said, “Practice starts at four.”",
   [("Coach said “Practice starts at four.”", "A comma is needed after “said.”"),
    ("Coach said, “practice starts at four.”", "The first word of a quotation is capitalized."),
    ("Coach said, “Practice starts at four”.", "The period goes inside the quotation marks.")],
   "A comma separates the speaker tag from the quotation; the period goes inside.",
   "Speaker tag + comma + “Quotation.”")
tf("quotations-dialogue", "L.5.2.b", 2, "There should be a space between an opening quotation mark and the first word of the quotation.", False,
   "There is no space after an opening quotation mark or before a closing one.",
   "Quotation marks sit right next to the words they enclose.")
mc("quotations-dialogue", "L.5.2.b", 4, "Where do the commas belong? “If we hurry” said Omar “we can catch the bus.”",
   "After “hurry” (inside the quotation mark) and after “Omar”",
   [("Only after “Omar”", "A comma is also needed inside the first quotation."),
    ("After “we” and after “said”", "Commas go where the quotation is interrupted."),
    ("No commas are needed", "Interrupted quotations need commas.")],
   "Correct: “If we hurry,” said Omar, “we can catch the bus.”",
   "When a speaker tag interrupts a sentence, use commas on both sides of it.")
err("quotations-dialogue", "L.5.2.b", 5, ["“Mom, I had so much fun at the party”", " Charlie said", "."], 0, "“Mom, I had so much fun at the party,”",
    "The comma belongs inside the closing quotation mark.",
    "Commas and periods always go inside closing quotation marks.")
order("quotations-dialogue", "L.5.2.b", 6, "Put the pieces in order to make a correctly punctuated sentence.",
      ["“When the bell rings,”", "said the teacher,", "“please line up quietly.”"],
      "The quotation is interrupted by the speaker tag, with commas on both sides.",
      "An interrupted quotation: “Part one,” speaker tag, “part two.”")

# --------------------------------------------------------- puns (L.5.5)

mc("puns", "L.5.5", 2, "What makes this a pun? “The baker quit because he couldn’t make enough dough.”",
   "“Dough” means both bread mixture and, informally, money.",
   [("It rhymes “baker” and “dough.”", "These words do not rhyme."),
    ("It repeats the same sound at the start.", "That is alliteration."),
    ("It compares a baker to money using “like.”", "That would be a simile.")],
   "A pun plays on a word with two meanings; “dough” can mean bread mixture or money.",
   "A pun is a joke that uses a word’s double meaning.")
mc("puns", "L.5.5", 3, "Which sentence is a pun?",
   "I used to be a banker, but I lost interest.",
   [("I worked at the bank for ten years.", "There is no double meaning here."),
    ("Banks open at nine o’clock.", "This is a plain fact."),
    ("My bank is next to the bakery.", "There is no wordplay.")],
   "“Interest” means both money a bank pays and curiosity.",
   "Look for one word that makes sense in two ways.")
tf("puns", "L.5.5", 3, "“The math book looked sad because it had too many problems” is a pun.", True,
   "“Problems” means both math exercises and troubles.",
   "Ask whether one word works with two different meanings.")
mc("puns", "L.5.5", 4, "Which word creates the pun? “Time flies like an arrow; fruit flies like a banana.”",
   "flies",
   [("arrow", "“Arrow” has one meaning here."),
    ("banana", "“Banana” has one meaning here."),
    ("time", "“Time” has one meaning here.")],
   "“Flies” is a verb (moves quickly) in the first part and a noun (insects) in the second.",
   "Puns can switch a word between two parts of speech.")
match("puns", "L.5.5", 5, "Match each pun with the word that has the double meaning.",
      [("The tailor won because he was always on pins and needles.", "pins and needles"),
       ("The bicycle couldn’t stand up because it was two-tired.", "two-tired"),
       ("The scarecrow got an award for being outstanding in his field.", "outstanding in his field")],
      "Each pun depends on a word or phrase that sounds like or means two things.",
      "Find the phrase that makes the reader smile.")
mc("puns", "L.5.5", 6, "Why might an author use a pun in a historical story?",
   "To show a character’s cleverness or add humor",
   [("To give exact dates and facts", "Puns are wordplay, not facts."),
    ("To make the story sound more serious", "Puns usually add humor."),
    ("To replace dialogue", "Puns are often part of dialogue.")],
   "Puns reveal a playful or witty character and give readers a moment of humor.",
   "Think about the effect of wordplay on the reader.")

# --------------------------------------------- reference materials (L.5.4.c)

mc("reference-materials", "L.5.4.c", 2, "You want to know whether “record” in your sentence is a noun or a verb. Which part of the dictionary entry should you check?",
   "The part-of-speech label, such as (n.) or (v.)",
   [("The guide words at the top of the page", "Guide words help you find the page, not the word’s use."),
    ("The number of syllables", "Syllables do not tell the part of speech."),
    ("The first letter of the entry word", "The first letter only helps with alphabetical order.")],
   "Dictionary entries label each meaning with its part of speech, such as noun or verb.",
   "Look for small labels like n., v., adj. after the entry word.")
mc("reference-materials", "L.5.4.c", 3, "A digital thesaurus lists “glance, peek, scan, gaze” for “look.” Which word means to look for a long time?",
   "gaze",
   [("glance", "A glance is a quick look."),
    ("peek", "A peek is a quick, secret look."),
    ("scan", "To scan is to look quickly over something.")],
   "To gaze is to look steadily for a long time, often with wonder.",
   "Synonyms have shades of meaning; check the dictionary to choose precisely.")
mc("reference-materials", "L.5.4.c", 4, "The dictionary shows “con·duct (noun) KON-dukt; (verb) kuhn-DUKT.” How should you say “conduct” in “The students will conduct an experiment”?",
   "kuhn-DUKT, because it is a verb",
   [("KON-dukt, because it is a noun", "Here it is a verb (an action)."),
    ("Either way, because the meaning is the same", "Stress changes with the part of speech."),
    ("KON-DUKT, stressing both syllables", "Only one syllable is stressed.")],
   "“Will conduct” is a verb, so the stress is on the second syllable.",
   "Some words change stress depending on their part of speech.")
tf("reference-materials", "L.5.4.c", 2, "A glossary is found at the back of a book and defines words used in that book.", True,
   "Unlike a dictionary, a glossary only covers words from that book.",
   "Glossary = mini-dictionary for one book.")
mc("reference-materials", "L.5.4.c", 5, "Which source should you use to check whether “principal” or “principle” fits your sentence?",
   "A dictionary, to compare the meanings",
   [("An atlas", "An atlas contains maps."),
    ("An almanac", "An almanac gives yearly facts and data."),
    ("A table of contents", "This lists chapters.")],
   "A dictionary gives each word’s meaning so you can choose correctly.",
   "Use a dictionary for meaning and spelling; a thesaurus for synonyms.")
order("reference-materials", "L.5.4.c", 6, "Put these words in dictionary order.",
      ["harbinger", "harbor", "hardship", "harmony", "harvest"],
      "Compare letter by letter: harb-i, harb-o, hard, harm, harv.",
      "When words begin the same way, keep comparing until a letter differs.", qtype="WORD_ORDER")

# --------------------------------------------------------- suffixes (L.5.4.b)

mc("suffixes", "L.5.4.b", 2, "What does the suffix -less mean in “spotless”?",
   "without",
   [("full of", "That is the meaning of -ful."),
    ("again", "That is the meaning of the prefix re-."),
    ("one who", "That is the meaning of -er or -or.")],
   "Spotless means without spots, completely clean.",
   "-less = without; -ful = full of.")
mc("suffixes", "L.5.4.b", 3, "What does “washable” mean?",
   "able to be washed",
   [("already washed", "-able means able to be, not already done."),
    ("full of water", "That would need -ful."),
    ("one who washes things", "That would need -er.")],
   "The suffix -able means able to be: washable = able to be washed.",
   "Add the meaning of the suffix to the base word.")
dd("suffixes", "L.5.4.b", 3, "Choose the word that means “the state of being kind”: “Her ____ made everyone feel welcome.”",
   "kindness",
   [("kindly", "-ly makes an adverb, not a noun."),
    ("kinder", "-er compares two things."),
    ("unkind", "un- means not.")],
   "The suffix -ness turns an adjective into a noun meaning “the state of being.”",
   "-ness = state or quality of.")
match("suffixes", "L.5.4.b", 4, "Match each suffix with its meaning.",
      [("-ful", "full of"), ("-less", "without"), ("-ment", "the act or result of"), ("-er", "one who")],
      "Knowing suffix meanings helps you figure out new words.",
      "Think of a word you know with each suffix.")
mc("suffixes", "L.5.4.b", 5, "Which word means “in a careful way”?",
   "carefully",
   [("careful", "This is an adjective; it does not describe how something is done."),
    ("careless", "This means without care."),
    ("caring", "This has a different meaning.")],
   "care + -ful (full of) + -ly (in a … way) = in a careful way.",
   "Some words have two suffixes; build the meaning step by step.")
mc("suffixes", "L.5.4.b", 6, "In “The government announced a new agreement,” how do the suffixes help you understand “government” and “agreement”?",
   "-ment turns the verbs “govern” and “agree” into nouns.",
   [("-ment turns the nouns into verbs.", "It does the opposite."),
    ("-ment means “without.”", "That is -less."),
    ("-ment makes the words plural.", "Plurals use -s or -es.")],
   "Govern → government; agree → agreement. Both become nouns naming a thing or result.",
   "Suffixes can change a word’s part of speech.")

# ----------------------------------------------- subject-verb agreement (L.5.1)

dd("subject-verb-agreement", "L.5.1", 1, "Choose the verb: “The scientist ____ through the microscope.”",
   "looks",
   [("look", "A singular subject takes a verb ending in -s in the present tense."),
    ("looking", "This needs a helping verb."),
    ("are looking", "“Are” does not agree with the singular subject.")],
   "“Scientist” is singular, so the verb adds -s: looks.",
   "Singular subject → verb + s. Plural subject → no -s.")
dd("subject-verb-agreement", "L.5.1", 2, "Choose the verb: “Audrey and her sister ____ catch in the field.”",
   "play",
   [("plays", "A compound subject joined by “and” is plural."),
    ("is playing", "“Is” does not agree with a plural subject."),
    ("has played", "“Has” does not agree with a plural subject.")],
   "Two people joined by “and” make a plural subject, so the verb has no -s.",
   "Subject + and + subject = plural.")
dd("subject-verb-agreement", "L.5.1", 3, "Choose the verb: “The box of old toys ____ dust in the attic.”",
   "collects",
   [("collect", "The subject is “box,” which is singular."),
    ("are collecting", "“Are” does not agree with “box.”"),
    ("have collected", "“Have” does not agree with “box.”")],
   "The prepositional phrase “of old toys” does not change the subject; “box” is singular.",
   "Cross out prepositional phrases to find the real subject.")
mc("subject-verb-agreement", "L.5.1", 4, "Which sentence has correct subject-verb agreement?",
   "A flock of birds flies over the river every evening.",
   [("A flock of birds fly over the river every evening.", "The subject “flock” is singular."),
    ("A flocks of birds flies over the river every evening.", "“A flocks” is not correct."),
    ("A flock of birds flying over the river every evening.", "This is a fragment with no main verb.")],
   "“Flock” is a collective noun referring to the group as a whole, so it takes a singular verb.",
   "Collective nouns (flock, team, class) usually take singular verbs.")
err("subject-verb-agreement", "L.5.1", 5, ["My sisters practice basketball,", " and my little brother", " watch", " from the bench."], 2, " watches",
    "In a compound sentence, each subject agrees with its own verb: “brother” is singular, so “watches.”",
    "Check the verb in each clause of a compound sentence separately.")
mc("subject-verb-agreement", "L.5.1", 6, "Which sentence is correct?",
   "Each of the students has a locker.",
   [("Each of the students have a locker.", "“Each” is singular; “of the students” does not change it."),
    ("Each of the student have a locker.", "“Student” should be plural and the verb singular."),
    ("Each of the students having a locker.", "This is a fragment.")],
   "The subject is “Each,” which is singular, so the verb is “has.”",
   "Words like each, every and either are singular subjects.")
