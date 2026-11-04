"""
Question bank top-up 2, batch 15: brings these families closer to the full target of 50 items
each (original content, Grades 4-6): negatives, plot-flashback, adjectives, poetry-elements,
homographs-homophones.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== negatives
grade(4)

mc("negatives", "L.4.1", 1,
   "The kitchen was completely empty; nothing was left in the fridge. Which word is a negative word?",
   "nothing",
   [("kitchen", "This names a place; it is a noun."),
    ("completely", "This is an adverb of degree, not a negative word."),
    ("fridge", "This is a noun.")],
   "“Nothing” means “not anything,” so it is a negative word.",
   "Negative words include no, not, never, nobody, nothing, nowhere.")

mc("negatives", "L.4.1", 1,
   "“Hassan has never visited the pyramids.” Which word makes this sentence negative?",
   "never",
   [("has", "This is a helping verb."),
    ("visited", "This is the main verb."),
    ("pyramids", "This is a noun.")],
   "“Never” means “not ever,” so it is the negative word.",
   "Negatives: no, not, never, nobody, nothing, nowhere, none.")

dd("negatives", "L.4.1", 2, "The twins didn’t bring ____ to the picnic.",
   "anything",
   [("nothing", "Pairing “didn’t” with “nothing” makes a double negative."),
    ("nowhere", "“Nowhere” does not fit after “bring.”"),
    ("none", "“Didn’t” plus “none” is a double negative.")],
   "“Didn’t” is already negative, so pair it with “anything,” not another negative.",
   "After n’t, use any-words: anything, anybody, anywhere, anyone.")

tf("negatives", "L.4.1", 2, "“Nobody never answered the phone” is a correctly written sentence.", False,
   "It has two negative words, “nobody” and “never”; only one negative is allowed in a sentence.",
   "Scan a sentence for two negative words — that is the double-negative trap.")

err("negatives", "L.4.1", 2,
    ["The fishermen", " couldn’t catch", " no fish", " that whole morning."], 2, " any fish",
    "“Couldn’t” is already negative, so pair it with “any fish,” not “no fish.”",
    "One negative word per sentence is enough.")

mc("negatives", "L.4.1", 3, "Which sentence has a double negative?",
   "Mona doesn’t want no help with her project.",
   [("Mona doesn’t want any help with her project.", "This sentence has only one negative word."),
    ("Mona wants no help with her project.", "This has only one negative word, so it is correct."),
    ("Mona doesn’t need help with her project.", "There is no negative-word problem in this sentence.")],
   "“Doesn’t” and “no” are both negative, creating a double negative.",
   "Look for two negative words working against each other.")

mc("negatives", "L.4.1", 3, "Which sentence is correct?",
   "There isn’t anybody in the hallway right now.",
   [("There isn’t nobody in the hallway right now.", "“Isn’t” plus “nobody” is a double negative."),
    ("There is anybody in the hallway right now.", "Without “isn’t,” this no longer matches the meaning that no one is there."),
    ("There isn’t no one in the hallway right now.", "“Isn’t” plus “no one” is a double negative.")],
   "“Isn’t” is already negative, so pair it with “anybody.”",
   "Negative verb + any-word gives one clear negative meaning.")

match("negatives", "L.4.1", 3,
      "Match each negative word with the “any-word” that replaces it after another negative.",
      [("no", "any"), ("nothing", "anything"), ("nobody", "anybody"), ("nowhere", "anywhere")],
      "Each negative word has a matching “any” word used after another negative is already present.",
      "Memorize the pairs: no→any, nothing→anything, nobody→anybody, nowhere→anywhere.")

mc("negatives", "L.4.1", 4, "Which revision correctly fixes the double negative in “The campers didn’t see nothing unusual in the forest”?",
   "The campers didn’t see anything unusual in the forest.",
   [("The campers didn’t seen nothing unusual in the forest.", "This still has two negative words and the wrong verb form."),
    ("The campers seen nothing unusual in the forest.", "The verb form “seen” is wrong without a helping verb, and this is still awkward."),
    ("The campers didn’t saw anything unusual in the forest.", "“Saw” cannot follow “didn’t”; it should be “see.”")],
   "“Didn’t” is already negative, so the sentence needs “anything,” not “nothing.”",
   "Fix a double negative by swapping one negative word for an any-word.")

err("negatives", "L.4.1", 4,
    ["Grandmother", " hasn’t told", " nobody", " about the surprise party."], 2, " anyone",
    "“Hasn’t” is already negative, so it should be paired with “anyone,” not “nobody.”",
    "Spot the second negative word hiding after a contraction with n’t.")

tf("negatives", "L.4.1", 4, "“He doesn’t have any pencils” is a double negative.", False,
   "Only one negative word, “doesn’t,” appears in this sentence; “any” is not a negative word itself.",
   "Any-words (any, anything, anybody) are neutral, not negative.")

mc("negatives", "L.4.1", 5, "Which sentence avoids a double negative correctly?",
   "The librarian couldn’t find any record of the overdue book.",
   [("The librarian couldn’t find no record of the overdue book.", "“Couldn’t” plus “no” is a double negative."),
    ("The librarian could find no none record of the overdue book.", "“No” and “none” together make a double negative, and the sentence is garbled."),
    ("The librarian didn’t found any record of the overdue book.", "“Found” is the wrong form after “didn’t”; it should be “find.”")],
   "“Couldn’t” is already negative, so “any record” keeps the sentence to one negative idea.",
   "Check every sentence for exactly one negative word.")

mc("negatives", "L.4.1", 5, "Which sentence uses “hardly” correctly?",
   "The detective could hardly find a clue at the scene.",
   [("The detective could hardly find no clue at the scene.", "“Hardly” plus “no” doubles the negative force."),
    ("The detective couldn’t hardly find a clue at the scene.", "“Couldn’t hardly” doubles the negative force of “hardly.”"),
    ("The detective could hardly found a clue at the scene.", "After “could,” use the base form “find,” not “found.”")],
   "“Hardly” already carries negative force, so it should not be paired with another negative word.",
   "Treat hardly, barely and scarcely like negatives — never double them up.")

err("negatives", "L.4.1", 5,
    ["The soccer team", " couldn’t hardly", " believe", " the final score."], 1, " could hardly",
    "“Couldn’t hardly” is a double negative; since “hardly” is already negative in force, use “could hardly.”",
    "Hardly, barely and scarcely act like negatives — never pair them with can’t, couldn’t or won’t.")

mc("negatives", "L.4.1", 6, "Which sentence uses “hardly” without a double negative?",
   "Youssef could hardly keep his eyes open during the long drive.",
   [("Youssef couldn’t hardly keep his eyes open during the long drive.", "“Couldn’t hardly” is a double negative."),
    ("Youssef hardly didn’t keep his eyes open during the long drive.", "This combines two negative forces and is ungrammatical."),
    ("Youssef can’t hardly never keep his eyes open during the long drive.", "This piles up three negative words together.")],
   "“Could hardly” expresses one negative idea clearly.",
   "If you already used hardly, barely or scarcely, do not add another negative word.")

mc("negatives", "L.4.1", 6, "Which sentence correctly uses “neither … nor”?",
   "Neither the twins nor their cousin wanted to leave the party early.",
   [("Neither the twins or their cousin wanted to leave the party early.", "“Neither” pairs with “nor,” not “or.”"),
    ("Either the twins nor their cousin wanted to leave the party early.", "“Either” pairs with “or,” not “nor.”"),
    ("Neither the twins nor their cousin didn’t want to leave the party early.", "Adding “didn’t” creates a double negative with “neither.”")],
   "“Neither … nor” is the correct matching pair for a negative idea about two things.",
   "Neither pairs with nor; either pairs with or.")

err("negatives", "L.4.1", 6,
    ["The scientists", " found neither", " evidence or", " a clear explanation."], 2, " evidence nor",
    "“Neither” must be paired with “nor,” not “or.”",
    "Check every “neither” for a matching “nor” later in the sentence.")

mc("negatives", "L.4.1", 7, "Which sentence has exactly one negative idea and is grammatically correct?",
   "Sara’s brother has barely finished his chores, so he can’t leave yet.",
   [("Sara’s brother hasn’t barely finished his chores, so he can’t leave yet.", "“Hasn’t barely” doubles the negative force of “barely.”"),
    ("Sara’s brother has barely finished no chores, so he can’t leave yet.", "“Barely” plus “no chores” is a double negative."),
    ("Sara’s brother can’t barely finish his chores, so he can’t leave yet.", "“Can’t barely” doubles the negative force of “barely.”")],
   "Each clause here has only one negative idea: “barely” in the first clause and “can’t” in the second.",
   "Check each clause of a sentence separately for double negatives.")

tf("negatives", "L.4.1", 7,
   "“Barely” and “hardly” behave like negative words, so they should not be combined with another negative such as “not” or “n’t.”",
   True,
   "Words like barely, hardly and scarcely already carry negative force, so pairing them with another negative creates a double negative.",
   "Treat barely, hardly and scarcely as hidden negatives.")

grade(5)

mc("negatives", "L.5.1", 1, "“The park rangers found nobody near the closed trail.” Which word is the negative word?",
   "nobody",
   [("rangers", "This is a noun."),
    ("found", "This is the main verb."),
    ("trail", "This is a noun.")],
   "“Nobody” means “not anybody,” so it is the negative word.",
   "Negative words include no, not, never, nobody, nothing, none.")

tf("negatives", "L.5.1", 1, "“None” is a negative word that means “not any.”", True,
   "“None” expresses the idea of “not any,” so it functions as a negative word.",
   "Treat none the same way you treat no, nothing and nobody.")

dd("negatives", "L.5.1", 2, "The beekeepers couldn’t find ____ of the missing hives.",
   "any",
   [("none", "“Couldn’t” plus “none” is a double negative."),
    ("no", "“Couldn’t” plus “no” is a double negative."),
    ("nothing", "“Nothing” does not fit grammatically before “of the missing hives.”")],
   "“Couldn’t” is already negative, so it should be paired with “any.”",
   "One negative word is enough to carry the meaning.")

err("negatives", "L.5.1", 2,
    ["Tariq’s grandfather", " hasn’t seen", " nothing", " like that storm before."], 2,
    " anything like that storm before",
    "“Hasn’t” is already negative, so the sentence needs “anything,” not “nothing.”",
    "Swap the second negative word for an any-word.")

mc("negatives", "L.5.1", 2, "Which sentence has a double negative?",
   "The chess team hasn’t lost no matches this season.",
   [("The chess team hasn’t lost any matches this season.", "Only one negative word appears, so this sentence is correct."),
    ("The chess team has lost no matches this season.", "This sentence has only one negative word."),
    ("The chess team hasn’t won every match this season.", "There is no double-negative problem in this sentence.")],
   "“Hasn’t” and “no” are both negative, creating a double negative.",
   "Watch for “n’t” followed by another negative word like “no.”")

match("negatives", "L.5.1", 3,
      "Match each negative word with the “any-word” used after another negative is present.",
      [("never", "ever"), ("no one", "anyone"), ("nowhere", "anywhere"), ("none", "any")],
      "Each negative word pairs with an any-word substitute once another negative word is already in the sentence.",
      "Build a mental list of negative/any-word pairs before you edit a sentence.")

mc("negatives", "L.5.1", 3, "Which sentence correctly completes this idea?",
   "The weather forecasters couldn’t find any pattern in the data.",
   [("The weather forecasters couldn’t find no pattern in the data.", "“Couldn’t” plus “no” is a double negative."),
    ("The weather forecasters could found any pattern in the data.", "After “could,” use the base verb “find,” not “found.”"),
    ("The weather forecasters didn’t found none of a pattern in the data.", "This sentence has both a double negative and a wrong verb form.")],
   "“Couldn’t” is already negative, so pairing it with “any” keeps the sentence to one negative idea.",
   "A single negative word, used correctly, is clearer than two.")

err("negatives", "L.5.1", 4,
    ["The new interns", " didn’t receive", " no training", " before their first shift."], 2,
    " any training before their first shift",
    "“Didn’t” is already negative, so “no training” must become “any training.”",
    "Underline every negative word, then check there is only one per clause.")

mc("negatives", "L.5.1", 4, "Which sentence uses “neither … nor” correctly?",
   "Rana could neither read the map nor remember the trail.",
   [("Rana could neither read the map or remember the trail.", "“Neither” pairs with “nor,” not “or.”"),
    ("Rana could either read the map nor remember the trail.", "“Either” pairs with “or,” not “nor.”"),
    ("Rana couldn’t neither read the map nor remember the trail.", "Adding “couldn’t” creates a double negative with “neither.”")],
   "“Neither … nor” correctly links the two things Rana could not do.",
   "Neither always needs a matching nor later in the sentence.")

tf("negatives", "L.5.1", 4, "“The hikers couldn’t barely see the trail markers in the fog” uses only one negative idea.",
   False,
   "“Couldn’t” and “barely” both carry negative force, so this sentence is a double negative.",
   "Barely is a hidden negative; it should not follow couldn’t.")

mc("negatives", "L.5.1", 5, "Which sentence is grammatically correct?",
   "The orchestra had scarcely begun to play when the lights went out.",
   [("The orchestra hadn’t scarcely begun to play when the lights went out.", "“Hadn’t scarcely” doubles the negative force of “scarcely.”"),
    ("The orchestra had scarcely begun to played when the lights went out.", "After “begun to,” use the base form “play,” not “played.”"),
    ("The orchestra scarcely hadn’t begun to play when the lights went out.", "Reordering the words still leaves two negative forces together.")],
   "“Had scarcely begun” expresses one clear negative idea.",
   "Scarcely already means “almost not,” so it needs no extra negative.")

err("negatives", "L.5.1", 5,
    ["The volunteers", " couldn’t locate", " nowhere", " to store the extra tents."], 2,
    " anywhere to store the extra tents",
    "“Couldn’t” is already negative, so “nowhere” must become “anywhere.”",
    "After a negative verb, switch any leftover negative word to its any-word form.")

mc("negatives", "L.5.1", 5, "Which revision removes the double negative from “The museum guide said there wasn’t nothing left to see in the east wing”?",
   "The museum guide said there wasn’t anything left to see in the east wing.",
   [("The museum guide said there wasn’t nothing left to see at the east wing.", "This still has two negative words."),
    ("The museum guide said there was nothing left to see in the east wing, not.", "Adding “not” at the end does not fix the double negative and is awkward."),
    ("The museum guide said there isn’t anything left to see in the east wing, not now.", "Adding “not now” creates a new double negative.")],
   "“Wasn’t anything” keeps the sentence to one negative idea.",
   "Fix a double negative by changing only the second negative word.")

mc("negatives", "L.5.1", 6, "Which sentence correctly uses “barely” without doubling the negative?",
   "Ibrahim had barely enough time to finish his breakfast.",
   [("Ibrahim hadn’t barely enough time to finish his breakfast.", "“Hadn’t barely” doubles the negative force."),
    ("Ibrahim had barely no time to finish his breakfast.", "“Barely” plus “no” is a double negative."),
    ("Ibrahim barely hadn’t time to finish his breakfast.", "Reordering the words does not remove the double negative.")],
   "“Had barely enough” expresses one negative idea about limited time.",
   "Barely already limits the meaning; it needs no second negative.")

err("negatives", "L.5.1", 6,
    ["The astronauts", " couldn’t hardly", " believe", " how quiet space felt."], 1,
    " could hardly believe",
    "“Couldn’t hardly” is a double negative; since “hardly” is already negative, use “could hardly.”",
    "Read the sentence aloud — two negative-sounding words together is a warning sign.")

tf("negatives", "L.5.1", 6,
   "“Neither” and “nor” are correlative words that should always be used together, not split between “neither” and “or.”",
   True,
   "“Neither” is a correlative word that is always completed by “nor,” never by “or.”",
   "Correlative pairs must match: neither/nor, either/or.")

mc("negatives", "L.5.1", 7, "Which sentence contains exactly one negative idea and is grammatically correct?",
   "Noor has hardly finished unpacking, and she can’t find her charger.",
   [("Noor hasn’t hardly finished unpacking, and she can’t find her charger.", "“Hasn’t hardly” doubles the negative force of “hardly.”"),
    ("Noor has hardly finished unpacking, and she can’t find no charger.", "“Can’t” plus “no charger” is a double negative."),
    ("Noor has hardly finished unpacking, and she can’t hardly find her charger.", "Repeating “hardly” after “can’t” doubles the negative force.")],
   "Each clause has only one negative idea: “hardly” in the first and “can’t” in the second.",
   "Check every clause of a long sentence separately for double negatives.")

mc("negatives", "L.5.1", 7, "Which sentence is correct?",
   "The marine biologists have never seen a coral reef recover this quickly.",
   [("The marine biologists haven’t never seen a coral reef recover this quickly.", "“Haven’t never” is a double negative."),
    ("The marine biologists have never seen no coral reef recover this quickly.", "“Never” plus “no” is a double negative."),
    ("The marine biologists haven’t seen never a coral reef recover this quickly.", "“Haven’t” plus “never” is still a double negative, regardless of word order.")],
   "“Have never seen” expresses one clear negative idea.",
   "Never is already a full negative — it never needs a partner negative.")

tf("negatives", "L.5.1", 7, "“I can’t hardly wait for the robotics competition” avoids a double negative.",
   False,
   "“Can’t” and “hardly” both carry negative force, creating a double negative; the correct form is “can hardly wait.”",
   "“Can hardly” (no n’t) is the correct way to say this.")

# ================================================================== plot-flashback
grade(4)

mc("plot-flashback", "RL.4.5", 1,
   "“Yara stared at the empty birdcage. Suddenly she remembered last summer, when her grandfather had first given her the canary, singing every morning on the porch. Then she blinked, and she was back in her silent room.” Which part of the passage is the flashback?",
   "The memory of her grandfather giving her the canary last summer.",
   [("Yara staring at the empty birdcage.", "This happens in the story’s present moment."),
    ("Yara blinking and returning to her room.", "This is the return to the present, not the flashback itself."),
    ("The whole passage is a flashback.", "Only the middle part about last summer is the flashback; the rest happens now.")],
   "A flashback is a memory of an earlier time; here it is the memory of her grandfather giving her the canary.",
   "Look for a sudden jump to an earlier time, often signaled by words like “remembered” or “last summer.”")

mc("plot-flashback", "RL.4.5", 1,
   "“Old Idris mended his net on the dock. He thought back to the storm ten years ago that had sunk his first boat. Then a gull’s cry snapped him back to the present.” Which words signal that the story is shifting into the past?",
   "He thought back to",
   [("mended his net", "This describes a present action."),
    ("a gull’s cry snapped him back", "This signals the return to the present, not the shift into the past."),
    ("on the dock", "This tells where he is now, not a shift in time.")],
   "“He thought back to” is the exact phrase that begins the memory of the old storm.",
   "Phrases like “thought back to” or “remembered” often open a flashback.")

tf("plot-flashback", "RL.4.5", 2, "A flashback interrupts the main story to show an event that happened earlier.", True,
   "By definition, a flashback pauses the present action to show something from the past.",
   "Flashback = flash BACK in time.")

mc("plot-flashback", "RL.4.5", 2,
   "The school garden club argued about who should water the plants. Then they remembered how, three months ago, the whole class had planted the first seed together on a rainy morning. Why might the author include that memory?",
   "To help readers understand why the characters care so much about the garden now.",
   [("To describe what rain looks like.", "The memory is about planting the seed, not describing weather for its own sake."),
    ("To introduce a brand-new character.", "No new character is introduced in the memory."),
    ("To end the story early.", "The memory happens in the middle of the story, not at the end.")],
   "The flashback shows the shared effort behind the garden, which explains the club’s strong feelings now.",
   "Ask: what does this memory explain about the characters’ present feelings?")

mc("plot-flashback", "RL.4.5", 2,
   "“Tamer tapped his drum. Back when he was six, his uncle had taught him this very rhythm by the fire. The school bell rang, and Tamer looked up.” Which phrase marks the START of the flashback?",
   "Back when he was six",
   [("Tamer tapped his drum.", "This happens in the present, before the flashback begins."),
    ("The school bell rang", "This marks the return to the present, not the start of the flashback."),
    ("Tamer looked up", "This happens after the flashback has already ended.")],
   "“Back when he was six” is the exact phrase that opens the memory of learning the rhythm.",
   "Age clues like “when he was six” often mark the start of a flashback.")

mc("plot-flashback", "RL.4.5", 3,
   "“The twins Dina and Rima argued over the old photograph. Three years earlier, they had planted a mango tree together on their birthday. Rima suddenly smiled and put the photo down.” Why does the author include the memory of planting the mango tree?",
   "To show why the photograph means so much to both sisters.",
   [("To explain how mango trees grow.", "The passage is not a science lesson about trees."),
    ("To show that the twins never get along.", "The memory actually shows a happy, shared moment, not constant conflict."),
    ("To introduce where the twins will travel next.", "The memory looks backward, not forward to a future trip.")],
   "The shared memory explains the emotional value of the photograph and why Rima’s mood changes.",
   "A flashback often reveals why an object matters to a character.")

order("plot-flashback", "RL.4.5", 3,
      "The caravan guide’s story mixes past and present. Put these events in the order they really happened (not the order the story tells them).",
      ["The guide’s father taught him to read the stars as a boy.",
       "The guide led his first caravan across the dunes alone.",
       "A sandstorm forced the guide to use the stars to find the way home.",
       "The guide now teaches his own son to read the stars."],
      "Chronological order follows when events truly happened, even though a story may tell them out of order.",
      "Look for time clues like ages, “years before,” or “the first time” to rebuild the real order.")

tf("plot-flashback", "RL.4.5", 3, "A story can include more than one flashback.", True,
   "Authors can use several flashbacks to reveal different moments from a character’s past.",
   "Don’t assume a story has only one memory scene — check the whole passage.")

mc("plot-flashback", "RL.4.5", 4,
   "“Huda checked the hives calmly. She remembered the panic of her first sting as a child, screaming and running from the bees. Now she moved among them without fear.” How would the passage change if the flashback were removed?",
   "Readers would not understand why Huda’s calmness now is such a big change.",
   [("The passage would be exactly the same length.", "Removing several sentences would shorten the passage."),
    ("Readers would learn more about bees in general.", "The flashback is about Huda’s own fear, not bee facts."),
    ("The ending would happen earlier in time.", "Removing the flashback does not move the ending’s place in time.")],
   "The flashback contrasts Huda’s past fear with her present calm, which gives her growth its meaning.",
   "Ask what the flashback contrasts with the present moment.")

mc("plot-flashback", "RL.4.5", 4,
   "“The ferry captain closed his eyes. Decades ago, his own father had captained this same river route. A horn blast jolted him back to the wheel.” Which words signal the return to the present?",
   "A horn blast jolted him back to the wheel.",
   [("Decades ago, his own father had captained this same river route.", "This sentence is inside the flashback, not the return from it."),
    ("The ferry captain closed his eyes.", "This sentence begins the flashback, not the return from it."),
    ("his own father had captained this same river route", "This phrase is part of the flashback memory.")],
   "“Jolted him back to the wheel” shows the captain returning to the present moment.",
   "Sudden sounds or actions often snap a character back to the present.")

order("plot-flashback", "RL.4.5", 4,
      "Adel’s story about his lamb jumps around in time. Put these events in the order they really happened.",
      ["Adel’s grandfather gave him his first lamb as a gift.",
       "Adel lost that lamb during a storm one winter.",
       "Adel found the lamb two days later near a cave.",
       "Adel now tells this story to remind himself to watch every lamb carefully."],
      "The true order starts with the gift, then the loss, the finding, and finally the lesson Adel carries today.",
      "A flashback often ends with the lesson the character learned from the past event.")

mc("plot-flashback", "RL.4.5", 5,
   "An old astronomer’s diary opens with her standing on her roof tonight. Then it describes the night, fifty years before, when she first saw a comet as a young girl. Why might the author include that early memory?",
   "To explain why the astronomer still searches the sky every night.",
   [("To describe what the astronomer eats for dinner.", "The memory is about seeing a comet, not about meals."),
    ("To show that the astronomer dislikes the night sky.", "The memory actually shows her love of the sky beginning, not dislike."),
    ("To predict the weather for next week.", "A memory of the past cannot predict future weather.")],
   "The early memory of seeing a comet explains the lifelong passion behind her nightly habit.",
   "A flashback about a first experience often explains a lifelong passion.")

tf("plot-flashback", "RL.4.5", 5,
   "Flashbacks are always printed in a different font or color so readers notice them.", False,
   "Flashbacks are usually signaled by words and context clues, such as “years before” or “remembered,” not special formatting.",
   "Look for signal words, not special text styles, to spot a flashback.")

mc("plot-flashback", "RL.4.5", 5,
   "“Salma shaped the clay slowly. Years before, her mother had shown her this exact spinning motion in their small courtyard. Salma smiled and kept turning the wheel.” Which sentence is the flashback?",
   "Years before, her mother had shown her this exact spinning motion in their small courtyard.",
   [("Salma shaped the clay slowly.", "This describes the present moment."),
    ("Salma smiled and kept turning the wheel.", "This happens after the flashback, back in the present."),
    ("All three sentences are the flashback.", "Only the middle sentence describes an earlier time; the others are in the present.")],
   "The middle sentence describes an earlier time, marked by “years before,” so it is the flashback.",
   "Only the sentence(s) describing the earlier time count as the flashback.")

mc("plot-flashback", "RL.4.5", 6,
   "A mountain guide’s story begins with him resting near the summit, then flashes back to the difficult climb earlier that morning, before returning to the summit view. What effect does placing the flashback here create?",
   "It builds suspense by delaying what happens at the summit.",
   [("It makes the climb seem easy.", "The flashback describes a difficult climb, so it does not make the climb seem easy."),
    ("It removes all tension from the story.", "Delaying the summit scene actually adds tension, not removes it."),
    ("It changes the setting to a different mountain.", "The flashback is about the same mountain, earlier in the day.")],
   "Delaying the view from the summit by inserting the climb keeps readers wondering what the guide will see.",
   "Authors often place a flashback right before an important moment to build suspense.")

match("plot-flashback", "RL.4.5", 6,
      "Match each signal phrase to its function in a story.",
      [("Years before,", "starts a flashback"),
       ("Suddenly, the alarm rang.", "ends a flashback"),
       ("She still remembered that day.", "starts a flashback"),
       ("Back in the present,", "ends a flashback")],
      "Certain phrases consistently open a memory, while others snap the story back to now.",
      "Learn a short list of common flashback signal phrases.")

order("plot-flashback", "RL.4.5", 6,
      "A baker’s story about her bakery jumps in time. Put these events in the order they really happened.",
      ["Nadia’s grandmother taught her to knead bread before sunrise.",
       "Nadia opened her own small bakery as a teenager.",
       "A fire damaged Nadia’s bakery last year.",
       "Nadia rebuilt the bakery using her grandmother’s old recipe."],
      "The real order moves from the earliest lesson to the most recent rebuilding.",
      "Build a timeline using clues about age and “last year” versus “as a teenager.”")

mc("plot-flashback", "RL.4.5", 7,
   "A story about a toy maker opens with a broken toy on his workbench today, then flashes back to show how he built his very first toy as a boy. Why might the author choose to start in the present instead of telling events in order?",
   "Starting in the present creates a question that the flashback later answers.",
   [("Starting in the present makes the story shorter.", "Starting point does not change how much happens in the story."),
    ("Starting in the present removes the need for any ending.", "Every story still needs an ending, no matter where it starts."),
    ("Starting in the present confuses readers on purpose with no reason.", "Authors use this structure deliberately to build curiosity, not to confuse without purpose.")],
   "Opening with the broken toy raises a question about the toy maker’s past, which the flashback then answers.",
   "Ask what question the opening scene raises that the flashback later answers.")

mc("plot-flashback", "RL.4.5", 7,
   "A swimmer named Karim holds his old, dented first medal while flashing back to a hard, losing race years ago; the story ends with him holding a shiny new medal. Why does the author include both medals?",
   "To show how far Karim has come since his first difficult race.",
   [("To prove that medals are not important to Karim.", "The story centers on both medals, showing they matter to him."),
    ("To explain how medals are manufactured.", "The passage is about Karim’s growth, not a factory process."),
    ("To suggest Karim will stop swimming soon.", "Nothing in the passage suggests Karim plans to quit.")],
   "Comparing the old medal from a loss with the new medal highlights Karim’s growth over time.",
   "When a story shows the same object twice, compare what it meant then and now.")

grade(5)

mc("plot-flashback", "RL.5.5", 1,
   "“The marathon runner stretched at the starting line. She remembered her very first race, years ago, when she had quit after only one mile. A whistle blew, and she focused on the road ahead.” Which part of the passage is the flashback?",
   "The memory of quitting her first race after one mile, years ago.",
   [("The runner stretching at the starting line.", "This happens in the present moment of the story."),
    ("The whistle blowing.", "This signals the return to the present, not the flashback."),
    ("The runner focusing on the road ahead.", "This happens after the flashback has ended.")],
   "The memory of her first race, marked by “years ago,” is the flashback.",
   "Find the sentence or sentences describing an earlier time, then check where the story returns to now.")

tf("plot-flashback", "RL.5.5", 1,
   "A flashback can be as short as a single sentence or as long as several paragraphs.", True,
   "Flashbacks vary in length; some are brief memories, while others unfold in detail over several paragraphs.",
   "Length is not the test for a flashback — the shift in time is.")

mc("plot-flashback", "RL.5.5", 2,
   "“The old carpenter sanded the chair leg. In his mind, he was suddenly back in his father’s workshop forty years earlier, learning to hold a chisel for the first time. The radio crackled, and he was back in his own shop.” Which words signal the shift into the past?",
   "In his mind, he was suddenly back in",
   [("The old carpenter sanded the chair leg.", "This describes the present action."),
    ("The radio crackled", "This signals the return to the present, not the shift into the past."),
    ("he was back in his own shop", "This describes the present, after the flashback ends.")],
   "“In his mind, he was suddenly back in” is the exact phrase that opens the memory of the workshop.",
   "Phrases about the mind or being “back in” a place often open a flashback.")

mc("plot-flashback", "RL.5.5", 2,
   "A ship’s navigator studies a torn, old map today, then flashes back to the storm years ago when the map was torn while saving the crew. Why does the author include that memory?",
   "To explain why the navigator still keeps and values the torn, old map.",
   [("To describe how maps are printed.", "The memory is about a storm, not about map-making."),
    ("To show that the navigator dislikes sailing.", "The memory actually shows the navigator’s courage during the storm, not dislike of sailing."),
    ("To introduce the navigator’s childhood friend.", "No childhood friend is introduced in this memory.")],
   "The memory of the storm explains the personal history and value behind the torn map.",
   "A flashback about an object’s history often explains why a character keeps it.")

order("plot-flashback", "RL.5.5", 2,
      "A passage about two rival inventors jumps in time. Put these events in the order they really happened.",
      ["The two inventors were childhood friends who built toys together.",
       "The inventors had a disagreement over a shared design and became rivals.",
       "Each inventor built a competing machine on their own.",
       "The inventors finally combined their designs into one working machine."],
      "The timeline moves from early friendship, through the disagreement, to separate work, and finally to reconciliation.",
      "List the relationship stages in order: friendship, conflict, separation, and reunion.")

mc("plot-flashback", "RL.5.5", 3,
   "Which best describes the difference between a flashback and foreshadowing?",
   "A flashback shows a past event; foreshadowing hints at a future event.",
   [("A flashback hints at the future; foreshadowing shows the past.", "This reverses the correct definitions of the two terms."),
    ("They are two different names for the exact same technique.", "They point in opposite directions in time, so they are not the same technique."),
    ("A flashback only happens in poems; foreshadowing only happens in stories.", "Both devices can appear in poems, stories, or any narrative.")],
   "A flashback moves backward in time to show a past event, while foreshadowing hints at something yet to come.",
   "Flashback = back in time; foreshadowing = forward hint.")

tf("plot-flashback", "RL.5.5", 3,
   "Several flashbacks placed throughout a story can build up a fuller picture of a character’s history.", True,
   "Each flashback can reveal a different piece of a character’s past, which together build a fuller history.",
   "Think of multiple flashbacks as puzzle pieces of a character’s past.")

match("plot-flashback", "RL.5.5", 3,
      "Match each signal phrase to its function in a story.",
      [("That reminded her of", "starts a flashback"),
       ("The ringing phone pulled him back to now", "ends a flashback"),
       ("Long before this voyage,", "starts a flashback"),
       ("In the present moment,", "ends a flashback")],
      "Certain phrases consistently open a memory, while others return the story to the present.",
      "Build a list of common phrases for starting and ending a flashback.")

mc("plot-flashback", "RL.5.5", 4,
   "A night nurse pauses by a patient’s bed, then flashes back to the night years earlier when she herself was a frightened patient in that same hospital. If this flashback were removed, how would the passage change?",
   "Readers would not understand why the nurse treats her patients with such gentle patience.",
   [("The hospital setting would change to a school.", "Removing the flashback does not change where the present scene takes place."),
    ("The passage would gain new characters.", "Removing a section typically removes content, not add new characters."),
    ("The nurse’s patient would recover instantly.", "The flashback does not affect the patient’s medical recovery.")],
   "The flashback connects the nurse’s own past fear to her gentle care now, giving her behavior a deeper meaning.",
   "Ask what the flashback explains about a character’s present behavior.")

order("plot-flashback", "RL.5.5", 4,
      "A passage about a night nurse moves between past and present. Put these events in the order they really happened.",
      ["The nurse was a frightened young patient in this same hospital.",
       "The nurse decided then that she wanted to help scared patients someday.",
       "The nurse studied nursing for several years after finishing school.",
       "The nurse now works the night shift, comforting frightened patients."],
      "The real order runs from her own frightening stay, through her decision and training, to her current work.",
      "Look for clues about her age and role to place each event in time.")

mc("plot-flashback", "RL.5.5", 4,
   "“The wildlife photographer lowered her camera. Ten years earlier, as a nervous intern, she had missed the shot of a lifetime because her hands shook. Now her hands were perfectly steady.” Which sentence is the flashback?",
   "Ten years earlier, as a nervous intern, she had missed the shot of a lifetime because her hands shook.",
   [("The wildlife photographer lowered her camera.", "This describes the present moment."),
    ("Now her hands were perfectly steady.", "This describes the present, after the flashback has ended."),
    ("All three sentences describe the same moment in time.", "The middle sentence clearly describes an earlier time, ten years before.")],
   "The sentence marked “ten years earlier” describes the past, making it the flashback.",
   "A time-marker phrase like “ten years earlier” signals the flashback sentence.")

tf("plot-flashback", "RL.5.5", 5,
   "A flashback must always be introduced by the exact word “flashback.”", False,
   "Flashbacks are usually introduced through context clues and time-signal phrases, not the literal word “flashback.”",
   "Readers infer a flashback from clues like “years before” or “she remembered,” not a label.")

mc("plot-flashback", "RL.5.5", 5,
   "A retired teacher watches her former students graduate, then flashes back to her own difficult first year of teaching, struggling to control a noisy classroom. How does this flashback connect to the theme of the passage?",
   "It shows that patience and growth over time lead to the pride she feels at the graduation.",
   [("It shows that teaching never gets easier with experience.", "The flashback actually contrasts her difficult start with her later success, showing growth."),
    ("It proves that her first year of teaching was her best year.", "The flashback describes struggle, not her best year of teaching."),
    ("It explains why the graduation was canceled.", "Nothing in the passage suggests the graduation was canceled.")],
   "The flashback’s struggle contrasts with the present pride, reinforcing a theme of growth through experience.",
   "Connect a flashback’s content to the feeling or lesson shown in the present scene.")

order("plot-flashback", "RL.5.5", 5,
      "A passage about a young coder jumps between past attempts and the present. Put these events in the order they really happened.",
      ["The coder’s first program crashed the computer during a school demonstration.",
       "The coder spent an entire summer studying how programs are built.",
       "The coder built a simple working app the following year.",
       "The coder now leads a small team building a much larger app."],
      "The order moves from the early failure, through a summer of study, to small success, and finally to leadership.",
      "Look for clues about school years and seasons to rebuild the timeline.")

mc("plot-flashback", "RL.5.5", 6,
   "A mapmaker’s story saves a flashback about a fatal mistake on an early map for the very end, just before revealing why a modern explorer nearly got lost using an old copy. What effect does placing the flashback near the end create?",
   "It delivers a twist that reframes everything readers thought they understood about the mapmaker.",
   [("It makes the ending less important than the middle of the story.", "Placing key information at the end usually increases, not decreases, its importance."),
    ("It removes any need for a conclusion.", "The story still needs a conclusion after the flashback is revealed."),
    ("It confirms the explorer’s route was always safe.", "The flashback actually explains a danger connected to the old map, not safety.")],
   "Revealing the mapmaker’s old mistake late in the story creates a surprising twist that changes readers’ understanding.",
   "A late-placed flashback often works as a twist that recontextualizes earlier events.")

mc("plot-flashback", "RL.5.5", 6,
   "A lighthouse keeper’s daughter keeps her father’s old, cracked lantern on her shelf, flashing back to the storm when he used it to guide a ship to safety; the story ends with her lighting her own new lantern during a storm. Why might the author include both lanterns?",
   "To show that the daughter is carrying on her father’s legacy of guiding others safely.",
   [("To prove that lanterns are no longer useful.", "Both lanterns are shown being used successfully, not as useless objects."),
    ("To explain how electricity was invented.", "The passage focuses on legacy and duty, not the history of electricity."),
    ("To suggest the daughter plans to leave the lighthouse.", "The ending shows her actively continuing the work, not leaving it.")],
   "The old and new lanterns mirror each other, showing the daughter continuing her father’s role.",
   "When an object reappears across a flashback and the present, compare what it represents each time.")

mc("plot-flashback", "RL.5.5", 7,
   "A village storyteller is first shown as grumpy and unwelcoming, but a flashback reveals that he lost his own family in a flood years ago and has been alone since. How does this flashback likely change a reader’s judgment of the storyteller?",
   "It makes readers feel more sympathy for him by explaining the pain behind his behavior.",
   [("It makes readers trust him less because he lied about his past.", "There is no indication the storyteller lied; the flashback simply reveals unknown pain."),
    ("It proves that the storyteller was always a cheerful person.", "The flashback reveals loss and sorrow, not a cheerful past."),
    ("It shows that the flood was the storyteller’s own fault.", "Nothing in the passage blames the storyteller for causing the flood.")],
   "Learning about the storyteller’s painful loss helps readers understand his grumpy behavior with more sympathy.",
   "A flashback revealing past pain often shifts readers’ judgment of a character.")

mc("plot-flashback", "RL.5.5", 7,
   "In a flashback, a young pilot notices a strange rattling sound in an old plane just before a minor crash landing; years later, as an experienced pilot, she hears the same sound and immediately lands safely. Which flashback detail connects to the safe ending?",
   "The strange rattling sound she first heard and ignored as a young pilot.",
   [("The color of the old plane she flew as a young pilot.", "The color of the plane is never mentioned as important to either landing."),
    ("The name of the airport where she first trained.", "The airport’s name is not the detail linked to the safe landing."),
    ("The number of passengers on her very first flight.", "Passenger count is not connected to recognizing the rattling sound.")],
   "The rattling sound links the two moments: ignoring it caused trouble once, and recognizing it later prevents trouble.",
   "Look for a specific sensory detail that repeats between the flashback and the present.")

tf("plot-flashback", "RL.5.5", 2,
   "A flashback must always appear at the very beginning of a story.", False,
   "A flashback can appear anywhere in a story — at the start, in the middle, or near the end — wherever the author needs it.",
   "Don’t assume a flashback only opens a story; check the whole passage for one.")

# ================================================================== adjectives
grade(4)

mc("adjectives", "L.4.1", 1,
   "“A tiny lizard hid under the warm rock.” Which word describes HOW BIG the lizard is?",
   "tiny",
   [("lizard", "This is the noun being described."),
    ("hid", "This is the verb."),
    ("rock", "This is a noun.")],
   "“Tiny” tells the size of the lizard.",
   "Size adjectives answer the question “how big or small?”")

dd("adjectives", "L.4.1", 2, "Choose the correctly ordered adjectives: “We adopted a ____ puppy.”",
   "small brown",
   [("brown small", "Size adjectives usually come before color adjectives: small brown, not brown small."),
    ("brown little", "This repeats the size idea with two different words in the wrong order."),
    ("puppy small", "A noun cannot be placed before its own adjectives.")],
   "English adjective order usually places size before color: a small brown puppy.",
   "Remember a rough order: opinion, size, age, shape, color, origin, material, purpose.")

mc("adjectives", "L.4.1", 2,
   "“Those mountains look snowy today.” Which word is a demonstrative adjective?",
   "Those",
   [("mountains", "This is the noun being described."),
    ("look", "This is the verb."),
    ("snowy", "This is an adjective, but it describes a quality, not “which one.”")],
   "“Those” points out which mountains, so it is a demonstrative adjective.",
   "Demonstrative adjectives: this, that, these, those.")

mc("adjectives", "L.4.1", 3,
   "“After the long hike, the campers felt exhausted.” Which word is the predicate adjective describing the campers?",
   "exhausted",
   [("long", "This describes the hike, not the campers."),
    ("hike", "This is a noun."),
    ("campers", "This is the noun being described, not the adjective.")],
   "“Exhausted” follows the linking verb “felt” and describes the campers.",
   "Predicate adjectives follow linking verbs like feel, seem, look, taste.")

err("adjectives", "L.4.1", 3,
    ["The chef served a", " well seasoned", " dish", " to every guest."], 1, " well-seasoned",
    "A compound adjective made of two words before a noun usually needs a hyphen: well-seasoned.",
    "Hyphenate two-word adjectives that work together before a noun.")

mc("adjectives", "L.4.1", 4,
   "“Egyptian cotton is famous worldwide.” Which word is a proper adjective?",
   "Egyptian",
   [("cotton", "This is a noun."),
    ("famous", "This is an adjective, but it is not formed from a proper noun."),
    ("worldwide", "This is an adverb.")],
   "“Egyptian” comes from the proper noun Egypt and is capitalized, making it a proper adjective.",
   "Proper adjectives come from proper nouns and are always capitalized.")

dd("adjectives", "L.4.1", 4, "There are ____ clouds in the sky today than yesterday.",
   "fewer",
   [("less", "Use “less” for amounts you cannot count, like “less rain,” not countable clouds."),
    ("little", "“Little” does not fit before a plural countable noun like “clouds.”"),
    ("much", "“Much” is used with uncountable nouns, not countable ones like clouds.")],
   "“Clouds” can be counted, so the correct comparing word is “fewer.”",
   "Use fewer for countable nouns and less for uncountable nouns.")

mc("adjectives", "L.4.1", 5,
   "Which sentence uses the irregular comparative correctly?",
   "The new bridge is better than the old wooden one.",
   [("The new bridge is gooder than the old wooden one.", "“Good” is irregular: good, better, best, not gooder."),
    ("The new bridge is more better than the old wooden one.", "Never use “more” together with “better.”"),
    ("The new bridge is bestest than the old wooden one.", "“Bestest” is not a real word; the superlative of good is best.")],
   "“Good” changes irregularly: good → better → best.",
   "Memorize irregular comparatives like good/better/best and bad/worse/worst.")

err("adjectives", "L.4.1", 6,
    ["I am very", " interesting", " in that mystery", " novel."], 1, " interested",
    "A person who feels curiosity about something is “interested,” while “interesting” describes the thing that causes the feeling.",
    "-ed adjectives describe feelings; -ing adjectives describe what causes the feeling.")

mc("adjectives", "L.4.1", 6,
   "Which sentence uses the adjective correctly after a linking verb?",
   "The blanket feels soft against her cheek.",
   [("The blanket feels softly against her cheek.", "After a linking verb like “feels,” use an adjective, not an adverb."),
    ("The blanket feel soft against her cheek.", "“Blanket” is singular, so the verb should be “feels.”"),
    ("The blanket feels soft against her cheekly.", "“Cheekly” is not a real word; the correct word is “cheek.”")],
   "“Feels” is a linking verb here, so it should be followed by the adjective “soft,” not an adverb.",
   "After linking verbs (is, seems, tastes, feels, smells), use adjectives.")

mc("adjectives", "L.4.1", 7,
   "Which sentence uses “looks” correctly, keeping in mind that “looks” can act as a linking verb or an action verb?",
   "The old barn looks shaky in the strong wind.",
   [("The old barn looks shakily in the strong wind.", "Here “looks” is a linking verb describing a quality, so it needs the adjective “shaky,” not the adverb “shakily.”"),
    ("The old barn look shaky in the strong wind.", "“Barn” is singular, so the verb must be “looks,” not “look.”"),
    ("The old barn looks shaky in the strongly wind.", "“Wind” is a noun, so it needs the adjective “strong,” not the adverb “strongly.”")],
   "“Looks” links “barn” to a quality, so the adjective “shaky” is correct.",
   "If a verb describes a quality rather than an action, follow it with an adjective.")

grade(5)

mc("adjectives", "L.5.1", 1,
   "“The curious explorer studied the ancient, crumbling wall.” Which two words are coordinate adjectives (adjectives of equal importance, separated by a comma, both describing “wall”)?",
   "ancient, crumbling",
   [("curious, explorer", "“Explorer” is a noun, not an adjective."),
    ("the, ancient", "“The” is an article, not a coordinate adjective."),
    ("studied, wall", "“Studied” is a verb and “wall” is a noun.")],
   "“Ancient” and “crumbling” are both adjectives of equal weight describing the wall, so they are separated by a comma.",
   "Coordinate adjectives can usually be swapped or joined with “and” and still make sense.")

err("adjectives", "L.5.1", 1,
    ["The hikers found a", " narrow, rocky, steep", " path", " up the cliff."], 1, " narrow, rocky, and steep",
    "Three or more coordinate adjectives in a series usually need “and” before the last one, plus commas between the others.",
    "In a list of three or more adjectives, use commas and “and” before the final item.")

mc("adjectives", "L.5.1", 2,
   "Which sentence correctly avoids comparing an absolute adjective (one that cannot logically have degrees, like “perfect” or “round”)?",
   "Her solution to the puzzle was perfect.",
   [("Her solution to the puzzle was more perfect.", "“Perfect” is an absolute adjective; it cannot logically be “more perfect.”"),
    ("Her solution to the puzzle was the most perfect.", "“Perfect” already means complete, so it cannot have a superlative degree."),
    ("Her solution to the puzzle was perfecter.", "“Perfecter” is not a correct or real comparative form.")],
   "“Perfect” describes a complete, flawless state, so it should not be compared with “more” or “-er.”",
   "Absolute adjectives like perfect, round, and complete usually cannot be compared.")

dd("adjectives", "L.5.1", 2, "Choose the article: “She is ____ honest witness in this case.”",
   "an",
   [("a", "“Honest” begins with a silent h, so it has a vowel sound and needs “an.”"),
    ("the", "“The” would not fit the meaning of introducing one witness among many."),
    ("some", "“Some” does not fit before a singular countable noun like “witness.”")],
   "“Honest” starts with a vowel sound because the h is silent, so it takes “an.”",
   "Choose a/an based on the SOUND of the next word, not just its first letter.")

mc("adjectives", "L.5.1", 3,
   "Which sentence lists the adjectives in the correct order?",
   "The chef used two small ripe green mangoes.",
   [("The chef used small two ripe green mangoes.", "Numbers usually come before size adjectives: two small, not small two."),
    ("The chef used ripe small two green mangoes.", "Size adjectives usually come before age/condition adjectives like “ripe.”"),
    ("The chef used green small two ripe mangoes.", "Color adjectives usually come near the end of the order, not near the beginning.")],
   "The usual order is quantity, size, condition, then color: two, small, ripe, green.",
   "Build a mental checklist: quantity, size, age/condition, shape, color, origin, material.")

tf("adjectives", "L.5.1", 3,
   "A predicate adjective always comes directly before the noun it describes.", False,
   "A predicate adjective comes AFTER a linking verb and describes the subject, not directly before a noun.",
   "Predicate adjectives follow linking verbs: The sky is clear.")

err("adjectives", "L.5.1", 4,
    ["This recipe needs", " less", " eggs", " than the last one."], 1, " far fewer",
    "“Eggs” is a countable noun, so the correct comparing word is “fewer,” not “less.”",
    "Fewer for things you can count; less for things you cannot count.")

mc("adjectives", "L.5.1", 4,
   "Which sentence correctly uses a possessive adjective?",
   "Their tent blew away in the sudden wind.",
   [("There tent blew away in the sudden wind.", "“There” points to a place; the possessive word needed here is “Their.”"),
    ("They’re tent blew away in the sudden wind.", "“They’re” means “they are” and cannot describe a noun like “tent.”"),
    ("Them tent blew away in the sudden wind.", "“Them” is an object pronoun and cannot be used as an adjective before a noun.")],
   "“Their” is the possessive adjective that correctly shows ownership of the tent.",
   "Possessive adjectives (my, your, his, her, its, our, their) come directly before a noun.")

mc("adjectives", "L.5.1", 5,
   "Which sentence uses “smells” correctly, keeping in mind it can act as a linking verb?",
   "The bakery smells wonderful this morning.",
   [("The bakery smells wonderfully this morning.", "“Smells” links the bakery to a quality here, so it needs the adjective “wonderful,” not the adverb “wonderfully.”"),
    ("The bakery smell wonderful this morning.", "“Bakery” is singular, so the verb must be “smells.”"),
    ("The bakery smells wonderful this morningly.", "“Morningly” is not a real word; “this morning” is correct as written.")],
   "“Smells” describes a quality of the bakery here, so the adjective “wonderful” follows it correctly.",
   "When a sense verb describes a quality, follow it with an adjective, not an adverb.")

mc("adjectives", "L.5.1", 6,
   "Which sentence correctly compares three or more items?",
   "Of the three trails, this one is the most difficult.",
   [("Of the three trails, this one is more difficult.", "“More difficult” compares only two things; “of the three” needs the superlative."),
    ("Of the three trails, this one is difficulter.", "Long adjectives like “difficult” use “more/most,” not -er/-est endings."),
    ("Of the three trails, this one is the more difficult.", "Comparing three or more items needs “the most,” not “the more.”")],
   "“Of the three” signals a comparison among three or more items, which requires the superlative “most difficult.”",
   "Two items: comparative (more/-er). Three or more: superlative (most/-est).")

mc("adjectives", "L.5.1", 7,
   "Which sentence correctly uses a hyphenated compound adjective before a noun?",
   "The team built a ten-minute presentation for the contest.",
   [("The team built a ten minute presentation for the contest.", "A two-word adjective made of a number and a unit before a noun usually needs a hyphen: ten-minute."),
    ("The team built a ten-minutes presentation for the contest.", "In a hyphenated compound adjective before a noun, the unit word stays singular: ten-minute, not ten-minutes."),
    ("The team built a ten minute’s presentation for the contest.", "An apostrophe is not used to form this kind of compound adjective.")],
   "“Ten-minute” is a compound adjective describing the presentation and is hyphenated before the noun.",
   "Hyphenate a number-plus-unit adjective before a noun, and keep the unit singular.")

grade(6)

mc("adjectives", "L.6.1", 1,
   "Which sentence correctly uses an absolute adjective without comparing it illogically?",
   "The circle drawn by the compass was round.",
   [("The circle drawn by the compass was more round.", "“Round” is an absolute adjective describing a complete shape, so it should not be compared with “more.”"),
    ("The circle drawn by the compass was the roundest.", "A true circle is already fully round; “roundest” illogically suggests varying degrees of roundness."),
    ("The circle drawn by the compass was very most round.", "Stacking “very” and “most” together is incorrect, and “round” should not be compared at all.")],
   "“Round” describes a complete state and is generally not compared using more/most or -er/-est.",
   "Absolute adjectives (round, perfect, complete) resist comparison because they describe an all-or-nothing quality.")

err("adjectives", "L.6.1", 1,
    ["The committee reviewed a", " detailed, well researched,", " and", " persuasive proposal."], 1,
    " detailed, well-researched,",
    "The two-word compound adjective “well researched” needs a hyphen when it comes directly before the noun it describes: well-researched.",
    "Hyphenate a compound adjective made of an adverb and participle only when it sits right before the noun.")

mc("adjectives", "L.6.1", 2,
   "Which sentence lists the adjectives in the correct conventional order?",
   "We admired a stunning antique wooden chest.",
   [("We admired an antique stunning wooden chest.", "Opinion adjectives like “stunning” usually come before age adjectives like “antique.”"),
    ("We admired a wooden stunning antique chest.", "Material adjectives like “wooden” come last, not first, in the usual order."),
    ("We admired an antique wooden stunning chest.", "Opinion adjectives like “stunning” come first, not last, in the usual order.")],
   "The conventional order is opinion, then age, then material: stunning, antique, wooden.",
   "Memorize the general order: opinion, size/shape, age, color, origin, material, purpose.")

dd("adjectives", "L.6.1", 2, "The committee needs ____ information before approving the project.",
   "more",
   [("fewer", "“Information” is an uncountable noun, so “fewer” is incorrect."),
    ("less information’s", "This adds an incorrect possessive ending to an uncountable noun."),
    ("much more many", "This piles up comparing words incorrectly in one phrase.")],
   "“Information” is uncountable, and the comparing word “more” fits uncountable nouns correctly.",
   "Use more/less for uncountable nouns like information, and more/fewer for countable nouns.")

mc("adjectives", "L.6.1", 3,
   "Which sentence correctly uses a participial adjective to describe a feeling rather than a cause?",
   "The audience was fascinated by the magician’s final trick.",
   [("The audience was fascinating by the magician’s final trick.", "“Fascinating” describes something that causes fascination, not a group feeling it."),
    ("The audience were fascinated by the magician’s final trick, fascinatingly.", "Adding “fascinatingly” creates an unnecessary and awkward repetition of the same idea."),
    ("The audience was fascinate by the magician’s final trick.", "“Fascinate” is a verb form, not the adjective needed here.")],
   "“Fascinated” correctly describes the audience’s feeling, caused by the trick.",
   "-ed participial adjectives describe how someone feels; -ing ones describe what causes the feeling.")

mc("adjectives", "L.6.1", 3,
   "Which sentence correctly places a long string of coordinate adjectives with commas?",
   "The museum displayed a rare, delicate, hand-painted vase.",
   [("The museum displayed a rare delicate hand-painted vase.", "Coordinate adjectives of equal weight in a series need commas separating them."),
    ("The museum displayed a rare, delicate hand painted, vase.", "The comma placement is wrong, and “hand painted” needs a hyphen before the noun."),
    ("The museum displayed, a rare, delicate, hand-painted, vase.", "There should be no comma directly after the verb “displayed” or directly before the noun “vase.”")],
   "Each coordinate adjective in the series is separated by a comma, and the final one sits right before the noun.",
   "Commas separate coordinate adjectives, but none comes right before the noun itself.")

mc("adjectives", "L.6.1", 4,
   "Which sentence correctly compares using “farther” versus “further” (farther for physical distance, further for extent or degree)?",
   "The hikers walked farther than the map had suggested.",
   [("The hikers walked further than the map had suggested, in distance.", "For physical distance, “farther” is the traditional choice, not “further.”"),
    ("The hikers walked farer than the map had suggested.", "“Farer” is not a correct comparative form."),
    ("The hikers walked far than the map had suggested.", "“Far” needs the comparative ending to compare two distances: farther.")],
   "“Farther” is the traditional choice for physical distance, which fits the hikers walking a longer distance.",
   "Farther usually describes physical distance; further usually describes degree or extent.")

err("adjectives", "L.6.1", 5,
    ["The two scientists", " proposed a", " more unique", " solution to the problem."], 2, " unique",
    "“Unique” is generally treated as an absolute adjective meaning one of a kind, so it is not usually compared with “more.”",
    "Treat unique like an absolute adjective; avoid “more unique” or “most unique.”")

mc("adjectives", "L.6.1", 6,
   "Which sentence correctly uses a predicate adjective after a linking verb, rather than an adverb?",
   "The committee’s decision seemed fair to everyone involved.",
   [("The committee’s decision seemed fairly to everyone involved.", "“Seemed” is a linking verb here, so it needs the adjective “fair,” not the adverb “fairly.”"),
    ("The committee’s decision seem fair to everyone involved.", "“Decision” is singular, so the verb must be “seemed.”"),
    ("The committee’s decision seemed fair to everyone involving.", "“Involving” does not fit here; “involved” correctly describes everyone affected.")],
   "“Seemed” links “decision” to a quality, so the predicate adjective “fair” is correct.",
   "After linking verbs like seem, appear, and become, choose an adjective, not an adverb.")

mc("adjectives", "L.6.1", 7,
   "Which sentence correctly orders a long string of adjectives across several categories (opinion, age, origin, material)?",
   "She inherited a beautiful, old, Japanese, porcelain tea set.",
   [("She inherited an old, beautiful, Japanese, porcelain tea set.", "Opinion adjectives like “beautiful” usually come before age adjectives like “old.”"),
    ("She inherited a porcelain, beautiful, old, Japanese tea set.", "Material adjectives like “porcelain” usually come last, not first."),
    ("She inherited a Japanese, old, beautiful, porcelain tea set.", "Origin adjectives like “Japanese” come after opinion and age, not before them.")],
   "The conventional order places opinion first, then age, then origin, then material: beautiful, old, Japanese, porcelain.",
   "When several categories appear together, work through the order one category at a time.")

# ================================================================== poetry-elements
grade(4)

mc("poetry-elements", "RL.4.5", 1,
   "Read this poem.\n\n“The desert wakes at break of day,\nSoft golden light begins to play.\n\nThe camels rise with gentle sound,\nTheir shadows stretch across the ground.”\n\nHow many stanzas does this poem have?",
   "two",
   [("one", "The poem has a blank line in the middle, which separates it into two stanzas."),
    ("three", "There are only two groups of lines, separated by one blank line."),
    ("four", "Each stanza here has two lines, not one line each, so there are only two stanzas.")],
   "A blank line separates the poem into two groups of two lines each, so there are two stanzas.",
   "Count the groups of lines separated by blank lines.")

mc("poetry-elements", "RL.4.5", 1,
   "Read these lines: “The river flows so calm and wide, / Fish dart and dive and glide and hide.” Which pair of words rhymes?",
   "wide, hide",
   [("flows, calm", "These words do not sound alike at the end."),
    ("dart, dive", "These words do not sound alike at the end."),
    ("river, fish", "These words do not sound alike at all.")],
   "“Wide” and “hide” end with the same sound.",
   "Rhyming words usually share the same ending sound.")

mc("poetry-elements", "RL.4.5", 2,
   "Read: “The kitten naps,\nThe kitten plays,\nThe kitten purrs\nThrough sleepy days.”\nWhich word is repeated at the start of several lines?",
   "The kitten",
   [("naps", "This word only appears once."),
    ("plays", "This word only appears once."),
    ("sleepy", "This word only appears once, and not at the start of a line.")],
   "“The kitten” begins three of the four lines, which is a repeated phrase.",
   "Repetition often appears at the start or end of several lines.")

mc("poetry-elements", "RL.4.5", 3,
   "Read: “The wind blows free,\nAcross the sea,\nNo set beat to its song,\nIt wanders right along.”\nWhat is this poem’s rhyme pattern for the first two lines?",
   "They rhyme with each other (free, sea).",
   [("They do not rhyme with any other line.", "“Free” and “sea” share the same ending sound, so they do rhyme."),
    ("Every line in the poem rhymes with every other line.", "Only some lines share the same ending sound, not all four."),
    ("The lines rhyme in the middle, not at the end.", "The rhyme occurs at the end of the lines, not in the middle.")],
   "“Free” and “sea” share the same ending sound, forming a rhyming pair.",
   "Check the very last sound of each line to find rhyming pairs.")

err("poetry-elements", "RL.4.5", 3,
    ["The poem has", " three stanza", " with four lines", " in each one."], 1, " three stanzas",
    "“Stanza” needs the plural form “stanzas” to match the number “three.”",
    "Match singular and plural forms: one stanza, three stanzas.")

mc("poetry-elements", "RL.4.5", 4,
   "Read: “Stars appear one by one tonight, / Tiny sparks of silver light.” Which word best describes the overall mood created by these lines?",
   "peaceful",
   [("frightening", "The imagery of gentle, tiny sparks of light does not suggest fear."),
    ("angry", "Nothing in the lines suggests anger or conflict."),
    ("chaotic", "The slow, gentle appearance of stars suggests order, not chaos.")],
   "The quiet image of stars gently appearing creates a calm, peaceful mood.",
   "Picture the scene the words describe, then name the feeling it gives you.")

mc("poetry-elements", "RL.4.5", 4,
   "A poem with lines that do not rhyme and have no regular rhythm, like a short descriptive paragraph broken into lines, is called what?",
   "free verse",
   [("a haiku", "A haiku has a strict structure of three lines with set syllable counts, unlike free verse."),
    ("a rhyming couplet", "A rhyming couplet is exactly two lines that rhyme, which is the opposite of free verse."),
    ("a limerick", "A limerick follows a strict five-line pattern with a set rhyme scheme.")],
   "Free verse poetry has no required rhyme or regular rhythm pattern.",
   "Free verse = free from strict rhyme and rhythm rules.")

mc("poetry-elements", "RL.4.5", 5,
   "Read: “The market hums with morning trade,\nFruit stacked high in sun and shade.\n\nVoices call and coins exchange,\nColors bright and smells so strange.”\nHow do the two stanzas work together?",
   "The first stanza sets the scene, and the second adds sounds and smells to it.",
   [("The two stanzas describe two completely different markets.", "Both stanzas describe the same single market scene."),
    ("The second stanza contradicts everything in the first.", "The second stanza adds more detail; it does not contradict the first."),
    ("The stanzas have no connection to each other.", "Both stanzas build one connected picture of the market.")],
   "The first stanza introduces the market, and the second stanza builds on it with more sensory details.",
   "Ask how each new stanza adds to or builds on the one before it.")

mc("poetry-elements", "RL.4.5", 6,
   "Read: “Tap, tap, tap, the rain falls down, / Drip, drip, drip, upon the town.” Which poetic element is created by repeating “tap” and “drip” three times each?",
   "the sound of the falling rain",
   [("the color of the rain", "Repeating a sound word does not describe color."),
    ("the size of the town", "The repeated words describe a sound, not the town’s size."),
    ("a rhyme with the word “down”", "“Tap” and “drip” do not rhyme with “down”; the repetition imitates sound instead.")],
   "Repeating “tap” and “drip” imitates the actual sound of rain falling.",
   "Repeated sound words often imitate the noise they describe.")

mc("poetry-elements", "RL.4.5", 7,
   "A poem has three lines: the first and third rhyme, and the middle line does not rhyme with either. What is this rhyme pattern usually written as?",
   "ABA",
   [("AAA", "AAA would mean all three lines rhyme with each other."),
    ("ABC", "ABC would mean none of the lines rhyme with each other."),
    ("AAB", "AAB would mean the first two lines rhyme and the third is different.")],
   "The first and third lines share the same letter (A) because they rhyme, while the middle line gets a different letter (B).",
   "Label each line’s rhyme sound with a letter, starting from A.")

grade(5)

mc("poetry-elements", "RL.5.5", 1,
   "Read this poem.\n\n“The harbor wakes before the sun,\nBoats creak and sway, their long day begun.\n\nGulls circle low with hungry cries,\nAnd nets are cast beneath gray skies.\n\nBy noon the catch is sorted fast,\nAnd morning's rush has slipped into the past.”\n\nHow many stanzas does this poem have?",
   "three",
   [("one", "Two blank lines divide the poem into three separate groups of lines, not one."),
    ("two", "There are two blank lines in the poem, which creates three stanzas, not two."),
    ("six", "There are six lines total, but they form only three stanzas of two lines each.")],
   "Two blank lines divide the poem into three stanzas of two lines each.",
   "Count blank lines, then add one to find the number of stanzas.")

mc("poetry-elements", "RL.5.5", 1,
   "Read: “The city hums with endless sound, / Lights and voices all around.” Which pair of words rhymes?",
   "sound, around",
   [("city, hums", "These words do not share the same ending sound."),
    ("lights, voices", "These words do not share the same ending sound."),
    ("endless, all", "These words do not share the same ending sound.")],
   "“Sound” and “around” share the same ending sound.",
   "Focus only on the final sound of each line when checking for rhyme.")

mc("poetry-elements", "RL.5.5", 2,
   "Read: “The orchard waits in silver frost,\nIts summer fruit all long since lost.\n\nYet roots still hold their steady ground,\nAnd spring will come, as spring is bound.”\nHow does the second stanza relate to the first?",
   "The first stanza shows loss, and the second stanza offers hope for renewal.",
   [("The second stanza describes a completely unrelated season.", "The second stanza still describes the same orchard, just later in its cycle."),
    ("The first stanza is hopeful, and the second stanza is hopeless.", "This reverses the actual mood; the first stanza describes loss, and the second brings hope."),
    ("The stanzas repeat the exact same idea twice.", "The second stanza shifts the idea forward from loss toward renewal, not simple repetition.")],
   "The first stanza focuses on what is lost, while the second stanza turns toward hope for spring’s return.",
   "Track how the poem’s feeling or focus shifts from one stanza to the next.")

err("poetry-elements", "RL.5.5", 2,
    ["This poem has", " a rhyme pattern of", " ABAB", " in every stanza except the last."], 2, "ABAB",
    "This is already written correctly; a rhyme pattern like ABAB uses capital letters with no spaces or punctuation between them.",
    "Rhyme-scheme labels are written as capital letters side by side, like ABAB or AABB.")

mc("poetry-elements", "RL.5.5", 3,
   "A poem has four lines where the first rhymes with the second, and the third rhymes with the fourth. What is this rhyme pattern called?",
   "AABB",
   [("ABAB", "ABAB would mean the first and third lines rhyme, and the second and fourth rhyme."),
    ("ABBA", "ABBA would mean the first and fourth lines rhyme, and the second and third rhyme."),
    ("AAAA", "AAAA would mean all four lines rhyme with each other.")],
   "The first two lines share one rhyme (AA), and the last two lines share a different rhyme (BB).",
   "Label each line with a letter in order, repeating a letter only when the rhyme matches.")

mc("poetry-elements", "RL.5.5", 3,
   "Which poetic form is traditionally written in three unrhymed lines with a 5-7-5 syllable pattern, often about nature?",
   "haiku",
   [("sonnet", "A sonnet traditionally has fourteen lines, not three."),
    ("limerick", "A limerick has five lines with a strict rhyme scheme, not three unrhymed lines."),
    ("free verse", "Free verse has no required syllable pattern, unlike the strict 5-7-5 of a haiku.")],
   "A haiku follows a strict three-line, 5-7-5 syllable structure, often focused on nature.",
   "Haiku: 3 lines, 5-7-5 syllables, usually about nature.")

mc("poetry-elements", "RL.5.5", 4,
   "Read: “The train pulls slowly from the station, / Carrying hopes to each far-off destination.” What is the overall effect of the repeated long “o” and “a” vowel sounds across these lines?",
   "It creates a slow, drawn-out rhythm that matches the train’s gradual movement.",
   [("It makes the lines sound fast and choppy.", "Long vowel sounds tend to slow down a reader's pace, not speed it up."),
    ("It has no effect on the poem's rhythm at all.", "Repeated vowel sounds shape how smoothly or slowly a line is read."),
    ("It changes the meaning of the word “train” entirely.", "Vowel sound repetition affects rhythm and mood, not a word's basic meaning.")],
   "The repeated long vowel sounds slow the reading pace, mirroring the train’s slow departure.",
   "Notice how vowel sounds can speed up or slow down how a line feels when read aloud.")

mc("poetry-elements", "RL.5.5", 5,
   "Read: “The lantern swings from the old ship's bow, / Guiding sailors home, as it always does, somehow.” When a sentence or idea continues from one line into the next without a pause, this is called what?",
   "enjambment",
   [("a refrain", "A refrain is a line or phrase that repeats throughout a poem, which is different from a sentence running across lines."),
    ("a stanza break", "A stanza break is a blank line separating groups of lines, not a sentence running across lines."),
    ("a rhyme scheme", "A rhyme scheme describes the pattern of rhyming sounds, not how sentences flow across lines.")],
   "When the sentence flows past the end of the line without stopping, it is called enjambment.",
   "Enjambment: a thought that runs on past the line break without a pause.")

mc("poetry-elements", "RL.5.5", 6,
   "A short phrase or line that repeats at set points throughout a song or poem, such as after every stanza, is called what?",
   "a refrain",
   [("an elegy", "An elegy is a poem written to mourn someone, not a repeated phrase."),
    ("an ode", "An ode is a poem praising a person, object, or idea, not a repeated phrase."),
    ("an acrostic", "An acrostic is a poem where the first letters of each line spell a word, not a repeated phrase.")],
   "A refrain is a phrase or line that repeats at regular points in a poem or song.",
   "Refrain = a line that returns again and again, like a chorus.")

mc("poetry-elements", "RL.5.5", 7,
   "In a poem about rebuilding after a storm, the final stanza suddenly shifts to describing a brand-new morning, using only short, simple sentences. What effect does this structural shift likely create?",
   "It mirrors the fresh start the community feels after the storm has passed.",
   [("It shows that the storm has returned even stronger.", "Describing a new morning signals calm and recovery, not a returning storm."),
    ("It proves the poem has no connection between its stanzas.", "A shift in tone or structure can still connect meaningfully to earlier stanzas."),
    ("It means the poet made an error in the final stanza.", "A deliberate shift in sentence length and tone is a structural choice, not a mistake.")],
   "Shifting to short, simple sentences about a new morning reflects the community’s fresh, hopeful start.",
   "A sudden shift in sentence structure near the end often signals a shift in feeling or meaning.")

grade(6)

mc("poetry-elements", "RL.6.5", 1,
   "Read this poem.\n\n“The quarry sleeps beneath the dust,\nIts ancient stone begins to rust.\n\nYet workers come with steady hands,\nTo shape new life from these old lands.”\n\nHow many stanzas does this poem have, and how many lines are in each?",
   "two stanzas, with two lines each",
   [("one stanza, with four lines", "A blank line divides the poem into two separate stanzas, not one."),
    ("four stanzas, with one line each", "The lines are grouped in pairs, not standing alone as separate stanzas."),
    ("two stanzas, with three lines each", "Each stanza here contains exactly two lines, not three.")],
   "The blank line divides the poem into two stanzas, each containing two lines.",
   "Count the blank lines first, then count the lines within each resulting group.")

err("poetry-elements", "RL.6.5", 1,
    ["This poem follows", " a strict", " rhythm pattern", " call meter."], 3, " called meter",
    "The verb needed here is “called,” the past participle form, not “call.”",
    "Check that participles like “called” or “named” are spelled correctly after a noun phrase.")

mc("poetry-elements", "RL.6.5", 2,
   "The regular pattern of stressed and unstressed syllables in a line of poetry is called what?",
   "meter",
   [("rhyme scheme", "Rhyme scheme describes the pattern of rhyming sounds at line endings, not stress patterns."),
    ("stanza", "A stanza is a group of lines, not a pattern of stressed syllables."),
    ("enjambment", "Enjambment describes a sentence running past a line break, not a stress pattern.")],
   "Meter refers to the regular rhythm created by stressed and unstressed syllables.",
   "Meter is the “heartbeat” rhythm of a poem's syllables.")

mc("poetry-elements", "RL.6.5", 3,
   "A poem written in two rhyming lines that form a complete thought, often used to end a longer poem, is called what?",
   "a couplet",
   [("a quatrain", "A quatrain is a four-line stanza, not a pair of rhyming lines."),
    ("a stanza break", "A stanza break is simply a blank line between stanzas, not a specific two-line form."),
    ("a refrain", "A refrain is a repeated phrase, not a specific two-line rhyming unit.")],
   "A couplet is exactly two lines that rhyme and usually express one complete thought.",
   "Couplet = a pair (“couple”) of rhyming lines.")

mc("poetry-elements", "RL.6.5", 4,
   "Read: “The factory hums both day and night; / Its tired workers long for light.” Which word choice most strongly contributes to the poem's weary, exhausted tone?",
   "tired",
   [("factory", "This word simply names the setting; it does not itself carry an emotional weight."),
    ("hums", "This word describes a steady sound, not weariness."),
    ("night", "This word names a time of day; it does not by itself suggest exhaustion.")],
   "“Tired” directly names the workers' exhaustion, strongly shaping the poem's weary tone.",
   "Look for words that directly name an emotion or physical state to find what shapes a poem's tone.")

mc("poetry-elements", "RL.6.5", 4,
   "A songwriter groups her verses into blocks of exactly four lines each. What is each of those blocks called?",
   "a quatrain",
   [("a tercet", "That name is reserved for a block of three lines, not four."),
    ("a sestet", "That name is reserved for a block of six lines, not four."),
    ("a couplet", "That name is reserved for a block of just two lines, not four.")],
   "A poetry block made of exactly four lines has its own special name: a quatrain.",
   "Memorize the family of length names together so you can tell them apart quickly.")

mc("poetry-elements", "RL.6.5", 5,
   "Read: “The old clock ticks, its gears worn thin, / Marking time that none can win.” How does the structure of comparing a clock to an unwinnable race contribute to the poem's meaning?",
   "It reinforces the idea that time moves forward no matter what anyone does.",
   [("It suggests the clock will stop working very soon.", "The comparison is about time's unstoppable nature, not predicting a mechanical failure."),
    ("It shows that the poem is only about repairing clocks.", "The clock serves as a symbol for time itself, not a literal instruction manual."),
    ("It proves the poem has no central theme.", "The comparison actually supports a clear theme about the passage of time.")],
   "Comparing time to a race no one can win emphasizes that time's passage is unstoppable, which supports the poem's theme.",
   "When a poem compares an object to an abstract idea, ask what larger meaning that comparison supports.")

mc("poetry-elements", "RL.6.5", 6,
   "A poem shifts from long, flowing sentences in its first half to short, clipped sentences in its second half, right as the subject changes from a calm morning to a sudden storm. What is the most likely purpose of this structural shift?",
   "To make the pace of the lines match the sudden change in the weather.",
   [("To show that the poet ran out of ideas partway through.", "A deliberate change in sentence length and rhythm is a stylistic choice, not a sign of running out of ideas."),
    ("To prove that the storm was not actually dangerous.", "Short, clipped sentences typically build tension, which would suggest more danger, not less."),
    ("To separate the poem into two unrelated topics.", "Both halves describe the same day and setting, just before and during the storm.")],
   "Shortening the sentences as the storm begins mirrors the sudden, sharp change in the weather.",
   "A shift in sentence length or rhythm often mirrors a shift in the action or mood being described.")

mc("poetry-elements", "RL.6.5", 7,
   "In a poem about an abandoned lighthouse, the final stanza repeats the exact first line of the poem, unchanged. What effect does this repetition most likely create?",
   "It gives the poem a circular structure, suggesting the lighthouse's story continues unchanged.",
   [("It shows that the poet forgot what was already written.", "Repeating a line deliberately is a structural choice, not an accidental oversight."),
    ("It means the second half of the poem should be ignored.", "A repeated first line typically frames the whole poem, rather than canceling out what comes between."),
    ("It proves the lighthouse was recently rebuilt.", "The repetition relates to the poem's structure and meaning, not a literal construction update.")],
   "Returning to the exact opening line creates a circular, unchanging structure that reflects the lighthouse's unchanging state.",
   "A poem that ends by repeating its opening line often suggests something has come full circle.")

mc("poetry-elements", "RL.6.5", 3,
   "A six-line stanza is more specifically called what?",
   "a sestet",
   [("a quatrain", "A quatrain refers to a four-line stanza, not six."),
    ("a tercet", "A tercet refers to a three-line stanza, not six."),
    ("a couplet", "A couplet refers to a two-line stanza, not six.")],
   "A stanza made up of exactly six lines is called a sestet.",
   "Learn the stanza-length names: couplet (2), tercet (3), quatrain (4), sestet (6).")

# ================================================================== homographs-homophones
grade(4)

dd("homographs-homophones", "L.4.5.c", 1, "Choose the correct word: “Please put the letter over ____.”",
   "there",
   [("their", "“Their” shows ownership, like “their letter,” not location."),
    ("they're", "“They’re” means “they are” and does not fit this sentence."),
    ("thare", "This is a misspelling of “there.”")],
   "“There” points to a location, which fits “over ____.”",
   "There = place, their = ownership, they're = they are.")

dd("homographs-homophones", "L.4.5.c", 2, "Choose the correct word: “Is ____ time to leave yet?”",
   "it's",
   [("its", "“Its” shows ownership and does not mean “it is.”"),
    ("it is'", "This is not a correct way to write a contraction."),
    ("its'", "This is not a real word; “its” never takes an apostrophe for ownership.")],
   "“It’s” is the contraction for “it is,” which fits this question.",
   "It's = it is; its = belonging to it.")

mc("homographs-homophones", "L.4.5.c", 3, "Which pair of words are homophones (same sound, different spelling and meaning)?",
   "flower, flour",
   [("quick, fast", "These words sound different but mean nearly the same thing; that makes them synonyms, not homophones."),
    ("happy, sad", "These words have opposite meanings and do not sound alike."),
    ("run, running", "These are two forms of the same word, not two different words that sound alike.")],
   "“Flower” and “flour” sound exactly the same but have completely different meanings and spellings.",
   "Homophones sound the same but are spelled differently and mean different things.")

mc("homographs-homophones", "L.4.5.c", 4, "In which sentence does “bow” mean to bend forward out of respect?",
   "The dancers took a graceful bow at the end of the show.",
   [("She tied a red bow on the gift box.", "Here “bow” means a decorative knot, not a bending motion."),
    ("The archer carried his bow across the field.", "Here “bow” means the weapon used to shoot arrows."),
    ("The ship's bow cut through the waves.", "Here “bow” means the front part of a ship.")],
   "In this sentence, “bow” describes the dancers bending forward to show respect to the audience.",
   "Homographs are spelled the same but can be pronounced and mean differently — use context to decide.")

mc("homographs-homophones", "L.4.5.c", 5, "Read: “The wind was too strong, so we had to wind the kite string back in.” How are the two words pronounced?",
   "They are pronounced differently, even though they are spelled the same.",
   [("They are pronounced exactly the same way.", "The first “wind” (moving air) and the second “wind” (to coil) are pronounced differently."),
    ("Only the second “wind” is a real word.", "Both uses of “wind” are real words with different meanings and pronunciations."),
    ("The sentence contains a spelling mistake.", "There is no spelling mistake; the word “wind” simply has two different pronunciations and meanings.")],
   "“Wind” (moving air) and “wind” (to coil something) are spelled the same but pronounced differently.",
   "Some homographs change pronunciation depending on their meaning.")

err("homographs-homophones", "L.4.5.c", 6,
    ["The puppy ran", " threw the muddy garden", " and left paw prints", " all over the porch."], 1, " through the muddy garden",
    "“Through” means to move from one side of something to the other, while “threw” is the past tense of the verb “throw.”",
    "Through = passing across a space; threw = past tense of throw.")

dd("homographs-homophones", "L.4.5.c", 7, "Choose the correct word: “My ____ is on the desk.”",
   "stationery",
   [("stationary", "“Stationary” means “not moving,” which does not fit an item sitting on a desk for writing."),
    ("stationarry", "This is a misspelling of “stationary.”"),
    ("stationeri", "This is a misspelling of “stationery.”")],
   "“Stationery” refers to paper and writing supplies, which fits an item on a desk.",
   "Stationery (with an e) = paper supplies; stationary (with an a) = not moving.")

mc("homographs-homophones", "L.4.5.c", 6, "Which sentence uses “desert” to mean a dry, sandy region, not to abandon something?",
   "The camel crossed the vast, sandy desert.",
   [("The soldiers were ordered not to desert their post.", "Here “desert” means to abandon, not a dry region."),
    ("She would never desert her best friend.", "Here “desert” means to abandon someone."),
    ("He feared the team would desert him before the game.", "Here “desert” means to abandon, not a dry region.")],
   "In this sentence, “desert” refers to the dry, sandy land the camel crosses.",
   "Note the stress: DES-ert (the place) vs. de-SERT (to abandon).")

mc("homographs-homophones", "L.4.5.c", 7, "Which pair of words are homographs (same spelling, different meaning)?",
   "bat (the animal), bat (used in baseball)",
   [("cat, hat", "These two words are spelled differently and are unrelated in meaning."),
    ("run, ran", "These are two different tenses of the same verb, not two unrelated meanings of one spelling."),
    ("sun, son", "These words sound alike but are spelled differently, making them homophones, not homographs.")],
   "“Bat” is spelled the same in both cases but has two completely different meanings.",
   "Homographs look identical on the page but can mean very different things.")

grade(5)

dd("homographs-homophones", "L.5.5.c", 1, "Choose the correct word: “It took almost an ____ for the bus to finally arrive.”",
   "hour",
   [("our", "“Our” shows ownership, like “our bus stop,” not a measure of time."),
    ("are", "“Are” is a verb and does not fit this blank."),
    ("hour's", "An apostrophe here would incorrectly suggest ownership, which does not fit this sentence.")],
   "“Hour” is the unit of time that fits after “an” in this sentence about waiting.",
   "Hour = unit of time; our = belonging to us.")

mc("homographs-homophones", "L.5.5.c", 2, "In which sentence does “lead” rhyme with “bed” (meaning the heavy metal)?",
   "The old pipes were made of lead.",
   [("She will lead the team to victory.", "Here “lead” means to guide, and it rhymes with “bead,” not “bed.”"),
    ("Who will lead the discussion tomorrow?", "Here “lead” means to guide, rhyming with “bead,” not “bed.”"),
    ("The coach will lead the warm-up exercises.", "Here “lead” means to guide, rhyming with “bead,” not “bed.”")],
   "In this sentence, “lead” refers to the metal and is pronounced to rhyme with “bed.”",
   "Lead (the metal) rhymes with bed; lead (to guide) rhymes with bead.")

dd("homographs-homophones", "L.5.5.c", 3, "Choose the correct word: “The teacher gave us good ____ on the project.”",
   "advice",
   [("advise", "“Advise” is a verb meaning to give suggestions, not the noun for the suggestion itself."),
    ("advize", "This is a misspelling."),
    ("advisement", "This word does not fit naturally in this common sentence pattern.")],
   "“Advice” is the noun form meaning guidance or suggestions, which fits after “good.”",
   "Advice is the noun (a piece of advice); advise is the verb (to advise someone).")

mc("homographs-homophones", "L.5.5.c", 4, "Which sentence uses “object” to mean a physical thing, not to disagree?",
   "A strange object appeared on the shore after the storm.",
   [("The lawyer stood up to object to the question.", "Here “object” means to disagree or protest."),
    ("Several citizens plan to object at the town meeting.", "Here “object” means to voice disagreement."),
    ("Did anyone object to the new schedule?", "Here “object” means to disagree, not a physical thing.")],
   "In this sentence, “object” is a noun meaning a physical thing found on the shore.",
   "Notice the stress: OB-ject (the thing) vs. ob-JECT (to disagree).")

err("homographs-homophones", "L.5.5.c", 5,
    ["The new principle", " insisted that", " every student", " wear a nametag during the tour."], 0, "The new principal",
    "“Principal” refers to the head of a school, while “principle” means a basic rule or belief, so it cannot give instructions.",
    "Principal = a person (or main thing); principle = a rule.")

mc("homographs-homophones", "L.5.5.c", 6, "“The orchard hired extra workers to record record harvest numbers.” How do the two uses of “record” differ?",
   "The first “record” is a verb meaning to write down, and the second is an adjective describing the largest-ever harvest; they are stressed differently.",
   [("Both words mean exactly the same thing and are pronounced the same way.", "The two uses have different meanings and different stress patterns, even though they are spelled the same."),
    ("The sentence has a typo and should use two different words.", "There is no typo; “record” can correctly serve as both a verb and a noun or adjective."),
    ("The first “record” describes the harvest, and the second is the verb.", "This reverses the correct order of the verb and the describing word in the sentence.")],
   "“Record” shifts both meaning and stress depending on whether it is used as a verb or as a noun/adjective.",
   "Check the word's job in the sentence (verb, or noun/adjective) to find its correct pronunciation.")

dd("homographs-homophones", "L.5.5.c", 7, "Choose the correct word: “The patient waited with great ____ in the hospital.”",
   "patience",
   [("patients", "“Patients” refers to people receiving medical care, not the quality of waiting calmly."),
    ("patiences", "This is not a correct plural or standard form."),
    ("patients'", "An apostrophe here incorrectly suggests possession, which does not fit this sentence.")],
   "“Patience” means the ability to wait calmly, which fits this sentence.",
   "Patience = calm waiting; patients = people being treated by a doctor.")

mc("homographs-homophones", "L.5.5.c", 6, "Which sentence uses “content” to mean satisfied, not the information inside something?",
   "After the long hike, the campers felt completely content.",
   [("Please review the content of the report before the meeting.", "Here “content” means the information inside the report."),
    ("The teacher checked the content of each essay carefully.", "Here “content” refers to the ideas and information in each essay."),
    ("The website's content was updated last week.", "Here “content” refers to the information found on the website.")],
   "In this sentence, “content” describes the campers' feeling of satisfaction.",
   "Notice the stress: con-TENT (satisfied) vs. CON-tent (what's inside).")

mc("homographs-homophones", "L.5.5.c", 7, "Which pair best shows a true set of homophones?",
   "peace, piece",
   [("quiet, calm", "These words are similar in meaning but sound different, making them synonyms, not homophones."),
    ("large, larger", "These are two forms of the same word, not two different words that sound alike."),
    ("bright, light", "These words sound different from each other and are not homophones.")],
   "“Peace” and “piece” sound exactly alike but have completely different spellings and meanings.",
   "True homophones must sound identical, even though their spelling and meaning differ.")

grade(6)

dd("homographs-homophones", "L.6.5.c", 1, "Choose: “The new policy will ____ every department in the company.”",
   "affect",
   [("effect", "“Effect” is usually a noun meaning a result, not a verb meaning to influence."),
    ("affects'", "An apostrophe here does not fit; this word is a plain verb, not a possessive."),
    ("a-fect", "This is not a correctly spelled word.")],
   "“Affect” is the verb meaning to influence something, which fits this sentence about the policy's influence.",
   "Affect is usually the verb (to influence); effect is usually the noun (a result).")

mc("homographs-homophones", "L.6.5.c", 2, "In which sentence does “tear” rhyme with “bear,” meaning to rip?",
   "Be careful not to tear the delicate fabric.",
   [("A single tear rolled down her cheek.", "Here “tear” means a drop from crying, rhyming with “ear,” not “bear.”"),
    ("He wiped away a tear before anyone noticed.", "Here “tear” means a drop from crying, not the act of ripping."),
    ("Her eyes filled with a single tear of joy.", "Here “tear” means a drop from crying, rhyming with “ear.”")],
   "In this sentence, “tear” means to rip and is pronounced to rhyme with “bear.”",
   "Tear (rip) rhymes with bear; tear (crying) rhymes with ear.")

mc("homographs-homophones", "L.6.5.c", 3, "“Only a minute fraction of the seeds sprouted after the frost.” How is “minute” pronounced and what does it mean here?",
   "It is pronounced my-NOOT and means extremely tiny.",
   [("It is pronounced MIN-it and means sixty seconds.", "In this sentence “minute” describes a tiny fraction, not a unit of time, so it is pronounced differently."),
    ("It is pronounced MIN-it and means extremely tiny.", "The meaning “extremely tiny” uses the pronunciation my-NOOT, not MIN-it."),
    ("It is pronounced my-NOOT and means sixty seconds.", "The pronunciation my-NOOT goes with the meaning “extremely tiny,” not a unit of time.")],
   "When “minute” means extremely tiny, it is pronounced my-NOOT, matching its use here describing how few seeds sprouted.",
   "Minute (MIN-it) = 60 seconds; minute (my-NOOT) = extremely tiny.")

err("homographs-homophones", "L.6.5.c", 4,
    ["The mayor's new budget", " will", " effect", " every public school in the district."], 2, " affect",
    "“Affect” is the verb meaning to influence something, which fits here better than the noun “effect.”",
    "If something is being influenced, use affect as the verb; effect is usually the noun for the result.")

mc("homographs-homophones", "L.6.5.c", 5, "In which sentence does “object” mean “to disagree” rather than a physical thing?",
   "The mayor expects several residents to object at tonight's hearing.",
   [("A heavy object blocked the narrow hallway.", "Here “object” is a noun meaning a physical thing."),
    ("Scientists studied the strange object found near the coast.", "Here “object” refers to a physical thing, not disagreement."),
    ("The museum displayed an ancient object from the dig.", "Here “object” is a noun referring to a physical item.")],
   "In this sentence, “object” is a verb meaning to voice disagreement at the hearing.",
   "Stress on the second syllable (ob-JECT) usually signals the verb meaning “to disagree.”")

mc("homographs-homophones", "L.6.5.c", 6, "Which sentence uses “refuse” to mean garbage, not to decline?",
   "The city collects refuse from every street twice a week.",
   [("The committee may refuse to approve the new budget.", "Here “refuse” means to decline or reject."),
    ("Workers can refuse unsafe assignments under this policy.", "Here “refuse” means to decline, not garbage."),
    ("She chose to refuse the invitation politely.", "Here “refuse” means to decline something offered.")],
   "In this sentence, “refuse” is a noun meaning trash or garbage collected by the city.",
   "REF-use (noun, garbage) is stressed differently from re-FUSE (verb, to decline).")

err("homographs-homophones", "L.6.5.c", 7,
    ["The contractor gave", " a rough", " estimate", " of the project's cost, witch seemed reasonable."], 3,
    " cost, which seemed reasonable",
    "“Which” introduces extra information about the estimate, while “witch” refers to a person in folklore and does not fit here.",
    "Which = a question or relative word; witch = a person in folklore. Check the meaning needed.")

mc("homographs-homophones", "L.6.5.c", 6, "Which pair of words best shows true homophones in formal, academic writing?",
   "capital, capitol",
   [("large, huge", "These words are similar in meaning but sound different, making them synonyms, not homophones."),
    ("govern, government", "These are related word forms, not two unrelated words that happen to sound alike."),
    ("city, state", "These words are unrelated in sound and meaning.")],
   "“Capital” (a main city or wealth) and “capitol” (a government building) sound alike but differ in spelling and meaning.",
   "Capital = main city or money; capitol = the government building.")
