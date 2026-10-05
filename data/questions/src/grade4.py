from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(4)

# ============================ PASSAGES (original) ============================
KITE = P("G4-P1", "The Kite Repair", "Realistic Fiction", """
Omar's kite lay on the grass with a long rip down its middle. The wind had pushed it straight into the branches of the old fig tree, and now the red paper flapped like a broken wing.

"It's ruined," Omar said. He kicked a stone and watched it roll away. The kite festival was only two days away, and he had spent a whole week building that kite.

His grandmother lowered herself onto the bench beside him. She did not say anything at first. Instead, she took a roll of tape and a sheet of tissue paper from her sewing basket. "When I was your age," she said, "my kites broke all the time. The ones I fixed always flew better than the new ones."

Omar frowned. "Why would a broken kite fly better?"

"Because when you fix something, you learn exactly how it works," she answered.

Together they patched the rip, adding a thin strip of bamboo to make the frame stronger. Omar measured the tail again and found it was too short, which explained why the kite had kept spinning. He added three more paper bows.

On the day of the festival, the wind was strong and gusty. Many kites dove toward the ground, but Omar's kite climbed higher and higher, steady as a hawk. Omar looked over at his grandmother and grinned. He knew the patch was the strongest part of all.
""")

BEAVER = P("G4-P2", "Nature's Engineers", "Expository Text", """
Beavers are sometimes called nature's engineers because they change the land around them more than almost any other animal except humans.

Building a Dam
A beaver family begins by piling sticks, rocks, and mud across a stream. Because the dam slows the water, a deep, calm pond forms behind it. Beavers patch any leaks quickly, especially when they hear the sound of rushing water.

Why the Pond Matters
The pond protects the beavers. Their lodge, a dome-shaped home of sticks and mud, sits in the middle of the water, and its entrances are underwater. As a result, wolves and other predators cannot easily reach the family inside.

Helping Other Living Things
Beaver ponds also help many other animals. Frogs lay eggs in the still water, ducks find food, and fish hide among the sunken branches. In dry summers, a beaver pond may be the only water for miles, so deer and birds travel to drink there.

Not everyone welcomes beavers. Their dams can flood roads and farmland. However, many scientists now argue that the benefits of beaver ponds are greater than the problems they cause.
""")

GARDEN = P("G4-P3", "Our School Needs a Garden", "Opinion Text", """
Our school should turn the empty lot behind the library into a vegetable garden. A garden would help students learn, eat better, and work together.

First, a garden is an outdoor classroom. Students could measure plant growth in math, study insects in science, and write observation journals in English. Learning by doing helps facts stick.

Second, students who grow vegetables are more likely to eat them. When children plant a tomato seed, water it, and watch it ripen, they feel proud to taste it. Our cafeteria could even serve the vegetables we grow.

Finally, a garden builds teamwork. Each class could care for its own bed, and older students could help younger ones. Some people say a garden would be too much work. But if every class takes turns, no one group will have to do it all.

The empty lot is wasted space right now. Let's fill it with something that grows—both plants and students.
""")

RAIN = P("G4-P4", "Night Rain", "Poetry", """
The rain comes tapping on my roof,
A drummer soft and slow;
It hums a song of silver drops
To flowers down below.

The street becomes a shining stream,
The lamps are blurry moons;
The puddles hold the sleeping sky
Like small and quiet spoons.

I pull my blanket to my chin
And listen to the beat;
The rain is singing me to sleep
On soft and silver feet.
""")

MAP = P("G4-P5", "The Missing Map", "Drama", """
CHARACTERS: LAYLA, age 10; KARIM, her younger brother; MS. HASSAN, a park ranger

SCENE: A forest trail at noon. A wooden sign points in two directions.

LAYLA: (turning her backpack upside down) It's gone! The map was right here.
KARIM: (nervously) Maybe we should just go left. Left looks shorter.
LAYLA: Shorter isn't always right. Remember what Dad said? If you're lost, stop and think.
(She sits on a rock and studies the sign. KARIM paces back and forth.)
LAYLA: Look—the sun is high, and the lake was east of the parking lot. The arrow to the right says "Lake Trail."
KARIM: (stopping) So the parking lot is past the lake!
(MS. HASSAN enters from the right, carrying a radio.)
MS. HASSAN: You two look like explorers. Everything all right?
LAYLA: (smiling) We lost our map, but I think we found our way.
MS. HASSAN: Then you found something better than a map—a calm head.
""")

# ============================ LITERATURE ============================
mc("theme", "RL.4.2", 3, "Which sentence best states a theme of “The Kite Repair”?",
   "Fixing something can make it stronger than before.",
   [("Kites are hard to fly in strong wind.", "This is a detail about wind, not the lesson of the story."),
    ("Grandmothers know how to sew.", "This is a fact about one character, not a message about life."),
    ("Festivals are fun for families.", "The story never focuses on why festivals are fun.")],
   "The grandmother says fixed kites fly better, and at the end the patch is “the strongest part of all.” Both details point to this lesson.",
   "A theme is a lesson about life. Look at what a character learns by the end.", KITE)
mc("character", "RL.4.3", 2, "How does Omar feel at the beginning of the story?",
   "upset and discouraged",
   [("proud and excited", "He is proud only at the end, after the kite flies."),
    ("bored and sleepy", "Kicking a stone shows frustration, not boredom."),
    ("calm and patient", "Saying “It's ruined” shows he is not calm.")],
   "Omar says “It's ruined” and kicks a stone. His words and actions show he is upset.",
   "Use what a character says and does to figure out feelings.", KITE)
mc("character", "RL.4.3", 4, "Which detail best shows that the grandmother is patient and wise?",
   "She sits quietly, then shares a lesson from her own childhood.",
   [("She has a sewing basket.", "Owning a basket does not show a character trait."),
    ("She lowers herself onto the bench.", "This shows how she moves, not what she is like inside."),
    ("The kite festival is in two days.", "This detail is about the setting, not the grandmother.")],
   "Instead of scolding or rushing, she waits, then teaches Omar through a story. That shows patience and wisdom.",
   "Character traits are shown through choices, not through objects a character owns.", KITE)
mc("point-of-view", "RL.4.6", 3, "From what point of view is “The Kite Repair” told?",
   "third person — a narrator outside the story tells what happens",
   [("first person — Omar tells the story using “I”", "Omar is called “Omar” and “he,” not “I.”"),
    ("first person — the grandmother tells the story", "The grandmother is “she”; she is not the narrator."),
    ("second person — the story speaks to “you”", "The story never speaks directly to the reader.")],
   "The narrator uses “he,” “she,” and the characters' names, so the story is told in third person.",
   "First person uses I/me/my. Third person uses he/she/they and names.", KITE)
mc("plot-events", "RL.4.3", 4, "Why did Omar's kite keep spinning before the repair?",
   "The tail was too short.",
   [("The paper was the wrong color.", "Color does not affect how a kite flies, and the story never says so."),
    ("The wind was too gentle.", "The story says the wind was strong, not gentle."),
    ("The bamboo frame was too heavy.", "The bamboo was added to make it stronger; it was not the problem.")],
   "The story says he “found it was too short, which explained why the kite had kept spinning.”",
   "Words like “which explained why” point straight to a cause.", KITE)
mc("figurative-language", "RL.4.4", 4, "“The red paper flapped like a broken wing.” What does this simile help the reader picture?",
   "the torn kite moving weakly, like an injured bird",
   [("a bird flying high above the tree", "The simile describes the torn kite, not a real bird in the sky."),
    ("the kite flying perfectly at the festival", "This happens at the beginning, when the kite is broken."),
    ("a red bird sitting in the fig tree", "There is no real bird; the kite is compared to a wing.")],
   "A simile compares using “like” or “as.” The rip makes the kite flap helplessly, the way a hurt wing would.",
   "Ask: what two things are being compared, and how are they alike?", KITE)
mc("figurative-language", "RL.4.4", 5, "At the end, the kite climbs “steady as a hawk.” Why did the author choose this comparison?",
   "to show the repaired kite is now strong and controlled in the wind",
   [("to show the kite is shaped like a bird", "The comparison is about how it flies, not its shape."),
    ("to warn that hawks might attack kites", "Nothing in the story suggests danger from birds."),
    ("to show the kite is flying away", "The kite climbs higher but is still controlled by Omar.")],
   "A hawk glides steadily even in wind. The comparison contrasts with the “broken wing” at the start and shows the change.",
   "Authors often use a second comparison at the end to show how things changed.", KITE)
order("plot-events", "RL.4.3", 3, "Put the events of “The Kite Repair” in order.",
      ["The kite tears in the fig tree.", "Grandmother shares a story about her childhood kites.",
       "Omar finds that the tail is too short.", "The kite flies higher than the others at the festival."],
      "The story moves from the problem, to advice, to the fix, to the result.",
      "Look for time clues: “at first,” “together,” “on the day of the festival.”", KITE)
tf("theme", "RL.4.2", 5, "True or false: Omar's attitude toward broken things changes by the end of the story.", True,
   "At first he says the kite is “ruined.” At the end he knows “the patch was the strongest part of all.”",
   "Compare a character's thoughts at the beginning and the end to find a change.", KITE)

mc("poetry-elements", "RL.4.5", 2, "How many stanzas are in “Night Rain”?",
   "three", [("four", "Count the groups of lines separated by spaces: there are three."),
             ("twelve", "Twelve is the number of lines, not stanzas."),
             ("one", "The poem is divided into separate groups of lines.")],
   "A stanza is a group of lines. “Night Rain” has three groups of four lines.",
   "Stanzas in poems are like paragraphs in stories.", RAIN)
mc("poetry-elements", "RL.4.5", 3, "Which pair of words from “Night Rain” rhyme?",
   "slow / below", [("roof / drops", "These words do not end with the same sound."),
                    ("stream / moons", "Stream and moons have different ending sounds."),
                    ("chin / beat", "These end with different sounds.")],
   "Slow and below both end with the long o sound, so they rhyme.",
   "Rhyming words have the same ending sound, not just the same letters.", RAIN)
mc("figurative-language", "RL.4.4", 4, "In stanza 1, the rain is called “a drummer soft and slow.” What kind of figurative language is this?",
   "a metaphor", [("a simile", "A simile uses “like” or “as.” This line does not."),
                  ("a rhyme", "Rhyme is about sounds at line endings, not comparisons."),
                  ("an idiom", "An idiom is a common saying; this is a fresh comparison.")],
   "The poet says the rain IS a drummer without using like or as. That is a metaphor.",
   "Simile: like/as. Metaphor: says one thing IS another.", RAIN)
mc("figurative-language", "RL.4.4", 5, "“The puddles hold the sleeping sky.” What does this line mean?",
   "The puddles reflect the dark night sky.",
   [("The sky has fallen into the street.", "The line is figurative; the sky does not actually fall."),
    ("The puddles are deep enough to swim in.", "Nothing suggests the puddles are deep."),
    ("People are sleeping outside in the rain.", "“Sleeping” describes the quiet night sky, not people.")],
   "Puddles act like mirrors at night, so they seem to “hold” the dark, quiet sky.",
   "Picture the scene. What would you really see in a puddle at night?", RAIN)
mc("imagery", "RL.4.4", 6, "How does the speaker feel about the rain?",
   "comforted and peaceful", [("frightened by the noise", "Words like “soft,” “hums,” and “singing me to sleep” are gentle, not scary."),
                              ("annoyed because it is too loud", "The rain is described as soft and slow."),
                              ("excited to play outside", "The speaker pulls a blanket up and falls asleep.")],
   "The speaker listens under a blanket while the rain “sings” them to sleep—a calm, cozy feeling.",
   "Notice the describing words a poet chooses; they show the speaker's feelings.", RAIN)

mc("drama-elements", "RL.4.5", 2, "In “The Missing Map,” which words are stage directions?",
   "(turning her backpack upside down)", [("LAYLA:", "This shows who is speaking, not an action."),
                                          ("It's gone! The map was right here.", "This is dialogue, the words a character says."),
                                          ("SCENE: A forest trail at noon.", "This describes the setting, not an action during the play.")],
   "Stage directions, usually in parentheses, tell actors what to do or how to move.",
   "Dialogue = words spoken. Stage directions = actions and feelings in ( ).", MAP)
mc("drama-elements", "RL.4.5", 3, "What is the setting of the play?", "a forest trail at noon",
   [("a parking lot in the evening", "The parking lot is mentioned, but the scene happens on the trail."),
    ("a lake in the morning", "They are trying to reach the lake area; they are not there yet."),
    ("a ranger station", "Ms. Hassan arrives on the trail; the scene never moves.")],
   "The line “SCENE: A forest trail at noon” tells where and when the play takes place.",
   "In a play, look for the word SCENE to find the setting.", MAP)
mc("character", "RL.4.3", 5, "How are Layla and Karim different when they discover the map is missing?",
   "Layla stays calm and thinks; Karim wants to rush a choice.",
   [("Layla wants to give up; Karim makes a plan.", "It is Layla who makes the plan."),
    ("Both of them panic and start running.", "Layla sits on a rock to think."),
    ("Karim finds the map; Layla follows him.", "The map is never found.")],
   "Karim says “just go left” nervously, while Layla says “stop and think” and studies the sign.",
   "Compare what each character says and does in the same moment.", MAP)
mc("theme", "RL.4.2", 6, "Which line from the play best expresses its theme?",
   "“Then you found something better than a map—a calm head.”",
   [("“Left looks shorter.”", "This is Karim's quick guess, which the play shows is not wise."),
    ("“The map was right here.”", "This line starts the problem; it does not state a lesson."),
    ("“You two look like explorers.”", "This is a friendly greeting, not the message.")],
   "The ranger sums up the lesson: staying calm and thinking is more useful than any map.",
   "Characters near the end of a story often say the theme out loud.", MAP)
ms("text-evidence", "RL.4.1", 5, "Which TWO details are clues Layla uses to choose the right trail? Choose two.",
   ["The sun is high.", "The lake was east of the parking lot."],
   [("Karim thinks left looks shorter.", "Layla rejects this idea."),
    ("Ms. Hassan carries a radio.", "Layla decides before the ranger arrives.")],
   "Layla uses the sun and what she remembers about the lake's direction to read the sign.",
   "Text evidence must come from the text AND support the answer.", MAP)
mc("inference", "RL.4.1", 6, "Why does Layla mention “what Dad said”?",
   "She is using advice she learned before to solve a new problem.",
   [("She wants Karim to call their dad.", "Nothing suggests calling anyone."),
    ("She is blaming Dad for losing the map.", "She lost the map; she is not blaming anyone."),
    ("She is changing the subject to calm down.", "The advice is directly connected to their problem.")],
   "Remembering “stop and think” helps her slow down and solve the problem—an inference from her actions afterward.",
   "An inference = text clues + what you already know.", MAP)

# ============================ INFORMATIONAL ============================
mc("central-idea", "RI.4.2", 3, "What is the main idea of “Nature's Engineers”?",
   "Beavers build dams and ponds that change the land and help many living things.",
   [("Wolves are the main predators of beavers.", "Wolves are one detail in one section."),
    ("Beaver dams always cause floods on farms.", "The text says dams CAN flood, and scientists see more benefits."),
    ("Frogs lay their eggs in still water.", "This is a supporting detail about other animals.")],
   "Every section explains how beavers change the land and what those changes do.",
   "The main idea is what the WHOLE text is mostly about. Details support it.", BEAVER)
mc("text-features", "RI.4.7", 2, "Under which heading would you find out how beaver ponds help ducks?",
   "Helping Other Living Things", [("Building a Dam", "That section explains how dams are made."),
                                    ("Why the Pond Matters", "That section is about protecting the beaver family."),
                                    ("Nature's Engineers", "That is the title of the whole article.")],
   "The heading “Helping Other Living Things” introduces frogs, ducks, fish, deer, and birds.",
   "Headings tell what each section is about. Use them to find information fast.", BEAVER)
mc("cause-effect", "RI.4.3", 3, "According to the article, what is an EFFECT of beavers building a dam?",
   "A deep, calm pond forms.", [("Beavers hear rushing water.", "The sound of water makes beavers fix leaks; it is a cause."),
                                ("Beavers pile up sticks and mud.", "Piling sticks is how they BUILD the dam."),
                                ("Wolves hunt near the stream.", "This is not described as a result of the dam.")],
   "“Because the dam slows the water, a deep, calm pond forms.” The pond is the effect.",
   "Signal words such as because, as a result, and so link causes and effects.", BEAVER)
mc("cause-effect", "RI.4.3", 5, "Why can't wolves easily reach a beaver family?",
   "The lodge sits in the pond and its entrances are underwater.",
   [("Beavers chase wolves away with sticks.", "The article never says this."),
    ("Wolves are afraid of the sound of water.", "This is not in the text."),
    ("The dam is too tall to climb.", "The protection comes from the water around the lodge.")],
   "The text says the entrances are underwater, “as a result, wolves … cannot easily reach the family.”",
   "Find the sentence with “as a result” and read what comes just before it.", BEAVER)
mc("compare-contrast", "RI.4.5", 5, "How is the last paragraph organized?",
   "It presents a problem with beavers and then a counterpoint.",
   [("It lists the steps for building a dam.", "The steps appear in the first section."),
    ("It tells events in the order they happened.", "The paragraph weighs two sides; it is not a sequence."),
    ("It describes what a beaver lodge looks like.", "The lodge is described earlier.")],
   "“Not everyone welcomes beavers…However, many scientists…” shows one side, then the other side.",
   "“However” and “but” often signal a contrasting idea.", BEAVER)
mc("context-clues", "L.4.4.a", 4, "In the article, what does predators mean?",
   "animals that hunt other animals", [("animals that build homes", "Beavers build homes, but predators are the ones that threaten them."),
                                        ("plants that grow near water", "Predators are living things that try to reach and catch beavers."),
                                        ("people who study animals", "Those are scientists, mentioned separately.")],
   "The sentence says wolves and other predators try to “reach the family,” so predators are hunters.",
   "An example word (wolves) can help you define a new word.", BEAVER)
mc("author-purpose", "RI.4.8", 6, "What reason does the author give to support the idea that beavers help other animals?",
   "In dry summers, a beaver pond may be the only water for miles.",
   [("Beavers patch leaks quickly.", "This explains dam repair, not helping others."),
    ("Their lodge is dome-shaped.", "This describes the lodge."),
    ("Dams can flood roads.", "This is a problem, not a benefit to animals.")],
   "Deer and birds travel to drink at the pond—evidence that beavers help other living things.",
   "A reason must SUPPORT the point. Check that it matches the point exactly.", BEAVER)
tf("text-evidence", "RI.4.1", 4, "True or false: The article says that all scientists believe beavers cause more problems than benefits.", False,
   "The text says many scientists argue the benefits are GREATER than the problems.",
   "Watch for absolute words like “all” and “always” in true/false statements.", BEAVER)

mc("author-claim", "RI.4.8", 2, "What is the author's opinion in “Our School Needs a Garden”?",
   "The school should turn the empty lot into a vegetable garden.",
   [("Students should eat more vegetables at home.", "This is part of one reason, not the main opinion."),
    ("The library needs more books.", "The library is only mentioned as a location."),
    ("Gardens are too much work for schools.", "The author argues against this idea.")],
   "The first sentence states the claim clearly, and every paragraph supports it.",
   "In opinion writing, the claim is usually in the first or last sentence.", GARDEN)
ms("author-claim", "RI.4.8", 4, "Which reasons does the author use to support the claim? Choose all that apply.",
   ["A garden is an outdoor classroom.", "Students who grow vegetables are more likely to eat them.", "A garden builds teamwork."],
   [("A garden will save the school money.", "The author never mentions money.")],
   "The author uses First, Second, and Finally to introduce three reasons.",
   "Transition words like First and Finally often introduce reasons.", GARDEN)
mc("author-claim", "RI.4.8", 5, "How does the author respond to people who say a garden is too much work?",
   "by explaining that classes can take turns so no group does it all",
   [("by agreeing that the garden should be small", "The author does not agree with the objection."),
    ("by ignoring the objection", "The author addresses it directly in paragraph 4."),
    ("by saying the cafeteria will do the work", "The cafeteria only serves the vegetables.")],
   "The author answers the counterclaim: “if every class takes turns, no one group will have to do it all.”",
   "Strong arguments answer the other side's concerns.", GARDEN)
mc("author-perspective", "RI.4.8", 6, "In the last sentence, what does “something that grows—both plants and students” suggest?",
   "Students will learn and develop, just as plants grow.",
   [("Students will become taller by eating vegetables.", "“Grow” is used in a figurative sense here."),
    ("The garden will need more students to work in it.", "This misses the double meaning."),
    ("Plants grow faster than students do.", "No comparison of speed is made.")],
   "The author plays with two meanings of grow to end with a memorable idea.",
   "Some words have two meanings at once. Ask what each meaning adds.", GARDEN)

# ============================ VOCABULARY ============================
mc("context-clues", "L.4.4.a", 1, "The kitten was timid; it hid under the bed whenever anyone came near. What does timid mean?",
   "shy and easily scared", [("loud and playful", "Hiding shows the opposite of playful."), ("hungry", "Nothing mentions food."), ("very sleepy", "Hiding when people come near shows fear, not tiredness.")],
   "Hiding from people is a clue that timid means shy or fearful.", "Read the words after a semicolon; they often explain the word before it.")
mc("context-clues", "L.4.4.a", 3, "The hikers were exhausted after the long climb, so they rested for an hour. What does exhausted mean?",
   "very tired", [("very excited", "Resting for an hour suggests tiredness."), ("lost", "Nothing says they lost their way."), ("cold", "No clue is about temperature.")],
   "They needed a long rest after a long climb—exhausted means very tired.", "Look at what happens BECAUSE of the word.")
mc("context-clues", "L.4.4.a", 5, "Unlike his cautious sister, who checked the ice twice, Bilal ran straight onto the frozen pond. What does cautious mean?",
   "careful to avoid danger", [("brave and fearless", "“Unlike” shows the sister is the opposite of Bilal, who rushed."), ("in a hurry", "Checking twice is slow and careful."), ("unkind", "Kindness is not discussed.")],
   "“Unlike” signals a contrast: Bilal rushed, so his cautious sister must be careful.", "“Unlike,” “but,” and “instead” are contrast clues.")
mc("multiple-meaning", "L.4.4.a", 2, "Which sentence uses bark to mean the outer covering of a tree?",
   "The bark of the oak felt rough under my hand.",
   [("The dog's bark woke the baby.", "Here bark is the sound a dog makes."),
    ("Did you hear the seal bark?", "This is an animal sound."),
    ("Don't bark orders at your friends.", "Here bark means to speak sharply.")],
   "Only this sentence describes something you can touch on a tree.", "Multiple-meaning words need the rest of the sentence to choose the meaning.")
mc("multiple-meaning", "L.4.4.a", 4, "“The pitcher threw the ball so fast that the batter missed it.” What does pitcher mean here?",
   "a baseball player who throws the ball", [("a jug used for pouring water", "That meaning does not fit a game with a batter."), ("a picture of a field", "This is not a meaning of pitcher."), ("a person who sells things", "That is a seller, not a pitcher.")],
   "Batter and threw the ball tell you this is a baseball game.", "Look for other words from the same topic (ball, batter).")
mc("prefixes", "L.4.4.b", 2, "What does the word reread mean?", "to read again",
   [("to read before", "Before is the meaning of pre-."), ("to not read", "Not is the meaning of un- or dis-."), ("to read wrongly", "Wrongly is the meaning of mis-.")],
   "The prefix re- means again, so reread means read again.", "re- = again, un- = not, pre- = before, mis- = wrongly.")
match("prefixes", "L.4.4.b", 3, "Match each prefix to its meaning.",
      [("re-", "again"), ("un-", "not"), ("pre-", "before"), ("mis-", "wrongly")],
      "These four prefixes appear in many Grade 4 words: redo, unkind, preview, misspell.",
      "Think of a word you know with the prefix, then work out the meaning.")
mc("suffixes", "L.4.4.b", 3, "What does the word fearless mean?", "without fear",
   [("full of fear", "Full of is the meaning of -ful."), ("one who fears", "One who is the meaning of -er."), ("able to fear", "Able to is the meaning of -able.")],
   "The suffix -less means without. Fearless = without fear.", "-less = without, -ful = full of.")
mc("suffixes", "L.4.4.b", 4, "Which word means “able to be broken”?", "breakable",
   [("breakless", "-less means without."), ("rebreak", "re- means again."), ("breaker", "-er means one who.")],
   "The suffix -able means able to be. Breakable = able to be broken.", "Add the suffix to the base word and read the parts in reverse: break + able = able to break.")
mc("greek-latin-roots", "L.4.4.b", 5, "The Greek root photo means light, and graph means write or draw. What is a photograph?",
   "a picture made with light", [("a drawing of a phone", "Phone (sound) is a different root."), ("a letter written at night", "Nothing in the roots means night."), ("a light bulb", "A bulb does not draw or record.")],
   "Photo (light) + graph (write/draw) = an image “drawn” by light, the way a camera works.", "Break a long word into roots and combine their meanings.")
mc("greek-latin-roots", "L.4.4.b", 6, "The Latin root port means carry. Which word means “able to be carried easily”?",
   "portable", [("import", "Import means to carry INTO a country."), ("report", "A report carries information back, but it isn't “able to be carried.”"), ("porter", "A porter is a person who carries things.")],
   "Port (carry) + -able (able to be) = portable.", "Combine the root's meaning with the suffix's meaning.")
mc("idioms-adages", "L.4.5.b", 3, "Rana said the math test was “a piece of cake.” What did she mean?",
   "The test was very easy.", [("The test was about food.", "Idioms do not mean exactly what the words say."), ("She ate cake during the test.", "This is the literal meaning, not the idiom."), ("The test was hard to finish.", "A piece of cake means the opposite.")],
   "“A piece of cake” is an idiom meaning something is easy.", "Idioms are phrases whose meaning is different from the words themselves.")
mc("idioms-adages", "L.4.5.b", 5, "What does the adage “Don't count your chickens before they hatch” mean?",
   "Don't depend on something before it actually happens.",
   [("Always count your chickens carefully.", "The adage is not about real chickens."), ("Farmers should hatch more eggs.", "This is too literal."), ("Chickens are hard to count.", "This misses the lesson.")],
   "An adage is a well-known saying that gives advice. This one warns against planning on uncertain results.", "Ask: what advice would this saying give a person?")
mc("figurative-language", "L.4.5.a", 4, "Which sentence contains a simile?",
   "Her voice was as soft as a feather.",
   [("Her voice was a gentle breeze.", "This is a metaphor; it has no like or as."), ("She spoke softly to the baby.", "This is literal."), ("The feather floated down.", "No comparison is made.")],
   "Similes compare two things using like or as: “as soft as a feather.”", "Spot the word like or as connecting two unlike things.")
mc("synonyms-antonyms", "L.4.5.c", 2, "Which word is a synonym for enormous?", "huge",
   [("tiny", "Tiny is an antonym (opposite)."), ("noisy", "Noisy is about sound, not size."), ("ancient", "Ancient means very old.")],
   "Synonyms have almost the same meaning: enormous and huge both mean very big.", "Synonym = same meaning. Antonym = opposite meaning.")
mc("synonyms-antonyms", "L.4.5.c", 4, "Which word is an antonym for generous?", "selfish",
   [("kind", "Kind is close in meaning to generous."), ("giving", "Giving is a synonym."), ("helpful", "Helpful is similar, not opposite.")],
   "A generous person shares; a selfish person does not. They are opposites.", "Test an antonym by putting “not” in front: not generous = selfish.")

# ============================ GRAMMAR (L.4.1) ============================
mc("pronouns", "L.4.1.a", 3, "Choose the relative pronoun that best completes: “The girl ____ won the race is my cousin.”",
   "who", [("which", "Use which for things, not people."), ("whose", "Whose shows ownership."), ("where", "Where is a relative adverb for places.")],
   "Who refers to people and connects the clause “won the race” to “the girl.”", "who/whom → people, which → things, that → both.")
dd("adverbs", "L.4.1.a", 4, "This is the park ____ we had our picnic.", "where",
   [("when", "When refers to a time, not a place."), ("why", "Why gives a reason."), ("who", "Who refers to a person.")],
   "Where is a relative adverb that refers to a place (the park).", "where → place, when → time, why → reason.")
mc("verb-tenses", "L.4.1.b", 3, "Which sentence uses the PAST progressive tense?",
   "We were walking to school when it started to rain.",
   [("We walk to school every day.", "This is the simple present."), ("We will be walking to school tomorrow.", "This is the future progressive."), ("We are walking to school now.", "This is the present progressive.")],
   "Past progressive = was/were + -ing verb. It shows an action that was ongoing in the past.", "Progressive tenses use a form of be + a verb ending in -ing.")
dd("verb-tenses", "L.4.1.b", 4, "Tomorrow at noon, I ____ my grandmother.", "will be visiting",
   [("was visiting", "Was shows past time, but “tomorrow” is future."), ("am visiting", "Am visiting is present."), ("visited", "Visited is simple past.")],
   "“Tomorrow at noon” points to an ongoing action in the future: will be + visiting.", "Time clue words (yesterday, now, tomorrow) tell you which tense to use.")
mc("verbs", "L.4.1.c", 4, "Which modal verb shows that something is REQUIRED? “Visitors ____ wear a helmet in the factory.”",
   "must", [("might", "Might shows something is possible, not required."), ("can", "Can shows ability or permission."), ("may", "May shows permission or possibility.")],
   "Must expresses a rule or requirement.", "Modals: can (ability), may/might (possibility), must (necessity).")
mc("adjectives", "L.4.1.d", 5, "Which sentence lists the adjectives in the correct order?",
   "She wore a beautiful long blue dress.",
   [("She wore a blue long beautiful dress.", "Color should come after opinion and size."), ("She wore a long beautiful blue dress.", "Opinion (beautiful) comes before size (long)."), ("She wore a beautiful blue long dress.", "Size (long) comes before color (blue).")],
   "Order: opinion → size → age → shape → color → origin → material → purpose.", "Say it aloud: the correct order usually “sounds right” in English.")
mc("prepositions", "L.4.1.e", 3, "What is the prepositional phrase in this sentence? “The cat slept under the warm blanket.”",
   "under the warm blanket", [("The cat slept", "This is the subject and verb."), ("warm blanket", "This leaves out the preposition under."), ("slept under", "A prepositional phrase starts with the preposition and ends with its object.")],
   "A prepositional phrase begins with a preposition (under) and ends with a noun (blanket).", "Common prepositions: in, on, under, over, near, after, between.")
mc("fragments-run-ons", "L.4.1.f", 3, "Which of these is a complete sentence?",
   "My brother plays soccer on Fridays.",
   [("Running across the big field.", "There is no subject—who is running?"), ("Because it was raining.", "This is a dependent clause that cannot stand alone."), ("The tall boy with the red hat.", "There is no verb telling what the boy does.")],
   "A complete sentence has a subject (My brother) and a predicate (plays soccer) and expresses a complete thought.", "Ask: Who or what? Does what? If either is missing, it's a fragment.")
mc("fragments-run-ons", "L.4.1.f", 5, "Which is the best way to fix this run-on? “I finished my homework I went outside to play.”",
   "I finished my homework, and then I went outside to play.",
   [("I finished my homework I went, outside to play.", "A comma in the wrong place does not fix the run-on."), ("I finished. My homework I went outside to play.", "This creates a fragment and an awkward sentence."), ("I finished my homework I went outside, to play.", "Two sentences are still joined with nothing between them.")],
   "Joining the two sentences with a comma and a conjunction (and) fixes the run-on.", "Fix run-ons with a period, or a comma + and/but/so.")
mc("pronoun-homophones", "L.4.1.g", 2, "Choose the correct word: “____ going to the museum on Saturday.”",
   "They're", [("Their", "Their shows ownership (their bags)."), ("There", "There tells about a place."), ("Theyre", "This is missing the apostrophe.")],
   "They're is a contraction of they are: They are going to the museum.", "Test it: replace with “they are.” If it works, use they're.")
mc("pronoun-homophones", "L.4.1.g", 4, "Which sentence uses its or it's correctly?",
   "The dog wagged its tail.",
   [("It's tail was wagging.", "It's means it is."), ("The dog lost it's bone.", "It's means it is; ownership is its."), ("Its raining outside.", "It is raining needs it's.")],
   "Its (no apostrophe) shows ownership; it's means it is.", "Possessive pronouns never use apostrophes: his, hers, its, ours, theirs.")
dd("pronoun-homophones", "L.4.1.g", 3, "I would like ____ cookies, please.", "two",
   [("to", "To shows direction or is part of a verb (to go)."), ("too", "Too means also or very.")],
   "Two is the number 2.", "to = direction, too = also/very, two = 2.")
mc("pronouns", "L.4.1.a", 5, "Which sentence uses a pronoun correctly?",
   "Mom gave the tickets to Ali and me.",
   [("Mom gave the tickets to Ali and I.", "After a preposition (to), use the object pronoun me."), ("Me and Ali got the tickets.", "Me cannot be the subject; use Ali and I."), ("Ali and me went to the show.", "Subjects need subject pronouns: Ali and I.")],
   "Remove “Ali and” to test: “Mom gave the tickets to me.” That sounds correct.", "Cover the other person's name, then choose the pronoun that sounds right.")
mc("subject-verb-agreement", "L.4.1", 3, "Choose the verb that agrees with the subject: “The students in my class ____ to recess at noon.”",
   "go", [("goes", "The subject students is plural, so the verb has no -s."), ("is going", "Is goes with a singular subject."), ("has gone", "Has goes with a singular subject.")],
   "The subject is students (plural), not class. Plural subjects take go.", "Ignore the prepositional phrase (in my class) to find the real subject.")
err("plural-nouns", "L.4.1", 4, ["The farmer", "fed the sheeps", "and the geese", "before sunrise."], 1, "fed the sheep",
    "Sheep is an irregular plural—it stays the same: one sheep, two sheep.", "Irregular plurals don't add -s: child → children, mouse → mice, sheep → sheep.")
err("irregular-verbs", "L.4.1", 5, ["Yesterday", "we swimmed", "in the lake", "for an hour."], 1, "we swam",
    "Swim is irregular: swim → swam → swum.", "Irregular verbs change their spelling in the past tense instead of adding -ed.")
mc("comparatives", "L.4.1", 4, "Which sentence compares correctly?",
   "This puzzle is harder than the last one.",
   [("This puzzle is more harder than the last one.", "Do not use more with -er."), ("This puzzle is hardest than the last one.", "Use -est for three or more things, and never with than."), ("This puzzle is most hard than the last one.", "Most is for three or more things.")],
   "Compare TWO things with -er (or more); compare THREE or more with -est (or most).", "Never use more AND -er together.")
mc("negatives", "L.4.1", 5, "Which sentence avoids a double negative?",
   "I don't have any homework tonight.",
   [("I don't have no homework tonight.", "Don't and no are two negatives."), ("I haven't got no homework tonight.", "Haven't and no are two negatives."), ("I don't never have homework.", "Don't and never are two negatives.")],
   "Use only one negative word in a sentence: don't + any.", "Negative words: no, not, never, nobody, nothing, none.")

# ============================ MECHANICS (L.4.2) ============================
mc("capitalization", "L.4.2.a", 2, "Which sentence uses capital letters correctly?",
   "Last July, my family visited Riyadh.",
   [("Last july, my family visited riyadh.", "Months and city names are proper nouns."), ("last July, My family visited Riyadh.", "Capitalize the first word; don't capitalize my in the middle."), ("Last July, my Family visited Riyadh.", "Family is a common noun here.")],
   "Capitalize the first word of a sentence, months, and names of places.", "Proper nouns (specific names) need capitals.")
mc("quotations-dialogue", "L.4.2.b", 4, "Which sentence is punctuated correctly?",
   "“Can we go to the park?” asked Huda.",
   [("“Can we go to the park,” asked Huda?", "The question mark belongs inside the quotation marks."), ("“Can we go to the park”? asked Huda.", "End punctuation goes inside the closing quotation mark."), ("Can we go to the park? “asked Huda.”", "Only the spoken words go inside quotation marks.")],
   "Put quotation marks around the exact words spoken, with the question mark inside.", "Punctuation of the spoken words stays inside the quotation marks.")
mc("commas", "L.4.2.c", 3, "Where does the comma belong? “I wanted to play outside but it was raining.”",
   "after outside: “I wanted to play outside, but it was raining.”",
   [("after wanted", "The comma goes before the conjunction that joins two sentences."), ("after but", "The comma comes before but, not after."), ("No comma is needed.", "Two complete sentences joined by but need a comma.")],
   "Use a comma before a coordinating conjunction (and, but, or, so) that joins two complete sentences.", "Remember FANBOYS: for, and, nor, but, or, yet, so.")
mc("spelling", "L.4.2.d", 3, "Which word is spelled correctly?", "beautiful",
   [("beatiful", "Missing the u after the e-a."), ("beautyful", "When adding -ful, change y to i."), ("beutiful", "Missing the a.")],
   "Beauty + ful: change y to i and add -ful = beautiful.", "When a word ends in consonant + y, change y to i before adding most suffixes.")
fill("spelling", "L.4.2.d", 4, "Add -ing to the word hop: I am ____ on one foot.", ["hopping"],
     "Hop has one short vowel and ends in one consonant, so double the p: hopping.", "Short vowel + one consonant → double it before -ing or -ed.")

# ============================ LANGUAGE USE & WRITING ============================
mc("precise-language", "L.4.3.a", 4, "Which word is the most precise replacement for went in: “The rabbit went across the yard when it heard the dog”?",
   "darted", [("moved", "Moved is just as vague as went."), ("walked", "Walked doesn't show the rabbit's fear or speed."), ("was", "Was is not an action.")],
   "Darted shows a quick, sudden movement—exactly what a frightened rabbit does.", "Replace vague verbs (went, got, said) with words that show HOW.")
mc("precise-language", "L.4.3.c", 5, "Which sentence would be best in a formal report?",
   "The experiment showed that plants grew taller in sunlight.",
   [("The plants totally grew way taller in the sun!", "Totally and way are informal."), ("So, like, the sunny plants won.", "Like and won are casual words."), ("Guess what? Sun = tall plants.", "Formal writing uses full sentences, not shortcuts.")],
   "Formal language is clear and serious, without slang or casual words.", "Ask: would this sound right in a science textbook?")
mc("writing-informative", "W.4.2.a", 4, "Which is the best topic sentence for a paragraph about why owls are good night hunters?",
   "Owls have special features that make them excellent hunters at night.",
   [("Owls are birds.", "Too general—it doesn't introduce the topic of night hunting."), ("I saw an owl once at my uncle's farm.", "This is a personal story, not a topic sentence for this paragraph."), ("Their feathers are soft.", "This is a detail, not the main point.")],
   "A topic sentence tells the main idea the whole paragraph will explain.", "A good topic sentence is broad enough to cover all the details.")
mc("writing-informative", "W.4.2.c", 3, "Choose the best linking word: “Bats sleep during the day. ____, they hunt for insects at night.”",
   "Instead", [("For example", "The second sentence is not an example of the first."), ("Because", "Because cannot start this kind of contrast."), ("Also", "Also adds a similar idea; this idea contrasts.")],
   "The sentences contrast day and night, so a contrast transition fits.", "Transitions show how ideas connect: adding, contrasting, giving examples, or showing time.")
order("writing-narrative", "W.4.3.c", 3, "Put these sentences in order to make a clear story.",
      ["Sami woke up early on the first day of school.", "He packed his bag and ate breakfast quickly.",
       "When he reached the gate, he realized he had forgotten his lunch.", "Luckily, his father arrived a minute later holding the lunch box."],
      "The sentences follow time order: waking, getting ready, a problem, and the solution.",
      "Use time words (first, when, later) to help readers follow events.")
mc("writing-argument", "W.4.1.b", 5, "Which detail BEST supports the opinion “Students should have longer lunch breaks”?",
   "Many students do not have time to finish their food in 20 minutes.",
   [("Lunch is my favorite part of the day.", "This is a personal feeling, not a reason others can check."), ("Pizza is served on Thursdays.", "This fact doesn't support longer breaks."), ("Some schools start at 7:30.", "School start time is not about lunch length.")],
   "A strong reason connects directly to the opinion and can be supported with facts.", "Ask: does this detail prove WHY the opinion is right?")
