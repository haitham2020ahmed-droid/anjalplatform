"""
Question bank top-up 2, batch 11: brings these families to the full target of 50 items each
(original content, Grades 4-6).
Families: text-structure (Grade 6), possessive-nouns (Grades 4-5), quotations-dialogue
(Grades 4-6), central-idea (Grades 4-6).
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== text-structure (Grade 6)
grade(6)

# ---- passage-based: Should Homework Be Optional? (G6-P10) ----
mc("text-structure", "RI.6.5", 1, "True or false style check turned question: does paragraph 2 of “Should Homework Be Optional?” tell a story about one specific student’s day, or does it use research to respond to a claim?",
   "It uses research evidence to respond to a claim — it counters the idea that homework improves scores with findings from multiple studies.",
   [("It tells a story about one specific student’s homework routine.", "No single student’s personal routine is described anywhere in paragraph 2."),
    ("It lists homework rules from several different countries.", "No countries or their homework rules are compared in this paragraph."),
    ("It describes what a typical homework assignment looks like.", "The paragraph evaluates a claim with research, not describe assignment contents.")],
   "Paragraph 2 states a common claim and then counters it with a review of research studies.",
   "In argument paragraphs, check whether a claim is being tested against evidence.", "G6-P10")
tf("text-structure", "RI.6.5", 1, "True or false: paragraph 3 of “Should Homework Be Optional?” is organized as a chronological account of a single school year.", False,
   "Paragraph 3 explains what an optional-homework system would look like in practice, not a year-by-year account.",
   "Check what a paragraph is actually doing, not just its general topic.", "G6-P10")
mc("text-structure", "RI.6.5", 3, "Which structure describes paragraph 5 of “Should Homework Be Optional?” (the one about stress and sleep) on its own?",
   "cause and effect — heavy mandatory homework is shown to cause higher stress and less sleep in students",
   [("compare and contrast — it compares two different named schools’ homework policies", "No two specific named schools are compared anywhere in this paragraph."),
    ("chronological order — it lists stress levels recorded each month of the school year", "No month-by-month data or timeline is given in this paragraph."),
    ("problem and solution — it proposes a specific fix for student stress", "This paragraph names a cost of mandatory homework; the proposed fix appears earlier, in paragraph 3.")],
   "The paragraph links one cause (heavy mandatory homework) to two effects (stress and poor sleep).",
   "Look for words like “linked to” that connect a cause to its effects.", "G6-P10")
mc("text-structure", "RI.6.5", 4, "How does the author organize paragraph 4 of “Should Homework Be Optional?”, the one addressing the worry about struggling students falling behind?",
   "It raises a counterargument and then answers it with a new reason, rather than simply repeating the original claim.",
   [("It simply restates the article’s main claim three times in a row.", "The paragraph introduces a specific counterargument and a new reason, not a repeated restatement."),
    ("It compares struggling students in two different grade levels.", "No specific grade levels are compared against each other in this paragraph."),
    ("It lists the exact daily schedule of a struggling student.", "No daily schedule for any student is described in this paragraph.")],
   "The paragraph names a worry (falling behind), then offers a new, specific reason why flexible homework could actually help.",
   "A strong rebuttal paragraph often follows a worry with a fresh reason, not a repeated claim.", "G6-P10")
order("text-structure", "RI.6.5", 5, "Put these paragraph functions from “Should Homework Be Optional?” in the order they appear in the text.",
      ["Introduce the issue and state the author’s claim that homework should be optional",
       "Counter the claim that mandatory homework improves achievement, using research",
       "Explain what an optional-homework system would actually look like in practice",
       "Answer the worry that struggling students would fall behind",
       "Link heavy mandatory homework to stress and poor sleep",
       "Restate that flexible homework would likely help both wellbeing and learning"],
      "The article builds step by step: claim, evidence against mandatory homework, a practical explanation, a rebuttal, a wellbeing cost, and a closing restatement.",
      "Identify the JOB each paragraph does, then put those jobs in the order they appear.", "G6-P10")
match("text-structure", "RI.6.5", 6, "Match each paragraph’s main structural job in “Should Homework Be Optional?” with its paragraph number.",
      [("Paragraph 1", "introduces the issue and states the author’s claim"),
       ("Paragraph 2", "counters the achievement claim using research evidence"),
       ("Paragraph 4", "raises and answers the falling-behind counterargument"),
       ("Paragraph 6", "restates the claim to close the argument")],
      "Each numbered paragraph plays a specific structural role in building the overall argument.",
      "Identify the JOB each paragraph does within the text’s overall structure.", sub=None, passage="G6-P10")

# ---- additional passage-based angles: Coral Reefs Under Pressure (G6-P3), four-day week (G6-P2) ----
mc("text-structure", "RI.6.5", 1, "What is paragraph 1 of “Coral Reefs Under Pressure” primarily organized to do?",
   "describe several specific ways reefs matter to ocean life, using examples such as fish shelter, sea turtle food and storm protection",
   [("compare two different oceans’ reef populations", "No second ocean is named or compared anywhere in paragraph 1."),
    ("list the exact steps scientists use to study a reef", "No research steps or scientific procedures are described in this paragraph."),
    ("explain a single cause-and-effect chain about reef damage", "Paragraph 1 lists reasons reefs matter; the cause-and-effect chain about damage appears later, in paragraph 3.")],
   "The paragraph lists several distinct examples of why reefs matter, one after another.",
   "A paragraph that names several separate examples about one topic is usually a description structure.", "G6-P3")
tf("text-structure", "RI.6.5", 2, "True or false: paragraph 4 of “Coral Reefs Under Pressure” describes two different solutions scientists are trying to help reefs recover.", True,
   "Paragraph 4 names both growing corals in nurseries and breeding heat-tolerant corals as two separate responses.",
   "When a paragraph lists more than one fix for the same problem, it is still organized as problem-and-solution.", "G6-P3")
mc("text-structure", "RI.6.5", 3, "Which structure best describes paragraph 3 of “Should Schools Switch to a Four-Day Week?”, the paragraph about saving money?",
   "claim and evidence — it states the money-saving claim, then presents cost data that undercuts it",
   [("chronological order — it lists a school’s budget month by month", "No month-by-month budget figures are given in this paragraph."),
    ("compare and contrast — it compares bus costs in two different districts", "No two specific districts’ bus costs are directly compared against each other."),
    ("description only — it simply lists what a school budget contains", "The paragraph tests a specific claim with evidence, rather than just listing budget categories.")],
   "The paragraph states supporters’ money-saving claim and then responds with specific cost figures.",
   "In argumentative texts, check whether a paragraph tests a claim with evidence.", "G6-P2")
tf("text-structure", "RI.6.5", 2, "True or false: the article as a whole, “Should Schools Switch to a Four-Day Week?”, uses chronological order, describing how a single school week changes hour by hour.", False,
   "The article is organized around testing supporters’ separate claims with evidence, not around an hour-by-hour account of one week.",
   "Do not assume a structure just from a text’s topic — check how the paragraphs actually connect.", "G6-P2")

# ---- self-contained items: a variety of original short passages and structures ----
mc("text-structure", "RI.6.5", 1, "Read this paragraph: “Houseplants kept away from windows often grow pale and droopy. Without enough sunlight, a plant cannot make the food it needs, so its leaves turn yellow and its stems grow weak.” How is this paragraph organized?",
   "cause and effect — a lack of sunlight causes the plant’s leaves and stems to weaken",
   [("chronological order — it lists what happens to a plant day by day", "No specific days or a day-by-day timeline are given in this paragraph."),
    ("compare and contrast — it compares plants in sunlight to plants without sunlight", "Only plants without enough light are described; no second case is directly compared."),
    ("problem and solution — it proposes a fix for pale houseplants", "No fix or solution for the pale houseplants is offered anywhere in the paragraph.")],
   "The paragraph explains that one condition (low light) produces a specific effect (weak, pale growth).",
   "Signal words like “so” often point to cause and effect.")
mc("text-structure", "RI.6.5", 1, "Read this paragraph: “The fennec fox has several features suited to desert life. Its huge ears release body heat. Thick fur on its paws protects against hot sand. Its kidneys are built to need very little water.” How is this paragraph organized?",
   "description — it lists several separate features that help the fox survive the desert",
   [("cause and effect — each feature causes the next feature to develop", "The features are not shown causing one another to develop; each is simply listed."),
    ("chronological order — the features are listed in the order the fox develops them", "No growth timeline for the fox’s features is given anywhere in the paragraph."),
    ("compare and contrast — it compares the fox to another desert animal", "Only the fennec fox is discussed; no second animal is named for comparison.")],
   "The paragraph lists separate traits of one animal rather than connecting them by cause, time or comparison.",
   "A paragraph listing several traits about one subject is usually a description structure.")
mc("text-structure", "RI.6.5", 1, "Read this paragraph: “First, workers collect used paper and soak it in water until it breaks apart into pulp. Next, the pulp is pressed flat into thin sheets. Finally, the sheets are dried and rolled onto large spools.” How is this paragraph organized?",
   "chronological order — it describes the steps of recycling paper in the order they happen",
   [("cause and effect — each step is a cause that explains why paper is recycled", "No cause for WHY paper is recycled is explained; the paragraph only lists the steps."),
    ("compare and contrast — it compares old paper to new paper", "No comparison between old and new paper is made anywhere in the paragraph."),
    ("description — it simply describes what a paper mill looks like", "The paragraph describes a process in order, not the appearance of a building.")],
   "Words like “first,” “next” and “finally” signal a step-by-step, time-ordered process.",
   "Order words (first, next, then, finally) are the clearest clue to chronological structure.")
mc("text-structure", "RI.6.5", 1, "Read this paragraph: “Bicycles have two wheels and are pedaled by the rider’s legs. Electric scooters also have wheels, but a small motor powers them instead of leg muscles. Both are used for short trips around a neighborhood.” How is this paragraph organized?",
   "compare and contrast — it shows how bicycles and scooters are alike and different",
   [("problem and solution — it explains a transportation problem and a fix", "No transportation problem or fix is presented anywhere in the paragraph."),
    ("chronological order — it tells the history of how scooters were invented", "No invention history or dates for scooters are given in this paragraph."),
    ("cause and effect — pedaling causes the scooter’s motor to run", "The scooter is described as motor-powered, not powered by pedaling, so there is no such cause-effect link.")],
   "The paragraph points out a shared feature (wheels, short trips) and a key difference (legs versus motor).",
   "Watch for words like “also” and “but” that signal similarities and differences.")
mc("text-structure", "RI.6.5", 2, "Read this paragraph: “Students at Rawda Middle School complained that the library was too noisy to study in during lunch. The librarian set up a separate quiet room with a sign-in sheet and moved group projects to the cafeteria instead. Within a week, students reported the library felt calm enough to focus.” How is this paragraph organized?",
   "problem and solution — it describes a noise problem and the specific steps taken to fix it",
   [("compare and contrast — it compares the library to the cafeteria", "The cafeteria is mentioned only as part of the fix, not compared feature by feature to the library."),
    ("description — it only describes what the library building looks like", "No physical description of the building is given anywhere in the paragraph."),
    ("chronological order — it lists the school’s full daily schedule", "No full daily schedule for the school is described in this paragraph.")],
   "A specific problem (noise) is named, followed by the concrete actions taken to solve it.",
   "Look for a named problem followed by a fix — that pattern signals problem and solution.")
mc("text-structure", "RI.6.5", 2, "Read this paragraph: “When more cars idle in traffic, engines burn fuel without actually moving anywhere. This wasted fuel releases extra exhaust into the air, and in cities with heavy traffic jams, air quality often gets worse during rush hour.” How is this paragraph organized?",
   "cause and effect — idling cars in traffic cause more exhaust, which worsens air quality",
   [("chronological order — it lists what happens during each hour of a commute", "No specific hour-by-hour timeline of a commute is given in this paragraph."),
    ("compare and contrast — it compares traffic in two different cities", "No second city’s traffic is named or compared against the first."),
    ("description — it simply describes what a traffic jam looks like", "The paragraph explains a cause-and-result relationship, not the appearance of traffic.")],
   "One condition (idling traffic) leads directly to a result (worse air quality).",
   "Ask: does one event make another event happen? That is cause and effect.")
mc("text-structure", "RI.6.5", 2, "Read this paragraph: “Clouds come in several basic shapes. Cumulus clouds look like puffy cotton balls. Stratus clouds spread out in flat, gray sheets. Cirrus clouds form thin, feathery streaks high in the sky.” How is this paragraph organized?",
   "description — it lists different types of clouds and describes what each one looks like",
   [("cause and effect — each cloud type causes the next type to form", "No causal chain between the cloud types is described anywhere in the paragraph."),
    ("problem and solution — it explains a weather problem clouds create", "No problem related to clouds is raised in this paragraph."),
    ("chronological order — it describes clouds in the order they appear each day", "No daily order for when each cloud type appears is given in this paragraph.")],
   "The paragraph simply lists separate categories and their features, without connecting them by cause, time or problem.",
   "A paragraph naming several types or categories, one after another, usually uses a description structure.")
mc("text-structure", "RI.6.5", 2, "Read this paragraph: “Keeping savings in a jar at home means the money is easy to reach anytime, but it earns nothing extra over time. Putting the same money in a savings account makes it slightly harder to access quickly, but the bank adds a small amount of interest every year.” How is this paragraph organized?",
   "compare and contrast — it weighs the trade-offs of keeping money in a jar versus a bank account",
   [("chronological order — it explains the history of how banks were invented", "No invention history or dates for banks are given in this paragraph."),
    ("cause and effect — saving in a jar causes people to open a bank account", "No causal link between the two storage methods is stated in this paragraph."),
    ("problem and solution — it identifies one single correct way to save money", "The paragraph weighs trade-offs between two options, rather than solving one problem with one fix.")],
   "The paragraph sets two options side by side and names an advantage and disadvantage of each.",
   "Look for “but” paired with matching features — that is comparison.")
mc("text-structure", "RI.6.5", 3, "Read this paragraph: “When a hillside is cleared of trees, there are no longer any roots to hold the soil in place. Heavy rain then washes the loose topsoil downhill, leaving the land harder for new plants to grow in. Over time, the bare hillside can become almost impossible to farm.” How is this paragraph organized?",
   "cause and effect — clearing trees sets off a chain of results, from loose soil to erosion to land that is hard to farm",
   [("compare and contrast — it compares hillsides with trees to hillsides without rain", "Rainfall amount is not being compared between two hillsides; only one chain of events is described."),
    ("chronological order — it lists the exact dates when hillsides were cleared", "No dates or a specific calendar timeline are given in this paragraph."),
    ("description — it only describes what a bare hillside looks like", "The paragraph explains a chain of results, not just the hillside’s appearance.")],
   "Each sentence shows one event producing the next: no trees, then loose soil, then erosion, then unfarmable land.",
   "When one effect becomes the cause of the next effect, that is a cause-and-effect chain.")
mc("text-structure", "RI.6.5", 3, "Read this paragraph: “Many students who rode bikes to Al-Nour School left them leaning against the fence, where they often got knocked over or blocked the sidewalk. The student council proposed installing numbered bike racks near the main gate, and the school agreed to install twenty of them before the new term began.” How is this paragraph organized?",
   "problem and solution — it names a bike-parking problem and the specific solution the council proposed and the school carried out",
   [("description — it only describes what the bikes looked like", "No physical description of the bikes themselves is given in this paragraph."),
    ("compare and contrast — it compares bike racks at two different schools", "Only one school’s bike-parking situation is discussed in this paragraph."),
    ("cause and effect — leaning bikes against the fence caused the fence to break", "No damage to the fence is mentioned anywhere in the paragraph.")],
   "A specific problem (poorly parked bikes) is followed by a concrete plan that solves it.",
   "Problem-and-solution paragraphs usually name a difficulty, then describe exactly what fixed it.")
mc("text-structure", "RI.6.5", 3, "Read this paragraph: “In the 1950s, farmers in Deir al-Wadi sold vegetables from the backs of trucks parked along the main road. By the 1980s, the town had built a covered market with permanent stalls. Today, the same market also hosts a weekend crafts fair alongside the vegetable sellers.” How is this paragraph organized?",
   "chronological order — it traces how the town’s market changed from the 1950s to today",
   [("cause and effect — the crafts fair caused the vegetable sellers to leave", "The vegetable sellers are still present today alongside the crafts fair, so nothing shows them leaving."),
    ("problem and solution — it describes a problem with the covered market", "No problem with the covered market is raised anywhere in this paragraph."),
    ("description — it only describes what the market stalls look like", "The paragraph traces change over time, not just the stalls’ appearance.")],
   "Specific time markers (1950s, 1980s, today) trace the market’s development across decades.",
   "Dates or decades lined up in order are a strong signal of chronological structure.")
mc("text-structure", "RI.6.5", 3, "Read this paragraph: “A violin has four main parts. The body is a hollow wooden box that makes the sound louder. The neck holds the fingerboard where a player presses the strings. The bridge lifts the strings above the body. The scroll at the top holds the tuning pegs.” How is this paragraph organized?",
   "description — it names and explains each main part of a violin, one at a time",
   [("chronological order — it explains the steps for building a violin over time", "No construction process or build-time sequence is described in this paragraph."),
    ("cause and effect — the bridge causes the scroll to hold the tuning pegs", "These parts are not linked by cause and effect anywhere in the paragraph."),
    ("compare and contrast — it compares a violin to another instrument", "No second instrument is mentioned for comparison in this paragraph.")],
   "Each sentence introduces one labeled part and what it does, without connecting them by time or cause.",
   "A list of labeled parts, each explained separately, is a description structure.")
mc("text-structure", "RI.6.5", 4, "Read this paragraph: “Basketball requires a hoop at a fixed height and rewards players who can dribble while running. Volleyball, on the other hand, is played over a net and depends on quick reactions rather than ball-handling while moving. Both games, however, reward teamwork and communication between teammates on the move.” How is this paragraph organized?",
   "compare and contrast — it points out key differences between basketball and volleyball while noting one shared quality",
   [("problem and solution — it solves a disagreement about which sport is better", "No disagreement or solution about which sport is better is presented in this paragraph."),
    ("chronological order — it explains the history of each sport", "No historical background or dates for either sport are given in this paragraph."),
    ("cause and effect — dribbling in basketball causes volleyball players to react quickly", "The two sports are not linked to each other by cause and effect anywhere in the paragraph.")],
   "The paragraph sets the two sports side by side, naming a difference for each and then a shared trait.",
   "Phrases like “on the other hand” and “both … however” are strong compare-and-contrast signals.")
mc("text-structure", "RI.6.5", 4, "Read this paragraph: “During deep sleep, the brain strengthens connections between neurons that were active while a person was learning something new that day. Students who sleep fewer than six hours tend to remember less of what they studied the day before, because this strengthening process is cut short. Over weeks of poor sleep, this effect can add up to noticeably weaker test performance.” How is this paragraph organized?",
   "cause and effect — too little sleep interrupts memory strengthening, which weakens memory and eventually test performance",
   [("description — it only describes what happens physically inside the brain during sleep", "The paragraph traces a chain of results from poor sleep, not just brain anatomy."),
    ("compare and contrast — it compares students who sleep six hours to students who sleep eight hours", "Only one amount, fewer than six hours, is actually discussed in this paragraph."),
    ("chronological order — it lists the stages of a person’s sleep cycle in order", "No stage-by-stage account of a sleep cycle is described in this paragraph.")],
   "The paragraph traces a chain: less sleep interrupts a brain process, which lowers memory, which lowers test scores.",
   "When a result keeps leading to a further result, trace the whole chain of causes and effects.")
mc("text-structure", "RI.6.5", 4, "Read this paragraph: “Fishing fleets off one coastal town had been catching so many young sardines that the overall sardine population began shrinking every year. Marine officials introduced a seasonal catch limit and required nets with wider holes so young fish could escape. Within three years, sardine numbers in the area had begun to recover.” How is this paragraph organized?",
   "problem and solution — it names a shrinking-fish-population problem and the specific rules that helped fix it",
   [("compare and contrast — it compares sardine fishing to tuna fishing", "No other fish or fishing method is named for comparison in this paragraph."),
    ("chronological order — it lists every year’s exact catch numbers", "No year-by-year catch data is listed anywhere in this paragraph."),
    ("description — it only describes what a fishing net looks like", "The net is mentioned only as part of the solution, not described in detail.")],
   "A clear problem (shrinking sardine population) is followed by the specific actions that reversed it.",
   "Look for a result (recovery, improvement) that follows directly after a described fix.")
mc("text-structure", "RI.6.5", 4, "Read this paragraph: “In 1876, the first working telephone could only connect two specific points joined by a single wire. By the 1890s, cities had built switchboards so that any customer’s call could be connected to any other customer in town. By the mid-1900s, long-distance cables let callers reach other cities and even other countries.” How is this paragraph organized?",
   "chronological order — it traces how telephone networks expanded from 1876 through the mid-1900s",
   [("cause and effect — switchboards caused the invention of the telephone", "The telephone already existed before switchboards in this timeline, so this cause-effect order is reversed."),
    ("compare and contrast — it compares telephones to telegraphs", "Telegraphs are never mentioned anywhere in this paragraph."),
    ("problem and solution — it describes one single problem with modern phones", "No modern-day problem with phones is raised in this paragraph.")],
   "Specific years (1876, 1890s, mid-1900s) mark each stage of the network’s growth in order.",
   "A string of dates or eras, each building on the last, signals chronological structure.")
mc("text-structure", "RI.6.5", 4, "Read this paragraph: “A rural village had no streetlights, so people avoided walking after dark because of poor visibility. The village council installed solar-powered lamps along the main road, which charge during the day and turn on automatically at dusk. Since the lamps needed no wiring to the village's main power grid, installation took only two weeks. Residents now report walking after dark far more often than before.” How is this paragraph organized?",
   "problem and solution — it names a safety problem from the dark and explains how solar lamps solved it quickly",
   [("compare and contrast — it compares solar lamps to lamps connected to the power grid", "No grid-connected lamps are actually installed or compared feature by feature; the grid is mentioned only as something avoided."),
    ("chronological order — it lists the full history of solar lamp technology", "No invention history or technology timeline for solar lamps is described in this paragraph."),
    ("cause and effect only, with no solution described", "The paragraph explicitly describes the lamps being installed as a specific fix, not just a cause-and-effect description without any solution.")],
   "A specific problem (unsafe darkness) is followed by a specific, quickly installed fix (solar lamps) and a result (more walking after dark).",
   "Look for a named problem followed by an action that fixes it.")
mc("text-structure", "RI.6.5", 5, "Read this paragraph: “A few years after zebra mussels were accidentally introduced to a freshwater lake, fishers noticed the water had become unusually clear. The mussels filter huge amounts of plankton from the water as they feed, and plankton is the main food source for many small native fish. As plankton grew scarce, several native fish species that once thrived in the lake began to decline sharply.” How is this paragraph organized?",
   "cause and effect — the mussels’ feeding reduces plankton, which then causes native fish populations to decline",
   [("compare and contrast — it compares zebra mussels to a native mussel species", "No native mussel species is mentioned for comparison anywhere in this paragraph."),
    ("problem and solution — it proposes a way to remove the mussels from the lake", "No removal plan or solution for the mussels is described in this paragraph."),
    ("description — it only describes what zebra mussels look like", "The paragraph explains a chain of ecological effects, not the mussels’ appearance.")],
   "The clearer water, the mussels’ feeding, the shrinking plankton and the declining fish form one connected chain of causes and effects.",
   "In nature articles, trace how one species’ feeding habit can ripple through to affect other species.")
mc("text-structure", "RI.6.5", 5, "Read this paragraph: “Solar panels generate the most electricity around midday, when sunlight is strongest, but produce almost nothing at night. Wind turbines can generate power at any hour, as long as the wind is blowing, but calm days leave them nearly idle. Because the two sources tend to be weak at different times, many power grids combine both to keep electricity flowing more steadily.” How is this paragraph organized?",
   "compare and contrast — it contrasts when solar and wind power are strong or weak, then explains why combining them helps",
   [("chronological order — it explains the order in which solar and wind technology were invented", "No invention history or dates for either technology are given in this paragraph."),
    ("cause and effect — solar panels cause wind turbines to generate more power", "The two technologies are not shown causing each other to work in this paragraph."),
    ("description — it only describes what a wind turbine looks like", "The paragraph compares timing and reliability, not the turbine’s physical appearance.")],
   "The paragraph lines up a weakness of each source and shows how pairing them offsets those weaknesses.",
   "When two things are each strong where the other is weak, that pairing itself is a form of comparison.")
mc("text-structure", "RI.6.5", 5, "Read this paragraph: “Patients at a busy clinic were often waiting more than two hours past their scheduled appointment time, mostly because urgent walk-in cases kept interrupting the daily schedule. The clinic began setting aside two short blocks each day reserved only for walk-ins, so scheduled appointments would no longer be bumped. Average wait times for scheduled patients dropped by almost half within a month.” How is this paragraph organized?",
   "problem and solution — it identifies the cause of long waits and explains the scheduling change that reduced them",
   [("description — it only describes what the clinic’s waiting room looks like", "No physical description of the waiting room is given in this paragraph."),
    ("chronological order — it lists the clinic’s exact opening and closing times", "No daily opening or closing times for the clinic are described in this paragraph."),
    ("compare and contrast — it compares this clinic’s wait times to another clinic’s", "Only one clinic’s results are discussed in this paragraph.")],
   "A specific cause of delay is diagnosed, a scheduling fix is applied, and a clear result (reduced wait time) follows.",
   "Good problem-and-solution paragraphs often name why the problem happened, not just what the problem was.")
mc("text-structure", "RI.6.5", 5, "Read this paragraph: “Coffee cherries are first picked by hand when they turn deep red. They are then either dried whole in the sun for several weeks or washed to remove the outer fruit immediately after picking. Once dried, the inner beans are hulled, sorted by size, and finally roasted just before shipping.” How is this paragraph organized?",
   "chronological order — it follows coffee cherries through each stage of processing, from picking to roasting",
   [("compare and contrast — it only compares sun-dried coffee to washed coffee", "Both drying methods are mentioned as one step within a larger process, not weighed against each other in depth."),
    ("cause and effect — picking the cherries causes them to turn red", "The cherries turn red before they are picked, so this cause-and-effect order is reversed."),
    ("problem and solution — it explains a problem with roasting coffee too early", "No such problem is raised anywhere in this paragraph.")],
   "The paragraph moves step by step through the stages a coffee cherry passes through, ending in roasting.",
   "Process paragraphs that move from raw material to finished product are chronological in structure.")
mc("text-structure", "RI.6.5", 5, "Read this paragraph: “Canned vegetables can sit safely in a pantry for a year or more because the sealed can and the heat used during canning kill the bacteria that cause spoilage. Fresh vegetables keep their vitamins and texture better, but they spoil within days unless refrigerated, since nothing stops bacteria from growing on them right away. Because of this trade-off, many families buy some of each, choosing fresh vegetables for the week ahead and canned ones for longer storage.” How is this paragraph organized?",
   "compare and contrast — it weighs shelf life against freshness for canned versus fresh vegetables and explains how that trade-off affects shopping choices",
   [("chronological order — it explains the history of how canning was invented", "No invention history or dates for canning are mentioned anywhere in this paragraph."),
    ("problem and solution — it identifies one single best way to store all vegetables", "The paragraph says families use a mix of both methods, not one universal fix."),
    ("cause and effect only — refrigeration is shown as the one cause of all food spoilage", "The paragraph explains two separate storage methods and their trade-offs, not a single cause-effect chain.")],
   "The paragraph names an advantage and disadvantage of each storage method, then shows how that comparison shapes a real choice.",
   "When a paragraph ends by explaining how people act because of a trade-off, trace back to the comparison that created it.")
mc("text-structure", "RI.6.5", 6, "Read this paragraph: “Dark asphalt and concrete absorb far more sunlight than grass or trees do, and they release that heat back into the surrounding air for hours after sunset. Because many cities are covered mostly in these materials, nighttime temperatures downtown can stay several degrees warmer than in nearby suburbs with more greenery. Some cities have responded by painting rooftops white and planting trees along streets to reduce this effect.” How is this paragraph organized?",
   "cause and effect, with a brief problem-and-solution ending — dark surfaces trap heat and raise city temperatures, and the final sentence adds a response some cities have tried",
   [("pure chronological order — it lists the exact hour each city planted its first tree", "No specific hours or planting dates are given anywhere in this paragraph."),
    ("pure compare and contrast — it only compares two specific named cities to each other", "No two specific cities are named and compared; only general city-versus-suburb patterns are discussed."),
    ("pure description — it only describes what asphalt looks like", "The paragraph explains why temperatures rise and what is being done, not just appearance.")],
   "Most of the paragraph builds a cause-and-effect chain (dark materials, trapped heat, warmer nights), and the last sentence briefly shifts to a solution being tried.",
   "A paragraph can blend two structures — look at where a shift happens, often in the final sentence.")
mc("text-structure", "RI.6.5", 6, "Read this paragraph: “Rain-fed farms depend entirely on seasonal rainfall, so a dry year can cut their harvest drastically, but farmers save on the cost and labor of watering. Irrigated farms water their crops on a steady schedule regardless of rainfall, which protects yields during dry years, but the pumps and canals needed are expensive to build and maintain. Because of this trade-off, many regions use rain-fed farming where rainfall is reliable and irrigation only where it is not.” How is this paragraph organized?",
   "compare and contrast — it weighs the risks and costs of rain-fed versus irrigated farming and explains how that trade-off shapes farmers’ choices",
   [("chronological order — it explains how irrigation technology developed over the centuries", "No historical timeline or invention dates for irrigation are described in this paragraph."),
    ("cause and effect only — dry years are shown as the single cause of all farming decisions", "The paragraph weighs costs and benefits of both methods, not just one cause producing one effect."),
    ("problem and solution — it identifies irrigation as the one correct fix for all farms", "The paragraph says irrigation is useful only where rainfall is unreliable, not a universal fix.")],
   "The paragraph sets the two farming methods side by side, naming a benefit and a drawback for each, then explains how that comparison guides a choice.",
   "When a paragraph names a trade-off for each option and then draws a conclusion from comparing them, that is compare and contrast.")
mc("text-structure", "RI.6.5", 6, "Read this paragraph: “Many recycling programs found that bins meant only for paper and plastic were filled with food waste, greasy pizza boxes and broken glass, ruining otherwise recyclable material. Several cities responded by printing clear picture guides on every bin lid and fining repeat offenders who ignored the rules. Contamination rates in those cities fell by nearly a third within two years, though officials noted that ongoing public education remained necessary to keep rates low.” How is this paragraph organized?",
   "problem and solution — it names the contamination problem, describes two specific fixes, and reports a result while noting the fix still needs upkeep",
   [("description only — it simply describes what is typically found inside a recycling bin", "The paragraph explains a problem and response, not just an inventory of bin contents."),
    ("chronological order only — it lists each city’s recycling program by the year it was founded", "No founding dates for any recycling program are given in this paragraph."),
    ("compare and contrast only — it compares recycling rules in different countries", "No countries are named or compared against each other in this paragraph.")],
   "A specific problem (contamination) leads to specific fixes (guides, fines) and a measured result, with a closing note about ongoing effort.",
   "A strong problem-and-solution paragraph often ends by noting whether the fix was complete or still needs more work.")
mc("text-structure", "RI.6.5", 6, "Read this paragraph: “After a severe flood destroyed hundreds of homes along the river in 1962, the city built its first levee system within five years. A second, larger flood in 1998 revealed that the original levees were too low, so engineers raised and reinforced them throughout the early 2000s. Because of these upgrades, a comparably large flood in 2019 caused far less damage to the same neighborhoods.” How is this paragraph organized?",
   "chronological order built around cause and effect — each flood (1962, 1998, 2019) prompts a response, and the paragraph tracks how those responses changed outcomes over time",
   [("pure compare and contrast — it only compares the 1962 flood to the 2019 flood, ignoring everything else", "The 1998 flood and the engineering response in between are also central to the paragraph, not left out."),
    ("pure description — it only describes what a levee looks like", "The paragraph traces events and their consequences over decades, not the physical appearance of a levee."),
    ("problem and solution with no time order — it treats all three floods as happening at the same time", "The floods are clearly dated and occur in sequence, not simultaneously.")],
   "Three dated floods are presented in order, and each one’s cause-and-effect relationship to the city’s levee response is tracked across time.",
   "When dates anchor a chain of causes and effects, the structure is chronological but driven by cause and effect.")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “Bacteria reproduce so quickly that a population exposed to an antibiotic may include a few individuals with a random mutation that happens to resist the drug. Because the antibiotic kills off the non-resistant bacteria, the resistant ones survive and reproduce, passing the resistance trait to their offspring. Over many rounds of this process, especially when antibiotics are overused or not finished as prescribed, a bacterial population can become mostly or entirely resistant. Doctors have responded by prescribing antibiotics more selectively and completing full treatment courses to reduce how often this cycle repeats.” How is this paragraph organized?",
   "a repeating cause-and-effect cycle that builds to a problem, followed by a brief solution — each round of antibiotic use causes resistant bacteria to multiply, and the final sentence adds how doctors are responding",
   [("a single, one-time cause and effect — one antibiotic dose permanently makes all bacteria resistant forever", "The paragraph describes a repeating, multi-round process, not one dose causing permanent resistance all at once."),
    ("compare and contrast between two different bacteria species", "No second bacteria species is introduced for comparison anywhere in this paragraph."),
    ("chronological order with specific dates for each stage of resistance", "No specific years or dates mark any stage of the process described in this paragraph.")],
   "The paragraph explains a repeating mechanism (mutation, survival, reproduction, repeat) that builds toward a problem, then closes with how doctors are addressing it.",
   "Some structures repeat in a cycle rather than happening only once — look for words like “over many rounds” or “repeats.”")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “When a key factory that supplied a specific computer chip shut down after a storm, several electronics companies that depended on that single supplier could not finish assembling their products, even though every other part was ready. Prices for finished electronics using that chip rose within weeks, since the remaining chip supply could not meet demand. In response, some companies began sourcing the same chip from two or more factories instead of just one, even though this raised their costs slightly, in order to avoid being stopped completely by a single factory’s shutdown again.” How is this paragraph organized?",
   "cause and effect leading into a problem-and-solution ending — the factory shutdown causes a supply shortage and price increase, and companies then adopt a strategy to prevent the same cause from stopping them again",
   [("compare and contrast between two competing computer chip brands", "Only one type of chip and its single original supplier are discussed; no competing chip brand is compared."),
    ("chronological order listing the exact date of every price increase", "No specific dates for any price changes are given, only a general “within weeks.”"),
    ("description only, detailing what the factory building looked like after the storm", "The paragraph explains a chain of economic consequences and a strategic response, not the factory’s physical condition.")],
   "A single cause (the shutdown) triggers a chain of effects (shortage, price rise), and the paragraph ends by describing a solution companies adopted to prevent a repeat.",
   "In cause-and-effect writing about business or systems, look for a shift at the end toward prevention — that often signals an added problem-and-solution layer.")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “A species of migratory bird has relied for centuries on wetlands along its route to rest and refuel during a journey of several thousand kilometers. As many of those wetlands have been drained for farmland over the past fifty years, the birds now face longer stretches without a safe place to stop, and researchers have recorded a steady decline in the number of birds completing the full migration each year. Conservation groups in several countries along the route have begun restoring small sections of wetland and coordinating the timing of protections so that no single country’s efforts are undone by another’s lack of action.” How is this paragraph organized?",
   "cause and effect across a long time span, ending with a solution that requires coordination among several causes of the original problem — wetland loss (cause) reduces migration success (effect), and the final sentence describes a multi-country response",
   [("a simple list of facts about the bird’s appearance and diet", "The paragraph focuses on a historical change and its ecological consequences, not the bird’s appearance or diet."),
    ("compare and contrast between two different bird species that share the same route", "Only one species of migratory bird is discussed throughout this paragraph."),
    ("chronological order with each country’s protection law dated individually", "No specific laws or dates for individual countries are given in this paragraph.")],
   "The paragraph traces how a decades-long cause (wetland loss) produces a specific effect (fewer successful migrations), then closes with a coordinated, multi-country solution.",
   "When several separate causes (draining wetlands in different places) combine to create one large effect, solving it usually also requires coordinated action.")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “Bus ridership in one mid-sized city fell by nearly a third after routes were cut and fares were raised during a budget shortfall, forcing many riders to rely on cars instead and worsening downtown traffic. City planners later restored the cut routes and froze fares for two years while also adding real-time arrival screens at major stops so riders could trust the schedule again. Ridership slowly climbed back over the following three years, though it still has not fully returned to its earlier levels.” How is this paragraph organized?",
   "cause and effect followed by problem and solution — budget cuts cause falling ridership and worse traffic, and the city’s multi-part response only partially reverses that effect over time",
   [("pure chronological order with no cause-and-effect connections between events", "The events are explicitly linked by cause and effect — the cuts cause the ridership drop, and the response causes partial recovery — not just listed without connection."),
    ("pure compare and contrast between bus ridership in two different cities", "Only one city’s transit system is discussed throughout this paragraph."),
    ("pure description of what the city’s buses and bus stops look like", "The paragraph explains why ridership changed over several years, not what the vehicles or stops look like.")],
   "A budget cut causes a specific effect (falling ridership), and the city’s later actions address that problem, though the paragraph notes the fix is still incomplete.",
   "Look for a result described as only partly fixed, such as “still has not fully returned” — that often signals a blended cause-effect and problem-solution structure.")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “Along one stretch of coastline, a storm destroyed homes built behind a cleared beach, while homes behind a stretch of mangrove forest just a few kilometers away suffered far less damage, because the mangroves’ dense roots absorbed much of the wave energy before it reached land. Engineers initially proposed building a concrete seawall to replace the lost protection, but a mangrove-restoration project turned out to cost less and also created a fish nursery that supported the area’s fishing economy. Because of these added benefits, the restoration plan was eventually chosen over the seawall.” How is this paragraph organized?",
   "cause and effect combined with compare and contrast, ending in problem and solution — the mangroves’ root structure explains the damage difference, two solutions are compared, and one is chosen for its added benefits",
   [("pure chronological order, with every event dated to a specific year", "No specific years or dates are given for the storm, the proposal or the final decision."),
    ("pure description of what a mangrove tree looks like", "The paragraph explains a cause-and-effect difference and a decision between two solutions, not the tree’s physical features."),
    ("pure problem and solution, with no comparison between the two proposed solutions", "The paragraph explicitly weighs the seawall against the mangrove-restoration project before choosing one, which is a comparison.")],
   "The paragraph blends three patterns: a cause-and-effect explanation for the damage difference, a comparison of two proposed fixes, and a final choice based on added benefits.",
   "Longer paragraphs often blend structures — identify each piece (why something happened, what options were compared, what was finally decided) separately.")
mc("text-structure", "RI.6.5", 7, "Read this paragraph: “A disease that spreads easily needs a certain percentage of a population to be immune before outbreaks stop spreading widely, a point researchers call the herd immunity threshold; for a highly contagious disease, that percentage can be quite high. When vaccination rates in one region fell below that threshold after a period of low turnout at clinics, a localized outbreak spread quickly among unvaccinated children, even though most adults in the same region were already immune. Health officials responded with a focused campaign at schools specifically, rather than a general public campaign, because the gap was concentrated almost entirely among that one age group.” How is this paragraph organized?",
   "a definition followed by cause and effect and then a targeted solution — the paragraph first explains a concept, then shows how falling below it caused an outbreak in one group, then describes a response matched specifically to that group",
   [("pure compare and contrast between two different diseases", "Only one disease and one herd immunity threshold are discussed throughout this paragraph."),
    ("pure chronological order, with the outbreak and the campaign given specific calendar dates", "No specific dates are given for when vaccination rates fell, when the outbreak began, or when the campaign started."),
    ("pure description of what the disease’s symptoms look like", "The paragraph explains a concept, a cause-and-effect outbreak, and a targeted response, not a list of symptoms.")],
   "The paragraph opens by defining a concept, then traces how falling below that threshold caused a specific outbreak, then explains a solution matched to the specific group affected.",
   "When a paragraph defines a term before explaining an event, check whether the definition itself is doing structural work — setting up the cause that follows.")

# ================================================================== possessive-nouns (Grades 4-5)
grade(4)

dd("possessive-nouns", "L.4.2", 1, "Choose the correct word: “The ____ nest fell from the tree.”",
   "bird’s", [("birds", "This is plural, not possessive."), ("bird", "This needs an apostrophe and s to show ownership."), ("birds’", "This shows more than one bird.")],
   "One bird owns the nest, so add an apostrophe and s: bird’s.", "Singular owner: add ’s.")
dd("possessive-nouns", "L.4.2", 1, "Choose the correct word: “The ____ bones were buried under the porch.”",
   "dogs’", [("dog’s", "This shows one dog, but the sentence says the bones belong to more than one dog."), ("dogs", "This is plural, not possessive."), ("dog’s’s", "This is not a real possessive form.")],
   "More than one dog owns the bones, so the plural dogs takes only an apostrophe: dogs’.", "Plural ending in s: add only an apostrophe.")
mc("possessive-nouns", "L.4.2", 2, "Which sentence uses a possessive noun correctly?",
   "My neighbor’s garden is full of roses.",
   [("My neighbors garden is full of roses.", "This is missing the apostrophe needed to show ownership."),
    ("My neighbor’s are full of roses.", "This needs the plural “neighbors,” not a possessive, since no owner is named for the roses."),
    ("My neighbors’s garden is full of roses.", "This adds an extra, incorrect s.")],
   "One neighbor owns the garden, so “neighbor’s” is correct.", "Read the sentence aloud — does it sound like “belonging to”?")
dd("possessive-nouns", "L.4.2", 2, "Choose the correct word: “The ____ shells were scattered on the beach.”",
   "turtles’", [("turtle’s", "This shows one turtle, but many shells came from many turtles."), ("turtles", "This is plural, not possessive."), ("turtle", "This needs to show ownership.")],
   "Many turtles own the shells, so the plural turtles takes only an apostrophe.", "Plural already ending in s: add only an apostrophe.")
err("possessive-nouns", "L.4.2", 2, ["The three puppies", " tails", " wagged happily."], 1, " tails’",
    "Three puppies own the tails, so add an apostrophe after the s: puppies’.", "Plural nouns ending in s only need an apostrophe, not an extra s.")
dd("possessive-nouns", "L.4.2", 3, "Choose the correct word: “The ____ boots were covered in mud.”",
   "men’s", [("mens’", "“Men” does not end in s, so do not add s before the apostrophe."), ("mens", "This misspells the plural of man."), ("man’s", "This shows one man, but the boots belong to several men.")],
   "“Men” is already plural and does not end in s, so add ’s: men’s.", "Irregular plurals (men, women, mice, geese) add ’s just like singular nouns.")
mc("possessive-nouns", "L.4.2", 3, "Which sentence uses a possessive noun correctly?",
   "The geese’s feathers covered the pond.",
   [("The gooses’ feathers covered the pond.", "“Goose” does not become “gooses”; its plural is “geese.”"),
    ("The geeses’ feathers covered the pond.", "This misspells the plural “geese.”"),
    ("The geese feathers covered the pond.", "Without an apostrophe, this does not show ownership.")],
   "“Geese” is the irregular plural of goose, and since it does not end in s, add ’s.", "Learn irregular plurals first, then add ’s if they do not end in s.")
fill("possessive-nouns", "L.4.2", 3, "Type the correct possessive form of “girl” to complete the sentence: The ____ bike had a flat tire.",
     ["girl's", "girl’s"], "One girl owns the bike, so add ’s: girl’s.", "Singular owner: add an apostrophe and s.")
mc("possessive-nouns", "L.4.2", 4, "Which sentence shows that a set of bikes is owned by MORE THAN ONE girl?",
   "The girls’ bikes leaned against the fence.",
   [("The girl’s bikes leaned against the fence.", "This shows only one girl owns the bikes."),
    ("The girls bikes leaned against the fence.", "Without an apostrophe, this does not show ownership."),
    ("The girl bikes leaned against the fence.", "This has no possessive form at all.")],
   "More than one girl owns the bikes, so the plural “girls” takes only an apostrophe.", "Picture how many owners there are before choosing ’s or s’.")
dd("possessive-nouns", "L.4.2", 4, "Choose the correct word: “____ kite flew higher than anyone else’s.”",
   "Zain’s", [("Zains", "This is missing the apostrophe needed to show ownership."), ("Zain", "This does not show ownership at all."), ("Zains’", "This name is singular here, not plural.")],
   "One boy, Zain, owns the kite, so add ’s: Zain’s.", "Most singular names add ’s, even short ones.")
err("possessive-nouns", "L.4.2", 4, ["The familys", " old photos", " filled the album."], 0, "The family’s",
    "One family owns the photos, so “family” needs an apostrophe and s: family’s.", "Check even the very first word of a sentence for a missing apostrophe.")
mc("possessive-nouns", "L.4.2", 5, "Which sentence correctly shows that a single trophy belongs to more than one team?",
   "The two teams’ trophy sat on the shelf.",
   [("The two team’s trophy sat on the shelf.", "This shows only one team owns the trophy."),
    ("The two teams trophy sat on the shelf.", "Without an apostrophe, this does not show ownership."),
    ("The two team’s’s trophy sat on the shelf.", "This adds an extra, incorrect apostrophe and s.")],
   "Two teams share ownership of one trophy, so the plural “teams” takes only an apostrophe.", "A shared item can still use a plural possessive if several owners share it.")
dd("possessive-nouns", "L.4.2", 5, "Choose the correct word: “The ____ stingers can cause a painful sting.”",
   "bees’", [("bee’s", "This shows only one bee, but many bees have stingers."), ("bees", "This is plural, not possessive."), ("beeses’", "This misspells the plural of bee.")],
   "Many bees own the stingers, so the plural “bees” takes only an apostrophe.", "Check whether the sentence is really talking about more than one owner.")
tf("possessive-nouns", "L.4.2", 5, "In the sentence “The oxen’s yoke was heavy,” the possessive is formed correctly.", True,
   "“Oxen” is an irregular plural that does not end in s, so it correctly adds ’s.", "Irregular plurals (oxen, children, geese) take ’s, not just an apostrophe.")
mc("possessive-nouns", "L.4.2", 6, "Which sentence correctly uses a possessive noun to show that a single cup belongs to two brothers who share it?",
   "The brothers’ shared cup sat on the counter.",
   [("The brother’s shared cup sat on the counter.", "This shows only one brother owns the cup."),
    ("The brothers shared cup sat on the counter.", "Without an apostrophe, this is not possessive."),
    ("The brothers’s shared cup sat on the counter.", "Plural nouns ending in s take only an apostrophe, not an extra s.")],
   "Two brothers share ownership of the cup, so the plural “brothers” takes only an apostrophe.", "Shared ownership between several people still uses a plural possessive.")
err("possessive-nouns", "L.4.2", 6, ["The witness’s", " and the officers testimony", " did not match."], 1, " and the officer’s testimony",
    "One officer gave testimony, so “officer” needs an apostrophe and s: officer’s.", "Check every noun in a sentence for ownership, not just the first one.")
match("possessive-nouns", "L.4.2", 6, "Match each phrase with its correct possessive form.",
      [("the coat belonging to one boss", "the boss’s coat"), ("the coats belonging to two bosses", "the bosses’ coats"),
       ("the den belonging to one wolf", "the wolf’s den"), ("the dens belonging to several wolves", "the wolves’ dens")],
      "Singular nouns still add ’s, even if they end in s; plural nouns that already end in s add only an apostrophe.",
      "Decide singular or plural first, then whether the word already ends in s.")
mc("possessive-nouns", "L.4.2", 7, "Which sentence correctly shows that Sara and her sister share ownership of ONE scarf?",
   "Sara and her sister’s scarf was striped blue and white.",
   [("Sara’s and her sister’s scarf was striped blue and white.", "This suggests they each own a separate scarf, not one shared scarf."),
    ("Sara and her sister scarf was striped blue and white.", "Without an apostrophe, this does not show ownership at all."),
    ("Saras and her sisters scarf was striped blue and white.", "Neither noun has the apostrophe needed to show ownership.")],
   "When two people share ONE item, only the final noun in the pair gets the possessive ending.", "One shared item: mark only the last owner’s name. Separate items: mark both owners.")
mc("possessive-nouns", "L.4.2", 7, "Which sentence correctly shows that Khalid and Omar each own their OWN bicycle, not one shared bicycle?",
   "Khalid’s and Omar’s bicycles were parked by the gate.",
   [("Khalid and Omar’s bicycles were parked by the gate.", "This could suggest they share one set of bicycles together, not that each owns his own."),
    ("Khalids and Omars bicycles were parked by the gate.", "Neither name has the apostrophe needed to show ownership."),
    ("Khalid’s and Omar’s bicycle were parked by the gate.", "“Bicycle” should be plural, since there are two separate bicycles.")],
   "When each owner has a separate item, mark EACH noun with its own possessive ending.", "Separate ownership: both names get ’s. Shared ownership: only the last name does.")

grade(5)

dd("possessive-nouns", "L.5.2", 1, "Choose the correct word: “The ____ shell was spotted with brown.”",
   "snail’s", [("snails", "This is plural, not possessive."), ("snail", "This needs to show ownership."), ("snails’", "This shows more than one snail.")],
   "One snail owns the shell, so add ’s: snail’s.", "Singular owner: add an apostrophe and s.")
dd("possessive-nouns", "L.5.2", 1, "Choose the correct word: “The ____ wings beat quickly as they flew south.”",
   "birds’", [("bird’s", "This shows one bird, but several birds are flying south together."), ("birds", "This is plural, not possessive."), ("bird’s’s", "This is not a real possessive form.")],
   "More than one bird owns the wings, so the plural “birds” takes only an apostrophe.", "Plural already ending in s: add only an apostrophe.")
mc("possessive-nouns", "L.5.2", 2, "Which sentence uses a possessive noun correctly?",
   "My cousin’s violin needed a new string.",
   [("My cousins violin needed a new string.", "This is missing the apostrophe needed to show ownership."),
    ("My cousin’s were tuning their violins.", "This needs the plural “cousins,” not a possessive, since no owner is named here."),
    ("My cousins’s violin needed a new string.", "This adds an extra, incorrect s.")],
   "One cousin owns the violin, so “cousin’s” is correct.", "Read the sentence aloud for “belonging to.”")
dd("possessive-nouns", "L.5.2", 2, "Choose the correct word: “The ____ nests were hidden deep in the reeds.”",
   "herons’", [("heron’s", "This shows one heron, but the nests belong to several."), ("herons", "This is plural, not possessive."), ("heron", "This needs to show ownership.")],
   "Many herons own the nests, so the plural “herons” takes only an apostrophe.", "Plural ending in s: add only an apostrophe.")
err("possessive-nouns", "L.5.2", 2, ["The scientists", " discovery", " changed how we treat the illness."], 0, "The scientists’",
    "Several scientists share the discovery, so the plural “scientists” needs only an apostrophe.", "Check the noun right before the thing it owns.")
dd("possessive-nouns", "L.5.2", 3, "Choose the correct word: “The ____ antlers were nearly a meter wide.”",
   "moose’s", [("mooses’", "“Moose” does not become “mooses” in the plural."), ("moose", "This does not show ownership."), ("moose’s’s", "This adds an extra, incorrect ending.")],
   "“Moose” is singular here and does not end in s, so add ’s: moose’s.", "Some irregular nouns (moose, deer, sheep) look the same in singular and plural — read for clues.")
mc("possessive-nouns", "L.5.2", 3, "Which sentence uses a possessive noun correctly?",
   "The mice’s tiny footprints covered the flour on the counter.",
   [("The mouses’ tiny footprints covered the flour on the counter.", "“Mouse” does not become “mouses”; its correct plural is “mice.”"),
    ("The mices’ tiny footprints covered the flour on the counter.", "This misspells the plural “mice.”"),
    ("The mice tiny footprints covered the flour on the counter.", "Without an apostrophe, this does not show ownership.")],
   "“Mice” is the irregular plural of mouse and does not end in s, so add ’s.", "Memorize tricky irregular plurals (mice, geese, children) before adding the possessive ending.")
fill("possessive-nouns", "L.5.2", 3, "Type the correct possessive form of “witness” to complete the sentence: The ____ statement surprised the judge.",
     ["witness's", "witness’s"], "One witness gives the statement, and since “witness” ends in s, it still adds ’s.", "Singular nouns ending in s still take ’s, not just an apostrophe.")
mc("possessive-nouns", "L.5.2", 4, "Which sentence shows that a set of instruments belongs to MORE THAN ONE musician?",
   "The musicians’ instruments were cased and ready for the concert.",
   [("The musician’s instruments were cased and ready for the concert.", "This shows only one musician owns the instruments."),
    ("The musicians instruments were cased and ready for the concert.", "Without an apostrophe, this does not show ownership."),
    ("The musician instruments were cased and ready for the concert.", "This has no possessive form at all.")],
   "More than one musician owns the instruments, so the plural “musicians” takes only an apostrophe.", "Count the owners first, then decide where the apostrophe goes.")
dd("possessive-nouns", "L.5.2", 4, "Choose the correct word: “____ essay won first place in the regional contest.”",
   "Inas’s", [("Inas", "This does not show ownership at all."), ("Inas’", "A singular name ending in s still usually takes ’s, not just an apostrophe."), ("Inases", "This is not a real plural or possessive form.")],
   "The name “Inas” ends in s and is singular here, so add ’s: Inas’s.", "A singular name ending in s still usually takes ’s.")
err("possessive-nouns", "L.5.2", 4, ["The committees", " final decision", " surprised everyone."], 0, "The committee’s",
    "One committee makes the decision, so “committee” needs an apostrophe and s: committee’s.", "A group acting as one unit is often a single, singular owner.")
mc("possessive-nouns", "L.5.2", 5, "Which sentence correctly shows that a single award is shared by two scientists?",
   "The two scientists’ award was displayed in the lobby.",
   [("The two scientist’s award was displayed in the lobby.", "This shows only one scientist owns the award."),
    ("The two scientists award was displayed in the lobby.", "Without an apostrophe, this does not show ownership."),
    ("The two scientist’s’s award was displayed in the lobby.", "This adds an extra, incorrect apostrophe and s.")],
   "Two scientists share ownership of the award, so the plural “scientists” takes only an apostrophe.", "A shared award can still use a plural possessive.")
dd("possessive-nouns", "L.5.2", 5, "Choose the correct word: “The ____ roots had cracked the sidewalk.”",
   "trees’", [("tree’s", "This shows one tree, but several trees have cracked the sidewalk."), ("trees", "This is plural, not possessive."), ("treeses’", "This misspells the plural of tree.")],
   "Many trees own the roots, so the plural “trees” takes only an apostrophe.", "Decide whether the sentence is really describing more than one owner.")
tf("possessive-nouns", "L.5.2", 5, "In the sentence “The deer’s tracks led into the forest,” the possessive is formed correctly for ONE deer.", True,
   "“Deer” is singular here and does not end in s, so it correctly adds ’s.", "Some animal names (deer, sheep, moose) stay the same whether singular or plural.")
mc("possessive-nouns", "L.5.2", 6, "Which sentence correctly uses a possessive noun to show that two sisters share ownership of one recipe?",
   "The sisters’ family recipe had been passed down for generations.",
   [("The sister’s family recipe had been passed down for generations.", "This shows only one sister owns the recipe."),
    ("The sisters family recipe had been passed down for generations.", "Without an apostrophe, this is not possessive."),
    ("The sisters’s family recipe had been passed down for generations.", "Plural nouns ending in s take only an apostrophe, not an extra s.")],
   "Two sisters share ownership of the recipe, so the plural “sisters” takes only an apostrophe.", "Shared ownership between two or more people still uses a plural possessive.")
err("possessive-nouns", "L.5.2", 6, ["The witnesses accounts", " of the accident", " did not fully agree."], 0, "The witnesses’ accounts",
    "Several witnesses share the accounts, so the plural “witnesses” needs only an apostrophe.", "A plural noun ending in s only needs an apostrophe added, not an extra s.")
match("possessive-nouns", "L.5.2", 6, "Match each phrase with its correct possessive form.",
      [("the office belonging to one boss", "the boss’s office"), ("the offices belonging to several bosses", "the bosses’ offices"),
       ("the uniform belonging to one referee", "the referee’s uniform"), ("the uniforms belonging to several referees", "the referees’ uniforms")],
      "Singular owners add ’s; plural owners whose plural already ends in s add only an apostrophe.", "Always find the plural form first, then decide where the apostrophe goes.")
mc("possessive-nouns", "L.5.2", 7, "Which sentence correctly shows that Layla and her brother share ownership of ONE computer?",
   "Layla and her brother’s computer crashed during the storm.",
   [("Layla’s and her brother’s computer crashed during the storm.", "This suggests they each own a separate computer, not one shared computer."),
    ("Layla and her brother computer crashed during the storm.", "Without an apostrophe, this does not show ownership at all."),
    ("Laylas and her brothers computer crashed during the storm.", "Neither noun has the apostrophe needed to show ownership.")],
   "When two people share ONE item, only the final noun in the pair gets the possessive ending.", "One shared item: mark only the last owner. Separate items: mark both owners.")
mc("possessive-nouns", "L.5.2", 7, "Which sentence correctly shows that Hassan and his cousin each own their OWN laptop, not one shared laptop?",
   "Hassan’s and his cousin’s laptops both needed new chargers.",
   [("Hassan and his cousin’s laptops both needed new chargers.", "This could suggest they share one set of laptops together, not that each owns his own."),
    ("Hassans and his cousins laptops both needed new chargers.", "Neither noun has the apostrophe needed to show ownership."),
    ("Hassan’s and his cousin’s laptop both needed new chargers.", "“Laptop” should be plural, since there are two separate laptops.")],
   "When each owner has a separate item, mark EACH noun with its own possessive ending.", "Separate ownership: both nouns get ’s. Shared ownership: only the last one does.")

# ================================================================== quotations-dialogue (Grades 4-6)
grade(4)

mc("quotations-dialogue", "L.4.2.b", 1, "Which words should be inside quotation marks? Lina said I finished my homework.",
   "I finished my homework",
   [("Lina said", "These words tell who is speaking, not what was said."), ("Lina said I finished my homework", "Only the spoken words go inside quotation marks."), ("finished my", "This cuts off part of what Lina actually said.")],
   "Quotation marks surround only the exact words the speaker said.", "Ask: what words came out of the speaker’s mouth?")
mc("quotations-dialogue", "L.4.2.b", 2, "Which sentence is punctuated correctly?",
   "“I found my shoe,” said Tariq.",
   [("“I found my shoe” said Tariq.", "A comma is needed before the closing quotation mark."), ("I found my shoe, said Tariq.", "Quotation marks are missing around the spoken words."), ("“I found my shoe”, said Tariq.", "The comma belongs inside the quotation marks, not outside.")],
   "The comma that ends the quotation goes inside the closing quotation mark.", "Comma, then closing quotation mark, when a tag follows.")
mc("quotations-dialogue", "L.4.2.b", 2, "Which question is punctuated correctly?",
   "“Did you feed the fish?” asked Dalia.",
   [("“Did you feed the fish,” asked Dalia.", "The quotation is a question, so it needs a question mark, not a comma."), ("“Did you feed the fish”? asked Dalia.", "The question mark belongs inside the quotation marks."), ("Did you feed the fish? asked Dalia.", "Quotation marks are missing around the spoken words.")],
   "A question mark that belongs to the quoted words goes inside the closing quotation mark.", "The end mark stays attached to the exact words spoken.")
err("quotations-dialogue", "L.4.2.b", 3, ["Ms. Farouk said, ", "“sit down please.”"], 1, "“Sit down please.”",
    "The first word of a quotation that is a full sentence is capitalized.", "Always capitalize the first word inside the quotation marks.")
mc("quotations-dialogue", "L.4.2.b", 3, "Which sentence correctly places quotation marks?",
   "Nadia whispered, “The movie is starting.”",
   [("Nadia whispered “The movie is starting.”", "A comma is needed after the speaker tag, before the quotation begins."), ("Nadia whispered, The movie is starting.", "Quotation marks are missing around the spoken words."), ("Nadia whispered, “the movie is starting.”", "The first word of the quotation should be capitalized.")],
   "A comma follows the speaker tag, and the quotation begins with a capital letter inside quotation marks.", "Speaker tag, comma, capital letter, quotation.")
order("quotations-dialogue", "L.4.2.b", 4, "Put the pieces in order to make a correctly punctuated sentence.",
      ["“Before we leave,”", "said Grandma,", "“lock the back door.”"],
      "The speaker tag interrupts the quotation and is set off by commas on both sides.", "Interrupted quotation: “part one,” tag, “part two.”")
mc("quotations-dialogue", "L.4.2.b", 4, "Which sentence correctly punctuates dialogue where the speaker tag comes FIRST?",
   "Yusuf shouted, “Watch out for the puddle!”",
   [("Yusuf shouted “Watch out for the puddle!”", "A comma is needed after the speaker tag."), ("Yusuf shouted, “watch out for the puddle!”", "The first word of the quotation should be capitalized."), ("Yusuf shouted, “Watch out for the puddle”!", "The exclamation point belongs inside the quotation marks.")],
   "When the speaker tag comes first, a comma follows it, and the end punctuation stays inside the quotation marks.", "Tag first: Tag, “Quotation!”")
mc("quotations-dialogue", "L.4.2.b", 5, "Which sentence correctly punctuates dialogue where the speaker tag comes AFTER the quotation?",
   "“The bus is already here,” Rami announced.",
   [("“The bus is already here” Rami announced.", "A comma is needed before the closing quotation mark when a tag follows."), ("“The bus is already here,” rami announced.", "Names are proper nouns and must be capitalized."), ("“The bus is already here”, Rami announced.", "The comma belongs inside the quotation marks, not outside.")],
   "When the tag comes after the quotation, a comma goes inside the closing quotation mark.", "Quotation first: “Quotation,” tag.")
err("quotations-dialogue", "L.4.2.b", 5, ["“Could you pass the salt”", " Grandpa asked", "."], 0, "“Could you pass the salt?”",
    "The quotation is a question, so it needs a question mark inside the closing quotation mark, not a comma.", "Check whether the quoted words ask a question before choosing the end mark.")
mc("quotations-dialogue", "L.4.2.b", 6, "In a story with dialogue, when should a writer start a new paragraph?",
   "Each time a different character begins speaking, the dialogue starts a new paragraph.",
   [("Dialogue only starts a new paragraph at the start of a new chapter.", "New paragraphs in dialogue happen with each new speaker, not just new chapters."), ("Dialogue never needs a new paragraph, no matter who is speaking.", "Switching speakers without a new paragraph confuses readers about who is talking."), ("A new paragraph is needed only if the speaker tag is missing.", "Paragraphing in dialogue depends on who is speaking, not on whether a tag is used.")],
   "Starting a new paragraph for each new speaker helps readers follow who is talking.", "New speaker, new paragraph — even if the line is short.")
mc("quotations-dialogue", "L.4.2.b", 7, "Which sentence correctly punctuates dialogue where the second quoted part is a NEW, separate sentence?",
   "“I already packed my bag,” said Omar. “Now I just need my shoes.”",
   [("“I already packed my bag,” said Omar, “now I just need my shoes.”", "Since the second part is a new sentence, it needs its own capital letter and end punctuation, not a comma and lowercase."), ("“I already packed my bag” said Omar. “Now I just need my shoes.”", "A comma is needed before the closing quotation mark after the first part."), ("“I already packed my bag,” said Omar. “now I just need my shoes.”", "The second quoted sentence must begin with a capital letter.")],
   "When the second quoted part is a separate sentence, the first quotation ends with the tag and a period, and the second begins with a capital letter.", "If the second part is a new complete sentence, start it like a new sentence — capital letter, period before, not comma.")

grade(5)

mc("quotations-dialogue", "L.5.2.b", 1, "Which words should be inside quotation marks? Sultan said I forgot my library book.",
   "I forgot my library book",
   [("Sultan said", "These words tell who is speaking, not what was said."), ("Sultan said I forgot my library book", "Only the spoken words go inside quotation marks."), ("forgot my", "This cuts off part of what Sultan actually said.")],
   "Quotation marks surround only the exact words spoken.", "Find the exact words that came out of the speaker’s mouth.")
mc("quotations-dialogue", "L.5.2.b", 2, "Which sentence is punctuated correctly?",
   "“I passed the test,” Farida said.",
   [("“I passed the test” Farida said.", "A comma is needed before the closing quotation mark."), ("I passed the test, Farida said.", "Quotation marks are missing around the spoken words."), ("“I passed the test”, Farida said.", "The comma belongs inside the quotation marks, not outside.")],
   "A comma ending the quotation goes inside the closing quotation mark when a tag follows.", "Comma inside, then the tag.")
mc("quotations-dialogue", "L.5.2.b", 2, "Which sentence is punctuated correctly?",
   "Mr. Nasser announced, “The field trip is postponed.”",
   [("Mr. Nasser announced “The field trip is postponed.”", "A comma is needed after the speaker tag."), ("Mr. Nasser announced, “the field trip is postponed.”", "The first word of the quotation should be capitalized."), ("Mr. Nasser announced, “The field trip is postponed”.", "The period belongs inside the quotation marks.")],
   "A comma follows the tag, and the period that ends the quotation stays inside the closing quotation mark.", "Tag, comma, “Capitalized quotation.”")
tf("quotations-dialogue", "L.5.2.b", 3, "A question mark that belongs to a quoted question should be placed OUTSIDE the closing quotation mark.", False,
   "End punctuation that belongs to the quoted words goes inside the closing quotation mark.", "Ask: does the punctuation belong to the quotation or to the whole sentence?")
mc("quotations-dialogue", "L.5.2.b", 3, "Where do the commas belong? “If it keeps raining” said Aliyah “the match will be canceled.”",
   "After “raining” (inside the quotation mark) and after “Aliyah”",
   [("Only after “Aliyah”", "A comma is also needed inside the first quotation, before the closing mark."), ("After “it” and after “said”", "Commas go where the quotation itself is interrupted by the speaker tag, not in the middle of other words."), ("No commas are needed", "An interrupted quotation needs commas on both sides of the speaker tag.")],
   "Correct: “If it keeps raining,” said Aliyah, “the match will be canceled.”", "An interrupted quotation needs a comma right before the tag and right after it.")
err("quotations-dialogue", "L.5.2.b", 4, ["“Please remember your permission slip”", " the librarian reminded us", "."], 0, "“Please remember your permission slip,”",
    "The comma that ends the quotation belongs inside the closing quotation mark.", "Commas and periods always go inside closing quotation marks.")
order("quotations-dialogue", "L.5.2.b", 4, "Put the pieces in order to make a correctly punctuated sentence.",
      ["“Once you finish reading,”", "said the librarian,", "“return the book to this cart.”"],
      "The speaker tag interrupts the quotation and is set off by commas on both sides.", "Interrupted quotation: “part one,” tag, “part two.”")
mc("quotations-dialogue", "L.5.2.b", 5, "Which sentence correctly punctuates a question that is interrupted by a speaker tag?",
   "“Why,” Bilal asked, “did the bell ring twice?”",
   [("“Why” Bilal asked, “did the bell ring twice?”", "A comma is needed before the closing quotation mark after the first part."), ("“Why,” Bilal asked, “Did the bell ring twice?”", "The second part continues the same sentence, so it should not start with a capital letter."), ("“Why,” Bilal asked “did the bell ring twice?”", "A comma is needed after the speaker tag, before the second quotation begins.")],
   "The interrupted quotation keeps commas around the tag, and since both parts form one sentence, the second part starts lowercase even though it ends in a question mark.", "If the two quoted parts form one sentence, keep the second part lowercase.")
mc("quotations-dialogue", "L.5.2.b", 5, "Which sentence correctly uses a quotation within a quotation?",
   "“My coach always says, ‘Practice makes progress, not perfection,’” Noor explained.",
   [("“My coach always says, “Practice makes progress, not perfection,”” Noor explained.", "Use single quotation marks for a quotation inside another quotation."), ("‘My coach always says, “Practice makes progress, not perfection,”’ Noor explained.", "The outer quotation marks should be double, and the inner ones single — this reverses them."), ("“My coach always says, Practice makes progress, not perfection,” Noor explained.", "The inner quotation needs its own single quotation marks.")],
   "A quotation inside another quotation uses single marks inside the double marks.", "Double marks outside, single marks inside.")
mc("quotations-dialogue", "L.5.2.b", 6, "Which sentence correctly integrates a short quotation from a text into your own sentence?",
   "The article explains that sea turtles “return to the very beach where they hatched.”",
   [("The article explains that sea turtles, “return to the very beach where they hatched.”", "No comma is needed when a quoted phrase is woven into your own sentence."), ("The article explains that sea turtles “Return to the very beach where they hatched.”", "A quoted fragment blended into your sentence is not capitalized."), ("The article explains that sea turtles “return to the very beach where they hatched”.", "The period belongs inside the closing quotation mark.")],
   "A quoted phrase that completes your own sentence blends in without a comma or capital letter, and the end punctuation stays inside the quotation marks.", "Integrated quotations read smoothly, as if they were your own words.")
mc("quotations-dialogue", "L.5.2.b", 7, "Which sentence correctly punctuates dialogue when the SECOND part of an interrupted quotation is a new, separate sentence?",
   "“I already called the vet,” Reem said. “She is on her way now.”",
   [("“I already called the vet,” Reem said, “she is on her way now.”", "Since the second part is a separate sentence, it needs its own capital letter and end punctuation, not a comma and lowercase."), ("“I already called the vet” Reem said. “She is on her way now.”", "A comma is needed before the closing quotation mark after the first part."), ("“I already called the vet,” Reem said. “she is on her way now.”", "The second quoted sentence must begin with a capital letter.")],
   "When the second quoted part is its own complete sentence, the first quotation ends with the tag and a period, and the second begins with a capital letter.", "Two separate sentences in dialogue each get their own capital letter and end mark.")

grade(6)

mc("quotations-dialogue", "L.6.2.b", 1, "Which words should be inside quotation marks? Karam said I left my badge at home.",
   "I left my badge at home",
   [("Karam said", "These words tell who is speaking, not the exact words spoken."), ("Karam said I left my badge at home", "Only the exact spoken words go inside quotation marks."), ("left my", "This cuts off part of what Karam actually said.")],
   "Quotation marks enclose only the exact words a speaker said.", "Isolate just the words that came out of the speaker’s mouth.")
mc("quotations-dialogue", "L.6.2.b", 2, "Which sentence punctuates the quotation correctly?",
   "Dunia said, “I rewired the whole circuit myself.”",
   [("Dunia said “I rewired the whole circuit myself.”", "A comma is needed after the speaker tag."), ("Dunia said, “i rewired the whole circuit myself.”", "The first word of the quotation must be capitalized."), ("Dunia said, I rewired the whole circuit myself.", "Quotation marks are missing around the spoken words.")],
   "A comma follows the tag, and the quotation begins with a capital letter inside quotation marks.", "Tag, comma, “Quotation.”")
mc("quotations-dialogue", "L.6.2.b", 3, "Which sentence correctly punctuates a question in dialogue?",
   "“Did the generator finally start?” Fahad asked.",
   [("“Did the generator finally start,” Fahad asked.", "A quoted question needs a question mark, not a comma."), ("“Did the generator finally start”? Fahad asked.", "The question mark belongs inside the closing quotation mark."), ("Did the generator finally start? Fahad asked.", "Quotation marks are missing around the spoken words.")],
   "The question mark that belongs to the quoted words goes inside the closing quotation mark.", "The end mark stays attached to the exact words spoken, inside the quotation marks.")
err("quotations-dialogue", "L.6.2.b", 3, ["“Lock the shed before you leave”", " Mr. Zidan reminded them", "."], 0, "“Lock the shed before you leave,”",
    "The comma that ends the quotation belongs inside the closing quotation mark.", "Commas and periods always sit inside closing quotation marks.")
mc("quotations-dialogue", "L.6.2.b", 4, "Which sentence correctly uses a quotation within a quotation?",
   "“My uncle used to say, ‘A clean workshop is a safe workshop,’” Laila recalled.",
   [("“My uncle used to say, “A clean workshop is a safe workshop,”” Laila recalled.", "Use single quotation marks for a quotation nested inside another quotation."), ("‘My uncle used to say, “A clean workshop is a safe workshop,”’ Laila recalled.", "This reverses the marks — the outer quotation should be double, the inner single."), ("“My uncle used to say, A clean workshop is a safe workshop,” Laila recalled.", "The inner quotation needs its own single quotation marks.")],
   "A quotation inside another quotation uses single marks inside the surrounding double marks.", "Double marks on the outside, single marks on the inside.")
order("quotations-dialogue", "L.6.2.b", 4, "Put the pieces in order to make a correctly punctuated sentence.",
      ["“Once the paint dries,”", "said the foreman,", "“we can move the shelves back.”"],
      "The speaker tag interrupts the quotation and is set off by commas on both sides.", "Interrupted quotation: “part one,” tag, “part two.”")
mc("quotations-dialogue", "L.6.2.b", 5, "Which sentence correctly integrates a short quotation from a text into your own sentence?",
   "The report notes that the bridge’s cables were “showing early signs of rust.”",
   [("The report notes that the bridge’s cables were, “showing early signs of rust.”", "No comma is needed when a quoted phrase flows directly into your own sentence."), ("The report notes that the bridge’s cables were “Showing early signs of rust.”", "A quoted phrase blended into your sentence is not capitalized unless it begins a full quoted sentence."), ("The report notes that the bridge’s cables were “showing early signs of rust”.", "The period belongs inside the closing quotation mark.")],
   "An integrated quotation blends smoothly into your sentence without an extra comma or capital, and end punctuation stays inside the marks.", "If the quotation completes your own sentence grammatically, treat it like a normal phrase, not a full quoted sentence.")
mc("quotations-dialogue", "L.6.2.b", 5, "Which sentence correctly punctuates dialogue where the quotation is interrupted and the two parts form ONE sentence?",
   "“If we hurry,” the guide said, “we can still catch the sunset.”",
   [("“If we hurry” the guide said, “we can still catch the sunset.”", "A comma is needed before the closing quotation mark after the first part."), ("“If we hurry,” the guide said, “We can still catch the sunset.”", "Since both parts form one sentence, the second part should not start with a capital letter."), ("“If we hurry,” the guide said “we can still catch the sunset.”", "A comma is needed after the speaker tag, before the second quotation begins.")],
   "When the two quoted parts form a single sentence, commas surround the tag and the second part stays lowercase.", "One interrupted sentence: lowercase after the tag. Two separate sentences: capitalize after the tag.")
mc("quotations-dialogue", "L.6.2.b", 6, "A writer wants to show that two characters spoke, one right after the other. Which formatting choice is correct?",
   "Start a new paragraph each time the speaker changes, even if a line of dialogue is short.",
   [("Keep every line of dialogue from different speakers in one paragraph to save space.", "Mixing different speakers’ lines in one paragraph makes it unclear who is talking."), ("Only start a new paragraph when a speaker’s line is longer than one sentence.", "Paragraph breaks in dialogue depend on who is speaking, not on how long the line is."), ("Add a new paragraph only every third exchange between the two speakers.", "Readers need a new paragraph at every change of speaker, not just periodically.")],
   "A new paragraph for each new speaker is the standard convention that keeps dialogue clear.", "New speaker, new paragraph — this is true even for one-word responses.")
mc("quotations-dialogue", "L.6.2.b", 7, "Which sentence correctly punctuates dialogue where the second quoted part is a new, separate sentence?",
   "“The generator finally started,” Dunia said. “Now we can finish the wiring.”",
   [("“The generator finally started,” Dunia said, “now we can finish the wiring.”", "Since the second part is a separate sentence, it needs its own capital letter and end punctuation, not a comma and lowercase."), ("“The generator finally started” Dunia said. “Now we can finish the wiring.”", "A comma is needed before the closing quotation mark after the first part."), ("“The generator finally started,” Dunia said. “now we can finish the wiring.”", "The second quoted sentence must begin with a capital letter.")],
   "When the second quoted part is its own complete sentence, the tag ends with a period, and the new sentence begins with a capital letter.", "Two separate sentences in dialogue each need their own capital letter and end mark.")

# ================================================================== central-idea (Grades 4-6)
grade(4)

mc("central-idea", "RI.4.2", 1, "Read this paragraph: “Ants work together to build their homes. Some ants dig tunnels underground. Other ants carry leaves and dirt to make walls. A few ants guard the entrance to keep the colony safe.” What is the main idea of this paragraph?",
   "Ants work together, with different jobs, to build and protect their home.",
   [("Ants only dig tunnels and do nothing else.", "The paragraph also describes ants building walls and guarding the entrance."), ("Each ant works completely alone without any teamwork.", "The paragraph shows ants working together, each with a different job."), ("Ants build their homes above ground only.", "The paragraph says some ants dig tunnels underground.")],
   "Every sentence describes a different job that helps build and protect the ant colony as a team.", "Ask: what one idea do all the sentences have in common?")
mc("central-idea", "RI.4.2", 2, "Read this paragraph: “Many families plant a small vegetable garden in their backyard. Growing your own vegetables can save money at the store. Garden vegetables often taste fresher than ones bought in a store. Taking care of a garden also teaches children patience.” What is the main idea of this paragraph?",
   "Growing a backyard vegetable garden offers several benefits to a family.",
   [("Backyard gardens always cost more money than store vegetables.", "The paragraph says gardens can save money, not cost more."), ("Children dislike taking care of gardens.", "The paragraph says gardening teaches patience, not that children dislike it."), ("Store-bought vegetables always taste better than garden vegetables.", "The paragraph says garden vegetables often taste fresher.")],
   "The paragraph lists several separate benefits that all support one main idea about backyard gardens.", "When a paragraph lists several good things about one topic, that is usually the main idea.")
mc("central-idea", "RI.4.2", 3, "Read this paragraph: “A lighthouse helps ships find their way at night. Its bright light can be seen from far away across the water. The light often flashes in a special pattern so sailors know exactly which harbor it marks. Without lighthouses, many ships could crash into rocky coastlines in the dark.” What is the main idea of this paragraph?",
   "Lighthouses help guide ships safely by warning them of the coastline at night.",
   [("Lighthouses are only built during the daytime.", "The paragraph is entirely about how lighthouses help at night."), ("All lighthouses flash in exactly the same pattern.", "The paragraph says the pattern helps sailors tell harbors apart, meaning patterns differ."), ("Ships never need help finding their way.", "The paragraph explains that ships rely on lighthouses to avoid crashing.")],
   "Every detail connects back to the central idea that lighthouses keep ships safe at night.", "Find the idea that explains why every detail in the paragraph is included.")
ms("central-idea", "RI.4.2", 3, "Which TWO details support the main idea that camels are well suited for desert travel?",
   ["A camel can go many days without drinking water.", "Thick pads on a camel's feet keep it from sinking into loose sand."],
   [("Camels are usually brown or tan in color.", "This describes appearance, not survival in the desert."), ("Some camels live in zoos far from any desert.", "This is unrelated to how camels are suited for desert travel.")],
   "These two details directly explain physical features that help camels survive desert travel.", "Choose details that explain WHY the animal survives the desert, not just what it looks like.")
mc("central-idea", "RI.4.2", 4, "Read this paragraph: “Rainwater that falls on a roof usually just runs off into the street and is wasted. Some families now attach a large barrel under a gutter to catch this rainwater instead. The collected water can be used to water a garden or wash a car. Over a rainy season, a single barrel can save a surprising amount of water that would otherwise be lost.” What is the main idea of this paragraph?",
   "Collecting rainwater in a barrel lets families reuse water that would otherwise be wasted.",
   [("Rainwater is never useful for anything around the house.", "The paragraph explains several uses for collected rainwater."), ("Every family already owns a rain barrel.", "The paragraph says some families, not all, use this method."), ("Gutters are only used to make roofs look nice.", "The paragraph describes gutters as part of a water-saving system, not decoration.")],
   "The paragraph's details all build toward the idea that catching rainwater helps families avoid wasting it.", "Look for the problem a paragraph raises and the idea that solves it.")
mc("central-idea", "RI.4.2", 4, "Read this paragraph: “Reading aloud to young children helps them learn new words faster than reading alone later. It also helps children understand how a story is put together, with a beginning, middle and end. Many children remember stories better when they hear a parent's voice. For these reasons, many teachers encourage parents to read aloud every day.” Which sentence BEST restates the main idea of this paragraph?",
   "Reading aloud to young children helps them learn language and understand stories in ways that benefit them.",
   [("Teachers discourage parents from reading to their children.", "The paragraph says teachers encourage this practice, not discourage it."), ("Children only enjoy stories without any pictures.", "Pictures are never mentioned anywhere in the paragraph."), ("Reading aloud works best only with very long books.", "The length of the books is never discussed in the paragraph.")],
   "This sentence combines the paragraph's separate benefits — vocabulary, story structure and memory — into one main idea.", "A good restatement combines the separate details into one general sentence.")
mc("central-idea", "RI.4.2", 5, "Read this paragraph: “Some schools have started ten-minute recess breaks between every class instead of one long recess at midday. Teachers noticed that students focused better in class right after a short break than they did after sitting for a long time. Short, frequent breaks also meant fewer students asked to leave class to use the restroom or get water. Because of these changes, several schools plan to keep the new schedule next year.” What is the main idea of this paragraph?",
   "Switching to short, frequent breaks improved student focus and reduced classroom interruptions.",
   [("Schools removed recess completely to save class time.", "The paragraph describes more frequent breaks, not the removal of recess."), ("Students only asked to leave class during the new short breaks.", "The paragraph says fewer students asked to leave class under the new schedule, not more."), ("The new schedule made no difference in how students behaved.", "The paragraph explains two clear improvements noticed by teachers.")],
   "The paragraph explains a specific change and the two benefits that followed it, which together form the main idea.", "Watch for a change described in a paragraph, followed by the results of that change.")
mc("central-idea", "RI.4.2", 5, "Read this paragraph: “Volunteers at an animal shelter noticed that many dogs stayed longer when their photos online looked blurry or dark. The shelter began taking brighter, better-lit photos of every new dog and writing a short, friendly description for each one. Within two months, dogs were being adopted almost twice as quickly as before. The shelter now trains every new volunteer in basic photography before letting them help with adoptions.” What is the main idea of this paragraph?",
   "Improving online photos and descriptions helped shelter dogs get adopted much faster.",
   [("Dogs with blurry photos were adopted faster than other dogs.", "The paragraph says dogs stayed longer, meaning they were adopted more slowly, when photos were blurry."), ("The shelter stopped posting photos of dogs online entirely.", "The paragraph describes improving photos, not removing them."), ("Volunteers were no longer needed once the new photos were posted.", "The paragraph says volunteers are now trained in photography, showing they are still needed.")],
   "The paragraph connects a specific change (better photos) to a clear result (faster adoptions), which is its main idea.", "Find the change a paragraph describes, then the result that followed.")
mc("central-idea", "RI.4.2", 6, "Read this paragraph: “A small coastal town used to lose several fishing boats every year when sudden storms caught sailors by surprise far from shore. After installing a simple weather-warning siren at the harbor, boats could return to safety before a storm fully formed. Boat losses dropped sharply in the years after the siren was installed, though a few sailors still ignored the warning when fish were plentiful.” What is the main idea of this paragraph, including the detail about sailors who ignored the siren?",
   "A harbor warning siren greatly reduced storm-related boat losses, although not every sailor heeded it.",
   [("The siren completely ended all boat losses in the town forever.", "The paragraph notes that a few sailors still ignored the warning, so losses were reduced but not fully ended."), ("Sailors ignored the siren because it was too quiet to hear.", "No reason involving the siren's volume is given; the paragraph says some sailors ignored it when fish were plentiful."), ("The town removed the siren because it did not work.", "The paragraph never says the siren was removed; it says losses dropped after it was installed.")],
   "A complete main idea should include both the siren's clear benefit and the detail that it did not solve the problem for every sailor.", "When a paragraph ends with an exception, a strong main-idea statement should mention it too.")
mc("central-idea", "RI.4.2", 7, "Read this paragraph: “A small bakery began offering free bread to anyone who came by just before closing time, rather than throwing away unsold loaves. At first, only a handful of neighbors came by each evening, but word spread, and soon a small line formed every night. The owner noticed that many of these same visitors became regular paying customers earlier in the day, since they now trusted the bakery and visited more often. What began as a way to reduce waste ended up growing the bakery's daily business as well.” Which statement BEST captures the main idea of this paragraph?",
   "Giving away unsold bread not only reduced waste but also unexpectedly helped the bakery gain more regular daytime customers.",
   [("The bakery stopped selling bread during the day to focus on giving it away at night.", "The paragraph says the same visitors became paying customers earlier in the day, so daytime selling continued and grew."), ("Giving away bread caused the bakery to lose money overall.", "The paragraph describes the bakery's daily business growing, not losing money."), ("Only strangers who never returned came for the free bread.", "The paragraph says many visitors became regular customers, meaning they did return.")],
   "A full main-idea statement should include both the original goal (reducing waste) and the surprising additional benefit (growing the daytime business).", "When a paragraph describes an unexpected extra result, a strong main-idea statement captures both the original purpose and that result.")

grade(5)

mc("central-idea", "RI.5.2", 1, "Read this paragraph: “Octopuses are known for their remarkable intelligence among invertebrates. They can solve simple puzzles to reach hidden food. Many octopuses have escaped from aquarium tanks by figuring out how to open lids. Scientists have even observed them using tools, such as carrying shells to use as shelter later.” What is the central idea of this paragraph?",
   "Octopuses show several signs of surprising intelligence for an invertebrate.",
   [("Octopuses cannot solve any kind of puzzle.", "The paragraph says they can solve simple puzzles to reach food."), ("Aquariums are specially designed so octopuses can never escape.", "The paragraph says octopuses have escaped by opening lids."), ("No other invertebrate has ever been studied by scientists.", "The paragraph only discusses octopuses and does not compare them to other invertebrates.")],
   "Each example — puzzle-solving, escaping tanks and tool use — supports the same overall claim about octopus intelligence.", "Look for the one idea that connects every specific example in a paragraph.")
mc("central-idea", "RI.5.2", 2, "Read this paragraph: “Many cities are adding more bicycle lanes to busy streets. Protected lanes with a physical barrier reduce accidents between cyclists and cars. Cities with more bike lanes often see fewer traffic jams, since some drivers switch to biking instead. Bike lanes can also encourage more people to exercise as part of their daily commute.” What is the central idea of this paragraph?",
   "Adding bicycle lanes brings several benefits to a city, from safety to traffic to health.",
   [("Bicycle lanes always make traffic jams worse.", "The paragraph says cities with more bike lanes often see fewer traffic jams."), ("Protected bike lanes have no effect on cyclist safety.", "The paragraph says protected lanes reduce accidents."), ("People who bike to work rarely get any exercise.", "The paragraph says biking to work encourages exercise.")],
   "The paragraph lists three separate benefits of bike lanes, all supporting one overall claim about their value to a city.", "When several distinct benefits are listed, the central idea usually ties them together.")
mc("central-idea", "RI.5.2", 3, "Read this paragraph: “Icebergs form when large chunks of ice break off from glaciers or ice shelves and drift into the ocean. Only about one-tenth of an iceberg is visible above the water's surface, while the rest remains hidden below. This hidden mass makes icebergs especially dangerous to ships, since a vessel can misjudge how far the ice actually extends underwater. Sailors have used sonar for decades to measure an iceberg's true size before sailing nearby.” What is the central idea of this paragraph?",
   "Icebergs are more dangerous than they appear because most of their size is hidden underwater.",
   [("Icebergs are completely visible above the water's surface.", "The paragraph says only about one-tenth is visible above the surface."), ("Sonar was invented specifically to study icebergs.", "The paragraph says sailors use sonar to measure icebergs, not that it was invented for that purpose."), ("Icebergs form only from ocean water freezing in place.", "The paragraph says icebergs form from ice breaking off glaciers or ice shelves, not from ocean water freezing.")],
   "The paragraph's details about hidden mass and sonar use both support the central idea about hidden danger.", "Find the idea that explains why the paragraph includes the detail about sonar.")
ms("central-idea", "RI.5.2", 3, "Which TWO details support the central idea that coral reefs face serious threats from warming oceans?",
   ["Warm water causes coral to expel the algae that give it color and food.", "Prolonged high temperatures can cause bleached coral to die."],
   [("Coral reefs are found in oceans all around the world.", "This describes where reefs are located, not a threat they face."), ("Some tourists enjoy snorkeling near coral reefs.", "This describes a human activity, not a threat to reefs from warming water.")],
   "These two details directly explain how warming water damages and can kill coral.", "Choose details that explain the THREAT itself, not background facts about reefs.")
mc("central-idea", "RI.5.2", 4, "Read this paragraph: “Public libraries have begun offering more than just books to borrow. Many now lend out tools, sewing machines and even telescopes for a short period. Some libraries host free coding classes and resume-writing workshops for adults. These added services have drawn in visitors who might never have come in for books alone.” What is the central idea of this paragraph?",
   "Libraries are attracting new visitors by offering services beyond just lending books.",
   [("Libraries have stopped lending books to focus on other services.", "The paragraph says libraries now offer more THAN books, not that they stopped lending books."), ("Only children are interested in the new library services.", "The paragraph mentions coding classes and resume workshops, which are described as being for adults."), ("Telescopes are the most popular item libraries now lend.", "The paragraph does not say which borrowed item is most popular.")],
   "The paragraph lists several new services and ends by connecting them to a central claim about attracting new visitors.", "Look at the final sentence of a paragraph — it often restates the central idea in general terms.")
mc("central-idea", "RI.5.2", 4, "Read this paragraph: “Researchers studying ant colonies have found that ants use chemical trails, called pheromones, to communicate with each other. When an ant finds food, it leaves a pheromone trail back to the colony. Other ants follow the strongest trail, which helps the colony quickly focus on the best food source. Over time, weaker trails to less useful food fade away entirely.” Which sentence BEST restates the central idea of this paragraph?",
   "Ants use chemical trails to communicate and efficiently guide the colony toward the best food sources.",
   [("Ants communicate only through physical touch, never chemicals.", "The paragraph is entirely about chemical pheromone trails, not touch."), ("Every ant trail leads to a different food source forever.", "The paragraph says weaker trails fade away over time, so they do not last forever."), ("Ants cannot tell the difference between a strong and a weak trail.", "The paragraph says ants follow the strongest trail, meaning they can tell the difference.")],
   "This sentence combines the paragraph's details about pheromones, trail-following and fading trails into one general idea.", "A strong restatement should combine separate details into one overall claim.")
mc("central-idea", "RI.5.2", 5, "Read this paragraph: “A regional airline began charging passengers a small fee to check a bag, while making the fee free for passengers who booked online a week in advance. Ticket sales rose for flights booked early, since the discount gave travelers a clear reason to plan ahead instead of waiting until the last minute. Flights booked at the last minute, which used to fill up with checked bags, now carry noticeably less luggage overall. The airline credits the new fee structure with both steadier bookings and lighter planes.” What is the central idea of this paragraph?",
   "A new baggage fee structure changed passenger behavior in ways that benefited the airline in two separate ways.",
   [("The airline removed baggage fees for all passengers.", "The paragraph describes a fee that is only waived for passengers who book a week in advance, not removed for everyone."), ("Passengers who book early now check more bags than before.", "The paragraph says last-minute flights carry less luggage, and does not describe early bookers checking more bags."), ("The new fee structure had no effect on when people booked flights.", "The paragraph explicitly says ticket sales rose for flights booked early because of the fee structure.")],
   "The paragraph connects one policy change to two distinct results — steadier bookings and lighter planes — which together form the central idea.", "When a paragraph names two separate results from one cause, the central idea usually covers both.")
mc("central-idea", "RI.5.2", 5, "Read this paragraph: “A community garden project initially struggled because most plots sat empty during the hottest summer weeks, when volunteers avoided working outside. Organizers moved the main watering and harvesting schedule to early morning and evening instead of midday. Plot usage rose significantly once volunteers no longer had to work during the worst heat, though a few plots near the garden's shadeless edge remained harder to keep staffed.” What is the central idea of this paragraph, including the detail about the shadeless plots?",
   "Rescheduling garden work around the hottest hours fixed most of the staffing problem, though a few especially hot plots stayed harder to maintain.",
   [("Changing the schedule solved every single staffing problem completely.", "The paragraph notes that plots near the shadeless edge remained harder to staff, so the problem was not fully solved."), ("Volunteers avoided the garden entirely, even after the schedule changed.", "The paragraph says plot usage rose significantly after the change, meaning volunteers did return."), ("The shadeless plots were the only ones that were ever used.", "The paragraph implies the opposite — most plots improved, while the shadeless ones remained a harder exception.")],
   "A complete central-idea statement should include both the main improvement and the specific detail about the remaining exception.", "When a paragraph closes with “though” or “however,” check whether that detail belongs in a complete central-idea statement.")
mc("central-idea", "RI.5.2", 6, "Read this paragraph: “A regional hospital introduced color-coded wristbands to flag patients with specific allergies, replacing handwritten notes that staff sometimes missed during busy shifts. Allergy-related medication errors dropped noticeably within the first six months of using the wristbands. However, the hospital later found that wristbands sometimes slipped off during long procedures, so staff began double-checking allergy status in the patient's digital chart as well.” What is the central idea of this paragraph, including the limitation that was discovered later?",
   "Color-coded wristbands reduced allergy-related errors, but the hospital had to add a digital backup check after discovering the wristbands could slip off.",
   [("The wristbands completely replaced every other safety check at the hospital.", "The paragraph says staff added a digital chart check as well, so the wristbands did not replace every other safety measure."), ("The hospital stopped using wristbands once the slipping problem was discovered.", "The paragraph says staff added a backup check, not that they abandoned the wristbands."), ("Handwritten notes were found to be more reliable than the wristbands.", "The paragraph says errors dropped after switching away from handwritten notes, suggesting the wristbands were actually more reliable overall.")],
   "A full central-idea statement should include both the wristbands' clear benefit and the specific limitation that led to an added safeguard.", "When a text reports a fix and then a later discovered flaw, the central idea usually needs to mention both.")
mc("central-idea", "RI.5.2", 7, "Read this paragraph: “A small publishing company began offering authors a choice between a traditional contract with a larger upfront payment and a smaller upfront payment paired with a higher share of ongoing sales. Most new authors chose the larger upfront payment, valuing certainty over a book's uncertain future sales. Authors whose first books had sold unusually well, however, increasingly chose the second option for their next book, trusting their track record to earn more over time. The company found that offering both options kept both new and established authors satisfied in different ways.” Which statement BEST captures the central idea of this paragraph?",
   "Giving authors a choice between two payment structures satisfied different authors differently, based on their experience and confidence in future sales.",
   [("Every author at the company always prefers the same payment option.", "The paragraph says new and established authors tended to choose differently, not the same option."), ("The company eliminated the traditional upfront-payment contract entirely.", "The paragraph says most new authors still chose the larger upfront payment, so that option was not eliminated."), ("Authors with successful first books always regretted choosing the second option.", "The paragraph says these authors trusted their track record and chose the option deliberately; no regret is mentioned.")],
   "A full central-idea statement should capture that the options appealed to different groups for different, text-stated reasons.", "When a paragraph explains WHY different groups made different choices, the central idea should reflect that reasoning, not just the choices themselves.")

grade(6)

mc("central-idea", "RI.6.2", 1, "What is the central idea of “Should Homework Be Optional?”",
   "Homework should be optional and matched to each student's needs rather than required for everyone the same way.",
   [("All homework should be eliminated completely.", "The article says homework could still be assigned, just not required for students who already show mastery."), ("Students who get less homework always score higher on tests.", "The article says there is little difference in scores, not that less homework guarantees higher scores."), ("Teachers dislike grading homework assignments.", "Teacher opinions about grading are never mentioned anywhere in the article.")],
   "Every paragraph builds toward the idea that flexible, needs-based homework serves students better than a required, one-size-fits-all approach.", "The central idea usually appears near the beginning and is restated at the end.", "G6-P10")
mc("central-idea", "RI.6.2", 2, "Which detail BEST supports the central idea that mandatory homework may not actually raise achievement?",
   "A review of multiple studies found a weak connection between homework and achievement for younger students.",
   [("Students spend hours on homework after a full school day.", "This describes the current situation, not evidence about achievement."), ("Teachers could still assign practice problems under an optional system.", "This describes how optional homework would work, not evidence about achievement."), ("Heavy homework loads are linked to stress and poor sleep.", "This supports a different point, about wellbeing, not achievement.")],
   "This research finding directly challenges the claim that homework improves test scores.", "Look for the detail that is evidence, not just background information.", "G6-P10")
ms("central-idea", "RI.6.2", 3, "Which TWO sentences belong in an objective summary of the homework article's central ideas?",
   ["Research shows a weak link between required homework and achievement, especially for younger students.", "Heavy mandatory homework is linked to higher stress and less sleep for students."],
   [("Homework is the most stressful part of being a student.", "This states an opinion rather than a fact reported in the article."), ("Every teacher secretly agrees that homework should end.", "Teachers' private opinions are never described in the article.")],
   "Objective summaries include only facts and findings stated in the text, not opinions.", "Ask whether the article itself states the sentence as evidence, or whether it is an added opinion.", "G6-P10")
mc("central-idea", "RI.6.2", 3, "How does the central idea of “Should Homework Be Optional?” develop across the text?",
   "Each paragraph adds a new piece of evidence — achievement, flexibility, targeted support and wellbeing — building toward the same recommendation.",
   [("It tells a personal story about one struggling student.", "No single student's personal story is told anywhere in the article."), ("It lists homework rules from several different countries.", "No other countries' homework rules are compared or listed in the article."), ("It focuses only on one single piece of evidence, repeated five times.", "Four distinct kinds of evidence are introduced in the article, not one point repeated.")],
   "The article layers several different kinds of evidence, each supporting the same central recommendation.", "Track how each new paragraph adds a different kind of support for the same idea.", "G6-P10")
mc("central-idea", "RI.6.2", 4, "Which sentence would BEST conclude a summary of the central idea of “Should Homework Be Optional?”?",
   "Matching homework to what each student actually needs would likely help both learning and wellbeing more than requiring the same amount for everyone.",
   [("Homework should always be assigned on Fridays.", "No particular day for assigning homework is discussed anywhere in the article."), ("Students who finish homework quickly should receive extra assignments.", "This directly contradicts the article's suggestion that such students use the time differently."), ("Parents should check their children's homework every night.", "Parental involvement in checking homework is never addressed in the article.")],
   "This sentence captures the article's final recommendation, which ties together all the evidence presented.", "A strong concluding sentence should connect back to the article's opening claim.", "G6-P10")
mc("central-idea", "RI.6.2", 5, "A reader claims the homework article argues homework should be banned entirely for all grade levels. Is this an accurate statement of the article's central idea?",
   "No — the article argues homework should become optional and flexible, not banned, and it focuses specifically on elementary and middle school students.",
   [("Yes, because the article never mentions homework being assigned at all.", "The article explicitly discusses teachers still assigning practice problems under an optional system."), ("Yes, because test scores always drop when homework is assigned.", "The article reports a weak connection for younger students, not that scores always drop."), ("No, because the article argues homework should increase for struggling students only.", "The article proposes more flexibility and targeted support, not simply increasing homework for one group.")],
   "The article's actual claim is for flexibility and optionality, not elimination, and it is specific about which age groups the evidence applies to.", "Check a restated central idea carefully against both WHAT the text claims and WHO it is about.", "G6-P10")
mc("central-idea", "RI.6.2", 5, "Read this paragraph: “Urban beekeeping has grown quickly in several major cities over the past decade. Rooftop hives give bees access to park flowers without competing with rural farmland. City-produced honey often sells at a premium because customers see it as a novelty. Beyond honey, these urban bee colonies help pollinate street trees and community gardens that might otherwise produce less fruit.” What is the central idea of this paragraph?",
   "Keeping bees in cities benefits both beekeepers and the surrounding urban environment in more than one way.",
   [("Urban honey always costs less than honey from rural farms.", "The paragraph says city honey sells at a premium, meaning it costs more, not less."), ("Rooftop hives compete directly with rural farms for the same bees.", "The paragraph says rooftop hives avoid competing with rural farmland."), ("Community gardens cannot survive without rooftop beehives nearby.", "The paragraph says pollination helps gardens produce more, not that gardens cannot survive at all without bees.")],
   "The paragraph names several distinct benefits — honey, novelty value and pollination — that together support one overall idea about the value of urban beekeeping.", "When several different benefits are listed, the central idea usually ties them together with one general claim.")
mc("central-idea", "RI.6.2", 6, "Read this paragraph: “A growing number of companies now let employees choose between working from an office, working from home, or splitting their week between the two. Early data suggests that fully remote workers report the most flexibility but also the most difficulty feeling connected to coworkers. Employees who split their time report feeling nearly as flexible while staying better connected to their teams, which is why many companies are now encouraging this hybrid option over either extreme.” Which sentence BEST states the central idea of this paragraph?",
   "A mix of in-office and remote work may balance flexibility and connection better than choosing only one extreme.",
   [("Fully remote work is always the best option for every employee.", "The paragraph says fully remote workers struggle with connection, so it is not described as the best option for everyone."), ("Working in an office at all times guarantees strong teamwork.", "Full-time office work is not described as guaranteed to produce strong teamwork; it is barely mentioned at all."), ("Companies should let employees choose any schedule without tracking results.", "The paragraph is based on data companies are using to guide a specific recommendation, not on avoiding tracking altogether.")],
   "The paragraph compares three work arrangements and builds toward a recommendation for the middle option, which is the central idea.", "When a paragraph compares options and ends by favoring one, that favored option is usually the central idea.")
mc("central-idea", "RI.6.2", 7, "Read this paragraph: “Several hospitals recently began offering patients a short recovery survey by text message instead of a lengthy phone call days after a procedure. Response rates rose sharply because patients could reply in a free moment rather than scheduling a call, and hospitals received feedback faster, letting staff address complications sooner. However, patients without reliable phone access or who were less comfortable with texting were sometimes missed entirely, so several hospitals also kept a phone-call option available for those patients.” Which statement BEST captures the central idea of this paragraph, including its limitation?",
   "Text-message surveys sped up and improved patient feedback overall, though hospitals still had to keep a phone option to avoid leaving some patients out.",
   [("Text-message surveys completely replaced phone calls at every hospital.", "The paragraph explicitly says hospitals kept a phone-call option for some patients, so phone calls were not entirely replaced."), ("Patients overwhelmingly prefer phone calls to text messages after a procedure.", "The paragraph reports that response rates rose with texting, suggesting many patients preferred it, not phone calls."), ("Hospitals abandoned the text-message survey once they noticed a problem.", "The paragraph says hospitals kept BOTH options, rather than abandoning the new text-message method.")],
   "A full statement of the central idea must include both the main benefit (faster, better feedback) and the stated limitation (some patients were missed), since the paragraph explicitly balances both.", "When a paragraph ends with a limitation or exception, a strong central-idea statement should account for it, not just the main benefit.")
