"""
Question bank top-up 2, batch 10: brings these families to the full target of 50 items each
(original content, Grades 4-6). Families: evaluate-argument, reread, irregular-verbs, plot-setting.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== irregular-verbs
grade(4)

dd("irregular-verbs", "L.4.1", 1, "Choose the past tense: “Yesterday the vase ____ when it fell off the shelf.”",
   "broke", [("breaked", "“Break” is irregular and does not add -ed."), ("breaks", "This is present tense."), ("breaking", "This needs a helping verb.")],
   "break → broke.", "Irregular verbs change their spelling instead of adding -ed.")

dd("irregular-verbs", "L.4.1", 2, "Choose the past tense: “Grandma ____ me a new scarf for my birthday.”",
   "gave", [("gived", "“Give” is irregular."), ("give", "This is present tense."), ("giving", "This needs a helping verb.")],
   "give → gave.", "Say “Yesterday she…” to test the past tense.")

mc("irregular-verbs", "L.4.1", 2, "Which sentence uses the correct past-tense verb?",
   "Hassan took the bus to his cousin’s house.",
   [("Hassan taked the bus to his cousin’s house.", "“Take” is irregular: take → took."),
    ("Hassan taken the bus to his cousin’s house.", "“Taken” needs a helping verb like has or had."),
    ("Hassan takes the bus to his cousin’s house.", "This is present tense, not past.")],
   "The irregular past tense of “take” is “took.”", "Irregular verbs do not follow the add -ed rule.")

dd("irregular-verbs", "L.4.1", 3, "Choose the past tense: “From the roof, we ____ the fireworks over the river.”",
   "saw", [("seen", "“Seen” needs a helping verb such as have or had."), ("seed", "This is not the past tense of “see.”"), ("sees", "This is present tense.")],
   "see → saw (past) → have seen (past participle).", "Past tense stands alone; the past participle needs has/have/had.")

err("irregular-verbs", "L.4.1", 3, ["At the souk,", " Dad buyed", " a basket of", " fresh mangoes."], 1, " Dad bought",
    "“Buy” is irregular: buy → bought, not “buyed.”", "If -ed sounds strange on a verb, check whether it is irregular.")

dd("irregular-verbs", "L.4.1", 4, "Choose the correct form: “By the time we got to the party, Lina had already ____ the cake.”",
   "worn", [("wear", "After “had,” use the past participle."), ("weared", "This is not a word."), ("wore", "After “had,” use the past participle, not the plain past tense.")],
   "had + past participle: had worn.", "wear → wore → (have/had) worn.")

match("irregular-verbs", "L.4.1", 4, "Match each verb with its past tense.",
      [("hide", "hid"), ("build", "built"), ("hold", "held"), ("send", "sent")],
      "Each of these verbs forms its past tense in its own irregular way.", "Say “Yesterday I…” to test the past tense of a verb.")

dd("irregular-verbs", "L.4.1", 5, "Choose the past tense: “Our teacher ____ us how to fold a paper boat.”",
   "taught", [("teached", "“Teach” is irregular."), ("teaches", "This is present tense."), ("teaching", "This needs a helping verb.")],
   "teach → taught.", "Some irregular verbs change their whole spelling, not just the ending.")

mc("irregular-verbs", "L.4.1", 5, "Which sentence uses the correct past-tense verb?",
   "The pitcher threw the ball straight to first base.",
   [("The pitcher throwed the ball straight to first base.", "“Throw” is irregular: throw → threw."),
    ("The pitcher thrown the ball straight to first base.", "“Thrown” needs a helping verb."),
    ("The pitcher throws the ball straight to first base.", "This is present tense.")],
   "The irregular past tense of “throw” is “threw.”", "Say the sentence with “yesterday” to check the verb form.")

dd("irregular-verbs", "L.4.1", 6, "Choose the correct form: “The wind had ____ the tent over before we woke up.”",
   "blown", [("blowed", "This is not a word."), ("blew", "After “had,” use the past participle, not the plain past tense."), ("blow", "After “had,” use the past participle.")],
   "had + past participle: had blown.", "blow → blew → (have/had) blown.")

mc("irregular-verbs", "L.4.1", 7, "Which sentence uses the correct past-tense verb?",
   "The artist drew a map of the old city from memory.",
   [("The artist drawed a map of the old city from memory.", "“Draw” is irregular: draw → drew."),
    ("The artist has drew a map of the old city from memory.", "After “has,” use the past participle “drawn,” not “drew.”"),
    ("The artist draws a map of the old city from memory.", "This is present tense.")],
   "The irregular past tense of “draw” is “drew.”", "Irregular verbs must be memorized; they do not follow a simple rule.")

grade(5)

dd("irregular-verbs", "L.5.1", 1, "Choose the past tense: “During the debate, Youssef ____ clearly and calmly.”",
   "spoke", [("speaked", "“Speak” is irregular."), ("speaks", "This is present tense."), ("spoken", "“Spoken” needs a helping verb.")],
   "speak → spoke.", "Irregular verbs do not follow the add -ed rule.")

mc("irregular-verbs", "L.5.1", 2, "Which sentence uses the correct past-tense verb?",
   "The audience stood and clapped when the singer finished.",
   [("The audience standed and clapped when the singer finished.", "“Stand” is irregular: stand → stood."),
    ("The audience has stood and clapped when the singer finished.", "“Has stood” mixes present and past time; the sentence needs the simple past “stood.”"),
    ("The audience stands and clapped when the singer finished.", "Mixing present “stands” with past “clapped” is inconsistent.")],
   "The irregular past tense of “stand” is “stood.”", "Keep verb tenses consistent within a sentence about the past.")

dd("irregular-verbs", "L.5.1", 2, "Choose the past tense: “After the storm, the fishermen ____ their only boat.”",
   "lost", [("losed", "This is not a word."), ("lose", "This is present tense."), ("loss", "“Loss” is a noun, not a verb.")],
   "lose → lost.", "Some irregular verbs change their ending to -t or -d.")

err("irregular-verbs", "L.5.1", 3, ["The campers", " sleeped", " through the", " entire thunderstorm."], 1, " slept",
    "“Sleep” is irregular: sleep → slept, not “sleeped.”", "If a verb's -ed form sounds odd, it is probably irregular.")

dd("irregular-verbs", "L.5.1", 3, "Choose the past tense: “Nobody understood what she ____ by the strange remark.”",
   "meant", [("meaned", "“Mean” is irregular."), ("means", "This is present tense."), ("meaning", "This needs a helping verb.")],
   "mean → meant.", "Irregular past-tense forms must be learned one at a time.")

match("irregular-verbs", "L.5.1", 4, "Match each verb with its past tense.",
      [("dig", "dug"), ("win", "won"), ("hang", "hung"), ("light", "lit")],
      "Each of these verbs forms its past tense irregularly.", "Test each verb with “Yesterday I…”")

dd("irregular-verbs", "L.5.1", 4, "Choose the correct form: “The lifeguard had never ____ such a strong current before.”",
   "understood", [("understand", "After “had,” use the past participle."), ("understanded", "This is not a word."), ("understood it", "Adding “it” creates an extra object the sentence does not need.")],
   "had + understood.", "understand → understood → (have/had) understood — this verb has the same past and past-participle form.")

mc("irregular-verbs", "L.5.1", 5, "Which sentence uses the correct past-tense verb?",
   "Mariam forgot her lunch on the kitchen counter.",
   [("Mariam forgetted her lunch on the kitchen counter.", "“Forget” is irregular: forget → forgot."),
    ("Mariam has forgot her lunch on the kitchen counter.", "After “has,” use the past participle “forgotten,” not “forgot.”"),
    ("Mariam forgets her lunch on the kitchen counter.", "This is present tense.")],
   "The irregular past tense of “forget” is “forgot.”", "Past participles after has/have/had often differ from the simple past.")

dd("irregular-verbs", "L.5.1", 5, "Choose the past tense: “The thorn ____ his finger as he picked the roses.”",
   "hurt", [("hurted", "This is not a word."), ("hurts", "This is present tense."), ("hurting", "This needs a helping verb.")],
   "hurt → hurt (same form for present and past).", "A few irregular verbs keep the same spelling in every tense: hurt, hit, cut.")

dd("irregular-verbs", "L.5.1", 6, "Choose the past tense: “The guide ____ the tired hikers safely down the trail.”",
   "led", [("leaded", "This is not a word."), ("leads", "This is present tense."), ("lead", "This is the base form, not the past tense.")],
   "lead → led.", "Do not confuse the verb “lead/led” with the metal “lead,” which is spelled the same but pronounced differently.")

mc("irregular-verbs", "L.5.1", 7, "Which sentence uses the correct past-tense verb?",
   "The old bicycle rode smoothly once Dad oiled the chain.",
   [("The old bicycle rided smoothly once Dad oiled the chain.", "“Ride” is irregular: ride → rode."),
    ("The old bicycle has rode smoothly once Dad oiled the chain.", "After “has,” use the past participle “ridden,” not “rode.”"),
    ("The old bicycle rides smoothly once Dad oiled the chain.", "This is present tense.")],
   "The irregular past tense of “ride” is “rode.”", "Irregular verbs often change their inner vowel in the past tense.")

grade(6)

dd("irregular-verbs", "L.6.1", 1, "Choose the correct form: “By the time we landed, Rania had already ____ us a route from the airport.”",
   "driven", [("drove", "After “had,” use the past participle, not the simple past."), ("drive", "After “had,” use the past participle."), ("drived", "This is not a word.")],
   "had + past participle: had driven.", "drive → drove → (have/had) driven.")

mc("irregular-verbs", "L.6.1", 2, "Which sentence correctly uses the past participle after “had”?",
   "The explorers had sought shelter long before the blizzard hit.",
   [("The explorers had seek shelter long before the blizzard hit.", "After “had,” use the past participle “sought,” not the base form “seek.”"),
    ("The explorers had seeked shelter long before the blizzard hit.", "“Seek” is irregular; “seeked” is not a word."),
    ("The explorers have sought shelter long before the blizzard hit.", "Mixing “have” with “long before the blizzard hit” does not fit the past perfect sequence here.")],
   "seek → sought → (have/had) sought.", "Many irregular verbs change their vowel sound rather than adding -ed.")

dd("irregular-verbs", "L.6.1", 2, "Choose the past tense: “During the long drought, the lake ____ to half its normal size.”",
   "shrank", [("shrinked", "“Shrink” is irregular."), ("shrunk", "“Shrunk” is the past participle, used after has/have/had."), ("shrinks", "This is present tense.")],
   "shrink → shrank → (have/had) shrunk.", "shrink/shrank/shrunk follow the same vowel pattern as sing/sang/sung.")

err("irregular-verbs", "L.6.1", 3, ["Before the judges arrived,", " the baker had", " already cutted", " the prize-winning pie."], 2, " already cut",
    "“Cut” keeps the same form in the present, past, and past participle: cut → cut → cut.", "A few common verbs never change form: cut, hit, hurt, cost.")

match("irregular-verbs", "L.6.1", 4, "Match each verb with its past participle.",
      [("forget", "forgotten"), ("grow", "grown"), ("sweep", "swept"), ("bite", "bitten")],
      "Each of these verbs forms a distinct past-participle ending in -en or -t.", "Test with “have ___” to find the past participle.")

dd("irregular-verbs", "L.6.1", 4, "Choose the past tense: “The small shop ____ out of bread by noon on market day.”",
   "ran", [("runned", "“Run” is irregular."), ("run", "This is the base form or past participle, not the simple past."), ("runs", "This is present tense.")],
   "run → ran → (have/had) run.", "run/ran/run keeps the same spelling for the base form and the past participle.")

mc("irregular-verbs", "L.6.1", 5, "Which sentence correctly uses an irregular past-tense verb?",
   "The old rope had torn apart under the heavy load.",
   [("The old rope had tore apart under the heavy load.", "After “had,” use the past participle “torn,” not the simple past “tore.”"),
    ("The old rope had teared apart under the heavy load.", "“Tear” is irregular; “teared” is not a word in this sense."),
    ("The old rope tore apart under the heavy load, has it?", "This is not a complete, correctly formed sentence.")],
   "tear → tore → (have/had) torn.", "The past participle after had often differs from the simple past form.")

dd("irregular-verbs", "L.6.1", 5, "Choose the past tense: “The sailors ____ to the mast as the waves crashed over the deck.”",
   "clung", [("clinged", "“Cling” is irregular."), ("clang", "This is a different word, the past tense of “clang,” not “cling.”"), ("clings", "This is present tense.")],
   "cling → clung.", "cling/clung follows the same pattern as sting/stung and sling/slung.")

mc("irregular-verbs", "L.6.1", 6, "Which sentence correctly uses an irregular past-tense verb?",
   "Had the committee known the true cost sooner, it would have chosen a cheaper plan.",
   [("Had the committee knew the true cost sooner, it would have chosen a cheaper plan.", "After “had,” use the past participle “known,” not the simple past “knew.”"),
    ("Had the committee knowed the true cost sooner, it would have chosen a cheaper plan.", "“Know” is irregular; “knowed” is not a word."),
    ("Had the committee known the true cost sooner, it would have choose a cheaper plan.", "After “would have,” use the past participle “chosen,” not the base form “choose.”")],
   "had + known, and would have + chosen: both use the correct past participles.", "In past-perfect “if” sentences, every helping verb needs a past participle after it.")

mc("irregular-verbs", "L.6.1", 7, "Which sentence correctly uses an irregular past-tense verb?",
   "Overcome with relief, the climbers wept at the summit.",
   [("Overcome with relief, the climbers weeped at the summit.", "“Weep” is irregular: weep → wept, not “weeped.”"),
    ("Overcome with relief, the climbers have wept at the summit, and left.", "Shifting from “have wept” to the simple past “left” mid-sentence breaks the tense sequence."),
    ("Overcome with relief, the climbers weep at the summit.", "This is present tense, which does not match “overcome,” a past action.")],
   "The irregular past tense of “weep” is “wept.”", "Several irregular verbs change -eep to -ept: sleep/slept, keep/kept, weep/wept.")

# ================================================================== plot-setting
grade(4)

mc("plot-setting", "RL.4.3", 1, "Where does this story take place? “Mona tied her donkey to a post outside the mudbrick house and carried a basket of dates up the narrow lane.”",
   "In a village", [("On a ship", "There is no mention of a ship or water travel."), ("In a big city", "A donkey, a mudbrick house, and a narrow lane suggest a small place, not a big city."), ("In a classroom", "Nothing in the sentence describes a school.")],
   "The donkey, mudbrick house, and narrow lane show a small village setting.", "Look for small details like animals and building materials to picture the setting.")

mc("plot-setting", "RL.4.3", 2, "Which detail tells you WHEN this story takes place? “Khalid lit an oil lamp because the house had no electricity, and he wrote his letter by its flickering light.”",
   "no electricity", [("the house", "A house does not tell a specific time period."), ("his letter", "Writing a letter does not by itself show the time period."), ("flickering light", "The flickering light is a result of the setting detail, not the clue to time itself.")],
   "No electricity suggests the story happens long ago or somewhere without modern power.", "Clues about technology often reveal when a story is set.")

mc("plot-setting", "RL.4.3", 3, "How does the setting create a problem in this story? “Snow piled against the cabin door, and the family had only enough firewood for one more night.”",
   "The snow and shortage of firewood threaten the family’s safety.",
   [("The cabin is too small for the family.", "Size is not mentioned as a problem."), ("The family does not like snow.", "Their feelings about snow are not stated."), ("The firewood is the wrong kind.", "The type of firewood is never mentioned.")],
   "Being snowed in with little firewood creates danger, which is the story’s problem.", "Ask how the time and place make the character’s situation harder.")

mc("plot-setting", "RL.4.3", 2, "Which words help you picture the setting? “Waves slapped against the fishing boat as seagulls circled overhead and salty spray stung the sailors’ eyes.”",
   "waves, seagulls, salty spray", [("fishing boat, sailors", "These name who and what, not the setting itself."), ("stung, circled", "These are actions, not setting details."), ("eyes, boat", "These name objects, not sensory setting clues.")],
   "Waves, seagulls, and salty spray are sensory details that build the ocean setting.", "Setting details often appeal to the senses: sight, sound, smell.")

tf("plot-setting", "RL.4.3", 2, "In the sentence “The marketplace buzzed with vendors calling out prices for mangoes and spices,” the setting is a quiet library.", False,
   "A buzzing marketplace with vendors is a busy, noisy place, not a quiet library.", "Compare the mood of a sentence to the setting it describes.")

mc("plot-setting", "RL.4.3", 4, "Why might the author have set this story in a desert instead of a forest? “Yara counted her remaining water carefully, knowing the next well was two days away.”",
   "To make finding water the main source of danger and tension",
   [("To show Yara likes hot weather.", "Her feelings about heat are not described."), ("To make the story funny.", "There is nothing humorous in this detail."), ("To describe many different plants.", "A desert setting would show few plants, not many.")],
   "A desert setting makes scarce water the central danger, driving the plot forward.", "Think about what problems a setting naturally creates for the characters.")

mc("plot-setting", "RL.4.3", 5, "Which sentence best shows a change in setting that affects the mood of a story?",
   "The sunny beach gave way to dark storm clouds as the boat drifted farther from shore.",
   [("The beach was sandy and the boat was red.", "This only describes colors and textures, not a change in mood."), ("The captain checked his watch twice.", "This describes an action, not a setting change."), ("The crew ate lunch on the deck.", "This is a routine action, not a setting shift.")],
   "The shift from sunny beach to dark storm clouds creates a sudden, tense mood.", "A change in weather or light often signals a change in mood.")

mc("plot-setting", "RL.4.3", 3, "What does the detail “the clock tower’s bell had been silent for fifty years” suggest about the setting?",
   "The town has been quiet or unchanged for a long time.",
   [("The town just built the clock tower.", "A silent bell for fifty years means the tower is old, not new."), ("The town has no clock tower.", "The sentence clearly says there is a clock tower."), ("The bell rings every hour.", "The sentence says the bell has been silent.")],
   "A bell silent for fifty years hints at a town stuck in the past.", "Details about how long something has been true reveal clues about a setting’s history.")

mc("plot-setting", "RL.4.3", 6, "A story opens: “Inside the spaceship, red warning lights flashed along the metal corridor.” What can you tell about the setting?",
   "It is a futuristic, possibly dangerous place.",
   [("It is a peaceful garden.", "Flashing warning lights do not suggest a calm garden."), ("It is an old wooden cabin.", "A spaceship with metal corridors is not a wooden cabin."), ("It is a quiet library.", "Warning lights suggest urgency, not quiet study.")],
   "A spaceship with flashing warning lights signals a futuristic and tense setting.", "Setting details can hint at danger before any action happens.")

mc("plot-setting", "RL.4.3", 7, "Two stories are set during the same flood, but one is told from a rooftop and the other from a rescue boat. How would the settings most likely change each story?",
   "Each character would notice different dangers and details based on their exact location.",
   [("The stories would be exactly the same.", "Different locations within the same event usually reveal different details."), ("The flood would not matter in either story.", "The flood is the shared setting event, so it would matter in both."), ("Only the rooftop story could mention water.", "Both settings involve water, since both are in a flood.")],
   "Being on a rooftop versus a boat changes what each character can see and fear.", "Even within one big event, a character’s exact spot shapes what they experience.")

grade(5)

mc("plot-setting", "RL.5.3", 1, "Where does this scene take place? “Nadia adjusted her goggles before diving past the coral toward the sunken ship.”",
   "Underwater near a shipwreck", [("In a desert canyon", "Diving and coral point to water, not a dry canyon."), ("On a mountain trail", "There is no trail or climbing mentioned."), ("In a school gymnasium", "Goggles and coral describe an underwater scene, not a gym.")],
   "Goggles, diving, coral, and a sunken ship all point to an underwater setting.", "List every detail before deciding on the setting.")

mc("plot-setting", "RL.5.3", 2, "Which detail best reveals WHEN this story is set? “Omar sent a telegram to his brother, knowing it would take three days to arrive.”",
   "a telegram that takes three days",
   [("his brother", "Having a brother does not indicate a time period."), ("Omar’s name", "A character’s name does not reveal the time period."), ("sending a message", "Sending a message alone does not show the time period; the method and speed do.")],
   "Telegrams and multi-day delivery suggest an earlier time before instant communication.", "Look at how characters communicate to guess the time period.")

mc("plot-setting", "RL.5.3", 3, "How does the setting increase the conflict in this scene? “The bridge swayed over the canyon, and the rope holding it was already fraying.”",
   "The unstable bridge makes crossing the canyon dangerous.",
   [("The canyon is very colorful.", "Color is not mentioned as part of the problem."), ("The bridge is painted red.", "Paint color has nothing to do with the danger described."), ("The canyon is narrow.", "Width is not given, and it is not the detail creating danger here.")],
   "A swaying, fraying bridge over a canyon creates real physical danger for the characters.", "A dangerous setting often becomes the obstacle characters must overcome.")

mc("plot-setting", "RL.5.3", 4, "Which setting detail would most likely help a character solve a problem later in the story? “Deep in the cave, Layla noticed a faint draft coming from a crack in the back wall.”",
   "the draft from the crack in the wall",
   [("Layla’s flashlight", "The flashlight is equipment, not a setting clue pointing to a solution."), ("the cave’s darkness", "Darkness is a general feature, not a specific clue to an exit."), ("Layla’s footsteps", "Footsteps are an action, not a setting detail about the cave.")],
   "A draft often signals an opening to the outside, which could become an escape route.", "Setting details that seem small, like a draft or a smell, often matter later.")

tf("plot-setting", "RL.5.3", 2, "In the sentence “Neon signs lit the crowded night market as scooters weaved between food stalls,” the setting is most likely a quiet rural farm at dawn.", False,
   "Neon signs, a crowded market, and scooters describe a busy city at night, not a quiet farm.", "Match the energy and details in a sentence to the kind of place it describes.")

mc("plot-setting", "RL.5.3", 5, "Why might an author set a mystery in an old, creaky mansion rather than a new apartment?",
   "The mansion’s age and strange sounds build suspense and hide secrets.",
   [("A mansion is easier to draw.", "How easy a setting is to draw has nothing to do with the story’s suspense."), ("Apartments are always happy places.", "This is an unsupported generalization, not a reason tied to the mystery genre."), ("Mansions are always haunted.", "This assumes something not stated about this specific mansion.")],
   "An old mansion’s creaks, shadows, and history naturally create mystery and suspense.", "Authors often choose settings that match the mood their genre needs.")

mc("plot-setting", "RL.5.3", 6, "A story is set during a heat wave in a crowded apartment with no air conditioning. How does this setting most likely affect the characters?",
   "It makes the characters irritable and eager to escape the heat.",
   [("It makes the characters feel cold.", "A heat wave with no air conditioning would make characters feel hot, not cold."), ("It has no effect on the characters’ moods.", "Extreme heat in a cramped space would likely affect how characters feel and act."), ("It makes the characters want to stay inside longer.", "Being hot and crowded would more likely push characters to want to leave, not stay.")],
   "Heat and crowding in an enclosed space would naturally make characters uncomfortable and short-tempered.", "Think about how a setting’s physical conditions would realistically affect people in it.")

mc("plot-setting", "RL.5.3", 3, "What mood does this setting create? “Fog rolled silently over the empty pier, and a single lantern swung from its post.”",
   "An eerie, lonely mood",
   [("A cheerful, festive mood", "Fog and an empty pier do not suggest celebration."), ("A busy, crowded mood", "The pier is described as empty, not busy."), ("A bright, sunny mood", "Fog blocks sunlight and brightness.")],
   "Fog, emptiness, and a single swinging lantern create an eerie, lonely feeling.", "Weather and lighting details are strong clues to a setting’s mood.")

mc("plot-setting", "RL.5.3", 7, "Two scenes happen during the same war, but one is set in a quiet village and the other in a bombed-out city street. How would the settings most likely shape each scene differently?",
   "The village scene might focus on waiting and fear, while the city scene might focus on danger and destruction.",
   [("Both scenes would describe identical events.", "Different locations during the same event usually create different experiences."), ("The war would not affect either setting.", "A war would likely affect both settings, just in different ways."), ("Only the city scene could include any characters.", "Both settings can include characters; location does not limit who appears.")],
   "A quiet village and a bombed city would expose characters to very different sights and dangers.", "The same historical event can create very different settings depending on exact location.")

mc("plot-setting", "RL.5.3", 4, "Which detail shows that this scene takes place long after a disaster, not during it? “Vines now curled over the collapsed roof, and moss covered the broken steps.”",
   "vines and moss covering the ruins",
   [("the collapsed roof", "A collapsed roof alone could be from right after a disaster."), ("the broken steps", "Broken steps alone do not show how much time has passed."), ("the disaster itself", "The disaster is not described directly in this sentence.")],
   "Vines and moss take time to grow, showing the ruins have sat untouched for a while.", "Plants slowly reclaiming a place are a common clue that time has passed.")

grade(6)

mc("plot-setting", "RL.6.3", 1, "Which detail most strongly establishes the time period of this scene? “She tucked her phone away and checked the brass pocket watch her grandfather had carried in the war.”",
   "the brass pocket watch from the war",
   [("checking the time", "Checking the time alone does not indicate a specific era."), ("her grandfather", "Having a grandfather does not reveal a specific time period."), ("tucking away a phone", "A phone could appear in almost any recent decade, so it is less specific than the pocket watch detail.")],
   "A pocket watch tied to a specific war gives a concrete historical reference point.", "Look for objects linked to specific historical events for precise time clues.")

mc("plot-setting", "RL.6.3", 2, "How does the isolated setting intensify the conflict? “The research station sat three hundred miles from the nearest town, and the only radio had just gone dead.”",
   "It leaves the characters without help if something goes wrong.",
   [("It makes the station very warm.", "Temperature is not mentioned."), ("It gives the characters extra supplies.", "Extra supplies are not mentioned."), ("It allows the characters to call for help easily.", "The radio going dead means they cannot easily call for help.")],
   "Extreme distance and a dead radio cut the characters off from rescue, raising the stakes.", "Isolation in a setting often removes a character’s safety net.")

mc("plot-setting", "RL.6.3", 3, "What does the setting reveal about the character’s state of mind? “Dishes piled in the sink, curtains stayed drawn at noon, and dust coated the piano no one played anymore.”",
   "The character is likely struggling with grief or neglect.",
   [("The character just moved in.", "A newly moved-in home would not have long-settled dust and neglect."), ("The character is extremely organized.", "Piled dishes and dust suggest the opposite of organization."), ("The character loves hosting parties.", "A neglected, closed-up home does not suggest frequent hosting.")],
   "A neglected, closed-up home mirrors a character who has withdrawn, often from grief.", "A setting can reflect a character’s inner emotional state.")

mc("plot-setting", "RL.6.3", 4, "Why might the author set this chapter in a crowded train station rather than an empty field? “Amid shouted announcements and shoving crowds, Tariq realized he had lost sight of his sister.”",
   "The chaos and crowd make it realistically hard to find someone, raising tension.",
   [("Train stations are always exciting.", "This is an overgeneralization, not a reason tied to this specific plot need."), ("An empty field would be too quiet to write about.", "Quiet settings can still support strong scenes; this is not the real reason here."), ("The author simply prefers trains.", "An author’s personal preference is not evidence from the text about plot purpose.")],
   "A crowded, noisy station makes losing a person both believable and tense.", "Choose the setting detail that most directly explains the problem in the scene.")

tf("plot-setting", "RL.6.3", 2, "In the sentence “Dust devils spun across the cracked, sun-baked flats as the caravan’s water barrels ran dry,” the setting is a lush, rainy rainforest.", False,
   "Dust devils, cracked ground, and dry water barrels describe a scorched desert, not a rainforest.", "Check whether every detail actually matches the setting you think a sentence describes.")

mc("plot-setting", "RL.6.3", 5, "How do the settings of a bustling port city and a silent mountain monastery most likely shape two different characters in the same story?",
   "The port city character would likely be shaped by constant activity and trade, while the monastery character would be shaped by solitude and reflection.",
   [("Both characters would develop in identical ways.", "Such different environments would most plausibly shape characters differently."), ("Neither setting would influence the characters at all.", "A setting almost always influences how a character thinks and behaves over time."), ("Only the monastery character could show any emotion.", "Characters in a busy port city can show emotion just as much as those in a quiet monastery.")],
   "Contrasting settings like a busy port and a silent monastery typically produce contrasting character traits.", "Compare how daily life in each setting would train a character’s habits and outlook.")

mc("plot-setting", "RL.6.3", 6, "What is the effect of the author shifting the setting from a sunlit garden to a locked basement within the same chapter?",
   "It creates a sudden, unsettling contrast that signals danger ahead.",
   [("It shows the character is bored.", "A locked basement suggests danger or confinement, not boredom."), ("It proves the garden was never real.", "There is no indication the garden was imagined; it is simply a different location."), ("It has no effect on the story’s mood.", "Such a sharp contrast in setting typically does affect the mood significantly.")],
   "Moving abruptly from a bright, open garden to a dark, locked basement signals a sharp tonal shift toward danger.", "A sudden setting contrast is often used deliberately to unsettle the reader.")

mc("plot-setting", "RL.6.3", 3, "Which detail best explains why characters in this scene speak in hushed voices? “Stone archways funneled every whisper into an echo throughout the ancient library’s reading hall.”",
   "The echoing stone architecture would amplify any noise they made.",
   [("The characters are shy by nature.", "The text gives an architectural reason, not a personality trait."), ("The library has no other visitors.", "Whether others are present is not mentioned as the reason for whispering."), ("The characters are reading very difficult books.", "The difficulty of the books is not connected to why they would whisper.")],
   "The echoing stone architecture explains why any sound, even a whisper, would carry loudly.", "Setting details like materials and architecture can explain character behavior.")

mc("plot-setting", "RL.6.3", 7, "A story set on a long sea voyage shows the ship’s supplies dwindling week by week. What does this passage of time within the setting most likely foreshadow?",
   "A coming crisis over food or water as supplies run out",
   [("A sudden change to a city setting", "Nothing suggests the ship will suddenly be replaced by a city."), ("An unrelated subplot about a festival", "Dwindling supplies point toward conflict, not an unrelated celebration."), ("The voyage ending exactly on schedule", "Dwindling supplies suggest trouble, which usually disrupts a schedule rather than confirming it.")],
   "Supplies running low over time typically builds toward a crisis the characters must face.", "When a setting detail changes gradually, it often signals rising tension to come.")

mc("plot-setting", "RL.6.3", 4, "How does the setting of a one-room schoolhouse on the frontier shape the kinds of conflicts likely to arise in a story set there?",
   "Conflicts would likely involve limited resources, mixed ages learning together, and isolation from other towns.",
   [("Conflicts would mainly involve traffic and crowded hallways.", "A one-room frontier schoolhouse would not have traffic or crowded hallways like a large modern school."), ("Conflicts would mainly involve advanced technology failing.", "Advanced technology would be unlikely in a historical frontier schoolhouse."), ("Conflicts would mainly involve disputes between rival sports teams.", "A single small frontier school would be unlikely to have rival sports teams.")],
   "A small, isolated frontier school naturally creates conflicts tied to scarce resources and mixed-age learning, not modern school issues.", "Think about what problems actually fit the time and place of a setting.")

# ================================================================== reread
grade(4)

mc("reread", "RI.4.1", 1, "A reader finishes a paragraph about honeybees but cannot remember how many legs a bee has. What should the reader do?",
   "Reread the paragraph to find the detail about the bee’s legs.",
   [("Guess a number and move on.", "Guessing can lead to a wrong answer when the text already states the fact."), ("Skip to the next paragraph.", "Skipping forward will not help the reader find a detail already given."), ("Ask a friend instead of checking the text.", "The text itself already has the answer, so checking it first is the better strategy.")],
   "Rereading lets the reader find the exact detail instead of guessing.", "When you forget a detail, look back at the text before guessing.")

mc("reread", "RI.4.1", 2, "After reading about how camels survive in the desert, a student is unsure why camels have thick eyelashes. Which part of the text should the student reread?",
   "The sentence that explains what the eyelashes protect the camel from",
   [("The title of the article", "A title is too short to explain a specific body part’s purpose."), ("The last sentence of the whole article", "The ending may not be about eyelashes at all."), ("The picture caption only, without any text", "A caption alone may not fully explain the reason.")],
   "The sentence describing the eyelashes’ purpose directly answers the question.", "Find the sentence that matches your question, not just any part of the text.")

tf("reread", "RI.4.1", 1, "Rereading a confusing sentence can help a reader understand words they missed the first time.", True,
   "Reading slowly a second time often clears up confusion caused by skimming too fast.", "Slow down and reread any sentence that confuses you.")

mc("reread", "RI.4.1", 2, "A paragraph about the pyramids says they were built using ramps and levers. A reader does not understand how a lever works. What is the best next step?",
   "Reread the sentence about the lever and look for an example in the text.",
   [("Skip the whole paragraph.", "Skipping would leave the reader confused about an important detail."), ("Change the meaning of “lever” in your head.", "Making up a meaning is less reliable than rereading the text’s own explanation."), ("Stop reading the article completely.", "Stopping would prevent the reader from learning the rest of the information.")],
   "Rereading the sentence can reveal an example or explanation of how levers work.", "Looking for an example in the text can make a hard word clearer.")

mc("reread", "RI.4.1", 3, "A text explains that rainforests get over seventy inches of rain a year. A reader wants to know why rainforests have so many plants. What should the reader do?",
   "Reread the paragraph to see if it connects the rainfall to plant growth.",
   [("Assume rainfall has nothing to do with plants.", "Rainfall and plant growth are often connected, so assuming no link may be wrong."), ("Only reread the first sentence of the article.", "The connection may appear later, not only in the first sentence."), ("Count the inches of rain instead of rereading.", "Counting rain does not answer a question about plants.")],
   "Rereading can reveal how the text links heavy rainfall to plentiful plant growth.", "Reread to find connections between two facts in a text.")

mc("reread", "RI.4.1", 4, "After finishing an article about volcanoes, a student cannot explain why lava sometimes moves slowly and sometimes quickly. Which part should the student reread?",
   "The section describing what affects the speed of lava",
   [("The section about volcano names", "Names do not explain lava speed."), ("The introduction sentence only", "The introduction likely gives a general idea, not the specific cause of speed."), ("The last paragraph about safety tips", "Safety tips are unlikely to explain lava’s speed.")],
   "The section about lava’s speed is the exact part that answers the question.", "Match your confusing question to the section most likely to answer it.")

mc("reread", "RI.4.1", 2, "A reader is confused by the sentence “The ants left a scent trail so others could follow it back to the nest.” What should the reader do first?",
   "Reread the sentence slowly, paying attention to each part.",
   [("Skip to the next sentence right away.", "Skipping would not resolve the confusion about this specific sentence."), ("Decide the sentence is unimportant.", "The sentence explains an important behavior, so it should not be dismissed."), ("Reread only the last word of the sentence.", "Rereading just one word will not clarify the whole idea.")],
   "Reading the whole sentence again, slowly, helps the reader connect each part of the idea.", "Reread an entire confusing sentence, not just a single word.")

mc("reread", "RI.4.1", 5, "A text about recycling states that aluminum cans can be recycled again and again without losing quality. A reader wonders if this is true for all materials. What is the best step?",
   "Reread the text to see if it compares aluminum to other materials.",
   [("Assume every material recycles the same way.", "The text may show that materials differ, so assuming sameness could be wrong."), ("Stop reading because the question seems too hard.", "Giving up prevents the reader from finding an answer that may already be in the text."), ("Change the topic to something easier.", "Changing topics avoids the question instead of answering it.")],
   "Rereading can show whether the text explains differences between materials.", "Reread to check if the text answers a question you are curious about.")

ms("reread", "RI.4.1", 3, "Which TWO are good reasons to reread a paragraph about bats using echoes to find insects?",
   ["To understand a confusing science term", "To find a detail you forgot"],
   [("To make the paragraph longer", "Rereading does not change the length of a paragraph."), ("To avoid finishing the article", "Rereading should help you understand the article, not avoid finishing it.")],
   "Rereading helps clarify confusing words and recover forgotten details.", "Reread for understanding, not to delay or avoid reading.")

mc("reread", "RI.4.1", 4, "A student reads that lighthouses once used oil lamps and mirrors to create a bright beam. The student is confused about why mirrors were needed. What should the student do?",
   "Reread the sentence to look for the mirrors’ specific purpose.",
   [("Guess that mirrors were just decoration.", "Guessing ignores the explanation the text may already provide."), ("Skip ahead to a different article.", "Switching articles avoids the question instead of answering it."), ("Reread only the title of the article.", "A title is too short to explain the mirrors’ specific purpose.")],
   "The sentence about mirrors likely explains how they focused or strengthened the light.", "Reread the specific sentence connected to your confusion, not the whole article randomly.")

mc("reread", "RI.4.1", 6, "An article says spiders use silk for webs, safety lines, and wrapping eggs. A reader cannot remember which use came first in the text. What should the reader do?",
   "Reread the paragraph in order to find the sequence of uses listed.",
   [("Guess the order from memory.", "Guessing risks getting the order wrong when the text clearly lists it."), ("Skip to a different paragraph about spiders.", "A different paragraph may not list the order of these three uses."), ("Decide the order does not matter.", "The order given in the text does matter for accurately answering the question.")],
   "Rereading in order lets the reader confirm exactly how the uses were listed.", "When a question is about order, reread looking specifically for sequence words.")

tf("reread", "RI.4.1", 2, "If a reader understands a paragraph completely the first time, they must still reread it five more times.", False,
   "Rereading is a strategy for confusion, not a required rule for every paragraph regardless of understanding.", "Reread when something is unclear, not automatically every single time.")

mc("reread", "RI.4.1", 5, "A text explains that a desert tortoise can survive a year without drinking water. A reader wants to know how this is possible. What should the reader do?",
   "Reread the text looking for an explanation of how the tortoise stores water.",
   [("Assume the text made a mistake.", "Assuming an error skips the chance to find a real explanation in the text."), ("Ignore the question and move on.", "Ignoring the question leaves genuine confusion unresolved."), ("Reread only the picture, not the words.", "A picture alone is unlikely to fully explain a biological process described in the words.")],
   "Rereading can reveal details about how the tortoise’s body conserves water.", "When a fact seems surprising, reread for the text’s own explanation.")

mc("reread", "RI.4.1", 3, "A student rereads a paragraph about coral reefs and notices a sentence they missed the first time: “Coral reefs shelter thousands of fish species.” What did rereading help the student do?",
   "Find a detail that was missed during the first reading.",
   [("Make the paragraph shorter.", "Rereading does not shorten a paragraph."), ("Change the author’s words.", "Rereading does not alter the original text."), ("Avoid learning new information.", "Rereading helped the student gain new information, not avoid it.")],
   "Rereading often uncovers details that were skipped or missed the first time.", "A careful second read can reveal sentences your eyes skipped over.")

mc("reread", "RI.4.1", 6, "An article explains how bread rises because yeast produces gas bubbles in the dough. A reader does not understand what yeast is. What should the reader do?",
   "Reread the sentence about yeast to look for a definition or clue.",
   [("Decide yeast is not important to the article.", "Yeast is central to explaining why bread rises, so it is important."), ("Skip to an article about a different food.", "Switching topics avoids answering the original question."), ("Guess that yeast is a type of flour.", "Guessing may be incorrect; the text may already define or describe yeast.")],
   "Rereading the sentence can reveal a definition or description of yeast.", "Look for a definition near a confusing science word before guessing its meaning.")

mc("reread", "RI.4.1", 4, "A paragraph about the water cycle explains evaporation, condensation, and precipitation in that order. A reader mixes up which step comes first. What is the best fix?",
   "Reread the paragraph, tracking the order the steps are introduced.",
   [("Make up a new order that sounds right.", "Making up an order risks being incorrect when the text states it clearly."), ("Skip the paragraph and read the next one.", "Skipping would not clarify the confusing order in this paragraph."), ("Only look at the title of the section.", "A section title is unlikely to list the full order of three steps.")],
   "Rereading with attention to sequence words (first, then, finally) clarifies the correct order.", "Reread for sequence clues like first, next, and finally.")

mc("reread", "RI.4.1", 7, "A student rereads an article about ancient Egyptian boats twice and now understands why the boats were made from papyrus reeds instead of wood. What is the BEST explanation for this improvement?",
   "The second reading let the student focus on details that were unclear the first time.",
   [("The article changed between readings.", "An article’s text does not change simply because it is read again."), ("The student read it faster the second time.", "Reading faster usually reduces understanding, not increases it."), ("The student ignored the details about papyrus.", "Ignoring the key detail would not explain how understanding improved.")],
   "A careful second reading allows a reader to focus more closely on confusing details.", "Slower, more careful rereading—not speed—usually builds better understanding.")

tf("reread", "RI.4.1", 1, "Rereading only helps with long articles, never with a single confusing sentence.", False,
   "Rereading can help with a single sentence just as much as with a long article.", "Rereading works at any size—one sentence or a whole article.")

mc("reread", "RI.4.1", 5, "After reading about how beavers build dams, a student is confused about why beavers use mud as well as sticks. What should the student do?",
   "Reread the sentence explaining the purpose of the mud.",
   [("Guess that beavers like the taste of mud.", "Taste is not mentioned as the reason beavers use mud."), ("Skip the whole section about beaver homes.", "Skipping would leave the confusion unresolved."), ("Assume mud is not important to the dam.", "If the text mentions mud specifically, it is likely important to how the dam works.")],
   "Rereading the sentence can show that mud is used to seal and strengthen the dam.", "If a material is named specifically, reread to find out why it matters.")

grade(5)

mc("reread", "RI.5.1", 1, "A reader finishes a paragraph about how electricity travels through a circuit but cannot recall what a conductor is. What should the reader do?",
   "Reread the paragraph to find where a conductor is explained.",
   [("Guess a definition that sounds reasonable.", "Guessing risks inaccuracy when the text may already define the term clearly."), ("Skip ahead to a new topic.", "Skipping forward would not resolve this specific confusion."), ("Decide the term is not worth understanding.", "Understanding key terms is necessary to understand the rest of the explanation.")],
   "Rereading lets the reader locate the exact definition instead of guessing.", "When a key term is unclear, reread the sentence right around it.")

mc("reread", "RI.5.1", 2, "A text on photosynthesis says plants convert sunlight into stored energy. A reader is unsure what “stored energy” means in this context. Which part should be reread?",
   "The sentence or two explaining what the plant does with that energy",
   [("The paragraph’s final summary sentence only", "A short summary alone may not clarify the specific phrase in question."), ("The title of the article", "A title is too brief to clarify a specific scientific phrase."), ("A completely different paragraph about animals", "An unrelated paragraph about animals would not explain plant energy storage.")],
   "The explanation of how the plant uses that energy clarifies what “stored energy” means.", "Find the sentence closest to the confusing phrase, not a distant one.")

tf("reread", "RI.5.1", 1, "Rereading a paragraph can help a reader notice how two ideas within it are connected.", True,
   "A careful second reading often reveals connections, like cause and effect, missed the first time.", "Reread to notice connections between sentences, not just to re-read words.")

mc("reread", "RI.5.1", 2, "An article explains that earthquakes happen when tectonic plates suddenly shift. A reader does not understand why the plates shift in the first place. What is the best next step?",
   "Reread the section discussing the cause of plate movement.",
   [("Skip the whole article.", "Skipping would leave the reader without an answer the text may provide."), ("Decide tectonic plates move randomly for no reason.", "Assuming no cause ignores a scientific explanation the text likely gives."), ("Reread only the glossary, if there is one, and nothing else.", "A glossary alone may define terms but not fully explain the cause.")],
   "The section on causes likely explains the buildup of pressure that leads to shifting.", "Look specifically for the section discussing causes, not effects.")

mc("reread", "RI.5.1", 3, "A text states that the Great Barrier Reef is made of billions of tiny coral polyps. A reader wants to know how such small creatures build something so large. What should the reader do?",
   "Reread the text to find the explanation of how polyps build the reef over time.",
   [("Assume the number given must be a typo.", "Dismissing the number ignores a possible explanation the text provides."), ("Stop reading because it seems unbelievable.", "Giving up prevents the reader from finding the text’s own explanation."), ("Switch to reading about a different ocean topic.", "Switching topics avoids answering the original question.")],
   "Rereading can reveal how the text explains gradual reef-building over long periods of time.", "When a fact feels surprising, reread for the text’s explanation of how it happens.")

mc("reread", "RI.5.1", 4, "After finishing an article about ancient trade routes, a student cannot explain why merchants traveled in large groups called caravans. Which part should the student reread?",
   "The section explaining the reasons merchants grouped together",
   [("The section listing trade goods only", "A list of goods does not explain why merchants traveled in groups."), ("The map caption alone", "A caption is unlikely to fully explain a social or safety reason."), ("The concluding sentence about trade today", "A sentence about modern trade would not explain the historical reason for caravans.")],
   "The section about grouping reasons directly answers why caravans formed.", "Match your specific question to the section most likely to address it.")

mc("reread", "RI.5.1", 2, "A reader is confused by the sentence “Suspension bridges use cables to transfer the weight of traffic to the towers at each end.” What should the reader do first?",
   "Reread the sentence slowly, focusing on each part of the process.",
   [("Skip ahead without rereading.", "Skipping would not resolve confusion about this specific process."), ("Decide the sentence is unimportant.", "The sentence explains a key part of how the bridge works, so it matters."), ("Reread only the word “bridge.”", "Rereading a single word will not clarify the whole process described.")],
   "Slowly rereading the whole sentence helps connect cables, weight, and towers.", "Break a complex sentence into its parts during a careful reread.")

mc("reread", "RI.5.1", 5, "A text about bacteria explains that some bacteria are helpful while others cause illness. A reader wonders if this applies to all microscopic organisms. What is the best step?",
   "Reread the text to see if it compares bacteria to other microscopic organisms.",
   [("Assume all tiny organisms behave the same way.", "The text may distinguish between types, so assuming sameness could be wrong."), ("Stop reading because the question feels too broad.", "Giving up prevents finding any comparison the text might offer."), ("Change the subject to something unrelated.", "Changing the subject avoids answering the original question.")],
   "Rereading can reveal whether the text draws distinctions between organism types.", "Reread to check whether the text actually answers your broader question.")

ms("reread", "RI.5.1", 3, "Which TWO are good reasons to reread a section about how glaciers carve valleys?",
   ["To clarify a confusing geology term", "To notice how one process leads to another"],
   [("To make the section shorter", "Rereading does not shorten text."), ("To avoid finishing the article", "Rereading should support finishing the article, not avoiding it.")],
   "Rereading helps with both vocabulary and understanding cause-and-effect processes.", "Reread to connect ideas and clarify terms, not to stall.")

mc("reread", "RI.5.1", 4, "A student reads that early bicycles had no pedals and riders pushed off the ground with their feet. The student is confused about how this was safer or less safe than modern bikes. What should the student do?",
   "Reread the paragraph to look for a comparison to modern bicycles.",
   [("Guess that early bicycles were always safer.", "Guessing ignores any comparison the text might directly provide."), ("Skip ahead to an unrelated article.", "Switching articles avoids answering the question."), ("Reread only the picture caption.", "A caption alone may not include the full comparison described in the text.")],
   "The paragraph may directly compare safety features of early and modern bicycles.", "Reread for direct comparisons the text makes between two things.")

mc("reread", "RI.5.1", 6, "An article says the human heart has four chambers that each play a different role. A reader cannot remember which chamber does what. What should the reader do?",
   "Reread the paragraph, matching each chamber to its specific role.",
   [("Guess the roles from memory.", "Guessing risks mixing up the chambers’ specific functions."), ("Skip to a paragraph about a different organ.", "A different organ’s paragraph will not explain heart chambers."), ("Decide the chambers all do the same thing.", "The text likely explains that each chamber has a distinct role.")],
   "Rereading carefully lets the reader match each chamber to the role the text describes.", "When a text lists several similar parts, reread slowly to tell them apart.")

tf("reread", "RI.5.1", 2, "A reader who already understands a passage perfectly the first time should still reread it ten times before moving on.", False,
   "Rereading is meant to resolve confusion, not a required number of repeats regardless of understanding.", "Reread based on need, not a fixed number of times.")

mc("reread", "RI.5.1", 5, "A text explains that some fish can detect electric fields produced by other animals. A reader wants to know how this ability works. What should the reader do?",
   "Reread the text looking for the explanation of the sensing organ involved.",
   [("Assume the text is exaggerating.", "Assuming exaggeration skips the chance to find a real scientific explanation."), ("Ignore the detail and move on.", "Ignoring the detail leaves real confusion unresolved."), ("Reread only the diagram, not the words.", "A diagram alone may not fully explain the biological process described in the text.")],
   "Rereading can reveal details about the specialized organ that senses electric fields.", "When an ability seems surprising, reread for the text’s explanation of the mechanism.")

mc("reread", "RI.5.1", 3, "A student rereads a paragraph about forest fires and notices a sentence they missed: “Some seeds only sprout after being exposed to intense heat.” What did rereading help the student do?",
   "Find an important detail that was missed during the first reading.",
   [("Shorten the paragraph.", "Rereading does not change a paragraph’s length."), ("Change the author’s original wording.", "Rereading does not alter the original text."), ("Avoid new information.", "Rereading helped the student gain new information, not avoid it.")],
   "A careful second read can surface sentences that were skipped the first time.", "Rereading slowly can catch details your eyes glossed over at first.")

mc("reread", "RI.5.1", 6, "An article explains that medieval castles had moats, drawbridges, and thick walls. A reader does not understand the specific purpose of a moat. What should the reader do?",
   "Reread the sentence about the moat to look for its stated purpose.",
   [("Decide the moat was just decoration.", "Decoration is unlikely to be the stated reason in a text about defense."), ("Skip to an article about a different building.", "Switching topics would not explain this specific defensive feature."), ("Guess that the moat was for swimming.", "Guessing a recreational use ignores the defensive context of the article.")],
   "Rereading the sentence likely reveals that the moat was meant to slow or stop attackers.", "Look for the stated purpose near the term you are confused about.")

mc("reread", "RI.5.1", 4, "A paragraph about solar panels explains how sunlight, electrons, and wiring work together to create electricity, in that order. A reader mixes up the sequence. What is the best fix?",
   "Reread the paragraph, tracking the order each part is introduced.",
   [("Make up an order that sounds logical.", "Making up an order risks contradicting what the text actually states."), ("Skip the paragraph entirely.", "Skipping would leave the confusing sequence unresolved."), ("Only reread the heading of the section.", "A heading is unlikely to list the full three-part sequence.")],
   "Rereading with attention to sequence clues clarifies the correct order of the process.", "Reread for words like first, then, and finally to track a process.")

mc("reread", "RI.5.1", 7, "A student rereads an article about submarines twice and now understands why they must carefully control both their weight and air supply underwater. What is the BEST explanation for this improvement?",
   "The second reading let the student focus on details that were confusing at first.",
   [("The article’s content changed between readings.", "A text does not change simply because it is read a second time."), ("The student read it much faster the second time.", "Reading faster typically reduces, not increases, careful understanding."), ("The student skipped the confusing parts both times.", "Skipping confusing parts twice would not explain improved understanding.")],
   "A slower, more careful second reading allows focus on previously confusing details.", "Careful, attentive rereading—not speed—builds deeper understanding.")

tf("reread", "RI.5.1", 1, "Rereading is useful only for science articles and never helps with history or social studies texts.", False,
   "Rereading is a general strategy that helps with confusing text in any subject, not just science.", "Rereading works across all subjects, not just one.")

mc("reread", "RI.5.1", 5, "After reading about satellites orbiting Earth, a student is confused about why satellites do not fall out of the sky. What should the student do?",
   "Reread the section explaining the balance between gravity and speed.",
   [("Guess that satellites have engines running constantly.", "Constant engine use is not the explanation most texts give for staying in orbit."), ("Skip the whole section about orbits.", "Skipping would leave the confusion unresolved."), ("Assume gravity does not affect satellites.", "Gravity does affect satellites; the text likely explains how orbit balances this force.")],
   "Rereading the section can reveal how a satellite’s speed balances Earth’s gravity to keep it in orbit.", "When a fact seems to defy common sense, reread for the text’s scientific explanation.")

# ================================================================== evaluate-argument
grade(6)

mc("evaluate-argument", "RI.6.8", 1, "A writer claims, “Our school should start an hour later because teenagers need more sleep.” What is the claim in this argument?",
   "The school should start an hour later.",
   [("Teenagers need more sleep.", "This is the reasoning that supports the claim, not the claim itself."), ("Our school has classes.", "This is an unrelated fact, not the claim."), ("Sleep is healthy.", "This is a general idea, not the specific claim being argued.")],
   "The claim is the specific position the writer wants readers to accept.", "The claim is usually the main opinion the whole argument is trying to prove.")

mc("evaluate-argument", "RI.6.8", 1, "A student argues against homework by saying, “Homework is just busywork, and everyone knows busywork is pointless.” What is weak about this reasoning?",
   "It assumes something is true just because many people supposedly believe it.",
   [("It uses too many big words.", "Word choice is not the issue; the reasoning itself is weak."), ("It is too short to be an argument.", "Length is not the problem; the logic itself is flawed."), ("It does not mention homework at all.", "The argument does mention homework directly.")],
   "Claiming “everyone knows” something is a bandwagon appeal, not real evidence.", "Watch for arguments that rely on popularity instead of facts.")

mc("evaluate-argument", "RI.6.8", 2, "An article argues cities should add more bike lanes and supports this with data showing bike injuries dropped 40% in cities that added protected lanes. Is this evidence relevant to the claim?",
   "Yes, because it directly connects bike lanes to fewer injuries, supporting the claim’s safety benefit.",
   [("No, because injury statistics have nothing to do with bike lanes.", "The statistic directly links bike lanes to a drop in injuries, so it is clearly related."), ("No, because the article does not mention bike lanes at all.", "The article’s central topic is bike lanes, so this option misstates the argument."), ("Yes, but only because it mentions a percentage.", "A percentage alone is not what makes evidence relevant; its connection to the claim does.")],
   "The statistic shows a direct link between the proposed action and a real safety outcome.", "Relevant evidence directly supports the specific claim being made.")

mc("evaluate-argument", "RI.6.8", 2, "A letter to the editor says, “We must ban plastic bags immediately, or our oceans will be completely dead within five years.” What technique does this sentence use?",
   "An extreme, exaggerated prediction to create fear",
   [("A calm explanation of recycling methods", "The sentence is alarming, not calm or explanatory."), ("A balanced comparison of two solutions", "Only one option, banning bags, is discussed; no comparison is made."), ("A direct quotation from a marine scientist", "No source or quotation is given for this prediction.")],
   "The extreme claim about oceans being “completely dead” in five years is an exaggeration meant to scare readers.", "Watch for absolute, dramatic predictions that lack supporting evidence.")

mc("evaluate-argument", "RI.6.8", 2, "An essay claims school uniforms reduce bullying and supports this only by saying, “My cousin’s school has uniforms, and nobody there gets bullied.” Why is this evidence weak?",
   "A single personal example cannot prove something is true for schools in general.",
   [("It is weak because it is written in first person.", "Point of view does not determine whether evidence is strong or weak."), ("It is weak because uniforms are mentioned.", "Mentioning uniforms is necessary since that is the topic of the claim."), ("It is weak because the cousin attends school.", "Attending school is irrelevant to the strength of the evidence.")],
   "One anecdote is not enough evidence to support a broad claim about all schools.", "A single example, or anecdote, is weaker evidence than data from many cases.")

mc("evaluate-argument", "RI.6.8", 3, "An opinion piece argues against raising the driving age by saying, “Lowering the driving age last year clearly caused the rise in traffic jams this year.” What is the flaw in this reasoning?",
   "It assumes one event caused another just because it happened first, without real proof.",
   [("It fails to mention traffic jams at all.", "Traffic jams are directly mentioned in the argument."), ("It uses too much statistical data.", "No statistical data is actually provided in this argument."), ("It focuses only on pedestrians, not drivers.", "The argument is entirely about drivers and the driving age, not pedestrians.")],
   "This is a false-cause fallacy: one event happening before another does not prove it caused the other.", "Just because B follows A does not prove A caused B.")

mc("evaluate-argument", "RI.6.8", 3, "A city council member argues for a new community garden, citing a university study of 50 cities showing gardens reduced local food costs by 15% on average. Compared to a single resident’s opinion, why is this evidence stronger?",
   "It is based on data from many cities rather than one person’s impression.",
   [("It is stronger because a council member said it.", "Who states the evidence does not make data more reliable; the data itself does."), ("It is stronger because it mentions gardens.", "Simply mentioning the topic does not make evidence strong."), ("It is stronger because it includes a percentage.", "A number alone is not what makes evidence strong; its broad, studied basis does.")],
   "A large study across many cities is more reliable than one person’s limited experience.", "Evidence from many cases is generally stronger than a single opinion or example.")

mc("evaluate-argument", "RI.6.8", 3, "A debate speaker says, “My opponent wants to cut the art budget, so clearly she hates creativity and wants children to suffer.” What is wrong with this statement?",
   "It unfairly attacks the opponent’s character instead of addressing her actual argument.",
   [("It correctly summarizes the opponent’s budget proposal.", "The statement exaggerates and distorts the opponent’s actual position rather than summarizing it fairly."), ("It provides strong evidence for cutting the art budget.", "No evidence about the budget itself is given; it is an attack on character."), ("It focuses only on factual spending numbers.", "No spending numbers are mentioned at all.")],
   "This is an ad hominem attack: it insults the opponent’s character instead of addressing her reasoning.", "A fair argument responds to ideas, not insults aimed at a person.")

mc("evaluate-argument", "RI.6.8", 4, "An article claims, “Video games cause violence,” and supports this only by describing one teenager who played violent games and later got in a fight. Is this evidence sufficient to prove the claim?",
   "No, because one isolated case cannot prove a broad claim about all video games.",
   [("Yes, because the teenager definitely played video games.", "Confirming the teenager played games does not establish a broad cause-and-effect claim."), ("Yes, because fights are a serious topic.", "The seriousness of a topic does not make limited evidence sufficient."), ("No, because video games are not mentioned.", "Video games are directly mentioned as part of the example.")],
   "A single example is not enough to support a sweeping claim about video games in general.", "A broad claim needs broad evidence, not just one story.")

mc("evaluate-argument", "RI.6.8", 4, "A persuasive essay about ocean cleanup states, “According to a 2023 marine biology study, plastic debris in the Pacific has tripled since 2000.” Why might this source be considered credible?",
   "It cites a specific, dated scientific study rather than a vague or unnamed claim.",
   [("It is credible because the topic is about the ocean.", "The topic itself does not make a source credible; its basis in named research does."), ("It is credible because it uses the word “tripled.”", "A dramatic-sounding word does not establish credibility; the cited study does."), ("It is credible because it appears in an essay.", "Simply appearing in an essay does not make a claim credible without a named, specific source.")],
   "Naming a specific, dated study gives readers a way to verify the claim, which builds credibility.", "Specific, named sources are generally more credible than vague references.")

mc("evaluate-argument", "RI.6.8", 4, "A classmate argues, “If we allow students to use phones during lunch, soon they’ll want phones during tests, and eventually school will have no rules at all.” What flaw does this argument show?",
   "It assumes one small change will lead to extreme, unlikely consequences.",
   [("It correctly predicts a realistic and likely chain of events.", "The chain of extreme outcomes described is unlikely and not supported by evidence."), ("It focuses only on lunchtime rules, ignoring other topics.", "The argument actually expands far beyond lunchtime rules to extreme, unrelated outcomes."), ("It uses a specific statistic about phone use.", "No statistic is used anywhere in this argument.")],
   "This is a slippery-slope fallacy: it assumes a small change must lead to a drastic, unproven outcome.", "Be suspicious of arguments claiming one step must lead to an extreme chain reaction.")

mc("evaluate-argument", "RI.6.8", 5, "An article argues for mandatory recess and acknowledges, “Some worry recess cuts into learning time, but studies show short breaks actually improve focus afterward.” What does acknowledging this counterargument do for the essay?",
   "It makes the argument more credible by showing the writer considered an opposing view.",
   [("It weakens the essay by admitting the writer is wrong.", "Addressing and refuting a concern is not the same as admitting the whole argument is wrong."), ("It is irrelevant because recess is unrelated to learning.", "The counterargument is directly about how recess relates to learning time."), ("It contradicts the main claim entirely.", "The writer refutes the concern, which supports rather than contradicts the main claim.")],
   "Addressing and responding to an opposing view shows the writer has considered multiple sides fairly.", "A strong argument often anticipates objections and explains why they do not outweigh the claim.")

mc("evaluate-argument", "RI.6.8", 5, "A speech claims cafeteria food should be healthier, citing a nutritionist’s expert opinion, a survey of 500 students, and a comparison to three other districts’ menus. What makes this argument strong?",
   "It combines several different, credible types of evidence rather than relying on just one.",
   [("It is strong because it is a speech, not an essay.", "The format of a speech versus essay does not determine the strength of its evidence."), ("It is strong because it mentions the number three.", "A specific number alone is not what makes the evidence strong."), ("It is strong because it is about food.", "The topic itself does not determine the strength of the argument’s evidence.")],
   "Using expert opinion, a large survey, and real comparisons together builds a well-rounded, convincing case.", "Arguments that combine multiple kinds of credible evidence are generally stronger than those relying on one type.")

mc("evaluate-argument", "RI.6.8", 5, "A blog post argues against zoos, stating only, “Zoos are sad places.” Which revision would make this argument more convincing?",
   "Adding specific evidence about animal stress levels or enclosure sizes compared to natural habitats",
   [("Repeating the phrase “zoos are sad” three more times.", "Repetition without new evidence does not make an argument stronger."), ("Making the font of the claim larger.", "Formatting changes do not affect the logical strength of an argument."), ("Adding more exclamation points to the sentence.", "Punctuation for emphasis does not provide evidence for the claim.")],
   "Specific, factual evidence about animal welfare would support the claim far better than an unsupported feeling.", "Vague emotional claims become convincing arguments only once specific evidence is added.")

mc("evaluate-argument", "RI.6.8", 5, "An editorial argues for a four-day school week and provides this evidence: a pilot program in one district showed improved test scores. What additional information would help evaluate whether this evidence is sufficient?",
   "Whether other factors in that district, besides the schedule, might explain the improved scores",
   [("The exact date the editorial was published", "The publication date does not help evaluate whether the schedule itself caused the improvement."), ("How many pages the editorial is.", "Length has nothing to do with the strength of the evidence."), ("The name of the newspaper that printed it.", "The name of the newspaper does not determine whether the cause-and-effect claim is sound.")],
   "Checking for other possible causes helps determine whether the schedule change, and not something else, truly caused the improvement.", "Before accepting a cause-and-effect claim, consider whether other factors could explain the result.")

mc("evaluate-argument", "RI.6.8", 6, "A student writer claims minimum wage for teens should rise, using a single friend's unfairly low paycheck as the only evidence, while the article overall discusses national wage statistics elsewhere. Which revision would most improve the argument's evidence?",
   "Replacing or supplementing the anecdote with broader data on teen wages across the region",
   [("Describing the friend's paycheck in greater emotional detail", "Adding more emotional detail to one story does not make the evidence more representative or sufficient."), ("Mentioning the friend's favorite school subject", "A detail unrelated to wages does not strengthen the argument's evidence."), ("Repeating the claim at the end of every paragraph", "Repeating the claim does not add any new supporting evidence.")],
   "Broader regional data would make the case far more representative than one friend's experience.", "When an argument relies on a single story, ask what wider data could replace or support it.")

mc("evaluate-argument", "RI.6.8", 6, "An article about youth sports argues early specialization in one sport increases injury risk, citing a sports-medicine association’s position statement and three peer-reviewed studies. A reader claims this argument is weak because “sports articles are always biased.” Is this a fair evaluation?",
   "No, because it dismisses solid medical evidence without pointing to any specific flaw in it.",
   [("Yes, because all articles about sports are untrustworthy.", "This is an unsupported generalization, not a specific flaw in this argument's evidence."), ("Yes, because peer-reviewed studies are rarely accurate.", "Peer-reviewed studies are generally considered reliable; this claim is unsupported."), ("No, because the article never mentions any evidence.", "The article clearly cites a position statement and three peer-reviewed studies.")],
   "Dismissing credible, cited evidence with a vague generalization is not a fair or specific critique.", "A fair evaluation points to a specific weakness in the evidence, not a blanket dismissal.")

mc("evaluate-argument", "RI.6.8", 1, "A flyer states, “Vote for the new playground proposal because it will make our park better.” What is missing from this argument?",
   "Specific evidence or reasons explaining how the playground will improve the park",
   [("A claim about the park.", "The flyer does state a claim about improving the park."), ("Any mention of voting.", "The flyer directly mentions voting for the proposal."), ("A title for the flyer.", "Whether the flyer has a title is not the issue with its argument.")],
   "The flyer states an opinion but gives no specific reasons or evidence to support it.", "A claim without supporting reasons is an opinion, not yet a complete argument.")

mc("evaluate-argument", "RI.6.8", 2, "An article about renewable energy states, “Solar panels are getting cheaper, and some cities report lower electricity bills after installing them.” Is this evidence relevant to an argument for using more solar energy?",
   "Yes, because cost and savings are directly related to whether solar energy is worth adopting.",
   [("No, because electricity bills have nothing to do with solar panels.", "Electricity bills are directly affected by whether a city uses solar panels."), ("No, because cities are not involved in solar energy use.", "Several cities installing solar panels are directly described in the evidence."), ("Yes, but only because the sentence is short.", "The length of the sentence has nothing to do with whether the evidence is relevant.")],
   "Falling cost and lower bills are directly relevant facts for deciding whether solar energy is worthwhile.", "Ask whether the evidence actually bears on the specific claim being made.")

mc("evaluate-argument", "RI.6.8", 2, "A letter about protecting coral reefs says, “Reefs are beautiful, so we should ban all boats near them.” What is the weakness in this reasoning?",
   "A reef’s beauty alone does not logically prove that banning all boats is the right solution.",
   [("It fails to mention coral reefs.", "Coral reefs are directly and repeatedly mentioned."), ("It uses a scientific study as evidence.", "No scientific study is cited anywhere in this sentence."), ("It focuses only on economic costs.", "No economic costs are discussed in this sentence at all.")],
   "The reasoning jumps from an emotional appeal (beauty) straight to an extreme solution without real evidence connecting the two.", "A strong solution needs evidence linking the problem to that specific fix, not just an appeal to emotion.")

mc("evaluate-argument", "RI.6.8", 3, "A writer argues against a new highway, stating, “Every single person I asked at the grocery store opposes it, so clearly the whole town is against it.” What is the flaw here?",
   "A small, unrepresentative group cannot reliably stand for the opinion of an entire town.",
   [("It fails to mention the highway at all.", "The highway is directly and clearly the subject of the sentence."), ("It relies on a government report.", "No government report or similar formal source is mentioned."), ("It focuses only on cost estimates.", "No cost estimates are mentioned in this sentence.")],
   "A hasty generalization draws a broad conclusion about a whole town from a very small, biased sample.", "A small sample from one location cannot represent an entire population's views.")

mc("evaluate-argument", "RI.6.8", 3, "An op-ed about space exploration funding cites NASA’s publicly released budget reports and interviews with three astrophysicists. Compared to an anonymous online comment making the same claim, why would this evidence be considered more trustworthy?",
   "It comes from named, verifiable sources with relevant expertise.",
   [("It is more trustworthy because it is longer.", "Length alone does not determine how trustworthy a source is."), ("It is more trustworthy because it discusses space.", "The topic itself does not make a source more or less trustworthy."), ("It is more trustworthy because it was published online.", "Being published online, like the anonymous comment, does not by itself establish trustworthiness.")],
   "Named experts and official reports can be checked and verified, unlike an anonymous, unsupported comment.", "Evidence from identifiable, qualified sources is generally more trustworthy than anonymous claims.")

mc("evaluate-argument", "RI.6.8", 4, "An argument for self-driving cars states, “Self-driving cars will eliminate all car accidents forever.” What is problematic about this claim?",
   "It makes an absolute, overly confident prediction that no technology could realistically guarantee.",
   [("It fails to mention cars at all.", "Cars, specifically self-driving cars, are the entire subject of the sentence."), ("It cites too many statistics.", "No statistics are cited in this claim at all."), ("It focuses only on pedestrian safety.", "Pedestrian safety is not specifically mentioned in this general claim.")],
   "Claiming a technology will eliminate something “forever” and completely is an unsupported, extreme overstatement.", "Be cautious of arguments using words like “always,” “never,” or “forever” without strong evidence.")

mc("evaluate-argument", "RI.6.8", 4, "An article supports remote learning by describing one student who improved grades while learning from home, without mentioning any other students' experiences. Why might this evidence be considered one-sided?",
   "It presents only a success story without acknowledging students who may have struggled with remote learning.",
   [("It is one-sided because it mentions grades.", "Mentioning grades is directly relevant to evaluating the effectiveness of remote learning."), ("It is one-sided because the student is named.", "Whether the student is named or not does not create one-sidedness."), ("It is one-sided because it is about school.", "The subject of school itself does not create a one-sided argument.")],
   "Presenting only a positive example while ignoring students who struggled gives an incomplete, biased picture.", "A balanced argument should acknowledge both successes and struggles, not just one side.")

mc("evaluate-argument", "RI.6.8", 5, "An article arguing for later school start times cites a sleep-medicine association’s guidelines and a three-year study across twelve school districts. A critic claims the argument is weak because it is “too long.” Is this a fair critique?",
   "No, because length does not determine whether evidence is strong or relevant.",
   [("Yes, because longer arguments are always less convincing.", "Length alone does not make an argument weaker or stronger; the quality of evidence does."), ("Yes, because twelve districts is too small a number to matter.", "Twelve districts over three years is actually a fairly substantial and broad sample."), ("No, because the article never actually cites any evidence.", "The article clearly cites both expert guidelines and a multi-year, multi-district study.")],
   "A fair critique addresses the quality or relevance of evidence, not simply how long the argument is.", "Length is not a valid reason to dismiss an argument; focus on the evidence itself.")

mc("evaluate-argument", "RI.6.8", 5, "A proposal to add a school garden includes a farmer’s expert advice, a cost estimate from the district budget office, and results from three similar school gardens elsewhere. What makes this combination of evidence effective?",
   "It draws on expert knowledge, financial reality, and real-world results together.",
   [("It is effective only because it mentions a garden.", "Simply naming the topic does not make the combination of evidence effective."), ("It is effective only because three numbers are used.", "The number of examples alone is not what makes the evidence effective; its variety and credibility do."), ("It is effective only because it was written for school.", "The context of being written for school does not determine the strength of the evidence.")],
   "Combining expert advice, financial facts, and real outcomes addresses the proposal from multiple important angles.", "Strong proposals often combine expert opinion, practical cost data, and real examples.")

mc("evaluate-argument", "RI.6.8", 6, "A speaker argues, “Anyone who disagrees with building the new stadium clearly doesn’t care about our town’s future.” Why is this reasoning flawed, even if the speaker also provides some economic data later?",
   "It unfairly implies that any disagreement must come from not caring, ignoring other valid reasons someone might object.",
   [("It is flawed because it mentions a stadium.", "Mentioning the subject of the debate is necessary and not itself a flaw."), ("It is flawed because it includes economic data.", "Including economic data elsewhere is not the flaw being identified here."), ("It is flawed because it is addressed to the town.", "Addressing the town as the audience is not a flaw in the reasoning.")],
   "This statement unfairly dismisses valid objections by implying only one bad motive explains disagreement.", "Watch for arguments that insult opposing views instead of responding to their actual reasons.")

mc("evaluate-argument", "RI.6.8", 6, "An article claims a town’s new recycling program failed because “litter on Main Street increased the same month the program began.” A classmate points out that a large festival also happened that month. How does this affect the article’s argument?",
   "It shows another likely cause exists, weakening the claim that the recycling program caused the increase.",
   [("It has no effect, because festivals never produce litter.", "Festivals commonly generate significant litter, so this ignores a likely cause."), ("It strengthens the article’s claim about the program.", "An alternative explanation would weaken, not strengthen, the original cause-and-effect claim."), ("It proves the recycling program is working perfectly.", "Nothing in this situation proves the program is working; it only questions the stated cause of the litter.")],
   "Identifying another possible cause, like the festival, shows the original argument may have overlooked a more likely explanation.", "Before accepting a single cause, check whether another event could explain the same result.")

mc("evaluate-argument", "RI.6.8", 3, "A reviewer argues a new library policy is bad, writing only, “I don’t like change.” What is the main problem with this argument?",
   "It gives a personal preference instead of a reason connected to the actual policy.",
   [("It fails to state an opinion.", "The sentence clearly states the reviewer's personal opinion."), ("It includes too much data about the library.", "No data about the library is included at all."), ("It focuses only on other libraries.", "No other libraries are mentioned in this statement.")],
   "Simply disliking change says nothing specific about why the policy itself is actually harmful.", "A real argument needs reasons tied to the specific issue, not just a general preference.")

mc("evaluate-argument", "RI.6.8", 4, "An essay favoring community service requirements cites a single star student who loved volunteering, then concludes, “So every student will love community service.” What is the flaw in this conclusion?",
   "It generalizes one enthusiastic student's experience to predict how every student will feel.",
   [("It fails to mention community service.", "Community service is directly and repeatedly the subject of the essay."), ("It uses a large, representative survey.", "No survey of any kind, large or small, is used; only one student's experience is described."), ("It focuses only on students who dislike volunteering.", "The essay actually focuses only on a student who loved volunteering, not one who disliked it.")],
   "One enthusiastic student's experience cannot reliably predict how an entire student body will react.", "A conclusion about “everyone” needs evidence from many people, not just one example.")

mc("evaluate-argument", "RI.6.8", 2, "An article defending a longer lunch period states, “Students who eat lunch for 45 minutes report feeling less rushed and more focused in afternoon classes, according to a survey of 300 students.” Is this evidence relevant and sufficient?",
   "It is relevant and reasonably sufficient, since it directly connects lunch length to a measurable outcome across many students.",
   [("It is relevant but not sufficient, because surveys are never useful evidence.", "Surveys of a meaningful size are a legitimate and commonly used form of evidence."), ("It is irrelevant, because lunch length has nothing to do with focus.", "The survey directly connects lunch length to a measurable change in focus."), ("It is sufficient only because the number 300 is mentioned.", "The number alone does not make evidence sufficient; its clear connection to the claim does.")],
   "A sizable survey directly linking lunch length to focus is both relevant and reasonably strong evidence.", "Check both whether evidence connects to the claim and whether it comes from a reasonably large, credible source.")

mc("evaluate-argument", "RI.6.8", 3, "A speaker claims, “Everyone knows that students who play sports get worse grades,” without citing any source. What is the main issue with this argument?",
   "It presents an unsupported generalization as if it were an established fact.",
   [("It fails to mention sports at all.", "Sports are directly and repeatedly the topic of this statement."), ("It cites a peer-reviewed study.", "No study or source of any kind is cited in this statement."), ("It focuses only on grades in one specific class.", "The statement is about grades in general, not one specific class.")],
   "Saying “everyone knows” something does not make it true; it simply avoids providing real evidence.", "A claim is not proven just because it is stated as common knowledge.")

mc("evaluate-argument", "RI.6.8", 4, "An argument for banning junk-food ads aimed at children states, “Removing these ads will instantly make every child healthy.” What makes this claim weak?",
   "It overstates what removing ads could realistically achieve, ignoring other factors in children's health.",
   [("It fails to mention children.", "Children are directly and repeatedly mentioned as the subject."), ("It uses a specific, cited statistic.", "No specific statistic is cited in this particular claim."), ("It focuses only on advertising techniques.", "The claim is about the outcome of banning ads, not a description of advertising techniques.")],
   "Health depends on many factors besides advertising, so claiming an “instant” and total fix is an overstatement.", "Watch for claims that promise a single simple fix will solve a complicated problem entirely.")

mc("evaluate-argument", "RI.6.8", 5, "An editorial favoring solar panels on school roofs discusses a pilot program’s energy savings, addresses the concern about installation cost by citing a ten-year payback estimate, and compares outcomes to two similar schools. What makes this a strong argument overall?",
   "It presents evidence, directly responds to a likely objection, and provides comparable real-world examples.",
   [("It is strong only because it is about schools.", "The subject itself does not determine the strength of the argument's reasoning."), ("It is strong only because it mentions ten years.", "A single number alone is not what makes the overall argument strong."), ("It is strong only because panels are mentioned twice.", "Simply repeating a term does not make an argument well-supported.")],
   "Combining evidence, a response to objections, and real comparisons builds a well-rounded, convincing argument.", "The strongest arguments present evidence, address objections, and offer comparable real examples.")

mc("evaluate-argument", "RI.6.8", 2, "A town-hall speaker argues against a curfew for teens, stating, “Curfews insult every responsible teenager in this town.” What logical problem does this statement show?",
   "It assumes all responsible teens would be personally insulted, without evidence that this is actually true.",
   [("It fails to mention teenagers.", "Teenagers are directly the subject of this statement."), ("It cites a city council report.", "No city council report or similar source is cited."), ("It focuses only on curfews for adults.", "The statement is specifically about a curfew for teens, not adults.")],
   "The statement assumes a strong emotional reaction without any evidence that teens in general actually feel insulted.", "An emotional assumption is not the same as evidence that something is actually true.")

mc("evaluate-argument", "RI.6.8", 3, "An article about lowering the voting age cites political-science research showing 16-year-olds in test programs voted at similar informed rates as adults. How does this evidence support the argument?",
   "It provides specific, research-based data suggesting younger teens can vote responsibly.",
   [("It supports the argument only because it mentions an age.", "A number alone does not make evidence supportive; its research basis and relevance do."), ("It supports the argument only because it is from an article.", "Simply appearing in an article does not establish the strength of evidence."), ("It does not support the argument at all.", "The research directly addresses and supports the claim about younger voters' informed participation.")],
   "Specific research comparing informed voting rates directly supports the claim about younger teens' readiness to vote.", "Look for evidence that directly measures the exact outcome the claim is about.")

mc("evaluate-argument", "RI.6.8", 4, "An op-ed opposing a proposed amusement park states, “The one time I visited a similar park, the lines were long, so this park will definitely fail.” What is the flaw in this reasoning?",
   "It bases a broad prediction about a different, new park on a single unrelated past experience.",
   [("It fails to mention an amusement park.", "An amusement park is clearly and repeatedly the subject of the statement."), ("It cites a formal business analysis.", "No formal business analysis or similar study is cited."), ("It focuses only on ticket prices.", "Ticket prices are not mentioned anywhere in this statement.")],
   "One unrelated experience at a different park is not strong evidence for predicting this new park's success or failure.", "A single, unrelated personal experience is weak evidence for predicting an unrelated future outcome.")

mc("evaluate-argument", "RI.6.8", 5, "An essay in favor of grading on a curve addresses the objection that curving is “unfair to top students” by explaining that curves are recalculated so top scores are never lowered, only middle and low scores adjusted upward. Does this response adequately address the concern?",
   "Yes, because it directly explains why the specific fairness concern raised does not actually apply.",
   [("No, because it ignores the concern completely.", "The response directly engages with and explains the specific concern raised."), ("No, because curves are always unfair by definition.", "This is an unsupported assertion, not a response to the specific explanation given."), ("Yes, but only because it uses the word “fair.”", "Using a word is not what makes a response adequate; its direct explanation does.")],
   "Explaining exactly how the method works directly answers the specific fairness objection raised.", "A strong rebuttal explains precisely why a specific objection does not hold up, not just that the writer disagrees.")

mc("evaluate-argument", "RI.6.8", 6, "A student argues that mandatory summer homework improves fall test scores, citing a study from one small private school with unusually small class sizes. A classmate says the evidence is “fine because it’s a real study.” Is this classmate’s evaluation complete?",
   "No, because it overlooks whether the small school’s unique conditions might limit how well the results apply elsewhere.",
   [("Yes, because any real study is automatically sufficient evidence.", "Being a real study does not guarantee the results generalize to very different schools."), ("Yes, because private schools are always representative of all schools.", "Private schools, especially with unusual class sizes, are not necessarily representative of schools generally."), ("No, because the study does not mention test scores.", "The study is specifically about homework's effect on test scores.")],
   "A study's being real does not guarantee its findings apply broadly; unusual conditions can limit how general the results are.", "Consider whether a study’s specific conditions might limit how well its findings apply to other situations.")

mc("evaluate-argument", "RI.6.8", 6, "An argument for building a new skate park states, “A few teens wrote supportive letters, so clearly the whole community wants this.” A second argument for the same park cites a city survey of 2,000 residents showing 68% support. How do these two pieces of evidence compare in strength?",
   "The survey of 2,000 residents is far stronger evidence of community-wide support than a few letters.",
   [("Both pieces of evidence are equally strong.", "A small number of letters and a large, representative survey are not equally strong evidence."), ("The letters are stronger because they are personal and emotional.", "Emotional appeal does not make evidence more reliable than a large, representative survey."), ("Neither piece of evidence is relevant to the skate park.", "Both pieces of evidence are directly about support for the skate park.")],
   "A large, broad survey represents the community far better than a handful of individual letters.", "When comparing evidence, consider how well each piece represents the whole group being discussed.")

mc("evaluate-argument", "RI.6.8", 7, "An investigative report argues a factory’s new filter reduced river pollution, citing water-quality data from upstream and downstream testing stations over eighteen months, expert analysis from an environmental engineer, and acknowledgment that a nearby farm’s runoff could also affect results. How does acknowledging the farm’s runoff affect the overall strength of this argument?",
   "It strengthens the argument’s credibility by showing the writer considered and weighed another possible cause.",
   [("It completely destroys the argument’s claim about the filter.", "Acknowledging another factor does not destroy the claim; it shows careful, honest consideration of alternatives."), ("It is irrelevant because farms have nothing to do with rivers.", "Farm runoff is a well-known and directly relevant source of river pollution."), ("It proves the filter had no effect on pollution at all.", "The data and expert analysis still support the filter's effect; acknowledging another factor does not erase that evidence.")],
   "Honestly acknowledging another possible cause, while still presenting strong supporting data, makes an argument more credible, not less.", "A thorough argument considers alternative explanations rather than ignoring them.")

mc("evaluate-argument", "RI.6.8", 7, "Two articles both argue for stricter coral reef protections. Article A cites a single tour guide’s opinion that “tourists are ruining the reefs.” Article B cites peer-reviewed marine biology data on coral bleaching rates near high-traffic tourist sites over ten years. Which argument provides stronger support for action, and why?",
   "Article B, because long-term, peer-reviewed data provides far more reliable evidence than one person’s opinion.",
   [("Article A, because tour guides see the reefs most often.", "Frequent observation does not substitute for systematic, long-term scientific data."), ("Both articles are equally strong since they reach the same conclusion.", "Reaching the same conclusion does not mean the evidence supporting each argument is equally strong."), ("Article A, because opinions are always more persuasive than data.", "Opinions are generally considered less reliable than long-term, peer-reviewed data.")],
   "Peer-reviewed, long-term data is far more reliable and representative than a single person’s personal opinion.", "When comparing arguments, weigh systematic data more heavily than a single, unverified opinion.")



