"""
Question bank top-up 2, batch 02: brings these families to the full target of 50 items each
(original content, Grades 4-6).
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== writing-narrative
grade(4)

mc("writing-narrative", "W.4.3.c", 2, "Which transition word best shows the order of events? “____, Lina fed the chickens. After that, she watered the garden.”",
   "First", [("Although", "“Although” shows a contrast, not a time order."), ("Because", "“Because” gives a reason, not the order of events."), ("Unless", "“Unless” shows a condition, not a time order.")],
   "“First” tells the reader which chore happened before the others.", "Order words like first, next, then, and finally show the sequence of events.")
mc("writing-narrative", "W.4.3.c", 3, "Which sentence uses a transition word to show that something happened unexpectedly in a story?",
   "Suddenly, the lights in the barn went out.",
   [("The lights in the barn were yellow.", "This only describes the lights; it does not show a surprising moment."), ("The barn had lights and a loft.", "This lists details without any time signal."), ("Omar liked the barn more than the house.", "This compares two places and shows no sequence.")],
   "“Suddenly” signals that an event happened quickly and without warning.", "Words like suddenly and all at once show a surprising moment in a story.")
dd("writing-narrative", "W.4.3.c", 2, "Choose the transition that shows time passed overnight: “We camped by the river. ____, the fish were jumping near our tent.”",
   "The next morning", [("Across the river", "This tells where, not when."), ("Because of the rain", "This gives a reason, not a time."), ("Even though", "This shows contrast, not time.")],
   "“The next morning” tells the reader a new day has begun.", "Look for words that answer “when,” not “why” or “where.”")
dd("writing-narrative", "W.4.3.c", 3, "Choose the transition that shows two things happening at the same time: “Hassan set up the tent. ____, Dalia gathered firewood.”",
   "Meanwhile", [("Finally", "“Finally” shows the last event, not something happening at the same time."), ("Afterward", "“Afterward” shows something happened later, not at the same time."), ("Because", "“Because” gives a reason, not timing.")],
   "“Meanwhile” shows that Dalia's action happened at the same time as Hassan's.", "“Meanwhile” links two events that are happening together.")
order("writing-narrative", "W.4.3.c", 3, "Put the sentences from this camping story in the correct order.",
      ["Karim packed the tent, flashlight, and snacks into the car.", "The family drove two hours to reach the campsite.",
       "As the sun set, Karim helped his father set up the tent.", "Later that night, they roasted marshmallows over the fire."],
      "The events follow the order they happened: packing, driving, setting up camp, then the campfire.",
      "Look for time clues like “as the sun set” and “later that night” to find the order.")
order("writing-narrative", "W.4.3.c", 4, "A student wrote a story about a lost dog. Put the sentences in the order that tells the story clearly.",
      ["Noor noticed that her dog Biscuit had slipped out of the yard.", "She searched the street and called his name over and over.",
       "A neighbor said he had seen a small dog near the park.", "Noor ran to the park and finally spotted Biscuit chasing a squirrel."],
      "The sentences move from the problem, to the search, to a clue, to finding the dog.",
      "A clear narrative moves step by step from problem to solution.")
mc("writing-narrative", "W.4.3.c", 4, "Which transition best shows that some time passed before the next event? “Tarek studied the map carefully. ____, he found the trailhead.”",
   "Before long", [("On the other hand", "This shows contrast, not time passing."), ("In other words", "This restates an idea; it does not show time."), ("Despite this", "This shows contrast, not a time gap.")],
   "“Before long” tells the reader that some time passed before Tarek found the trail.", "Phrases like before long and after a while show time passing without being exact.")
dd("writing-narrative", "W.4.3.c", 4, "Choose the transition that shows an event happened at that exact moment: “Salma was about to give up. ____, she spotted the trail marker.”",
   "Just then", [("As usual", "This shows something that happens often, not one exact moment."), ("In general", "This makes a broad statement, not a single moment."), ("On the contrary", "This shows disagreement, not a moment in time.")],
   "“Just then” marks the exact instant the trail marker appeared.", "Just then and right then both signal one precise moment in a story.")
err("writing-narrative", "W.4.3.c", 3, ["Amir finished his homework,", " then he eating", " a snack", " before soccer practice."], 1, " then he ate",
    "The sentence needs the past-tense verb “ate,” not “eating,” to flow with the other events.", "Check that every event in your sequence uses a matching, correct verb form.")
err("writing-narrative", "W.4.3.c", 4, ["Huda watched the clouds build,", " and then suddenly", " rain start", " to fall on the tin roof."], 2, " rain started",
    "After “suddenly,” the verb should be the past-tense “started” to match the rest of the story.", "A sequence of events in a story usually stays in one consistent verb tense.")
mc("writing-narrative", "W.4.3.c", 5, "Which transition best shows that something finally happened after a long search? “Rami checked every shelf in the library. ____, he found the missing book wedged behind a dictionary.”",
   "Eventually", [("Similarly", "This compares two things; it does not show time passing."), ("For instance", "This introduces an example, not a time shift."), ("On the other hand", "This shows contrast, not the end of a search.")],
   "“Eventually” shows that the event happened after some time and effort.", "Eventually and finally both signal the end of a long process.")
dd("writing-narrative", "W.4.3.c", 5, "Choose the transition that shows a new part of the day has begun: “The team practiced all morning. ____, they reviewed the game plan in the gym.”",
   "Later that day", [("In contrast", "This shows a difference, not a later time."), ("For that reason", "This gives a cause, not a time shift."), ("As a result", "This shows a result, not simply a later time.")],
   "“Later that day” shows the second event happened after the first, within the same day.", "Watch for phrases naming a part of the day to track when events happen.")
order("writing-narrative", "W.4.3.c", 5, "Put these sentences about a school play rehearsal in the order that shows how the afternoon unfolded.",
      ["Mariam arrived early to help set up the stage curtains.", "During rehearsal, she forgot her lines and froze for a moment.",
       "Her friend whispered the next line just in time.", "By the end of practice, Mariam performed the scene without a single mistake."],
      "The events move from preparation, to a problem, to help, to improvement.",
      "Look for words like during, just in time, and by the end to find the sequence.")
mc("writing-narrative", "W.4.3.c", 1, "Which word tells the reader what happened right after the first event? “Yusuf brushed his teeth. ____, he put on his shoes.”",
   "Then", [("Because", "This tells a reason, not what happened next."), ("Although", "This shows a contrast, not a time order."), ("Unless", "This shows a condition, not a sequence.")],
   "“Then” shows which action happened right after the first one.", "Then, next, and after that all point to what happens right after.")
mc("writing-narrative", "W.4.3.c", 6, "In a narrative about a storm, which transition best signals a sudden, surprising shift in the action? “The sky had been calm all afternoon. ____, thunder cracked and the wind tore through the tents.”",
   "All of a sudden", [("As a result", "This shows a cause-and-effect link, not surprise."), ("In the same way", "This compares two ideas, not a sudden shift."), ("To sum up", "This signals a conclusion, not a sudden event.")],
   "“All of a sudden” signals an abrupt, unexpected change in the story's action.", "Phrases like all of a sudden and without warning mark sharp shifts in a narrative.")
mc("writing-narrative", "W.4.3.c", 2, "Which transition best shows that this is the last event in the story? “We packed the car, said goodbye to the campsite, and ____, we drove home as the sun set.”",
   "finally", [("meanwhile", "This shows something happening at the same time, not the last step."), ("because", "This gives a reason, not the final event."), ("unless", "This shows a condition, not an ending.")],
   "“Finally” signals that this is the last event in the sequence.", "Finally and in the end both mark the close of a sequence of events.")

grade(5)

mc("writing-narrative", "W.5.3.c", 2, "Which transition word shows that something will happen in a short amount of time? “Youssef finished sketching the robot design. ____, he showed it to his teacher.”",
   "Soon", [("Although", "This signals contrast, not a short time later."), ("Because", "This gives a reason, not when something happens."), ("Unless", "This shows a condition, not a time.")],
   "“Soon” tells readers that only a little time passed before the next event.", "Soon, shortly, and in a little while all show a brief time gap.")
mc("writing-narrative", "W.5.3.c", 3, "Which sentence uses a transition that signals one event followed closely behind another?",
   "Not long after the bell rang, the fire drill began.",
   [("The bell was loud and sudden.", "This only describes the bell; it gives no time signal."), ("The fire drill lasted ten minutes.", "This states a fact without connecting two events in time."), ("Mona disliked fire drills more than quizzes.", "This is a comparison, not a time transition.")],
   "“Not long after” connects the two events and shows they happened close together in time.", "Phrases like not long after link two events with only a short gap between them.")
dd("writing-narrative", "W.5.3.c", 2, "Choose the transition that marks one exact point in the story: “The crowd grew restless during the delay. ____, the announcer's voice crackled over the speakers.”",
   "At that moment", [("In general", "This makes a broad statement, not a single moment."), ("As a result", "This shows cause and effect, not one moment in time."), ("On the other hand", "This shows contrast, not timing.")],
   "“At that moment” pinpoints the exact instant the announcer spoke.", "Phrases naming “that moment” zoom in on one precise point in time.")
dd("writing-narrative", "W.5.3.c", 3, "Choose the transition that tells readers it is midday in the story: “The hikers began their climb at dawn. ____, they reached the halfway marker.”",
   "By noon", [("In contrast", "This shows a difference, not a specific time."), ("For example", "This introduces an example, not a time."), ("Despite this", "This signals contrast, not a time of day.")],
   "“By noon” tells the reader exactly when the hikers reached the marker.", "Specific times of day (by noon, at dusk) anchor events clearly for the reader.")
order("writing-narrative", "W.5.3.c", 3, "Put these sentences about a science fair project in the order they happened.",
      ["Layla chose to build a model volcano for the science fair.", "She spent a week gathering baking soda, vinegar, and clay.",
       "On the morning of the fair, her volcano erupted perfectly during the demonstration.", "Afterward, the judges awarded her project second place."],
      "The sentences move from choosing a project, to preparing, to the demonstration, to the result.",
      "Trace the steps a project usually takes: plan, prepare, present, result.")
order("writing-narrative", "W.5.3.c", 4, "Put these sentences about a power outage in the order that tells the story clearly.",
      ["Thunder rattled the windows as the storm grew stronger.", "Without warning, every light in the house went dark.",
       "Hassan's family found flashlights and candles in the kitchen drawer.", "By the time the lights flickered back on, they had already finished a board game by candlelight."],
      "The sentences follow the events from the storm, to the outage, to the response, to the resolution.",
      "Look for phrases like without warning and by the time to trace the sequence.")
mc("writing-narrative", "W.5.3.c", 4, "Which transition shows that an event happened only a little while after the first one? “The coach blew the whistle to end practice. ____, the players gathered their bags and left the field.”",
   "Shortly after", [("In comparison", "This compares two things rather than showing time passing."), ("As opposed to", "This signals contrast, not time."), ("For this reason", "This gives a cause, not a brief time gap.")],
   "“Shortly after” shows that the second event followed quickly behind the first.", "Shortly after signals a brief gap between two connected events.")
dd("writing-narrative", "W.5.3.c", 4, "Choose the transition that shows two events happening almost at the same instant: “____ the gates opened, the crowd surged toward the stadium entrance.”",
   "As soon as", [("Although", "This signals contrast, not immediate timing."), ("Because", "This gives a reason, not a time connection."), ("Unless", "This signals a condition, not an immediate action.")],
   "“As soon as” shows the crowd moved the instant the gates opened.", "As soon as links two actions that happen almost together.")
err("writing-narrative", "W.5.3.c", 4, ["By the time the bus arrived,", " Omar has already", " read", " three chapters of his book."], 1, " Omar had already",
    "“By the time” in the past calls for the past perfect “had already,” not “has already.”", "Use had + past tense to show one past event finished before another.")
err("writing-narrative", "W.5.3.c", 5, ["As the fog lifted,", " the hikers saw", " the trail that they walk", " every weekend."], 2, " the trail that they walked",
    "To match the rest of the past-tense story, the verb should be “walked,” not “walk.”", "Keep verb tenses consistent throughout a narrative unless you have a reason to shift.")
mc("writing-narrative", "W.5.3.c", 5, "Which transition best shows the end of a long, difficult search in this narrative? “Tarek searched every drawer and closet for his grandfather's old watch. ____, he discovered it tucked inside a worn leather box.”",
   "At last", [("Similarly", "This compares two ideas, not the end of a search."), ("In other words", "This restates an idea rather than marking time."), ("On the contrary", "This signals disagreement, not the end of a search.")],
   "“At last” marks the end of a long effort and the moment of success.", "At last and finally both signal the end of a lengthy process.")
dd("writing-narrative", "W.5.3.c", 5, "Choose the transition that shows a new scene happening after a gap of time: “Dalia mailed the application and tried not to worry. ____, a thick envelope arrived in the mailbox.”",
   "Several days later", [("In the same way", "This compares two things, not a later time."), ("As a result", "This shows a result, not simply a time gap."), ("On the other hand", "This signals contrast, not timing.")],
   "“Several days later” tells the reader time has passed since the mailing.", "Phrases naming a stretch of time (several days later) skip ahead cleanly in a story.")
order("writing-narrative", "W.5.3.c", 5, "Put these sentences about a basketball tournament in the order that shows how the day unfolded.",
      ["Karim's team arrived early to warm up before the first game.", "During the second quarter, their best shooter twisted her ankle.",
       "Despite the injury, the team rallied behind a last-minute substitute.", "By the final buzzer, they had pulled ahead to win the championship."],
      "The sentences move from preparation, to a setback, to a response, to the outcome.",
      "Look for words like during and by the final buzzer to find the order of events.")
mc("writing-narrative", "W.5.3.c", 6, "Which transition best signals a scene change to later the same day? “The science fair ended at noon with Layla's project in first place. ____, her family celebrated with a special dinner.”",
   "That same evening", [("For instance", "This introduces an example, not a later time."), ("In contrast", "This shows a difference, not a time shift."), ("As a result", "This shows a result, which is different from simply naming a later time.")],
   "“That same evening” shows the celebration happened later on the same day as the fair.", "Phrases naming part of “that same day” move the scene forward without skipping too far.")
mc("writing-narrative", "W.5.3.c", 6, "Which transition shows that a character reacted without any delay? “The smoke alarm shrieked through the hallway. ____, Noor grabbed her little brother and ran for the door.”",
   "Immediately", [("Eventually", "This suggests a delay, which contradicts a fast reaction."), ("In general", "This makes a broad statement rather than showing speed."), ("For example", "This introduces an example, not a quick reaction.")],
   "“Immediately” shows Noor acted without any hesitation or delay.", "Immediately, instantly, and right away all signal an action with no delay.")
mc("writing-narrative", "W.5.3.c", 7, "In a narrative describing an all-day hike, which transition best signals the final stretch of the story as evening approaches? “The group had climbed steadily since sunrise, stopping only twice to rest. ____, the trail finally leveled out near the overlook.”",
   "By sunset", [("In comparison", "This compares two ideas, not a time of day."), ("As opposed to", "This signals contrast, not a time marker."), ("To summarize", "This signals a wrap-up statement, not a specific time in the story.")],
   "“By sunset” anchors the final event to a specific, later time of day, showing the hike's long duration.", "Naming a specific later time (by sunset) helps show how much time has passed in a long narrative.")

grade(6)

mc("writing-narrative", "W.6.3.c", 2, "Which transition shows that an event happened quickly after the one before it? “Sami submitted his essay online. ____, a confirmation message appeared on the screen.”",
   "Within minutes", [("Although", "This signals contrast, not a quick time gap."), ("Because", "This gives a reason, not a time."), ("Unless", "This shows a condition, not a time gap.")],
   "“Within minutes” tells readers the confirmation arrived shortly after the submission.", "Phrases naming a short span of time (within minutes) show quick timing between events.")
mc("writing-narrative", "W.6.3.c", 3, "Which sentence uses a transition that connects an earlier part of the same day to the current event?",
   "Earlier that day, Rania had promised to help with the fundraiser; now she kept her word.",
   [("Rania enjoyed volunteering at school events.", "This is a general statement with no time connection."), ("The fundraiser raised two hundred dollars.", "This states a result, not a time link."), ("Rania was more organized than her classmates.", "This is a comparison, not a time transition.")],
   "“Earlier that day” ties the promise made earlier to the action happening now, within the same day.", "Transitions can reach backward in time (earlier that day) as well as forward.")
dd("writing-narrative", "W.6.3.c", 2, "Choose the transition that sets a calm scene before the main action begins: “____, Yusuf sat on the porch reading, unaware that a storm was building far out at sea.”",
   "One quiet afternoon", [("As a result", "This shows a cause-and-effect link, not an opening time setting."), ("In other words", "This restates an idea; it does not set a scene."), ("On the contrary", "This signals disagreement, not a calm opening scene.")],
   "“One quiet afternoon” establishes the peaceful setting at the start of the story.", "Narratives often open with a time phrase that sets the mood before the action starts.")
dd("writing-narrative", "W.6.3.c", 3, "Choose the transition that shows one event happened a very short time after another: “The dog barked at the gate. ____, a stranger's shadow crossed the yard.”",
   "Moments later", [("In contrast", "This shows a difference, not a short time gap."), ("For example", "This introduces an example, not timing."), ("Despite this", "This shows contrast, not a quick time gap.")],
   "“Moments later” shows the second event followed almost immediately.", "Moments later and a second later both signal a very brief gap in time.")
order("writing-narrative", "W.6.3.c", 3, "Put these sentences about a robotics competition in the order they happened.",
      ["Hassan's team spent weeks programming their robot to navigate a maze.", "On competition day, a wiring problem made the robot veer off course during the first test run.",
       "The team raced to resolder a loose connection before their official match.", "Their robot completed the maze flawlessly, earning the top score of the day."],
      "The sentences move from preparation, to a problem, to a fix, to the final success.",
      "Narratives about competitions often follow a pattern: prepare, face a setback, fix it, succeed.")
order("writing-narrative", "W.6.3.c", 4, "Put these sentences about a hurricane evacuation in the order that tells the story clearly.",
      ["Forecasters warned that the storm would strengthen before reaching the coast.", "Mariam's family packed essential supplies and boarded up the windows.",
       "They drove inland just as the first heavy rains began to fall.", "By the next morning, news reports confirmed the storm had passed without reaching their new location."],
      "The sentences follow the warning, the preparation, the departure, and the resolution.",
      "Evacuation narratives usually move from warning to action to safety.")
mc("writing-narrative", "W.6.3.c", 4, "Which transition shows that something was happening at the same time as another event, in a more formal way than “meanwhile”? “The rescue team searched the ridge for survivors. ____, volunteers at the base camp prepared supplies for the return trip.”",
   "In the meantime", [("As a result", "This shows cause and effect, not simultaneous action."), ("For this reason", "This gives a cause, not parallel timing."), ("In conclusion", "This signals an ending, not something happening at the same time.")],
   "“In the meantime” shows the two actions are happening at the same time, in different places.", "In the meantime works like meanwhile to show simultaneous events.")
dd("writing-narrative", "W.6.3.c", 4, "Choose the transition that shows a longer stretch of time passed before the next event: “The search party fanned out across the forest at dawn. ____, they found footprints leading toward the river.”",
   "Hours later", [("In comparison", "This compares two things, not a time gap."), ("As opposed to", "This signals contrast, not timing."), ("To summarize", "This signals a conclusion, not a passage of time.")],
   "“Hours later” shows a longer period passed before the footprints were discovered.", "Naming a unit of time (hours later) tells readers roughly how much time has passed.")
err("writing-narrative", "W.6.3.c", 4, ["After the coach reviewed the footage,", " the players understand", " exactly", " which plays had failed."], 1, " the players understood",
    "The story is told in the past tense, so the verb should be “understood,” not “understand.”", "Check every verb in a sequence of events for a consistent past tense.")
err("writing-narrative", "W.6.3.c", 5, ["By the time the rescue team reached the summit,", " the climbers already descend", " to the safety", " of the base camp."], 1, " the climbers had already descended",
    "“By the time” with a past event needs the past perfect “had already descended” to show it finished first.", "Use the past perfect to show one past action was completed before another past action.")
mc("writing-narrative", "W.6.3.c", 5, "Which transition best signals a new scene beginning on the day after the main event? “The team celebrated their victory late into the night. ____, reporters crowded the school's front steps for interviews.”",
   "The following morning", [("In other words", "This restates an idea, not a new day."), ("As a result", "This shows a result rather than naming a new day."), ("On the contrary", "This signals disagreement, not a time shift.")],
   "“The following morning” clearly marks the start of a new day after the celebration.", "Phrases naming “the following” day or week move a story cleanly into a new scene.")
dd("writing-narrative", "W.6.3.c", 5, "Choose the transition that shows a character acted immediately, with no pause to think: “The alarm blared through the lab. ____, Noor shut off the gas valve and evacuated the room.”",
   "Without hesitation", [("Eventually", "This suggests a delay, which contradicts an immediate reaction."), ("In general", "This makes a broad statement, not an immediate action."), ("For example", "This introduces an example, not a quick reaction.")],
   "“Without hesitation” shows Noor reacted instantly, without pausing.", "Without hesitation and at once both show an immediate reaction in a narrative.")
order("writing-narrative", "W.6.3.c", 5, "Put these sentences about a chess tournament in the order that shows how the match unfolded.",
      ["Amir studied his opponent's opening moves, searching for a weakness.", "Midway through the match, he sacrificed a knight to open an attack.",
       "His opponent hesitated, unsure how to respond to the sudden pressure.", "By the final move, Amir had cornered the king for checkmate."],
      "The sentences trace the match from the opening strategy to the winning move.",
      "Chess narratives, like other competitions, move from strategy to a turning point to the outcome.")
mc("writing-narrative", "W.6.3.c", 6, "Which transition best shows an event happening in the middle of a confusing, fast-moving scene? “Alarms sounded and passengers rushed toward the exits. ____, a flight attendant calmly guided an elderly passenger to safety.”",
   "During the chaos", [("As a result", "This shows cause and effect, not a moment within a scene."), ("In conclusion", "This signals an ending, not a moment during the action."), ("For instance", "This introduces an example, not a moment within the chaos.")],
   "“During the chaos” places this calm action right in the middle of the frantic scene.", "Phrases like during the chaos or amid the confusion locate an event within ongoing action.")
mc("writing-narrative", "W.6.3.c", 7, "In a tense narrative, which transition most precisely marks the exact instant two actions collided? “The goalkeeper dove toward the corner of the net. ____, the ball curved sharply and slipped past her fingertips.”",
   "At precisely that instant", [("In comparison", "This compares two ideas, not a single precise moment."), ("As opposed to", "This signals contrast, not timing."), ("To summarize", "This signals a conclusion, not a precise instant.")],
   "“At precisely that instant” pinpoints the exact moment the goalkeeper's dive and the ball's curve happened together.", "The most precise time transitions (at precisely that instant) zoom in on a split-second moment.")

# ================================================================== connotation
grade(4)

mc("connotation", "L.4.5", 1, "Which word has the most POSITIVE connotation for someone who tried something scary?",
   "courageous", [("reckless", "This is negative; it suggests acting without thinking about danger."), ("foolish", "This is negative; it suggests the action was unwise."), ("wild", "This is negative; it suggests a lack of control.")],
   "“Courageous” shows admiration for facing fear, unlike the other words.", "Connotation is the feeling a word gives, beyond its dictionary meaning.")
mc("connotation", "L.4.5", 2, "Which word gives the most NEGATIVE feeling for a person who talks a lot?",
   "blabbermouth", [("talkative", "This word is neutral; it simply states a fact without a negative feeling."), ("friendly", "This word is positive; it suggests warmth, not annoyance."), ("outgoing", "This word is positive; it suggests confidence in social settings.")],
   "“Blabbermouth” suggests the person talks too much and annoys others.", "Negative connotation words often make an ordinary trait sound irritating.")
dd("connotation", "L.4.5", 2, "Choose the word that makes the kitchen sound inviting: “Grandma's kitchen always smelled ____.”",
   "heavenly", [("foul", "This word is negative; it suggests a bad smell."), ("strange", "This word is neutral; it does not add a pleasant feeling.")],
   "“Heavenly” suggests the smell was wonderful, matching the warm feeling of the sentence.", "Choose words that match the feeling the sentence is trying to create.")
mc("connotation", "L.4.5", 2, "Which word has the most NEGATIVE connotation for a strong smell?",
   "stench", [("aroma", "This word is positive; it suggests a pleasant smell."), ("odor", "This word is neutral; it simply names a smell without judgment."), ("whiff", "This word is neutral; it describes a small amount of smell without a negative feeling.")],
   "“Stench” suggests the smell is strongly unpleasant.", "Some words that name the same thing add a much stronger feeling than others.")
dd("connotation", "L.4.5", 3, "Choose the word that makes the small apartment sound pleasant: “Despite its size, the apartment felt ____.”",
   "cozy", [("cramped", "This word is negative; it suggests the space feels uncomfortably small."), ("empty", "This word does not match the warm feeling the sentence describes.")],
   "“Cozy” suggests the small space feels warm and comfortable rather than uncomfortable.", "Writers pick words that create the exact feeling they want readers to have.")
mc("connotation", "L.4.5", 3, "Which word gives the most NEGATIVE feeling for a small space?",
   "cramped", [("cozy", "This word is positive; it suggests warmth and comfort."), ("compact", "This word is neutral; it simply states the size without a negative feeling.")],
   "“Cramped” suggests the space feels uncomfortably small.", "Think about how a word makes a reader feel, not just what it means.")
mc("connotation", "L.4.5", 3, "A writer wants readers to respect a grandmother who works hard every day without complaining. Which word should describe her?",
   "diligent", [("bossy", "This word is negative; it suggests she orders others around."), ("stubborn", "This word is negative; it suggests she refuses to change her mind."), ("lazy", "This word is nearly the opposite meaning; it does not match a hard worker.")],
   "“Diligent” shows admiration for steady, careful hard work.", "Writers choose words with connotations that match the feeling they want.")
dd("connotation", "L.4.5", 4, "Choose the word that shows disapproval: “Even after he was corrected twice, Rami remained ____ about his answer.”",
   "stubborn", [("confident", "This word is positive; it shows a healthy belief in oneself."), ("sure", "This word is neutral; it simply states a fact.")],
   "“Stubborn” suggests Rami unreasonably refused to admit he was wrong.", "Negative connotation words can turn an ordinary trait into a criticism.")
mc("connotation", "L.4.5", 4, "Which word describes a careful saver in a POSITIVE way?",
   "frugal", [("stingy", "This word is negative; it suggests the person is unwilling to share or spend even when needed."), ("cheap", "This word sounds negative here too; it suggests he is unwilling to spend even a little.")],
   "“Frugal” shows admiration for careful, wise spending.", "Near-synonyms can share a meaning but feel very different to a reader.")
dd("connotation", "L.4.5", 4, "Choose the word that criticizes someone for being unwilling to spend money on others: “Everyone at the office calls Samir ____ because he never pays for coffee.”",
   "stingy", [("frugal", "This word is positive; it suggests careful and wise saving, not unwillingness to share."), ("careful", "This word is neutral; it does not carry the critical feeling of the sentence.")],
   "“Stingy” criticizes Samir for refusing to share, unlike the more admiring word “frugal.”", "The same basic trait can sound admirable or unpleasant depending on the word chosen.")
mc("connotation", "L.4.5", 4, "Which word has the most POSITIVE connotation for someone who asks a lot of questions in class?",
   "inquisitive", [("nosy", "This word is negative; it suggests prying into other people's business."), ("pushy", "This word is negative; it suggests being too forceful.")],
   "“Inquisitive” shows admiration for a love of learning.", "Writers choose words with connotations that match the feeling they want.")
tf("connotation", "L.4.5", 3, "The words “mistake” and “blunder” have the same denotation (a wrong action) but “blunder” carries a more negative connotation.", True,
   "“Blunder” suggests a clumsy, embarrassing error, while “mistake” is more neutral.", "Compare near-synonyms by imagining how each word makes you feel.")
tf("connotation", "L.4.5", 4, "The words “crowd” and “mob” have the same denotation (a group of people) and the exact same connotation.", False,
   "“Mob” suggests an unruly, frightening group, while “crowd” is more neutral.", "Even words that name the same thing can carry very different feelings.")
match("connotation", "L.4.5", 3, "Match each neutral word with a word that carries a more NEGATIVE connotation.",
      [("talk", "gossip"), ("ask", "demand"), ("look", "snoop"), ("eat", "gobble")],
      "Each pair names a similar action, but the second word adds a critical or unpleasant feeling.",
      "Negative connotation words often make an ordinary action sound rude or careless.")
mc("connotation", "L.4.5", 5, "Which word would make a news report about a storm sound more frightening?",
   "ravaged", [("affected", "This word is neutral; it states a fact without strong feeling."), ("touched", "This word is too mild for describing storm damage."), ("changed", "This word is neutral; it does not convey destruction.")],
   "“Ravaged” suggests severe, violent destruction.", "A strong verb can make the same event sound much more dramatic.")
dd("connotation", "L.4.5", 5, "Choose the word that makes the old castle sound mysterious and exciting rather than simply old: “Visitors say the ____ castle still hides secret tunnels.”",
   "legendary", [("outdated", "This word is negative; it suggests the castle is no longer useful or interesting."), ("plain", "This word is the opposite feeling; it suggests nothing special.")],
   "“Legendary” adds a sense of wonder and mystery that “old” alone would not.", "Writers choose exciting words to make a setting feel special.")
mc("connotation", "L.4.5", 6, "A reporter wants to describe a town's reputation for crime in a strongly NEGATIVE way. Which word should the reporter choose?",
   "notorious", [("famous", "This word is positive; it suggests people admire the town."), ("known", "This word is neutral; it simply states a fact without judgment.")],
   "“Notorious” means famous specifically for something bad.", "Some words only sound positive or negative depending on what they describe.")
mc("connotation", "L.4.5", 7, "In a story, the wind “howled” through the trees instead of simply “blew.” What feeling does “howled” add?",
   "A frightening, almost animal-like feeling",
   [("A calm, peaceful feeling", "“Howled” suggests something wild and unsettling, not calm."), ("A happy, cheerful feeling", "The word suggests fear, not joy."), ("No feeling; it means exactly the same as “blew”", "The dictionary meaning is close, but the feeling it creates is very different.")],
   "“Howled” compares the wind to a frightening animal sound.", "Writers choose vivid verbs to make ordinary actions feel more intense.")

grade(6)

mc("connotation", "RL.6.4", 2, "In the sentence “The crowd surged toward the gates like a restless tide,” what feeling does the word “surged” add that “moved” would not?",
   "A feeling of sudden, powerful, uncontrollable movement",
   [("A feeling of slow, careful movement", "“Surged” suggests force and speed, not caution."), ("A feeling of silence", "“Surged” describes motion, not sound or its absence."), ("No feeling; it means exactly the same as “moved”", "The dictionary meaning is similar, but “surged” adds intensity that “moved” lacks.")],
   "“Surged” suggests the crowd moved with sudden, forceful energy.", "Vivid verbs can add intensity that a plain verb like “moved” does not.")
mc("connotation", "RL.6.4", 2, "Which word would make a description of a leader sound admirable rather than simply firm?",
   "resolute", [("stubborn", "This word is negative; it suggests an unreasonable refusal to change."), ("bossy", "This word is negative; it suggests ordering others around unfairly."), ("rigid", "This word is negative; it suggests an inability to adapt.")],
   "“Resolute” suggests admirable determination rather than unreasonable stubbornness.", "The same basic trait can sound admirable or unpleasant depending on the word chosen.")
dd("connotation", "RL.6.4", 3, "Choose the word that makes the abandoned factory sound eerie: “Rows of broken windows stared out from the ____ factory.”",
   "derelict", [("vacant", "This word is neutral; it simply states that no one is there."), ("empty", "This word is neutral; it does not add the unsettling feeling the sentence suggests."), ("large", "This word does not relate to the eerie feeling at all.")],
   "“Derelict” suggests the building is abandoned and decaying in an unsettling way.", "Choose words that build the specific mood a scene is meant to create.")
mc("connotation", "RL.6.4", 3, "Which word has the most NEGATIVE connotation for a person who speaks their opinion often?",
   "opinionated", [("outspoken", "This word is more neutral; it states a fact about speaking up without the critical edge of “opinionated.”"), ("frank", "This word is positive; it suggests honesty without judgment."), ("direct", "This word is neutral; it simply describes a communication style.")],
   "“Opinionated” suggests the person pushes their views on others too forcefully.", "Near-synonyms for the same trait can range from admiring to critical.")
dd("connotation", "RL.6.4", 4, "Choose the word that shows admiration for someone's honesty, even when it is hard to hear: “Her classmates respected how ____ she was during the debate.”",
   "forthright", [("blunt", "This word can sound harsh or tactless, which clashes with the respect described."), ("rude", "This word is negative; it suggests a lack of courtesy, not admiration."), ("loud", "This word describes volume, not honesty.")],
   "“Forthright” suggests honest and direct in a way that earns respect.", "Context clues like “respected” can reveal whether a word's connotation fits.")
mc("connotation", "RL.6.4", 4, "A journalist wants readers to view a company's actions with suspicion. Which word should the journalist choose?",
   "scheme", [("plan", "This word is neutral; it does not suggest anything suspicious."), ("proposal", "This word is neutral; it suggests an official and open suggestion."), ("idea", "This word is neutral and too mild to suggest suspicion.")],
   "“Scheme” suggests a secretive or dishonest plan.", "Writers choose words with strong connotations to shape how readers judge events.")
mc("connotation", "RL.6.4", 4, "In “The old bridge groaned under the weight of the trucks,” what feeling does “groaned” add?",
   "A sense of strain and age, as if the bridge might fail",
   [("A sense of cheerful energy", "“Groaned” suggests stress, not cheer."), ("A sense of total silence", "“Groaned” describes a sound, which contradicts silence."), ("No feeling; it means exactly the same as “shook”", "“Groaned” adds a sense of strain that “shook” alone does not carry.")],
   "“Groaned” compares the bridge's sound to a person in pain, suggesting strain.", "Verbs that compare objects to living things can add a vivid, specific feeling.")
dd("connotation", "RL.6.4", 4, "Choose the word that makes the politician's speech sound dishonestly persuasive rather than simply convincing: “Critics called her speech pure ____, full of promises she could never keep.”",
   "propaganda", [("information", "This word is neutral; it does not suggest dishonesty."), ("advice", "This word is neutral; it suggests helpful guidance, not deception."), ("announcement", "This word is neutral; it simply states that something was shared publicly.")],
   "“Propaganda” suggests the speech was misleading rather than simply persuasive.", "Context, like the word “critics,” can signal that a strongly negative word fits.")
mc("connotation", "RL.6.4", 5, "Which word would make a report about a new law sound most like an unfair burden?",
   "imposed", [("introduced", "This word is neutral; it simply states that the law began."), ("suggested", "This word is too mild; it implies the law was optional, not a burden."), ("announced", "This word is neutral; it simply states that the law was made public.")],
   "“Imposed” suggests the law was forced on people against their wishes.", "Verbs about how something happened can carry strong connotations of their own.")
tf("connotation", "RL.6.4", 3, "The words “stubborn” and “persistent” share a denotation (continuing despite difficulty) but “persistent” usually carries a more positive connotation.", True,
   "“Persistent” suggests admirable determination, while “stubborn” suggests an unreasonable refusal to change.", "Near-synonyms often share a meaning but differ sharply in the feeling they create.")
tf("connotation", "RL.6.4", 4, "The words “mob” and “crowd” carry the exact same connotation because they both mean a group of people in one place.", False,
   "“Mob” suggests danger and disorder, while “crowd” is far more neutral.", "Check whether a near-synonym adds a judgment the original word does not.")
match("connotation", "RL.6.4", 4, "Match each neutral word with a word that carries a more NEGATIVE connotation in the same context.",
      [("question", "interrogate"), ("disagree", "clash"), ("watch", "spy"), ("change", "manipulate")],
      "Each pair shares a similar denotation, but the second word adds a harsher or more suspicious feeling.",
      "Look for words that suggest a hidden motive or conflict.")
mc("connotation", "RL.6.4", 5, "Which word would make a description of a scientist's theory sound more credible and respected?",
   "renowned", [("notorious", "This word is negative; it suggests the person is famous for something bad."), ("obscure", "This word is negative; it suggests the person is unknown or ignored."), ("average", "This word is neutral; it does not add respect or credibility.")],
   "“Renowned” suggests the scientist is widely and positively known for their work.", "Fame-related words can carry very different feelings depending on word choice.")
mc("connotation", "RL.6.4", 5, "In “She clutched the letter as if it might disappear,” what does the word “clutched” suggest about her feelings that “held” would not?",
   "A desperate need to keep the letter safe",
   [("A careless, relaxed attitude toward the letter", "“Clutched” suggests urgency, the opposite of carelessness."), ("Boredom with the letter", "“Clutched” suggests strong emotion, not boredom."), ("No difference; “clutched” and “held” create the exact same feeling", "“Clutched” adds urgency and tension that “held” does not.")],
   "“Clutched” suggests a tight, anxious grip, unlike the plain word “held.”", "A single vivid verb can reveal a character's emotional state.")
dd("connotation", "RL.6.4", 5, "Choose the word that makes the small business owner's success sound impressive rather than simply lucky: “Through years of ____ effort, she built the shop from nothing.”",
   "relentless", [("occasional", "This word is the opposite feeling; it suggests effort that was not steady."), ("minimal", "This word is the opposite feeling; it suggests very little effort."), ("easy", "This word contradicts the idea of difficult, sustained effort.")],
   "“Relentless” suggests the effort never stopped, making the success feel earned and impressive.", "Strong adjectives can shape whether an achievement feels lucky or earned.")
mc("connotation", "RL.6.4", 6, "Which word would cast a company's layoffs in the most negative light?",
   "axed", [("reduced", "This word is neutral; it simply states a decrease without harsh judgment."), ("adjusted", "This word is neutral and too mild for the seriousness of layoffs."), ("restructured", "This word is neutral and even softens the impact, unlike a harsher word.")],
   "“Axed” suggests sudden, harsh job cuts rather than a careful business decision.", "Harsh, violent-sounding words can make a routine business decision feel brutal.")
mc("connotation", "RL.6.4", 7, "A historian describes a ruler as “shrewd” in one account and “cunning” in another. Although both words mean clever at getting what one wants, which best explains the difference in feeling?",
   "“Shrewd” suggests clever and wise judgment, while “cunning” suggests clever but deceptive or untrustworthy behavior",
   [("Both words are entirely positive with no difference in feeling", "“Cunning” carries a negative, deceptive edge that “shrewd” does not."), ("Both words are entirely negative with no difference in feeling", "“Shrewd” is usually viewed as a positive trait, unlike “cunning.”"), ("The words have completely different denotations, not just different connotations", "Both words denote the same basic idea of being clever; the difference is in the feeling each creates.")],
   "“Shrewd” and “cunning” share a denotation but carry very different connotations about trustworthiness.", "When two words share a meaning, look closely at whether one judges the person more harshly.")

# ================================================================== verb-tenses
grade(4)

dd("verb-tenses", "L.4.1", 1, "Choose the FUTURE tense verb: “Next week, we ____ our cousins in Alexandria.”",
   "will visit", [("visited", "This is past tense."), ("visit", "This does not show a specific future plan without “will.”"), ("visiting", "This needs a helping verb like “will be.”")],
   "“Will visit” shows an action that has not happened yet.", "Future tense often uses the helping verb “will.”")
mc("verb-tenses", "L.4.1", 1, "Which sentence is in the PRESENT tense?",
   "Dina waters the plants every morning.",
   [("Dina watered the plants yesterday.", "This is past tense."), ("Dina will water the plants tomorrow.", "This is future tense."), ("Dina was watering the plants.", "This is past progressive tense.")],
   "“Waters” describes a routine happening now.", "Present tense often describes habits and routines.")
dd("verb-tenses", "L.4.1", 2, "Choose the PAST tense verb: “Yesterday, the baker ____ fresh bread before sunrise.”",
   "baked", [("bakes", "This is present tense."), ("will bake", "This is future tense."), ("baking", "This needs a helping verb.")],
   "“Baked” shows the action already happened.", "The word “yesterday” signals the past tense.")
mc("verb-tenses", "L.4.1", 2, "Which sentence uses the PRESENT PROGRESSIVE tense?",
   "The kittens are playing with a ball of yarn.",
   [("The kittens played with a ball of yarn.", "This is simple past tense."), ("The kittens play with a ball of yarn.", "This is simple present tense."), ("The kittens will play with a ball of yarn.", "This is future tense.")],
   "“Are playing” shows an action happening right now.", "Present progressive uses am/is/are plus an -ing verb.")
dd("verb-tenses", "L.4.1", 3, "Choose the PAST PROGRESSIVE verb: “At six o'clock, Ali ____ his homework at the kitchen table.”",
   "was doing", [("does", "This is present tense."), ("did", "This is simple past, not progressive."), ("will do", "This is future tense.")],
   "“Was doing” shows an action in progress at a specific past time.", "Past progressive uses was/were plus an -ing verb.")
err("verb-tenses", "L.4.1", 3, ["Every Friday,", " the twins cleaning", " their room", " before lunch."], 1, " the twins clean",
    "The sentence describes a weekly habit, so the simple present “clean” is needed, not “cleaning” alone.", "A repeated habit uses the simple present tense.")
mc("verb-tenses", "L.4.1", 4, "Which sentence uses the FUTURE PROGRESSIVE tense?",
   "At noon tomorrow, I will be boarding the train to Luxor.",
   [("At noon tomorrow, I board the train to Luxor.", "This is simple present, used for a scheduled event, not future progressive."), ("At noon tomorrow, I boarded the train to Luxor.", "This is past tense."), ("At noon tomorrow, I have boarded the train to Luxor.", "This is present perfect tense.")],
   "“Will be boarding” shows an action that will be in progress at a future time.", "Future progressive uses will be plus an -ing verb.")
dd("verb-tenses", "L.4.1", 4, "Choose the PRESENT PERFECT verb: “Hana ____ her science project three times already.”",
   "has revised", [("revised", "This is simple past, which does not match “already” pointing to an unfinished count of times."), ("revises", "This is simple present."), ("will revise", "This is future tense.")],
   "“Has revised” connects a past action to the present moment.", "Present perfect uses has/have plus a past participle.")
err("verb-tenses", "L.4.1", 5, ["Every night before bed,", " Grandma tell", " us", " an old folktale."], 1, " Grandma tells",
    "With “every night,” a habitual action, the verb needs the simple present “tells,” matching the singular subject Grandma.", "Habits and routines use the simple present tense; remember the -s for singular subjects.")
mc("verb-tenses", "L.4.1", 5, "Which sentence shows a correct shift from past action to its present result?",
   "Karim practiced all winter, so now he plays the piano beautifully.",
   [("Karim practiced all winter, so now he played the piano beautifully.", "Both verbs are past, which hides that he still plays well now."), ("Karim practices all winter, so now he plays the piano beautifully.", "The first verb should be past to show the practicing already happened."), ("Karim will practice all winter, so now he plays the piano beautifully.", "The first verb should show a completed past action, not a future one.")],
   "The past verb “practiced” shows what already happened, while the present verb “plays” shows the result now.", "Verb tenses can shift on purpose to show a cause in the past and a result in the present.")
tf("verb-tenses", "L.4.1", 2, "“The sun rises in the east” uses the simple present tense to state a fact that is always true.", True,
   "General facts and routines are expressed in the simple present tense.", "Use the simple present for things that are always or generally true.")

grade(5)

dd("verb-tenses", "L.5.1.b", 2, "Choose the PRESENT PERFECT verb: “Our class ____ three fundraisers this year.”",
   "has organized", [("organized", "Simple past doesn't connect the past action to the ongoing year."), ("organizes", "This is simple present."), ("will organize", "This is future tense.")],
   "“Has organized” connects past actions to the present, unfinished year.", "Present perfect often pairs with time words like “this year.”")
mc("verb-tenses", "L.5.1.b", 2, "Which sentence correctly uses the PAST PERFECT tense?",
   "By the time the bell rang, Noor had finished her test.",
   [("By the time the bell rang, Noor finishes her test.", "This is present tense."), ("By the time the bell rang, Noor finished her test.", "Simple past does not show which action happened first."), ("By the time the bell rang, Noor has finished her test.", "Present perfect doesn't fit with a past time clue like “the bell rang.”")],
   "“Had finished” shows the test was completed before the bell rang.", "Past perfect shows one past action finished before another past action.")
dd("verb-tenses", "L.5.1.b", 3, "Choose the FUTURE PERFECT verb: “By next June, Omar ____ every book in the library series.”",
   "will have read", [("will read", "This simple future doesn't show the action finishing before a future point."), ("has read", "Present perfect doesn't match a future time clue like “by next June.”"), ("reads", "This is simple present.")],
   "“Will have read” shows an action that will be completed by a specific future time.", "Future perfect uses will have plus a past participle.")
mc("verb-tenses", "L.5.1.b", 3, "Which sentence uses the PRESENT PERFECT tense to show an action continuing into now?",
   "Mariam has lived in this town for ten years.",
   [("Mariam lived in this town for ten years.", "Simple past suggests she no longer lives there."), ("Mariam lives in this town for ten years.", "This mixes a present verb with a finished time span incorrectly."), ("Mariam will live in this town for ten years.", "Future tense doesn't match an action that started in the past and continues now.")],
   "“Has lived” shows the action began in the past and is still true now.", "Present perfect with “for” shows an action continuing up to the present.")
err("verb-tenses", "L.5.1.b", 4, ["Before the guests arrived,", " Lina already clean", " the whole", " living room."], 1, " Lina had already cleaned",
    "“Before the guests arrived” signals that cleaning finished first, so the past perfect “had already cleaned” is needed.", "Use the past perfect for an action completed before another past action.")
dd("verb-tenses", "L.5.1.b", 4, "Choose the correct form: “By the end of the trip, we ____ over five hundred kilometers.”",
   "will have traveled", [("travel", "This is simple present."), ("traveled", "This doesn't connect the action to a future finishing point."), ("are traveling", "Present progressive doesn't match the future time clue “by the end.”")],
   "“Will have traveled” shows the distance will be complete by a future point.", "Future perfect works well with phrases like “by the end of.”")
mc("verb-tenses", "L.5.1.b", 4, "Which sentence has an inappropriate shift in verb tense?",
   "Rami opens his backpack and pulled out his lunch.",
   [("Rami opened his backpack and pulled out his lunch.", "Both verbs are consistently past tense."), ("Rami opens his backpack and pulls out his lunch.", "Both verbs are consistently present tense."), ("Rami will open his backpack and will pull out his lunch.", "Both verbs are consistently future tense.")],
   "The sentence shifts from present (“opens”) to past (“pulled”) without a reason.", "Keep both verbs in one sentence in the same tense unless there's a clear reason to shift.")
err("verb-tenses", "L.5.1.b", 5, ["By the time the movie started,", " we already eat", " all", " the popcorn."], 1, " we had already eaten",
    "“By the time” with a past event signals the past perfect “had already eaten,” showing the eating finished first.", "By the time usually signals that the past perfect is needed.")
mc("verb-tenses", "L.5.1.b", 5, "Which sentence correctly uses the present perfect to describe an experience without saying exactly when it happened?",
   "Dalia has visited Aswan twice.",
   [("Dalia visited Aswan twice last Tuesday.", "Naming an exact past time calls for the simple past, not the present perfect."), ("Dalia visits Aswan twice.", "Simple present doesn't fit an experience already completed some number of times."), ("Dalia will visit Aswan twice.", "Future tense doesn't fit a completed experience.")],
   "“Has visited” describes an experience that happened at some unspecified time before now.", "Present perfect works well for counting past experiences without naming an exact time.")
tf("verb-tenses", "L.5.1.b", 3, "“Have you ever tasted mango ice cream?” uses the present perfect tense to ask about a past experience without naming a specific time.", True,
   "Present perfect questions with “ever” ask about experiences at any time up to now.", "“Ever” and “never” are common signals for the present perfect tense.")

grade(6)

dd("verb-tenses", "L.6.1", 2, "Choose the correct PRESENT PERFECT form: “The committee ____ its final decision.”",
   "has announced", [("announced", "Simple past doesn't connect the decision to its present relevance."), ("announce", "This is missing the correct helping verb and present-tense agreement."), ("will announce", "Future tense doesn't match an action already completed.")],
   "“Has announced” shows a completed action that is still relevant now.", "Present perfect connects a finished past action to the present.")
mc("verb-tenses", "L.6.1", 3, "Which sentence correctly uses the FUTURE PROGRESSIVE tense?",
   "At eight tomorrow, the engineers will be testing the new bridge.",
   [("At eight tomorrow, the engineers test the new bridge.", "Simple present doesn't show an ongoing action at a specific future time."), ("At eight tomorrow, the engineers tested the new bridge.", "This is past tense."), ("At eight tomorrow, the engineers have tested the new bridge.", "Present perfect doesn't fit an action happening at a future time.")],
   "“Will be testing” shows an action that will be in progress at a specific future time.", "Future progressive uses will be plus an -ing verb.")
dd("verb-tenses", "L.6.1", 3, "Choose the correct form: “Had the storm not weakened, the ship ____ the harbor safely.”",
   "would not have reached", [("will not reach", "This doesn't match the hypothetical past condition set up by “Had the storm not weakened.”"), ("did not reach", "This states a fact rather than a hypothetical result."), ("has not reached", "Present perfect doesn't fit a hypothetical past condition.")],
   "“Would not have reached” matches the hypothetical past condition with “had.”", "Hypothetical past conditions often pair “had” with “would have.”")
mc("verb-tenses", "L.6.1", 4, "Which sentence correctly uses verb MOOD in the subjunctive?",
   "The coach insisted that every player arrive thirty minutes early.",
   [("The coach insisted that every player arrives thirty minutes early.", "After “insisted that,” the subjunctive drops the -s: “arrive,” not “arrives.”"), ("The coach insisted that every player arrived thirty minutes early.", "The subjunctive after a demand uses the base form, not the past tense."), ("The coach insisted that every player will arrive thirty minutes early.", "The subjunctive after a demand does not use “will.”")],
   "After verbs like “insisted,” the subjunctive mood uses the base form of the verb.", "Demands and requirements often trigger the subjunctive mood.")
err("verb-tenses", "L.6.1", 4, ["If the engineers had tested the design more carefully,", " the bridge collapse", " would not", " have happened."], 1, " the bridge collapsing",
    "After “the,” this needs the noun form “collapsing,” not the base verb “collapse,” to match the sentence structure.", "Check whether a word after “the” should be acting as a noun rather than a verb.")
mc("verb-tenses", "L.6.1", 4, "Which sentence has a correct and consistent sequence of tenses?",
   "After the scientists had analyzed the samples, they published their findings.",
   [("After the scientists analyze the samples, they published their findings.", "Mixing present and past tense breaks the sequence."), ("After the scientists had analyzed the samples, they publish their findings.", "The second verb should stay in the past to match the sequence."), ("After the scientists will analyze the samples, they published their findings.", "A future verb cannot logically come before a completed past action.")],
   "“Had analyzed” shows the analysis finished before the scientists published their findings.", "Use the past perfect for the earlier of two past actions.")
dd("verb-tenses", "L.6.1", 5, "Choose the correct form: “If the museum ____ its hours, more students could visit after school.”",
   "extended", [("extends", "This matches a real condition, not the hypothetical one the sentence implies."), ("will extend", "A future verb does not fit this hypothetical “if” clause."), ("has extended", "Present perfect doesn't fit this type of hypothetical condition.")],
   "A hypothetical “if” clause about an unreal present situation uses the simple past.", "Hypothetical “if” clauses about the present often use the past tense form.")
mc("verb-tenses", "L.6.1", 5, "Which sentence correctly uses the past perfect progressive tense?",
   "The researchers had been monitoring the volcano for weeks before it erupted.",
   [("The researchers have been monitoring the volcano for weeks before it erupted.", "Present perfect progressive doesn't fit an action that ended before a past event."), ("The researchers were monitoring the volcano for weeks before it erupted.", "Past progressive alone doesn't emphasize the duration leading up to the past event as clearly as the past perfect progressive."), ("The researchers monitored the volcano for weeks before it erupted.", "Simple past doesn't emphasize the ongoing duration of the action.")],
   "“Had been monitoring” emphasizes the ongoing duration of an action before another past event.", "Past perfect progressive highlights how long an action continued before a past event.")
err("verb-tenses", "L.6.1", 6, ["Although the data was incomplete,", " the researchers conclude", " that the", " treatment was effective."], 1, " the researchers concluded",
    "The rest of the sentence is in the past tense, so “concluded” keeps the verb tense consistent.", "Check that all verbs describing one event stay in the same tense unless there's a clear reason to shift.")
tf("verb-tenses", "L.6.1", 4, "The sentence “I wish I were taller” correctly uses the subjunctive mood to express a wish contrary to fact.", True,
   "The subjunctive “were” (instead of “was”) is used after “wish” to describe something that is not true.", "After verbs like wish, the subjunctive mood often uses “were” even with singular subjects.")

# ================================================================== author-claim
grade(4)

mc("author-claim", "RI.4.8", 2, "Read the paragraph, then answer the question.\n\n“Our school should add ten more minutes to recess. Students come back from recess more focused and ready to learn. Teachers have noticed fewer disruptions in the afternoon when recess is longer. A longer recess also gives students more time for exercise.”\n\nWhat is the author's claim?",
   "Recess should be ten minutes longer.",
   [("Students are unfocused in class.", "This is a problem the author mentions, not the main claim."), ("Teachers dislike disruptions.", "This is a supporting detail, not the claim."), ("Exercise is good for students.", "This is one reason given, not the overall claim.")],
   "The first sentence states exactly what the author wants to happen.", "An author's claim is often stated clearly in the first sentence.")
mc("author-claim", "RI.4.8", 2, "Read the paragraph.\n\n“Our classroom should get a pet fish. A fish teaches students responsibility because someone must feed it every day. Watching a fish swim can also calm students who feel nervous before a test. Fish are also easy to care for compared to other classroom pets.”\n\nWhich sentence gives a REASON that supports the claim?",
   "A fish teaches students responsibility because someone must feed it every day.",
   [("Our classroom should get a pet fish.", "This states the claim, not a reason."), ("Fish live in water.", "This fact is not in the paragraph and does not support the claim."), ("Students enjoy recess.", "This is unrelated to the claim about a classroom pet.")],
   "This sentence gives a specific reason—teaching responsibility—that supports getting a fish.", "A reason explains WHY the claim should be true.")
mc("author-claim", "RI.4.8", 3, "Read the paragraph.\n\n“Teachers should not assign homework on weekends. Weekends are the only time many students have to spend with family. Some students also use weekends for sports practice or chores. Without weekend homework, students return to school on Monday feeling rested.”\n\nWhich detail would make the author's argument STRONGER?",
   "A study showing that students who skip weekend homework score just as well on tests.",
   [("A list of students' favorite weekend activities.", "This does not provide evidence that homework affects learning."), ("A description of what homework usually looks like.", "This does not support the claim that weekend homework should stop."), ("A story about a teacher who loves assigning homework.", "This opposes the author's claim rather than supporting it.")],
   "Evidence connecting the claim directly to test scores would give the strongest, most convincing support.", "Strong evidence directly connects to the claim, often with facts or data.")
mc("author-claim", "RI.4.8", 3, "Read the paragraph.\n\n“Every school should offer a free breakfast. Students who eat breakfast pay better attention in morning classes. Free breakfast also means no student has to start the day hungry. Some families cannot afford to buy breakfast every morning.”\n\nWhich sentence is the author's CLAIM?",
   "Every school should offer a free breakfast.",
   [("Students who eat breakfast pay better attention.", "This is a reason supporting the claim, not the claim itself."), ("Some families cannot afford breakfast.", "This explains a problem, but it is not the main claim."), ("No student should start the day hungry.", "This restates part of a reason, not the author's overall claim.")],
   "This sentence states exactly what the author believes every school should do.", "Ask: what action does the author want readers to agree with?")
mc("author-claim", "RI.4.8", 4, "Read the paragraph.\n\n“Middle schools should start classes later in the morning. Studies show that many students do not get enough sleep when school starts too early. Starting later would help students arrive more alert and ready to learn. However, some parents worry a later start would make after-school pickup harder.”\n\nWhich sentence shows the author addressing a counterargument?",
   "However, some parents worry a later start would make after-school pickup harder.",
   [("Middle schools should start classes later in the morning.", "This is the claim, not a counterargument."), ("Studies show that many students do not get enough sleep.", "This is supporting evidence, not an opposing view."), ("Starting later would help students arrive more alert.", "This supports the claim rather than opposing it.")],
   "This sentence presents a concern from the other side of the argument—a counterargument.", "Look for words like however or but that often introduce an opposing view.")
ms("author-claim", "RI.4.8", 4, "Read the paragraph, then choose ALL the reasons the author uses to support the claim.\n\n“Our school should start a recycling program. Recycling would reduce the amount of trash sent to landfills each week. It would also teach students habits that help protect the environment. In addition, a recycling program could save the school money on trash collection fees.”",
   ["Recycling would reduce the amount of trash sent to landfills each week.", "It would also teach students habits that help protect the environment.", "a recycling program could save the school money on trash collection fees"],
   [("Our school should start a recycling program.", "This is the claim itself, not one of the supporting reasons.")],
   "The author gives three separate reasons: less landfill trash, better habits, and saved money.", "Count how many distinct reasons the author lists after stating the claim.")
mc("author-claim", "RI.4.8", 5, "Read the paragraph.\n\n“Students should be allowed to vote for changes to the lunch menu. A recent survey found that most students throw away food they dislike, wasting both money and food. Giving students a vote would likely reduce this waste because the menu would better match their preferences. A cafeteria manager at another school reported a 20 percent drop in wasted food after students began voting on menu items.”\n\nWhich piece of evidence is the STRONGEST support for the claim?",
   "A cafeteria manager at another school reported a 20 percent drop in wasted food after students began voting on menu items.",
   [("A recent survey found that most students throw away food they dislike.", "This shows a problem exists but does not prove that voting would fix it."), ("Students should be allowed to vote for changes to the lunch menu.", "This is the claim, not evidence."), ("Giving students a vote would likely reduce this waste.", "This is a prediction, not evidence that it has actually worked.")],
   "A real example with a specific result from another school gives the most convincing, concrete evidence.", "The strongest evidence is specific and shows that something similar already worked.")
mc("author-claim", "RI.4.8", 5, "Read the paragraph.\n\n“Our school needs smaller class sizes. Students learn best when teachers can give each child individual attention, which is harder in crowded classrooms. Smaller classes would also let teachers notice when a student is struggling before it becomes a bigger problem.”\n\nWhich detail would be the WEAKEST support for this claim?",
   "Many teachers say they enjoy decorating their classrooms.",
   [("Students learn best with individual attention from teachers.", "This directly connects to why smaller classes would help."), ("Teachers can notice struggling students sooner in smaller classes.", "This directly supports the benefit of smaller classes."), ("Crowded classrooms make individual attention difficult.", "This explains the problem that smaller classes would solve.")],
   "A detail about decorating has nothing to do with class size helping students learn, so it would weaken rather than strengthen the argument.", "Weak support strays from the actual claim being made.")
mc("author-claim", "RI.4.8", 6, "Read the paragraph.\n\n“The city should build a skate park near the community center. Teenagers currently skateboard in the parking lot, which city officials say has caused several near-accidents with cars. A skate park would give teens a safe place to practice. Some nearby residents argue a skate park would bring noise and crowds to their quiet street.”\n\nHow does the author handle the opposing view about noise and crowds?",
   "The author mentions it directly but does not yet offer a response to it.",
   [("The author agrees that the skate park should not be built.", "The author's claim is clearly that the park should be built."), ("The author ignores the opposing view completely.", "The opposing view is stated directly in the final sentence."), ("The author provides data proving the opposing view is false.", "No data is given to counter the concern about noise and crowds.")],
   "The paragraph states the concern about noise and crowds but stops without answering it, so the opposing view is acknowledged but not yet resolved.", "Not every text that mentions a counterargument goes on to refute it—check carefully.")
tf("author-claim", "RI.4.8", 3, "True or false: In the sentence “A new crosswalk would make it safer for students to cross the busy street near school,” the author is stating a REASON that supports a claim, not the claim itself.", True,
   "This sentence explains WHY a crosswalk is needed, which functions as a supporting reason rather than the claim.", "Reasons usually begin with or imply “because” and explain the claim.")

grade(5)

mc("author-claim", "RI.5.8", 2, "Read the paragraph.\n\n“The school library should stay open an extra hour after school. Many students do not have internet access at home for research. Students who stay late to study report getting better grades on projects that require research. An extra hour would give more students a quiet place to work.”\n\nWhat is the author's claim?",
   "The school library should stay open an extra hour after school.",
   [("Many students lack internet access at home.", "This is a reason, not the claim itself."), ("Students who stay late get better grades.", "This is supporting evidence, not the overall claim."), ("A quiet place helps students focus.", "This explains a benefit, but it is not the main claim.")],
   "The first sentence states exactly what change the author wants.", "The claim is the main point the whole paragraph is built around.")
mc("author-claim", "RI.5.8", 3, "Read the paragraph.\n\n“Our school should stop selling plastic water bottles in the cafeteria. Plastic bottles make up a large share of the trash collected on campus each week. Students could instead refill reusable bottles at the new water fountains. However, some students worry that reusable bottles are easy to forget at home.”\n\nWhich sentence presents a COUNTERARGUMENT to the author's claim?",
   "However, some students worry that reusable bottles are easy to forget at home.",
   [("Our school should stop selling plastic water bottles in the cafeteria.", "This is the claim itself."), ("Plastic bottles make up a large share of the trash collected on campus.", "This supports the claim rather than opposing it."), ("Students could instead refill reusable bottles at the new water fountains.", "This offers a solution supporting the claim, not an opposing view.")],
   "This sentence raises a concern from the other side of the issue, which is a counterargument.", "Signal words like however often introduce a counterargument.")
mc("author-claim", "RI.5.8", 3, "Read the paragraph.\n\n“All high school students should complete twenty hours of community service before graduating. Volunteering helps students build skills like teamwork and responsibility that a classroom alone cannot teach. Several local colleges also give extra consideration to applicants who have volunteered. A few students argue that mandatory service feels less meaningful than service chosen freely.”\n\nWhich piece of evidence is the LEAST relevant support for the author's claim?",
   "A few students argue that mandatory service feels less meaningful than service chosen freely.",
   [("Volunteering helps students build skills like teamwork and responsibility.", "This directly supports why service should be required."), ("Several local colleges give extra consideration to applicants who have volunteered.", "This gives a concrete benefit that supports the claim."), ("All high school students should complete twenty hours of community service.", "This is the claim itself, not a piece of evidence.")],
   "This sentence raises an objection to the claim rather than supporting it, making it the least relevant as support.", "Separate evidence that supports the claim from objections that challenge it.")
mc("author-claim", "RI.5.8", 4, "Read the paragraph.\n\n“Schools should switch to a year-round calendar with shorter, more frequent breaks. Teachers report that students forget less material over a two-week break than over a ten-week summer. Shorter breaks spread throughout the year could also reduce teacher burnout from long, uninterrupted stretches of teaching. Critics point out that families would need to adjust vacation plans.”\n\nHow does the author acknowledge the opposing view?",
   "By noting that families would need to adjust vacation plans.",
   [("By proving that families prefer year-round school.", "No proof like this is given in the paragraph."), ("By ignoring any possible objections.", "The final sentence directly raises an objection."), ("By arguing that vacations are not important to families.", "The author does not dismiss vacations; the sentence simply notes an adjustment is needed.")],
   "The last sentence states a real concern from critics, showing the author considered the other side.", "Acknowledging an opposing view means stating it clearly, even without fully answering it.")
ms("author-claim", "RI.5.8", 4, "Read the paragraph, then choose ALL the reasons the author uses to support the claim.\n\n“The city should add protected bike lanes along Market Street. Three cyclists were injured on that street last year due to a lack of separation from traffic. A protected lane would also encourage more students to bike to school instead of being driven, reducing morning traffic near the school. Nearby cities that added similar lanes saw bike use double within a year.”",
   ["Three cyclists were injured on that street last year due to a lack of separation from traffic.", "A protected lane would also encourage more students to bike to school instead of being driven, reducing morning traffic near the school.", "Nearby cities that added similar lanes saw bike use double within a year."],
   [("The city should add protected bike lanes along Market Street.", "This states the claim itself, not a supporting reason.")],
   "The author gives three separate reasons: past injuries, reduced traffic, and results from nearby cities.", "A claim is the main idea; reasons are the separate points that back it up.")
mc("author-claim", "RI.5.8", 5, "Read the paragraph.\n\n“The district should restore funding for middle school music programs. Research cited in the district's own report links music participation to improved focus in other subjects, including math. A parent group collected over four hundred signatures supporting the program's return. One parent simply said, ‘My daughter loved band class.’”\n\nWhich piece of evidence provides the WEAKEST support for the claim?",
   "One parent simply said, ‘My daughter loved band class.’",
   [("Research links music participation to improved focus in other subjects.", "This is strong evidence because it connects music directly to academic benefits."), ("A parent group collected over four hundred signatures supporting the program.", "This shows measurable, widespread support for the claim."), ("The district should restore funding for middle school music programs.", "This is the claim itself, not evidence.")],
   "A single parent's personal opinion is far less convincing than research or a large petition.", "Personal opinions are weaker evidence than data or widely shared results.")
mc("author-claim", "RI.5.8", 5, "Read the paragraph.\n\n“Teachers should be allowed to collect phones at the start of each class. A district-wide study found that classrooms with a no-phone policy had fewer reported distractions during lessons. Students also completed in-class assignments faster when phones were stored away. Some students argue they need their phones in case of a family emergency.”\n\nWhich sentence is the author's central claim?",
   "Teachers should be allowed to collect phones at the start of each class.",
   [("A district-wide study found fewer distractions with a no-phone policy.", "This is supporting evidence, not the overall claim."), ("Students completed assignments faster without phones.", "This is a supporting detail, not the central claim."), ("Some students argue they need their phones for emergencies.", "This is a counterargument, not the author's claim.")],
   "This sentence states the specific policy change the author is arguing for.", "The central claim usually appears early and states the change the author wants.")
tf("author-claim", "RI.5.8", 4, "True or false: In the paragraph “The school should offer free tutoring twice a week. Test scores in math dropped last year across every grade level. Tutoring could help close the gap for students who are struggling the most,” the sentence about dropping test scores functions as evidence that the problem the claim addresses is real, not as the claim itself.", True,
   "The sentence about test scores explains WHY tutoring is needed, serving as supporting evidence rather than the claim.", "Evidence explains or proves a claim; it does not state the claim itself.")
mc("author-claim", "RI.5.8", 5, "Read the paragraph.\n\n“Vending machines at school should only sell healthy snacks. Students who ate the current vending machine snacks reported feeling sluggish by the end of the school day, according to a student health survey. Nutritionists hired by the district recommended removing sugary snacks entirely. A few students worry that healthy snacks will cost more than the current options.”\n\nWhich detail would make the author's argument even STRONGER?",
   "The actual price comparison showing that healthy snacks would cost about the same as current options.",
   [("A list of which snacks are currently sold in the machines.", "This describes the current situation but does not strengthen the case for changing it."), ("A quote from a student who dislikes vegetables.", "This works against the claim rather than strengthening it."), ("A description of what the vending machines look like.", "This is unrelated to whether the snacks should change.")],
   "Addressing the cost concern directly with real numbers would remove the strongest objection and strengthen the case.", "The strongest additional evidence directly answers the opposing concern raised in the text.")

grade(6)

mc("author-claim", "RI.6.8", 2, "Read the paragraph.\n\n“The district should install solar panels on every school roof. Panels installed at two pilot schools cut electricity costs by nearly thirty percent within the first year. The savings could be redirected toward classroom supplies and technology. Installing panels does require a significant upfront cost, which some board members see as a drawback.”\n\nWhich sentence most clearly states the author's claim?",
   "The district should install solar panels on every school roof.",
   [("Panels installed at two pilot schools cut electricity costs by nearly thirty percent.", "This is evidence supporting the claim, not the claim itself."), ("The savings could be redirected toward classroom supplies.", "This describes a benefit, not the central claim."), ("Installing panels does require a significant upfront cost.", "This acknowledges a drawback, not the author's claim.")],
   "This sentence states the specific action the author wants the district to take.", "A claim is a specific, arguable statement the rest of the text supports.")
mc("author-claim", "RI.6.8", 3, "Read the paragraph.\n\n“Schools should ban the sale of energy drinks to students under sixteen. Pediatric health groups warn that high caffeine levels can cause heart palpitations and sleep problems in young teens. Several nearby districts have already removed energy drinks from vending machines without complaints from students. A small number of older teens argue they should be allowed to choose their own drinks.”\n\nWhich sentence functions as a counterargument the author includes?",
   "A small number of older teens argue they should be allowed to choose their own drinks.",
   [("Schools should ban the sale of energy drinks to students under sixteen.", "This is the claim."), ("Pediatric health groups warn that high caffeine levels can cause health problems.", "This supports the claim rather than opposing it."), ("Several nearby districts have already removed energy drinks without complaints.", "This supports the claim by showing the change works elsewhere.")],
   "This sentence introduces a view opposing the ban, which is a counterargument.", "A counterargument represents a view that disagrees with the author's claim.")
mc("author-claim", "RI.6.8", 4, "Read the paragraph.\n\n“The passing period between classes should be extended from four minutes to six. Hallway monitors report that the current four minutes forces students to rush, leading to more minor injuries from collisions. Teachers note that students often arrive late and miss the first few minutes of instruction. Extending the passing period would reduce the total instructional minutes in the school day by about twelve minutes.”\n\nWhich sentence works AGAINST the strength of the author's claim?",
   "Extending the passing period would reduce the total instructional minutes in the school day by about twelve minutes.",
   [("The passing period should be extended from four minutes to six.", "This is the claim itself."), ("Hallway monitors report more minor injuries from rushing.", "This supports the claim by describing a real problem."), ("Teachers note that students often arrive late and miss instruction.", "This supports the claim by describing another real problem.")],
   "This sentence reveals a real cost of the proposal, which weakens rather than strengthens the overall argument.", "A strong analysis of an argument notices details that complicate or weaken the claim, not just the ones that support it.")
mc("author-claim", "RI.6.8", 4, "Read the paragraph.\n\n“The school board should add security cameras to the main hallways. A survey of similar schools found that hallway incidents, such as fights and vandalism, dropped by nearly forty percent after cameras were installed. Cameras would also help staff resolve disputes more quickly by reviewing footage instead of relying only on student accounts. Some students worry that constant monitoring would make the school feel less welcoming.”\n\nIs the evidence in this paragraph SUFFICIENT to fully support the claim, or does it leave out an important consideration?",
   "It leaves out cost information, such as how much the cameras and their monitoring would cost the district.",
   [("The evidence is fully sufficient because it addresses every possible concern.", "The paragraph does not mention cost, a major factor in any school board decision."), ("The evidence is insufficient because it never explains what cameras are.", "A definition of cameras is unnecessary; the reader already understands what they are."), ("The evidence is insufficient because it ignores the opinions of teachers entirely.", "The paragraph focuses on student safety data and student concerns, which is a reasonable scope, even though cost is still missing.")],
   "Strong evaluation of an argument notices what is missing, such as cost, which is central to any real decision about installing cameras.", "Evaluate not just what evidence is given, but what important information might be missing.")
ms("author-claim", "RI.6.8", 5, "Read the paragraph, then choose ALL the reasons the author uses to support the claim.\n\n“The district should replace printed textbooks with tablets in every classroom. Tablets can be updated instantly when information changes, unlike textbooks that stay outdated for years. A pilot program at one middle school reported that tablets weigh far less than a backpack full of textbooks, reducing complaints about back strain. The pilot program also saved the district printing costs after the first year.”",
   ["Tablets can be updated instantly when information changes, unlike textbooks that stay outdated for years.", "A pilot program at one middle school reported that tablets weigh far less than a backpack full of textbooks, reducing complaints about back strain.", "The pilot program also saved the district printing costs after the first year."],
   [("The district should replace printed textbooks with tablets in every classroom.", "This is the claim itself, not one of the supporting reasons.")],
   "The author gives three distinct reasons: faster updates, lighter weight, and lower long-term cost.", "Separate the main claim from each individual reason that supports it.")
mc("author-claim", "RI.6.8", 5, "Read the paragraph.\n\n“Our school should prioritize building a new gym over renovating the cafeteria. The current gym cannot fit the entire student body for assemblies, forcing the school to split events across two days. Renovating the cafeteria, while nice, would mainly improve appearance rather than solve a functional problem. However, the cafeteria renovation has already been approved and partially funded.”\n\nWhich sentence most directly undermines the author's claim?",
   "However, the cafeteria renovation has already been approved and partially funded.",
   [("Our school should prioritize building a new gym over renovating the cafeteria.", "This is the claim itself."), ("The current gym cannot fit the entire student body for assemblies.", "This supports the claim by describing a real functional problem."), ("Renovating the cafeteria would mainly improve appearance rather than solve a problem.", "This supports the claim by downplaying the alternative project.")],
   "This fact about existing approval and funding creates a practical obstacle to the author's proposed priority, undermining the claim.", "Look for facts that create real obstacles to what the author is proposing.")
mc("author-claim", "RI.6.8", 6, "Read the paragraph.\n\n“The state should reduce the number of standardized tests given each year. Teachers report spending nearly three weeks of class time on test preparation and testing itself. A national study found no strong link between the number of tests given and overall student achievement. Supporters of frequent testing argue that it helps identify struggling students early.”\n\nHow does the author respond to the idea that frequent testing helps identify struggling students early?",
   "The author does not directly respond to it; the paragraph ends by simply stating that view.",
   [("The author fully agrees that frequent testing is the best way to identify struggling students.", "This contradicts the author's claim that testing should be reduced."), ("The author provides a study proving that idea is completely false.", "The cited study is about achievement overall, not specifically about identifying struggling students."), ("The author suggests testing should be increased instead of reduced.", "This contradicts the stated claim at the start of the paragraph.")],
   "The paragraph states the opposing view in its final sentence but does not go on to argue against it directly.", "Notice when a text raises an opposing view but leaves it unanswered, rather than assuming it is always refuted.")
tf("author-claim", "RI.6.8", 4, "True or false: In the paragraph “The school should allow students to wear any color sneakers instead of requiring plain white ones. A survey found that ninety percent of students support the change. Allowing more color choices would not affect learning in any measurable way,” the survey result functions as evidence rather than as the claim itself.", True,
   "The survey result supports the claim about sneaker color by showing student opinion, but it is not the claim itself.", "Evidence provides support for a claim; it is a separate sentence from the claim.")
mc("author-claim", "RI.6.8", 7, "Read the paragraph.\n\n“The high school should begin charging fifty dollars per semester for student parking permits. Visitor parking has become scarce because so many students drive to school. The fee could fund needed repaves of cracked and uneven sections of the lot. A small number of students who rely on cars for part-time jobs say the fee would be a financial burden for them.”\n\nWhich evaluation of this argument is most accurate?",
   "The argument gives relevant reasons for the fee but does not address how it might affect students who truly cannot afford it.",
   [("The argument is completely one-sided and ignores any opposing view.", "The paragraph does include a concern from students who rely on cars for jobs."), ("The argument fully resolves every concern, including cost for low-income students.", "The paragraph raises the cost concern but never proposes a solution for it, such as a reduced fee."), ("The argument is irrelevant because parking has nothing to do with school operations.", "Parking directly affects the school's lot conditions and visitor access, making it relevant.")],
   "The paragraph presents real reasons for the fee and acknowledges a concern, but it never resolves the hardship the fee could cause for some students.", "A careful evaluation checks whether a raised concern is actually resolved, not just mentioned.")

# ================================================================== prefixes
grade(4)

mc("prefixes", "L.4.4.b", 1, "What does the word “unfair” mean?",
   "not fair", [("very fair", "“Un-” means not, so this is the opposite meaning."), ("fair again", "That meaning belongs to the prefix re-, not un-."), ("extremely fair", "Un- does not add intensity; it reverses meaning.")],
   "“Un-” reverses the meaning of “fair.”", "The prefix un- usually means “not.”")
dd("prefixes", "L.4.4.b", 2, "Choose the word that means “to heat again before eating”: “Mama will ____ the soup for dinner.”",
   "reheat", [("unheat", "This is not a real word formed this way."), ("misheat", "“Mis-” means wrongly, not again."), ("preheat", "“Pre-” means before, which doesn't fit this sentence—she's warming already-cooked soup again.")],
   "“Re-” means again, so “reheat” means to heat again.", "The prefix re- usually means “again.”")
mc("prefixes", "L.4.4.b", 2, "What does “misbehave” mean?",
   "to behave in the wrong way", [("to behave again", "That meaning uses the prefix re-, not mis-."), ("to not behave at all", "“Mis-” means wrongly, not “not at all.”"), ("to behave extremely well", "This is the opposite of what mis- signals.")],
   "“Mis-” means wrongly or badly.", "The prefix mis- usually means “wrongly.”")
dd("prefixes", "L.4.4.b", 3, "Choose the word that means “to cook food before the main cooking step”: “Chefs often ____ vegetables before adding them to the stew.”",
   "precook", [("overcook", "“Over-” means too much, not before."), ("undercook", "“Under-” means not enough, not before."), ("recook", "“Re-” means again, not before.")],
   "“Pre-” means before, so “precook” means to cook beforehand.", "The prefix pre- usually means “before.”")
mc("prefixes", "L.4.4.b", 3, "The captain gave the sailors a forecast of the coming storm. What does the prefix fore- contribute to a word like “forecast” or “forewarn”?",
   "It signals that something happens ahead of time, earlier than the main event.", [("It signals opposition to the main event.", "Opposing something describes anti-, a completely different prefix."), ("It signals that an event repeats itself.", "Repetition describes re-, a completely different prefix."), ("It signals that an amount is insufficient.", "A shortage in amount describes under-, a completely different prefix.")],
   "Fore- attaches to a base word to show the action happens beforehand, as in warning or predicting ahead of time.", "The prefix fore- usually means “before” or “ahead of time.”")
mc("prefixes", "L.4.4.b", 4, "What does “nonfiction” mean?",
   "writing that is not made up; it is true", [("writing that is made up, like a fantasy story", "This describes fiction, the opposite of nonfiction."), ("writing that is written again", "That meaning uses re-, not non-."), ("writing that is too long", "The length of writing has nothing to do with the prefix non-.")],
   "“Non-” means not, so “nonfiction” means not fiction.", "The prefix non- usually means “not.”")
match("prefixes", "L.4.4.b", 3, "Match each prefix with its meaning.",
      [("in-", "not"), ("over-", "too much"), ("under-", "not enough"), ("fore-", "before")],
      "Each prefix changes the meaning of the base word in a specific, consistent way.", "Learning common prefix meanings helps you figure out new words.")

grade(5)

mc("prefixes", "L.5.4.b", 2, "What does “subway” suggest using the prefix sub- (meaning under)?",
   "a train system that runs under the ground", [("a train system that runs above the ground", "“Sub-” means under, not above."), ("a sandwich shop", "This matches a different, unrelated meaning of the word “sub,” not the prefix sub-."), ("a train that only runs at night", "The prefix sub- says nothing about timing.")],
   "“Sub-” means under, matching an underground train system.", "The prefix sub- usually means “under” or “below.”")
dd("prefixes", "L.5.4.b", 3, "Choose the word that means “larger than normal size”: “Scientists discovered a ____ star many times bigger than our sun.”",
   "supergiant", [("subgiant", "“Sub-” means under or smaller, the opposite of what the sentence describes."), ("antigiant", "“Anti-” means against, which does not fit this meaning."), ("regiant", "This is not a real word formed with a meaningful prefix.")],
   "“Super-” means above or beyond normal, matching an unusually large star.", "The prefix super- usually means “above” or “beyond.”")
mc("prefixes", "L.5.4.b", 3, "What does the prefix anti- mean in “antifreeze”?",
   "against", [("before", "That meaning belongs to the prefix pre-, not anti-."), ("together", "That meaning belongs to the prefix co-, not anti-."), ("again", "That meaning belongs to the prefix re-, not anti-.")],
   "“Anti-” means against, so “antifreeze” works against freezing.", "The prefix anti- usually means “against.”")
dd("prefixes", "L.5.4.b", 4, "Choose the word that means “to write down automatically from speech”: “The program can ____ the entire interview in minutes.”",
   "transcribe", [("describe", "This means to explain in words, not to convert speech into writing."), ("prescribe", "This means to officially recommend, which does not fit this context."), ("subscribe", "This means to sign up for something, which does not fit this context.")],
   "“Trans-” means across, matching the act of converting speech across into written form.", "The prefix trans- usually means “across” or “over.”")
mc("prefixes", "L.5.4.b", 4, "What does “cooperate” mean, using the prefix co- (meaning together)?",
   "to work together with someone", [("to work against someone", "This is the opposite meaning of the prefix co-."), ("to work alone without help", "Co- signals joining others, not working alone."), ("to stop working completely", "The prefix co- has nothing to do with stopping.")],
   "“Co-” means together, matching working jointly with others.", "The prefix co- usually means “together.”")
mc("prefixes", "L.5.4.b", 5, "What does the word “postwar” mean?",
   "happening after a war", [("happening before a war", "That meaning belongs to the prefix pre-, not post-."), ("happening during a war", "Post- specifically means after, not during."), ("happening instead of a war", "The prefix post- does not suggest a replacement.")],
   "“Post-” means after, so “postwar” means after a war.", "The prefix post- usually means “after.”")
match("prefixes", "L.5.4.b", 4, "Match each prefix with its meaning.",
      [("trans-", "across or beyond"), ("auto-", "self"), ("uni-", "one"), ("multi-", "many")],
      "Each of these prefixes comes from Latin or Greek roots and changes a word's meaning in a predictable way.", "Recognizing these prefixes can help you guess the meaning of unfamiliar words.")

grade(6)

mc("prefixes", "L.6.4.b", 2, "What does the prefix inter- mean in “international”?",
   "between or among", [("within", "That meaning belongs to the prefix intra-, not inter-."), ("around", "That meaning belongs to the prefix circum-, not inter-."), ("beyond", "That meaning belongs to the prefix ultra- or trans-, not inter-.")],
   "“Inter-” means between or among, matching relations between nations.", "The prefix inter- usually means “between” or “among.”")
dd("prefixes", "L.6.4.b", 3, "Choose the word that means “within the walls of one school”: “The debate was an ____ competition between classes rather than against other schools.”",
   "intramural", [("intermural", "This incorrectly combines inter- with the wrong root for this context."), ("extramural", "“Extra-” means outside, the opposite of within one school."), ("contramural", "This is not a standard word formed this way.")],
   "“Intra-” means within, matching a competition held inside one school.", "The prefix intra- usually means “within.”")
mc("prefixes", "L.6.4.b", 4, "What does the word “hyperactive” mean, using the prefix hyper- (meaning excessive or over)?",
   "unusually and excessively active", [("barely active at all", "That meaning would fit the prefix hypo-, which means under, not hyper-."), ("active only at night", "The prefix hyper- says nothing about timing."), ("not active in any way", "This is nearly the opposite of what hyper- signals.")],
   "“Hyper-” means excessive, matching an unusually high level of activity.", "The prefix hyper- usually means “excessive” or “over.”")
mc("prefixes", "L.6.4.b", 4, "What does the prefix contra- mean in “contradict”?",
   "against or opposite", [("together", "That meaning belongs to the prefix co-, not contra-."), ("before", "That meaning belongs to the prefix pre-, not contra-."), ("under", "That meaning belongs to the prefix sub-, not contra-.")],
   "“Contra-” means against, matching speaking against or opposite to something said.", "The prefix contra- usually means “against” or “opposite.”")
dd("prefixes", "L.6.4.b", 5, "Choose the word that means “a condition of having lower than normal body temperature”: “Doctors treated the hiker for severe ____ after the storm.”",
   "hypothermia", [("hyperthermia", "“Hyper-” means excessive, which would describe an unusually high temperature, not a low one."), ("isothermia", "This term is not used to describe this medical condition."), ("thermohypo", "This is not a correctly formed English word.")],
   "“Hypo-” means under or below, matching a dangerously low body temperature.", "The prefix hypo- usually means “under” or “below normal.”")
match("prefixes", "L.6.4.b", 5, "Match each prefix with its meaning.",
      [("circum-", "around"), ("retro-", "backward"), ("ultra-", "beyond or extreme"), ("semi-", "half")],
      "These prefixes come from Latin roots and appear often in English science and everyday vocabulary.", "Breaking a long word into its prefix and root can reveal its meaning.")
