"""
Grade 4 question bank, expansion 1: skills that had no items.
Original passages and items written for this platform (no publisher text).
Grammar items follow the rule summaries of the school's Wonders 2023 G4 materials.
Imported by build_bank.py AFTER the earlier modules, so existing refs never change.
"""
from qb import P, dd, err, fill, grade, match, mc, ms, order, tf

grade(4)

# ------------------------------------------------------------------ passages

P6 = P("G4-P6", "The Stick Bridge", "Realistic Fiction", """
Maya spread forty craft sticks across the kitchen table. The class bridge contest was on Thursday, and every bridge had to hold a dictionary for one full minute.

Her little brother Omar picked up a stick and frowned. “This one has a crack,” he said. Maya was busy reading the rules, so she tossed it into the pile without looking.

By Tuesday night the bridge looked perfect. Maya set the dictionary on top and counted. At twelve seconds, there was a sharp snap. The middle of the bridge sagged down to the table.

Maya’s face felt hot. “It’s ruined,” she said. “I don’t have time to start over.”

Omar pointed at the broken piece. It was the cracked stick. “Maybe we just need stronger shapes,” he said, holding up his math book. On the cover was a picture of a bridge made of triangles.

That night they replaced the weak stick and glued small triangles along both sides. On Thursday, Maya placed the dictionary on the bridge, and the whole class counted together. Sixty seconds passed. The bridge did not even wobble.

Maya grinned at Omar. “Next time,” she said, “I’ll listen when you find a crack.”
""")

P7 = P("G4-P7", "The Pearl Diver’s Daughter", "Historical Fiction", """
The summer sun was already hot when Noura walked down to the shore. It was 1932, and the wooden dhows rocked in the harbor of her small town on the Gulf. Today her father would sail out for the long pearling season.

Noura held the tiny bag of dates she had packed for him. Her father knelt and took her hand. “Do you remember your first trip to the shore?” he asked.

Noura did remember. She had been five years old. The waves had frightened her, and she had cried until her father lifted her onto his shoulders. From up there, the sea had looked like a sheet of blue glass, and she had stopped being afraid.

Now Noura was ten, and she was not afraid of the sea. She was afraid of the empty months without him.

“I will count the stars every night until you come home,” she said.

Her father smiled and pressed a smooth white shell into her palm. “Keep this,” he said. “When you hold it, you will hear the sea that is carrying me home.”

The dhow’s sail filled with wind. Noura held the shell to her ear and waved until the boat was only a speck on the bright water.
""")

P8 = P("G4-P8", "How Honeybees Share Directions", "Expository Text", """
Honeybees live and work together in large groups called colonies. One of the most amazing things about them is how they tell each other where to find food.

When a worker bee finds a field of flowers, she flies back to the hive. Inside, she performs a special movement called the waggle dance. She walks in a straight line while shaking her body from side to side, then circles back and does it again.

The direction of the straight line tells the other bees which way to fly. The length of time she waggles tells them how far away the flowers are. A longer waggle means the food is farther away.

If the flowers are very close to the hive, the bee does a simpler round dance instead. She moves in small circles, and the other bees know to search nearby.

Scientists learned about these dances by watching bees in hives with glass walls. Today, people who study bees still use these observations to understand how bees find the food they need to survive.
""")

P9 = P("G4-P9", "The Dripping Taps", "Expository Text", """
At Al-Noor Elementary, the fourth graders noticed something worrying. The taps in the school bathrooms dripped all day long. Some students also left the water running while they soaped their hands.

The class decided to measure the problem. They placed a cup under one dripping tap for one hour. By the end of the hour, the cup was almost full. Water that no one used was going down the drain every day.

First, the students wrote a letter to the principal, Mrs. Hassan, explaining what they had found. Next, the school asked a plumber to fix the leaking taps. Then the class made bright signs for each sink that said, “Turn off the tap while you soap.”

A month later, the students checked again. The taps no longer dripped, and teachers noticed that more students were turning off the water. The school’s water bill was lower, too.

The fourth graders learned that a small problem, noticed and measured, can lead to a big change.
""")

P10 = P("G4-P10", "Baking Bread in a Clay Oven", "Expository Text", """
In many villages, families have baked flat bread in round clay ovens for hundreds of years. Making the bread takes time and care.

Early in the morning, the baker mixes flour, water, salt, and yeast into a soft dough. The dough rests under a cloth for about an hour while it rises.

While the dough rises, the baker lights a fire inside the oven. The fire burns until the clay walls are very hot.

Next, the baker divides the dough into balls and stretches each one into a thin circle. Using a padded cushion, the baker presses each circle onto the hot inner wall of the oven.

After only a few minutes, the bread puffs up and turns golden brown. Finally, the baker lifts it off the wall with a long hook and stacks the warm bread in a basket.
""")

P11 = P("G4-P11", "Rain on the Roof", "Poetry", """
Pitter, patter, the rain begins,
tapping tin roofs with tiny pins.
Slow and low, the gray clouds go,
rolling over the road below.

Drip and drop on the window glass,
splashing puddles on the grass.
Then the sun slides out to say,
“Silver showers, slip away.”
""")

P12 = P("G4-P12", "Keeping Bees in the Mountains", "Expository Text", """
In the mountains of southern Saudi Arabia, some families have kept honeybees for generations. Beekeepers there place their hives near wild trees and flowering plants, such as the sidr tree.

Beekeepers watch the seasons closely. When flowers bloom in one valley, they may move their hives to be closer to the blossoms. Bees that live near many flowers do not have to fly as far to find food.

The bees turn the nectar from the flowers into honey and store it in wax cells. Beekeepers wear protective clothing and use gentle smoke to calm the bees before they collect some of the honey. They always leave enough honey in the hive for the bees to eat.

Honey from these mountains is famous for its rich taste, and many people buy it at local markets.
""")

import qb as _qb
_text = {p["id"]: p for p in _qb.PASSAGES}
BEES = P("G4-P13", "Honeybees: Two Texts", "Paired Texts",
         "Text 1: How Honeybees Share Directions\n\n" + _text["G4-P8"]["text"]
         + "\n\nText 2: Keeping Bees in the Mountains\n\n" + _text["G4-P12"]["text"])

# -------------------------------------------------------- plot: conflict (RL.4.3)

mc("plot-conflict", "RL.4.3", 2, "What is the main problem in “The Stick Bridge”?",
   "Maya’s bridge breaks before the contest.",
   [("Omar does not want to help Maya.", "Omar helps from the start; he is not the problem."),
    ("Maya cannot find any craft sticks.", "She has forty sticks at the very beginning."),
    ("The class cannot find a dictionary.", "The story never says the dictionary is missing.")],
   "When the bridge snaps at twelve seconds, Maya says, “It’s ruined.” That is the story’s problem.",
   "The conflict is the problem a character must solve. Look for the moment things go wrong.", P6)
mc("plot-conflict", "RL.4.3", 3, "How is the problem in “The Stick Bridge” solved?",
   "Maya and Omar replace the weak stick and add triangles.",
   [("Maya buys a new bridge kit from a store.", "Nothing in the story mentions buying a kit."),
    ("The teacher lets Maya skip the contest.", "Maya does enter the contest on Thursday."),
    ("Omar builds a different bridge by himself.", "They fix Maya’s bridge together.")],
   "The story says they “replaced the weak stick and glued small triangles along both sides,” and the bridge holds.",
   "The resolution is how the problem is solved. Look near the end of the story.", P6)
tf("plot-conflict", "RL.4.3", 2, "In “The Stick Bridge,” the problem is solved before the contest begins.", True,
   "They fix the bridge “that night,” and on Thursday it holds the dictionary for sixty seconds.",
   "Check when the fix happens compared with when the contest happens.", P6)
mc("plot-conflict", "RL.4.3", 4, "Why does Maya say, “I don’t have time to start over”?",
   "The contest is only two days away.",
   [("She has to go to bed right away.", "The story does not say that; the issue is the contest date."),
    ("Omar has hidden the craft sticks.", "Omar is helping, not hiding anything."),
    ("She has already finished her homework.", "That would give her more time, not less.")],
   "The bridge breaks on Tuesday night and the contest is on Thursday, so there is little time.",
   "Use details about time and days to explain a character’s words.", P6)
order("plot-conflict", "RL.4.3", 4, "Put the events of “The Stick Bridge” in order.",
      ["Omar finds a cracked stick.", "The bridge snaps during a test.", "Omar shows a picture of triangles.",
       "The bridge holds the dictionary for sixty seconds."],
      "The crack comes first, then the break, then the idea, and finally the success at the contest.",
      "Problem, attempts to solve it, and resolution usually happen in that order.", P6)
mc("plot-conflict", "RL.4.3", 5, "How does solving the problem change Maya?",
   "She decides to listen more carefully to her brother.",
   [("She decides never to enter a contest again.", "She is happy at the end, not discouraged."),
    ("She decides to build bridges only by herself.", "She worked with Omar and thanks him."),
    ("She decides that triangles are too hard to make.", "The triangles are what made the bridge strong.")],
   "Her last words are, “Next time, I’ll listen when you find a crack.”",
   "A character’s last words often show what they learned from the conflict.", P6)

# ---------------------------------------------------- plot: foreshadowing (RL.4.5)

mc("plot-foreshadowing", "RL.4.5", 3, "Which detail early in the story hints that the bridge will break?",
   "Omar finds a stick with a crack.",
   [("Maya spreads forty sticks on the table.", "This sets up the project but does not hint at trouble."),
    ("The contest is on Thursday.", "This tells when, not what will go wrong."),
    ("Maya reads the rules.", "Reading rules does not suggest a problem.")],
   "The cracked stick is the piece that later snaps, so the author hinted at the problem early.",
   "Foreshadowing is a clue that hints at what will happen later.", P6)
tf("plot-foreshadowing", "RL.4.5", 2, "In “The Stick Bridge,” the cracked stick is a clue about what happens later.", True,
   "Omar points out the crack, and later “It was the cracked stick” that broke.",
   "Notice details the author repeats later in the story.", P6)
mc("plot-foreshadowing", "RL.4.5", 4, "Why does the author show Maya tossing the cracked stick into the pile “without looking”?",
   "To show she is not paying attention, which leads to the problem.",
   [("To show she is very careful with her work.", "Tossing it without looking is the opposite of careful."),
    ("To show that Omar is wrong about the crack.", "The stick really was cracked; it broke later."),
    ("To show that the contest is easy.", "The contest turns out to be a challenge.")],
   "Her careless choice puts the weak stick in the bridge, and the bridge breaks because of it.",
   "Ask why the author included a small action. It often matters later.", P6)
mc("plot-foreshadowing", "RL.4.5", 5, "Which sentence from the story is foreshadowing?",
   "“This one has a crack,” he said.",
   [("Sixty seconds passed.", "This tells the result at the end, not a hint about the future."),
    ("Maya grinned at Omar.", "This shows her feelings at the end."),
    ("The bridge did not even wobble.", "This describes what happened, not a hint.")],
   "Omar’s warning comes early and points to the break that happens later.",
   "Foreshadowing appears before the event it hints at.", P6)
mc("plot-foreshadowing", "RL.4.5", 4, "In “The Pearl Diver’s Daughter,” Noura says she will count the stars “every night until you come home.” What does this suggest?",
   "Her father will be gone for a long time.",
   [("Noura is learning about astronomy.", "Counting stars here is about waiting, not science."),
    ("Her father will return the same night.", "The text calls it “the long pearling season.”"),
    ("Noura is afraid of the dark.", "Nothing suggests she fears the night.")],
   "Counting stars every night hints at many nights of waiting during a long season.",
   "A character’s promise can hint at what lies ahead.", P7)
mc("plot-foreshadowing", "RL.4.5", 6, "An author writes: “The sky was clear, but the old fisherman kept looking at a small dark cloud in the west.” What is this most likely foreshadowing?",
   "A storm may come later in the story.",
   [("The fisherman will catch many fish.", "The dark cloud does not connect to fishing success."),
    ("The story will end at sunrise.", "Nothing in the sentence points to the time of day."),
    ("The fisherman will move to the west.", "He is watching the cloud, not planning a move.")],
   "A clear sky with one worrying cloud, and a character who keeps watching it, hints at bad weather ahead.",
   "When a character keeps noticing something, the author may be preparing you for it.")

# ----------------------------------------------------- make predictions (RL.4.1)

mc("make-predictions", "RL.4.1", 2, "After Omar shows the picture of triangles, what will Maya and Omar most likely do?",
   "Use triangles to make the bridge stronger.",
   [("Give up on the contest.", "Omar has just offered an idea, so they are not giving up."),
    ("Start reading the math book.", "The picture is about bridges, not the lesson in the book."),
    ("Build a tower instead of a bridge.", "The contest is for bridges.")],
   "Omar says they need “stronger shapes” and shows a bridge made of triangles.",
   "Use what a character says and shows to predict what happens next.", P6)
mc("make-predictions", "RL.4.1", 3, "Based on the ending of “The Stick Bridge,” what will Maya most likely do in her next project?",
   "Check her materials and listen to Omar’s warnings.",
   [("Use only broken sticks.", "She learned that weak sticks cause problems."),
    ("Work without anyone’s help.", "She thanks Omar and wants his help next time."),
    ("Skip reading the rules.", "Reading the rules was not her mistake.")],
   "She says, “Next time, I’ll listen when you find a crack.”",
   "Predictions should match what a character has learned.", P6)
tf("make-predictions", "RL.4.1", 2, "At the end of “The Pearl Diver’s Daughter,” it makes sense to predict that Noura will keep the white shell safe.", True,
   "Her father asks her to keep it, and she holds it to her ear as he leaves.",
   "A good prediction is supported by details in the text.", P7)
mc("make-predictions", "RL.4.1", 4, "Which detail BEST supports the prediction that Noura will miss her father?",
   "She is “afraid of the empty months without him.”",
   [("The summer sun was already hot.", "This describes the weather, not her feelings."),
    ("The dhows rocked in the harbor.", "This describes the setting."),
    ("She had been five years old.", "This is part of her memory, not her feelings now.")],
   "Her fear of the empty months shows she will miss him while he is gone.",
   "Choose the detail that connects most directly to the prediction.", P7)
mc("make-predictions", "RL.4.1", 5, "Read: “Sami studied his spelling words every night and asked his sister to quiz him.” What is the BEST prediction?",
   "Sami will probably do well on his spelling test.",
   [("Sami will forget his spelling words.", "His careful practice makes this unlikely."),
    ("Sami’s sister will take the test for him.", "She quizzes him; she does not take his test."),
    ("Sami will stop studying tomorrow.", "Nothing suggests he will stop.")],
   "Studying every night and practicing with a partner usually lead to success.",
   "Combine text clues with what you already know to make a prediction.")
ms("make-predictions", "RL.4.1", 6, "Which TWO details help you predict that the bridge will hold at the contest?",
   ["They replaced the weak stick.", "They glued triangles along both sides."],
   [("Maya’s face felt hot.", "This shows her feelings after the break, not the strength of the bridge."),
    ("The contest was on Thursday.", "The day does not tell us whether the bridge will hold.")],
   "Removing the weak stick and adding triangles both make the bridge stronger.",
   "Look for details that show a problem has been fixed.", P6)

# ---------------------------------------------------------- plot: setting (RL.4.3)

mc("plot-setting", "RL.4.3", 2, "When does “The Pearl Diver’s Daughter” take place?",
   "In the summer of 1932",
   [("In the winter of 1932", "The story says “The summer sun was already hot.”"),
    ("In the present day", "The story names the year 1932."),
    ("At night during a storm", "The story happens in the hot daytime sun.")],
   "The first paragraph names the season (summer) and the year (1932).",
   "Setting includes when a story happens. Look for years, seasons and times of day.", P7)
mc("plot-setting", "RL.4.3", 2, "Where does “The Pearl Diver’s Daughter” take place?",
   "At the shore of a small town on the Gulf",
   [("In a busy city far from the sea", "The story happens at the shore and harbor."),
    ("On a mountain farm", "There are dhows and waves, not mountains."),
    ("Inside a school classroom", "Noura is at the shore with her father.")],
   "The story mentions the shore, the harbor and dhows in “her small town on the Gulf.”",
   "Setting includes where a story happens. Look for places and objects.", P7)
mc("plot-setting", "RL.4.3", 4, "Why is the setting important to the problem in this story?",
   "Pearling happens at sea, so Noura’s father must leave for months.",
   [("The hot sun makes Noura sick.", "The heat is described, but no one gets sick."),
    ("The harbor is too small for the dhows.", "The dhows fit; they are rocking in the harbor."),
    ("The town has no market for dates.", "Noura already has dates for her father.")],
   "Because the story takes place in a pearling town in summer, her father must sail away for the season.",
   "Ask how the time and place cause or shape the characters’ problems.", P7)
tf("plot-setting", "RL.4.3", 3, "The word “dhows” helps show that the story is set in a place where people sail on the sea.", True,
   "Dhows are wooden sailing boats, so the word shows that the setting is a seaside town.",
   "Special objects in a story are clues to its setting.", P7)
mc("plot-setting", "RL.4.3", 5, "How would the story be different if it were set in a desert town far from the sea?",
   "Noura’s father could not go pearling from that town.",
   [("Noura would not have a father.", "Changing the place does not change the characters."),
    ("The story would happen in the year 2032.", "Changing the place does not change the year."),
    ("Noura would be five years old.", "Her age does not depend on the place.")],
   "Pearling needs the sea, so the whole event of the story depends on the seaside setting.",
   "Imagine changing the setting. If the events no longer work, the setting is important.", P7)
mc("plot-setting", "RL.4.3", 6, "Which detail shows that the story takes place in the past?",
   "The town’s boats are wooden dhows with sails.",
   [("Noura has a father.", "This would be true at any time."),
    ("The sun is hot.", "The sun is hot today too."),
    ("Noura packed some dates.", "People still pack dates today.")],
   "Wooden sailing dhows used for a pearling season, together with the year 1932, show a time long ago.",
   "Look for objects or ways of life that belong to a particular time.", P7)

# -------------------------------------------------------- plot: flashback (RL.4.5)

mc("plot-flashback", "RL.4.5", 3, "Which part of “The Pearl Diver’s Daughter” is a flashback?",
   "Noura remembers being five and crying at the waves.",
   [("Noura packs a bag of dates.", "This happens in the present of the story."),
    ("Her father gives her a white shell.", "This happens on the day he sails."),
    ("The dhow’s sail fills with wind.", "This is the story’s ending, not a memory.")],
   "The story jumps back to when “She had been five years old.” That is a flashback.",
   "A flashback interrupts the story to show something that happened earlier.", P7)
tf("plot-flashback", "RL.4.5", 2, "A flashback tells about events that happened before the main story.", True,
   "A flashback goes back in time to an earlier event.",
   "Flash = quick; back = to the past.")
mc("plot-flashback", "RL.4.5", 4, "Which words signal that the story is moving back in time?",
   "“She had been five years old.”",
   [("“Now Noura was ten.”", "“Now” brings the story back to the present."),
    ("“The dhow’s sail filled with wind.”", "This is the present action of the story."),
    ("“Keep this,” he said.", "This is dialogue in the present.")],
   "“Had been” and the younger age show that we are hearing about an earlier time.",
   "Words like “had,” “remembered” and earlier ages signal a flashback.", P7)
mc("plot-flashback", "RL.4.5", 5, "Why does the author include the flashback?",
   "To show that Noura once feared the sea but now fears missing her father.",
   [("To explain how pearls are made.", "The flashback is about Noura’s feelings, not pearls."),
    ("To describe the market in the town.", "The market is not in the flashback."),
    ("To show that her father is a good swimmer.", "The memory is about her fear, not his swimming.")],
   "The memory contrasts her old fear of the waves with her new fear of the months without her father.",
   "Ask what the flashback helps you understand about a character now.", P7)
mc("plot-flashback", "RL.4.5", 4, "What brings the story back to the present after the flashback?",
   "“Now Noura was ten, and she was not afraid of the sea.”",
   [("“The waves had frightened her.”", "This is still part of the memory."),
    ("“She had stopped being afraid.”", "This is still in the past."),
    ("“From up there, the sea had looked like a sheet of blue glass.”", "This is still part of the memory.")],
   "The word “Now” and her present age (ten) return the reader to the day of the story.",
   "Look for words like “now” and “today” after a flashback.", P7)
order("plot-flashback", "RL.4.5", 6, "Put these events in the order they really happened in Noura’s life (not the order in which they are told).",
      ["Noura cries at the waves when she is five.", "Her father lifts her onto his shoulders.",
       "Ten-year-old Noura walks to the shore.", "Her father sails away on the dhow."],
      "The flashback events happened five years before the day the father sails.",
      "A flashback is told later but happened earlier. Arrange events by time, not by page.", P7)

# ---------------------------------------------- character perspective (RL.4.6)

mc("character-perspective", "RL.4.6", 3, "How does Noura feel about her father leaving?",
   "Sad and worried about the months without him",
   [("Excited because she wants to go pearling", "She is not going; she will wait at home."),
    ("Angry because he forgot her dates", "She packed the dates for him."),
    ("Afraid of the waves on the shore", "She was afraid as a five-year-old, not now.")],
   "She is “afraid of the empty months without him” and promises to count stars until he returns.",
   "A character’s perspective is how that character thinks and feels about events.", P7)
mc("character-perspective", "RL.4.6", 4, "How is Maya’s point of view different from Omar’s right after the bridge breaks?",
   "Maya thinks the bridge is ruined; Omar thinks it can be fixed.",
   [("Maya thinks it can be fixed; Omar wants to quit.", "It is the other way around."),
    ("Both think the bridge is ruined.", "Omar offers a solution, so he does not think that."),
    ("Both think the contest is not important.", "Both care about the contest.")],
   "Maya says, “It’s ruined.” Omar says, “Maybe we just need stronger shapes.”",
   "Compare what two characters say about the same event.", P6)
tf("character-perspective", "RL.4.6", 2, "In “The Stick Bridge,” Maya and Omar react the same way when the bridge breaks.", False,
   "Maya is upset and wants to give up, while Omar calmly suggests a solution.",
   "Read each character’s words carefully to find their point of view.", P6)
mc("character-perspective", "RL.4.6", 5, "How does Noura’s father seem to feel about leaving?",
   "Calm and caring, wanting to comfort Noura",
   [("Angry that Noura came to the shore", "He kneels and holds her hand, which is caring."),
    ("Uninterested in saying goodbye", "He gives her a special shell."),
    ("Frightened of the sea", "Nothing shows he is afraid; he smiles.")],
   "He kneels, takes her hand, smiles and gives her a shell so she will feel close to him.",
   "Actions can show a character’s feelings even when the character does not name them.", P7)
mc("character-perspective", "RL.4.6", 5, "Read: “Everyone cheered when the rain began, but Faisal stared at the soggy football field and sighed.” What is Faisal’s perspective?",
   "He is disappointed because the rain may stop his game.",
   [("He is happy about the rain like everyone else.", "He sighs instead of cheering."),
    ("He is excited to play in the mud.", "Sighing shows disappointment, not excitement."),
    ("He is afraid of thunder.", "Thunder is not mentioned.")],
   "While others cheer, Faisal stares at the field and sighs, showing a different feeling.",
   "When a character reacts differently from others, the author is showing a different point of view.")
mc("character-perspective", "RL.4.6", 6, "The story is told from the outside (third person). How would the ending change if Omar told it?",
   "We would hear Omar’s own thoughts about helping his sister.",
   [("We would learn the name of Maya’s teacher.", "The narrator choice does not add new facts like this."),
    ("The bridge would break at the contest.", "Changing the narrator does not change the events."),
    ("Maya would no longer be in the story.", "She would still be in the story; only the narrator changes.")],
   "A first-person narrator shares his own thoughts and feelings, so we would know how Omar felt.",
   "Point of view decides whose thoughts the reader can hear.", P6)

# -------------------------------------------------------------- visualize (RL.4.7)

mc("visualize", "RL.4.7", 2, "Which words help you picture the bridge breaking?",
   "“a sharp snap” and “sagged down to the table”",
   [("“forty craft sticks”", "This describes the materials, not the break."),
    ("“the class bridge contest”", "This names the event."),
    ("“Next time”", "These words do not create a picture.")],
   "The sound of a snap and the image of the middle sagging help you see and hear the break.",
   "To visualize, look for words that appeal to your senses.", P6)
mc("visualize", "RL.4.7", 3, "In the flashback, the sea “looked like a sheet of blue glass.” What should you picture?",
   "A calm, smooth, shining sea",
   [("A sea full of big crashing waves", "Glass is smooth, not wavy."),
    ("A broken window", "The sea is compared to glass; nothing is broken."),
    ("A dark, stormy sea", "“Blue glass” suggests calm and bright.")],
   "A sheet of glass is flat and shiny, so the sea looked calm and smooth.",
   "Comparisons help you build a picture in your mind.", P7)
mc("visualize", "RL.4.7", 3, "At the end, the boat becomes “only a speck on the bright water.” What does this help you see?",
   "The boat is very far away.",
   [("The boat is sinking.", "A speck shows distance, not sinking."),
    ("The boat is very large.", "A speck is tiny, so the boat looks small."),
    ("The water is dark and dirty.", "The water is described as “bright.”")],
   "A speck is a tiny dot, so the boat has sailed so far that it looks tiny.",
   "Think about how things look smaller when they are far away.", P7)
tf("visualize", "RL.4.7", 2, "In “Rain on the Roof,” the words “splashing puddles on the grass” help you picture the rain.", True,
   "You can see and hear the water splashing into puddles.",
   "Words that show action and sound help you visualize.", P11)
mc("visualize", "RL.4.7", 4, "Which line from “Rain on the Roof” helps you HEAR the rain?",
   "“tapping tin roofs with tiny pins”",
   [("“Slow and low, the gray clouds go”", "This helps you see the clouds."),
    ("“Then the sun slides out to say”", "This shows the sun coming out."),
    ("“rolling over the road below”", "This shows the clouds moving.")],
   "Tapping on tin makes a sound, so this line helps you hear the rain.",
   "Visualizing uses all your senses: sight, sound, touch, smell and taste.", P11)
mc("visualize", "RL.4.7", 5, "What picture do the last two lines of the poem create?",
   "The rain stops and the sunshine returns.",
   [("A thunderstorm starts.", "The sun is coming out, not a storm."),
    ("Silver coins fall from the sky.", "“Silver showers” describes the shiny rain."),
    ("The night sky fills with stars.", "The sun is out, so it is daytime.")],
   "The sun “slides out” and tells the showers to “slip away,” so the rain ends.",
   "Picture what the words describe, not their literal meaning.", P11)

# ----------------------------------------------- text structure: description (RI.4.5)

mc("description", "RI.4.5", 3, "How is most of “How Honeybees Share Directions” organized?",
   "It describes how bees use dances to share information.",
   [("It tells events in time order from one bee’s life.", "It does not follow one bee from birth to death."),
    ("It compares bees with ants.", "Ants are not mentioned."),
    ("It explains a problem and its solution.", "There is no problem being solved.")],
   "The article gives details about what the waggle dance and round dance are and what they show.",
   "A description structure gives details and features about one topic.", P8)
mc("description", "RI.4.5", 4, "Which detail describes the waggle dance?",
   "The bee walks in a straight line while shaking her body.",
   [("Bees live in colonies.", "This is about bees in general, not the dance."),
    ("Scientists watched hives with glass walls.", "This tells how people learned about the dance."),
    ("Bees need food to survive.", "This is not a description of the dance.")],
   "The second paragraph tells exactly what the dance looks like.",
   "Descriptive details tell what something looks like or how it works.", P8)
tf("description", "RI.4.5", 2, "A text with a description structure gives many details about one topic.", True,
   "Description gives features, characteristics and examples of a topic.",
   "Signal words for description include “for example,” “such as” and “looks like.”")
mc("description", "RI.4.5", 5, "What does the round dance tell other bees?",
   "The food is very close to the hive.",
   [("The food is very far away.", "A long waggle shows food is far; the round dance shows it is near."),
    ("The hive is in danger.", "The article does not mention danger."),
    ("It is time to sleep.", "The dances are about food.")],
   "The article says the round dance is used when flowers “are very close to the hive.”",
   "Find the paragraph that describes the round dance.", P8)
match("description", "RI.4.5", 4, "Match each bee movement with what it tells other bees.",
      [("Direction of the straight line", "Which way to fly"),
       ("Length of the waggle", "How far away the food is"),
       ("Small circles (round dance)", "The food is nearby")],
      "The article describes what each part of the dances means.",
      "In a description, each detail explains one feature of the topic.", passage=P8)
mc("description", "RI.4.5", 6, "Why did the author describe the dances in so much detail?",
   "To help readers understand how bees communicate without words.",
   [("To convince readers to buy honey.", "The article informs; it does not sell anything."),
    ("To tell a story about one famous bee.", "No single bee is the main character."),
    ("To explain how to build a beehive.", "Building hives is not discussed.")],
   "The details explain how direction and distance are shared through movement.",
   "Authors use description to help readers picture and understand a topic.", P8)

# ------------------------------------------------------- summarize (RI.4.2 / RL.4.2)

mc("summarize", "RI.4.2", 3, "Which is the BEST summary of “The Dripping Taps”?",
   "Students found that taps wasted water, got them fixed, and helped the school save water.",
   [("A cup was placed under a tap for one hour.", "This is one detail, not a summary of the whole text."),
    ("Mrs. Hassan is the principal of Al-Noor Elementary.", "This is a small detail."),
    ("Students like making bright signs.", "This is not the main point and is not stated.")],
   "A summary tells the most important ideas from beginning to end in a few words.",
   "Include the main problem, the key actions and the result. Leave out small details.", P9)
mc("summarize", "RI.4.2", 4, "Which detail is LEAST important to include in a summary of “Baking Bread in a Clay Oven”?",
   "The baker uses a padded cushion.",
   [("The dough must rise before baking.", "This is a key step."),
    ("The bread is baked on the hot wall of the oven.", "This is the main baking step."),
    ("The oven is heated with a fire.", "This is an important step.")],
   "The cushion is a small detail; the main steps are mixing, rising, heating, shaping and baking.",
   "Summaries keep main ideas and drop small details.", P10)
tf("summarize", "RI.4.2", 2, "A good summary includes your own opinion about the text.", False,
   "A summary retells the important ideas in your own words, without adding opinions.",
   "Summaries are short, accurate and objective.")
mc("summarize", "RL.4.2", 4, "Which sentence BEST summarizes “The Stick Bridge”?",
   "When Maya’s bridge breaks, she and Omar fix it with triangles, and it holds at the contest.",
   [("Maya has forty craft sticks and a dictionary.", "These are details from the beginning only."),
    ("Omar likes math books with pictures.", "This is not stated and is not the main idea."),
    ("The bridge contest happens every year.", "The story does not say this.")],
   "This sentence includes the problem, the solution and the result.",
   "A story summary includes the main character, the problem and how it is solved.", P6)
order("summarize", "RI.4.2", 5, "Put these sentences in order to make a summary of “How Honeybees Share Directions.”",
      ["Bees that find food return to the hive.", "They dance to show other bees where the food is.",
       "A waggle dance shows direction and distance; a round dance shows food is close.",
       "Scientists learned this by watching hives with glass walls."],
      "These sentences follow the article from finding food to how scientists learned about the dances.",
      "A summary follows the order of the main ideas in the text.", P8)
mc("summarize", "RI.4.2", 6, "A student wrote: “The fourth graders measured, wrote, fixed, signed, checked and saved.” What is wrong with this summary?",
   "It lists actions but does not explain the problem or why it mattered.",
   [("It is too long.", "It is very short; the problem is missing information."),
    ("It includes the student’s opinion.", "There is no opinion in it."),
    ("It uses words from the text.", "Using some key words is fine.")],
   "A useful summary explains the main problem (wasted water) and the result (saving water), not just a list of verbs.",
   "Check that a summary would make sense to someone who has not read the text.", P9)

# ------------------------------------------------ ask and answer questions (RI.4.1)

mc("ask-answer-questions", "RI.4.1", 2, "Which question is answered in the third paragraph of “How Honeybees Share Directions”?",
   "How do bees show how far away the food is?",
   [("Why do bees live in colonies?", "The text says they live in colonies but does not explain why."),
    ("What color are honeybees?", "Color is not mentioned."),
    ("How do beekeepers collect honey?", "That is in a different article.")],
   "The third paragraph says the length of the waggle shows how far away the flowers are.",
   "Match the question to the paragraph that gives the answer.", P8)
mc("ask-answer-questions", "RI.4.1", 3, "Which question can you answer using “The Dripping Taps”?",
   "What did the class do first to solve the problem?",
   [("How much did the plumber charge?", "The cost is not given."),
    ("What is the principal’s favorite subject?", "This is not in the text."),
    ("How many students go to Al-Noor Elementary?", "The number is not given.")],
   "The text says, “First, the students wrote a letter to the principal.”",
   "Good readers ask questions the text can answer, and find the evidence.", P9)
tf("ask-answer-questions", "RI.4.1", 3, "“The Dripping Taps” tells how full the cup was after one hour.", True,
   "The text says that “By the end of the hour, the cup was almost full.”",
   "Find the exact sentence that answers the question.", P9)
mc("ask-answer-questions", "RI.4.1", 4, "A reader asks, “How did scientists learn about the bee dances?” Which sentence answers this question?",
   "Scientists learned about these dances by watching bees in hives with glass walls.",
   [("Honeybees live and work together in large groups called colonies.", "This does not mention scientists."),
    ("A longer waggle means the food is farther away.", "This explains the dance, not how it was discovered."),
    ("She moves in small circles.", "This describes the round dance.")],
   "This sentence directly names how scientists studied the bees.",
   "Use key words from the question (scientists, learn) to find the answer.", P8)
mc("ask-answer-questions", "RI.4.1", 5, "Which question would be the MOST useful to ask before reading “Baking Bread in a Clay Oven”?",
   "What steps are needed to bake bread in a clay oven?",
   [("Do I like bread?", "Your opinion will not help you understand the text."),
    ("Who wrote this article?", "This does not help you understand the process."),
    ("Is the oven red?", "This detail is too small to guide your reading.")],
   "The title tells you the article explains a process, so asking about the steps guides your reading.",
   "Use the title and headings to ask questions that guide your reading.", P10)
mc("ask-answer-questions", "RI.4.1", 6, "Which question CANNOT be answered from “Keeping Bees in the Mountains”?",
   "How many beekeepers live in the mountains?",
   [("Why do beekeepers move their hives?", "The text says they move them closer to blooming flowers."),
    ("Why do beekeepers use smoke?", "The text says the smoke calms the bees."),
    ("Where is the honey sold?", "The text says it is sold at local markets.")],
   "The article never gives the number of beekeepers.",
   "Some questions need another source. Check whether the text really gives the answer.", P12)

# -------------------------------------------------------------- reread (RI.4.1)

mc("reread", "RI.4.1", 2, "You are not sure what the round dance means. What should you do?",
   "Reread the paragraph about the round dance.",
   [("Skip to the end of the article.", "The end does not explain the round dance."),
    ("Guess and keep reading.", "Rereading gives you real evidence instead of a guess."),
    ("Read only the title again.", "The title does not explain the dance.")],
   "Rereading the part that explains the round dance will clear up the confusion.",
   "When something is confusing, go back and reread that part slowly.", P8)
tf("reread", "RI.4.1", 2, "Rereading can help you find details you missed the first time.", True,
   "Good readers reread to check their understanding and find evidence.",
   "Rereading is a fix-up strategy, not a sign of a weak reader.")
mc("reread", "RI.4.1", 3, "After reading “The Dripping Taps,” you are not sure why the bill was lower. Which part should you reread?",
   "The paragraph about what happened a month later",
   [("The paragraph about the letter", "The letter came before the results."),
    ("The title", "The title does not explain the bill."),
    ("The first sentence only", "The first sentence introduces the problem.")],
   "The paragraph about checking a month later explains the fixed taps and the lower bill.",
   "Reread the part of the text that matches your question.", P9)
mc("reread", "RI.4.1", 4, "Rereading the second paragraph of “Baking Bread in a Clay Oven” helps you answer which question?",
   "How long does the dough rest?",
   [("How is the bread taken off the wall?", "That is in the last paragraph."),
    ("What is the oven made of?", "That is in the title and first paragraph."),
    ("Where is the bread stacked?", "That is in the last paragraph.")],
   "The second paragraph says the dough rests “for about an hour.”",
   "Know which paragraph covers which idea before you reread.", P10)
mc("reread", "RI.4.1", 5, "Why might a reader reread the sentence “The length of time she waggles tells them how far away the flowers are”?",
   "To understand how the dance shows distance",
   [("To learn the bee’s name", "Bees in the article are not named."),
    ("To find out what honey tastes like", "The sentence is about distance."),
    ("To count the paragraphs", "Counting paragraphs does not help understanding.")],
   "The sentence explains a key idea (distance), so rereading helps you understand it.",
   "Reread sentences that hold important or difficult ideas.", P8)
ms("reread", "RI.4.1", 6, "Which TWO are good reasons to reread a text?",
   ["To find evidence for an answer", "To clear up a confusing part"],
   [("To finish faster", "Rereading takes extra time; it is for understanding."),
    ("To skip the hard words", "Rereading helps with hard words; it does not skip them.")],
   "Readers reread to check understanding and to find evidence.",
   "Rereading is a tool for understanding.")

# ------------------------------------------------ sequence / chronology (RI.4.3, RI.4.5)

order("sequence", "RI.4.3", 2, "Put the bread-making steps in order.",
      ["Mix flour, water, salt and yeast.", "Let the dough rise under a cloth.",
       "Press the dough onto the hot oven wall.", "Take the bread off with a long hook."],
      "The article describes mixing, rising, baking and removing, in that order.",
      "Signal words like “early,” “next” and “finally” show the order of steps.", P10)
mc("sequence", "RI.4.5", 3, "What does the baker do WHILE the dough is rising?",
   "Lights a fire inside the oven",
   [("Takes the bread out of the oven", "This happens at the very end."),
    ("Stacks bread in a basket", "This is the last step."),
    ("Presses dough onto the wall", "This happens after the dough has risen.")],
   "The article says, “While the dough rises, the baker lights a fire inside the oven.”",
   "“While” means two things happen at the same time.", P10)
mc("sequence", "RI.4.5", 3, "Which word in “The Dripping Taps” signals the second step the class took?",
   "Next",
   [("First", "“First” signals the first step."),
    ("Then", "“Then” signals the third step."),
    ("Later", "This word is not used for the steps.")],
   "First they wrote a letter; next the plumber fixed the taps; then they made signs.",
   "Sequence words: first, next, then, after that, finally.", P9)
order("sequence", "RI.4.3", 4, "Put the events of “The Dripping Taps” in time order.",
      ["Students notice dripping taps.", "They measure water with a cup.", "They write to the principal.",
       "A plumber fixes the taps.", "They check again a month later."],
      "The article tells the events in the order they happened.",
      "Follow time words and the order of paragraphs.", P9)
mc("sequence", "RI.4.5", 5, "Why is a sequence structure a good choice for “Baking Bread in a Clay Oven”?",
   "Making bread is a process that must be done in a certain order.",
   [("It compares two kinds of bread.", "The article explains one process; it does not compare."),
    ("It tells a story with characters.", "The article has no characters."),
    ("It argues that bread is healthy.", "The article does not give an opinion.")],
   "Each step depends on the one before it, so time order helps readers follow the process.",
   "Authors choose sequence for processes, instructions and events over time.", P10)
mc("sequence", "RI.4.3", 6, "What would MOST likely happen if the baker skipped heating the oven?",
   "The bread would not bake properly on the cool walls.",
   [("The dough would rise faster.", "Heating the oven does not affect rising."),
    ("The bread would turn golden more quickly.", "Without heat, it cannot turn golden."),
    ("The bread would not need to be shaped.", "Shaping happens no matter what.")],
   "The bread bakes on the “hot inner wall,” so a cool oven would not cook it.",
   "In a process, each step has a reason. Think about why a step is needed.", P10)

# -------------------------------------- text structure: problem and solution (RI.4.5)

mc("problem-solution", "RI.4.5", 2, "What problem did the fourth graders find?",
   "Water was being wasted at the school sinks.",
   [("The school had no sinks.", "There were sinks with dripping taps."),
    ("The principal was not at school.", "The students wrote to her; she was there."),
    ("The cup was too small.", "The cup was used to measure the problem.")],
   "Taps dripped all day and some students left the water running.",
   "In a problem-and-solution text, the problem usually comes first.", P9)
mc("problem-solution", "RI.4.5", 3, "Which was one solution to the problem?",
   "A plumber fixed the leaking taps.",
   [("The students measured water in a cup.", "Measuring showed the problem; it did not solve it."),
    ("The taps dripped all day.", "This is the problem."),
    ("The cup was almost full.", "This shows how big the problem was.")],
   "Fixing the taps stopped the dripping, which solved part of the problem.",
   "A solution is an action that fixes the problem.", P9)
tf("problem-solution", "RI.4.5", 3, "In “The Dripping Taps,” making signs was part of the solution.", True,
   "The signs reminded students to turn off the tap while soaping.",
   "Some problems need more than one solution.", P9)
mc("problem-solution", "RI.4.5", 4, "How do you know the solutions worked?",
   "The taps stopped dripping and the water bill was lower.",
   [("The students wrote a letter.", "Writing a letter was an action, not proof that it worked."),
    ("The signs were bright.", "Bright signs do not prove they worked."),
    ("The cup was almost full.", "This was before the solutions.")],
   "The results a month later show the problem had been solved.",
   "Look for results or evidence after the solution.", P9)
match("problem-solution", "RI.4.5", 5, "Match each problem with the solution the class used.",
      [("Taps dripped all day", "A plumber fixed the taps"),
       ("Students left water running", "Signs reminded them to turn off the tap"),
       ("The principal did not know", "Students wrote her a letter")],
      "Each action answers a different part of the problem.",
      "Match each solution to the part of the problem it fixes.", passage=P9)
mc("problem-solution", "RI.4.5", 6, "Why did the author include the detail about the cup of water?",
   "To show that the problem was real and could be measured",
   [("To explain how to drink more water", "The cup measured wasted water."),
    ("To describe the school’s kitchen", "The taps were in the bathrooms."),
    ("To show that cups are useful", "The cup is evidence, not the topic.")],
   "The nearly full cup gave the class proof they could share with the principal.",
   "Evidence in a problem-and-solution text shows how serious the problem is.", P9)

# --------------------------------------------- sound devices (RL.4.4, L.4.5)

mc("sound-devices", "RL.4.4", 3, "Which group of words from “Rain on the Roof” shows alliteration?",
   "tapping, tin, tiny",
   [("splashing, puddles, grass", "These words begin with different sounds (s, p, g)."),
    ("window, glass, drip", "These words begin with different sounds (w, g, d)."),
    ("clouds, gray, low", "These words begin with different sounds (k, g, l).")],
   "“Tapping,” “tin” and “tiny” all begin with the same t sound.",
   "Alliteration is the repetition of the same beginning sound in nearby words.", P11)
mc("sound-devices", "RL.4.4", 4, "Which line repeats the long o sound (assonance)?",
   "“Slow and low, the gray clouds go,”",
   [("“Drip and drop on the window glass,”", "This repeats consonants, not the long o."),
    ("“Pitter, patter, the rain begins,”", "This repeats p and t sounds."),
    ("“splashing puddles on the grass.”", "There is no repeated long o sound.")],
   "“Slow,” “low” and “go” share the long o vowel sound.",
   "Assonance is the repetition of vowel sounds in nearby words.", P11)
tf("sound-devices", "RL.4.4", 2, "In “Silver showers, slip away,” the s sound is repeated.", True,
   "“Silver,” “showers” and “slip” begin with s sounds, which is alliteration.",
   "Say the words aloud to hear repeated sounds.", P11)
match("sound-devices", "L.4.5", 5, "Match each sound device with its example from the poem.",
      [("Alliteration", "tapping tin roofs with tiny pins"),
       ("Assonance", "Slow and low, the gray clouds go"),
       ("Onomatopoeia", "Pitter, patter")],
      "Repeated beginning sounds, repeated vowel sounds, and words that imitate sounds.",
      "Say each line aloud and listen for which sounds repeat.", passage=P11)
mc("sound-devices", "RL.4.4", 5, "Why does the poet repeat sounds in “Drip and drop”?",
   "To imitate the sound of rain falling",
   [("To show that the rain is dangerous", "Nothing in the poem suggests danger."),
    ("To explain where rain comes from", "The poem describes, not explains."),
    ("To make the poem longer", "Sound devices are chosen for effect, not length.")],
   "The short, repeated d sounds feel like drops hitting the glass.",
   "Poets use sound devices to help readers hear and feel what is described.", P11)
mc("sound-devices", "L.4.5", 6, "Which sentence uses consonance (a repeated consonant sound inside or at the end of words)?",
   "The black cat sat back on the mat.",
   [("Bright blue birds bounced by.", "This repeats beginning sounds (alliteration)."),
    ("The bee sees three trees.", "This repeats a vowel sound (assonance)."),
    ("Buzz went the busy bee.", "“Buzz” is onomatopoeia.")],
   "The t sound repeats at the end of “cat,” “sat” and “mat,” and the k sound in “black” and “back.”",
   "Consonance repeats consonant sounds that are not only at the beginning of words.")

# ------------------------------------------ compare and contrast texts (RI.4.9)

mc("compare-texts", "RI.4.9", 3, "What topic do “How Honeybees Share Directions” and “Keeping Bees in the Mountains” have in common?",
   "Honeybees",
   [("Clay ovens", "Clay ovens are in a different article."),
    ("Pearl diving", "Pearl diving is in a story, not these articles."),
    ("School water use", "That is in “The Dripping Taps.”")],
   "Both texts give information about honeybees.",
   "First find what two texts share, then look for differences.", BEES)
mc("compare-texts", "RI.4.9", 4, "How is the focus of the two bee texts different?",
   "One explains bee dances; the other explains how people keep bees.",
   [("Both explain only how honey tastes.", "Neither text focuses on taste."),
    ("One is about ants and one is about bees.", "Both are about bees."),
    ("Both tell a story about one beekeeper.", "Both are informational, not stories.")],
   "“How Honeybees Share Directions” is about dances; “Keeping Bees in the Mountains” is about beekeepers.",
   "Compare the main idea of each text.", BEES)
tf("compare-texts", "RI.4.9", 3, "Both bee texts say that bees need flowers to find food.", True,
   "One describes bees dancing to show where flowers are; the other says bees near many flowers fly less far.",
   "Look for a key idea that appears in both texts.", BEES)
mc("compare-texts", "RI.4.9", 5, "Using BOTH texts, why might beekeepers move hives near blooming flowers?",
   "So bees do not need to fly far, and dancing bees can lead others to food nearby.",
   [("Because bees cannot dance near flowers.", "The first text says bees dance about the flowers they find."),
    ("Because flowers keep bees warm at night.", "Neither text says this."),
    ("Because honey is sold near flowers.", "Honey is sold at markets, not near flowers.")],
   "Text 2 explains that nearby flowers mean shorter flights; Text 1 shows that bees share where nearby food is.",
   "Combine information from both texts to answer a bigger question.", BEES)
ms("compare-texts", "RI.4.9", 5, "Which TWO details come ONLY from “Keeping Bees in the Mountains”?",
   ["Beekeepers use gentle smoke to calm bees.", "Honey from the mountains is sold at local markets."],
   [("A longer waggle means the food is farther away.", "This is from the bee dance article."),
    ("Scientists watched hives with glass walls.", "This is from the bee dance article.")],
   "The smoke and the markets are only described in the mountain beekeeping text.",
   "Keep track of which text each detail comes from.", BEES)
mc("compare-texts", "RI.4.9", 6, "A student wants to write a report on how bees and people work together. Which text is MORE useful, and why?",
   "“Keeping Bees in the Mountains,” because it explains how beekeepers care for bees and collect honey.",
   [("“How Honeybees Share Directions,” because it explains bee dances.", "The dance article is about bees, not about people working with bees."),
    ("Neither text, because both are only about flowers.", "Both are about bees, not only flowers."),
    ("“The Dripping Taps,” because it is about saving water.", "That article is not about bees.")],
   "The mountain text describes what beekeepers do: moving hives, calming bees, and leaving honey.",
   "Choose the source that best matches the research question.", BEES)

# ============================================================ grammar & language

# ------------------------------------------------ subjects and predicates (L.4.1)

mc("subjects-predicates", "L.4.1", 1, "What is the complete subject? “The tall giraffe ate leaves from the tree.”",
   "The tall giraffe",
   [("ate leaves from the tree", "This is the complete predicate: what the giraffe did."),
    ("leaves", "This is part of the predicate."),
    ("the tree", "This is part of the predicate.")],
   "The complete subject tells who or what the sentence is about: the tall giraffe.",
   "Ask: Who or what is the sentence about?")
mc("subjects-predicates", "L.4.1", 2, "What is the simple subject? “My older cousin from Jeddah visited us on Friday.”",
   "cousin",
   [("older", "This word describes the cousin."),
    ("Jeddah", "This tells where the cousin is from."),
    ("visited", "This is the verb, part of the predicate.")],
   "The simple subject is the main noun in the complete subject: cousin.",
   "Remove the describing words; the main noun that is left is the simple subject.")
mc("subjects-predicates", "L.4.1", 3, "What is the simple predicate? “The students in Room 4 planted seeds in the garden.”",
   "planted",
   [("seeds", "This is a noun, not the main verb."),
    ("students", "This is the simple subject."),
    ("in the garden", "This phrase tells where; the main verb is “planted.”")],
   "The simple predicate is the main verb that tells what the subject did.",
   "Find the main action word in the predicate.")
tf("subjects-predicates", "L.4.1", 3, "In “Lina and Sara painted a mural,” the sentence has a compound subject.", True,
   "Two subjects, Lina and Sara, share the same predicate, joined by “and.”",
   "A compound subject is two or more subjects with the same predicate.")
mc("subjects-predicates", "L.4.1", 4, "Which sentence has a compound predicate?",
   "Ahmed washed the dishes and dried them.",
   [("Ahmed and Ali washed the dishes.", "This has a compound subject, not a compound predicate."),
    ("Ahmed washed the dishes quickly.", "There is only one predicate verb."),
    ("The clean dishes were on the shelf.", "There is only one predicate.")],
   "“Washed the dishes” and “dried them” are two predicates for the same subject.",
   "A compound predicate has two or more verbs for one subject, usually joined by and or or.")
fill("subjects-predicates", "L.4.1", 5, "Add a predicate to make a complete sentence: “The noisy crowd ____ when the team scored.”",
     ["cheered", "clapped", "shouted", "roared", "yelled", "jumped", "celebrated", "screamed"],
     "A predicate tells what the subject did, such as “cheered.”",
     "Every complete sentence needs a subject and a predicate.")

# ------------------------------------------- clauses and complex sentences (L.4.1)

mc("clauses-complex", "L.4.1", 2, "Which group of words is an independent clause?",
   "The bus arrived late.",
   [("Because the bus arrived late", "“Because” makes this a dependent clause."),
    ("When the bus arrived", "“When” makes this a dependent clause."),
    ("After the late bus", "This has no verb, so it is not a clause.")],
   "An independent clause has a subject and a verb and can stand alone as a sentence.",
   "Read it alone. If it makes a complete thought, it is independent.")
mc("clauses-complex", "L.4.1", 3, "Which word begins the dependent clause? “We stayed inside because it was very windy.”",
   "because",
   [("We", "“We” is the subject of the main clause."),
    ("inside", "This word is part of the main clause."),
    ("windy", "This is the last word, not the beginning of the clause.")],
   "“Because it was very windy” is a dependent clause that begins with the subordinating conjunction “because.”",
   "Dependent clauses often begin with because, when, before, after, if or although.")
tf("clauses-complex", "L.4.1", 3, "“When the bell rings” can stand alone as a complete sentence.", False,
   "It is a dependent clause; it leaves the reader asking, “What happens when the bell rings?”",
   "A dependent clause cannot stand alone as a sentence.")
mc("clauses-complex", "L.4.1", 4, "Which sentence is a complex sentence?",
   "After we ate lunch, we played football.",
   [("We ate lunch, and we played football.", "This is a compound sentence (two independent clauses)."),
    ("We ate lunch.", "This is a simple sentence."),
    ("We ate lunch and played football.", "This is a simple sentence with a compound predicate.")],
   "A complex sentence has an independent clause and at least one dependent clause (“After we ate lunch”).",
   "Look for a subordinating conjunction such as after, when or because.")
dd("clauses-complex", "L.4.1", 5, "Choose the best subordinating conjunction: “____ it rained all morning, the picnic went ahead in the afternoon.”",
   "Although",
   [("Because", "The picnic happened despite the rain, not because of it."),
    ("Until", "This does not make sense with the second clause."),
    ("And", "“And” is a coordinating conjunction, not a subordinating one.")],
   "“Although” shows a contrast: rain in the morning, but the picnic still happened.",
   "Choose the conjunction that shows the right relationship between ideas.")
match("clauses-complex", "L.4.1", 6, "Match each dependent clause with the main clause that completes it best.",
      [("Before you cross the street,", "look both ways."),
       ("Because the oven was hot,", "the bread baked quickly."),
       ("If you finish early,", "you may read a book.")],
      "Each dependent clause needs a main clause that completes the thought logically.",
      "Read each pair as one sentence to check that it makes sense.")

# ----------------------------------- compound sentences and conjunctions (L.4.1, L.4.2)

mc("compound-sentences", "L.4.1", 2, "Which sentence is a compound sentence?",
   "I wanted to swim, but the pool was closed.",
   [("I wanted to swim in the pool.", "This is a simple sentence."),
    ("Because the pool was closed, I went home.", "This is a complex sentence."),
    ("The pool and the gym were closed.", "This is a simple sentence with a compound subject.")],
   "It has two independent clauses joined by a comma and “but.”",
   "A compound sentence joins two complete sentences with a coordinating conjunction.")
mc("compound-sentences", "L.4.2", 3, "Where does the comma belong? “Huda read a book and her sister drew a picture.”",
   "After “book,” before “and”",
   [("After “Huda”", "A comma there would split the subject from its verb."),
    ("After “sister”", "That would split the second subject from its verb."),
    ("No comma is needed", "Two independent clauses joined by “and” need a comma before “and.”")],
   "Use a comma before the coordinating conjunction when it joins two independent clauses.",
   "Put the comma just before and, but or or when each part could be its own sentence.")
dd("compound-sentences", "L.4.1", 3, "Choose the conjunction: “Do you want rice ____ do you want bread?”",
   "or",
   [("but", "“But” shows contrast, not a choice."),
    ("so", "“So” shows a result."),
    ("because", "“Because” is not a coordinating conjunction.")],
   "“Or” shows a choice between two options.",
   "and = adds, but = contrasts, or = gives a choice, so = shows a result.")
dd("compound-sentences", "L.4.1", 4, "Choose the conjunction: “The road was icy, ____ the drivers went slowly.”",
   "so",
   [("but", "“But” shows a contrast; the second clause is a result."),
    ("or", "“Or” shows a choice."),
    ("nor", "“Nor” is used with negatives.")],
   "The drivers went slowly as a result of the icy road, so “so” fits.",
   "Ask how the two ideas are related: result, contrast, choice or addition.")
err("compound-sentences", "L.4.2", 5, ["The sun set", " and", " the stars came out", " slowly."], 0, "The sun set,",
    "A comma is needed before “and” because it joins two independent clauses.",
    "Check whether both parts could stand alone as sentences.")
mc("compound-sentences", "L.4.1", 6, "Which is the best way to combine these sentences? “Nasser likes math. He does not like spelling.”",
   "Nasser likes math, but he does not like spelling.",
   [("Nasser likes math, and he does not like spelling.", "“And” does not show the contrast between the ideas."),
    ("Nasser likes math he does not like spelling.", "This is a run-on sentence with no comma or conjunction."),
    ("Nasser likes math, so he does not like spelling.", "“So” suggests one causes the other, which is not true.")],
   "The ideas contrast, so a comma and “but” join them correctly.",
   "Choose the conjunction that matches the relationship between the ideas.")

# --------------------------------------------------- combining sentences (L.4.3)

mc("combining-sentences", "L.4.3", 2, "Combine the sentences: “Jamal washes the dishes. Teri washes the dishes.”",
   "Jamal and Teri wash the dishes.",
   [("Jamal washes and Teri washes the dishes.", "This repeats the verb and sounds awkward."),
    ("Jamal and Teri washes the dishes.", "The verb must be “wash” with a compound subject."),
    ("Jamal washes the dishes Teri.", "This does not make sense.")],
   "Join the two subjects with “and,” remove repeated words, and make the verb agree: wash.",
   "When you combine subjects, check that the verb agrees with the new plural subject.")
mc("combining-sentences", "L.4.3", 3, "Combine the sentences: “Our team won the game. Our team won the trophy.”",
   "Our team won the game and the trophy.",
   [("Our team won and our team won.", "This repeats words and leaves out what was won."),
    ("Our team won the game our team won the trophy.", "This is a run-on sentence."),
    ("The game and the trophy won our team.", "This changes the meaning.")],
   "Join the two objects with “and” and leave out the repeated words “Our team won.”",
   "Leave out words that repeat when you combine sentences.")
tf("combining-sentences", "L.4.3", 2, "“Mona sings. Mona dances.” can be combined as “Mona sings and dances.”", True,
   "The two predicates share one subject, so they can be joined with “and.”",
   "If two sentences have the same subject, you can join their predicates.")
mc("combining-sentences", "L.4.3", 4, "Combine the sentences using an appositive: “Mr. Salem teaches science. Mr. Salem is our neighbor.”",
   "Mr. Salem, our neighbor, teaches science.",
   [("Mr. Salem our neighbor teaches science.", "The appositive needs commas around it."),
    ("Mr. Salem teaches science our neighbor.", "The appositive is in the wrong place."),
    ("Our neighbor teaches Mr. Salem science.", "This changes the meaning.")],
   "An appositive renames a noun and is set off with commas: “our neighbor.”",
   "Place the appositive right after the noun it renames, with commas around it.")
mc("combining-sentences", "L.4.3", 5, "Which is the BEST combined sentence? “The kite was red. The kite was huge. The kite flew over the park.”",
   "The huge red kite flew over the park.",
   [("The kite was red and the kite was huge and the kite flew over the park.", "This repeats “the kite” three times."),
    ("The kite was red, huge, flew over the park.", "The verbs do not fit together correctly."),
    ("Over the park the red the huge kite flew.", "The word order is confusing.")],
   "Move the describing words before the noun and keep one predicate.",
   "Adjectives from short sentences can often move in front of the noun.")
err("combining-sentences", "L.4.3", 6, ["Fatima and her brother", " plays", " chess", " every evening."], 1, " play",
    "A compound subject joined by “and” is plural, so the verb must be “play.”",
    "After combining subjects, check subject-verb agreement.")

# ----------------------------------------------------- possessive nouns (L.4.2)

dd("possessive-nouns", "L.4.2", 1, "Choose the correct word: “The ____ tail was long and fluffy.”",
   "cat’s",
   [("cats", "This is plural, not possessive."),
    ("cats’", "This shows more than one cat."),
    ("cat", "The noun needs an apostrophe and s to show ownership.")],
   "One cat owns the tail, so add an apostrophe and s: cat’s.",
   "Singular possessive: add ’s.")
dd("possessive-nouns", "L.4.2", 2, "Choose the correct word: “The two ____ bikes were in the garage.”",
   "boys’",
   [("boy’s", "This shows one boy, but the sentence says “two.”"),
    ("boys", "This is plural, not possessive."),
    ("boyses", "This is not a word.")],
   "Plural nouns that end in s take only an apostrophe: boys’.",
   "Plural possessive ending in s: add only ’.")
dd("possessive-nouns", "L.4.2", 3, "Choose the correct word: “The ____ coats hung by the door.”",
   "children’s",
   [("childrens’", "“Children” does not end in s, so add ’s, not s’."),
    ("childs’", "The plural of child is children."),
    ("children", "The noun needs to show ownership.")],
   "For plural nouns that do not end in s, add an apostrophe and s: children’s.",
   "Irregular plurals (men, women, children, people) take ’s.")
mc("possessive-nouns", "L.4.2", 4, "Which sentence uses a possessive noun correctly?",
   "The teacher’s desk was covered with papers.",
   [("The teachers desk was covered with papers.", "It needs an apostrophe to show ownership."),
    ("The teacher’s were busy all day.", "This needs a plural (teachers), not a possessive."),
    ("The teachers’s desk was covered with papers.", "This adds an extra s.")],
   "One teacher owns the desk, so “teacher’s” is correct.",
   "Ask: Does the word show ownership? Is the owner singular or plural?")
err("possessive-nouns", "L.4.2", 5, ["The three girls’", " team won", " the schools", " trophy."], 2, " the school’s",
    "The trophy belongs to the school, so “school’s” needs an apostrophe and s.",
    "Check every noun that comes right before something it owns.")
match("possessive-nouns", "L.4.2", 6, "Match each phrase with its correct possessive form.",
      [("the toy of the dog", "the dog’s toy"),
       ("the toys of the dogs", "the dogs’ toys"),
       ("the hats of the women", "the women’s hats")],
      "One dog: ’s. Two dogs: s’. Women (plural without s): ’s.",
      "Decide singular or plural first, then whether the plural ends in s.")

# --------------------------------------- apostrophes and contractions (L.4.2)

dd("apostrophes-contractions", "L.4.2", 1, "Choose the contraction for “do not”: “I ____ like cold soup.”",
   "don’t",
   [("dont", "The apostrophe is missing."),
    ("do’nt", "The apostrophe goes where the letter o is missing."),
    ("doesn’t", "This means “does not.”")],
   "An apostrophe replaces the missing o: do not → don’t.",
   "In a contraction, the apostrophe takes the place of missing letters.")
fill("apostrophes-contractions", "L.4.2", 2, "Write the contraction for “it is”: “____ time to go home.”",
     ["It's", "It’s", "it's", "it’s"],
     "It is → it’s. The apostrophe replaces the i in “is.”",
     "Say both words quickly to hear the contraction.")
dd("apostrophes-contractions", "L.4.2", 3, "Choose the correct word: “The bird fed ____ babies.”",
   "its",
   [("it’s", "“It’s” means “it is,” which does not make sense here."),
    ("its’", "This is not a word."),
    ("it is", "“The bird fed it is babies” does not make sense.")],
   "“Its” is a possessive pronoun, and possessive pronouns do not have apostrophes.",
   "Try “it is.” If it does not make sense, use “its.”")
mc("apostrophes-contractions", "L.4.2", 4, "Which sentence uses an apostrophe correctly?",
   "They’re going to the museum today.",
   [("Their going to the museum today.", "“Their” shows ownership; the sentence needs “they are.”"),
    ("The book is your’s.", "Possessive pronouns like “yours” have no apostrophe."),
    ("The cat licked it’s paw.", "“It’s” means “it is”; the possessive is “its.”")],
   "“They’re” is the contraction of “they are,” which fits the sentence.",
   "Expand the contraction to check if it makes sense.")
match("apostrophes-contractions", "L.4.2", 5, "Match each contraction with the words it stands for.",
      [("we’ll", "we will"), ("wouldn’t", "would not"), ("she’s", "she is"), ("they’ve", "they have")],
      "Each apostrophe replaces the missing letters in the second word.",
      "Say the two words slowly, then quickly, to match the contraction.")
err("apostrophes-contractions", "L.4.2", 6, ["Its’", " a shame that", " the dog hurt", " its leg."], 0, "It’s",
    "The first word should be “It’s,” meaning “It is.” The second “its” is correct because it shows ownership.",
    "“It’s” = it is. “Its” = belonging to it. “Its’” is never correct.")

# ------------------------------- titles, abbreviations and letter format (L.4.2)

mc("titles-abbreviations", "L.4.2", 2, "Which is the correct abbreviation for “Doctor”?",
   "Dr.",
   [("dr", "Titles are capitalized and end with a period."),
    ("Dtr.", "This is not the standard abbreviation."),
    ("DR", "Only the first letter is capitalized, and a period is needed.")],
   "The title Doctor is abbreviated “Dr.” with a capital D and a period.",
   "Titles before names (Mr., Mrs., Dr.) begin with a capital and end with a period.")
mc("titles-abbreviations", "L.4.2", 3, "Which title of a story is written correctly?",
   "“The Lost Kite”",
   [("the lost kite", "Important words in a title need capital letters."),
    ("“The lost Kite”", "“Lost” is an important word and needs a capital."),
    ("“the Lost Kite”", "The first word of a title is always capitalized.")],
   "Story titles go in quotation marks, and the first word and important words are capitalized.",
   "Use quotation marks for stories, poems, songs and articles.")
tf("titles-abbreviations", "L.4.2", 3, "The title of a book should be underlined or written in italics.", True,
   "Long works such as books, movies and magazines are underlined or italicized.",
   "Short works go in quotation marks; long works are italicized or underlined.")
mc("titles-abbreviations", "L.4.2", 4, "Nadia recited a poem called desert moon at the assembly. How should the poem’s title be written?",
   "“Desert Moon”",
   [("Desert Moon (with no marks)", "The title of a poem needs quotation marks."),
    ("“desert moon”", "The first word and important words of a title need capitals."),
    ("‘Desert Moon’", "Use double quotation marks for a poem title.")],
   "Poem titles go in quotation marks, with the first word and important words capitalized.",
   "Short works (poems, songs, stories, articles) take quotation marks.")
mc("titles-abbreviations", "L.4.2", 5, "Which is the correct greeting for a friendly letter?",
   "Dear Aunt Mariam,",
   [("dear Aunt Mariam,", "The first word of a greeting is capitalized."),
    ("Dear Aunt Mariam.", "A friendly letter greeting ends with a comma."),
    ("Dear aunt mariam,", "A name and a title used as a name are capitalized.")],
   "Capitalize the first word and the name, and end the greeting with a comma.",
   "Friendly letter: greeting with a comma; closing such as “Your friend,” with a comma.")
order("titles-abbreviations", "L.4.2", 6, "Put the parts of a friendly letter in order.",
      ["Date", "Greeting (Dear Huda,)", "Body", "Closing (Your friend,)", "Signature"],
      "A friendly letter has five parts in this order.",
      "Remember: date, greeting, body, closing, signature.")

# =============================================================== vocabulary

# ------------------------------------------ connotation and denotation (L.4.5)

mc("connotation", "L.4.5", 2, "Which word has the most positive connotation?",
   "slender",
   [("skinny", "“Skinny” often sounds negative."),
    ("bony", "“Bony” sounds negative."),
    ("thin", "“Thin” is neutral, neither positive nor negative.")],
   "All four words mean “not heavy,” but “slender” suggests something graceful and pleasant.",
   "Connotation is the feeling a word gives, beyond its dictionary meaning.")
mc("connotation", "L.4.5", 3, "Which word gives a more negative feeling? “The old house was ____.”",
   "creepy",
   [("cozy", "“Cozy” has a warm, positive feeling."),
    ("charming", "“Charming” is positive."),
    ("quiet", "“Quiet” is mostly neutral.")],
   "“Creepy” suggests fear, which is a negative feeling.",
   "Think about how the word makes you feel.")
tf("connotation", "L.4.5", 2, "“Home” and “house” have the same denotation but different connotations.", True,
   "Both name a building where people live, but “home” suggests warmth and family.",
   "Denotation = dictionary meaning. Connotation = feeling.")
mc("connotation", "L.4.5", 4, "A writer wants readers to admire a boy who asks many questions. Which word should describe him?",
   "curious",
   [("nosy", "“Nosy” suggests poking into others’ business, which is negative."),
    ("pushy", "“Pushy” is negative."),
    ("rude", "“Rude” is negative.")],
   "“Curious” shows a positive love of learning, while the others sound negative.",
   "Writers choose words with connotations that match the feeling they want.")
match("connotation", "L.4.5", 5, "Match each neutral word with a word that has a more positive connotation.",
      [("cheap", "affordable"), ("talkative", "chatty"), ("old", "antique"), ("smell", "scent")],
      "Each pair has a similar meaning, but the second word sounds more pleasant.",
      "Ask which word you would rather hear about yourself or your things.")
mc("connotation", "RL.4.4", 6, "In a poem, the moon “crept” over the hills instead of “rose.” What feeling does “crept” add?",
   "A slow, quiet, slightly mysterious feeling",
   [("A fast and noisy feeling", "“Crept” means moving slowly and quietly."),
    ("A happy, sunny feeling", "The word suggests mystery, not cheerfulness."),
    ("No feeling; it means exactly the same as “rose”", "The dictionary meaning is similar, but the feeling is different.")],
   "“Crept” suggests slow, quiet movement, which adds mystery to the scene.",
   "Compare the feeling of the author’s word with a plain word.")

# ----------------------------------------- homographs and homophones (L.4.5.c)

dd("homographs-homophones", "L.4.5.c", 1, "Choose the correct word: “We ate dinner at ____ house.”",
   "their",
   [("there", "“There” tells where."),
    ("they’re", "“They’re” means “they are.”"),
    ("thier", "This is a misspelling.")],
   "“Their” shows ownership: the house belongs to them.",
   "their = belongs to them; there = a place; they’re = they are.")
dd("homographs-homophones", "L.4.5.c", 2, "Choose the correct word: “I can ____ the birds singing.”",
   "hear",
   [("here", "“Here” means in this place."),
    ("hair", "“Hair” grows on your head."),
    ("heer", "This is not a word.")],
   "“Hear” is what you do with your ears.",
   "Hear has the word ear inside it.")
mc("homographs-homophones", "L.4.5.c", 3, "Which pair of words are homophones?",
   "flower / flour",
   [("bat / bat", "These are spelled the same (homographs), not homophones."),
    ("big / large", "These are synonyms."),
    ("hot / cold", "These are antonyms.")],
   "Homophones sound the same but have different spellings and meanings.",
   "Homo = same, phone = sound.")
mc("homographs-homophones", "L.4.5.c", 4, "In which sentence does “bow” mean to bend forward?",
   "The actors bow at the end of the play.",
   [("She tied a bow in her hair.", "Here “bow” is a ribbon knot."),
    ("He shot an arrow with a bow.", "Here “bow” is a weapon."),
    ("The bow of the ship cut through the waves.", "Here “bow” is the front of a ship.")],
   "Actors bend forward to thank the audience, so “bow” means to bend.",
   "Homographs are spelled the same but have different meanings. Use context clues.")
mc("homographs-homophones", "L.4.5.c", 5, "Read: “The wind was too strong, so we had to wind the kite string back in.” How are the two words pronounced?",
   "Differently: wind (moving air) and wind (to turn)",
   [("The same in both places", "They are spelled the same but pronounced differently."),
    ("Both rhyme with “find”", "Only the second one rhymes with “find.”"),
    ("Both rhyme with “pinned”", "Only the first one rhymes with “pinned.”")],
   "The first “wind” rhymes with “pinned”; the second rhymes with “find.” They are homographs.",
   "Some homographs change pronunciation as well as meaning.")
err("homographs-homophones", "L.4.5.c", 6, ["The wind blew", " threw the open window", " and knocked", " over the vase."], 1, " through the open window",
    "“Through” means in one side and out the other. “Threw” is the past tense of “throw.”",
    "Homophones sound the same, so check the meaning of each spelling.")

# --------------------------------- dictionary, glossary and thesaurus (L.4.4.c)

mc("reference-materials", "L.4.4.c", 2, "Where would you look to find a synonym for “happy”?",
   "A thesaurus",
   [("An atlas", "An atlas has maps."),
    ("A glossary", "A glossary defines words from one book."),
    ("A calendar", "A calendar shows dates.")],
   "A thesaurus lists synonyms and antonyms.",
   "Thesaurus = words with similar meanings.")
mc("reference-materials", "L.4.4.c", 3, "What does a glossary contain?",
   "Meanings of important words used in that book",
   [("Synonyms for every word in English", "That is a thesaurus."),
    ("A list of chapters and page numbers", "That is a table of contents."),
    ("Maps of different countries", "That is an atlas.")],
   "A glossary is a small dictionary at the back of a book for words used in that book.",
   "Glossaries are in the back of nonfiction books and textbooks.")
tf("reference-materials", "L.4.4.c", 2, "A dictionary can show how to pronounce a word.", True,
   "Dictionary entries give pronunciation, syllables, meanings and parts of speech.",
   "Look for the respelling in parentheses after the entry word.")
mc("reference-materials", "L.4.4.c", 4, "Guide words at the top of a dictionary page are “mango” and “market.” Which word would be on that page?",
   "map",
   [("magic", "“Magic” comes before “mango” in ABC order."),
    ("mask", "“Mask” comes after “market.”"),
    ("melon", "“Melon” comes after “market.”")],
   "“Map” comes after “mango” (n before p) and before “market” (p before r).",
   "Guide words show the first and last words on the page. Use ABC order.")
mc("reference-materials", "L.4.4.c", 5, "A dictionary entry says: “bat (noun) 1. a club used to hit a ball 2. a flying animal.” Which meaning fits “The bat hung upside down in the cave”?",
   "Meaning 2",
   [("Meaning 1", "A club does not hang upside down in a cave."),
    ("Both meanings", "Only one meaning fits this sentence."),
    ("Neither meaning", "Meaning 2 fits the sentence.")],
   "Animals hang upside down in caves, so the second meaning fits.",
   "Read each meaning and test it in the sentence.")
order("reference-materials", "L.4.4.c", 6, "Put these words in the order they would appear in a dictionary.",
      ["camel", "camera", "camp", "canal", "candle"],
      "Compare letters one by one: cam-e-l, cam-e-r, cam-p, can-a, can-d.",
      "When the first letters match, compare the next letter.", qtype="WORD_ORDER")
