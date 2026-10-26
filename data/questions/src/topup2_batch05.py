"""
Question bank top-up 2, batch 05: plot-foreshadowing, subject-verb-agreement,
compare-texts, plot-events, clauses-complex (original content, Grades 4-6).
"""
from qb import P, dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== plot-foreshadowing
grade(4)

# Each tuple: (level, scene, correct_outcome, [(wrong_outcome, rationale), (wrong_outcome, rationale)], tip)
_PF4_MC = [
    (1, "Omar keeps glancing at the dark clouds gathering in the west as his soccer match is about to start.",
     "The soccer match will be delayed by rain.",
     [("Omar will forget his cleats at home.", "Nothing in the detail is about Omar's equipment; it is about the sky."),
      ("Omar's team will lose the match.", "Dark clouds are a weather clue, not a clue about who wins.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (2, "Mariam's kite string has a small fray near the spool, but she doesn't notice it before launching the kite.",
     "The kite string will snap while Mariam is flying it.",
     [("Mariam will win the kite-flying contest.", "A frayed string is a warning sign of trouble, not a sign of winning."),
      ("Mariam will get a brand-new kite.", "The detail is about damage to the string, not about getting a new kite.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (3, "The librarian notices a brown stain spreading across a ceiling tile above the reading corner.",
     "The ceiling tile will leak during the next storm.",
     [("The library will get new furniture.", "A stain on the ceiling is a sign of water damage, not new furniture."),
      ("The librarian will reorganize the books.", "This detail is about the ceiling, not about the books.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (4, "Before the bike race begins, Khalid's chain makes a strange clicking sound every time he pedals.",
     "Khalid's bike chain will break during the race.",
     [("Khalid will arrive late to the race.", "The clue is about the chain's sound, not about being late."),
      ("Khalid will switch to a different bike.", "Nothing in the detail suggests he will change bikes.")],
     "Look for details that seem unusual for the character or the moment."),
    (5, "The trail guide points out a single loose rock wobbling right at the edge of the path.",
     "A small rockslide will block the trail.",
     [("The hikers will find a shortcut.", "A wobbling rock is a warning of danger, not a helpful shortcut."),
      ("The weather will suddenly turn sunny.", "The detail is about a loose rock, not about the weather.")],
     "The author drops hints early so the later event feels believable, not random."),
    (6, "Sara's goldfish suddenly stops eating the morning before her family leaves for vacation.",
     "Sara's fish tank will start leaking.",
     [("Sara's family will buy a new fish.", "The fish not eating is a warning sign, not a reason to buy a new pet."),
      ("Sara will win a prize at school.", "This detail has nothing to do with a prize at school.")],
     "Pay attention to details connected to danger, weather, or breakage."),
    (7, "The skating instructor frowns at the thin, cracking ice forming near the edge of the pond.",
     "Someone will fall through the thin ice on the pond.",
     [("The skating lesson will be cancelled for fun reasons.", "Cracking ice is a safety warning, not a fun surprise."),
      ("The pond will freeze completely solid.", "Thin, cracking ice suggests danger, not a solid freeze.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (1, "At the science fair, Huda's volcano model hisses softly even though she hasn't started her presentation yet.",
     "Huda's volcano model will erupt during her presentation.",
     [("Huda will forget her presentation notes.", "The hissing sound is about the model itself, not about Huda's notes."),
      ("The judges will arrive late.", "This detail describes the volcano model, not the judges' schedule.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (2, "The old lighthouse's light flickers twice just as thick fog begins rolling in from the sea.",
     "A ship will almost miss the rocks in the fog.",
     [("The lighthouse will be torn down.", "A flickering light is a warning sign, not a sign it will be removed."),
      ("The fog will clear up quickly.", "Fog rolling in suggests worsening conditions, not quick clearing.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (3, "A single board on the treehouse ladder creaks loudly under Jad's foot as he climbs up.",
     "The loose board will break when Jad climbs down.",
     [("Jad will decide to paint the treehouse.", "The creaking board is a safety clue, not about painting."),
      ("Jad's friends will build a new ladder right away.", "Nothing in the detail suggests immediate repairs by friends.")],
     "Look for details that seem unusual for the character or the moment."),
    (4, "The baker notices the oven's temperature dial sticking stubbornly at a very high number.",
     "The bread will burn during the contest.",
     [("The baker will win first place easily.", "A stuck, overheating dial is a warning sign, not a sign of an easy win."),
      ("The oven will need new batteries.", "An oven dial sticking has nothing to do with batteries.")],
     "The author drops hints early so the later event feels believable, not random."),
    (5, "Reem's horse snorts and backs away nervously from the gate before their trail ride begins.",
     "Reem's horse will refuse to cross the gate.",
     [("Reem will decide not to ride that day.", "The horse's nervous behavior is the clue, not Reem's own choice."),
      ("The gate will be repainted before the ride.", "This detail is about the horse's reaction, not about painting the gate.")],
     "Pay attention to details connected to danger, weather, or breakage."),
    (6, "The fishermen notice a small tear near the bottom corner of their net before casting it.",
     "The net will rip and the catch will escape.",
     [("The fishermen will catch more fish than usual.", "A tear in the net is a warning of trouble, not of a bigger catch."),
      ("The fishermen will buy a brand-new boat.", "This detail describes the net, not the boat.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (7, "Before the chess tournament starts, Tariq's hands tremble slightly as he sets up his pieces.",
     "Tariq will miss an easy move during the match.",
     [("Tariq will skip the tournament entirely.", "Trembling hands show nervousness before playing, not a decision to skip it."),
      ("Tariq's opponent will forget the rules.", "The detail describes Tariq's nerves, not his opponent's knowledge.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (1, "The farmer watches crows circling low and restless over the ripe wheat field.",
     "A storm will damage the wheat crop.",
     [("The farmer will harvest early for no reason.", "Restless crows are a natural warning sign of bad weather, not an unrelated choice."),
      ("The crows will leave the field permanently.", "The detail shows crows circling now; it doesn't predict they'll leave forever.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (2, "The balloon seller ties a child's balloon with a loose, hurried knot before rushing to the next customer.",
     "A child's balloon will slip free and float away.",
     [("The balloon seller will run out of balloons.", "A loose knot is about one balloon slipping, not about running out of stock."),
      ("The child will ask for a different color balloon.", "This detail is about the knot, not about color preference.")],
     "Look for details that seem unusual for the character or the moment."),
    (3, "The museum guard notices a thin, hairline crack running across the old clay vase.",
     "The old vase will shatter when it is bumped.",
     [("The museum will buy a new vase to replace it.", "The hairline crack is a warning the vase is fragile right now, not about future purchases."),
      ("The guard will move the vase to a locked case.", "The detail only describes the crack; it doesn't say the guard takes action.")],
     "The author drops hints early so the later event feels believable, not random."),
    (4, "Before the swim meet, Dana notices her goggle strap looks stretched and thin.",
     "Dana's goggle strap will snap during the race.",
     [("Dana will set a new personal record.", "A stretched, thin strap is a sign of possible breakage, not of a great performance."),
      ("Dana will switch to a different swim stroke.", "This detail is about her equipment, not her technique.")],
     "Pay attention to details connected to danger, weather, or breakage."),
    (5, "The desert guide warns the group that the morning sky looks strangely still and quiet.",
     "A sandstorm will hit later in the day.",
     [("The group will find water sooner than expected.", "An unusually still sky is a warning sign in the desert, not a sign of finding water."),
      ("The temperature will drop sharply and stay cool.", "A still, quiet sky before a sandstorm is a warning of wind, not cold weather.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (6, "During the final practice run, Zain's robot arm sticks slightly whenever it reaches full extension.",
     "Zain's robot arm will jam during the real competition.",
     [("Zain's robot will finish the course faster than planned.", "A sticking arm is a sign of a mechanical problem, not of improved speed."),
      ("The competition will be rescheduled.", "This detail is about the robot's arm, not about the event's schedule.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (7, "The campers hear an owl calling again and again long before the sun has even set.",
     "An unexpected storm will wake the campers at night.",
     [("The campers will spot a rare bird the next morning.", "An owl calling early is odd behavior often linked to changing weather, not to spotting a bird later."),
      ("The campsite will be unusually quiet all night.", "The owl calling repeatedly suggests something unusual is coming, not a quiet night.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (1, "One step on the old attic staircase wobbles noticeably when Nadia climbs up to look for a book.",
     "The wobbly step will break under Nadia's weight.",
     [("Nadia will decide not to climb the stairs.", "The detail describes the step's condition, not Nadia's decision."),
      ("The attic will turn out to be empty.", "This detail is a safety clue about the stairs, not about what's in the attic.")],
     "Look for details that seem unusual for the character or the moment."),
    (2, "The tide pool guide notices the waves reaching unusually high on the rocks earlier than normal.",
     "The group will have to rush back before the tide traps them.",
     [("The group will find more sea creatures than usual.", "Unusually high waves are a safety warning, not a sign of more wildlife."),
      ("The tide pool guide will end the trip early for lunch.", "The detail is about the tide rising, not about a lunch break.")],
     "The author drops hints early so the later event feels believable, not random."),
    (3, "Before the school play begins, Omar notices the rope holding up the backdrop curtain looks frayed.",
     "The curtain will fall during the play.",
     [("The play will be cancelled before it starts.", "A frayed rope is a sign something may fail later, not that the event is cancelled."),
      ("Omar will forget his lines.", "This detail is about the curtain rope, not about Omar's memory.")],
     "Pay attention to details connected to danger, weather, or breakage."),
    (4, "The beekeeper notices her bees moving slowly and staying close to the hive on a warm, sunny morning.",
     "A storm will arrive that afternoon.",
     [("The bees will produce more honey than usual.", "Bees moving slowly and staying near the hive is a sign of sensing bad weather, not of extra honey."),
      ("The beekeeper will add a new hive.", "This detail describes the bees' behavior, not the beekeeper's plans.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (5, "Laila's bicycle bell rattles loosely every time she hits a bump on the way to the big hill.",
     "The bell will fall off Laila's bike during the ride.",
     [("Laila will reach the hill faster than ever.", "A rattling, loose bell is a sign of a part coming undone, not of better speed."),
      ("Laila will get a brand-new bicycle.", "This detail is about the bell coming loose, not about a new bike.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (6, "The train conductor hears a strange groaning sound coming from deep inside the engine.",
     "The train will have to stop because of engine trouble.",
     [("The train will arrive earlier than scheduled.", "A strange groaning sound suggests a mechanical problem, not an early arrival."),
      ("The passengers will enjoy a smoother ride.", "An odd engine noise is a warning sign, not a sign of comfort.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (7, "The kite shop owner warns Yusuf that the wind today is much stronger than it looks from the ground.",
     "Yusuf's kite will be pulled from his hands by the wind.",
     [("Yusuf's kite will fly higher than any other kite.", "A warning about strong wind suggests a risk of losing control, not an easy, record-setting flight."),
      ("The wind will suddenly die down.", "The warning says the wind is strong, which points to more wind, not less.")],
     "Look for details that seem unusual for the character or the moment."),
    (1, "Before the camping trip, Dad notices the tent's zipper keeps sticking halfway up.",
     "The tent will not close properly during the rainstorm.",
     [("The camping trip will be cancelled entirely.", "A sticking zipper is a small mechanical problem, not a reason to cancel the whole trip."),
      ("Dad will buy a completely new tent before leaving.", "The detail only describes noticing the zipper sticking, not buying a new tent.")],
     "The author drops hints early so the later event feels believable, not random."),
    (2, "Each morning, the orchard's old scarecrow leans a little farther to one side than the day before.",
     "The scarecrow will fall over right before harvest.",
     [("The scarecrow will scare away more birds than before.", "Leaning further each day is a sign of instability, not of working better."),
      ("The farmer will replace the scarecrow with a new one immediately.", "The detail only shows the leaning happening gradually, not an immediate replacement.")],
     "Pay attention to details connected to danger, weather, or breakage."),
    (3, "Sami's little sister keeps asking nervously, “What if we get lost?” before their hike even begins.",
     "They will take a wrong turn on the hike.",
     [("They will finish the hike much faster than planned.", "A nervous question about getting lost is a hint of trouble ahead, not of a faster hike."),
      ("The little sister will decide to stay home instead.", "The detail shows her asking a question before the hike begins, not deciding to stay behind.")],
     "Foreshadowing clues are often small, odd details that matter later."),
    (4, "The classroom's old wall clock has been running slower and slower all week.",
     "Students will be late for the bus.",
     [("Class will be dismissed early that day.", "A slow clock causing confusion is more likely to make students late, not dismissed early."),
      ("The clock will be replaced with a digital one right away.", "The detail only describes the clock running slow, not any replacement happening.")],
     "Ask yourself: why would the author mention this detail at all?"),
    (5, "The storm radio announcer's voice sounds unusually serious as she reads the evening forecast.",
     "A big storm will hit that night.",
     [("The weather will stay calm and clear all night.", "An unusually serious tone from a storm announcer points to worsening weather, not calm skies."),
      ("The radio station will go off the air.", "This detail is about the announcer's tone, not about the station closing.")],
     "A detail that feels out of place is often a clue about what's coming."),
    (6, "The gardener notices the tomato plants wilting every afternoon despite being watered each morning.",
     "A hidden pest will be found eating the tomato roots.",
     [("The tomatoes will grow larger than ever this season.", "Wilting plants despite watering is a sign something is wrong below the soil, not a sign of extra growth."),
      ("The gardener will decide to stop watering completely.", "The detail shows the gardener watering every morning already; nothing suggests stopping.")],
     "Pay attention to details connected to danger, weather, or breakage."),
]
for lvl, scene, correct, wrongs, tip in _PF4_MC:
    mc("plot-foreshadowing", "RL.4.5", lvl, scene + " What is this detail most likely foreshadowing?",
       correct, wrongs,
       "The detail is a specific warning sign placed early in the story that points directly to this later event.",
       tip)

_PF4_TF = [
    (7, "A rope near the sailboat's mast looks slightly frayed the morning before the big race.",
     "This detail most likely foreshadows that the rope will snap during the race.", True,
     "A fraying rope noticed right before a race is a classic warning sign that it may fail under strain."),
    (1, "Right before the robotics match, the battery display reads only half charged.",
     "This detail most likely foreshadows that the robot will shut down in the middle of the match.", True,
     "A low battery right before a big match is a warning sign of a power failure during the event."),
    (2, "The family's new puppy hides under the table all afternoon, even though nothing unusual has happened yet.",
     "This detail most likely foreshadows that the family will decide to get a second puppy.", False,
     "A dog hiding anxiously is a classic sign of sensing an oncoming storm, not a hint about getting another pet."),
    (3, "The kitchen's smoke alarm beeps faintly a few times while the chef is preparing for the dinner rush.",
     "This detail most likely foreshadows that a small fire will break out later in the kitchen.", True,
     "A smoke alarm beeping even faintly is a warning sign that something may ignite later."),
    (4, "A single crack appears along the ice rink's wall the day before the championship game.",
     "This detail most likely foreshadows that the wall will give way slightly during the game.", True,
     "A new crack in a wall right before an intense game is a clue that it may weaken further under pressure."),
    (5, "The farmer's old truck makes a strange rattling sound as he loads it for the trip to market.",
     "This detail most likely foreshadows that the truck will run more smoothly than ever on the trip.", False,
     "A strange rattle is a mechanical warning sign of trouble ahead, not a sign of smooth running."),
    (6, "During warm-up before the spelling bee, Mona keeps mixing up easy words she usually knows well.",
     "This detail most likely foreshadows that Mona will stumble on a word during the real competition.", True,
     "Struggling with easy words during warm-up is a clue that nerves may cause a mistake later."),
    (7, "The night before the road trip, Grandpa checks the car's spare tire twice.",
     "This detail most likely foreshadows that they will get a flat tire somewhere on the road.", True,
     "Checking the spare tire carefully, more than once, hints that it will be needed later in the story."),
    (1, "A strange quiet settles over the farmyard just before the animals suddenly grow restless and nervous.",
     "This detail most likely foreshadows that a loud celebration is about to begin on the farm.", False,
     "Animals growing nervous before an unexplained quiet is a classic warning sign of a natural event like a tremor, not a celebration."),
    (2, "The sailors notice seabirds flying inland earlier in the day than usual.",
     "This detail most likely foreshadows that a storm is approaching the coast.", True,
     "Seabirds flying inland early is a natural sign that they are escaping worsening weather at sea."),
]
for lvl, scene, statement, answer, why in _PF4_TF:
    tf("plot-foreshadowing", "RL.4.5", lvl, scene + " " + statement, answer, why,
       "Read the detail and ask what kind of event it usually warns about.")

# ================================================================== subject-verb-agreement
grade(4)

dd("subject-verb-agreement", "L.4.1", 1, "Choose the verb: “The cat ____ on the warm windowsill every afternoon.”",
   "sleeps", [("sleep", "A singular subject needs a verb with -s."), ("sleeping", "This needs a helping verb to be complete.")],
   "One cat is the subject, so the verb takes -s: sleeps.", "Singular subject, singular verb: add -s.")
dd("subject-verb-agreement", "L.4.1", 1, "Choose the verb: “My cousins ____ races every weekend at the park.”",
   "run", [("runs", "A plural subject does not take -s."), ("running", "This needs a helping verb to be complete.")],
   "“Cousins” is plural, so the verb has no -s: run.", "Plural subject, verb without -s.")
dd("subject-verb-agreement", "L.4.1", 2, "Choose the verb: “Each of the boxes ____ too heavy to lift alone.”",
   "is", [("are", "“Each” is always singular, even though “boxes” is plural."), ("be", "This is not a complete verb form.")],
   "“Each” is the subject and is singular, so it takes “is.”", "Each, every, and either are singular subjects.")
dd("subject-verb-agreement", "L.4.1", 2, "Choose the verb: “The bread and butter ____ already on the table when the guests arrived.”",
   "was", [("were", "The two foods are thought of together as one dish, so the verb is singular."), ("is", "The guests already arrived, so the sentence needs the past tense.")],
   "“Bread and butter” is treated as a single dish here, so it takes the singular past-tense verb “was.”", "Some paired foods act as one idea and take a singular verb.")
mc("subject-verb-agreement", "L.4.1", 3, "Which sentence has correct subject-verb agreement?",
   "Mona and her brother walk to school together every day.",
   [("Mona and her brother walks to school together every day.", "Two subjects joined by “and” need the plural verb “walk.”"),
    ("Mona and her brother is walking to school together every day.", "A compound subject joined by “and” needs “are,” not “is.”")],
   "Two people joined by “and” form a plural subject, so the verb has no -s.", "Subject + and + subject = plural.")
dd("subject-verb-agreement", "L.4.1", 3, "Choose the verb: “Neither the teacher nor the students ____ ready for the fire drill yet.”",
   "seem", [("seems", "With “neither/nor,” the verb agrees with the nearer subject, “students,” which is plural and takes no -s."), ("seemed", "This is the wrong tense; “yet” signals the present.")],
   "The verb agrees with the subject closest to it, “students,” so it is the plural form “seem.”", "With neither/nor and either/or, match the verb to the NEARER subject.")
err("subject-verb-agreement", "L.4.1", 3, ["The flock of geese", " fly", " south every winter."], 1, "flies",
    "“Flock” is a singular collective noun, so it needs the singular verb “flies.”",
    "Collective nouns like flock, team, and class usually take a singular verb.")
mc("subject-verb-agreement", "L.4.1", 4, "Which sentence has correct subject-verb agreement?",
   "Everybody in the class finishes the quiz on time.",
   [("Everybody in the class finish the quiz on time.", "“Everybody” is always singular and needs “finishes.”"),
    ("Everybody in the class are finishing the quiz on time.", "“Everybody” needs the singular helping verb “is,” not “are.”")],
   "“Everybody” is an indefinite pronoun that is always treated as singular.", "Everybody, everyone, and somebody are always singular.")
dd("subject-verb-agreement", "L.4.1", 4, "Choose the verb: “There ____ three apples left in the basket yesterday.”",
   "were", [("was", "“Three apples” is plural, so the verb must be plural: “were.”"), ("is", "“Yesterday” signals the sentence needs the past tense.")],
   "In sentences starting with “there,” the verb agrees with the noun that follows it, and “yesterday” sets the past tense.", "With “there is/are/was/were,” find the real subject after the verb.")
err("subject-verb-agreement", "L.4.1", 4, ["The students in the back row", " talks", " too loudly during the movie."], 1, "talk",
    "“Students” is a plural subject, so the verb needs no -s: talk.",
    "Cover the prepositional phrase (“in the back row”) to find the real subject.")
mc("subject-verb-agreement", "L.4.1", 5, "Which sentence has correct subject-verb agreement?",
   "The box of old photographs sits in the attic.",
   [("The box of old photographs sit in the attic.", "The subject is “box” (singular), not “photographs.”"),
    ("The box of old photographs are sitting in the attic.", "The singular subject “box” needs “is,” not “are.”")],
   "“Box” is the true subject, and it is singular, so the verb is “sits.”", "Cross out the prepositional phrase to find the true subject.")
dd("subject-verb-agreement", "L.4.1", 5, "Choose the verb: “Either the cats or the dog ____ making that noise outside every night.”",
   "keeps", [("keep", "With “either/or,” the verb agrees with the nearer subject, “dog,” which is singular and takes -s."), ("kept", "“Every night” describes a habit now, not the past.")],
   "The nearer subject, “dog,” is singular, so the verb is “keeps.”", "With either/or, match the verb to the NEARER subject.")
err("subject-verb-agreement", "L.4.1", 5, ["The committee", " meet", " every Tuesday afternoon in the library."], 1, "meets",
    "“Committee” acts as one group here, so it takes the singular verb “meets.”",
    "Collective nouns acting as a single unit usually take a singular verb.")
mc("subject-verb-agreement", "L.4.1", 6, "Which sentence has correct subject-verb agreement?",
   "The news about the new playground excites everyone at school.",
   [("The news about the new playground excite everyone at school.", "“News” is always singular even though it ends in -s."),
    ("The news about the new playground are exciting everyone at school.", "“News” takes the singular helping verb “is,” not “are.”")],
   "“News” looks plural but is always treated as singular.", "Some words ending in -s, like news, are still singular.")
dd("subject-verb-agreement", "L.4.1", 6, "Choose the verb: “The number of empty seats ____ surprising this year.”",
   "feels", [("feel", "“The number of” is treated as singular, so the verb needs -s: feels."), ("felt", "This is the wrong tense for “this year.”")],
   "“The number of” is always treated as a singular subject, so it takes “feels.”", "“The number of” is singular; “a number of” is plural.")
mc("subject-verb-agreement", "L.4.1", 6, "Which sentence has correct subject-verb agreement?",
   "A number of students were absent on Monday.",
   [("A number of students was absent on Monday.", "“A number of” is treated as plural, so the verb must be “were.”"),
    ("A number of students is absent on Monday.", "“A number of” takes a plural verb, and this sentence is about Monday, so it is past tense.")],
   "“A number of” is treated as a plural subject, unlike “the number of.”", "“A number of” is plural; “the number of” is singular.")
dd("subject-verb-agreement", "L.4.1", 7, "Choose the verb: “Mathematics ____ my favorite subject this year.”",
   "remains", [("remain", "Some subject names ending in -s, like mathematics, are treated as singular, so the verb needs -s."), ("remained", "This is the wrong tense for “this year.”")],
   "“Mathematics” looks plural but names one subject, so it takes “remains.”", "Subject names like mathematics and news stay singular.")
err("subject-verb-agreement", "L.4.1", 7, ["The pair of scissors", " are sitting", " right where you left it on the desk."], 1, "is sitting",
    "“Pair” names one tool here, so it takes the singular verb “is sitting.”",
    "A pair of something is usually treated as one singular unit.")
dd("subject-verb-agreement", "L.4.1", 7, "Choose the verb: “The team of young swimmers ____ practicing before dawn every day.”",
   "starts", [("start", "“Team” is a singular collective noun here, so the verb needs -s."), ("starting", "This needs a helping verb to be complete.")],
   "“Team” acts as one unit, so it takes the singular verb “starts.”", "Collective nouns like team usually take a singular verb.")

grade(5)

dd("subject-verb-agreement", "L.5.1", 1, "Choose the verb: “The librarian ____ the returned books onto the cart every afternoon.”",
   "stacks", [("stack", "A singular subject needs a verb with -s."), ("stacking", "This needs a helping verb to be complete.")],
   "“Librarian” is singular, so the verb adds -s: stacks.", "Singular subject, singular verb: add -s.")
dd("subject-verb-agreement", "L.5.1", 1, "Choose the verb: “The twins ____ to the same school every day.”",
   "walk", [("walks", "A plural subject does not take -s."), ("is walking", "“Is” does not agree with a plural subject.")],
   "“Twins” is plural, so the verb has no -s.", "Plural subject, verb without -s.")
mc("subject-verb-agreement", "L.5.1", 2, "Which sentence has correct subject-verb agreement?",
   "Either the coach or the players choose the warm-up drill.",
   [("Either the coach or the players chooses the warm-up drill.", "With “either/or,” the verb agrees with the nearer subject, “players,” which is plural."),
    ("Either the coach or the players is choosing the warm-up drill.", "“Is” does not agree with the nearer, plural subject “players.”")],
   "The verb agrees with the subject closest to it, “players.”", "With either/or, match the verb to the NEARER subject.")
dd("subject-verb-agreement", "L.5.1", 2, "Choose the verb: “The herd of goats ____ toward the barn at sunset.”",
   "moves", [("move", "“Herd” is a singular collective noun."), ("moving", "This needs a helping verb to be complete.")],
   "“Herd” is singular, so the verb takes -s: moves.", "Collective nouns like herd, flock, and team are usually singular.")
err("subject-verb-agreement", "L.5.1", 3, ["The pile of dirty laundry", " need", " to be washed today."], 1, "needs",
    "“Pile” is the singular subject, so the verb needs -s: needs.",
    "Cover the prepositional phrase to find the true subject of the sentence.")
dd("subject-verb-agreement", "L.5.1", 3, "Choose the verb: “Everyone on the team ____ excited for the final game.”",
   "appears", [("appear", "“Everyone” is always singular, no matter how many people it includes, so the verb needs -s."), ("appeared", "This is the wrong tense, and “everyone” is singular.")],
   "“Everyone” is an indefinite pronoun that is always singular, so it takes “appears.”", "Everyone, everybody, and someone are always singular.")
mc("subject-verb-agreement", "L.5.1", 4, "Which sentence has correct subject-verb agreement?",
   "A basket of ripe mangoes sits on the counter.",
   [("A basket of ripe mangoes sit on the counter.", "The subject is “basket,” not “mangoes.”"),
    ("A basket of ripe mangoes are sitting on the counter.", "“Basket” is singular, so it needs “is,” not “are.”")],
   "“Basket” is the true, singular subject.", "The noun right after a prepositional phrase is rarely the real subject.")
dd("subject-verb-agreement", "L.5.1", 4, "Choose the verb: “Neither the windows nor the door ____ locked for the night.”",
   "stays", [("stay", "With “neither/nor,” the verb agrees with the nearer subject, “door,” which is singular and takes -s."), ("stayed", "This is the wrong tense for “for the night” describing a nightly routine.")],
   "The nearer subject, “door,” is singular, so the verb is “stays.”", "With neither/nor, match the verb to the NEARER subject.")
err("subject-verb-agreement", "L.5.1", 4, ["The crowd at the stadium", " cheer", " loudly after every goal."], 1, "cheers",
    "“Crowd” is a singular collective noun, so it needs the singular verb “cheers.”",
    "Collective nouns acting as one group usually take a singular verb.")
mc("subject-verb-agreement", "L.5.1", 5, "Which sentence has correct subject-verb agreement?",
   "The jury reaches its decision after a long discussion.",
   [("The jury reach their decision after a long discussion.", "“Jury” acts as one unit here, so it takes the singular verb and pronoun."),
    ("The jury are reaching its decision after a long discussion.", "“Jury” as a single unit needs “is,” not “are.”")],
   "“Jury” is acting as one single decision-making group.", "A collective noun acting as one unit takes a singular verb and pronoun.")
dd("subject-verb-agreement", "L.5.1", 5, "Choose the verb: “The amount of rain this season ____ unusual.”",
   "seems", [("seem", "“Amount” is a singular subject, so the verb needs -s."), ("seeming", "This needs a helping verb to be a complete verb.")],
   "“Amount” is singular, so the verb takes -s: seems.", "“The amount of” is treated as a singular subject.")
err("subject-verb-agreement", "L.5.1", 5, ["A series of workshops", " are planned", " for next month."], 1, "is planned",
    "“Series” is a singular noun even though it looks plural, so it needs “is planned.”",
    "Words like series and species look plural but are usually singular.")
mc("subject-verb-agreement", "L.5.1", 6, "Which sentence has correct subject-verb agreement?",
   "The news from the committee surprises no one.",
   [("The news from the committee surprise no one.", "“News” is always singular, even though it ends in -s."),
    ("The news from the committee are surprising no one.", "“News” takes the singular helping verb “is,” not “are.”")],
   "“News” looks plural but is always treated as singular.", "Some words ending in -s, like news, stay singular.")
dd("subject-verb-agreement", "L.5.1", 6, "Choose the verb: “Economics ____ one of Hadi's favorite subjects next year.”",
   "will be", [("will have been", "A simple prediction about next year uses “will be,” not the perfect form."), ("is", "“Next year” signals the future tense, not the present.")],
   "“Economics” names one subject and the sentence predicts next year, so it takes “will be.”", "Subject names like economics and mathematics stay singular; “next year” signals the future tense.")
err("subject-verb-agreement", "L.5.1", 6, ["Ten kilometers", " are", " a long way to run without stopping."], 1, "is",
    "A distance thought of as one total amount takes the singular verb “is.”",
    "Amounts of distance, time, or money are often treated as one singular unit.")
mc("subject-verb-agreement", "L.5.1", 7, "Which sentence has correct subject-verb agreement?",
   "Half of the cake has already been eaten.",
   [("Half of the cake have already been eaten.", "“Cake” is singular, so the verb must be “has.”"),
    ("Half of the cakes has already been eaten.", "If “cakes” were plural here, the verb would need to be “have,” not “has.”")],
   "With “half of,” the verb agrees with the noun that follows: “cake” is singular.", "With fractions like half, agree the verb with the noun after “of.”")
dd("subject-verb-agreement", "L.5.1", 7, "Choose the verb: “Neither the students nor the teacher ____ noticed the mistake yet.”",
   "has", [("have", "With “neither/nor,” the verb agrees with the nearer subject, “teacher,” which is singular."), ("having", "This needs a helping verb to be complete.")],
   "The nearer subject, “teacher,” is singular, so the verb is “has.”", "With neither/nor, match the verb to the NEARER subject.")
mc("subject-verb-agreement", "L.5.1", 7, "Which sentence has correct subject-verb agreement?",
   "Statistics shows that recycling rates are rising.",
   [("Statistics show that recycling rates are rising.", "When “statistics” means the subject of study, it is treated as singular."),
    ("Statistics is showing that recycling rate are rising.", "“Rate” should stay plural here to match “are rising.”")],
   "As a subject of study, “statistics” is treated as singular.", "Statistics can be singular (a field of study) or plural (a set of numbers).")

# ================================================================== compare-texts
grade(4)

CT_VOLCANO = P("G4-CT-VOLCANO", "Volcanoes: Two Texts", "Paired Texts",
               "Text A\n\nA volcano forms when hot melted rock, called magma, pushes up through cracks in Earth's "
               "crust. When a volcano erupts, the magma flows out as lava.\n\n"
               "Text B\n\nMount Pico is a sleeping volcano on an island. Scientists say it last erupted over four "
               "hundred years ago, but hot steam still rises from cracks near its top.")
mc("compare-texts", "RI.4.9", 2, "What topic do Text A and Text B both describe?",
   "Volcanoes",
   [("Earthquakes", "Neither text mentions earthquakes."), ("Ocean currents", "Neither text discusses ocean currents.")],
   "Text A explains how volcanoes form, and Text B describes one real volcano, so both are about volcanoes.",
   "Look for the one subject every sentence in both texts relates to.", passage=CT_VOLCANO)
mc("compare-texts", "RI.4.9", 3, "Which detail appears ONLY in Text B?",
   "Hot steam still rises near the top of Mount Pico.",
   [("Magma pushes up through cracks in Earth's crust.", "This general fact about how volcanoes form is in Text A, not Text B."),
    ("Lava flows out when a volcano erupts.", "This general fact about eruptions is in Text A, not Text B.")],
   "Only Text B describes Mount Pico's steam, since Text A talks about volcanoes in general.",
   "Ask which text names a specific place or example, not just a general fact.", passage=CT_VOLCANO)
mc("compare-texts", "RI.4.9", 4, "How is the focus of Text A different from the focus of Text B?",
   "Text A explains how volcanoes form in general, while Text B describes one specific volcano.",
   [("Text A describes Mount Pico, while Text B explains volcanoes in general.", "This reverses which text does which job."),
    ("Both texts only describe Mount Pico.", "Text A never mentions Mount Pico; it explains volcanoes in general.")],
   "Text A gives a general explanation, while Text B gives a specific real-world example.",
   "Notice when a text is explaining a general process versus describing one example.", passage=CT_VOLCANO)

CT_PAPER = P("G4-CT-PAPER", "Making Paper: Two Texts", "Paired Texts",
             "Text A\n\nMaking new paper from trees uses a lot of water and energy. Factories must cut down trees, "
             "soak the wood, and press it into sheets.\n\n"
             "Text B\n\nRecycling old paper saves trees and energy. Old paper is mixed with water to make pulp, "
             "which is then pressed into new sheets, just like with wood pulp.")
mc("compare-texts", "RI.4.9", 2, "What do Text A and Text B have in common?",
   "Both describe how paper is pressed into sheets from pulp.",
   [("Both describe how trees are planted.", "Neither text talks about planting trees."),
    ("Both describe how paper is recycled into plastic.", "Neither text mentions plastic.")],
   "Both texts describe wood or paper being turned into pulp and pressed into sheets.",
   "Look for the shared step in a process, even if the materials differ.", passage=CT_PAPER)
tf("compare-texts", "RI.4.9", 3, "According to BOTH texts, paper can be made from wood pulp OR from recycled paper pulp.", True,
   "Text A describes paper made from wood pulp, and Text B describes paper made from recycled paper pulp.",
   "When comparing two texts, look for a shared process even if the materials differ.", passage=CT_PAPER)
mc("compare-texts", "RI.4.9", 4, "Which text would be MORE useful for someone writing about saving trees?",
   "Text B, because it explains how recycling paper saves trees and energy.",
   [("Text A, because it explains how recycling saves energy.", "Text A is about making NEW paper from trees, not about saving them."),
    ("Neither text, because neither mentions trees.", "Both texts mention trees directly.")],
   "Text B directly explains how recycling helps save trees, which matches the writing topic.",
   "Match the writer's goal to the text that gives information supporting that goal.", passage=CT_PAPER)

CT_GARDEN = P("G4-CT-GARDEN", "Growing Vegetables: Two Texts", "Paired Texts",
              "Text A\n\nGrow tomatoes in a sunny spot and water them every morning. Loose, rich soil helps the "
              "roots grow strong.\n\n"
              "Text B\n\nGrow carrots in loose soil so the roots can grow straight down. Carrots need less water "
              "than tomatoes and prefer cooler weather.")
mc("compare-texts", "RI.4.9", 1, "What topic do Text A and Text B both describe?",
   "How to grow a vegetable in a garden.",
   [("How to bake bread.", "Neither text mentions baking."), ("How to build a greenhouse.", "Neither text mentions building anything.")],
   "Both texts give tips for growing a specific vegetable in the garden.",
   "Look for the one subject every sentence in both texts relates to.", passage=CT_GARDEN)
mc("compare-texts", "RI.4.9", 2, "Which detail about SOIL appears in BOTH texts?",
   "Both say the vegetable grows best in loose soil.",
   [("Both say the vegetable needs sandy soil.", "Neither text uses the word “sandy.”"),
    ("Both say the soil should be dry.", "Text A says to water tomatoes every morning, which is not dry soil.")],
   "Text A and Text B both describe loose soil as good for the roots.",
   "Scan both texts for a shared word or idea about the same detail.", passage=CT_GARDEN)

CT_SURVEY = P("G4-CT-SURVEY", "Favorite Stories: Two Surveys", "Paired Texts",
              "Text A\n\nIn a survey of Grade 4 students at Nile School, most students said they liked adventure "
              "stories best, followed by funny stories.\n\n"
              "Text B\n\nIn a survey of Grade 4 students at Palm School, most students said they liked funny "
              "stories best, followed by animal stories.")
mc("compare-texts", "RI.4.9", 5, "How are the results of the two surveys DIFFERENT?",
   "Nile School students liked adventure stories most, while Palm School students liked funny stories most.",
   [("Both schools liked animal stories most.", "Neither survey lists animal stories as the top choice."),
    ("Both schools disliked funny stories.", "Palm School ranked funny stories as the top choice.")],
   "The two surveys show a different top choice for each school.",
   "Compare the FIRST choice named in each survey to spot the difference.", passage=CT_SURVEY)
mc("compare-texts", "RI.4.9", 6, "A writer wants to know which story type Grade 4 students like SECOND best at BOTH schools. Using both texts, what can the writer conclude?",
   "Funny stories were a top pick at Nile School and animal stories were a top pick at Palm School, so the second favorite differs by school.",
   [("Adventure stories were the second favorite at both schools.", "Adventure stories were the first favorite at Nile School, not the second, and aren't mentioned for Palm School."),
    ("The two schools had exactly the same results.", "The order of favorite story types is different at each school.")],
   "Reading both surveys together shows that the second-favorite story type is not the same at each school.",
   "Combine details from both texts before drawing a conclusion.", passage=CT_SURVEY)
mc("compare-texts", "RI.4.9", 7, "Which story type is mentioned in BOTH texts?",
   "Funny stories",
   [("Adventure stories", "This appears only in Text A."), ("Animal stories", "This appears only in Text B.")],
   "Funny stories are named in both the Nile School and Palm School survey results.",
   "Check each text's list of story types for one that shows up in both.", passage=CT_SURVEY)

grade(5)

CT_BRIDGE = P("G5-CT-BRIDGE", "The New Bridge: Two Texts", "Paired Texts",
              "Text A (engineer's journal)\n\nToday we tested the new bridge's cables under heavy loads. "
              "Everything held steady, though the wind made the readings harder to take.\n\n"
              "Text B (newspaper)\n\nThe town celebrated the opening of the new bridge yesterday. Hundreds "
              "gathered to watch the mayor cut the ribbon, and local bakers sold treats all afternoon.")
mc("compare-texts", "RI.5.9", 2, "What event do both Text A and Text B describe?",
   "The same new bridge.",
   [("A different bridge that collapsed.", "Neither text mentions a collapse."), ("A road repair project.", "Neither text is about repairing a road.")],
   "Text A describes testing the bridge, and Text B describes its opening celebration, so both are about the same bridge.",
   "Check whether two texts are describing the same real-world subject from different angles.", passage=CT_BRIDGE)
mc("compare-texts", "RI.5.9", 3, "How is the FOCUS of Text A different from Text B?",
   "Text A focuses on technical testing, while Text B focuses on the public celebration.",
   [("Text A focuses on the celebration, while Text B focuses on testing.", "This reverses the focus of each text."),
    ("Both texts focus only on the mayor's speech.", "Neither text describes the mayor's speech in detail.")],
   "Text A is written like a technical record, while Text B is written like a news story about an event.",
   "Notice the kind of details each text includes: numbers and tests, or crowds and celebration.", passage=CT_BRIDGE)
mc("compare-texts", "RI.5.9", 4, "A student wants to know how SAFE the bridge is. Which text is MORE useful, and why?",
   "Text A, because it describes the engineer's safety tests on the cables.",
   [("Text B, because it describes the celebration crowd.", "The celebration does not provide information about the bridge's safety."),
    ("Neither text, because neither mentions the bridge.", "Both texts are clearly about the same new bridge.")],
   "Only Text A gives information related to the bridge's safety, through its cable tests.",
   "Match the question being asked to the text that actually answers it.", passage=CT_BRIDGE)

CT_SPRING = P("G5-CT-SPRING", "A Dry Spring: Two Texts", "Paired Texts",
              "Text A (almanac)\n\nOld-timers say a dry spring like this one means a hot, dry summer ahead. "
              "Farmers should plant crops that need less water this year.\n\n"
              "Text B (scientist's note)\n\nRainfall this spring measured thirty percent below the ten-year "
              "average. Soil moisture sensors show levels dropping steadily each week.")
mc("compare-texts", "RI.5.9", 3, "What topic do Text A and Text B have in common?",
   "Both describe unusually dry conditions this spring.",
   [("Both describe a recent flood.", "Neither text mentions flooding."), ("Both describe a new type of crop.", "Neither text introduces a new crop.")],
   "Text A and Text B both describe a drier-than-usual spring, just in different ways.",
   "Look past the different writing styles to find the shared subject.", passage=CT_SPRING)
tf("compare-texts", "RI.5.9", 4, "Text A relies on tradition and experience, while Text B relies on measured data.", True,
   "Text A cites what “old-timers say,” while Text B cites rainfall measurements and sensor readings.",
   "Notice whether a text supports its claim with tradition or with data.", passage=CT_SPRING)
mc("compare-texts", "RI.5.9", 5, "Which detail comes ONLY from Text B?",
   "Soil moisture sensors show levels dropping steadily.",
   [("Farmers should plant crops that need less water.", "This advice comes from Text A, the almanac entry."),
    ("A dry spring predicts a hot summer.", "This claim comes from Text A's tradition-based reasoning.")],
   "Only Text B mentions the soil moisture sensors and their readings.",
   "Check which text gives a measurement or instrument reading, not just an opinion.", passage=CT_SPRING)

CT_REVIEWS = P("G5-CT-REVIEWS", "Two Book Reviews", "Paired Texts",
               "Text A (Reviewer 1)\n\nThis adventure novel keeps readers guessing with twist after twist, "
               "though some side characters feel underdeveloped.\n\n"
               "Text B (Reviewer 2)\n\nThe plot moves quickly and the ending surprised me completely, but I "
               "wished the author had spent more time on the smaller characters.")
mc("compare-texts", "RI.5.9", 5, "What do both reviewers AGREE on?",
   "Both reviewers feel the minor characters needed more development.",
   [("Both reviewers think the ending was predictable.", "Both reviewers describe the ending as surprising, not predictable."),
    ("Both reviewers dislike the plot's pace.", "Both reviewers describe the plot as fast-moving, which they enjoy.")],
   "Both Reviewer 1 and Reviewer 2 say the minor characters felt underdeveloped.",
   "Look for a complaint or praise that both texts repeat in different words.", passage=CT_REVIEWS)
mc("compare-texts", "RI.5.9", 6, "Using BOTH reviews, what can a reader conclude about the novel?",
   "The novel has a fast, surprising plot, but its minor characters could be stronger.",
   [("The novel is slow but has excellent minor characters.", "Both reviews describe the plot as fast, and both say the minor characters are weak."),
    ("Both reviewers completely disagree with each other.", "Both reviewers actually agree on the plot's pace and the characters' weakness.")],
   "Combining both reviews shows the plot's strengths and the shared weakness in minor characters.",
   "Synthesize both texts by finding what each one agrees and disagrees on.", passage=CT_REVIEWS)

CT_BAKINGSODA = P("G5-CT-BAKINGSODA", "Baking Soda Reaction: Two Guides", "Paired Texts",
                  "Text A (Guide 1, brief)\n\nMix baking soda and vinegar in a bottle. Watch the bubbles form "
                  "quickly.\n\n"
                  "Text B (Guide 2, detailed)\n\nPour two tablespoons of baking soda into a bottle. Slowly add "
                  "half a cup of vinegar and immediately cover the opening with a balloon to catch the gas.")
mc("compare-texts", "RI.5.9", 6, "How is Text B different from Text A?",
   "Text B gives exact amounts and an extra step to catch the gas, while Text A only gives the general idea.",
   [("Text A gives exact amounts, while Text B does not.", "Text A does not include any measurements; Text B does."),
    ("Both texts describe the exact same amount of detail.", "Text B includes measurements and an extra step that Text A leaves out.")],
   "Text B adds measurements and a balloon step that the brief Text A does not include.",
   "Compare how much detail each set of instructions gives for the same task.", passage=CT_BAKINGSODA)
mc("compare-texts", "RI.5.9", 7, "A teacher wants students to SAFELY capture the gas produced. Which text should the teacher use, and why?",
   "Text B, because it explains how to cover the bottle with a balloon to catch the gas.",
   [("Text A, because it describes the reaction in more detail.", "Text A is the brief version and does not mention catching any gas."),
    ("Either text works equally well for this goal.", "Only Text B explains how to catch the gas.")],
   "Only Text B gives the balloon step needed to capture the gas safely.",
   "Match the teacher's specific goal to the text that actually meets it.", passage=CT_BAKINGSODA)
tf("compare-texts", "RI.5.9", 7, "Both texts describe the same chemical reaction, but Text B includes more steps than Text A.", True,
   "Text A only says to mix the two ingredients, while Text B adds measuring and covering the bottle, giving more steps for the same reaction.",
   "Comparing the NUMBER of steps is one way texts about the same topic can differ.", passage=CT_BAKINGSODA)

grade(6)

CT_MOVING = P("G6-CT-MOVING", "Moving Day: Two Excerpts", "Paired Texts",
              "Text A\n\nMira pressed her palm against the cool bus window and smiled. A new city meant new "
              "streets to explore, new friends waiting to be found.\n\n"
              "Text B\n\nOmar stared at the moving boxes stacked in the hallway and felt his stomach tighten. "
              "Everything familiar was being packed away, and nothing about the new house felt like home yet.")
mc("compare-texts", "RL.6.9", 3, "What theme do Text A and Text B share?",
   "Moving to a new place changes how a character feels about home.",
   [("Winning a difficult competition.", "Neither excerpt describes a competition."), ("Learning to forgive a friend.", "Neither excerpt mentions forgiveness.")],
   "Both excerpts center on a character's feelings while moving to a new home.",
   "Look past the specific plot details to find the bigger idea both texts explore.", passage=CT_MOVING)
mc("compare-texts", "RL.6.9", 4, "How is Mira's attitude DIFFERENT from Omar's?",
   "Mira feels excited about the move, while Omar feels anxious about it.",
   [("Mira feels anxious, while Omar feels excited.", "This reverses each character's attitude."),
    ("Both characters feel excited about the move.", "Omar's tightening stomach shows discomfort, not excitement.")],
   "Mira smiles with excitement, while Omar's tightening stomach shows his anxiety.",
   "Compare each character's physical reaction to find their true feelings.", passage=CT_MOVING)
mc("compare-texts", "RL.6.9", 5, "Which phrase BEST shows Omar's feelings about the move?",
   "felt his stomach tighten",
   [("pressed her palm against the cool window", "This phrase describes Mira's action, not Omar's feelings."),
    ("new streets to explore", "This phrase describes Mira's excited outlook, not Omar's.")],
   "A tightening stomach is a physical sign of Omar's anxiety about the move.",
   "Find the exact words that describe a character's own body or feelings.", passage=CT_MOVING)
tf("compare-texts", "RL.6.9", 6, "Both excerpts use a physical reaction, like a smile or a tightening stomach, to show how the character feels inside.", True,
   "Mira's smile shows excitement and Omar's tightening stomach shows anxiety; both are physical details revealing inner feelings.",
   "Writers often show emotion through small physical details instead of stating the feeling directly.", passage=CT_MOVING)

CT_SEA = P("G6-CT-SEA", "The Sea: Two Moods", "Paired Texts",
           "Text A\n\nStill water. Silver light. The sea holds its breath under a sky gone quiet.\n\n"
           "Text B\n\nThe waves slammed against the hull again and again, each one louder than the last, until "
           "the sailors could barely hear each other shout.")
mc("compare-texts", "RL.6.9", 4, "What natural subject do both texts describe?",
   "The sea",
   [("A desert storm", "Neither text is set in a desert."), ("A mountain climb", "Neither text describes climbing a mountain.")],
   "Both excerpts describe the sea, one calm and one stormy.",
   "Identify the single setting or subject that connects both excerpts.", passage=CT_SEA)
mc("compare-texts", "RL.6.9", 5, "How does the FORM of Text A change the way its calm mood is presented, compared with Text B?",
   "The short poem-like lines in Text A create a quiet, breathing pause, while Text B's long, repeated sentences build a sense of crashing chaos.",
   [("Text A's long paragraphs build chaos, while Text B's short lines feel calm.", "This reverses the forms: Text A uses short lines and Text B uses longer sentences."),
    ("Both texts use the same sentence length to create the same mood.", "Text A uses short, spaced lines while Text B uses longer, repeating sentences.")],
   "Text A's short lines slow the reader down, while Text B's longer sentences build rushing energy.",
   "Notice how sentence length and line breaks affect the pace and mood of a text.", passage=CT_SEA)
mc("compare-texts", "RL.6.9", 6, "Which BEST describes the difference in mood between the two texts?",
   "Text A feels peaceful and still, while Text B feels violent and chaotic.",
   [("Both texts feel peaceful and still.", "Text B describes waves slamming repeatedly, which is not peaceful."),
    ("Text A feels chaotic, while Text B feels calm.", "This reverses the mood of each text.")],
   "Text A's imagery of stillness contrasts sharply with Text B's imagery of crashing waves.",
   "Find the words in each text that reveal its overall mood.", passage=CT_SEA)

CT_FEAR = P("G6-CT-FEAR", "Facing Fear: Two Excerpts", "Paired Texts",
            "Text A\n\nYara's hands shook on the climbing wall until Huda called up, ‘I've got you, just reach "
            "for the blue one.’ With her friend's voice steady below her, Yara found the grip.\n\n"
            "Text B\n\nTariq's knees wobbled at the top of the diving board. No one else was around to help, "
            "so he closed his eyes, counted to three, and jumped on his own.")
mc("compare-texts", "RL.6.9", 5, "How does Yara overcome her fear DIFFERENTLY than Tariq?",
   "Yara is helped by a friend's encouragement, while Tariq relies only on himself.",
   [("Yara relies only on herself, while Tariq is helped by a friend.", "This reverses how each character overcomes their fear."),
    ("Neither character actually overcomes their fear.", "Yara reaches the grip and Tariq jumps, so both overcome their fear.")],
   "Yara is guided by Huda's voice, while Tariq faces his fear completely alone.",
   "Compare WHO or WHAT helps each character move past their fear.", passage=CT_FEAR)
ms("compare-texts", "RL.6.9", 6, "Which TWO details show a character's PHYSICAL reaction to fear?",
   ["Yara's hands shook on the climbing wall.", "Tariq's knees wobbled at the top of the diving board."],
   [("Huda called up encouraging words.", "This describes Huda's action, not a physical fear reaction."),
    ("Tariq jumped on his own.", "This describes the action Tariq takes to overcome his fear, not a fear reaction.")],
   "Shaking hands and wobbling knees are both physical signs of fear in the two characters.",
   "Look for body-related words like shook or wobbled that show a feeling without naming it.", passage=CT_FEAR)
mc("compare-texts", "RL.6.9", 7, "Using BOTH texts, what idea about overcoming fear do they share?",
   "People can overcome fear either with support from others or through their own determination.",
   [("People can only overcome fear with help from a friend.", "Tariq overcomes his fear without anyone's help."),
    ("People can only overcome fear completely alone.", "Yara overcomes her fear with Huda's encouragement, not alone.")],
   "Together, the two texts show two different but equally valid ways to face fear.",
   "Combine both texts' examples to find the broader idea they both support.", passage=CT_FEAR)

# ================================================================== plot-events
grade(4)

PE_KITTEN = P("G4-PE-KITTEN", "The Lost Kitten", "Realistic Fiction",
              "Mishmish the kitten goes missing from the yard. Laila makes posters and hangs them around the "
              "street. Then she hears meowing coming from high in a tree. She calls her neighbor, who brings a "
              "ladder, and the neighbor climbs up and rescues Mishmish.")
order("plot-events", "RL.4.3", 2, "Put the events of the story in order.",
      ["Mishmish the kitten goes missing from the yard.",
       "Laila makes posters and hangs them around the street.",
       "Laila hears meowing coming from high in a tree.",
       "Laila calls her neighbor, who brings a ladder.",
       "The neighbor climbs up and rescues Mishmish."],
      "These are the events in the order they happen in the story.",
      "Look for time-order words like first, then, and finally.", passage=PE_KITTEN)
mc("plot-events", "RL.4.3", 3, "What happens RIGHT BEFORE Laila calls her neighbor?",
   "She hears meowing coming from high in a tree.",
   [("She hangs posters around the street.", "This happens earlier, before she hears the meowing."),
    ("The neighbor rescues Mishmish.", "This happens AFTER the neighbor is called, not before.")],
   "Hearing the meowing is what leads Laila to call her neighbor for help.",
   "Trace the chain of events backward from the question to find what came just before.", passage=PE_KITTEN)
mc("plot-events", "RL.4.3", 4, "What causes Laila to call her neighbor?",
   "She cannot reach the tree branch where Mishmish is stuck.",
   [("She wants help hanging posters.", "The posters were already hung earlier in the story."),
    ("Her neighbor offered to help find the kitten first.", "The story doesn't say the neighbor offered first; Laila calls after finding the kitten.")],
   "Laila calls her neighbor because she cannot reach the branch on her own.",
   "Ask what problem the character cannot solve alone before they ask for help.", passage=PE_KITTEN)

PE_SCIENCEFAIR = P("G4-PE-SCIENCEFAIR", "The Science Fair Spill", "Realistic Fiction",
                   "Yusuf mixes the baking soda and vinegar in his volcano model, and it bubbles over the top, "
                   "spilling red liquid onto his poster. He grabs napkins and wipes up the spill, finishing the "
                   "fix just as the judges arrive at his table.")
order("plot-events", "RL.4.3", 3, "Put the events of the story in order.",
      ["Yusuf mixes the baking soda and vinegar in his model.",
       "The volcano bubbles over the top of the model.",
       "Red liquid spills onto Yusuf's poster.",
       "Yusuf grabs napkins and wipes up the spill.",
       "He finishes fixing the poster just as the judges arrive."],
      "This is the order the events happen in the story.",
      "Picture the scene step by step to track the order.", passage=PE_SCIENCEFAIR)
mc("plot-events", "RL.4.3", 4, "What is the TURNING POINT of the story?",
   "The volcano bubbles over and spills onto the poster.",
   [("Yusuf mixes the baking soda and vinegar.", "This starts the experiment but isn't the turning point where things go wrong."),
    ("The judges arrive at his table.", "By this point, Yusuf has already fixed the problem.")],
   "The spill is the moment the story's problem begins.",
   "The turning point is usually where something unexpected changes the situation.", passage=PE_SCIENCEFAIR)
mc("plot-events", "RL.4.3", 5, "Why does Yusuf grab napkins?",
   "To clean the spilled liquid before it ruins his poster.",
   [("To make his volcano model look more colorful.", "He uses napkins to clean up, not to decorate."),
    ("Because the judges asked him to clean his table.", "The story doesn't say the judges asked him to clean up.")],
   "Yusuf grabs napkins to clean up the spill before the judges see it.",
   "Look for the reason a character acts right after a problem happens.", passage=PE_SCIENCEFAIR)

PE_LIBRARYBOOK = P("G4-PE-LIBRARYBOOK", "The Missing Library Book", "Realistic Fiction",
                   "Nour notices her library book is missing from her bag, so she searches her backpack and her "
                   "room. She remembers reading the book at the park, runs back there, and finds the book on "
                   "the bench, returning it on time.")
order("plot-events", "RL.4.3", 6, "Put the events of the story in order.",
      ["Nour notices her library book is missing from her bag.",
       "She searches her backpack and her room.",
       "She remembers reading the book at the park.",
       "Nour runs back to the park to look for it.",
       "She finds the book on the bench and returns it on time."],
      "This retraces the story's events from the problem to the solution.",
      "Ask yourself what the character does FIRST to solve the problem.", passage=PE_LIBRARYBOOK)
mc("plot-events", "RL.4.3", 6, "What happens AFTER Nour searches her room?",
   "She remembers she read the book at the park.",
   [("She finds the book on the bench.", "This happens later, after she goes to the park."),
    ("She notices the book is missing.", "This happens before she searches her room, not after.")],
   "Remembering the park comes right after the room search fails to turn up the book.",
   "Follow the order of a character's actions one step at a time.", passage=PE_LIBRARYBOOK)
mc("plot-events", "RL.4.3", 7, "Which event is the RESULT of Nour remembering she read the book at the park?",
   "She runs back to the park to look for it.",
   [("She searches her backpack and room.", "This search happened BEFORE she remembered the park, so it isn't the result."),
    ("She returns the book on time.", "This happens later, after she finds the book, as the final result of the whole search.")],
   "Remembering the park directly leads Nour to run back there.",
   "A result is the very next action a character takes because of a new realization.", passage=PE_LIBRARYBOOK)

grade(5)

PE_RELAY = P("G5-PE-RELAY", "The Relay Mix-Up", "Realistic Fiction",
             "The relay team practices handing off the baton all week, but on the day of the meet, the baton "
             "cannot be found. The coach searches the equipment bag, and a spare baton turns up just before the "
             "race starts, so the team runs the relay and crosses the finish line.")
order("plot-events", "RL.5.5", 2, "Put the events of the story in order.",
      ["The relay team practices handing off the baton all week.",
       "On the day of the meet, the baton cannot be found.",
       "The coach searches through the equipment bag.",
       "A spare baton turns up just before the race starts.",
       "The team runs the relay and crosses the finish line."],
      "These events unfold in the order given.",
      "Find signal words like ‘on the day of’ and ‘just before’ to track time.", passage=PE_RELAY)
mc("plot-events", "RL.5.5", 3, "What is the CLIMAX of this story?",
   "The moment the spare baton is found just before the race.",
   [("The team practicing all week.", "This is part of the rising action, before the main problem happens."),
    ("The team crossing the finish line.", "This is part of the falling action, after the main tension is resolved.")],
   "The climax is the moment of highest tension, right before it is resolved.",
   "The climax usually happens right before the main problem is solved.", passage=PE_RELAY)
mc("plot-events", "RL.5.5", 4, "Which event is part of the RISING ACTION?",
   "The team practices handing off the baton all week.",
   [("The spare baton is found just before the race.", "This is the climax, the turning point of tension."),
    ("The team crosses the finish line.", "This is the falling action, after the climax.")],
   "Practicing all week builds up to the story's main problem.",
   "Rising action happens before the climax and builds toward the main tension.", passage=PE_RELAY)

PE_OUTAGE = P("G5-PE-OUTAGE", "The Power Outage", "Realistic Fiction",
              "A family is cooking dinner together when the lights suddenly go out. Dad searches the kitchen "
              "drawer for candles, they light the candles and keep cooking, and the family realizes the "
              "candlelit dinner was more fun than usual.")
mc("plot-events", "RL.5.5", 4, "What CAUSES the family to search for candles?",
   "The lights suddenly go out during dinner.",
   [("They want to make the dinner feel special.", "The family searched for candles because of the outage, not to make things fancy on purpose."),
    ("Dad always lights candles before dinner.", "The story shows the candles were found only after the lights went out.")],
   "The sudden power outage is the direct cause of the candle search.",
   "Find the problem that happens right before a character takes action.", passage=PE_OUTAGE)
order("plot-events", "RL.5.5", 5, "Put the events of the story in order.",
      ["The family is cooking dinner together in the kitchen.",
       "The lights suddenly go out.",
       "Dad searches the kitchen drawer for candles.",
       "They light the candles and keep cooking.",
       "The family realizes the candlelit dinner was more fun than usual."],
      "This is the sequence the events happen in the story.",
      "The problem (lights going out) always comes before the solution (finding candles).", passage=PE_OUTAGE)
mc("plot-events", "RL.5.5", 6, "How does the story's STRUCTURE build tension before the climax?",
   "It shows an ordinary dinner first, which makes the sudden power outage feel more surprising.",
   [("It starts with the candles already lit.", "The story starts with an ordinary dinner before the lights go out, not with candles already lit."),
    ("It explains the ending before anything else happens.", "The story follows normal time order and does not reveal the ending first.")],
   "Starting with a calm, ordinary scene makes the sudden outage feel more unexpected.",
   "Notice how a calm opening scene can make a sudden problem feel bigger.", passage=PE_OUTAGE)

PE_DEADLINE = P("G5-PE-DEADLINE", "The Science Project Deadline", "Realistic Fiction",
                "Dalia remembers leaving her notes at school, so she rebuilds them from memory that night, "
                "finishing her project just as the morning bell rings.")
mc("plot-events", "RL.5.5", 5, "Where does the FLASHBACK occur in this story?",
   "At the beginning, when Dalia remembers leaving her notes at school.",
   [("At the end, when she presents her project.", "The presentation happens in real time, not as a memory of the past."),
    ("In the middle, when she finishes the project.", "Finishing the project happens in the story's present time, not as a flashback.")],
   "Dalia's memory of leaving her notes at school is the flashback that opens the story.",
   "A flashback is a memory of something that already happened before the main action.", passage=PE_DEADLINE)
mc("plot-events", "RL.5.5", 6, "How does the flashback affect the story's structure?",
   "It explains WHY Dalia has to rebuild her notes, before the main action of the night begins.",
   [("It reveals how the story will end before it happens.", "The flashback only explains a past event; it does not reveal the ending."),
    ("It replaces the climax of the story.", "The climax is Dalia finishing just as the bell rings, not the flashback.")],
   "The flashback gives the reader the reason behind Dalia's nighttime rush.",
   "Ask what information the flashback gives the reader before the main events continue.", passage=PE_DEADLINE)
mc("plot-events", "RL.5.5", 7, "Which event is the CLIMAX of the story?",
   "Dalia finishes her project just as the morning bell rings.",
   [("Dalia remembers leaving her notes at school.", "This flashback sets up the problem; it isn't the moment of highest tension."),
    ("Dalia presents her project calmly.", "This is the falling action, after the climax has already passed.")],
   "Finishing right as the bell rings is the moment of greatest tension and relief.",
   "The climax is usually the moment a race against time is finally won or lost.", passage=PE_DEADLINE)

grade(6)

PE_ENVELOPE = P("G6-PE-ENVELOPE", "The Envelope", "Literary Narrative",
                "The envelope sat on the table. Mariam stared. She didn't move. Didn't breathe. Then, slowly, "
                "carefully, as if the paper might shatter, she lifted the flap and unfolded the letter inside, "
                "reading every line twice before she let herself smile.")
mc("plot-events", "RL.6.5", 4, "How do the SHORT sentences at the beginning affect the pacing of this excerpt?",
   "They slow the pacing down and build suspense around the moment of waiting.",
   [("They speed up the pacing to rush through the waiting.", "The short, choppy sentences stretch out the tense moment rather than rushing it."),
    ("They have no effect on the pacing.", "The short sentences clearly change the rhythm compared with the long sentence that follows.")],
   "Short, clipped sentences slow the reader down and stretch out the tense waiting moment.",
   "Notice how sentence length can speed up or slow down the feeling of a scene.", passage=PE_ENVELOPE)
mc("plot-events", "RL.6.5", 5, "Why does the final sentence become much LONGER than the ones before it?",
   "It mirrors the moment tension finally breaks, as Mariam slowly opens and reads the letter.",
   [("It shows Mariam is now in a hurry.", "The long sentence describes her moving slowly and carefully, not hurrying."),
    ("The author ran out of short sentences to use.", "The sentence length is a deliberate structural choice to match the shift in action, not a random change.")],
   "The flowing, longer sentence matches the slow unfolding of the letter after the tense pause.",
   "Ask why a writer would deliberately change sentence length at a key moment.", passage=PE_ENVELOPE)
mc("plot-events", "RL.6.5", 6, "Where does this excerpt most likely fit in the overall structure of a longer story about Mariam?",
   "Near the climax, as the central tension (the exam result) is finally resolved.",
   [("At the very beginning, before any conflict is introduced.", "The excerpt already shows a tense, resolved moment, which comes after a conflict has built up."),
    ("In the middle of the rising action, before any tension has built.", "The excerpt describes the resolution of built-up tension, which fits later in the structure.")],
   "The suspense and relief in this excerpt suggest a long-built tension is finally being resolved.",
   "Look for signs of built-up tension finally breaking to locate a scene near the climax.", passage=PE_ENVELOPE)

PE_SHORTCUT = P("G6-PE-SHORTCUT", "The Shortcut", "Literary Narrative",
                "Khalid chose the shortcut through the alley. Yara chose the long way past the market. Khalid "
                "reached the square first, breathless and alone. Yara reached it ten minutes later, laughing "
                "with a friend she'd run into along the way.")
mc("plot-events", "RL.6.5", 5, "How does the PARALLEL structure (alternating between Khalid and Yara) affect the reader's understanding?",
   "It lets the reader compare the different results of each character's choice side by side.",
   [("It hides Khalid's choice from the reader until the end.", "Khalid's choice is stated clearly at the beginning, not hidden."),
    ("It combines both characters into a single choice.", "The structure keeps the two characters' separate choices and outcomes distinct.")],
   "Switching between Khalid and Yara lets the reader directly compare each path's result.",
   "Alternating between two characters is often used to set up a comparison.", passage=PE_SHORTCUT)
mc("plot-events", "RL.6.5", 6, "What does the structure of this excerpt suggest about the story's theme?",
   "Taking the faster path isn't always the better choice.",
   [("Taking the shortcut is always the best choice in any situation.", "Khalid's shortcut left him alone, which does not support this being the better choice."),
    ("Friendship is not important to the story.", "Yara's enjoyable walk with a friend suggests friendship matters to the story's meaning.")],
   "Khalid arrives first but alone, while Yara arrives later but happier, suggesting speed isn't everything.",
   "Compare the outcomes, not just the speed, to find a story's deeper message.", passage=PE_SHORTCUT)
tf("plot-events", "RL.6.5", 7, "The structure of alternating between the two characters builds toward a comparison rather than a single straight sequence of events.", True,
   "The excerpt switches between Khalid and Yara's choices and results, building a comparison instead of one continuous timeline.",
   "Look for alternating or parallel structure as a clue that a text is building a comparison.", passage=PE_SHORTCUT)

PE_VASE = P("G6-PE-VASE", "The Broken Vase", "Literary Narrative",
            "Everyone else in the room laughed at the joke. Sami forced a smile, but inside, his thoughts were "
            "racing: had anyone noticed the broken vase yet? Then his aunt walked in, holding the shattered "
            "pieces, and the room went quiet.")
mc("plot-events", "RL.6.5", 5, "How does the contrast between the room's laughter and Sami's inner thoughts build tension?",
   "It shows the reader a hidden problem that the other characters don't yet know about.",
   [("It shows that Sami is also laughing at the joke on the inside.", "Sami's racing thoughts are about the broken vase, not about the joke."),
    ("It reveals that everyone already knows about the broken vase.", "The sudden quiet when the aunt enters shows the others did NOT already know.")],
   "Sami's secret worry contrasts with the unaware laughter around him, creating suspense for the reader.",
   "Dramatic tension often comes from the reader knowing something the other characters don't yet.", passage=PE_VASE)
mc("plot-events", "RL.6.5", 6, "What is the function of the final sentence in the structure of this scene?",
   "It delivers the reveal that resolves the suspense built by Sami's hidden worry.",
   [("It introduces a brand-new conflict unrelated to the rest of the scene.", "The aunt's entrance directly resolves the tension already built around the broken vase."),
    ("It returns the scene to the calm mood from the very beginning.", "The room going quiet is a tense moment, not a return to the earlier relaxed laughter.")],
   "The aunt's entrance is the structural turning point that finally reveals the hidden problem.",
   "The final sentence of a tense scene often delivers the moment the built-up suspense has been leading toward.", passage=PE_VASE)
mc("plot-events", "RL.6.5", 7, "If this excerpt is the climax of a longer story, what would most likely come immediately AFTER it in the story's structure?",
   "The falling action, showing how Sami responds to being caught.",
   [("More rising action building up a brand-new problem before this one is addressed.", "A climax is typically followed by falling action resolving the existing tension, not a new unrelated problem."),
    ("The very beginning of the story, introducing Sami for the first time.", "A story's beginning would not logically follow after its climax.")],
   "After a climax, a story typically moves into falling action that resolves the tension just revealed.",
   "After the climax, expect the story to start resolving its central problem, not introduce a new one.", passage=PE_VASE)

# ================================================================== clauses-complex
grade(4)

mc("clauses-complex", "L.4.1", 1, "Which group of words is an INDEPENDENT clause (a complete thought)?",
   "The rain stopped.",
   [("Because the rain stopped.", "The word “because” makes this a dependent clause; it can't stand alone."),
    ("When the rain stopped.", "“When” makes this a dependent clause; it needs a main clause to complete it.")],
   "“The rain stopped” has a subject and a verb and expresses a complete thought.",
   "An independent clause can stand alone as its own sentence.")
mc("clauses-complex", "L.4.1", 2, "Which group of words is a DEPENDENT clause?",
   "After the bell rang",
   [("The bell rang.", "This is a complete thought, so it is an independent clause."),
    ("The students left the room.", "This is also a complete thought on its own.")],
   "“After” begins the clause and leaves it needing a main clause to complete the thought.",
   "Words like after, when, and because often start dependent clauses.")
dd("clauses-complex", "L.4.1", 3, "Choose the subordinating conjunction: “____ the sun set, the sky turned orange and pink.”",
   "As", [("And", "“And” joins two independent clauses, not a dependent clause to a main clause."),
          ("But", "“But” also joins independent clauses, not a dependent clause here.")],
   "“As” connects the time of the sunset to the main event.",
   "Subordinating conjunctions like as, when, and while introduce dependent clauses.")
mc("clauses-complex", "L.4.1", 3, "Which sentence is a COMPLEX sentence (independent clause + dependent clause)?",
   "Although it was cold, the children played outside.",
   [("It was cold, and the children played outside.", "This joins two independent clauses with “and,” making it a compound sentence."),
    ("It was cold. The children played outside.", "These are two separate simple sentences, not one complex sentence.")],
   "“Although it was cold” is a dependent clause attached to the independent clause.",
   "A complex sentence has one dependent clause joined to one independent clause.")
tf("clauses-complex", "L.4.1", 4, "“While the kettle boiled” can stand alone as a complete sentence.", False,
   "The word “while” starts a dependent clause, which needs a main clause to complete its meaning.",
   "If a clause starts with a word like while, because, or although, it usually cannot stand alone.")
err("clauses-complex", "L.4.1", 5, ["Because the bus was late", " Nadia missed", " the first ten minutes of class."], 0, "Because the bus was late,",
    "A dependent clause that starts a sentence needs a comma before the main clause.",
    "When a sentence begins with a dependent clause, add a comma after it.")
mc("clauses-complex", "L.4.1", 6, "Which sentence correctly combines these two ideas using a dependent clause? “The lights went out. We lit candles.”",
   "When the lights went out, we lit candles.",
   [("The lights went out we lit candles.", "This run-on has no conjunction or punctuation connecting the two ideas."),
    ("The lights went out, we lit candles.", "A comma alone cannot join two independent clauses; this needs a conjunction.")],
   "“When” turns the first idea into a dependent clause that sets up the main clause.",
   "Use a subordinating conjunction like when, because, or although to join two related ideas.")
match("clauses-complex", "L.4.1", 7, "Match each dependent clause with the main clause that completes it best.",
      [("Although the test was difficult,", "Hassan finished it with time to spare."),
       ("Since the library was closed,", "we studied at the park instead."),
       ("Unless it rains tomorrow,", "the game will go on as planned."),
       ("Whenever she visits her grandmother,", "Lina brings a small gift.")],
      "Each dependent clause needs a main clause that logically completes its meaning.",
      "Read the dependent clause first and ask what main idea would make sense with it.")

grade(5)

mc("clauses-complex", "L.5.1", 2, "Which group of words is an independent clause?",
   "The museum opens at nine.",
   [("Before the museum opens at nine.", "“Before” makes this a dependent clause."),
    ("Once the museum opens at nine.", "“Once” makes this a dependent clause.")],
   "“The museum opens at nine” has a subject and verb and is a complete thought.",
   "An independent clause can stand alone as its own sentence.")
dd("clauses-complex", "L.5.1", 3, "Choose the subordinating conjunction: “____ she practiced every day, Huda improved quickly at chess.”",
   "Since", [("Or", "“Or” connects independent clauses or choices, not a dependent clause like this."),
             ("Yet", "“Yet” connects contrasting independent clauses, not a cause-and-effect dependent clause.")],
   "“Since” shows the cause-and-effect link between practicing and improving.",
   "Since, because, and as often introduce a reason in a dependent clause.")
mc("clauses-complex", "L.5.1", 3, "Which sentence is complex?",
   "Even though she was nervous, Rana gave her speech confidently.",
   [("She was nervous, but Rana gave her speech confidently.", "This joins two independent clauses with “but,” making it compound."),
    ("She was nervous. Rana gave her speech confidently.", "These are two separate simple sentences.")],
   "“Even though she was nervous” is a dependent clause attached to the main clause.",
   "A complex sentence joins one dependent clause to one independent clause.")
tf("clauses-complex", "L.5.1", 4, "“Whoever finishes first” expresses a complete thought on its own.", False,
   "“Whoever finishes first” depends on a main clause to complete its meaning, such as “gets a prize.”",
   "A clause beginning with whoever, whatever, or whichever is usually dependent.")
err("clauses-complex", "L.5.1", 4, ["Since the storm was approaching", " the captain, turned", " the ship back to port."], 1, "the captain turned",
    "No comma is needed between the subject “captain” and the verb “turned.”",
    "Don't place a comma between a subject and its verb.")
mc("clauses-complex", "L.5.1", 5, "Which sentence correctly combines these ideas with a dependent clause? “The power failed. The team lost their data.”",
   "Because the power failed, the team lost their data.",
   [("The power failed, the team lost their data.", "A comma alone cannot join two independent clauses."),
    ("The power failed the team lost their data.", "This run-on needs a conjunction or punctuation to connect the two ideas.")],
   "“Because” turns the first idea into a dependent clause explaining the cause.",
   "Use because to show that one event is the cause of another.")
mc("clauses-complex", "L.5.1", 6, "Which dependent clause best completes this sentence? “____, the hikers set up camp early.”",
   "Since the trail was longer than expected",
   [("The trail was longer than expected", "Without a subordinating word, this is an independent clause, not a dependent one."),
    ("The hikers set up camp early", "This repeats the main clause instead of giving a reason for it.")],
   "“Since” turns the reason into a dependent clause that fits before the main clause.",
   "A dependent clause often gives the reason behind the action in the main clause.")
match("clauses-complex", "L.5.1", 7, "Match each dependent clause with the main clause that completes it best.",
      [("Because the bridge was under repair,", "drivers took a different route."),
       ("Even though the forecast predicted rain,", "the festival continued outdoors."),
       ("As soon as the bell rang,", "students lined up at the door."),
       ("Wherever the trail led,", "the scouts followed it eagerly.")],
      "Each dependent clause needs a logically matching main clause to form a complete sentence.",
      "Picture the situation described by the dependent clause, then find the matching result.")

grade(6)

mc("clauses-complex", "L.6.1", 2, "Which group of words is a dependent clause?",
   "Which arrived yesterday",
   [("The package arrived yesterday.", "This is a complete, independent thought."),
    ("We opened the package.", "This is also an independent clause.")],
   "“Which” begins a relative clause that depends on a noun it describes.",
   "A relative clause beginning with who, which, or that is usually dependent.")
mc("clauses-complex", "L.6.1", 3, "Which sentence contains a RELATIVE clause (starting with who, which, or that)?",
   "The scientist who discovered the pattern won an award.",
   [("The scientist discovered the pattern and won an award.", "This joins two independent clauses with “and”; it has no relative clause."),
    ("The scientist discovered the pattern. She won an award.", "These are two separate simple sentences with no relative clause.")],
   "“Who discovered the pattern” is a relative clause describing “the scientist.”",
   "Relative clauses describe a noun and start with who, which, or that.")
dd("clauses-complex", "L.6.1", 4, "Choose the correct relative pronoun: “The book, ____ was written in 1920, is still popular today.”",
   "which", [("who", "“Who” refers to people, not a book."),
             ("because", "“Because” introduces a reason, not a description of the book.")],
   "“Which” is the relative pronoun used for things, like a book.",
   "Use who/whom for people, which for things, and that for either.")
tf("clauses-complex", "L.6.1", 4, "In “The bridge, which was built last year, already needs repairs,” the clause “which was built last year” is essential to identifying which bridge is meant.", False,
   "There is only one bridge being discussed, so the clause just adds extra information set off by commas; it is nonrestrictive, not essential.",
   "A clause set off by commas usually adds extra, non-essential information.")
err("clauses-complex", "L.6.1", 5, ["The scientist", " whose research won the award,", " she spoke at our school."], 2, "spoke at our school.",
    "The clause already names the subject (“the scientist”), so the extra pronoun “she” creates a repeated, ungrammatical subject.",
    "Don't repeat the subject with a pronoun after a relative clause.")
mc("clauses-complex", "L.6.1", 5, "Which sentence correctly uses a relative clause to combine these ideas? “The experiment failed. The experiment used the wrong chemical.”",
   "The experiment, which used the wrong chemical, failed.",
   [("The experiment used the wrong chemical, it failed.", "A comma alone cannot join two independent clauses; this also unnecessarily repeats the subject with “it.”"),
    ("The experiment failed used the wrong chemical.", "This combines the two ideas without a relative pronoun, making the sentence unclear.")],
   "“Which used the wrong chemical” is a relative clause that adds detail about the experiment.",
   "A relative clause can combine two related sentences about the same noun.")
mc("clauses-complex", "L.6.1", 6, "Which sentence uses a nonrestrictive clause correctly (set off with commas because it adds extra, non-essential information)?",
   "My uncle, who lives in Alexandria, is visiting next week.",
   [("My uncle who lives in Alexandria is visiting next week.", "Since “my uncle” already identifies one specific person, the clause is extra information and needs commas."),
    ("My uncle, who lives in Alexandria is visiting next week.", "A nonrestrictive clause needs a comma on BOTH sides, not just before it.")],
   "The clause “who lives in Alexandria” is extra, non-essential information, so it needs commas on both sides.",
   "A nonrestrictive clause describing a specific, already-identified noun needs commas on both sides.")
match("clauses-complex", "L.6.1", 7, "Match each sentence opening with the relative clause that completes it correctly.",
      [("The award,", "which surprised everyone, went to the youngest student."),
       ("The teacher", "who assigned the project gave clear instructions."),
       ("The city,", "which sits along the river, floods every spring."),
       ("The students", "whose projects were chosen will present on Friday.")],
      "Each relative clause must logically and grammatically describe the noun it follows.",
      "Check whether the clause describes a person (who/whose), a thing (which), or either (that).")
