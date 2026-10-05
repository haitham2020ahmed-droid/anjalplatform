from qb import grade, P, mc, ms, tf, dd, fill, order, err, match

grade(5)

# ============================ PASSAGES (original) ============================
TRY = P("G5-P1", "The Second Try", "Realistic Fiction", """
I had practiced my speech about sea turtles for two weeks, but when I stood in front of the class, every word I had memorized slipped away like sand through my fingers. My hands shook. I stared at my note cards, and the letters seemed to swim. After three long seconds of silence, I mumbled, "Sorry," and hurried back to my seat.

My best friend, Dana, leaned over. "You know more about turtles than anyone," she whispered. "Just talk like you're telling me." I wanted to believe her, but my face was still burning.

That afternoon, Mr. Farouk asked if I wanted to try again the next day. I almost said no. Then I remembered the baby turtles in the video we had watched—how they crawled toward the ocean even when waves knocked them back again and again.

The next morning, I left my note cards in my desk. I pictured Dana's face in the front row and began with a question: "Did you know that only one in a thousand baby sea turtles survives to adulthood?" Heads lifted. Someone gasped. My voice wobbled at first, but by the end I was smiling, and the class was asking questions I could actually answer.

Walking home, I thought about those turtles again. Being knocked back, I decided, isn't the same as being beaten.
""")

DESERT = P("G5-P2", "Catching Water in the Desert", "Expository Text", """
In some desert villages, rain falls only a few times each year. When it does come, the water rushes over the hard, dry ground and disappears before people can use it. For families who depend on farming, this creates a serious problem: how can they save water when it arrives all at once?

One solution is the rainwater cistern, an underground tank lined with stone or concrete. Gutters on rooftops guide rainwater into pipes that lead to the cistern. Because the tank is underground and covered, the water stays cool and does not evaporate quickly in the heat.

Another solution works on a larger scale. Farmers build low walls of earth called "check dams" across shallow valleys. When a storm comes, the walls slow the water down, giving it time to soak into the soil instead of running away. Over time, the stored moisture allows trees and crops to grow where little grew before.

These methods are not new. Archaeologists have found cisterns that are more than two thousand years old. Today, engineers combine ancient ideas with modern materials, such as plastic liners and solar-powered pumps, to help communities store more water than ever.
""")

STORM_A = P("G5-P3", "The Storm: Two Accounts", "Paired Texts", """
Account 1 — From Rania's journal, March 12
The wind woke me at 3 a.m. It howled around our building like an angry animal, and something metal kept banging against the balcony. I crawled into my sister's bed, and we counted the seconds between the lightning and the thunder. By morning, our street was a river. Our neighbor's car had water up to its doors. I was scared, but I also felt amazed at how powerful nature can be.

Account 2 — From the Daily Coast News, March 12
A powerful storm struck the coastal district early Thursday morning, bringing winds of up to 90 kilometers per hour and 120 millimeters of rain in six hours. Officials reported flooding on six streets and power outages affecting about 4,000 homes. No injuries were reported. City crews began clearing drains at 7 a.m., and electricity was restored to most homes by noon.
""")

CITY = P("G5-P4", "City Morning", "Poetry", """
The city yawns and stretches wide,
Its windows blink awake;
The buses grumble, side by side,
The sidewalks start to shake.

A baker sings a sugared song,
The coffee kettles hiss;
The busy, bustling, buzzing throng
Is rushing—don't you miss

The quiet way the sky turns gold
Above the rooftop line?
Before the day grows loud and bold,
That minute, friend, is mine.
""")

MOON = P("G5-P5", "Why the Moon Changes Shape", "Expository Text", """
The Moon does not make its own light. Instead, it reflects light from the Sun. At every moment, the Sun lights up half of the Moon—the half facing the Sun. What changes from night to night is how much of that lit half we can see from Earth.

As the Moon travels around Earth, our view of the lit half changes. When the Moon is between Earth and the Sun, the lit side faces away from us, so we see almost nothing. This is called a new moon. A few days later, a thin sliver appears, called a crescent. About one week after the new moon, we see half of the Moon's face lit, a phase called the first quarter. After about two weeks, the whole face we see is lit: a full moon. Then the pattern reverses until the next new moon.

The complete cycle takes about 29.5 days. People have used this dependable pattern for thousands of years to create calendars, plan farming, and celebrate holidays.
""")

# ============================ LITERATURE ============================
mc("point-of-view", "RL.5.6", 3, "From whose point of view is “The Second Try” told?",
   "the student giving the speech, in first person",
   [("Dana, the narrator's best friend", "Dana is a character the narrator talks about."),
    ("Mr. Farouk, the teacher", "Mr. Farouk is described from the outside."),
    ("an outside narrator who knows everyone's thoughts", "The story uses “I” and only shares one person's thoughts.")],
   "The narrator says “I” and describes their own shaking hands and burning face.",
   "First-person narrators use I, me, and my and are part of the story.", TRY)
mc("point-of-view", "RL.5.6", 6, "How does the first-person point of view affect how the first speech is described?",
   "Readers feel the narrator's panic from the inside, like the words “slipped away like sand.”",
   [("Readers learn exactly what every classmate was thinking.", "A first-person narrator cannot know others' thoughts."),
    ("Readers get a calm, factual report of the speech.", "The description is emotional, not factual."),
    ("Readers see the speech mainly through Dana's eyes.", "Dana does not narrate.")],
   "Because the narrator tells their own experience, we get feelings and sensations, not just events.",
   "Ask: what can THIS narrator know and feel? How does that shape what we learn?", TRY)
mc("theme", "RL.5.2", 4, "Which sentence best states the theme of the story?",
   "A setback is not a failure if you keep trying.",
   [("Sea turtles have a hard life in the ocean.", "This is a topic of the speech, not the story's lesson."),
    ("Teachers should give students second chances.", "This focuses on the teacher, not the narrator's growth."),
    ("Note cards make speeches harder.", "The narrator leaves the cards behind, but that is a detail, not the theme.")],
   "The last line—“Being knocked back … isn't the same as being beaten”—expresses the theme.",
   "Theme often appears in what a character realizes at the end.", TRY)
mc("character", "RL.5.3", 5, "How does the memory of the baby turtles help the narrator?",
   "It gives the narrator courage to try the speech again.",
   [("It makes the narrator want a new speech topic.", "The narrator keeps the same topic."),
    ("It reminds the narrator to study more facts.", "The narrator already knows the facts well."),
    ("It makes the narrator decide to skip the speech.", "The narrator decides to try again.")],
   "The turtles keep crawling despite waves, and the narrator applies that lesson to their own situation.",
   "When a character remembers something, ask how it changes their next action.", TRY)
mc("figurative-language", "RL.5.4", 4, "“Every word I had memorized slipped away like sand through my fingers.” What does this simile show?",
   "The narrator could not hold on to the words, no matter how hard they tried.",
   [("The narrator was standing on a beach.", "The speech is in a classroom; the sand is figurative."),
    ("The words were written in the sand.", "The comparison is about memory, not writing."),
    ("The narrator enjoyed the speech.", "The rest of the paragraph shows fear.")],
   "Sand runs out of your hand even when you grip it—just as the words escaped the nervous narrator.",
   "Figure out what quality the two things share.", TRY)
mc("character", "RL.5.3", 6, "Compare the narrator at the first speech with the narrator at the second speech.",
   "First the narrator relies on note cards and freezes; second the narrator speaks freely and engages the class.",
   [("The narrator is nervous both times and never improves.", "By the end, the narrator is smiling and answering questions."),
    ("The narrator is confident both times.", "The narrator's hands shook the first time."),
    ("The narrator reads more cards the second time.", "The cards stay in the desk the second time.")],
   "The change from shaking and mumbling to smiling and answering questions shows growth.",
   "Compare the same character at two points in a story to see how they change.", TRY)
ms("text-evidence", "RL.5.1", 5, "Which TWO quotations show that the second speech went well?",
   ["“Heads lifted. Someone gasped.”", "“the class was asking questions I could actually answer.”"],
   [("“My voice wobbled at first.”", "This shows some nervousness."),
    ("“I almost said no.”", "This happens before the second speech.")],
   "The class reacting with interest and asking questions shows success.",
   "Choose evidence that directly proves the answer, not details that point the other way.", TRY)
tf("inference", "RL.5.1", 4, "True or false: The narrator starts the second speech with a surprising fact to grab the audience's attention.", True,
   "Starting with “Did you know…?” and a surprising statistic makes heads lift—an attention-grabbing hook.",
   "Infer the purpose of a choice by looking at its effect on others.", TRY)

mc("poetry-elements", "RL.5.5", 4, "How do the three stanzas of “City Morning” fit together?",
   "Stanzas 1–2 show the city waking up loudly; stanza 3 turns to the speaker's quiet moment.",
   [("Each stanza describes a different city.", "All three describe the same morning."),
    ("The stanzas tell events from evening to midnight.", "The poem takes place in the morning."),
    ("Every stanza repeats the same idea in the same way.", "The last stanza shifts to a new idea.")],
   "The first two stanzas build noise and activity; the last stanza contrasts it with a quiet golden sky.",
   "Look for a turn: a word like “but” or a change in mood between stanzas.", CITY)
mc("figurative-language", "RL.5.4", 3, "“The city yawns and stretches wide.” What kind of figurative language is this?",
   "personification", [("simile", "There is no like or as."), ("rhyme", "Rhyme is about sounds, not giving human actions."), ("onomatopoeia", "Yawn is not a sound word here.")],
   "The city is given human actions (yawning and stretching), so this is personification.",
   "Personification = giving human qualities to something that isn't human.", CITY)
mc("sound-devices", "RL.5.4", 5, "“The busy, bustling, buzzing throng.” Which sound device is used?",
   "alliteration — repeated b sounds", [("rhyme — the words end with the same sound", "The words share beginning sounds, not ending sounds."), ("onomatopoeia — every word is a sound", "Busy and bustling are not sound words."), ("repetition of a whole line", "No full line repeats.")],
   "Repeating the starting sound b in nearby words is alliteration. It makes the line sound fast and noisy.",
   "Alliteration = same first consonant sound in a row of words.", CITY)
mc("theme", "RL.5.2", 6, "How does the speaker reflect on the morning in the last stanza?",
   "The speaker values a short, quiet moment before the busy day begins.",
   [("The speaker wishes the city were louder.", "The speaker prefers the quiet minute."),
    ("The speaker complains about the baker's singing.", "The baker is part of the description, not a complaint."),
    ("The speaker plans to leave the city forever.", "Nothing suggests leaving.")],
   "“That minute, friend, is mine” shows the speaker treasures the calm moment.",
   "In poems, the speaker's final lines often reveal their feelings about the topic.", CITY)

# ============================ INFORMATIONAL ============================
mc("problem-solution", "RI.5.5", 3, "What problem does “Catching Water in the Desert” describe?",
   "Rainwater rushes away before people can use it.",
   [("Deserts have too many farmers.", "The text never says this."),
    ("Cisterns are too old to work.", "Old cisterns are evidence that the idea works."),
    ("Solar pumps are expensive.", "Cost is not discussed.")],
   "Paragraph 1 explains that rare rain rushes over dry ground and disappears.",
   "Problem-and-solution texts usually state the problem first.", DESERT)
ms("problem-solution", "RI.5.5", 4, "Which solutions does the article describe? Choose all that apply.",
   ["underground cisterns", "check dams across valleys"],
   [("cloud seeding to make rain", "This is not mentioned."), ("moving villages to rivers", "This is not mentioned.")],
   "The article explains two solutions: cisterns and check dams.",
   "Look for signal words: One solution…, Another solution….", DESERT)
mc("cause-effect", "RI.5.3", 4, "Why does water in a cistern evaporate slowly?",
   "The tank is underground and covered, so it stays cool.",
   [("Plastic liners stop water from moving.", "Liners are a modern material; the article links slow evaporation to being underground and covered."),
    ("Gutters cool the water.", "Gutters only guide water into pipes."),
    ("Check dams protect the cisterns.", "Check dams are a separate solution.")],
   "“Because the tank is underground and covered, the water stays cool and does not evaporate quickly.”",
   "Because introduces a cause.", DESERT)
mc("central-idea", "RI.5.2", 5, "Which TWO main ideas does the article develop?",
   "Desert communities face a water problem, and both ancient and modern methods help solve it.",
   [("Deserts are hot, and rain is dangerous.", "Rain is helpful when it can be saved."),
    ("Archaeologists study old tanks, and engineers build pumps.", "These are supporting details."),
    ("Farmers dislike storms, and walls stop floods.", "The walls help water soak in; they don't just stop floods.")],
   "The article explains the problem and then shows old and new ways to store water.",
   "Grade 5 texts may have more than one main idea. Check each section.", DESERT)
mc("context-clues", "L.5.4.a", 4, "“The water stays cool and does not evaporate quickly in the heat.” What does evaporate mean?",
   "turn into vapor and disappear into the air", [("freeze into ice", "Freezing happens in cold, not heat."), ("become dirty", "Nothing suggests dirt."), ("flow downhill", "Flowing is not caused by heat.")],
   "Heat causes water to disappear into the air—a cause/effect clue to the meaning.",
   "L.5.4: cause-and-effect relationships can reveal meaning.", DESERT)
mc("author-purpose", "RI.5.8", 6, "Why does the author mention that some cisterns are more than two thousand years old?",
   "to support the point that these water-saving methods are not new",
   [("to show that cisterns break easily", "Surviving 2,000 years suggests the opposite."),
    ("to explain how solar pumps work", "Pumps are mentioned later as modern."),
    ("to prove deserts used to have more rain", "The detail is about the method, not the climate.")],
   "The sentence before says “These methods are not new.” The ancient cisterns are evidence for that point.",
   "Find which point a detail supports by reading the sentence just before it.", DESERT)

mc("compare-texts", "RI.5.6", 4, "How are the two accounts of the storm different?",
   "Rania's journal describes feelings and experiences; the news report gives facts and numbers.",
   [("Both accounts give exact wind speeds.", "Only the news report gives wind speed."),
    ("The news report describes being scared at night.", "Feelings appear only in the journal."),
    ("They describe two different storms.", "Both describe the same March 12 storm.")],
   "A firsthand account tells personal experience; a secondhand account reports facts.",
   "Ask: Who wrote it? Were they there? What do they focus on?", STORM_A)
mc("compare-texts", "RI.5.6", 5, "Which information appears ONLY in the news report?",
   "Electricity was restored to most homes by noon.",
   [("The storm happened during the night.", "Both accounts show it happened early in the morning."),
    ("There was flooding on the streets.", "Both mention flooding."),
    ("The wind was very strong.", "Both describe strong wind.")],
   "Only the reporter gives details about crews and power being restored.",
   "Compare point of view: what can each writer know?", STORM_A)
mc("figurative-language", "L.5.5.a", 3, "In Rania's journal, the wind “howled … like an angry animal.” This is an example of —",
   "a simile", [("a metaphor", "The comparison uses like."), ("an idiom", "It is a new comparison, not a common saying."), ("a fact", "It is a figurative description.")],
   "The wind is compared to an animal using like, so it is a simile.", "Simile = like/as.", STORM_A)

mc("sequence", "RI.5.3", 3, "About one week after a new moon, what phase do we see?",
   "first quarter", [("full moon", "A full moon appears after about two weeks."), ("crescent", "A crescent appears just a few days after the new moon."), ("new moon", "That is the starting point.")],
   "The article says about one week after the new moon we see the first quarter.",
   "In sequence texts, notice time words: a few days later, about one week, after two weeks.", MOON)
order("sequence", "RI.5.3", 4, "Put the Moon's phases in order, starting with the new moon.",
      ["new moon", "crescent", "first quarter", "full moon"],
      "The lit part we can see grows from nothing, to a sliver, to half, to the whole face.",
      "Use the time clues in the text to order events.", MOON)
mc("cause-effect", "RI.5.3", 6, "Why do we see almost nothing during a new moon?",
   "The lit side of the Moon is facing away from Earth.",
   [("The Moon stops reflecting light.", "The Sun always lights half the Moon."),
    ("Clouds always cover the Moon at that time.", "Weather is not mentioned."),
    ("Earth's shadow covers the whole Moon.", "The text explains phases by viewing angle, not Earth's shadow.")],
   "The Moon is between Earth and the Sun, so its lit half faces away from us.",
   "Read carefully for the scientific reason, not a guess from everyday experience.", MOON)
tf("central-idea", "RI.5.2", 5, "True or false: According to the article, the amount of the Moon that the Sun lights up changes every night.", False,
   "The Sun always lights half the Moon. What changes is how much of that lit half WE can see.",
   "Watch for statements that sound right but change one key detail.", MOON)
mc("context-clues", "L.5.4.a", 5, "“People have used this dependable pattern for thousands of years.” What does dependable mean?",
   "able to be trusted to happen the same way", [("hard to understand", "People could use it for calendars, so it must be easy to predict."), ("brand new", "It has been used for thousands of years."), ("very bright", "Brightness is not related to the word.")],
   "A pattern used for calendars must be reliable; depend + -able = able to be depended on.",
   "Combine context with word parts to check your answer.", MOON)

# ============================ VOCABULARY ============================
mc("greek-latin-roots", "L.5.4.b", 3, "The Greek root tele means far, and scope means look. What is a telescope?",
   "a tool for looking at things far away", [("a tool for hearing far away", "Phone means sound; scope means look."), ("a tool for writing", "Graph means write."), ("a small, close object", "Tele means far, not close.")],
   "Tele (far) + scope (look) = a tool to look at far objects.", "Learn common roots: tele, scope, graph, phon, auto, bio.")
match("greek-latin-roots", "L.5.4.b", 5, "Match each root to its meaning.",
      [("aud", "hear"), ("vis / vid", "see"), ("port", "carry"), ("struct", "build")],
      "Audience (hear), visible (see), transport (carry), construct (build).",
      "Think of a word you know with the root to remember its meaning.")
mc("greek-latin-roots", "L.5.4.b", 6, "The Latin root dict means say or speak. Which word means “to say what will happen in the future”?",
   "predict", [("dictionary", "A dictionary contains words but doesn't describe the future."), ("contradict", "Contra (against) + dict = to say the opposite."), ("dictate", "Dictate means to say aloud for someone to write.")],
   "Pre (before) + dict (say) = to say beforehand.", "Combine the prefix and the root meanings.")
mc("homographs-homophones", "L.5.5.c", 4, "In which sentence does wind mean to turn or twist?",
   "Please wind the string around the spool.",
   [("The wind blew the leaves away.", "Here wind is moving air."), ("A strong wind knocked the sign over.", "This is moving air."), ("The wind felt cold this morning.", "This is moving air.")],
   "Wind (rhymes with find) is a verb meaning to turn. Wind (rhymes with pinned) is moving air.",
   "Homographs are spelled the same but have different meanings and sometimes different pronunciations.")
mc("homographs-homophones", "L.5.5.c", 5, "“The doctor wound a bandage around the wound.” What do the two words mean?",
   "first: wrapped; second: an injury", [("first: an injury; second: wrapped", "The order is reversed."), ("both mean an injury", "The first wound is an action."), ("both mean wrapped", "The second wound is a thing that is wrapped.")],
   "Wound (rhymes with sound) is the past of wind; wound (rhymes with moon) is an injury.",
   "Use each word's job in the sentence (action or thing) to choose its meaning.")
mc("idioms-adages", "L.5.5.b", 4, "What does the proverb “Actions speak louder than words” mean?",
   "What people do shows more than what they say.",
   [("People should speak more loudly.", "This is too literal."), ("Quiet people are better.", "The proverb is not about quiet people."), ("Words are more important than actions.", "It means the opposite.")],
   "This proverb teaches that behavior proves what a person really means.", "Proverbs give advice or a truth about life.")
mc("idioms-adages", "L.5.5.b", 5, "“We're in the same boat,” said Lina when both of them forgot their homework. What does she mean?",
   "They are in the same situation.", [("They are going sailing.", "There is no real boat."), ("They both like boats.", "This is the literal meaning."), ("They need to row together.", "The idiom is about sharing a situation, not rowing.")],
   "“In the same boat” means facing the same problem.", "Idioms can't be understood word by word.")
mc("figurative-language", "L.5.5.a", 6, "Which sentence uses a metaphor?",
   "The classroom was a beehive of activity.",
   [("The classroom was as busy as a beehive.", "This uses as … as, so it is a simile."), ("The classroom was very busy.", "This is literal."), ("Bees live in hives.", "This is a literal fact.")],
   "The metaphor says the classroom IS a beehive to show how busy it was.", "Metaphors compare without like or as.")
mc("synonyms-antonyms", "L.5.5.c", 4, "Which pair of words are antonyms?",
   "ancient / modern", [("ancient / old", "These are synonyms."), ("modern / new", "These are synonyms."), ("ancient / historic", "These are similar.")],
   "Ancient means very old; modern means new—opposites.", "Antonyms are opposites.")
mc("context-clues", "L.5.4.a", 6, "Compared to the noisy cafeteria, the library felt serene. What does serene mean?",
   "calm and peaceful", [("crowded", "The comparison with noisy suggests the opposite."), ("boring", "Serene describes a peaceful feeling, not interest."), ("dark", "Nothing mentions light.")],
   "A comparison with noisy shows that serene means quiet and calm.", "L.5.4.a: comparisons in a sentence are clues to meaning.")
mc("context-clues", "L.5.4.c", 3, "Which resource would BEST help you find a synonym for happy?",
   "a thesaurus", [("an atlas", "An atlas contains maps."), ("an encyclopedia", "An encyclopedia gives facts about topics."), ("a calendar", "A calendar shows dates.")],
   "A thesaurus lists synonyms and antonyms.", "Dictionary → meaning and pronunciation; thesaurus → synonyms.")

# ============================ GRAMMAR (L.5.1) ============================
mc("compound-sentences", "L.5.1.a", 3, "Which word is a conjunction in this sentence? “I wanted pizza, but my sister wanted pasta.”",
   "but", [("wanted", "Wanted is a verb."), ("my", "My is a possessive pronoun."), ("pasta", "Pasta is a noun.")],
   "But joins two ideas, so it is a conjunction.", "Coordinating conjunctions: for, and, nor, but, or, yet, so.")
mc("prepositions", "L.5.1.a", 4, "Which word is an interjection? “Wow, that roller coaster was fast!”",
   "Wow", [("that", "That is a demonstrative."), ("fast", "Fast is an adjective."), ("was", "Was is a verb.")],
   "An interjection is a word that shows strong feeling, often followed by a comma or exclamation point.", "Interjections: wow, oh, ouch, hooray.")
mc("verb-tenses", "L.5.1.b", 4, "Which sentence uses the present perfect tense?",
   "She has finished her science project.",
   [("She finished her science project.", "This is simple past."), ("She had finished before dinner.", "This is past perfect."), ("She will have finished by Friday.", "This is future perfect.")],
   "Present perfect = has/have + past participle.", "Perfect tenses use has, have, had, or will have.")
dd("verb-tenses", "L.5.1.b", 5, "By the time we arrived, the movie ____ already started.", "had",
   [("has", "Has is present perfect; the sentence is about the past."), ("will have", "Will have is future."), ("have", "Have does not match the singular movie or past time.")],
   "Past perfect (had + participle) shows an action finished before another past action.", "Two past actions? The earlier one often uses had.")
mc("verb-tenses", "L.5.1.d", 5, "Which sentence has an inappropriate shift in verb tense?",
   "Yesterday we walk to the store and bought milk.",
   [("Yesterday we walked to the store and bought milk.", "Both verbs are in the past."), ("Every day we walk to the store and buy milk.", "Both verbs are in the present."), ("Tomorrow we will walk to the store and buy milk.", "Both verbs refer to the future.")],
   "Yesterday shows past time, so walk should be walked to match bought.", "Keep verb tenses consistent unless the time actually changes.")
err("verb-tenses", "L.5.1.d", 6, ["Last summer, my family", "travels to the mountains", "and stayed in a cabin."], 1, "traveled to the mountains",
    "“Last summer” and “stayed” show past time, so the verb must be traveled.", "Find the time clue, then check every verb against it.")
mc("compound-sentences", "L.5.1.e", 4, "Which pair of correlative conjunctions completes the sentence? “You can ____ walk ____ ride your bike.”",
   "either … or", [("neither … or", "Neither pairs with nor."), ("both … or", "Both pairs with and."), ("not only … or", "Not only pairs with but also.")],
   "Correlative conjunctions come in pairs: either/or, neither/nor, both/and, not only/but also.", "Memorize the four pairs.")
dd("compound-sentences", "L.5.1.e", 5, "Neither my brother ____ my sister likes spinach.", "nor",
   [("or", "Or pairs with either."), ("and", "And pairs with both."), ("but", "But is not part of this pair.")],
   "Neither always pairs with nor.", "N goes with N: Neither → Nor.")
mc("pronouns", "L.5.1", 4, "Which sentence has correct pronoun-antecedent agreement?",
   "Each student brought his or her own lunch.",
   [("Each student brought their own lunches.", "Each is singular, so lunches should be lunch."), ("Each student brought our own lunch.", "Our does not refer to student."), ("Each student brought its own lunch.", "Its is for things, not people.")],
   "Each is singular, so the pronoun and noun that follow must be singular.", "Words like each, every, and everyone are singular.")
mc("adverbs", "L.5.1", 4, "Which sentence uses a relative adverb correctly?",
   "I remember the day when we moved here.",
   [("I remember the day where we moved here.", "Day is a time, so use when."), ("This is the reason when I'm late.", "Reason needs why."), ("That's the house why I grew up.", "House is a place, so use where.")],
   "When refers to a time (day).", "where → place, when → time, why → reason.")
mc("clauses-complex", "L.5.1", 5, "Which sentence is complex (has an independent clause and a dependent clause)?",
   "Although it was late, we finished the game.",
   [("We finished the game.", "This is one independent clause."), ("It was late, and we finished the game.", "This is compound: two independent clauses."), ("Finishing the game late.", "This is a fragment.")],
   "“Although it was late” cannot stand alone, so the sentence is complex.", "Dependent clauses often begin with although, because, when, if, since.")
mc("comparatives", "L.5.1", 4, "Which word correctly completes: “This is the ____ book I have ever read.”",
   "best", [("better", "Better compares two things."), ("goodest", "Good is irregular; goodest is not a word."), ("more good", "Use best, not more good.")],
   "Comparing with all books ever read needs the superlative best.", "good → better → best; bad → worse → worst.")

# ============================ MECHANICS (L.5.2) ============================
mc("commas", "L.5.2.a", 2, "Which sentence uses commas correctly in a series?",
   "We packed sandwiches, apples, and juice.",
   [("We packed sandwiches apples, and juice.", "A comma is missing after sandwiches."), ("We packed, sandwiches, apples, and juice.", "No comma after the verb."), ("We packed sandwiches, apples, and, juice.", "No comma after and.")],
   "Use commas to separate three or more items in a series.", "Put a comma after each item except the last.")
mc("commas", "L.5.2.b", 3, "Which sentence correctly uses a comma after an introductory element?",
   "After the bell rang, the students lined up.",
   [("After the bell rang the students, lined up.", "The comma is in the wrong place."), ("After, the bell rang the students lined up.", "After is part of the introductory phrase."), ("After the bell, rang the students lined up.", "The comma splits the clause.")],
   "Put a comma after an introductory phrase or clause.", "Read it aloud; the comma goes where you naturally pause after the opener.")
mc("commas", "L.5.2.c", 4, "Which sentence correctly uses a comma for direct address?",
   "Maya, please close the door.",
   [("Maya please, close the door.", "The comma should come right after the name."), ("Maya please close, the door.", "The comma is in the wrong place."), ("Maya please close the door.", "A comma is needed after the name.")],
   "Use a comma to set off the name of the person you are speaking to.", "Direct address = talking TO someone by name.")
mc("commas", "L.5.2.c", 5, "Which sentence correctly punctuates a tag question?",
   "You finished the report, didn't you?",
   [("You finished the report didn't you?", "A comma is needed before the tag."), ("You finished, the report didn't you?", "The comma is in the wrong place."), ("You finished the report, didn't you.", "A question needs a question mark.")],
   "Separate a tag question from the rest of the sentence with a comma.", "Tag questions: isn't it? didn't you? won't they?")
mc("titles-abbreviations", "L.5.2.d", 4, "Which shows the correct way to write the title of a book?",
   "My favorite book is Charlotte's Web.",
   [("My favorite book is “Charlotte's Web.”", "Quotation marks are for short works such as stories and poems."), ("My favorite book is charlotte's web.", "Titles need capital letters."), ("My favorite book is CHARLOTTE'S WEB.", "Do not write titles in all capitals.")],
   "Book titles are italicized (or underlined when handwritten).", "Long works (books, movies) → italics; short works (poems, songs) → quotation marks.")
fill("spelling", "L.5.2.e", 4, "Change to plural: one shelf, two ____.", ["shelves"],
     "For many words ending in f, change f to v and add -es: shelf → shelves.", "f/fe → ves: leaf → leaves, knife → knives.")
mc("spelling", "L.5.2.e", 5, "Which word is spelled correctly?", "necessary",
   [("neccessary", "Only one c."), ("necesary", "Two s's are needed."), ("neccesary", "One c and two s's.")],
   "Necessary has one c and two s's.", "Memory trick: one Collar and two Sleeves.")

# ============================ LANGUAGE USE & WRITING ============================
mc("combining-sentences", "L.5.3.a", 4, "Which sentence best combines these? “The fox was hungry. The fox searched the field.”",
   "The hungry fox searched the field.",
   [("The fox was hungry, the fox searched the field.", "This is a comma splice that repeats the fox."), ("The fox was hungry and the fox searched.", "This repeats the subject and drops a detail."), ("Hungry. The fox searched the field.", "This creates a fragment.")],
   "Moving hungry before fox combines the ideas into one clear sentence.", "Combine by turning a short sentence into an adjective or phrase.")
mc("writing-informative", "L.5.6", 4, "Choose the best transition: “Recycling saves resources. ____, it reduces the amount of trash in landfills.”",
   "In addition", [("However", "However shows a contrast; these ideas agree."), ("For instance", "The second sentence is not an example of the first."), ("As a result", "The second idea is another benefit, not a result.")],
   "In addition adds another supporting point.", "Transitions: adding (also, in addition), contrast (however), example (for instance), result (as a result).")
mc("writing-argument", "W.5.1.c", 5, "Which phrase BEST links a reason to the opinion in an essay?",
   "This matters because", [("Once upon a time", "This begins a story, not an argument."), ("In my bedroom", "This is a place, not a link."), ("The end", "This ends a story.")],
   "Linking phrases such as “this matters because” or “consequently” connect reasons to opinions.", "W.5.1.c: link opinion and reasons with words, phrases, and clauses.")
order("writing-narrative", "W.5.3.c", 4, "Put the sentences in order to show a clear sequence in a narrative.",
      ["At first, the cave seemed silent and empty.", "Then a faint drip echoed from the darkness.",
       "Moments later, my flashlight caught the glitter of an underground pool.", "Finally, I understood where the sound had been coming from."],
      "Transitions (At first, Then, Moments later, Finally) show the order of events.",
      "W.5.3.c: use transitional words to manage the sequence of events.")
mc("precise-language", "W.5.3.d", 5, "Which sentence uses the most concrete and sensory details?",
   "The cold rain stung my cheeks as I sprinted across the slippery bridge.",
   [("The weather was bad as I went across.", "Bad and went are vague."), ("It was raining a lot outside.", "This tells, but doesn't show."), ("I didn't like the rain that day.", "This states a feeling without details.")],
   "Stung, sprinted, and slippery help readers feel and see the moment.", "Show, don't tell: use verbs and details the reader can sense.")
mc("writing-research", "W.5.8", 6, "Which is the best way to take notes from a source without plagiarizing?",
   "Write the key facts in your own words and record the source.",
   [("Copy every sentence exactly.", "Copying is plagiarism unless you quote and credit the source."), ("Change one word in each sentence.", "Small changes are still copying."), ("Skip recording the source.", "You must list sources you use.")],
   "Paraphrasing and listing sources shows respect for others' work.", "Read, cover the text, and write what you remember in your own words.")
