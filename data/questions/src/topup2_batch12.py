"""
Question bank top-up 2, batch 12: brings these families to the full target of 50 items each
(original content, Grades 4-6). Families: verbs, problem-solution, author-perspective,
fragments-run-ons, inference.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== verbs
grade(4)
mc("verbs", "L.4.1", 1, "Which word is an action verb? “The puppy barked loudly at the mail truck.”",
   "barked", [("puppy", "This is a noun."), ("loudly", "This is an adverb."), ("truck", "This is a noun.")],
   "“Barked” tells what the puppy did.", "Action verbs show what someone or something does.")
mc("verbs", "L.4.1", 1, "Which word is a linking verb? “The cookies appeared delicious as soon as they left the oven.”",
   "appeared", [("cookies", "This is a noun."), ("delicious", "This is an adjective."), ("oven", "This is a noun.")],
   "“Appeared” links the cookies to the word that describes them.", "Linking verbs: am, is, are, was, were, seem, become, appear.")
dd("verbs", "L.4.1", 2, "Choose the helping verb that completes this sentence correctly: “By sunset, the neighbors ____ repaired the old fence.”",
   "had", [("has", "“Neighbors” is plural, and this event already finished before another past moment."), ("is", "“Is repaired” does not fit a completed past action."), ("having", "This is not a complete verb on its own.")],
   "“Had repaired” is a verb phrase using the helping verb had to show an action completed before another past moment.", "Helping verbs: have, has, had, is, are, will, can.")
mc("verbs", "L.4.1", 2, "Which modal verb shows PERMISSION? “You ____ leave early if you finish your work.”",
   "may", [("must", "“Must” shows something required."), ("would", "“Would” is used for imagined situations."), ("shall", "“Shall” is used for offers or plans.")],
   "“May” shows that permission is being given.", "may/can = permission; must = requirement.")
ms("verbs", "L.4.1", 2, "Which TWO words are verbs? “Mariam whispered the answer, so she felt proud.”",
   ["whispered", "felt"], [("answer", "This is a noun."), ("proud", "This is an adjective.")],
   "“Whispered” is an action verb; “felt” links Mariam to “proud.”", "Find every word that shows action or links ideas.")
mc("verbs", "L.4.1", 3, "Which sentence uses a linking verb correctly after a verb of the senses?",
   "The soup tastes delicious.",
   [("The soup tastes deliciously.", "After a linking verb like “tastes,” use an adjective, not an adverb."),
    ("The soup taste delicious.", "“Soup” is singular, so the verb is “tastes.”"),
    ("The soup tasting delicious.", "This is not a complete verb.")],
   "“Tastes” links the soup to the describing word “delicious.”", "After linking verbs (taste, smell, look, feel), use adjectives.")
dd("verbs", "L.4.1", 3, "Choose the modal verb: “Students ____ bring a pencil to the exam.”",
   "must", [("might", "“Might” shows something possible, not required."), ("could", "“Could” shows ability or possibility."), ("would", "“Would” is for imagined actions.")],
   "“Must” shows the pencil is required.", "must = required; might/could = possible.")
mc("verbs", "L.4.1", 3, "In the sentence “The farmers have planted rice near the river,” which word is the MAIN verb?",
   "planted", [("have", "This is the helping verb."), ("farmers", "This is the subject, a noun."), ("river", "This is a noun.")],
   "“Planted” shows the action; “have” helps show the tense.", "The main verb carries the meaning; helping verbs add detail about time.")
dd("verbs", "L.4.1", 4, "Choose the correct helping verb: “The letter ____ delivered yesterday, since it is already in the mailbox.”",
   "must have been", [("might have been", "“Might” suggests weaker certainty than the clear evidence."), ("could have been", "“Could” also suggests weaker certainty."), ("should have been", "“Should” implies obligation, not a logical conclusion.")],
   "“Must have been” shows a confident conclusion based on strong evidence.", "must have + past participle = a confident conclusion about the past.")
mc("verbs", "L.4.1", 4, "Which modal verb shows the SMALLEST chance something will happen? “It ____ snow in the desert this winter.”",
   "might", [("will", "“Will” shows certainty."), ("must", "“Must” shows strong certainty or a requirement."), ("can", "“Can” shows ability, not a small chance.")],
   "“Might” shows only a small possibility.", "might/may = possible; will/must = more certain.")
mc("verbs", "L.4.1", 4, "Which sentence uses the irregular verb “to be” correctly?",
   "The weather was unusually cold last March.",
   [("The weather were unusually cold last March.", "“Weather” is singular, so use “was.”"),
    ("The weather be unusually cold last March.", "“Be” alone is not a complete verb here."),
    ("The weather is unusually cold last March.", "“Last March” shows the past, so use “was.”")],
   "“Was” agrees with the singular subject “weather” in the past tense.", "Match “to be” to the subject and the time of the action.")
err("verbs", "L.4.1", 5, ["The twins", " has practiced", " their violin solos", " every evening."], 1, " have practiced",
    "“Twins” is plural, so the helping verb must be “have,” not “has.”", "Match the helping verb to the subject.")
dd("verbs", "L.4.1", 5, "Choose the correct word: “After the race, Tariq ____ exhausted.”",
   "looked", [("looks", "The race already happened, so use the past tense."), ("looking", "This needs a helping verb."), ("look", "This does not agree with one person in the past.")],
   "“Looked” links Tariq to the describing word “exhausted” in the past tense.", "Sense verbs like look, seem and feel can act as linking verbs.")
match("verbs", "L.4.1", 5, "Match each verb with the type of verb it is.",
      [("jumped", "Action verb"), ("seems", "Linking verb"), ("has", "Helping verb"), ("might", "Modal verb")],
      "Each verb plays a different role: showing action, linking, helping, or showing possibility.", "Ask what job the verb is doing in the sentence.")
mc("verbs", "L.4.1", 5, "Which sentence correctly uses a helping verb with the main verb “finished”?",
   "By noon, the workers had finished painting the fence.",
   [("By noon, the workers has finished painting the fence.", "“Workers” is plural, so use “had,” not “has.”"),
    ("By noon, the workers had finish painting the fence.", "After “had,” use the past participle “finished.”"),
    ("By noon, the workers have finished painting the fence, yesterday.", "“Have” does not match an action placed firmly in the past with “yesterday.”")],
   "“Had finished” correctly shows an action completed before another point in the past.", "Had + past participle shows one past action finished before another.")
mc("verbs", "L.4.1", 6, "Which sentence uses a modal verb to express a POLITE request?",
   "Would you please pass the water jug?",
   [("Must you please pass the water jug?", "“Must” sounds demanding, not polite."),
    ("Will you please pass the water jug, now?", "“Will” sounds like a command here."),
    ("Can you please pass the water jug, immediately?", "“Immediately” makes this sound like an order, not a request.")],
   "“Would” softens the request and makes it sound polite.", "Would/could often make requests sound more polite than will/can.")
dd("verbs", "L.4.1", 6, "Choose the correct verb form: “By the time the bus arrived, Noor ____ waiting for twenty minutes.”",
   "had been", [("was", "This does not show the action continuing before the bus arrived."), ("has been", "“Has been” is used for actions continuing into the present, not the past."), ("is", "This is present tense.")],
   "“Had been waiting” shows an action that continued up until another past event.", "Had been + -ing shows a longer past action interrupted by a later one.")
mc("verbs", "L.4.1", 7, "Which sentence correctly uses the subjunctive mood with a verb?",
   "If I were taller, I could reach the top shelf.",
   [("If I was taller, I could reach the top shelf.", "The subjunctive uses “were,” not “was,” after “if” for an unreal condition."),
    ("If I am taller, I could reach the top shelf.", "This mixes the present tense with an unreal condition."),
    ("If I were taller, I can reach the top shelf.", "The result clause needs “could,” not “can,” to match the unreal condition.")],
   "“Were” is used after “if” for conditions that are not true, even with a singular subject.", "Unreal “if” clauses use “were,” no matter the subject.")
mc("verbs", "L.4.1", 7, "Which sentence correctly distinguishes a transitive verb from an intransitive one?",
   "In “Samir mailed the package,” mailed is transitive because it has a direct object; in “Samir arrived,” arrived is intransitive because it has no object.",
   [("In both sentences, the verbs are intransitive because no helping verb is used.", "Having no helping verb does not make a verb intransitive."),
    ("In “Samir mailed the package,” mailed is intransitive because “package” is a noun.", "A noun receiving the action is a direct object, which makes the verb transitive."),
    ("In “Samir arrived,” arrived is transitive because it describes an action.", "Showing action alone does not make a verb transitive; it needs a direct object.")],
   "A transitive verb passes its action to a direct object; an intransitive verb does not need one.", "Ask “verb + what?” — if there is an answer, it is transitive.")

grade(5)
mc("verbs", "L.5.1", 1, "Which word is an action verb? “Lina sketched a map of the old souq.”",
   "sketched", [("Lina", "This is a proper noun."), ("map", "This is a noun."), ("souq", "This is a noun.")],
   "“Sketched” tells what Lina did.", "Action verbs show what someone does.")
dd("verbs", "L.5.1", 1, "Choose the linking verb: “The bread ____ warm right out of the oven.”",
   "seemed", [("warm", "This is the adjective, not the verb."), ("bread", "This is the noun subject."), ("oven", "This is a noun.")],
   "“Seemed” links the bread to the describing word “warm.”", "Linking verbs connect a subject to a word that describes it.")
mc("verbs", "L.5.1", 2, "Which sentence contains a helping verb and a main verb?",
   "The scouts were setting up their tents before sunset.",
   [("The scouts set up their tents before sunset.", "This has only one main verb, no helping verb."),
    ("The scouts' tents stood near the river.", "“Stood” is the only verb here."),
    ("The scouts packed their tents at dawn.", "“Packed” is the only verb here.")],
   "“Were setting” is a verb phrase: “were” helps and “setting” is the main verb.", "Verb phrases combine a helping verb with a main verb.")
dd("verbs", "L.5.1", 2, "Choose the modal verb that shows ABILITY: “Khaled ____ solve the puzzle in under a minute.”",
   "can", [("must", "“Must” shows requirement, not ability."), ("should", "“Should” shows advice."), ("would", "“Would” shows a hypothetical choice, not current ability.")],
   "“Can” shows Khaled is able to solve the puzzle.", "can/could = ability; must = requirement; should = advice.")
ms("verbs", "L.5.1", 2, "Which TWO words are verbs? “The kitten pounced on the yarn and tumbled across the rug.”",
   ["pounced", "tumbled"], [("kitten", "This is a noun."), ("yarn", "This is a noun.")],
   "“Pounced” and “tumbled” both show what the kitten did.", "Look for every word that shows an action.")
mc("verbs", "L.5.1", 3, "Which sentence uses a modal verb to express NECESSITY rather than possibility?",
   "Visitors must remove their shoes before entering the mosque.",
   [("Visitors might remove their shoes before entering the mosque.", "“Might” shows possibility, not a requirement."),
    ("Visitors could remove their shoes before entering the mosque.", "“Could” shows ability or possibility."),
    ("Visitors may remove their shoes before entering the mosque.", "“May” shows permission, not a strict rule.")],
   "“Must” shows the rule is required, not optional.", "must = required; might/could/may = possible or allowed.")
dd("verbs", "L.5.1", 3, "Choose the correct helping verb: “By next June, Hoda ____ graduated from secondary school.”",
   "will have", [("has", "This does not show an action finishing by a future point."), ("had", "“Had” places the action in the past, before now."), ("is", "This is present tense.")],
   "“Will have graduated” shows an action completed by a specific point in the future.", "will have + past participle = future perfect tense.")
mc("verbs", "L.5.1", 3, "Which sentence has a transitive verb (an action passed to a direct object)?",
   "Adel repaired the broken fence.",
   [("Adel worked all afternoon.", "“Worked” has no direct object."),
    ("Adel arrived early.", "“Arrived” has no direct object."),
    ("Adel smiled at the puppy.", "“Smiled” does not take a direct object here; “at the puppy” is a prepositional phrase.")],
   "“Repaired” passes its action onto the direct object “fence.”", "Ask “verb + what?” to find a direct object.")
dd("verbs", "L.5.1", 4, "Choose the correct verb: “Neither the players nor the coach ____ satisfied with the result.”",
   "was", [("were", "With “neither…nor,” the verb agrees with the nearer subject, “coach.”"), ("are", "The sentence describes the past, not the present."), ("is", "The sentence describes the past, not the present.")],
   "With “neither…nor,” the verb agrees with the closer subject, “coach,” which is singular.", "neither/nor: match the verb to the nearer subject.")
mc("verbs", "L.5.1", 4, "Which sentence correctly uses a linking verb to compare?",
   "This recipe seems easier than the last one.",
   [("This recipe seems easily than the last one.", "After a linking verb, use an adjective, not an adverb."),
    ("This recipe seem easier than the last one.", "“Recipe” is singular, so the verb is “seems.”"),
    ("This recipe seeming easier than the last one.", "This is not a complete verb.")],
   "“Seems” links the recipe to the comparing adjective “easier.”", "Linking verbs take adjectives, not adverbs.")
err("verbs", "L.5.1", 4, ["By the time we arrived,", " the bakery has sold", " out of", " fresh bread."], 1, " the bakery had sold",
    "An action completed before another past event needs “had,” not “has.”", "Past perfect (had + past participle) shows one past action before another.")
mc("verbs", "L.5.1", 5, "Which sentence shows the correct use of a modal verb for a logical conclusion?",
   "The lights are off and the car is gone, so Samir must be at work.",
   [("The lights are off and the car is gone, so Samir might have never arrived.", "This ignores the strong evidence already given."),
    ("The lights are off and the car is gone, so Samir should be at work.", "“Should” suggests advice, not a conclusion drawn from evidence."),
    ("The lights are off and the car is gone, so Samir could be at work.", "“Could” suggests only a weak possibility, not a strong conclusion.")],
   "“Must” shows a confident conclusion based on strong evidence.", "must (for conclusions) shows near certainty based on clues.")
dd("verbs", "L.5.1", 5, "Choose the correct verb: “The committee ____ its decision at the end of the meeting.”",
   "announces", [("announce", "“Committee” is treated as a single unit, so the verb needs -s."), ("announcing", "This needs a helping verb."), ("have announced", "“Has announced” would be needed, not “have,” for a singular unit.")],
   "“Committee” acts as one group, so it takes the singular verb “announces.”", "Collective nouns usually take a singular verb when acting as one unit.")
match("verbs", "L.5.1", 5, "Match each verb phrase with the verb tense it shows.",
      [("had walked", "Past perfect"), ("will be walking", "Future progressive"), ("has walked", "Present perfect"), ("was walking", "Past progressive")],
      "Each helping verb combination signals a different time relationship.", "Identify the helping verb first, then the tense it creates.")
mc("verbs", "L.5.1", 5, "Which sentence correctly uses the verb “lie” (to rest or recline)?",
   "The cat likes to lie in the warm sunlight.",
   [("The cat likes to lay in the warm sunlight.", "“Lay” needs a direct object; use “lie” when nothing is being placed."),
    ("The cat likes to lied in the warm sunlight.", "“Lied” means “told an untruth,” not “rested.”"),
    ("The cat likes to laid in the warm sunlight.", "“Laid” is the past tense of “lay,” which needs a direct object.")],
   "“Lie” means to rest and takes no direct object.", "lie (no object) = rest; lay (needs object) = put something down.")
mc("verbs", "L.5.1", 6, "Which sentence correctly uses a verb in the passive voice?",
   "The old bridge was repaired by a team of engineers last spring.",
   [("A team of engineers repaired the old bridge last spring.", "This is active voice; the subject performs the action."),
    ("The old bridge repaired a team of engineers last spring.", "This reverses the subject and object illogically."),
    ("The old bridge was repair by a team of engineers last spring.", "The past participle “repaired,” not “repair,” is needed after “was.”")],
   "In passive voice, the subject (“bridge”) receives the action instead of performing it.", "Passive voice: subject + be verb + past participle (+ by someone).")
dd("verbs", "L.5.1", 6, "Choose the correct form: “If the museum ____ open later, more visitors would come.”",
   "were", [("was", "The subjunctive after “if” for an unreal condition uses “were.”"), ("is", "This describes a real, present condition, not a hypothetical one."), ("be", "“Be” alone is not a complete verb form here.")],
   "“Were” is the subjunctive form used after “if” for conditions that are not true.", "Hypothetical “if” clauses use “were,” regardless of subject.")
mc("verbs", "L.5.1", 7, "Which sentence correctly uses a gerund as the subject, distinguishing it from a verb?",
   "Swimming in the cold sea energized the whole team.",
   [("Swim in the cold sea energized the whole team.", "“Swim” alone cannot act as a noun subject here; it needs the -ing form."),
    ("Swimming in the cold sea energize the whole team.", "The subject “swimming” is singular, so the verb must be “energized,” matching tense."),
    ("Swum in the cold sea energized the whole team.", "“Swum” is a past participle, not a noun form that can serve as a subject.")],
   "“Swimming” is a gerund — a verb form acting as a noun — serving as the subject of the sentence.", "A gerund (verb + -ing) can act as a noun, unlike an ordinary verb.")
mc("verbs", "L.5.1", 7, "Which sentence correctly uses an infinitive verb form?",
   "The committee decided to postpone the trip until the weather improved.",
   [("The committee decided postponing the trip until the weather improved.", "After “decided,” the infinitive “to postpone” is the standard form, not the gerund."),
    ("The committee decided to postponed the trip until the weather improved.", "An infinitive uses the base form of the verb: “to postpone,” not “to postponed.”"),
    ("The committee decided postpone the trip until the weather improved.", "The infinitive marker “to” is missing before “postpone.”")],
   "“To postpone” is an infinitive — “to” plus the base form of the verb.", "Infinitives = to + the base form of the verb.")

# ================================================================== problem-solution
grade(4)
mc("problem-solution", "RI.4.5", 1, "Read the paragraph. “Ants kept getting into the kitchen through a crack under the door. Mama placed a thin strip of rubber along the bottom of the door, and the ants stopped coming in.” What problem does the paragraph describe?",
   "Ants were getting into the kitchen.",
   [("The rubber strip was too thin.", "The strip worked; it is not described as a problem."),
    ("Mama could not find the crack.", "She found the crack right away."),
    ("The kitchen door would not close.", "The door is not described as broken.")],
   "The first sentence names the problem: ants entering through the crack.", "The problem is usually named early in a problem-solution paragraph.")
mc("problem-solution", "RI.4.5", 1, "Read the paragraph. “The classroom was too hot every afternoon because the window stuck shut. The custodian oiled the window track, and now it opens easily to let in a breeze.” What was the SOLUTION?",
   "Oiling the window track so it would open",
   [("Turning on a fan", "No fan is mentioned."),
    ("Moving the class to another room", "The class stayed in the same room."),
    ("Closing the curtains", "Curtains are not mentioned.")],
   "Oiling the track fixed the stuck window so a breeze could cool the room.", "Look for the action that fixes the stated problem.")
mc("problem-solution", "RI.4.5", 2, "Read the paragraph. “Books kept disappearing from the classroom shelf without being signed out. Ms. Nabil added a sign-out sheet by the shelf, and after that every book that left the room was recorded.” What problem is described?",
   "Books were going missing without being recorded.",
   [("The shelf was too small for the books.", "Shelf size is not mentioned."),
    ("Students did not like to read.", "Reading interest is not mentioned."),
    ("The sign-out sheet was lost.", "The sheet was added as the fix, not lost.")],
   "The paragraph states books disappeared without being signed out.", "Find the sentence that names what is going wrong.")
dd("problem-solution", "RI.4.5", 2, "Read the paragraph. “The soccer field flooded every time it rained because there was nowhere for the water to drain. Workers dug a shallow ditch along one edge, and now the water drains away within an hour.” Choose the solution: the workers ____.",
   "dug a drainage ditch",
   [("covered the field with sand", "Sand covering is not mentioned."),
    ("moved the field to higher ground", "The field was not moved."),
    ("built a roof over the field", "A roof is not mentioned.")],
   "Digging the ditch gave the rainwater a path to drain away.", "The solution directly removes the cause of the problem.")
mc("problem-solution", "RI.4.5", 2, "Read the paragraph. “Stray cats kept knocking over the trash cans behind the bakery, scattering wrappers across the alley. The baker started using a can with a locking lid, and the alley has stayed clean since.” Why did the new trash can solve the problem?",
   "Its locking lid kept the cats from knocking it open.",
   [("It was painted a bright color.", "Color is not mentioned."),
    ("It was bigger than the old one.", "Size is not mentioned."),
    ("It was placed indoors.", "The can stayed outside, just with a lock.")],
   "The lid locked shut, so cats could no longer open the can and spill trash.", "Ask how the solution removes the exact cause of the problem.")
mc("problem-solution", "RI.4.5", 3, "Read the paragraph. “Every morning, students crowded around one water fountain and were late getting to class. The school installed two more fountains along the hallway, and the lines disappeared.” What was the ROOT CAUSE of the problem?",
   "There were not enough fountains for the number of students.",
   [("Students did not want water.", "Students clearly wanted water, since they crowded the fountain."),
    ("The fountain was broken.", "The fountain worked; there just were not enough."),
    ("Classes started too early.", "Class start time is not blamed in the text.")],
   "Adding more fountains fixed the shortage, showing the real cause was too few fountains.", "The best-fitting solution often reveals the true cause of a problem.")
dd("problem-solution", "RI.4.5", 3, "Read the paragraph. “The community garden's tomato plants kept wilting because nobody watered them on weekends. The gardeners made a watering schedule so someone always came on Saturdays and Sundays.” Choose the word that completes the solution: the gardeners made a watering ____ for weekends.",
   "schedule",
   [("fence", "A fence would not provide water."),
    ("sign", "A sign alone would not water the plants."),
    ("basket", "A basket is not mentioned.")],
   "A schedule ensured someone watered the plants every weekend.", "The solution should directly supply what was missing.")
mc("problem-solution", "RI.4.5", 3, "Read the paragraph. “The library's returned books piled up on the front desk because there was no cart to carry them back to the shelves. The librarian borrowed a rolling cart from the office, and the books were reshelved the same day.” What EFFECT did the cart have?",
   "Books were returned to the shelves quickly instead of piling up.",
   [("The library bought more books.", "Buying books is not mentioned."),
    ("Fewer students returned books.", "The problem was about shelving, not returning."),
    ("The front desk was removed.", "The desk is not mentioned as removed.")],
   "With a cart, the librarian could move books to shelves right away.", "The effect of a solution undoes the original problem.")
mc("problem-solution", "RI.4.5", 4, "Read the paragraph. “Farmers near the canal lost part of their crop every summer when the water level dropped too low to reach their fields. They pooled money to build a small pump station, which now lifts water into the irrigation channels even in dry months.” Which sentence BEST summarizes the problem and solution?",
   "Low water levels were hurting crops, so farmers built a pump station to lift water to their fields.",
   [("Farmers argued over water rights, so the government stepped in.", "No argument or government action is mentioned."),
    ("Crops failed because of pests, so farmers used a spray.", "Pests are not mentioned."),
    ("The canal dried up completely, so farmers dug a new one.", "The canal did not dry up completely; only the level dropped.")],
   "This sentence captures both the stated cause (low water) and the fix (the pump station).", "A good summary names both the problem and the matching solution.")
mc("problem-solution", "RI.4.5", 4, "Read the paragraph. “The school's recycling bins filled up within a day because they were never emptied until Friday. The janitor switched to emptying them every morning instead, and the bins stopped overflowing.” What is the problem-solution structure signal in this paragraph?",
   "A cause (bins emptied only once a week) is followed by a fix (daily emptying).",
   [("A list of steps in time order", "The paragraph is not a sequence of steps for one task."),
    ("A comparison between two kinds of bins", "No second type of bin is compared."),
    ("A description of what the bins look like", "The paragraph focuses on the fix, not appearance.")],
   "The paragraph names a cause of overflow and then the change that fixed it.", "Problem-solution paragraphs link a specific cause to a matching fix.")
dd("problem-solution", "RI.4.5", 4, "Read the paragraph. “Visitors kept getting lost in the museum because the signs pointed in confusing directions. Staff repainted the floor with colored lines leading to each exhibit, and visitors stopped asking for directions.” Choose the best word: the floor lines acted as a ____ for visitors.",
   "guide",
   [("barrier", "Lines do not block movement; they direct it."),
    ("decoration", "The lines served a practical purpose, not just looks."),
    ("warning", "The lines are not described as a warning.")],
   "The colored lines guided visitors to each exhibit.", "Ask what job the solution performs for the people affected.")
mc("problem-solution", "RI.4.5", 5, "Read the paragraph. “The town's single bridge became dangerously crowded every market day, and two near-accidents were reported last month. The council added a second, narrower bridge for pedestrians only, separating foot traffic from carts.” Which detail BEST supports that the solution addressed safety, not just crowding?",
   "The mention of two near-accidents shows the danger the new bridge was meant to prevent.",
   [("The bridge is described as narrow.", "Narrowness describes the bridge, not the safety reason."),
    ("The bridge is only for pedestrians.", "This describes who uses it, not why it was needed."),
    ("The council made the decision.", "Who decided is not evidence about safety.")],
   "The near-accidents show the real danger that the new bridge was built to prevent.", "Look for evidence in the problem that matches the goal of the solution.")
mc("problem-solution", "RI.4.5", 5, "Read the paragraph. “Shoppers at the weekend market often could not find a specific stall because none of the aisles were labeled. Organizers hung numbered signs above each row and printed a small map at the entrance.” Why did organizers use TWO solutions instead of one?",
   "Signs help shoppers already inside, and a map helps them plan before they even enter.",
   [("One solution was too expensive to use alone.", "Cost is not mentioned."),
    ("The first solution did not work at all.", "Nothing suggests a failed first attempt."),
    ("Shoppers complained about both problems separately.", "Only one unlabeled-aisle problem is described.")],
   "Each solution helps at a different moment: planning ahead and finding a stall once inside.", "Sometimes two solutions work together to solve one problem from different angles.")
dd("problem-solution", "RI.4.5", 5, "Read the paragraph. “The apartment building's elevator broke down twice a month because it was overloaded during rush hour. The building manager posted a weight limit sign and asked residents to use the stairs for short trips.” The manager's solution mainly targets the ____ of the problem.",
   "cause",
   [("cost", "Repair cost is not discussed."),
    ("history", "No history of the elevator is given."),
    ("location", "Where the elevator is located is not the issue.")],
   "Reducing overload (the cause of breakdowns) directly targets why the elevator failed.", "The strongest solutions remove the actual cause, not just a symptom.")
mc("problem-solution", "RI.4.5", 5, "Read the paragraph. “Every rainy season, muddy water from the hillside washed across the only road into the village, sometimes stranding cars for hours. Villagers dug a drainage channel along the hillside to redirect the runoff into a nearby stream.” What would happen if the channel were removed?",
   "The road would likely flood with muddy runoff again during rainy season.",
   [("Cars would travel faster on the road.", "Speed is not related to the channel."),
    ("The stream would dry up.", "The stream receiving water is not the problem being solved."),
    ("The village would need a new road entirely.", "The paragraph never suggests building a new road.")],
   "The channel was built specifically to redirect runoff away from the road; removing it would bring the flooding back.", "Imagine undoing the solution to check that it truly addresses the cause.")
mc("problem-solution", "RI.4.5", 6, "Read the paragraph. “A small fishing village noticed its catch shrinking each year as larger boats from other towns fished the same waters daily. Local fishermen agreed among themselves to fish only every other day and to avoid certain breeding areas during spawning season.” Which word BEST describes the type of solution chosen?",
   "a voluntary agreement among the fishermen themselves",
   [("a law passed by the government", "No government law is mentioned."),
    ("a new type of fishing boat", "No new equipment is described."),
    ("a fine for overfishing", "No fine or punishment is mentioned.")],
   "The fishermen chose to limit themselves through an agreement, not through an outside law or fine.", "Notice whether a solution comes from a rule, a tool, or people's own choices.")
mc("problem-solution", "RI.4.5", 6, "Read the paragraph. “After several students complained that the cafeteria ran out of the healthy lunch option by noon, the school began preparing twice as many of that meal and moved the serving station closer to the entrance.” Which solution addresses SUPPLY, and which addresses ACCESS?",
   "Doubling the meal addresses supply; moving the station closer addresses access.",
   [("Moving the station addresses supply; doubling the meal addresses access.", "These are reversed; doubling the amount is about supply, not location."),
    ("Both solutions address only supply.", "Moving the station changes where students can reach the food, which is about access."),
    ("Both solutions address only access.", "Doubling the meal changes how much food exists, which is about supply, not location.")],
   "Supply means how much food exists; access means how easily students can reach it.", "Separate a solution's effect on quantity from its effect on availability or location.")
mc("problem-solution", "RI.4.5", 7, "Read the paragraph. “A coastal town's beach shrank noticeably each year as waves carried sand out to sea faster than it was replaced naturally. Engineers proposed two options: building a long wall of boulders to block the waves, or regularly trucking in new sand from a nearby quarry. The town chose the second option because the wall might change wave patterns and harm nearby reefs.” Why did the town reject the FIRST option, even though it would also fix the problem?",
   "It could create a new problem by disrupting wave patterns and damaging the reefs.",
   [("It would cost less than trucking in sand.", "Cost is not compared in the paragraph."),
    ("It would take longer to build than trucking in sand.", "Construction time is not compared."),
    ("It was the option residents preferred.", "Resident preference is not mentioned.")],
   "The paragraph explains the wall was rejected because of its possible harm to wave patterns and reefs, not cost or preference.", "A solution can solve one problem while risking a new one — weigh both effects.")
mc("problem-solution", "RI.4.5", 7, "Read the paragraph. “A clinic in a small town struggled to see every patient because only one doctor was available most days, and patients sometimes waited since early morning. The clinic began scheduling appointments by phone the day before, and added a part-time nurse to handle minor concerns, freeing the doctor for serious cases.” Which sentence BEST explains why TWO separate solutions were needed to fully solve the problem?",
   "Scheduling reduced crowding from walk-ins, while the nurse reduced the doctor's workload — together solving both the waiting and the overload.",
   [("Scheduling alone would have solved everything.", "Scheduling does not address the doctor's heavy workload for minor cases."),
    ("The nurse alone would have solved everything.", "A nurse alone does not fix the problem of unpredictable walk-in crowding."),
    ("Neither solution was actually necessary.", "The paragraph presents both as effective in combination.")],
   "The two causes — unpredictable crowding and an overloaded doctor — each needed a different fix.", "When a problem has more than one cause, look for a solution that addresses each cause.")

grade(5)
mc("problem-solution", "RI.5.5", 1, "Read the paragraph. “The rooftop garden's herbs kept dying because the black plastic pots absorbed too much heat in the afternoon sun. The gardener switched to light-colored ceramic pots, and the herbs stayed healthy all summer.” What problem does the paragraph describe?",
   "The herbs were dying from overheated pots.",
   [("The herbs were not getting enough water.", "Watering is not mentioned as the issue."),
    ("The ceramic pots were too expensive.", "Cost is not discussed."),
    ("The rooftop had no sunlight.", "Too much heat, not lack of sunlight, is the issue.")],
   "The paragraph states the plastic pots absorbed too much heat, harming the herbs.", "Identify exactly what is causing harm before looking for the fix.")
dd("problem-solution", "RI.5.5", 1, "Read the paragraph. “Visitors to the aquarium often missed feeding time because it was not announced anywhere. Staff began posting the schedule at the entrance and announcing it over the speakers ten minutes before.” Choose the solution: staff ____ the feeding schedule.",
   "announced",
   [("hid", "Hiding the schedule would make the problem worse."),
    ("cancelled", "Feeding time was not cancelled."),
    ("delayed", "Delaying is not mentioned as the fix.")],
   "Announcing and posting the schedule let visitors know when feeding time would happen.", "The solution should give people the missing information.")
mc("problem-solution", "RI.5.5", 2, "Read the paragraph. “A rural school's only computer lab had internet so slow that videos froze constantly during lessons. The district installed a stronger signal booster on the roof, and streaming became smooth within days.” What was the CAUSE of the problem?",
   "A weak internet signal reaching the school",
   [("Too many computers in the lab", "The number of computers is not blamed."),
    ("Old, broken computers", "The computers themselves are not described as broken."),
    ("A shortage of teachers", "Teacher shortage is not mentioned.")],
   "The weak signal is identified as the reason streaming kept freezing.", "The solution (a booster) targets exactly what was weak: the signal.")
mc("problem-solution", "RI.5.5", 2, "Read the paragraph. “Fruit vendors near the train station lost customers because their stalls blocked the sidewalk, forcing shoppers to walk in the street. The city moved the stalls to a designated row along one side, keeping the sidewalk clear.” What EFFECT did moving the stalls have?",
   "Shoppers could walk safely without stepping into the street.",
   [("Vendors sold less fruit than before.", "The paragraph does not say sales dropped."),
    ("The train station closed early.", "Station hours are not mentioned."),
    ("The street became wider.", "The street's width did not change.")],
   "Moving the stalls cleared the sidewalk, so shoppers no longer had to walk in the street.", "Match the solution's effect directly to the original danger or inconvenience.")
dd("problem-solution", "RI.5.5", 2, "Read the paragraph. “The community pool's filter clogged every week because swimmers tracked in sand from the nearby beach. The pool added a rinse station with a small shower at the entrance, and clogging dropped sharply.” Choose the word: the rinse station removed sand ____ swimmers entered the pool.",
   "before",
   [("after", "Rinsing after would not prevent sand from entering the pool."),
    ("without", "This does not fit the sentence's meaning."),
    ("despite", "This does not fit the sentence's meaning.")],
   "Rinsing before entry removed the sand before it could reach the filter.", "Timing matters: a solution often works by acting before the problem occurs.")
mc("problem-solution", "RI.5.5", 3, "Read the paragraph. “An orchard's apple trees produced fewer apples each year as the local bee population shrank, likely due to a nearby pesticide spray drifting onto wildflowers the bees depended on. The orchard owner planted a wide strip of pesticide-free wildflowers along the property's edge to draw bees back.” What is the ROOT CAUSE identified in the paragraph?",
   "Pesticide drift was destroying the bees' food source.",
   [("The apple trees were too old to produce fruit.", "Tree age is not blamed."),
    ("The orchard owner stopped watering the trees.", "Watering is not mentioned."),
    ("A disease was spreading among the apple trees.", "No disease is mentioned.")],
   "The paragraph traces the shrinking bee population to pesticide drift harming their food supply.", "Trace the chain: fewer apples, then fewer bees, then why bees declined.")
mc("problem-solution", "RI.5.5", 3, "Read the paragraph. “A warehouse's shipments were delayed each week because workers spent hours searching for misplaced boxes in a disorganized storage room. Managers introduced a labeling system with numbered shelves and a digital inventory list.” How does the labeling system solve the underlying problem?",
   "It lets workers find exactly where a box is instead of searching the whole room.",
   [("It makes boxes smaller so they fit on shelves.", "Box size is not mentioned."),
    ("It reduces the number of shipments sent out.", "Shipment quantity is not changed."),
    ("It hires more workers to search faster.", "No new workers are mentioned.")],
   "Numbered shelves and a digital list let workers locate a box directly, ending the lengthy searches.", "Ask whether the solution removes the need for the wasted effort, not just adds more effort.")
dd("problem-solution", "RI.5.5", 3, "Read the paragraph. “A riverside village lost several meters of farmland every flood season as fast-moving water ate away at the unprotected riverbank. Villagers planted rows of deep-rooted reeds along the bank, which held the soil firmly in place.” The reeds mainly act to ____ the soil.",
   "anchor",
   [("soften", "Softer soil would erode more easily, not less."),
    ("dry", "Drying the soil is not the goal."),
    ("cover", "Covering alone would not stop fast-moving water from eroding soil.")],
   "The reeds' deep roots hold, or anchor, the soil in place against the river's current.", "Think about the physical action a solution performs on the problem.")
mc("problem-solution", "RI.5.5", 4, "Read the paragraph. “A busy intersection near a new mall caused traffic jams every evening because the single traffic light cycle did not account for the sudden rise in cars. Engineers reprogrammed the light to extend the green signal during peak hours and added a dedicated left-turn lane.” Which sentence BEST summarizes the problem and solution together?",
   "Increased traffic overwhelmed an outdated light cycle, so engineers adjusted the timing and added a turn lane.",
   [("The mall was too far from the main road, so a new road was built.", "No new road is mentioned."),
    ("Drivers ignored the traffic light, so police were stationed there.", "No police action is mentioned."),
    ("The intersection had no traffic light at all, so one was installed.", "A light already existed; it just needed adjusting.")],
   "This option correctly links the stated cause (traffic growth outpacing the old timing) with the stated fix.", "A strong summary mentions both why the problem happened and exactly how it was fixed.")
mc("problem-solution", "RI.5.5", 4, "Read the paragraph. “A small fishing cooperative noticed its total catch dropping for three straight years, even though the number of boats going out stayed the same. Marine biologists found that certain fish species were being caught before they were old enough to reproduce. The cooperative agreed to use nets with larger holes, letting younger fish escape.” What is the problem-solution relationship shown here?",
   "Catching young fish before they could reproduce was reducing future fish stock, so larger net holes let young fish survive.",
   [("Too many boats were going out, so the cooperative reduced the fleet.", "The number of boats stayed the same."),
    ("The water had become too polluted, so fishing was paused.", "Pollution is not mentioned."),
    ("Fish were migrating elsewhere, so boats traveled farther.", "Migration is not mentioned.")],
   "The paragraph explains that catching young fish reduced future stock, and larger net holes addressed exactly that cause.", "Look for the specific cause named by the experts, not just the general problem.")
dd("problem-solution", "RI.5.5", 4, "Read the paragraph. “A seaside town's underground parking garage flooded during every heavy storm because its drainage pipes were too narrow for sudden downpours. The town installed wider pipes and added a backup pump as a second line of defense.” The backup pump exists mainly as a ____ in case the pipes still cannot keep up.",
   "safeguard",
   [("decoration", "A pump serves a functional purpose, not decoration."),
    ("shortcut", "A pump is not described as speeding anything up."),
    ("replacement", "The pump works alongside the pipes, not instead of them.")],
   "The pump is a backup safeguard in case the wider pipes are still overwhelmed.", "A second solution added 'just in case' usually serves as a safeguard, not a full replacement.")
mc("problem-solution", "RI.5.5", 5, "Read the paragraph. “A manufacturing plant's workers reported frequent headaches, and an inspection found carbon monoxide levels slightly above safe limits near one machine. Rather than simply installing air filters, engineers traced the issue to a cracked exhaust pipe on that machine and replaced it.” Why did engineers choose to replace the pipe instead of just adding filters?",
   "Filters would only reduce the gas already leaking, while replacing the pipe stopped the leak at its source.",
   [("Filters were too expensive to install.", "Cost is not mentioned."),
    ("The machine itself needed to be replaced entirely.", "Only the pipe, not the whole machine, needed replacement."),
    ("Workers refused to wear filter masks.", "Masks are not mentioned.")],
   "Fixing the cracked pipe addressed the actual source of the gas, rather than managing its symptoms.", "A solution that targets the source is usually stronger than one that only manages the symptom.")
mc("problem-solution", "RI.5.5", 5, "Read the paragraph. “An animal shelter became overcrowded within a year of opening because it accepted every stray brought in, with no limit on intake. The shelter partnered with three nearby clinics to offer free spay-and-neuter days, hoping to reduce the number of strays born each year.” Which detail shows this solution targets a LONG-TERM cause rather than the immediate overcrowding?",
   "The partnership aims to reduce future strays being born, not to immediately empty the shelter.",
   [("The shelter stopped accepting new animals.", "The shelter is not described as refusing intake."),
    ("The shelter built a bigger building.", "No construction is mentioned."),
    ("The clinics charged a small fee for the service.", "The service is described as free, and fees are not the focus anyway.")],
   "Reducing future births addresses the underlying cause of overcrowding over time, rather than solving today's crowding directly.", "Some solutions fix a problem's root cause over time instead of the immediate symptom.")
dd("problem-solution", "RI.5.5", 5, "Read the paragraph. “A software company's servers kept overheating during summer months because the server room's air conditioning unit was never upgraded as more servers were added over the years. The company installed a second, larger cooling unit and added vents to improve airflow.” The overheating problem grew worse over time mainly because the cooling system failed to ____ with the growing number of servers.",
   "scale",
   [("compete", "Competition between systems is not the issue."),
    ("communicate", "Communication between machines is not the issue."),
    ("decorate", "Appearance is irrelevant to cooling capacity.")],
   "The cooling system did not grow, or scale, to match the increasing number of servers.", "Look for a mismatch between a fixed resource and a growing demand.")
mc("problem-solution", "RI.5.5", 5, "Read the paragraph. “A well that supplied drinking water to several farms tested positive for a mild contaminant believed to come from fertilizer runoff on nearby fields. Rather than closing the well immediately, officials installed a filtration system at the wellhead while working with farmers to create a buffer zone of unfertilized land.” Why did officials use TWO different solutions?",
   "The filter solves the immediate water-safety problem, while the buffer zone prevents future contamination.",
   [("One solution failed completely before the other was tried.", "Nothing indicates the filter failed."),
    ("Farmers refused to cooperate with just one plan.", "No refusal is mentioned."),
    ("The well needed to be relocated entirely.", "Relocating the well is never discussed.")],
   "Together, the two solutions address both the current contamination and its future cause.", "Immediate fixes and long-term prevention often work together to fully solve a problem.")
mc("problem-solution", "RI.5.5", 6, "Read the paragraph. “Residents near a regional airport filed repeated noise complaints after a new, more frequent flight schedule began. Rather than reducing flights, which airline officials said would hurt the local economy, the airport adjusted flight paths to avoid flying directly over the densest neighborhoods during early morning and late night hours.” Which word BEST describes the airport's approach to balancing two competing needs?",
   "compromise",
   [("refusal", "The airport did take action, so it did not simply refuse to respond."),
    ("apology", "An apology alone would not change the flight paths."),
    ("relocation", "The airport itself was not moved.")],
   "Adjusting flight paths let the airport reduce noise for residents without cutting flights the economy relied on.", "When a solution partly satisfies two different groups' needs, it is usually a compromise.")
mc("problem-solution", "RI.5.5", 6, "Read the paragraph. “A coastal fishing fleet noticed its squid catch dropping sharply, and researchers linked the decline to warmer-than-usual water temperatures pushing squid populations farther offshore. Rather than fighting the warming water directly, which was beyond their control, fishermen began tracking satellite temperature maps to locate where squid had migrated.” Why was this solution chosen over trying to fix the water temperature?",
   "The cause (ocean warming) was outside the fishermen's control, so they adapted to it instead.",
   [("Fixing the temperature would have been cheaper.", "Cost comparison is not mentioned."),
    ("Researchers were unable to find the cause.", "The cause is clearly identified."),
    ("The fleet preferred using new technology regardless of cost.", "Preference for technology alone is not the stated reason.")],
   "Since the fishermen could not control ocean temperature, they adapted their methods to the new conditions instead.", "Some solutions work around a cause that cannot be controlled, rather than removing it.")
mc("problem-solution", "RI.5.5", 7, "Read the paragraph. “A lake once famous for clear water began turning murky green each summer as an invasive algae species spread rapidly, fed partly by fertilizer runoff and partly by warmer summer temperatures that let the algae grow faster. Officials introduced fertilizer-use limits for nearby farms, but acknowledged this alone would not fully solve the problem.” Why does the paragraph suggest the fertilizer limit is only a PARTIAL solution?",
   "Warmer temperatures, a second cause of the algae growth, are not addressed by limiting fertilizer.",
   [("The farmers refused to follow the new limit.", "No refusal is mentioned."),
    ("The lake had too little water to dilute the algae.", "Water volume is not discussed."),
    ("The algae had already spread to other lakes.", "Spreading to other lakes is not mentioned.")],
   "Since the algae has two causes, fixing only one (fertilizer runoff) leaves the other (warm temperatures) unaddressed.", "When a problem has multiple causes, a solution addressing only one cause is only a partial fix.")
mc("problem-solution", "RI.5.5", 7, "Read the paragraph. “A city's downtown delivery trucks caused constant congestion because drivers had no reliable way to know which loading zones were free, often circling blocks while searching for space. The city installed sensors in each loading zone connected to an app that showed real-time availability, and congestion dropped noticeably within a month, though a few drivers still circled out of habit.” What does the detail about drivers 'still circling out of habit' reveal about the solution?",
   "Even a strong technical solution may take time to fully change people's established behavior.",
   [("The sensors did not actually work.", "Congestion dropped, showing the sensors worked."),
    ("The app was too difficult for drivers to use.", "Difficulty using the app is not mentioned."),
    ("The city planned to remove the sensors soon.", "Removal plans are not mentioned.")],
   "The lingering habit shows that fixing the information gap does not instantly change old behaviors.", "A solution can remove a problem's cause while people's habits take longer to catch up.")

# ================================================================== author-perspective
grade(4)
mc("author-perspective", "RI.4.8", 1, "Read the sentence. “The new playground is finally finished, and it is wonderful to see children laughing on the bright blue slide again.” How does the author feel about the new playground?",
   "The author is happy about it.",
   [("The author is upset about it.", "Words like “wonderful” and “laughing” show happiness, not anger."),
    ("The author is confused by it.", "There is no confusion in the sentence."),
    ("The author does not care about it.", "Describing it as “wonderful” shows care.")],
   "Words like “wonderful” and “laughing” show the author's positive feeling.", "Look for feeling words to find an author's view.")
mc("author-perspective", "RI.4.8", 2, "Read the sentence. “Sadly, the old oak tree by the school gate had to be cut down after the storm damaged its roots.” What word shows the author's feeling about the tree being cut down?",
   "Sadly",
   [("Old", "This describes the tree's age."),
    ("Storm", "This names what caused damage."),
    ("Roots", "This names a part of the tree.")],
   "“Sadly” directly states the author's feeling about the event.", "Feeling words often appear at the very start of a sentence.")
mc("author-perspective", "RI.4.8", 2, "Read the paragraph. “Every classroom should have a recycling bin. Paper waste piles up fast, and a simple bin would keep useful material out of the trash.” What is the author's PURPOSE in this paragraph?",
   "To persuade schools to add recycling bins",
   [("To describe how paper is made", "Paper-making is not explained."),
    ("To entertain with a story about trash", "There is no story."),
    ("To compare two kinds of bins", "Only one kind of bin is discussed.")],
   "The author argues that schools “should” add bins, which is persuasive writing.", "Words like “should” often signal an author trying to persuade.")
mc("author-perspective", "RI.4.8", 3, "Read the paragraph. “The bakery down the street raised its prices again this month. Families who used to stop by every week now walk right past the window.” What is the author's attitude toward the price increase?",
   "The author views it as a problem driving customers away.",
   [("The author thinks the bakery deserves more customers.", "The paragraph shows customers leaving, not increasing."),
    ("The author is excited about the new prices.", "Nothing suggests excitement."),
    ("The author has no opinion about the prices.", "The detail about families walking past shows a clear concern.")],
   "Describing families walking past instead of stopping shows the author sees the price increase as harmful.", "Authors often reveal their view through the details and effects they choose to describe.")
tf("author-perspective", "RI.4.8", 3, "An author's choice of words, like calling something “wonderful” instead of just “new,” can reveal the author's perspective.", True,
   "Descriptive words beyond plain facts often show how an author feels.", "Compare a neutral word to an emotional one to spot perspective.")
mc("author-perspective", "RI.4.8", 4, "Read the paragraph. “The city finally repaired the cracked sidewalk on Palm Street, three years after residents first reported it. While the repair is welcome, many wonder why such a simple fix took so long.” How would you describe the author's perspective?",
   "Mixed — glad the sidewalk is fixed but critical of the long delay",
   [("Entirely positive about the city's quick action", "The three-year delay is criticized, so the view is not entirely positive."),
    ("Entirely negative about the repair itself", "The repair itself is called “welcome,” so the view is not entirely negative."),
    ("Completely neutral with no opinion at all", "The questioning tone shows the author does have an opinion.")],
   "The paragraph praises the fix but questions the long delay, showing a mixed view.", "An author's perspective can include both approval and criticism in the same paragraph.")
mc("author-perspective", "RI.4.8", 4, "Read the paragraph. “Some say the new museum downtown is too expensive to visit often. Still, anyone who has seen the dinosaur hall knows it is worth every coin.” Which phrase BEST reveals the author's own perspective?",
   "“worth every coin”",
   [("“too expensive to visit often”", "This states what “some say,” not the author's own view."),
    ("“the new museum downtown”", "This simply names the museum."),
    ("“anyone who has seen”", "This introduces the author's claim rather than stating it.")],
   "By calling it “worth every coin,” the author pushes back against the cost complaint and shares a personal view.", "Watch for a turn like “still” that signals the author's true opinion.")
mc("author-perspective", "RI.4.8", 5, "Read the paragraph. “Supporters of the new highway argue it will cut travel time in half. Opponents point out it will pass within a hundred meters of the elementary school, filling the playground with exhaust fumes during recess.” How does the author present this issue?",
   "By showing both sides of the argument instead of taking one side",
   [("By only showing the highway's benefits", "The paragraph also raises a concern about the school."),
    ("By only showing the highway's dangers", "The paragraph also mentions the benefit of cutting travel time."),
    ("By refusing to mention any opinions at all", "Both supporters' and opponents' opinions are included.")],
   "The paragraph gives a benefit from supporters and a concern from opponents, showing balance.", "A balanced author presents more than one perspective on an issue.")
mc("author-perspective", "RI.4.8", 5, "Read the paragraph. “The factory's new filters have reduced smoke above the town by half, a real improvement worth celebrating. Even so, residents living closest to the factory still report trouble breathing some mornings.” Which detail SHIFTS the paragraph from praise toward concern?",
   "The mention of residents still having trouble breathing",
   [("The fact that filters were installed", "Installing filters supports the praise, not the shift."),
    ("The claim that smoke was reduced by half", "This is also part of the praise."),
    ("The phrase “worth celebrating”", "This phrase is part of the praise, not the shift away from it.")],
   "After praising the improvement, the author adds the breathing complaints to show the problem is not fully solved.", "Look for the sentence that turns a positive statement into a more complicated one.")
mc("author-perspective", "RI.4.8", 6, "Read the paragraph. “Proponents of the four-day school week insist students return refreshed and more focused. Critics counter that a longer school day leaves younger children exhausted by the final class, undercutting any gain in focus.” What rhetorical technique does the author use to present this debate?",
   "Presenting a claim and then a counterclaim that directly challenges it",
   [("Using only statistics to prove one side right", "No statistics are given in the paragraph."),
    ("Telling a personal story about one student", "No personal story is included."),
    ("Repeating the same claim using different words", "The second sentence introduces a new, opposing idea, not a repeat.")],
   "The paragraph states a benefit, then immediately presents an opposing concern that challenges it directly.", "A claim followed by a direct counterclaim is a common way authors frame debates.")
mc("author-perspective", "RI.4.8", 7, "Read the paragraph. “Few would deny that the new toll road eases congestion on the old highway. What goes unmentioned in most official reports, however, is that the toll itself falls hardest on commuters who can least afford the extra cost each week.” What does the phrase “goes unmentioned in most official reports” suggest about the author's perspective?",
   "The author is critical that an important downside is being left out of the official discussion.",
   [("The author fully supports the official reports' conclusions.", "The phrase signals disagreement, not support."),
    ("The author believes the toll road has no real downsides.", "The author points directly to a downside: the cost burden on commuters."),
    ("The author is simply restating what the official reports already say.", "The author adds a point the reports do not include, rather than repeating them.")],
   "Pointing out what reports leave out shows the author believes an important perspective, the cost burden on commuters, is being overlooked.", "Noticing what a text leaves out can reveal an author's critical perspective.")

grade(5)
mc("author-perspective", "RI.5.6", 1, "Read the sentence. “Thankfully, the leaky roof over the gym was finally patched before the rainy season began.” How does the author feel about the roof being patched?",
   "Relieved",
   [("Annoyed", "“Thankfully” shows relief, not annoyance."),
    ("Indifferent", "A feeling word like “thankfully” shows the author does care."),
    ("Embarrassed", "Nothing suggests embarrassment.")],
   "“Thankfully” shows the author's relief that the repair happened in time.", "A single feeling word at the start of a sentence often reveals the author's attitude.")
mc("author-perspective", "RI.5.6", 2, "Read the paragraph. “Plastic bags clog storm drains and end up tangled in riverbank plants for years. Banning them from stores is a small step that could make a real difference.” What is the author's position on banning plastic bags?",
   "The author supports the ban.",
   [("The author opposes the ban.", "The paragraph argues banning bags “could make a real difference,” showing support."),
    ("The author is undecided about the ban.", "Calling it “a small step that could make a real difference” shows a clear position."),
    ("The author only discusses storm drains, not bags.", "Storm drains are mentioned as evidence for the author's position on bags.")],
   "Calling the ban “a real difference” shows the author favors it.", "Look for words that show approval or disapproval of a specific action.")
mc("author-perspective", "RI.5.6", 2, "Read the paragraph. “The town's only bookstore closed last week after thirty years, and the empty storefront already feels like a missing tooth on Main Street.” Which phrase BEST reveals the author's feeling about the closing?",
   "“a missing tooth on Main Street”",
   [("“closed last week”", "This states a fact without revealing feeling."),
    ("“after thirty years”", "This gives a fact about the bookstore's history."),
    ("“the empty storefront”", "This describes the scene without the feeling comparison.")],
   "Comparing the empty storefront to a missing tooth shows the author's sense of loss.", "Comparisons can carry an author's emotional view.")
mc("author-perspective", "RI.5.6", 3, "Read the paragraph. “Supporters of later school start times cite research showing teenagers need more sleep. Still, some parents worry a later schedule would clash with work hours and after-school sports.” How would you describe the author's approach here?",
   "Presenting both the research in favor and the concerns against the change",
   [("Arguing only that schools should start later", "The paragraph also raises parents' concerns."),
    ("Arguing only that schools should keep the current schedule", "The paragraph also presents research favoring a change."),
    ("Avoiding the topic of school start times entirely", "The entire paragraph focuses on this exact topic.")],
   "The paragraph includes a reason for later starts and a concern against them, showing a balanced approach.", "A balanced paragraph usually includes both support and concerns on an issue.")
mc("author-perspective", "RI.5.6", 3, "Read the paragraph. “Drone deliveries promise packages within the hour, a convenience many customers welcome. Yet residents near the new delivery hub describe a constant buzzing overhead that makes afternoons on the porch far less peaceful.” Which sentence reveals a perspective DIFFERENT from the customers mentioned?",
   "The sentence about residents hearing constant buzzing overhead",
   [("The sentence about packages arriving within the hour", "This reflects the customers' welcomed convenience."),
    ("The sentence naming drone deliveries directly", "This simply introduces the topic."),
    ("The sentence calling fast delivery a convenience", "This also reflects the customers' positive view.")],
   "The buzzing complaint shows a different, more negative perspective held by nearby residents.", "A paragraph can shift between perspectives of different groups affected by the same thing.")
mc("author-perspective", "RI.5.6", 4, "Read the paragraph. “The city's new electric buses are, by most measures, a success: quieter streets and cleaner air near every stop. The one persistent complaint is that charging delays have caused several routes to run late during the coldest winter mornings.” What is the author's OVERALL perspective?",
   "Largely positive, with one specific concern noted",
   [("Entirely negative about the buses", "The paragraph calls the buses “a success” overall."),
    ("Entirely positive with no concerns at all", "The charging delay complaint is clearly mentioned."),
    ("Completely neutral, stating only facts", "Calling it “a success” expresses a clear positive judgment.")],
   "The author calls the buses a success overall but still notes one real problem, showing a mostly positive but not uncritical view.", "An author's overall perspective can lean one way while still including a fair concern.")
mc("author-perspective", "RI.5.6", 4, "Read the paragraph. “Standardized tests, their defenders argue, offer a fair way to compare students across different schools. Critics respond that a single test score ignores everything from a student's home situation to their native language.” Which word signals that the author is introducing an OPPOSING view?",
   "“Critics”",
   [("“defenders”", "This word introduces the first view, not the opposing one."),
    ("“standardized”", "This simply names the type of test."),
    ("“fair”", "This word is part of the first view's claim, not the signal of a shift.")],
   "“Critics” signals that a different, opposing group's perspective is about to be presented.", "Words like supporters/critics or proponents/opponents often mark a shift in perspective.")
mc("author-perspective", "RI.5.6", 5, "Read the paragraph. “Public art installations downtown have drawn praise from visitors who photograph the murals for social media. Longtime residents, however, note that the funding for these murals came from a budget once used for sidewalk repairs in their neighborhood.” What does the author achieve by including the residents' point?",
   "It shows a cost of the project that the visitors' praise alone would not reveal.",
   [("It proves the murals should be removed immediately.", "The paragraph does not call for removal."),
    ("It shows that visitors and residents actually agree completely.", "Their views contrast rather than agree."),
    ("It explains how the murals were painted.", "The painting process is not discussed.")],
   "Including the residents' concern about lost sidewalk funding reveals a cost that the visitors' enthusiasm overlooks.", "An author broadens perspective by including a viewpoint the first group might not see.")
mc("author-perspective", "RI.5.6", 5, "Read the paragraph. “Few argue that youth sports build teamwork and discipline. Less discussed is how specializing in a single sport before age ten correlates with higher injury rates among young athletes, according to several pediatric studies.” What does the phrase “less discussed” suggest about the author's perspective?",
   "The author believes an important risk is being overlooked in the usual conversation about youth sports.",
   [("The author believes youth sports have no benefits at all.", "The paragraph opens by agreeing sports build teamwork and discipline."),
    ("The author believes pediatric studies are unreliable.", "The studies are cited as support, not doubted."),
    ("The author believes specialization should start even earlier.", "The paragraph raises a concern about early specialization, not a push for more of it.")],
   "“Less discussed” signals the author thinks an important downside is not getting enough attention.", "Phrases like “less discussed” or “often overlooked” reveal an author's critical perspective.")
mc("author-perspective", "RI.5.6", 6, "Read the paragraph. “Advocates of water conservation rebates point to a measurable drop in household usage wherever the program has run. Opponents counter that the rebates mostly benefit homeowners who can already afford efficient appliances, leaving renters with the highest bills and no rebate to claim.” Which rhetorical move does the author use?",
   "Presenting a measurable benefit, then a fairness concern that complicates it",
   [("Presenting only statistics with no counterargument", "A clear counterargument about fairness follows the statistic."),
    ("Telling a single homeowner's personal story", "No individual story is included."),
    ("Dismissing the rebate program entirely without evidence", "The program's measurable benefit is acknowledged, not dismissed.")],
   "The author first grants the program's measurable success, then raises a fairness concern that complicates a simple positive view.", "Authors often complicate a stated benefit by raising who is left out of it.")
mc("author-perspective", "RI.5.6", 7, "Read the paragraph. “Few dispute that homework-free weekends give students time to rest. What rarely appears in these discussions is that students whose families can afford tutors or enrichment programs often use that same free time to get ahead, widening a gap the policy was never meant to create.” What does the author's framing suggest about their perspective on the policy?",
   "The author supports the policy's goal but is concerned about an unintended consequence it may cause.",
   [("The author believes homework-free weekends are a complete failure.", "The author grants that rest time is a real, if partial, benefit."),
    ("The author believes all students benefit from the policy equally.", "The author specifically points out that some students benefit more than others."),
    ("The author believes tutoring programs should be banned.", "Banning tutoring programs is never suggested.")],
   "The author acknowledges the intended benefit of rest while pointing to an unequal effect the policy was not designed to cause.", "Authors can support a policy's intent while still raising a concern about its real-world effect.")

grade(6)
mc("author-perspective", "RI.6.6", 1, "Read the sentence. “Finally, after years of delay, the new wind farm began supplying power to the coastal towns this spring.” How does the author seem to feel about the wind farm's completion?",
   "Pleased that the long wait is over",
   [("Doubtful that it will work", "Nothing in the sentence expresses doubt."),
    ("Angry about the delay", "The focus is on the completion, not lingering anger."),
    ("Unconcerned either way", "“Finally” shows the author does care about the outcome.")],
   "“Finally” expresses satisfaction that a long-awaited project is complete.", "A single word like “finally” can reveal relief or satisfaction.")
mc("author-perspective", "RI.6.6", 2, "Read the paragraph. “Gig work offers flexibility that a traditional nine-to-five job cannot match. That flexibility, though, often comes without health insurance or a guaranteed minimum income.” What is the author's perspective on gig work?",
   "It has real benefits but also real drawbacks worth noting.",
   [("It is entirely beneficial with no downsides.", "The lack of health insurance and guaranteed income are clear downsides."),
    ("It should be banned immediately.", "No call to ban gig work appears in the paragraph."),
    ("It is identical to a traditional job in every way.", "The paragraph explicitly contrasts it with a traditional job.")],
   "The author names a genuine advantage (flexibility) alongside a genuine disadvantage (lost benefits).", "A balanced perspective often lists a benefit immediately followed by a cost.")
mc("author-perspective", "RI.6.6", 2, "Read the paragraph. “The rewilding project reintroduced wolves to the valley eight years ago, and elk populations have since spread more evenly across the landscape instead of overgrazing a few favored spots.” Which word would BEST describe the author's tone toward the project's results?",
   "approving",
   [("alarmed", "Nothing in the description suggests danger or alarm."),
    ("mocking", "The description is straightforward, not mocking."),
    ("confused", "The explanation is clear, not confused.")],
   "Describing the balanced grazing as a positive outcome of the reintroduction shows an approving tone.", "Look at whether the described outcome is framed as good or bad.")
mc("author-perspective", "RI.6.6", 3, "Read the paragraph. “Some school districts now use AI tools to grade student essays, citing faster turnaround for teachers buried in paperwork. Teachers who have tried the tools report that the software often rewards long, formulaic sentences over genuinely original ideas.” How does the author balance this issue?",
   "By presenting the efficiency argument alongside a concern about what the AI actually rewards",
   [("By arguing that AI grading should replace teachers completely", "Replacing teachers is never suggested."),
    ("By claiming AI grading has no advantages at all", "Faster turnaround is clearly presented as an advantage."),
    ("By ignoring teachers' direct experience with the tools", "Teachers' experience is the main source of the concern raised.")],
   "The paragraph grants a real efficiency benefit while raising a real concern teachers have observed firsthand.", "Balanced writing often follows a stated benefit with a firsthand concern.")
mc("author-perspective", "RI.6.6", 4, "Read the paragraph. “Few dispute that social media age limits aim to protect younger users from harmful content. What gets less attention is how easily such limits are bypassed with a fake birth date, raising the question of whether the policy protects anyone at all.” What does the phrase “gets less attention” reveal about the author's stance?",
   "The author believes a major flaw in the policy is being overlooked by most discussions.",
   [("The author believes the policy works perfectly as written.", "The author directly questions the policy's effectiveness."),
    ("The author believes younger users need no protection at all.", "The intended goal of protection is acknowledged, not dismissed."),
    ("The author believes fake birth dates are rare and unimportant.", "The ease of bypassing the limit is presented as a serious concern, not a minor one.")],
   "By noting what “gets less attention,” the author signals a critical view that the policy's weakness is underexamined.", "Phrases pointing out what is overlooked often reveal an author's underlying criticism.")
mc("author-perspective", "RI.6.6", 4, "Read the paragraph. “Genetically modified crops can resist pests without heavy pesticide use, a clear win for both farmers and nearby ecosystems. Critics note, however, that a handful of large companies control most of the patented seeds, leaving small farmers with little choice but to pay rising licensing fees.” What perspective does the author add by including the critics' point?",
   "A concern about economic control that complicates the environmental benefit",
   [("A second environmental benefit of the crops", "The added point is about economics, not the environment."),
    ("Proof that the crops do not actually resist pests", "Pest resistance is accepted as true throughout."),
    ("A suggestion that pesticide use should increase again", "Returning to heavy pesticide use is never suggested.")],
   "The critics' point shifts the discussion from an environmental win to an economic concern about control and cost.", "An added perspective can complicate an otherwise simple positive claim.")
mc("author-perspective", "RI.6.6", 5, "Read the paragraph. “A pilot program paying residents a guaranteed monthly income reported that most recipients used the funds for rent, food and job training, not leisure spending as some had predicted. Skeptics still argue that a small trial cannot prove the approach would work if applied to an entire country's budget.” How does the author frame the skeptics' argument?",
   "As a reasonable limitation on how far the pilot's results can be generalized",
   [("As proof that the entire pilot program was a failure", "The pilot's actual results are described as disproving a prediction, not failing."),
    ("As an attack on the recipients' honesty", "The skeptics question scale, not the recipients' behavior."),
    ("As evidence that monthly payments caused more spending on leisure", "The paragraph states the opposite: spending went to necessities.")],
   "The author presents the skeptics' point as a fair caution about generalizing a small trial, not as an attack on the program itself.", "Notice whether an author treats an opposing view as reasonable or as simply wrong.")
mc("author-perspective", "RI.6.6", 6, "Read the paragraph. “City planners praise green roofs for lowering indoor temperatures and absorbing stormwater that would otherwise flood streets. Building owners, who must cover the higher upfront installation cost, are far less enthusiastic, especially when the savings on energy bills take years to offset that cost.” What rhetorical structure does the author use to present this issue?",
   "Contrasting the planners' long-term civic benefits with the owners' short-term financial burden",
   [("Siding entirely with building owners against the planners", "Both perspectives are presented without the author clearly favoring one."),
    ("Ignoring the cost concerns raised by building owners", "The cost concern is given as much weight as the civic benefit."),
    ("Presenting only one group's perspective throughout", "Two distinct groups' perspectives are both presented.")],
   "The paragraph sets the planners' civic view against the owners' financial view without endorsing either side outright.", "Look for two different groups and what each one weighs most heavily.")
mc("author-perspective", "RI.6.6", 7, "Read the paragraph. “Proponents of commercial space tourism point to the technological advances that trickle down from private rocket development. Rarely mentioned alongside this praise is the sheer carbon output of a single rocket launch, which can exceed the yearly emissions of thousands of cars, a cost quietly absorbed while the benefits are loudly announced.” What does the phrase “quietly absorbed while the benefits are loudly announced” reveal about the author's perspective?",
   "The author believes the industry's environmental cost is being downplayed relative to how its benefits are promoted.",
   [("The author believes space tourism has produced no technological benefits.", "The technological advances are acknowledged as real."),
    ("The author believes carbon emissions from rockets are exaggerated by critics.", "The author presents the emissions figure as a fact, not an exaggeration to dismiss."),
    ("The author believes the industry should be praised more often.", "The phrasing criticizes the imbalance in attention, not a lack of praise.")],
   "The contrast between “quietly absorbed” and “loudly announced” shows the author's critical view that costs are being underplayed.", "Contrasting verbs like “quietly” and “loudly” can reveal an author's judgment about fairness in a debate.")
mc("author-perspective", "RI.6.6", 7, "Read the paragraph. “Hospital administrators defend rotating night shifts as necessary for round-the-clock patient care, a need few would question. Occupational health researchers, studying the same nurses for over a decade, have quietly built a case that chronic shift rotation carries long-term health costs rarely weighed against the convenience it offers administrators.” What does the word “quietly” suggest about how the author views the researchers' findings compared to the administrators' position?",
   "The researchers' well-supported findings have received far less attention than the administrators' more visible justification.",
   [("The researchers' findings are less reliable than the administrators' claims.", "A decade-long study is presented as solid evidence, not unreliable."),
    ("The administrators have no real justification for the current system.", "Round-the-clock care is called a need “few would question.”"),
    ("The word “quietly” suggests the researchers kept their study secret on purpose.", "“Quietly” describes a lack of attention, not intentional secrecy.")],
   "“Quietly” suggests the long-term research has been overshadowed by the administrators' more prominent justification, revealing the author's concern about this imbalance.", "Words suggesting something was done “quietly” often signal the author thinks it deserves more attention.")

# ================================================================== fragments-run-ons
grade(4)
tf("fragments-run-ons", "L.4.1", 1, "“Jumped over the fence” is a complete sentence.", False,
   "There is no subject telling who jumped, so it is a fragment.", "Every sentence needs a subject and a verb.")
mc("fragments-run-ons", "L.4.1", 2, "Which group of words is a fragment?",
   "Underneath the old wooden bridge.",
   [("The fish swam underneath the bridge.", "This has a subject and a verb."),
    ("We crossed the bridge quickly.", "This is complete."),
    ("The water looked calm today.", "This is complete.")],
   "There is no subject or verb telling what happened underneath the bridge.", "Ask: who or what did something, and what did they do?")
mc("fragments-run-ons", "L.4.1", 2, "Which sentence is a run-on?",
   "The bell rang the students grabbed their bags.",
   [("The bell rang, so the students grabbed their bags.", "A comma and “so” correctly join the two ideas."),
    ("The bell rang. The students grabbed their bags.", "Two separate sentences are correctly punctuated."),
    ("When the bell rang, the students grabbed their bags.", "This is one correctly joined sentence.")],
   "Two complete ideas are joined with no punctuation or connecting word.", "A run-on jams two sentences together without a period, comma, or conjunction.")
mc("fragments-run-ons", "L.4.1", 3, "Which is the best way to fix this run-on? “Nour finished her chores she went to the park.”",
   "Nour finished her chores, and she went to the park.",
   [("Nour finished her chores she, went to the park.", "The comma is in the wrong place."),
    ("Nour finished her chores, she went to the park.", "A comma alone cannot join two sentences."),
    ("Nour finished her chores and, she went to the park.", "The comma belongs before “and,” not after.")],
   "A comma plus the conjunction “and” correctly joins the two complete ideas.", "Fix run-ons with a period, or a comma plus a conjunction like and, but, or so.")
err("fragments-run-ons", "L.4.1", 3, ["The rain started suddenly", " everyone ran", " inside the tent", " for shelter."], 1, ", so everyone ran",
    "Two complete ideas are joined with no punctuation, creating a run-on; adding a comma and “so” fixes it.", "Look for two complete ideas joined with no connecting word.")
mc("fragments-run-ons", "L.4.1", 4, "Which sentence contains a sentence fragment?",
   "Samir waved to his friends. Standing by the old gate.",
   [("Samir waved to his friends standing by the old gate.", "This is one complete sentence."),
    ("Samir, who was standing by the old gate, waved to his friends.", "This is one complete sentence with a clause."),
    ("Samir waved to his friends; they waved back.", "A semicolon correctly joins two complete sentences.")],
   "“Standing by the old gate” has no subject performing an action; it is a fragment on its own.", "Check that every group of words set off as a sentence has its own subject and verb.")
tf("fragments-run-ons", "L.4.1", 4, "“Before the sun rose over the dunes and painted the sand gold” is a complete sentence.", False,
   "This is a dependent clause with no main clause attached; it cannot stand alone.", "Clauses starting with words like “before” need a main clause to complete the thought.")
mc("fragments-run-ons", "L.4.1", 5, "Which revision fixes BOTH the fragment and the run-on? “Because the ferry was delayed. We waited at the dock we watched the waves.”",
   "Because the ferry was delayed, we waited at the dock, and we watched the waves.",
   [("Because the ferry was delayed we waited at the dock. We watched the waves.", "The fragment is fixed, but a comma is still missing after “delayed.”"),
    ("Because the ferry was delayed, we waited at the dock we watched the waves.", "The run-on between “dock” and “we watched” is not fixed."),
    ("Because the ferry was delayed. We waited at the dock, and we watched the waves.", "The first fragment is never joined to a main clause.")],
   "Joining the dependent clause to the main clause and adding “and” between the two complete ideas fixes both problems.", "Fix one error at a time, then check the whole sentence again.")
err("fragments-run-ons", "L.4.1", 5, ["The museum closes early on Fridays", " visitors", " should plan", " to arrive before two o’clock."], 1, ", so visitors",
    "Two complete ideas are run together with no punctuation; adding a comma and “so” fixes the run-on.", "A comma alone between two complete sentences is not enough; add a conjunction too.")
mc("fragments-run-ons", "L.4.1", 6, "Which paragraph contains NO fragments or run-ons?",
   "The storm knocked out power across the village. Families lit candles and waited for the lines to be repaired. By morning, the lights flickered back on.",
   [("The storm knocked out power across the village families lit candles. Waited for the lines to be repaired.", "This has both a run-on and a fragment."),
    ("The storm knocked out power. Across the village. Families lit candles and waited.", "“Across the village” is a fragment on its own."),
    ("The storm knocked out power across the village, families lit candles and waited for the lines to be repaired.", "A comma alone cannot join these two complete ideas; this is a comma splice.")],
   "Each sentence has its own subject and verb and is correctly separated with end punctuation.", "Check each sentence alone: does it have a subject, a verb, and a complete thought?")
mc("fragments-run-ons", "L.4.1", 7, "Which sentence correctly uses a semicolon to join two related, complete ideas without creating a comma splice?",
   "The tide was rising fast; the fishermen hurried to pull in their nets.",
   [("The tide was rising fast, the fishermen hurried to pull in their nets.", "A comma alone between two complete sentences creates a comma splice."),
    ("The tide was rising fast; and the fishermen hurried to pull in their nets.", "A semicolon should not be followed by “and”; use either the semicolon or a comma plus “and,” not both."),
    ("The tide was rising fast the fishermen hurried to pull in their nets.", "With no punctuation at all, this is a run-on.")],
   "A semicolon alone can correctly join two closely related complete sentences.", "Use a semicolon between two complete sentences without a conjunction after it.")

grade(5)
tf("fragments-run-ons", "L.5.1", 1, "“Although the trail looked easy at first” is a complete sentence.", False,
   "This is a dependent clause starting with “although” and has no main clause to finish the thought.", "Words like although, because, and when start clauses that need a main clause.")
mc("fragments-run-ons", "L.5.1", 2, "Which group of words is a fragment?",
   "The old lighthouse keeper, tired after decades of storms.",
   [("The old lighthouse keeper retired after decades of storms.", "This has a subject and a verb."),
    ("After decades of storms, he retired.", "This is complete."),
    ("He watched the waves from his window.", "This is complete.")],
   "There is a subject but no verb telling what the lighthouse keeper did.", "A describing phrase after a subject is not enough; the sentence still needs a verb.")
mc("fragments-run-ons", "L.5.1", 2, "Which sentence is a comma splice?",
   "The hikers reached the summit, the view stretched for miles.",
   [("The hikers reached the summit, and the view stretched for miles.", "A comma plus “and” correctly joins the two ideas."),
    ("The hikers reached the summit. The view stretched for miles.", "Two correctly punctuated separate sentences."),
    ("After the hikers reached the summit, the view stretched for miles.", "This is one correctly joined sentence.")],
   "A comma alone cannot join two complete sentences; that creates a comma splice.", "A comma splice is a run-on fixed with only a comma, which is not enough.")
mc("fragments-run-ons", "L.5.1", 3, "Which is the best way to correct this run-on? “The ferry arrived late the passengers missed their connecting bus.”",
   "The ferry arrived late, so the passengers missed their connecting bus.",
   [("The ferry arrived late, the passengers missed their connecting bus.", "A comma alone still creates a comma splice."),
    ("The ferry arrived late. the passengers missed their connecting bus.", "The second sentence needs a capital letter to start correctly."),
    ("The ferry arrived late so the passengers missed their connecting bus.", "A comma is needed before the conjunction “so.”")],
   "A comma plus the conjunction “so” correctly joins the two related ideas.", "Check that a comma is paired with a conjunction, not left alone.")
err("fragments-run-ons", "L.5.1", 4, ["The bridge had been closed for repairs", " drivers", " took a longer route", " through the old town."], 1, ", so drivers",
    "Two complete ideas are joined with no punctuation, creating a run-on; a comma and “so” fix it.", "Look for two complete thoughts crammed together with nothing between them.")
mc("fragments-run-ons", "L.5.1", 4, "Which sentence contains a fragment?",
   "The engineers studied the bridge for months. Searching for the exact cause of the crack.",
   [("The engineers studied the bridge for months, searching for the exact cause of the crack.", "This is one complete sentence with a phrase attached correctly."),
    ("The engineers, searching for the exact cause of the crack, studied the bridge for months.", "This is one complete sentence."),
    ("The engineers studied the bridge for months; they searched for the crack's cause.", "A semicolon correctly joins two complete sentences.")],
   "“Searching for the exact cause of the crack” has no subject of its own and cannot stand as a sentence.", "A phrase describing an earlier sentence is still a fragment if it stands alone.")
mc("fragments-run-ons", "L.5.1", 5, "Which revision fixes BOTH problems? “Because the generator failed during the storm. The clinic lost power for six hours it ran on backup batteries.”",
   "Because the generator failed during the storm, the clinic lost power for six hours, and it ran on backup batteries.",
   [("Because the generator failed during the storm, the clinic lost power for six hours it ran on backup batteries.", "The run-on between “hours” and “it ran” is never fixed."),
    ("Because the generator failed during the storm. The clinic lost power for six hours, and it ran on backup batteries.", "The opening fragment is never joined to a main clause."),
    ("The generator failed during the storm the clinic lost power for six hours, and it ran on backup batteries.", "Removing “because” creates a new run-on at the start.")],
   "Joining the dependent clause to the main clause and adding a comma plus “and” between the two complete ideas fixes both problems.", "Work through a long error one join at a time.")
mc("fragments-run-ons", "L.5.1", 6, "Which paragraph contains NO fragments or run-ons?",
   "The bakery ran out of flour by mid-morning. Customers lined up anyway, hoping a new delivery would arrive soon. By noon, a truck finally pulled up outside.",
   [("The bakery ran out of flour by mid-morning customers lined up anyway. Hoping a new delivery would arrive soon.", "This has both a run-on and a fragment."),
    ("The bakery ran out of flour. By mid-morning. Customers lined up anyway, hoping for a delivery.", "“By mid-morning” on its own is a fragment."),
    ("The bakery ran out of flour by mid-morning, customers lined up anyway, hoping a delivery would arrive soon.", "A comma alone joining the first two ideas creates a comma splice.")],
   "Each sentence has its own subject, verb, and correct end punctuation.", "Read each sentence alone; does it stand as a complete thought?")
mc("fragments-run-ons", "L.5.1", 6, "Which sentence correctly uses a semicolon to join two related, complete ideas?",
   "The negotiations dragged on for weeks; neither side wanted to compromise first.",
   [("The negotiations dragged on for weeks, neither side wanted to compromise first.", "A comma alone creates a comma splice."),
    ("The negotiations dragged on for weeks; because neither side wanted to compromise first.", "A semicolon should not be followed by a dependent clause starting with “because.”"),
    ("The negotiations dragged on for weeks neither side wanted to compromise first.", "With no punctuation, this is a run-on.")],
   "A semicolon correctly joins two closely related, complete sentences without a conjunction.", "A semicolon replaces a period between two closely related complete sentences.")
mc("fragments-run-ons", "L.5.1", 7, "Which sentence correctly joins two independent clauses with a semicolon and a transition word?",
   "The river had flooded twice that year; therefore, the village council approved funding for a new levee.",
   [("The river had flooded twice that year, therefore, the village council approved funding for a new levee.", "A comma alone before “therefore” is not strong enough to join two complete sentences."),
    ("The river had flooded twice that year therefore the village council approved funding for a new levee.", "With no punctuation at all around “therefore,” this is a run-on."),
    ("The river had flooded twice that year; therefore the village council approved funding for a new levee.", "A comma is needed after a transition word like “therefore” when it follows a semicolon.")],
   "A semicolon before a transition word like “therefore,” followed by a comma, correctly joins the two independent clauses.", "Transition words like therefore, however, and moreover need a semicolon before and a comma after when joining two sentences.")

grade(6)
tf("fragments-run-ons", "L.6.1", 1, "“Even though the harvest had been poor that year” is a complete sentence.", False,
   "This dependent clause starting with “even though” has no main clause to finish the idea.", "A clause beginning with a subordinating word needs an independent clause attached.")
mc("fragments-run-ons", "L.6.1", 2, "Which group of words is a fragment?",
   "The committee members, exhausted after the five-hour debate.",
   [("The committee members left exhausted after the five-hour debate.", "This has a subject and a verb."),
    ("Exhausted, the committee members finally left.", "This is complete."),
    ("The debate lasted five hours.", "This is complete.")],
   "There is a subject, “committee members,” but no verb showing what they did.", "A describing phrase attached to a subject is not a verb.")
mc("fragments-run-ons", "L.6.1", 2, "Which sentence is a comma splice?",
   "The treaty was signed, both nations celebrated the end of the conflict.",
   [("The treaty was signed, and both nations celebrated the end of the conflict.", "A comma plus “and” correctly joins the ideas."),
    ("The treaty was signed. Both nations celebrated the end of the conflict.", "Two correctly separated sentences."),
    ("Once the treaty was signed, both nations celebrated the end of the conflict.", "This is one correctly joined sentence.")],
   "A comma alone cannot join two complete sentences, creating a comma splice.", "Check whether both halves of a sentence could stand alone; if so, a comma alone is not enough.")
mc("fragments-run-ons", "L.6.1", 3, "Which is the best way to correct this run-on? “The committee reviewed the proposal twice they still could not reach an agreement.”",
   "The committee reviewed the proposal twice, but they still could not reach an agreement.",
   [("The committee reviewed the proposal twice, they still could not reach an agreement.", "A comma alone creates a comma splice."),
    ("The committee reviewed the proposal twice but, they still could not reach an agreement.", "The comma belongs before “but,” not after."),
    ("The committee reviewed the proposal twice they still, could not reach an agreement.", "The comma is misplaced and does not fix the run-on.")],
   "A comma plus the conjunction “but” correctly joins the two contrasting, complete ideas.", "Choose a conjunction that matches the relationship between the two ideas.")
err("fragments-run-ons", "L.6.1", 4, ["The excavation had uncovered pottery shards for weeks", " the archaeologists", " finally found", " an intact clay tablet."], 1, ", when the archaeologists",
    "Two complete ideas are joined with no punctuation, creating a run-on; adding “when” and a comma shows the time relationship and fixes it.", "Look for two full sentences crammed together with nothing connecting them.")
mc("fragments-run-ons", "L.6.1", 4, "Which sentence contains a fragment?",
   "The negotiators left the room abruptly. Frustrated by the lack of progress after three days.",
   [("The negotiators left the room abruptly, frustrated by the lack of progress after three days.", "This is one complete sentence with a phrase attached correctly."),
    ("Frustrated by the lack of progress, the negotiators left the room abruptly.", "This is one complete sentence."),
    ("The negotiators left the room abruptly; they were frustrated by the lack of progress.", "A semicolon correctly joins two complete sentences.")],
   "“Frustrated by the lack of progress after three days” has no subject performing an action and cannot stand alone.", "A descriptive phrase separated by a period is still a fragment if it has no subject and verb of its own.")
mc("fragments-run-ons", "L.6.1", 5, "Which revision fixes BOTH problems? “Although the committee had warned residents for months. Few believed the dam could actually fail it collapsed within hours of the flood warning.”",
   "Although the committee had warned residents for months, few believed the dam could actually fail, and it collapsed within hours of the flood warning.",
   [("Although the committee had warned residents for months, few believed the dam could actually fail it collapsed within hours of the flood warning.", "The run-on between “fail” and “it collapsed” is never fixed."),
    ("Although the committee had warned residents for months. Few believed the dam could actually fail, and it collapsed within hours of the flood warning.", "The opening fragment is never joined to a main clause."),
    ("The committee had warned residents for months few believed the dam could actually fail, and it collapsed within hours of the flood warning.", "Removing “although” creates a new run-on at the start.")],
   "Joining the dependent clause to the main clause and adding a comma plus “and” between the two complete ideas fixes both errors.", "Untangle a long error one connection at a time, checking each join separately.")
mc("fragments-run-ons", "L.6.1", 6, "Which paragraph contains NO fragments or run-ons?",
   "The city council debated the proposal for hours. Residents on both sides packed the chamber, hoping to sway the final vote. In the end, the measure passed by a narrow margin.",
   [("The city council debated the proposal for hours residents packed the chamber. Hoping to sway the final vote.", "This has both a run-on and a fragment."),
    ("The city council debated the proposal. For hours. Residents packed the chamber, hoping to sway the vote.", "“For hours” standing alone is a fragment."),
    ("The city council debated the proposal for hours, residents packed the chamber hoping to sway the vote.", "A comma alone joining the first two ideas creates a comma splice.")],
   "Each sentence has its own subject, verb, and correct end punctuation, with no gaps or improper joins.", "Isolate each sentence and confirm it has a subject, a verb, and a complete thought.")
mc("fragments-run-ons", "L.6.1", 6, "Which sentence correctly uses a semicolon to join two related, complete ideas?",
   "The old factory had sat empty for a decade; developers finally saw potential in its brick walls.",
   [("The old factory had sat empty for a decade, developers finally saw potential in its brick walls.", "A comma alone creates a comma splice."),
    ("The old factory had sat empty for a decade; because developers finally saw potential in its brick walls.", "A semicolon should not be followed by a dependent clause starting with “because.”"),
    ("The old factory had sat empty for a decade developers finally saw potential in its brick walls.", "With no punctuation at all, this is a run-on.")],
   "A semicolon alone correctly joins two closely related, complete sentences.", "Make sure both halves joined by a semicolon could stand as their own sentences.")
mc("fragments-run-ons", "L.6.1", 7, "Which sentence correctly joins two independent clauses with a semicolon and a transition word?",
   "The company's profits had fallen for three straight quarters; consequently, the board voted to replace the chief executive.",
   [("The company's profits had fallen for three straight quarters, consequently, the board voted to replace the chief executive.", "A comma alone before “consequently” is too weak to join two complete sentences."),
    ("The company's profits had fallen for three straight quarters consequently the board voted to replace the chief executive.", "With no punctuation around “consequently,” this is a run-on."),
    ("The company's profits had fallen for three straight quarters; consequently the board voted to replace the chief executive.", "A comma is needed after a transition word like “consequently” following a semicolon.")],
   "A semicolon before the transition word “consequently,” followed by a comma, correctly joins the two independent clauses.", "Transition words like consequently, however, and therefore take a semicolon before and a comma after when joining two sentences.")

# ================================================================== inference
grade(4)
mc("inference", "RL.4.1", 1, "Read the sentences. “Yusuf's hands shook as he opened the envelope. When he saw the winning number, he let out a loud whoop and jumped off the couch.” What can you infer about Yusuf's feelings?",
   "He felt excited and surprised.",
   [("He felt bored.", "Jumping and whooping do not show boredom."),
    ("He felt sleepy.", "Shaking hands and jumping do not show sleepiness."),
    ("He felt angry.", "Nothing in the actions shows anger.")],
   "Shaking hands, a loud whoop, and jumping all show strong excitement.", "Use a character's actions to infer their feelings.")
mc("inference", "RL.4.1", 2, "Read the sentences. “Mariam set two extra plates at the table even though only she and her mother would be eating. She kept glancing at the front door.” What can you infer?",
   "Mariam is expecting more guests to arrive.",
   [("Mariam forgot how many people live in her house.", "Setting extra plates on purpose does not suggest forgetting."),
    ("Mariam does not like using plates.", "Nothing suggests dislike of plates."),
    ("Mariam is cleaning the table.", "Setting plates and watching the door do not show cleaning.")],
   "Extra plates and watching the door both suggest she expects someone else to arrive.", "Look for small clues a character's actions give about what they expect.")
mc("inference", "RL.4.1", 3, "Read the sentences. “Khaled walked past the bakery three times before finally going inside. Once there, he stared at the price list for a long time before ordering just one roll.” What can you infer about Khaled?",
   "He was being careful with his money.",
   [("He did not like bread.", "He went inside and bought a roll, so he does like bread."),
    ("He was in a hurry.", "Walking past three times and staring at prices does not show hurrying."),
    ("He forgot his money at home.", "He did order and presumably pay for a roll.")],
   "Hesitating outside and studying prices before buying just one item suggest he was watching his spending.", "Hesitation before a purchase often suggests concern about cost.")
tf("inference", "RL.4.1", 3, "Read the sentences. “Lina's older brother usually teased her about her drawings, but today he pinned her newest sketch to the refrigerator without saying a word.” It can be inferred that Lina's brother secretly liked the drawing.", True,
   "Pinning the sketch up, instead of teasing, suggests he admired it even without saying so.", "A changed action can hint at a changed feeling, even without words.")
mc("inference", "RL.4.1", 4, "Read the sentences. “Samir kept checking his watch during the soccer match, even glancing at the exit twice. When his phone buzzed, he answered it before the referee had even blown the whistle for halftime.” What can you infer about Samir?",
   "He was waiting for an important call and was distracted from the game.",
   [("He was the referee's assistant.", "Nothing suggests he had an official role."),
    ("He had lost interest in sports altogether.", "Watching the match and checking his watch show he was still there, just distracted."),
    ("He was hoping the game would be cancelled.", "Nothing suggests he wanted the game cancelled.")],
   "Repeatedly checking his watch, glancing at the exit, and answering quickly all suggest he was anxiously waiting for a call.", "Repeated small actions can reveal what a character is anxiously anticipating.")
mc("inference", "RL.4.1", 5, "Read the sentences. “Hoda's grandmother handed her the old recipe card without looking up, her voice tighter than usual as she described the steps. When Hoda asked if something was wrong, her grandmother just smiled and said the onions were strong today.” What can you infer about the grandmother's true feelings?",
   "She was likely feeling emotional about sharing the recipe, not just affected by onions.",
   [("She genuinely disliked cutting onions.", "The onion comment is likely an excuse, not the real reason for her tight voice."),
    ("She was angry at Hoda for asking a question.", "Smiling while answering does not suggest anger."),
    ("She did not want to share the recipe at all.", "She hands over the card and describes the steps willingly.")],
   "A tight voice and an excuse about onions suggest she was hiding deeper emotion while sharing something meaningful.", "A character's excuse can hint at a feeling they are not stating directly.")
mc("inference", "RL.4.1", 5, "Read the sentences. “Adel's little sister asked him for the fifth time that afternoon to play outside, and each time he said he was too busy with his model airplane. When she finally gave up and went to her room, he glanced at the door for a long moment before going back to his glue and plastic pieces.” What does Adel's glance toward the door suggest?",
   "He felt a flicker of guilt about turning his sister away.",
   [("He wanted to go outside himself.", "Nothing suggests he wanted to play outside."),
    ("He was worried someone would steal his model.", "No threat to the model is mentioned."),
    ("He was waiting for a friend to arrive.", "No friend is mentioned at all.")],
   "Pausing to glance at the door right after his sister leaves disappointed suggests a moment of guilt.", "A pause after disappointing someone often hints at a feeling the character does not say aloud.")
mc("inference", "RL.4.1", 6, "Read the sentences. “The coach announced the starting lineup without once glancing toward Noor, who had scored the winning goal in practice all week. Noor gripped her water bottle tighter and stared at the grass instead of the clipboard.” What can you infer about Noor's situation?",
   "She was likely left out of the starting lineup and felt hurt by it.",
   [("She was chosen as team captain.", "Nothing suggests she received an honor; the clues point to disappointment."),
    ("She was excited to be benched to rest before a big game.", "Gripping the bottle tighter and avoiding the clipboard suggest tension, not calm acceptance."),
    ("She did not care at all about the lineup.", "Her physical reactions show she cared a great deal.")],
   "The coach avoiding eye contact and Noor's tense reaction both suggest she was passed over and is upset about it.", "Notice what a character avoids looking at; it often points to what is bothering them.")
mc("inference", "RL.4.1", 7, "Read the sentences. “Tariq's father read the acceptance letter twice, folded it carefully along its original creases, and placed it back in the envelope before setting it on the kitchen counter rather than the family bulletin board where every other important letter went. He said only, “We'll talk about it after dinner.”” What does the father's handling of the letter most strongly suggest?",
   "He has complicated feelings about the news and needs time before discussing it.",
   [("He is proud and plans to celebrate immediately.", "Delaying the conversation and avoiding the usual bulletin board do not suggest immediate celebration."),
    ("He did not read the letter carefully.", "Reading it twice shows careful attention, not carelessness."),
    ("He thinks the letter is unimportant.", "Folding it carefully along its creases shows he considers it significant.")],
   "Reading it twice, handling it carefully, and setting it apart from routine letters all suggest the news matters deeply but is complicated for him.", "Where and how a character places an object can reveal unspoken feelings about it.")

grade(5)
mc("inference", "RL.5.1", 1, "Read the sentences. “Dalia reread the letter three times, tracing each line with her finger before folding it and tucking it under her pillow instead of in her desk drawer.” What can you infer about the letter's importance to Dalia?",
   "It means a great deal to her.",
   [("It is a letter she plans to throw away.", "Keeping it under her pillow instead of discarding it shows she values it."),
    ("It is a letter from a stranger she does not know.", "The careful, repeated reading suggests a personal connection."),
    ("It contains instructions for a school assignment.", "The emotional care taken suggests something more personal than an assignment.")],
   "Rereading it carefully and keeping it somewhere special, under her pillow, shows it matters deeply to her.", "Where a character keeps an object can reveal how much they value it.")
mc("inference", "RL.5.1", 2, "Read the sentences. “Every time the teacher mentioned the upcoming science fair, Youssef's pencil stopped moving and his eyes dropped to his desk. He was the only student who never raised his hand to volunteer a project idea.” What can you infer about Youssef?",
   "He feels anxious or unprepared about the science fair.",
   [("He already finished his project early.", "His reaction suggests worry, not confidence from being finished."),
    ("He is the most excited student in class.", "Dropping his eyes and staying silent do not show excitement."),
    ("He thinks science fairs are a waste of time.", "Nothing suggests indifference; his reaction suggests nervousness.")],
   "Stopping his work and avoiding eye contact whenever the topic comes up suggest the science fair makes him anxious.", "A character's physical reaction to a topic can reveal their hidden feelings about it.")
mc("inference", "RL.5.1", 3, "Read the sentences. “Rania's coach benched her for the first half without explanation. During the break, Rania sat at the far end of the bench, arms crossed, answering her teammates' questions with one word each.” What can you infer about Rania's feelings?",
   "She feels upset and is withdrawing from her teammates.",
   [("She is relieved to have a rest.", "Crossed arms and short answers do not show relief or relaxation."),
    ("She agrees completely with the coach's decision.", "Her distant behavior suggests frustration, not agreement."),
    ("She is focused on planning her next play.", "Nothing suggests she is strategizing; her behavior shows withdrawal.")],
   "Sitting apart, crossing her arms, and giving short answers all show she is upset and pulling away from the team.", "Physical distance from others can mirror a character's emotional distance.")
mc("inference", "RL.5.1", 4, "Read the sentences. “Khalil's mother set his favorite dinner on the table without being asked, then sat across from him instead of eating in the kitchen as usual. She kept starting sentences and stopping before finishing them.” What can you infer about what is happening?",
   "She has something difficult to tell him and is working up to it.",
   [("She is simply hungry and wants company.", "The unfinished sentences suggest she is building up to say something, not just socializing."),
    ("She forgot that Khalil already ate dinner.", "Preparing his favorite meal shows deliberate planning, not forgetfulness."),
    ("She is testing a new recipe for a cooking class.", "The emotional cues point to a difficult announcement, not a recipe test.")],
   "A favorite meal, sitting unusually close, and unfinished sentences together suggest she is preparing to share difficult news.", "Unusual changes in routine often signal that a character has something important to say.")
tf("inference", "RL.5.1", 4, "Read the sentences. “Sami's older cousin had always borrowed his tools without asking, but today he returned them all, cleaned and oiled, with a short note that just said, “Thanks for everything.”” It can be inferred that the cousin is leaving or moving away soon.", True,
   "Returning borrowed items, cleaning them carefully, and writing a farewell-sounding note together suggest the cousin is preparing to leave.", "A sudden return of borrowed things, paired with a thankful note, often signals a goodbye.")
mc("inference", "RL.5.1", 5, "Read the sentences. “The shopkeeper slid the broken toy back across the counter to Nadia without a word, then quietly placed a different, nicer one in her bag while pretending to wrap her original purchase.” What can you infer about the shopkeeper?",
   "He is kindly replacing the broken toy without wanting to be thanked for it.",
   [("He is trying to trick Nadia into paying more.", "Secretly giving a nicer toy is generous, not deceptive toward her."),
    ("He did not notice the toy was broken.", "Sliding it back silently suggests he noticed and is quietly handling it."),
    ("He wants Nadia to return later and buy more toys.", "Nothing suggests a plan to bring her back as a customer.")],
   "Quietly swapping in a better toy without announcing it suggests a private act of kindness.", "A quiet, unannounced act can reveal generosity a character does not want recognized.")
mc("inference", "RL.5.1", 6, "Read the sentences. “During the interview, Omar answered every question about the award with short, polite sentences, but when a reporter mentioned his late grandfather's old workshop, Omar's voice caught, and he asked for a moment before continuing.” What does Omar's reaction to the mention of the workshop suggest?",
   "The workshop holds a deep personal and emotional connection for him.",
   [("He is uncomfortable discussing his award at all.", "He answered the award questions smoothly; the reaction is specific to the workshop mention."),
    ("He has never heard of the workshop before.", "A reaction this strong suggests familiarity, not unfamiliarity."),
    ("He is annoyed that the reporter changed the subject.", "Asking for a moment suggests emotion, not irritation at the topic change.")],
   "His composed answers elsewhere contrast sharply with his reaction to the workshop, showing it touches something deeply personal.", "Compare a character's reaction to one topic against their reactions to others to find what truly matters to them.")
mc("inference", "RL.5.1", 7, "Read the sentences. “Layla's manuscript came back from the publisher with a single line of feedback: “Not quite ready yet, but keep going.” She read it standing in the hallway, then sat down right there on the floor and began rewriting the first page on the back of the rejection letter itself.” What does Layla's choice to write on the back of the rejection letter most strongly suggest?",
   "She is transforming the disappointment into immediate determination to improve.",
   [("She has run out of paper and had no other option.", "Nothing suggests a shortage of paper; the choice is symbolic, not practical."),
    ("She plans to frame the letter as a souvenir.", "Writing over it suggests using it as a tool, not preserving it as a keepsake."),
    ("She has decided to give up writing entirely.", "Immediately rewriting the first page shows renewed effort, not giving up.")],
   "Writing new work directly on the rejection letter, rather than putting it away, shows she is channeling disappointment into immediate action.", "A character's unusual, symbolic choice of action often reveals their deeper resolve.")

grade(6)
mc("inference", "RL.6.1", 1, "Read the sentences. “Hassan read the test results form twice, set it face-down on the table, and walked to the window before saying anything to his sister waiting on the phone.” What can you infer about Hassan's reaction to the results?",
   "The results affected him strongly, and he needed a moment before responding.",
   [("He had not yet opened the envelope.", "He already read the form twice."),
    ("He found the results boring and unimportant.", "Reading it twice and pausing before speaking suggest strong, not indifferent, feelings."),
    ("He was relieved and wanted to celebrate right away.", "Setting it face-down and pausing suggest hesitation, not immediate celebration.")],
   "Reading it twice, turning it over, and pausing before speaking all suggest he needed time to process a strong reaction.", "A pause before speaking often signals a character is processing a strong reaction.")
mc("inference", "RL.6.1", 2, "Read the sentences. “Every evening that week, Mona's father came home later than usual, his tie loosened before he even reached the door, and went straight to his study without the usual greeting.” What can you infer about Mona's father?",
   "He is dealing with unusual stress or pressure at work.",
   [("He has started a new hobby he enjoys.", "Nothing about his behavior suggests enjoyment; it points to strain."),
    ("He forgot where the study is located.", "Going straight there shows he knows exactly where it is."),
    ("He is planning a surprise celebration for Mona.", "Nothing hints at planning a celebration; the details suggest stress instead.")],
   "Coming home later, loosening his tie early, and skipping his usual greeting together suggest he is under unusual strain.", "A break in a character's normal routine often signals something is weighing on them.")
mc("inference", "RL.6.1", 3, "Read the sentences. “The council member who had always voted against funding the new clinic stood up first at the meeting and moved to approve the budget without a single amendment.” What can you infer about this council member?",
   "Something has changed their mind about the clinic's importance.",
   [("They have always supported the clinic.", "The sentence states they “always voted against” it before."),
    ("They are trying to delay the vote further.", "Moving to approve without amendments speeds up the process rather than delaying it."),
    ("They misunderstood what was being voted on.", "Standing up first to propose the motion shows clear intent, not confusion.")],
   "A sudden reversal from consistent opposition to immediate, full support suggests a real change of mind.", "A character's unexpected reversal usually signals a meaningful change in their view.")
mc("inference", "RL.6.1", 4, "Read the sentences. “Zein kept the acceptance letter from the university in his jacket pocket for three days without telling his parents, even as they asked at dinner each night whether any news had arrived.” What can you infer about Zein's situation?",
   "He is uncertain or conflicted about sharing or accepting the news.",
   [("He has not yet received any letter.", "He already has the letter in his pocket."),
    ("He is certain his parents will be thrilled and is planning a surprise party.", "Hiding the letter for days while being asked directly suggests hesitation, not excited planning."),
    ("He plans to reject the offer and sees no reason to mention it.", "Keeping the letter rather than discarding it suggests he is still weighing the decision.")],
   "Hiding the letter for days while being directly asked suggests he feels conflicted about the news, not simply excited or dismissive.", "A gap between what a character does and what they say reveals their true uncertainty.")
tf("inference", "RL.6.1", 4, "Read the sentences. “The usually talkative tour guide grew quiet as the group approached the old courthouse, pointing only briefly at the building before leading everyone quickly toward the next stop.” It can be inferred that the courthouse holds a difficult or painful memory for the guide.", True,
   "A sudden, uncharacteristic silence and a rushed pace past a specific building suggest the guide is avoiding something painful.", "A character avoiding a topic, especially one usually talkative, often signals a sensitive memory.")
mc("inference", "RL.6.1", 5, "Read the sentences. “After the verdict was read, the lawyer closed her briefcase slowly, shook hands with the opposing counsel for an unusually long moment, and left through the side door instead of facing the reporters waiting at the main entrance.” What can you infer about the lawyer's feelings about the case's outcome?",
   "She has complicated feelings about the result, beyond simple victory or defeat.",
   [("She is thrilled and eager to speak with reporters.", "Avoiding the main entrance suggests she is not eager to face the press."),
    ("She believes the verdict was completely wrong and plans to appeal immediately.", "Nothing about her calm, deliberate actions suggests outrage or an immediate plan to appeal."),
    ("She has no opinion about the case at all.", "Her deliberate, unusual actions show she is affected, not indifferent.")],
   "The long handshake and avoiding reporters suggest complex emotions that go beyond a simple reaction to winning or losing.", "Deliberate, unusual actions after a major event often reveal complicated, mixed feelings.")
mc("inference", "RL.6.1", 6, "Read the sentences. “The scientist's hands trembled slightly as she adjusted the microscope for the final confirmation, though she had run this exact test dozens of times before without incident.” What does her trembling, despite her experience, most strongly suggest?",
   "This particular result carries unusually high stakes or significance for her.",
   [("She has forgotten how to use the microscope properly.", "Running the test “dozens of times” shows clear familiarity with the equipment."),
    ("The microscope is broken and difficult to adjust.", "No mechanical problem with the microscope is mentioned."),
    ("She is simply tired after a long day of work.", "Trembling specifically despite extensive experience points to the significance of this result, not general fatigue.")],
   "Trembling despite having performed the same test many times before suggests this particular result matters unusually much to her.", "A skilled character's uncharacteristic nervousness often signals the unusual importance of a specific moment.")
mc("inference", "RL.6.1", 7, "Read the sentences. “The retired general answered every question about the battle in precise, clipped detail, military terms intact, until a young reporter asked simply, “Were you scared?” He looked past the camera for a long moment before answering, “Every single day,” in a voice far softer than before.” What does the shift in the general's voice and gaze most strongly reveal?",
   "Beneath his composed, professional exterior, he carries genuine, long-held fear and vulnerability.",
   [("He did not understand the reporter's question.", "His direct, honest answer shows clear understanding, not confusion."),
    ("He considers the question disrespectful and is ending the interview.", "He answers the question honestly rather than refusing or objecting to it."),
    ("He is exaggerating his fear for dramatic effect in the interview.", "The softened, genuine tone suggests sincerity rather than performance.")],
   "The sudden shift from precise military language to a soft, simple answer reveals real emotion beneath his composed exterior.", "A sudden change in a character's tone or precision often signals a break from a practiced persona into genuine feeling.")
