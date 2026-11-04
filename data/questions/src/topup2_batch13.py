"""
Question bank top-up 2, batch 13: brings these families to the full target of 50 items each
(original content, Grades 4-6): prepositions, sequence, idioms-adages, summarize, cause-effect.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== prepositions
grade(4)
mc("prepositions", "L.4.1", 1, "Which word is a preposition? “The frog jumped into the pond.”",
   "into", [("frog", "This is a noun."), ("jumped", "This is a verb."), ("pond", "This is a noun.")],
   "“Into” shows where the frog jumped.", "Prepositions often show position or direction.")
dd("prepositions", "L.4.1", 1, "Choose the preposition of place: “The keys are ____ the drawer.”",
   "in", [("at", "“At” names a point, not inside a space."), ("to", "“To” shows direction, not location."), ("of", "“Of” does not show place.")],
   "“In” shows the keys are inside the drawer.", "“In” is used for enclosed spaces.")
mc("prepositions", "L.4.1", 2, "Which word is a preposition? “She walked across the bridge every morning.”",
   "across", [("walked", "This is a verb."), ("bridge", "This is a noun."), ("morning", "This is a noun.")],
   "“Across” shows how she moved over the bridge.", "Prepositions can show movement over or through something.")
dd("prepositions", "L.4.1", 2, "Choose the preposition of time: “The bakery opens ____ sunrise.”",
   "before", [("between", "This needs two points in time."), ("onto", "This shows movement, not time."), ("of", "This does not fit time.")],
   "“Before” tells us the bakery opens earlier than sunrise.", "Time prepositions: before, after, during, at.")
mc("prepositions", "L.4.1", 3, "What is the prepositional phrase in this sentence? “The kitten hid beneath the old couch.”",
   "beneath the old couch", [("The kitten hid", "This is the subject and verb."), ("the old couch", "A phrase begins with the preposition."), ("kitten hid beneath", "This mixes the subject into the phrase.")],
   "The phrase starts with the preposition “beneath” and ends with the noun “couch.”", "A prepositional phrase: preposition + its object.")
dd("prepositions", "L.4.1", 3, "Choose the preposition of direction: “The hikers climbed ____ the steep hill.”",
   "up", [("at", "“At” names a point, not direction."), ("of", "“Of” does not show direction."), ("by", "“By” usually shows nearness.")],
   "“Up” shows the direction the hikers climbed.", "Direction prepositions: up, down, through, across.")
tf("prepositions", "L.4.1", 3, "In the sentence “The birds flew over the lake,” the word “over” is a preposition.", True,
   "“Over” shows the birds’ position in relation to the lake, so it is a preposition.", "Check if the word connects a noun to the rest of the sentence showing place, time or direction.")
mc("prepositions", "L.4.1", 4, "What is the object of the preposition in this sentence? “We planted flowers around the fountain.”",
   "fountain", [("flowers", "This is the object of the verb “planted.”"), ("We", "This is the subject."), ("planted", "This is the verb.")],
   "The noun right after “around” is “fountain,” so it is the object of the preposition.", "The object of a preposition is the noun that follows it.")
dd("prepositions", "L.4.1", 4, "Choose the preposition: “The library is ____ the post office.”",
   "next to", [("beside of", "This is not a correct phrase; drop “of.”"), ("near to", "This repeats the idea; use “near” alone."), ("close of", "This is not a correct phrase.")],
   "“Next to” correctly shows the library’s location beside the post office.", "Some location phrases, like “next to,” act as one preposition.")
ms("prepositions", "L.4.1", 4, "Which TWO are prepositional phrases? “During the storm, the sailors stayed inside the cabin.”",
   ["During the storm", "inside the cabin"], [("the sailors stayed", "This is the subject and verb."), ("the storm", "A phrase must include its preposition.")],
   "“During” and “inside” each begin a phrase ending in a noun.", "Look for a preposition followed by a noun.")
mc("prepositions", "L.4.1", 5, "Which word is a preposition that shows time? “The guests arrived after the ceremony began.”",
   "after", [("guests", "This is a noun."), ("arrived", "This is a verb."), ("ceremony", "This is a noun.")],
   "“After” tells us when the guests arrived.", "Time prepositions tell when something happens.")
err("prepositions", "L.4.1", 5, ["The letter", " was placed", " under of", " the pile."], 2, " under",
    "“Under” alone is the correct preposition; “of” should not follow it.", "Some prepositions never need a second word like “of” after them.")
dd("prepositions", "L.4.1", 5, "Choose the preposition: “The team practiced ____ dawn until dusk.”",
   "from", [("since", "“Since” pairs with a specific starting time, not “until.”"), ("by", "“By” shows a deadline, not a starting point."), ("at", "“At” names one point, not a span.")],
   "“From … until” shows the whole span of time the team practiced.", "“From” pairs naturally with “until” to show a time range.")
mc("prepositions", "L.4.1", 6, "Which phrase works as an adverb telling HOW in this sentence? “The engineer explained the plan with great care.”",
   "with great care", [("The engineer explained", "This is the subject and verb."), ("the plan", "This is the object of the verb."), ("great care", "A phrase must include the preposition “with.”")],
   "“With great care” tells how the engineer explained the plan.", "A prepositional phrase can describe a verb by telling how.")
dd("prepositions", "L.4.1", 6, "Choose the preposition: “The museum remained closed ____ the renovation.”",
   "during", [("while", "“While” is a conjunction, not a preposition."), ("for", "“For” would suggest a reason, not a time span."), ("at", "“At” names a point, not a time span.")],
   "“During” shows the whole time span of the renovation.", "“During” is followed by a noun, never by a clause.")
mc("prepositions", "L.4.1", 6, "Which sentence uses the preposition correctly?",
   "Despite the rain, the match continued.",
   [("Despite of the rain, the match continued.", "“Despite” never takes “of” after it."), ("In despite the rain, the match continued.", "There is no preposition “in despite.”"), ("Despite the rain the match, continued.", "The comma is placed incorrectly.")],
   "“Despite” is followed directly by a noun phrase, with no extra word.", "“Despite” and “in spite of” both mean the same thing, but never combine them.")
mc("prepositions", "L.4.1", 7, "What is the object of the preposition in this sentence? “According to the report, the bridge needs repair.”",
   "report", [("bridge", "This is the subject of the main clause."), ("repair", "This is the object of the verb “needs.”"), ("According", "This is part of the preposition itself.")],
   "“Report” is the noun that follows the compound preposition “according to.”", "“According to” is a two-word preposition followed by its object.")
err("prepositions", "L.4.1", 7, ["The committee decided", " to proceed", " regardless to", " the objections."], 2, " regardless of",
    "The fixed phrase is “regardless of,” never “regardless to.”", "Memorize fixed preposition pairings like “regardless of.”")
mc("prepositions", "L.4.1", 7, "Which word is used as a preposition in this sentence? “The children ran quickly toward the gate.”",
   "toward", [("quickly", "This is an adverb telling how they ran."), ("ran", "This is the verb."), ("gate", "This is a noun, the object of the preposition.")],
   "“Toward” connects “gate” to the rest of the sentence, showing direction.", "A preposition is followed by a noun that becomes its object.")

grade(5)
mc("prepositions", "L.5.1", 1, "Which word is a preposition? “The eagle soared above the canyon.”",
   "above", [("eagle", "This is a noun."), ("soared", "This is a verb."), ("canyon", "This is a noun.")],
   "“Above” shows the eagle’s position over the canyon.", "Prepositions often describe where something is.")
dd("prepositions", "L.5.1", 1, "Choose the preposition: “The puzzle pieces are scattered ____ the floor.”",
   "over", [("between", "This needs two separate points, not one floor."), ("above", "The pieces are touching the floor, not floating above it."), ("beneath", "The pieces are on the floor, not under it.")],
   "“Over” shows the pieces are spread across the surface of the floor.", "“Over” can mean spread across a surface, not just above it.")
mc("prepositions", "L.5.1", 2, "What is the prepositional phrase in this sentence? “The scientist recorded data throughout the experiment.”",
   "throughout the experiment", [("The scientist recorded", "This is the subject and verb."), ("recorded data", "This is the verb and its object."), ("data throughout", "A phrase must begin with the preposition.")],
   "The phrase starts with “throughout” and ends with the noun “experiment.”", "A prepositional phrase begins with the preposition itself.")
dd("prepositions", "L.5.1", 2, "Choose the preposition: “The ship sailed ____ the narrow strait.”",
   "through", [("at", "“At” names a single point, not a passage."), ("by", "“By” would mean nearby, not passing inside it."), ("on", "Ships sail “on” open water, not through a strait.")],
   "“Through” shows the ship passed inside the narrow strait.", "“Through” describes movement from one side to the other inside something.")
mc("prepositions", "L.5.1", 3, "What is the object of the preposition in this sentence? “The hikers rested beside a clear stream.”",
   "stream", [("hikers", "This is the subject."), ("rested", "This is the verb."), ("clear", "This is an adjective describing the stream.")],
   "“Stream” is the noun that follows “beside,” so it is the object of the preposition.", "Find the preposition, then look for the noun right after it.")
dd("prepositions", "L.5.1", 3, "Choose the preposition: “The results depend ____ careful measurement.”",
   "on", [("of", "The fixed phrase is “depend on,” not “depend of.”"), ("from", "The fixed phrase is “depend on,” not “depend from.”"), ("in", "The fixed phrase is “depend on,” not “depend in.”")],
   "“Depend on” is the correct idiomatic pairing.", "Some verbs always pair with one specific preposition.")
tf("prepositions", "L.5.1", 3, "In the sentence “Since the meeting ended early, we left,” the word “since” is used as a preposition.", False,
   "Here “since” introduces a clause (“the meeting ended early”), so it works as a conjunction, not a preposition.", "A preposition is followed by a noun phrase; a conjunction here is followed by a whole clause.")
mc("prepositions", "L.5.1", 4, "Which sentence uses “before” as a preposition?",
   "They arrived before the storm.",
   [("They left before the alarm rang.", "“Before” is followed by a clause here, so it works as a conjunction."), ("Before we could leave, it started to rain.", "“Before” introduces a clause here, so it is a conjunction."), ("Before she finished eating, the bell rang.", "“Before” introduces a clause, making it a conjunction.")],
   "In “before the storm,” the word “before” is followed only by a noun, so it is a preposition.", "A preposition is followed by a noun or noun phrase, not a subject-and-verb clause.")
dd("prepositions", "L.5.1", 4, "Choose the preposition: “The residents complained ____ the loud construction noise.”",
   "about", [("of", "The fixed phrase is “complain about,” not “complain of.”"), ("for", "The fixed phrase is “complain about,” not “complain for.”"), ("at", "The fixed phrase is “complain about,” not “complain at.”")],
   "“Complain about” is the correct idiomatic pairing.", "Learn verb-preposition pairs like “complain about” as fixed phrases.")
ms("prepositions", "L.5.1", 4, "Which TWO phrases act as adjectives in this sentence? “The book on the shelf near the window belongs to Hana.”",
   ["on the shelf", "near the window"], [("belongs to Hana", "This phrase tells whom the book belongs to, describing the verb, not the noun “book.”"), ("The book", "This is the subject, not a prepositional phrase.")],
   "Both phrases describe which book is meant, so they act as adjectives.", "A prepositional phrase that describes a noun works like an adjective.")
mc("prepositions", "L.5.1", 5, "Which word shows concession (something unexpected) in this sentence? “Despite the heavy traffic, we reached the airport on time.”",
   "Despite", [("heavy", "This is an adjective."), ("traffic", "This is a noun."), ("reached", "This is a verb.")],
   "“Despite” introduces an unexpected contrast between the traffic and arriving on time.", "“Despite” and “in spite of” both signal an unexpected result.")
err("prepositions", "L.5.1", 5, ["The scientists disagreed", " about of", " the results", " of the trial."], 1, " about",
    "“About” alone is correct; adding “of” after it is unnecessary.", "Double-check prepositions that are often mistakenly doubled, like “about of.”")
dd("prepositions", "L.5.1", 5, "Choose the preposition: “The novel consists ____ three parts.”",
   "of", [("from", "The fixed phrase is “consist of,” not “consist from.”"), ("in", "The fixed phrase is “consist of,” not “consist in.”"), ("with", "The fixed phrase is “consist of,” not “consist with.”")],
   "“Consist of” is the correct idiomatic pairing.", "“Consist of” always introduces the parts that make up a whole.")
mc("prepositions", "L.5.1", 6, "Which phrase tells HOW in this sentence? “The pilot landed the plane with remarkable skill.”",
   "with remarkable skill", [("The pilot landed", "This is the subject and verb."), ("the plane", "This is the object of the verb."), ("remarkable skill", "A phrase must include the preposition “with.”")],
   "“With remarkable skill” describes how the pilot landed the plane.", "A phrase beginning with “with” often describes manner, telling how.")
dd("prepositions", "L.5.1", 6, "Choose the best phrase: “The team finished the project ____ several setbacks.”",
   "in spite of", [("because of", "This would mean the setbacks helped them finish, which reverses the meaning."), ("due to", "This would mean the setbacks caused the success, which reverses the meaning."), ("according to", "This does not show contrast with the setbacks.")],
   "“In spite of” shows the team succeeded despite the setbacks, not because of them.", "“In spite of” signals an unexpected or contrasting result.")
mc("prepositions", "L.5.1", 6, "Which sentence correctly uses “between” rather than “among”?",
   "Share the prize between the two finalists.",
   [("Share the prize among the two finalists.", "“Among” is used for three or more, not exactly two."), ("Share the prize between the three finalists.", "“Between” is normally used for exactly two people."), ("Share the prize betwixt the two finalists.", "“Betwixt” is an old-fashioned word not used in standard writing.")],
   "“Between” is traditionally used for exactly two people or things.", "Between = two; among = three or more.")
mc("prepositions", "L.5.1", 7, "What is the object of the preposition “underneath” in this sentence? “The explorer found the map underneath a stack of ancient scrolls.”",
   "a stack of ancient scrolls", [("the explorer", "This is the subject."), ("the map", "This is the object of the verb “found.”"), ("ancient scrolls", "The full noun phrase, including “a stack of,” is the object.")],
   "The complete noun phrase after “underneath” is its object.", "The object of a preposition can be a whole noun phrase, not just one word.")
err("prepositions", "L.5.1", 7, ["The budget report was reviewed", " by the board", " prior than", " the annual meeting."], 2, " prior to",
    "The fixed phrase is “prior to,” never “prior than.”", "Learn fixed preposition phrases like “prior to” as whole units.")
mc("prepositions", "L.5.1", 7, "In the sentence “Walking through the garden calmed her,” what is the function of “through the garden”?",
   "an adverbial prepositional phrase of place", [("a noun phrase", "It is not acting as the subject or object; it modifies the verb “walking.”"), ("an independent clause", "It has no subject and verb of its own, so it cannot be a clause."), ("a verb phrase", "It contains no verb; it begins with the preposition “through.”")],
   "The phrase tells where the walking happened, modifying the gerund “walking.”", "A prepositional phrase that answers “where” usually works as an adverb.")

# ================================================================== sequence
grade(4)
order("sequence", "RI.4.3", 1, "Put the steps of brushing your teeth in order.",
      ["Wet the toothbrush.", "Put toothpaste on it.", "Brush all your teeth.", "Rinse your mouth with water."],
      "These steps follow the order you actually use a toothbrush.", "Picture yourself doing each step to check the order.")
mc("sequence", "RI.4.3", 1, "Which word signals the FIRST step in a set of directions?",
   "First", [("Then", "This signals a middle step."), ("Finally", "This signals the last step."), ("Next", "This signals a middle step.")],
   "“First” tells the reader where the sequence begins.", "First, next, then and finally are common order words.")
order("sequence", "RI.4.3", 2, "Put the steps of planting a seed in order.",
      ["Dig a small hole in the soil.", "Place the seed in the hole.", "Cover the seed with soil.", "Water the soil gently."],
      "A seed must be placed before it can be covered and watered.", "Think about what a seed needs before it can grow.")
dd("sequence", "RI.4.3", 2, "Choose the word that signals sequence: “____ you finish your homework, you may watch TV.”",
   "After", [("Although", "This signals a contrast, not a sequence."), ("Because", "This signals a reason, not an order of events."), ("Unless", "This signals a condition, not a time order.")],
   "“After” shows that watching TV happens once homework is finished.", "Sequence words like “after” connect two events in time order.")
mc("sequence", "RI.4.3", 3, "Yusuf woke up, brushed his teeth, ate breakfast, and then packed his bag. What did Yusuf do right after brushing his teeth?",
   "He ate breakfast.", [("He packed his bag.", "This happened after eating breakfast."), ("He woke up.", "This happened before brushing his teeth."), ("He left for school.", "This is not mentioned in the sentence.")],
   "The sentence lists breakfast right after brushing teeth.", "Look for order words and the sequence of actions listed.")
tf("sequence", "RI.4.3", 3, "The words “first,” “next,” and “finally” help readers understand the order of events.", True,
   "These words are signal words that show the sequence of a text.", "Look for signal words when a text explains steps or events.")
order("sequence", "RI.4.3", 3, "Put the stages of a butterfly’s life cycle in order.",
      ["Egg", "Caterpillar (larva)", "Chrysalis (pupa)", "Adult butterfly"],
      "A butterfly grows through these stages in this exact order.", "Remember: egg, caterpillar, chrysalis, butterfly.")
mc("sequence", "RI.4.3", 4, "At the recycling center, workers first sort the bottles, then wash them, then crush them, and finally melt them into new plastic. What happens immediately before the bottles are melted?",
   "The bottles are crushed.", [("The bottles are sorted.", "This happens earlier, before washing."), ("The bottles are washed.", "This happens earlier, before crushing."), ("The bottles are shipped.", "This is not mentioned in the passage.")],
   "Crushing is the step listed right before melting.", "Find the step word that comes directly before the one you are asked about.")
dd("sequence", "RI.4.3", 4, "Choose the word that shows the sequence is ending: “We mixed the dough, let it rise, and ____ baked it.”",
   "finally", [("first", "This signals the beginning, not the end."), ("meanwhile", "This signals something happening at the same time."), ("before", "This signals an earlier event, not the end.")],
   "“Finally” shows baking is the last step.", "“Finally” almost always signals the last step in a sequence.")
match("sequence", "RI.4.3", 4, "Match each signal word with how it is used in a sequence.",
      [("First", "to begin a sequence"), ("Next", "to show a middle step"), ("Finally", "to show the last step"), ("Meanwhile", "to show two things happening at the same time")],
      "Each signal word has a specific job in showing order.", "Learn these words as a set: first, next, finally, meanwhile.")
mc("sequence", "RI.4.3", 5, "To make a kite, Noor cut the paper, then attached the sticks, then tied the string, and finally added a tail. What did Noor do immediately before tying the string?",
   "She attached the sticks.", [("She added a tail.", "This happened after tying the string."), ("She cut the paper.", "This happened earlier, before attaching the sticks."), ("She flew the kite.", "This is not mentioned in the passage.")],
   "Attaching the sticks is the step listed right before tying the string.", "Look for the step word directly before the one being asked about.")
order("sequence", "RI.4.3", 5, "Put the steps of checking out a library book in order.",
      ["Find the book on the shelf.", "Bring the book to the front desk.", "Scan the book’s barcode.", "Take the book home."],
      "A reader must find and bring the book before it can be scanned and taken home.", "Picture yourself checking out a real library book.")
mc("sequence", "RI.4.3", 5, "Which sentence uses a time-order transition correctly?",
   "After the rain stopped, the children went outside to play.",
   [("During the rain stopped, the children went outside to play.", "“During” needs a noun, not a full clause like “the rain stopped.”"), ("Finally the rain stopped, the children went outside to play.", "“Finally” usually signals a last step, not a cause for going outside."), ("Then the rain stopped, the children went outside to play.", "“Then” should link two complete sentences with a comma and conjunction, not run them together.")],
   "“After” correctly connects the two clauses in time order.", "Check that the sequence word fits smoothly between the two events.")
mc("sequence", "RI.4.3", 6, "Scientists describe a volcanic eruption like this: pressure builds underground, then magma rises through cracks, then gases escape, and finally lava flows out. According to this sequence, what happens right after magma rises through the cracks?",
   "Gases escape.", [("Lava flows out.", "This is the final step, which comes after the gases escape."), ("Pressure builds underground.", "This is the first step, which happens earlier."), ("The volcano cools down.", "This is not mentioned in the passage.")],
   "Gases escaping is the step listed right after magma rises.", "Trace each listed step one at a time.")
dd("sequence", "RI.4.3", 6, "Choose the best sequence word: “The runner stretched, warmed up, and ____ started the race.”",
   "then", [("meanwhile", "This signals something happening at the same time, not afterward."), ("however", "This signals a contrast, not a sequence."), ("although", "This signals a contrast, not a time order.")],
   "“Then” shows starting the race is the next step after warming up.", "“Then” connects one step to the step that follows it.")
mc("sequence", "RI.4.3", 6, "Why do authors use words like “first,” “next,” and “finally” when explaining a process?",
   "To help readers follow the order in which steps happen.", [("To make the writing longer.", "Signal words add clarity, not unnecessary length."), ("To show cause and effect.", "These words signal time order, not why something happened."), ("To compare two ideas.", "These words show sequence, not comparison.")],
   "Order words make the sequence of steps easy to follow.", "Order words answer the question “when does this happen?”")
mc("sequence", "RI.4.3", 7, "In an experiment, students measured the water’s temperature, heated it for five minutes, measured the temperature again, and then recorded the change. Which step happens immediately before the students record the change?",
   "They take the second temperature reading.", [("They take the first temperature reading.", "This happens much earlier, before heating."), ("They heat the water.", "This happens before the second measurement, not immediately before recording."), ("They write the lab report.", "This is not mentioned in the passage.")],
   "Recording the change comes right after the second measurement.", "Find the step listed right before the one in the question.")
order("sequence", "RI.4.3", 7, "Put the steps of the water cycle in order, starting with evaporation.",
      ["Water evaporates from oceans and lakes.", "Water vapor cools and condenses into clouds.", "Water falls back to Earth as precipitation.", "Water collects in rivers, lakes, and oceans again."],
      "Each stage of the water cycle leads naturally into the next.", "Remember: evaporate, condense, precipitate, collect.")
mc("sequence", "RI.4.3", 7, "A recipe says: “Cream the butter and sugar. Next, beat in the eggs. Then fold in the flour. Finally, bake for 20 minutes.” If a baker skipped straight from beating in the eggs to baking, what would most likely happen?",
   "The flour would never be mixed into the batter.", [("The eggs would not be fresh.", "Skipping a step does not change how fresh the eggs are."), ("The sugar would dissolve too quickly.", "This is unrelated to skipping the flour step."), ("The oven would not heat properly.", "Skipping a mixing step does not affect the oven.")],
   "Skipping the “fold in the flour” step means the flour is left out of the batter entirely.", "Follow each step in order, or an ingredient may be left out.")

grade(5)
order("sequence", "RI.5.3", 1, "Put the steps of making tea in order.",
      ["Boil the water.", "Place a tea bag in a cup.", "Pour the hot water over the tea bag.", "Let it steep for three minutes."],
      "Each step depends on the one before it to make the tea properly.", "Picture yourself making a real cup of tea.")
mc("sequence", "RI.5.3", 1, "Which word signals that an event happened BEFORE another event?",
   "Previously", [("Afterward", "This signals an event happening later."), ("Finally", "This signals the last event in a series."), ("Later", "This signals an event happening after another.")],
   "“Previously” points back to an earlier time.", "Look for words that point backward in time, like “previously” and “earlier.”")
order("sequence", "RI.5.3", 2, "Put the stages of the rock cycle in order, starting with magma.",
      ["Magma cools and forms igneous rock.", "Weathering breaks the rock into sediment.", "Sediment is compressed into sedimentary rock.", "Heat and pressure change it into metamorphic rock."],
      "Each type of rock forms from the stage before it in this cycle.", "The rock cycle moves from melted rock to solid rock to changed rock.")
dd("sequence", "RI.5.3", 2, "Choose the word that shows sequence: “____ the bread dough rises, bakers shape it into loaves.”",
   "Once", [("Although", "This signals contrast, not sequence."), ("Unless", "This signals a condition, not a time order."), ("Because", "This signals a reason, not a sequence.")],
   "“Once” shows shaping the loaves happens right after the dough rises.", "“Once” signals that one event is complete before the next begins.")
mc("sequence", "RI.5.3", 3, "During a cold front, warm air is first pushed upward, then it cools and condenses, and finally rain falls. What happens immediately after the warm air cools and condenses?",
   "Rain falls.", [("The warm air is pushed upward.", "This is the earlier step, before cooling and condensing."), ("The front dissipates.", "This is not mentioned in the passage."), ("The sky clears.", "This is not mentioned in the passage.")],
   "Rain falling is the final step, listed right after condensation.", "Trace each step of the weather process in order.")
tf("sequence", "RI.5.3", 3, "A flowchart that uses arrows between steps is a tool for showing sequence.", True,
   "Arrows in a flowchart show the order that steps happen in.", "Flowcharts, timelines and numbered lists are all common ways to show sequence.")
order("sequence", "RI.5.3", 3, "Put the steps of the body’s immune response to a cold virus in order.",
      ["The virus enters the body.", "White blood cells detect the virus.", "Antibodies are produced to fight it.", "The body recovers as the virus is destroyed."],
      "The immune system responds in these stages, one leading to the next.", "Think about what the body must do before it can recover.")
mc("sequence", "RI.5.3", 4, "A factory assembles bicycles by first welding the frame, then painting it, then attaching the wheels, and finally adding the seat. What must happen immediately before the wheels can be attached?",
   "The frame must be painted.", [("The seat must be added.", "This happens later, after the wheels."), ("The bicycle must be tested.", "This is not mentioned in the passage."), ("The frame must be welded.", "This happens earlier, before painting, not immediately before the wheels.")],
   "Painting is the step listed right before attaching the wheels.", "Find the step directly before the one named in the question.")
dd("sequence", "RI.5.3", 4, "Choose the sequence word: “The committee reviewed the proposal and ____ voted on it.”",
   "subsequently", [("previously", "This points backward, but voting happens after reviewing."), ("meanwhile", "This signals two things happening at once."), ("nevertheless", "This signals contrast, not sequence.")],
   "“Subsequently” shows voting happened after the review.", "“Subsequently” means “afterward” and signals the next step.")
match("sequence", "RI.5.3", 4, "Match each sequence word with its meaning.",
      [("Initially", "the very first step"), ("Subsequently", "a step that follows another"), ("Simultaneously", "two steps happening at once"), ("Ultimately", "the final outcome")],
      "Each of these formal transition words plays a different role in a sequence.", "Learn these academic sequence words as a set.")
mc("sequence", "RI.5.3", 5, "In photosynthesis, a plant first absorbs sunlight, then combines it with water and carbon dioxide, and finally produces glucose and oxygen. What happens immediately before the plant produces glucose and oxygen?",
   "It combines sunlight with water and carbon dioxide.", [("It absorbs sunlight.", "This is an earlier step, before combining."), ("It releases carbon dioxide.", "The plant absorbs carbon dioxide; it does not release it in this process."), ("It stores glucose in its roots.", "This is not mentioned in the passage.")],
   "Combining sunlight with water and carbon dioxide is the step right before producing glucose and oxygen.", "Trace each listed step of a science process in order.")
order("sequence", "RI.5.3", 5, "Put the steps of how a classroom bill becomes a class rule in order.",
      ["A student proposes a new rule.", "The class discusses the proposal.", "The class votes on the rule.", "The teacher records the approved rule."],
      "Each step must happen before the class can move to the next.", "Think about how a group makes a decision together.")
mc("sequence", "RI.5.3", 5, "Which transition word signals that two events are happening at the same time?",
   "Meanwhile", [("Afterward", "This signals an event happening later."), ("Eventually", "This signals something happening after a long time."), ("Subsequently", "This signals an event happening right after another.")],
   "“Meanwhile” connects two events happening at once.", "“Meanwhile” and “at the same time” both signal simultaneous events.")
mc("sequence", "RI.5.3", 6, "A geologist explains that a canyon forms as a river first cuts into soft rock, then widens over centuries, and eventually exposes layers of ancient rock. What must happen before the canyon widens?",
   "The river must cut into the soft rock.", [("The layers must be exposed.", "This is the final step, which happens after widening."), ("The rock must erode completely.", "This is not mentioned as a separate step."), ("The river must dry up.", "This is not mentioned in the passage.")],
   "Cutting into the rock is the first step, which must happen before widening.", "Identify which step the text lists first.")
dd("sequence", "RI.5.3", 6, "Choose the best word: “The engineers tested the bridge design, found a flaw, and ____ revised the blueprint.”",
   "consequently", [("previously", "This points backward in time, not forward to the next step."), ("meanwhile", "This signals something happening at the same time."), ("nonetheless", "This signals contrast, not sequence.")],
   "“Consequently” shows revising the blueprint happened as the next step after finding the flaw.", "“Consequently” links one step to the result that follows it.")
mc("sequence", "RI.5.3", 6, "Why might a historian arrange events in a timeline rather than a simple list?",
   "A timeline shows how much time passed between events, not just their order.", [("A timeline is shorter to read.", "A timeline is not necessarily shorter than a list."), ("A timeline removes the need for dates.", "A timeline actually depends on dates."), ("A timeline hides unimportant events.", "A timeline organizes events; it does not hide them.")],
   "A timeline uses spacing or marks to show the gap in time between events.", "A timeline adds information about duration that a plain list does not show.")
mc("sequence", "RI.5.3", 7, "A city’s water treatment plant removes large debris, then adds chemicals to clear small particles, then filters the water through sand, and finally disinfects it before it reaches homes. Which step happens immediately before disinfection?",
   "The water is filtered through sand.", [("Large debris is removed.", "This is an earlier step, before the chemicals are added."), ("Chemicals are added.", "This happens before filtering, not immediately before disinfection."), ("The water reaches homes.", "This happens after disinfection.")],
   "Filtering through sand is the step listed right before disinfection.", "Find the step that comes directly before the one in the question.")
order("sequence", "RI.5.3", 7, "Put the stages of a hurricane’s formation in order.",
      ["Warm ocean water evaporates and rises.", "The rising air forms storm clouds and begins to rotate.", "The rotating system organizes into a tropical storm.", "Sustained winds reach hurricane strength."],
      "Each stage of hurricane formation builds on the stage before it.", "A hurricane grows stronger through these stages over time.")
mc("sequence", "RI.5.3", 7, "A manual for assembling a desk lists six numbered steps. If a reader skips step 4 (attaching the support brackets) and moves to step 5 (attaching the tabletop), what is the most likely result?",
   "The tabletop will be unstable because it has no support.", [("The desk will be too heavy to move.", "Skipping a step does not change the desk’s weight."), ("The screws will not fit the brackets.", "This is not a logical result of skipping the step."), ("The assembly will take less time overall.", "Skipping a needed step does not actually speed up the process correctly.")],
   "Without the support brackets, the tabletop has nothing holding it steady.", "Skipping a numbered step usually causes a problem in a later step.")

# ================================================================== idioms-adages
grade(4)
mc("idioms-adages", "L.4.5.b", 1, "At the new school, Layla told a joke to break the ice with her classmates. What does “break the ice” mean?",
   "To make people feel more comfortable by starting a friendly conversation.", [("To literally break a block of ice.", "The sentence is not about real ice."), ("To end a friendship suddenly.", "This is the opposite of the idiom’s meaning."), ("To interrupt someone rudely.", "The idiom describes a friendly action, not a rude one.")],
   "“Break the ice” describes easing tension in a new or awkward social situation.", "Picture a frozen lake: breaking the ice lets people move more freely.")
mc("idioms-adages", "L.4.5.b", 2, "Omar spent the whole weekend hitting the books before his science test. What does “hit the books” mean?",
   "To study hard.", [("To throw books around.", "The idiom is not about physical books being thrown."), ("To return library books.", "The sentence is about studying, not returning items."), ("To write a book report.", "The idiom means to study, not to write about a book.")],
   "“Hit the books” is a common way to describe studying intensely.", "Think of “hitting” something as working hard at it.")
mc("idioms-adages", "L.4.5.b", 2, "The new sports car cost Uncle Samir an arm and a leg. What does this idiom mean?",
   "It was extremely expensive.", [("It caused him an injury.", "The idiom is not about a real injury."), ("It was missing some parts.", "The idiom describes cost, not missing parts."), ("It was a gift from a friend.", "The sentence says it “cost” him something, meaning he paid for it.")],
   "“Cost an arm and a leg” describes something with a very high price.", "Imagine a price so high it feels like you’re giving up a body part.")
mc("idioms-adages", "L.4.5.b", 3, "The coach told the team to bite the bullet and finish the tough practice. What does “bite the bullet” mean?",
   "To face something difficult with courage.", [("To eat something hard.", "The idiom is not about actually eating anything."), ("To give up on a task.", "This is the opposite of the idiom’s meaning."), ("To argue with the coach.", "The idiom is about enduring hardship, not arguing.")],
   "“Bite the bullet” means to bravely accept a difficult or unpleasant situation.", "Think of soldiers in the past enduring pain without complaining.")
mc("idioms-adages", "L.4.5.b", 3, "Hana’s teacher said, “A picture is worth a thousand words,” before showing a diagram. What does this adage mean?",
   "An image can explain something more clearly than a long description.", [("Pictures are more valuable than books.", "The adage compares clarity, not overall value."), ("Students should draw instead of writing.", "The adage is about understanding, not replacing all writing."), ("A picture always has exactly 1,000 details.", "The number is not meant literally.")],
   "This adage means a visual can communicate an idea very clearly and quickly.", "Think about how a diagram can explain something faster than paragraphs of text.")
mc("idioms-adages", "L.4.5.b", 4, "Don’t judge a book by its cover, Mariam’s mother reminded her about the shy new student. What does this adage mean?",
   "Don’t form an opinion about someone based only on their appearance.", [("Always read the summary before buying a book.", "The adage is about judging people, not buying books."), ("Covers of books are not important.", "The adage uses the cover as a comparison, not as the real subject."), ("Shy people are usually unfriendly.", "This contradicts the adage’s actual meaning.")],
   "The adage warns against judging someone before really knowing them.", "The “cover” stands for appearance; the “book” stands for a person’s true character.")
mc("idioms-adages", "L.4.5.b", 4, "Rami kept missing free throws, but his coach said, “Practice makes perfect.” What does this adage mean?",
   "Repeating an action helps you improve at it.", [("Nobody can ever become perfect.", "This contradicts the adage’s encouraging message."), ("Practicing once is enough to succeed.", "The adage emphasizes repeated practice, not a single try."), ("Perfect players never need practice.", "This is the opposite of the adage’s point.")],
   "The adage encourages steady practice as the path to improvement.", "Think of “makes perfect” as a result that comes from repeated effort.")
mc("idioms-adages", "L.4.5.b", 5, "Two heads are better than one, said the teacher as she paired students for the science project. What does this mean?",
   "Working together often produces better results than working alone.", [("Two people always finish faster than one.", "The adage is about the quality of ideas, not only speed."), ("Group projects are always easier.", "The adage does not claim group work is easier, only that it can be better."), ("Having two ideas is better than having one plan.", "The adage is about people collaborating, not simply counting ideas.")],
   "The adage suggests that combining different people’s thinking leads to better solutions.", "Think about how two people can catch mistakes that one person might miss.")
mc("idioms-adages", "L.4.5.b", 5, "Slow and steady wins the race, Grandfather told Yusuf as he rushed through his homework. What does this adage mean?",
   "Careful, consistent effort succeeds more than rushing.", [("Running slowly will win any race.", "The adage is not about actual racing speed."), ("It is always better to be last.", "The adage values steady effort, not finishing last on purpose."), ("Homework should be done quickly.", "This is the opposite of the adage’s message.")],
   "The adage teaches that patience and consistency lead to success.", "Think of the story of the tortoise and the hare.")
mc("idioms-adages", "L.4.5.b", 6, "Better late than never, Dina’s sister said after Dina finally returned the borrowed book. What does this adage mean?",
   "It is better to do something late than to never do it at all.", [("Being late is always acceptable.", "The adage does not excuse lateness; it simply values finishing over giving up."), ("It is better to never do something than to be late.", "This reverses the adage’s meaning."), ("Lateness should never be forgiven.", "This contradicts the adage’s forgiving tone.")],
   "The adage encourages finishing a task even if it takes longer than planned.", "Focus on the contrast between “late” and “never” in the phrase.")
mc("idioms-adages", "L.4.5.b", 6, "Honesty is the best policy, the shop owner told his new employee. What does this adage teach?",
   "Telling the truth is always the wisest choice.", [("Policies are more important than honesty.", "The adage values honesty itself, not rules in general."), ("Honesty only matters in business.", "The adage applies broadly, not just to business."), ("Lying is sometimes the smartest choice.", "This is the opposite of the adage’s message.")],
   "The adage recommends choosing honesty over deception in every situation.", "The word “policy” here means a guiding rule for how to behave.")

grade(5)
mc("idioms-adages", "L.5.5.b", 1, "Khalid let the cat out of the bag about the surprise party. What does this idiom mean?",
   "He accidentally revealed a secret.", [("He released a pet from a bag.", "The idiom does not describe a real cat or bag."), ("He found a hidden cat.", "The idiom is about secrets, not about finding an animal."), ("He planned the party in secret.", "The idiom describes exposing a secret, not keeping one.")],
   "“Let the cat out of the bag” means to reveal information that was meant to be hidden.", "Imagine a secret trying to stay hidden, like a cat trying to stay in a closed bag.")
mc("idioms-adages", "L.5.5.b", 2, "Grandma visits the coast once in a blue moon. What does this idiom mean?",
   "Very rarely.", [("Every month when the moon is full.", "The idiom does not refer to the actual lunar calendar."), ("Only during the winter season.", "The idiom does not specify a season."), ("Whenever she wants, frequently.", "This is the opposite of what the idiom means.")],
   "“Once in a blue moon” describes something that happens very infrequently.", "A blue moon is a rare event, so the idiom means “rarely.”")
mc("idioms-adages", "L.5.5.b", 2, "Nadia burned the midnight oil to finish her science fair project. What does this mean?",
   "She worked very late into the night.", [("She wasted lamp oil.", "The idiom is not about literal oil or lamps."), ("She stayed up to watch the stars.", "The idiom is about working, not stargazing."), ("She finished her project quickly in the morning.", "The idiom refers to working at night, not the morning.")],
   "“Burn the midnight oil” comes from the days when people used oil lamps to work late at night.", "Think of someone working by lamplight long after everyone else is asleep.")
mc("idioms-adages", "L.5.5.b", 3, "When visiting his cousins in another city, Tariq followed their customs, remembering, “When in Rome, do as the Romans do.” What does this adage mean?",
   "Follow the customs of the place you are visiting.", [("Always visit Rome when traveling.", "The adage is not really about the city of Rome."), ("Ignore local customs when you travel.", "This is the opposite of the adage’s meaning."), ("Only Romans should follow Roman customs.", "The adage applies to any visitor, not only Romans.")],
   "The adage advises adapting your behavior to match the customs of a new place.", "Rome is used as an example of “wherever you are visiting.”")
mc("idioms-adages", "L.5.5.b", 3, "Sara always thinks her friend’s neighborhood is nicer than her own, even though it isn’t. Her father says, “The grass is always greener on the other side.” What does this mean?",
   "Other people’s situations often seem better than they really are.", [("Grass grows faster in other neighborhoods.", "The adage is not about real grass growing."), ("It is always better to move to a new place.", "The adage warns against this kind of thinking, not encourages it."), ("Comparing neighborhoods is a waste of time.", "The adage is specifically about envy, not comparisons in general.")],
   "The adage warns that what others have can seem more appealing than it truly is.", "Think about how a neighbor’s lawn can look greener simply because it is unfamiliar.")
mc("idioms-adages", "L.5.5.b", 4, "A watched pot never boils, Mama told Fadi as he stared at the stove waiting for dinner. What does this adage mean?",
   "Time seems to pass more slowly when you are anxiously waiting for something.", [("Pots boil faster if no one watches them.", "The adage is about perception of time, not actual boiling speed."), ("You should never watch food while it cooks.", "The adage is not literal cooking advice."), ("Waiting always makes food taste better.", "The adage has nothing to do with taste.")],
   "The adage describes how impatiently waiting can make time feel like it drags on.", "Notice how minutes feel longer when you are staring at a clock.")
mc("idioms-adages", "L.5.5.b", 4, "The repair request was ignored until Huda called the office every day, and then it was fixed quickly. This shows that “the squeaky wheel gets the grease.” What does this adage mean?",
   "A problem that is complained about often gets attention first.", [("Squeaky machines break down faster.", "The adage is not about how machines actually work."), ("Quiet complaints are always more effective.", "This is the opposite of the adage’s meaning."), ("Grease fixes every mechanical problem.", "The adage is not literal mechanical advice.")],
   "The adage compares persistent complaining to a wheel that squeaks until it is oiled.", "Think about which wheel on a cart gets fixed first: the noisy one.")
mc("idioms-adages", "L.5.5.b", 5, "By studying during her bus ride, Lina killed two birds with one stone. What does this idiom mean?",
   "She accomplished two tasks with a single action.", [("She harmed two animals by accident.", "The idiom is not about actual birds."), ("She solved a problem using violence.", "The idiom describes efficiency, not any real harm."), ("She finished one task twice as fast.", "The idiom is about doing two tasks at once, not one task twice.")],
   "“Kill two birds with one stone” means to achieve two goals through one effort.", "Think of studying during travel time: two tasks done in the time for one.")
mc("idioms-adages", "L.5.5.b", 5, "Ali is a talented artist, just like his mother was. People say, “The apple doesn’t fall far from the tree.” What does this adage mean?",
   "Children often resemble their parents in abilities or character.", [("Apples and trees grow in similar places.", "The adage uses apples and trees only as a comparison, not as real advice about fruit."), ("Children should always follow their parents’ careers.", "The adage describes similarity, not an obligation."), ("Trees produce fruit that looks exactly alike.", "The adage is not about botany; it is about family resemblance.")],
   "The adage compares a child’s traits to those of a parent, since apples fall near the tree that grew them.", "Think of the apple as the child and the tree as the parent.")
mc("idioms-adages", "L.5.5.b", 6, "Before the interview, Mariam’s coach told her to put her best foot forward. What does this idiom mean?",
   "To make the best possible impression.", [("To take a careful first step.", "The idiom is not literal walking advice."), ("To wear your favorite shoes.", "The idiom has nothing to do with footwear."), ("To walk more slowly than usual.", "The idiom is about impressions, not walking speed.")],
   "“Put your best foot forward” means to present yourself as well as you can.", "Think of starting any task by showing your strongest effort first.")
mc("idioms-adages", "L.5.5.b", 6, "The old disagreement between the two neighbors was forgotten, so Omar’s father advised him to let sleeping dogs lie. What does this idiom mean?",
   "Avoid bringing up an old problem that could cause new trouble.", [("Let pets sleep without disturbing them.", "The idiom is not about real dogs sleeping."), ("Always resolve disagreements immediately.", "This is the opposite of the idiom’s advice."), ("Dogs should not be kept as pets.", "The idiom has nothing to do with pet ownership.")],
   "The idiom warns that reopening a settled issue could cause unnecessary conflict.", "Picture a sleeping dog: waking it on purpose could be risky.")

grade(6)
mc("idioms-adages", "L.6.5.b", 2, "After losing the game, the team found hope when a sponsor offered to fund new equipment. “Every cloud has a silver lining,” said the coach. What does this adage mean?",
   "Something good can be found even in a difficult situation.", [("Clouds always contain silver linings literally.", "The adage is not about real clouds."), ("Bad situations never improve.", "This is the opposite of the adage’s message."), ("Sponsors always help losing teams.", "This is too narrow; the adage is a general statement about hope.")],
   "The adage reminds us that even hard times can lead to something positive.", "Picture sunlight breaking through the edge of a dark cloud.")
mc("idioms-adages", "L.6.5.b", 2, "Despite being warned, Yusuf opened the mysterious package and got a bit of a scare. “Curiosity killed the cat,” his sister teased. What does this adage mean?",
   "Being too curious can lead you into trouble.", [("Cats are naturally very curious animals.", "The adage uses the cat only as a symbol for curious people."), ("It is dangerous to own a cat.", "The adage is not literal advice about pets."), ("Curiosity is always a bad quality.", "The adage warns about risky curiosity, not curiosity in general.")],
   "The adage warns that excessive curiosity can sometimes bring danger or trouble.", "Think of the cat as a stand-in for anyone who investigates something risky.")
mc("idioms-adages", "L.6.5.b", 3, "The librarian fixed the small tear in the book cover right away, saying, “A stitch in time saves nine.” What does this adage mean?",
   "Fixing a small problem quickly prevents it from becoming a bigger one.", [("Sewing is faster than other repairs.", "The adage is not really about sewing techniques."), ("Nine stitches are always required for repairs.", "The number is symbolic, not a literal count."), ("It’s better to wait before fixing anything.", "This is the opposite of the adage’s advice.")],
   "The adage means that one quick repair now can prevent many repairs later.", "Picture a small tear that, if ignored, would need far more stitches to fix later.")
mc("idioms-adages", "L.6.5.b", 4, "After spilling his juice, Ahmed kept complaining instead of cleaning it up. His mother said, “Don’t cry over spilled milk.” What does this adage mean?",
   "Don’t waste time being upset about something that can’t be undone.", [("Milk should never be spilled.", "The adage is not literal advice about handling milk."), ("Crying is the correct response to small accidents.", "This is the opposite of the adage’s message."), ("You should always clean up before complaining.", "The adage is about letting go of regret, not about cleaning order.")],
   "The adage advises moving past a mistake that has already happened rather than dwelling on it.", "Think about why crying over milk that is already spilled changes nothing.")
mc("idioms-adages", "L.6.5.b", 4, "The detective questioned the shopkeeper for hours, but the real thief was the delivery driver. The detective was barking up the wrong tree. What does this idiom mean?",
   "Pursuing a mistaken idea or the wrong course of action.", [("Making a loud noise on purpose.", "The idiom is not about actual barking."), ("Climbing a tree to search for clues.", "The idiom is not literal about trees."), ("Accusing someone correctly.", "This is the opposite of the idiom’s meaning.")],
   "The idiom compares a mistaken suspicion to a dog barking at the wrong tree while chasing something.", "Think of a dog chasing prey up the wrong tree entirely.")
mc("idioms-adages", "L.6.5.b", 5, "Even though the team lost the semifinal, their coach told them to keep their chin up. What does this idiom mean?",
   "Stay positive and don’t become discouraged.", [("Hold your head high to look taller.", "The idiom is about attitude, not literal posture."), ("Avoid looking down while walking.", "The idiom has nothing to do with walking safely."), ("Ignore the loss completely.", "The idiom encourages staying positive, not pretending nothing happened.")],
   "The idiom encourages someone to remain hopeful after a setback.", "Picture someone lifting their chin instead of hanging their head in disappointment.")
mc("idioms-adages", "L.6.5.b", 5, "Even after apologizing, the dishonest merchant tried the same trick again the next week, proving that a leopard can’t change its spots. What does this adage mean?",
   "People’s basic character or habits rarely change.", [("Leopards cannot be trained at all.", "The adage is not literal zoology; it is about human character."), ("Apologies are always insincere.", "The adage describes a pattern, not every apology."), ("Spots on animals change with age.", "The adage relies on the fact that leopard spots do NOT change.")],
   "The adage compares a person’s unchanging habits to a leopard’s permanent spots.", "Think about why the leopard’s spots are a good symbol for something that stays the same.")
mc("idioms-adages", "L.6.5.b", 6, "Before announcing the winner, the host said, “Hold your horses,” to the excited crowd. What does this idiom mean?",
   "Wait patiently; don’t rush.", [("Take care of horses properly.", "The idiom is not about real horses."), ("Ride a horse to the stage.", "The idiom has nothing to do with riding."), ("Stop watching the show.", "This is the opposite of what the host intended.")],
   "The idiom tells people to be patient and avoid acting too quickly.", "Think about pulling back on a horse’s reins to slow it down.")
mc("idioms-adages", "L.6.5.b", 6, "Instead of stopping at the nearest shelter, the volunteers went the extra mile and drove two more hours to deliver supplies. What does this idiom mean?",
   "To make a greater effort than is expected.", [("To drive exactly one more mile than planned.", "The idiom is not a literal measurement of distance."), ("To take the shortest possible route.", "This is the opposite of the idiom’s meaning."), ("To complete the minimum required work.", "This is the opposite of making extra effort.")],
   "The idiom describes doing more than what is required or expected.", "Think of a mile as a symbol for any extra effort, not an exact distance.")
mc("idioms-adages", "L.6.5.b", 7, "The students who loved chess, puzzles, and coding naturally became close friends, since birds of a feather flock together. What does this adage mean?",
   "People with similar interests or qualities tend to group together.", [("Birds and people behave in the same way.", "The adage uses birds only as a comparison, not a literal claim about behavior."), ("Only birds benefit from staying in groups.", "The adage is really about people, not literal birds."), ("People with different interests always become friends.", "This is the opposite of the adage’s meaning.")],
   "The adage compares people who share interests to birds of the same species that stay together.", "Think about how birds of the same kind naturally travel in the same flock.")

# ================================================================== summarize
grade(4)
tf("summarize", "RI.4.2", 1, "A summary should include every single detail from the text.", False,
   "A summary only includes the most important ideas, not every detail.", "Summaries are short word sketches, not full copies of the text.")
mc("summarize", "RI.4.2", 2, "Read: “Bees collect nectar from flowers. They carry the nectar back to the hive. Inside the hive, bees turn the nectar into honey. Other bees store the honey in wax cells.” Which sentence BEST summarizes this passage?",
   "Bees collect nectar and turn it into honey to store in their hive.", [("Bees only eat flowers.", "This is not stated in the passage."), ("Wax cells are the most interesting part of a hive.", "This is a minor detail, not the main idea."), ("Bees never leave the hive.", "This contradicts the passage, since bees collect nectar outside the hive.")],
   "This sentence captures the whole process described, from collecting nectar to making honey.", "A good summary covers the main steps, not just one small detail.")
mc("summarize", "RI.4.2", 2, "Read: “Mariam’s class visited a farm. They fed the goats, watched a cow being milked, and collected eggs from the hens. Mariam said it was the best day ever.” Which detail is LEAST important to include in a summary?",
   "Mariam said it was the best day ever.", [("They fed the goats.", "This is one of the main activities on the trip."), ("They collected eggs from the hens.", "This is one of the main activities on the trip."), ("They watched a cow being milked.", "This is one of the main activities on the trip.")],
   "Mariam’s personal feeling is a small detail, not one of the main farm activities.", "Focus a summary on the main events, not on personal reactions.")
order("summarize", "RI.4.2", 3, "Put these sentences in order to summarize this passage: “First, Sami gathered old newspapers and glue. Next, he shaped the papier-mâché over a balloon. Then he let it dry overnight. Finally, he painted it bright colors.”",
      ["Sami gathered newspapers and glue.", "He shaped the papier-mâché over a balloon.", "He let it dry overnight.", "He painted it bright colors."],
      "A summary of a process should keep the steps in the same order as the original text.", "Reread the passage and note the order signal words.")
mc("summarize", "RI.4.2", 3, "Read: “A camel can go for many days without drinking water. Its hump stores fat, not water, which the camel’s body can use for energy. Camels also have thick eyelashes that protect their eyes from sand.” Which is the BEST summary?",
   "Camels survive the desert because their bodies are specially adapted, like humps for energy and eyelashes for protection.", [("Camels store water in their humps.", "The passage says the hump stores fat, not water."), ("Camels never need to eat.", "This is not stated in the passage."), ("Desert sand is dangerous for camels’ eyes.", "This covers only one detail, missing the passage’s main idea.")],
   "This summary combines both adaptations described in the passage into one main idea.", "A strong summary pulls together the key points, not just one detail.")
mc("summarize", "RI.4.2", 4, "Read: “Volunteers cleaned the beach for three hours. They collected plastic bottles, old fishing nets, and bits of broken glass. By the end of the day, they had filled twenty bags with trash.” Which sentence is the BEST summary?",
   "Volunteers spent three hours cleaning trash from the beach and filled twenty bags.", [("Fishing nets are dangerous to sea animals.", "This is true but is not stated or the main point of this passage."), ("The beach was completely clean by noon.", "This detail is not stated in the passage."), ("Volunteers enjoyed finding glass on the beach.", "Enjoyment is not mentioned, and finding glass is not the main idea.")],
   "This sentence captures the main activity and its result from the whole passage.", "Combine the main action and its outcome into one summary sentence.")
tf("summarize", "RI.4.2", 4, "A good summary is usually shorter than the original text.", True,
   "A summary condenses the main ideas, so it is naturally shorter than the full text.", "If your summary is as long as the original, you probably included too many details.")
mc("summarize", "RI.4.2", 5, "Read: “Rania’s robot kit came with wheels, a small motor, and wires. She first attached the wheels to the base, then connected the motor, and finally wired it to a battery. When she turned it on, the robot rolled across the table.” Which detail should be LEFT OUT of a summary?",
   "The kit came with wires.", [("She attached the wheels to the base.", "This is a key step in building the robot."), ("She connected the motor.", "This is a key step in building the robot."), ("The robot rolled across the table.", "This is the key result of the whole process.")],
   "Listing the wires separately is less important than the main building steps and the result.", "Keep the steps and the outcome; drop minor supply details.")
mc("summarize", "RI.4.2", 5, "A student summarized a passage about solar panels by writing only: “Solar panels are good.” What is the main problem with this summary?",
   "It leaves out the important facts and details explained in the passage.", [("It is too long.", "The summary is actually far too short, not too long."), ("It uses too many quotes from the text.", "The summary does not use any quotes at all."), ("It focuses only on unimportant details.", "The summary has no details at all, important or not.")],
   "A summary must still capture the key information, not just a vague opinion.", "A one-sentence opinion is not enough; include the main facts too.")
mc("summarize", "RI.4.2", 6, "Read: “Coral reefs are home to thousands of species of fish. They form when tiny coral animals called polyps build hard skeletons over many years. Reefs also protect coastlines by slowing down powerful waves.” Which sentence BEST summarizes the whole passage?",
   "Coral reefs, built slowly by polyps, support ocean life and protect coastlines.", [("Coral polyps are a type of fish.", "The passage describes polyps as tiny coral animals, not fish."), ("Reefs form in just a few days.", "The passage says reefs form over many years, not days."), ("Waves are the biggest danger to coral reefs.", "This is not stated in the passage; reefs actually protect against waves.")],
   "This sentence combines all three main ideas: habitat, formation, and protection.", "Look for a summary sentence that touches every main idea, not just one.")
mc("summarize", "RI.4.2", 6, "Why should a summary avoid including the reader’s own opinion?",
   "A summary should objectively restate the author’s main ideas, not personal feelings.", [("Opinions always make summaries longer.", "Length is not the real reason opinions are avoided."), ("Only teachers are allowed to have opinions.", "This is not a real rule about summaries."), ("Opinions are impossible to include in writing.", "Opinions can certainly be written; they just don’t belong in an objective summary.")],
   "A summary should reflect the text itself, not the reader’s personal reaction to it.", "Save your opinions for a response or review, not a summary.")

grade(5)
tf("summarize", "RI.5.2", 1, "A summary restates the main ideas of a text in your own words.", True,
   "Summarizing means putting the key ideas into your own words, not copying the text.", "If your summary matches the text word for word, you are copying, not summarizing.")
mc("summarize", "RI.5.2", 2, "Read: “Lighthouses once used oil lamps and mirrors to create a strong beam of light. Keepers had to climb many stairs to refuel the lamp every few hours. Today, most lighthouses use automatic electric lights that need little maintenance.” Which is the BEST summary?",
   "Lighthouses have changed from oil lamps that needed constant care to automatic electric lights.", [("Lighthouse keepers enjoyed climbing stairs.", "This is not stated, and enjoyment is not mentioned at all."), ("All lighthouses have been torn down.", "This is not stated in the passage."), ("Electric lights are the only ones ever used.", "This contradicts the passage, which says lighthouses once used oil lamps.")],
   "This summary captures the contrast between past oil lamps and present electric lights.", "A summary of change over time should mention both the past and the present.")
mc("summarize", "RI.5.2", 2, "Read: “Volcanoes form where melted rock, called magma, rises through cracks in the Earth’s crust. Over time, pressure builds until the magma erupts as lava. Some volcanoes are found underwater and create new islands when they erupt repeatedly.” Which detail is LEAST essential to a summary?",
   "Some volcanoes are found underwater.", [("Magma rises through cracks in the crust.", "This explains the basic cause of volcano formation, so it is essential."), ("Pressure builds until it erupts.", "This explains a key part of the eruption process, so it is essential."), ("Eruptions release lava.", "This describes the main result of the process, so it is essential.")],
   "The detail about underwater volcanoes is an interesting extra fact, not part of the basic formation process.", "Keep the core cause-and-effect steps; leave out extra examples.")
order("summarize", "RI.5.2", 3, "Put these sentences in order to summarize this passage: “Workers first mix cement, sand, and water to make concrete. Next, they pour it into wooden molds. Then they let it cure for several days. Finally, they remove the molds to reveal the hardened shape.”",
      ["Workers mix cement, sand, and water.", "They pour the concrete into molds.", "They let it cure for several days.", "They remove the molds."],
      "A summary of a process should follow the same step order as the original passage.", "Look for the order words first, next, then and finally to guide the sequence.")
mc("summarize", "RI.5.2", 3, "Read: “Monarch butterflies travel thousands of kilometers every year to escape the cold winter. They fly from North America to warmer forests in Mexico. In spring, their offspring make the journey back north.” Which sentence BEST captures the main idea?",
   "Monarch butterflies migrate long distances between North America and Mexico to avoid winter.", [("Monarch butterflies cannot survive in Mexico.", "This contradicts the passage, which says they fly there to survive winter."), ("Butterflies only migrate in the spring.", "The passage describes migration in both directions, not only in spring."), ("Monarch offspring never travel at all.", "This contradicts the passage, which says offspring make the return journey.")],
   "This sentence captures both the direction and the reason for the monarchs’ migration.", "A strong summary combines the “what” and the “why” of the main event.")
mc("summarize", "RI.5.2", 4, "Read: “To purify water in an emergency, people can boil it for one minute to kill germs, or add purification tablets to clean it. Bottled water bought from a store is already safe to drink without extra steps.” Which detail is LEAST necessary for a summary of the purification methods?",
   "Bottled water from a store is already safe.", [("Boiling water for one minute kills germs.", "This is one of the two main purification methods described, so it belongs in the summary."), ("Purification tablets can also clean water.", "This is the second main method described, so it belongs in the summary.")],
   "Since this item only summarizes the purification methods, the fact about store-bought water is not one of those methods.", "Match the summary to exactly what the question is asking you to summarize.")
tf("summarize", "RI.5.2", 4, "When summarizing an informational text, you should focus on the author’s most important points rather than minor examples.", True,
   "A good summary highlights the key points instead of getting lost in small examples.", "Ask yourself: would the passage still make sense without this detail?")
mc("summarize", "RI.5.2", 5, "A student summarized an article about hurricanes by copying three full sentences directly from the text. What is the main problem with this summary?",
   "A summary should be written in the student’s own words, not copied directly.", [("The summary is too short.", "Copying three full sentences is not unusually short."), ("The summary includes too many unrelated ideas.", "Copying from the text does not necessarily add unrelated ideas."), ("The summary is written in the wrong tense.", "Verb tense is not the issue described here.")],
   "Summarizing means restating ideas in your own words, which shows you understood them.", "If you are copying sentences exactly, you are quoting, not summarizing.")
mc("summarize", "RI.5.2", 6, "Read: “Researchers tagged sea turtles with tracking devices to study their migration. The data showed that turtles travel thousands of kilometers to return to the beach where they were born in order to lay their eggs. This behavior is called natal homing.” Which is the BEST summary?",
   "Tracking data revealed that sea turtles migrate long distances back to their birth beach to nest, a behavior called natal homing.", [("Sea turtles never return to the same beach twice.", "This contradicts the passage, which describes turtles returning to their birth beach."), ("Tracking devices harm sea turtles.", "This is not stated in the passage."), ("Natal homing means turtles avoid laying eggs.", "This is the opposite of the passage’s description of natal homing.")],
   "This sentence names the key finding and the scientific term used to describe it.", "Include both the discovery and any special term the passage defines.")
mc("summarize", "RI.5.2", 6, "Why is it important for a summary to keep events in the same order as the original text?",
   "Changing the order can confuse readers about what caused what or what happened first.", [("Order does not matter in a summary.", "This is the opposite of the real reason order matters."), ("Summaries are always written backward.", "This is not a real rule for summaries."), ("Order only matters in fictional stories.", "Order matters for informational texts too, especially cause-and-effect or sequence passages.")],
   "Keeping the original order helps readers understand relationships between events, like cause and effect.", "If a summary reorders events, readers may misunderstand what led to what.")

grade(6)
tf("summarize", "RI.6.2", 2, "An objective summary avoids the writer’s personal opinions and biases.", True,
   "An objective summary sticks to the facts and ideas in the text, not the writer’s own feelings.", "Remove words like “I think” or “this is good/bad” from a summary.")
mc("summarize", "RI.6.2", 2, "Read: “A four-day school week is being tested in some districts. Supporters argue it saves money on busing and utilities. Critics worry that longer school days are tiring for younger students.” Which is the most OBJECTIVE summary?",
   "Some districts are testing a four-day school week, which supporters say saves money while critics worry it tires younger students.", [("Four-day school weeks are clearly a bad idea.", "This states a personal opinion rather than reporting both sides."), ("Everyone agrees a four-day week saves money.", "This ignores the critics mentioned in the passage."), ("Longer school days are definitely too tiring.", "This states a personal opinion rather than reporting both sides.")],
   "This summary reports both the supporters’ and critics’ views without taking a side.", "An objective summary represents every viewpoint the text presents, not just one.")
mc("summarize", "RI.6.2", 3, "Read: “Urban gardens let city residents grow vegetables on rooftops and empty lots. They can lower grocery costs and bring neighbors together. One garden in the story was painted a cheerful shade of yellow.” Which detail is LEAST essential to a summary?",
   "One garden was painted a cheerful shade of yellow.", [("Urban gardens can lower grocery costs.", "This is one of the main benefits described, so it is essential."), ("Gardens grow on rooftops and empty lots.", "This explains where gardens are located, so it is essential."), ("Gardens can bring neighbors together.", "This is one of the main benefits described, so it is essential.")],
   "The color of one garden is a small, specific detail that does not affect the main ideas.", "Ask whether removing a detail changes the passage’s overall meaning.")
order("summarize", "RI.6.2", 4, "Put these sentences in order to summarize this passage: “City planners first studied traffic patterns for a month. Next, they proposed adding a bike lane downtown. Then they held public meetings to gather feedback. Finally, the city council approved the new lane.”",
      ["Planners studied traffic patterns for a month.", "They proposed adding a downtown bike lane.", "They held public meetings for feedback.", "The city council approved the new lane."],
      "A process summary should match the order the steps happened in the original text.", "Use the order words first, next, then and finally as a guide.")
mc("summarize", "RI.6.2", 4, "Read: “Microplastics are tiny plastic fragments smaller than five millimeters. They come from larger plastic items breaking down, as well as from synthetic clothing fibers released during washing. Scientists have found microplastics in ocean water, soil, and even drinking water.” Which is the BEST summary?",
   "Microplastics, tiny plastic fragments from broken-down items and clothing fibers, have been found in water, soil, and drinking water.", [("Microplastics only come from clothing.", "The passage says they come from clothing fibers AND larger plastic items breaking down."), ("Scientists have not found microplastics in drinking water.", "This contradicts the passage directly."), ("Microplastics are larger than five millimeters.", "This contradicts the passage, which says they are smaller than five millimeters.")],
   "This sentence combines the definition, sources, and locations of microplastics into one idea.", "A strong summary of a science passage often combines definition, cause, and evidence.")
mc("summarize", "RI.6.2", 5, "A student summarizing a debate article wrote only the side they personally agreed with. What is the main problem with this summary?",
   "A fair summary should represent all major viewpoints presented in the text, not just one.", [("The summary is too long.", "Focusing on only one side is not primarily a length problem."), ("The summary uses too much evidence.", "Leaving out an entire side is not caused by using too much evidence."), ("The summary should have included even more personal opinions.", "Adding more personal opinion would make the summary less objective, not better.")],
   "Leaving out an opposing viewpoint makes the summary biased and incomplete.", "A summary of a debate should give fair space to each side presented.")
mc("summarize", "RI.6.2", 5, "Read: “A new app helps farmers track rainfall and soil moisture. It sends alerts when soil moisture drops too low, helping farmers decide when to irrigate. The app’s icon is colored green. Early tests showed some farmers saved up to twenty percent on water use.” Which detail should be LEFT OUT of a short summary?",
   "The app’s icon is colored green.", [("The app alerts farmers about low soil moisture.", "This describes the app’s main purpose, so it is essential."), ("Farmers use the alerts to decide when to irrigate.", "This describes how the app is used, so it is essential."), ("Tests showed water savings of up to twenty percent.", "This describes the main result of using the app, so it is essential.")],
   "The icon’s color is a cosmetic detail that has nothing to do with how the app helps farmers.", "Focus on function and results, not minor cosmetic details.")
mc("summarize", "RI.6.2", 6, "Read: “Researchers studied two groups of students: one that took short breaks every 25 minutes while studying, and one that studied for two hours straight. The group that took breaks remembered more information on a test given a week later.” Which is the BEST summary?",
   "A study found that students who took short, regular breaks while studying remembered more than those who studied without breaks.", [("Students who studied for two hours straight remembered the most.", "This contradicts the passage, which says the break-taking group remembered more."), ("The study tested only one group of students.", "The passage clearly describes two separate groups."), ("Breaks had no effect on memory.", "This contradicts the passage’s main finding.")],
   "This sentence states the comparison and the study’s main finding accurately.", "Include both groups being compared and the actual result of the comparison.")
mc("summarize", "RI.6.2", 6, "Why must a summary of a persuasive article still remain objective?",
   "So readers can understand the article’s argument without the summary adding its own bias.", [("Persuasive articles do not need summaries.", "Persuasive articles can still be summarized objectively."), ("Objectivity is only required for fiction.", "Objectivity applies to summaries of both fiction and nonfiction."), ("A summary should persuade readers to agree with the article.", "This confuses the summary’s job with the original article’s job.")],
   "An objective summary reports the article’s argument accurately, without trying to convince readers of it.", "A summary describes what an article argues; it should not argue the point itself.")
mc("summarize", "RI.6.2", 7, "Read: “A city council debated whether to replace a historic bridge. Engineers said the bridge was structurally unsafe and needed replacement within five years. Preservationists argued the bridge was a cultural landmark worth the cost of repair. The council postponed a final decision pending further inspection.” Which is the BEST summary?",
   "Facing competing engineering and preservation concerns about a historic bridge, the city council postponed its decision pending further inspection.", [("The council voted to tear down the bridge immediately.", "This contradicts the passage, which says the decision was postponed."), ("Engineers said the bridge was perfectly safe.", "This contradicts the passage, which says engineers called it unsafe."), ("Preservationists wanted the bridge replaced quickly.", "This contradicts the passage, which says preservationists wanted it repaired, not replaced.")],
   "This summary captures both viewpoints and the council’s actual decision to wait.", "When a passage ends without a final resolution, your summary should reflect that too.")

# ================================================================== cause-effect
grade(4)
mc("cause-effect", "RI.4.3", 1, "Because Fatima left her bike outside in the rain, it became rusty. What is the EFFECT in this sentence?",
   "The bike became rusty.", [("She left her bike outside.", "This is the cause, not the effect."), ("It started raining.", "This is a condition in the sentence, not the stated effect."), ("Fatima rode her bike.", "This is not mentioned in the sentence.")],
   "The rust is the result of leaving the bike out in the rain.", "The effect is what happens because of the cause.")
mc("cause-effect", "RI.4.3", 2, "The ice cream melted because the sun was very hot. What is the CAUSE?",
   "The sun was very hot.", [("The ice cream melted.", "This is the effect, not the cause."), ("Someone ate the ice cream.", "This is not mentioned in the sentence."), ("It was a cold day.", "This contradicts the sentence, which says the sun was hot.")],
   "The heat from the sun is what made the ice cream melt.", "The cause is the reason something happens.")
dd("cause-effect", "RI.4.3", 2, "Choose the word that signals a cause: “The plants grew tall ____ they received plenty of sunlight and water.”",
   "because", [("but", "“But” signals a contrast, not a cause."), ("so", "“So” usually introduces the effect, not the cause."), ("then", "“Then” signals time order, not a reason.")],
   "“Because” introduces the reason the plants grew tall.", "“Because” answers the question “why?”")
mc("cause-effect", "RI.4.3", 3, "Noor forgot to charge her tablet, so it turned off during class. What is the EFFECT of Noor forgetting to charge her tablet?",
   "The tablet turned off during class.", [("Noor forgot to charge it.", "This is the cause, not the effect."), ("Class started late.", "This is not mentioned in the sentence."), ("Noor bought a new tablet.", "This is not mentioned in the sentence.")],
   "The tablet turning off is the result of it not being charged.", "Find the word “so” — it usually introduces the effect.")
match("cause-effect", "RI.4.3", 3, "Match each cause with its most likely effect.",
      [("A pot of water is left boiling too long.", "The water evaporates completely."), ("A plant is kept in a dark closet.", "The plant’s leaves turn yellow and weak."), ("A bicycle tire is never filled with air.", "The tire goes flat."), ("A classroom window is left open in winter.", "The classroom becomes cold.")],
      "Each cause naturally leads to its matching result.", "Ask yourself, “What would happen next?” for each cause.")
mc("cause-effect", "RI.4.3", 4, "Because the farmers built a canal from the river, their dry fields could finally be watered. What is the CAUSE?",
   "The farmers built a canal from the river.", [("Their fields could be watered.", "This is the effect, not the cause."), ("The river dried up.", "This contradicts the sentence, which says the canal came from the river."), ("The farmers planted new crops.", "This is not mentioned in the sentence.")],
   "Building the canal is what allowed the fields to be watered.", "The cause usually comes right after the word “because.”")
tf("cause-effect", "RI.4.3", 4, "In a cause-and-effect relationship, the cause always happens after the effect.", False,
   "The cause happens first and makes the effect happen; the effect follows the cause.", "Ask “why did this happen?” to find the cause, and “what happened as a result?” to find the effect.")
mc("cause-effect", "RI.4.3", 5, "A town built a taller sea wall after a storm flooded Main Street the previous year. What was the EFFECT of the flood?",
   "The town built a taller sea wall.", [("A storm hit the town.", "This is part of the cause, not the town’s response."), ("Main Street flooded.", "This is itself an effect of the storm, but the question asks about the town’s response to the flood."), ("The storm ended.", "This is not the focus of the sentence.")],
   "Building a taller sea wall was the town’s response, caused by the earlier flood.", "Look for what happened as a direct result of the stated event.")
mc("cause-effect", "RI.4.3", 6, "Because the old bridge could no longer support heavy trucks, the city closed it and built a detour road. Which sentence shows a CHAIN of causes and effects?",
   "The bridge’s weakness caused the closure, which in turn caused the detour to be built.", [("The bridge was closed for no particular reason.", "This ignores the stated cause of weakness."), ("The detour road caused the bridge to weaken.", "This reverses the actual order of events."), ("The city built the detour before the bridge weakened.", "This reverses the actual timeline described.")],
   "The weakness led to the closure, and the closure led to building the detour, forming a chain.", "A chain of cause and effect has one effect become the cause of the next event.")

grade(5)
mc("cause-effect", "RI.5.3", 1, "Because the power line was damaged in the storm, the whole neighborhood lost electricity. What is the CAUSE?",
   "The power line was damaged in the storm.", [("The neighborhood lost electricity.", "This is the effect, not the cause."), ("The storm ended quickly.", "This is not mentioned in the sentence."), ("Workers repaired the line.", "This is not mentioned in the sentence.")],
   "The damaged power line is the reason the neighborhood lost electricity.", "The cause is usually introduced by the word “because.”")
mc("cause-effect", "RI.5.3", 2, "Overfishing in the bay caused the fish population to drop sharply. What is the EFFECT?",
   "The fish population dropped sharply.", [("Overfishing happened in the bay.", "This is the cause, not the effect."), ("New fishing laws were passed.", "This is not mentioned in the sentence."), ("The bay became larger.", "This is not mentioned in the sentence.")],
   "The drop in fish population is the direct result of overfishing.", "The word “caused” signals that an effect will follow.")
dd("cause-effect", "RI.5.3", 3, "Choose the word that signals an effect: “The bridge was old and weak; ____, engineers closed it to traffic.”",
   "therefore", [("although", "“Although” signals a contrast, not an effect."), ("meanwhile", "“Meanwhile” signals events happening at the same time, not a result."), ("unless", "“Unless” signals a condition, not a result.")],
   "“Therefore” introduces the engineers’ decision as a result of the bridge’s condition.", "“Therefore” and “as a result” both signal an effect is coming.")
mc("cause-effect", "RI.5.3", 3, "Because the factory released untreated waste into the river, fish downstream began to die. What is the EFFECT?",
   "Fish downstream began to die.", [("The factory released waste.", "This is the cause, not the effect."), ("The river became wider.", "This is not mentioned in the sentence."), ("New factories were built.", "This is not mentioned in the sentence.")],
   "The dying fish are the direct result of the polluted water.", "Ask what happened because of the stated action.")
match("cause-effect", "RI.5.3", 4, "Match each cause with its most likely effect.",
      [("A region experiences a long drought.", "Crop yields drop significantly."), ("A city plants thousands of trees downtown.", "Summer temperatures in the city decrease."), ("A factory updates to more efficient machines.", "Energy costs for the factory fall."), ("An invasive species is introduced to a lake.", "Native fish populations decline.")],
      "Each cause leads naturally to the effect that matches it.", "Think about the most realistic outcome of each situation.")
mc("cause-effect", "RI.5.3", 5, "Because a new highway bypassed the small town, fewer travelers stopped at local shops, so several businesses closed. What is the FIRST cause in this chain?",
   "The new highway bypassed the town.", [("Fewer travelers stopped at local shops.", "This is a middle effect in the chain, caused by the highway."), ("Several businesses closed.", "This is the final effect in the chain."), ("The town built a new highway.", "The sentence does not say the town itself built the highway.")],
   "The highway bypassing the town is the event that starts the whole chain.", "In a chain, find the very first event that sets everything else in motion.")
mc("cause-effect", "RI.5.3", 6, "A marine biologist explains that warmer ocean water causes coral to expel the algae living inside it, which causes the coral to turn white and lose its main food source. Which event in this passage ALSO acts as a cause for a later event?",
   "Coral expelling its algae", [("Warmer ocean water", "This is only a cause; the passage does not describe anything causing it."), ("Coral turning white", "This is described only as an effect, not as a cause of a further event in the passage."), ("Coral losing its food source", "This is the final effect described, not a cause of something else.")],
   "The coral expelling its algae is an effect of warm water, but it also causes the coral to turn white.", "In a causal chain, a middle event is both an effect of what came before and a cause of what comes after.")
mc("cause-effect", "RI.5.3", 7, "Rising global temperatures are causing glaciers to melt faster, which is raising sea levels, which is increasing coastal flooding. If temperatures stopped rising, what would this causal chain predict about coastal flooding?",
   "Coastal flooding would likely decrease, since each effect in the chain depends on the one before it.", [("Coastal flooding would increase even more.", "This contradicts the logic of the causal chain described."), ("Coastal flooding would stay exactly the same.", "This ignores how each step in the chain depends on the one before it."), ("Glaciers would melt even faster.", "This contradicts the chain, since the original cause has stopped.")],
   "Since each effect depends on the one before it, removing the first cause should slow or reverse the whole chain.", "Follow a causal chain backward to predict what happens if the starting cause changes.")

grade(6)
mc("cause-effect", "RI.6.3", 2, "Because the city reduced bus fares, more residents began using public transportation. What is the EFFECT?",
   "More residents began using public transportation.", [("The city reduced bus fares.", "This is the cause, not the effect."), ("Bus routes were extended.", "This is not mentioned in the sentence."), ("Fewer buses were purchased.", "This is not mentioned in the sentence.")],
   "The increase in riders is the direct result of the lower fares.", "The word “because” points to the cause; the rest of the sentence usually states the effect.")
mc("cause-effect", "RI.6.3", 3, "A drop in bee populations is causing some crops to produce less fruit, since bees pollinate many flowering plants. What is the CAUSE of the lower fruit production?",
   "The drop in bee populations.", [("The crops producing less fruit.", "This is the effect, not the cause."), ("Farmers planting more crops.", "This is not mentioned in the passage."), ("A rise in bee populations.", "This contradicts the passage, which describes a drop, not a rise.")],
   "Fewer bees means less pollination, which leads directly to less fruit.", "Look for the explanation introduced by “since,” which often signals a cause.")
dd("cause-effect", "RI.6.3", 4, "Choose the best transition for cause and effect: “The river’s water level dropped sharply; ____, several boats could no longer dock at the pier.”",
   "as a result", [("in contrast", "“In contrast” signals a difference, not a result."), ("for example", "“For example” signals an illustration, not a result."), ("similarly", "“Similarly” signals a comparison, not a result.")],
   "“As a result” introduces the direct consequence of the dropping water level.", "“As a result” and “consequently” both signal that an effect is about to be stated.")
ms("cause-effect", "RI.6.3", 4, "Because the company switched to recycled packaging, its shipping costs decreased and its reputation improved among environmentally conscious customers. Which TWO effects are described?",
   ["Shipping costs decreased.", "Its reputation improved among environmentally conscious customers."], [("The company switched to recycled packaging.", "This is the cause, not an effect."), ("The company went out of business.", "This is not stated and contradicts the positive outcomes described.")],
   "Both lower costs and improved reputation are results of the switch to recycled packaging.", "Look for the outcomes listed after the cause is introduced.")
mc("cause-effect", "RI.6.3", 5, "A historian explains that a severe drought led to crop failures, which led to food shortages, which eventually led to mass migration from the region. Which of these is a MIDDLE link in the causal chain — both an effect and a cause?",
   "The food shortages", [("The severe drought", "This is only the starting cause of the whole chain."), ("The mass migration", "This is only the final effect of the whole chain."), ("The historian’s explanation", "The explanation itself is not part of the events in the chain.")],
   "Food shortages are an effect of the crop failures, but they also cause the mass migration that follows.", "A middle link in a chain is caused by the step before it and causes the step after it.")
mc("cause-effect", "RI.6.3", 6, "Because social media algorithms show users more of what they already agree with, some researchers argue this causes people’s opinions to become more extreme over time. According to this passage, what is being proposed as a LONG-TERM effect?",
   "People’s opinions becoming more extreme over time.", [("Algorithms showing agreeable content.", "This is the cause, not the proposed long-term effect."), ("Researchers studying social media.", "This describes the researchers’ activity, not an effect of the algorithms."), ("Users disagreeing with algorithms.", "This is not stated in the passage.")],
   "The passage states this outcome as the long-term result researchers are concerned about.", "Look for the outcome the passage frames as happening gradually, “over time.”")
tf("cause-effect", "RI.6.3", 6, "A single effect can have more than one contributing cause.", True,
   "Many real-world events, like a forest fire, result from multiple causes working together, such as dry weather and a spark.", "Look for words like “also” and “in addition” that signal more than one cause.")
mc("cause-effect", "RI.6.3", 7, "An economist notes that rising fuel prices increase shipping costs, which increases the price of imported goods, which then reduces how much consumers are able to buy. If fuel prices suddenly fell instead, which outcome would this causal chain predict?",
   "Shipping costs would likely fall, making imported goods cheaper and increasing how much consumers can buy.", [("Consumers would buy less regardless of fuel prices.", "This ignores how the whole chain depends on the starting cause."), ("Shipping costs would rise even though fuel got cheaper.", "This contradicts the direct relationship described in the passage."), ("Imported goods would become more expensive.", "This contradicts the logic of the causal chain if the starting cause reverses.")],
   "Reversing the first cause in a chain should reverse the effects that follow it.", "Trace a causal chain forward with the opposite starting condition to predict the outcome.")
