"""
Question bank top-up 2, batch 03: brings these families to the full target of 50 items each
(original content, Grades 4-6): writing-informative, text-features, commas, greek-latin-roots,
context-clues.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== writing-informative
grade(4)

mc("writing-informative", "W.4.2.a", 1,
   "Which sentence is the BEST topic sentence for a paragraph about why bees are important to gardens?",
   "Bees help gardens grow by carrying pollen from flower to flower.",
   [("My aunt has a garden full of roses.", "This is a personal detail, not a general introduction to the topic."),
    ("Bees have six legs.", "This is too narrow—it is a detail, not an introduction."),
    ("Gardens need water every day.", "This sentence does not even mention bees, so it does not introduce the topic.")],
   "A topic sentence gives a general statement that introduces the paragraph's main focus.",
   "Ask: does this sentence cover the WHOLE paragraph, or just one detail?")

mc("writing-informative", "W.4.2.a", 1,
   "A paragraph explains that camels can close their nostrils in sandstorms, store fat in their humps, and have wide feet that don't sink in sand. Which added sentence does NOT belong in this paragraph?",
   "My brother visited a zoo last summer.",
   [("Camels can close their nostrils during sandstorms.", "This fits the paragraph's focus on desert survival, so it belongs."),
    ("A camel's hump stores fat, not water.", "This fits the paragraph's focus on desert survival, so it belongs."),
    ("Thick eyelashes keep sand out of a camel's eyes.", "This fits the paragraph's focus on desert survival, so it belongs.")],
   "A personal story about a zoo visit does not relate to how camels survive the desert.",
   "Every sentence in an informative paragraph should support the main topic.")

mc("writing-informative", "W.4.2.a", 2,
   "Which sentence is the BEST topic sentence for a paragraph about volcanoes?",
   "Volcanoes change the land in dramatic ways.",
   [("Lava can reach temperatures of 1,200 degrees Celsius.", "This is a supporting detail, not a general introduction."),
    ("Mount Vesuvius erupted long ago.", "This is one specific example, too narrow for a topic sentence."),
    ("Rocks are hard.", "This is too general and does not focus on volcanoes specifically.")],
   "A good topic sentence states the paragraph's main focus before the details appear.",
   "Topic sentences are broad enough to introduce every detail that follows.")

mc("writing-informative", "W.4.2.a", 2,
   "A report about coral reefs has two headings: 'What Lives in a Reef' and 'Why Reefs Are in Danger.' Under which heading does the fact 'Warmer ocean water can cause coral to turn white and die' belong?",
   "Why Reefs Are in Danger",
   [("What Lives in a Reef", "This heading is about the creatures living in a reef, not threats to it."),
    ("The report's title", "A title names the whole report, not one single fact."),
    ("Neither heading", "The fact clearly fits under the danger heading, so it does belong somewhere.")],
   "Grouping facts under matching headings helps readers find information quickly.",
   "Ask what each fact is MOSTLY about before choosing its heading.")

order("writing-informative", "W.4.2.a", 3,
      "Put these sentences in the order that makes the clearest informative paragraph about recycling.",
      ["Recycling helps protect our environment in several ways.",
       "First, recycling glass and plastic saves energy that factories would otherwise use to make new materials.",
       "Second, recycling paper means fewer trees need to be cut down.",
       "Because of these benefits, many communities now have recycling bins on every street."],
      "A clear informative paragraph starts with a general topic sentence, groups related facts, then ends with a conclusion.",
      "Look for the sentence that introduces the whole topic—it comes first.")

mc("writing-informative", "W.4.2.a", 3,
   "Which sentence gives a supporting detail for the topic sentence 'Spiders help control the number of insects around our homes'?",
   "A single spider can eat dozens of insects in one week.",
   [("Some people are afraid of spiders.", "This is an opinion about feelings, not a fact supporting the topic."),
    ("Spiders have eight legs.", "This is true, but it does not support the idea that spiders control insects."),
    ("My cousin found a spider in the garage.", "This is a personal story, not a supporting fact.")],
   "Supporting details give facts that explain or prove the topic sentence.",
   "A supporting detail should answer the question the topic sentence raises.")

tf("writing-informative", "W.4.2.a", 4,
   "Grouping related facts under the same heading makes an informative report easier to understand.", True,
   "Readers can find information faster when similar facts are grouped together instead of scattered.",
   "Sort your facts into groups before you choose headings for them.")

mc("writing-informative", "W.4.2.a", 4,
   "A paragraph begins with 'Honeybees play an important role in nature' and then explains pollination and honey production. Which sentence BEST concludes the paragraph?",
   "Because of all these benefits, honeybees deserve our protection.",
   [("Bees can sting when they feel threatened.", "This introduces a new, unrelated idea instead of wrapping up the paragraph."),
    ("My neighbor keeps three beehives.", "This is a personal detail that does not conclude the main idea."),
    ("Honey comes in different colors.", "This adds a new fact rather than closing the paragraph.")],
   "A concluding sentence sums up the main idea the paragraph already explained.",
   "A strong ending refers back to the topic sentence's main idea.")

mc("writing-informative", "W.4.2.a", 5,
   "A paragraph will explain that libraries offer free books, quiet study rooms, and computer access. Which topic sentence BEST introduces this paragraph?",
   "Libraries offer many free resources that help the whole community.",
   [("I go to the library every Saturday.", "This is a personal routine, not a general introduction to the topic."),
    ("Books have covers and pages.", "This is too general and does not focus on the library's resources."),
    ("The library computers are often slow.", "This is a narrow complaint, not an introduction covering all three facts.")],
   "The topic sentence must be broad enough to cover all three supporting facts that follow.",
   "Check that your topic sentence fits every detail you plan to include.")

order("writing-informative", "W.4.2.a", 5,
      "Put these sentences in the order that makes the clearest informative paragraph about baking bread.",
      ["Baking bread at home follows a few simple, important steps.",
       "First, a baker mixes flour, water, yeast, and salt into a soft dough.",
       "Next, the dough rests so the yeast can make it rise before it goes into a hot oven.",
       "After about thirty minutes of baking, the loaf comes out golden brown and ready to eat."],
      "A clear paragraph introduces the topic first, then lists the steps in the order they happen.",
      "Sequence words like First, Next, and After signal the correct order.")

mc("writing-informative", "W.4.2.a", 5,
   "A report about the solar system includes three facts: planets' distances from the sun, how long each planet takes to orbit, and each planet's average temperature. Which heading BEST groups all three facts together?",
   "How the Planets Compare",
   [("Famous Astronauts", "This heading is about people, not planet facts."),
    ("The History of Telescopes", "This heading is about an instrument's history, unrelated to the three facts."),
    ("Our Favorite Planets", "This heading is about opinions, not the measurable facts listed.")],
   "A heading should describe what all the grouped facts have in common.",
   "Choose a heading broad enough to cover every fact listed underneath it.")

mc("writing-informative", "W.4.2.a", 6,
   "A paragraph explains that Emperor penguins huddle together for warmth, have thick layers of fat, and have dense feathers that trap heat. Which sentence should be REMOVED because it does not belong?",
   "Penguins are closely related to seagulls, which also live near oceans.",
   [("Huddling in large groups helps penguins share body heat.", "This directly supports how penguins stay warm, so it belongs."),
    ("A thick layer of fat called blubber insulates penguins from cold water.", "This supports the paragraph's focus on staying warm, so it belongs."),
    ("Dense, oily feathers trap a layer of warm air next to a penguin's skin.", "This explains another way penguins stay warm, so it belongs.")],
   "A fact about penguins' relatives does not explain how penguins stay warm, so it breaks the paragraph's focus.",
   "Remove any sentence that does not support the paragraph's main idea.")

mc("writing-informative", "W.4.2.a", 6,
   "Which revision turns this weak topic sentence into one with a clear general observation and focus? Weak: 'Museums have stuff in them.'",
   "Museums preserve objects that teach visitors about history and science.",
   [("Museums have stuff in them, like old things.", "This barely improves the vague wording and still lacks a clear focus."),
    ("I visited a museum last year.", "This replaces the topic sentence with a personal story instead of a focus."),
    ("The museum was closed on Monday.", "This is an unrelated detail, not a clear focus for the paragraph.")],
   "A strong topic sentence replaces vague words with a specific, informative focus.",
   "Ask what the paragraph is really about, then name it precisely.")

mc("writing-informative", "W.4.2.a", 7,
   "A writer has two separate facts: 'Sea turtles hatch on sandy beaches.' and 'Sea turtles must crawl to the ocean right after hatching.' Which heading would BEST group these two related facts in a report?",
   "From Nest to Sea: A Hatchling's First Journey",
   [("What Sea Turtles Eat", "This heading is about diet, not hatching and reaching the ocean."),
    ("Sea Turtle Predators", "This heading is about danger from other animals, not the hatching journey."),
    ("The History of Turtle Research", "This heading is about scientific study, not the two hatching facts given.")],
   "The best heading names exactly what both grouped facts have in common.",
   "A precise heading often names both the starting point and the ending point of a process.")

mc("writing-informative", "W.4.2.a", 6,
   "A report explains that sea otters wrap themselves in kelp so they don't drift away while sleeping, and that they crack open shellfish using rocks. Which heading BEST fits both facts?",
   "Clever Ways Sea Otters Survive",
   [("Where Sea Otters Live", "That heading would fit facts about habitat, not these two survival behaviors."),
    ("Sea Otters in Danger", "That heading would fit facts about threats, not these clever survival behaviors."),
    ("What Sea Otters Look Like", "That heading would fit facts about appearance, not behavior.")],
   "Both facts describe clever behaviors sea otters use to survive, which the heading names directly.",
   "A heading should match what the grouped facts actually describe, not just the general topic.")

order("writing-informative", "W.4.2.a", 7,
      "Put these sentences in the order that makes the clearest informative paragraph about the water cycle.",
      ["The water cycle moves water continuously between Earth's oceans, air, and land.",
       "During evaporation, heat from the sun turns liquid water into vapor that rises into the atmosphere.",
       "As that vapor cools and condenses into clouds, it eventually falls back to Earth as precipitation.",
       "This endless cycle explains why the same water has been reused for billions of years."],
      "A well-organized paragraph introduces the topic, explains the process step by step, then concludes with its significance.",
      "Look for the sentence that explains the overall significance—it usually comes last.")

grade(5)

mc("writing-informative", "L.5.6", 1,
   "In a report about weather, which word precisely names the measurement of how much water is in the air?",
   "humidity",
   [("temperature", "Temperature measures heat, not the amount of water in the air."),
    ("visibility", "Visibility measures how far a person can see."),
    ("pressure", "Pressure measures the weight of the air, not its moisture.")],
   "Humidity is the specific scientific term for moisture in the air.",
   "Precise domain words name an idea exactly—don't settle for a vague one.")

dd("writing-informative", "L.5.6", 1,
   "Choose the best transition to ADD an idea: 'Plants need sunlight to grow. ____, they need water and nutrients from the soil.'",
   "Additionally",
   [("However", "However signals contrast, but these two ideas agree and simply add on to each other."),
    ("For example", "The second sentence is not a specific example of the first."),
    ("As a result", "The second idea is not a result caused by the first.")],
   "Additionally signals that a second, similar supporting idea is being added.",
   "L.5.6: choose transitions that match whether ideas add, contrast, or show a result.")

mc("writing-informative", "L.5.6", 2,
   "In a report about digestion, which word precisely names the organ that breaks down food using acid?",
   "stomach",
   [("esophagus", "The esophagus only carries food down; it does not use acid to break it down."),
    ("liver", "The liver filters blood and makes bile; it does not digest food with acid."),
    ("throat", "The throat is a passage, not an organ that digests food with acid.")],
   "The stomach is the specific organ that uses acid to begin breaking down food.",
   "Precise domain-specific nouns name the exact body part, not a general area.")

dd("writing-informative", "L.5.6", 2,
   "Choose the best transition: 'Volcanoes release ash into the sky. ____, earthquakes shake the ground without releasing ash.'",
   "In contrast",
   [("Similarly", "Similarly signals agreement, but these two events are being contrasted."),
    ("For instance", "This sentence is not an example of the first one."),
    ("Therefore", "The second idea is not a result caused by the first.")],
   "In contrast signals that the second sentence shows a difference from the first.",
   "Contrast words (however, in contrast) show that two ideas differ.")

mc("writing-informative", "L.5.6", 3,
   "In a report about government, which word precisely names a group of citizens chosen to make laws for a country?",
   "legislature",
   [("jury", "A jury decides court cases; it does not make laws."),
    ("cabinet", "A cabinet advises a leader but does not usually write the country's laws itself."),
    ("committee", "Committee is a vaguer, more general term than the specific lawmaking body.")],
   "Legislature is the precise term for the lawmaking body of a government.",
   "Domain-specific vocabulary names an exact role, not a general group.")

mc("writing-informative", "L.5.6", 3,
   "In a report about rocks, which word precisely describes rock formed when melted rock cools and hardens?",
   "igneous",
   [("sedimentary", "Sedimentary rock forms from layers of settled particles, not cooled magma."),
    ("metamorphic", "Metamorphic rock forms when heat and pressure change existing rock."),
    ("mineral", "Mineral is a broader term, not the specific rock type formed from cooled magma.")],
   "Igneous is the precise scientific term for rock formed from cooled, hardened magma or lava.",
   "Learn the exact science term instead of a general word like 'rock.'")

mc("writing-informative", "L.5.6", 4,
   "In a report about trade, which word precisely names goods or services sent to another country to sell?",
   "exports",
   [("imports", "Imports are goods brought IN from another country, the opposite direction."),
    ("profits", "Profits are the money earned, not the goods themselves."),
    ("taxes", "Taxes are fees collected by a government, not goods sent abroad.")],
   "Exports is the precise economic term for goods sent out of a country to be sold.",
   "Precise vocabulary helps readers picture the exact direction of trade.")

dd("writing-informative", "L.5.6", 4,
   "Choose the best transition: 'Bacteria multiply quickly in warm, moist places. ____, food left out in summer heat can spoil within hours.'",
   "As a result",
   [("However", "However signals contrast, but the second sentence is a consequence, not a contrast."),
    ("For example", "The second sentence states a general effect, not one specific instance."),
    ("Meanwhile", "Meanwhile shows two things happening at the same time, not cause and effect.")],
   "As a result signals that spoiling food is a direct effect of bacteria multiplying quickly.",
   "Cause-and-effect words (as a result, therefore) connect a reason to its outcome.")

mc("writing-informative", "L.5.6", 4,
   "In a report about ecosystems, which word precisely names an animal that eats only plants?",
   "herbivore",
   [("carnivore", "A carnivore eats only meat."),
    ("omnivore", "An omnivore eats both plants and animals."),
    ("predator", "A predator hunts other animals; it does not describe a plant-eater.")],
   "Herbivore is the precise term for an animal whose diet is only plants.",
   "Science reports use exact diet terms: herbivore, carnivore, omnivore.")

mc("writing-informative", "L.5.6", 5,
   "In a report about forces, which word precisely names the force that slows down a sliding object by rubbing against a surface?",
   "friction",
   [("gravity", "Gravity pulls objects toward Earth; it does not come from rubbing surfaces."),
    ("momentum", "Momentum describes an object's motion, not the force that slows it."),
    ("velocity", "Velocity measures speed and direction, not a force.")],
   "Friction is the precise term for the force created when surfaces rub together.",
   "Science vocabulary names the exact force, not just 'something that slows things down.'")

dd("writing-informative", "L.5.6", 5,
   "Choose the best transition: 'Rivers flow constantly downhill. ____, lakes are often still bodies of water with little movement.'",
   "On the other hand",
   [("Likewise", "Likewise signals similarity, but rivers and lakes are being contrasted here."),
    ("Additionally", "Additionally adds a similar point, but this sentence shows a difference instead."),
    ("Consequently", "Consequently signals a result, not a contrast.")],
   "On the other hand signals that lakes are being contrasted with rivers.",
   "Choose contrast transitions when two ideas show a clear difference.")

mc("writing-informative", "L.5.6", 6,
   "In a report about Ancient Egypt, which word precisely names a tomb built for a ruler, often shaped with four triangular sides?",
   "pyramid",
   [("obelisk", "An obelisk is a tall, narrow stone pillar, not a four-sided tomb shape."),
    ("sarcophagus", "A sarcophagus is the stone coffin inside a tomb, not the tomb structure itself."),
    ("temple", "A temple was used for worship, not primarily built as a ruler's tomb.")],
   "Pyramid is the precise term for this specific tomb shape used by ancient Egyptian rulers.",
   "Precise nouns name the exact structure, not just 'a building.'")

mc("writing-informative", "L.5.6", 6,
   "Which word precisely describes the long-term pattern of weather in a region, rather than conditions on a single day?",
   "climate",
   [("forecast", "A forecast predicts short-term weather, not a long-term pattern."),
    ("season", "A season is one part of the year, not the overall long-term pattern."),
    ("humidity", "Humidity is one single weather measurement, not the overall long-term pattern.")],
   "Climate is the precise term for a region's average weather pattern over many years.",
   "Distinguish 'weather' (today) from 'climate' (long-term pattern).")

mc("writing-informative", "L.5.6", 7,
   "Replace the underlined vague word for precision: 'Electricity moves through the wire THING.' Which domain-specific word should replace THING?",
   "circuit",
   [("box", "Box is still vague and does not name the specific path electricity follows."),
    ("machine", "Machine is too general; it doesn't name the path electricity actually travels through."),
    ("cord", "A cord is only the outer wire covering, not the full path electricity follows.")],
   "Circuit is the precise term for the complete path electricity travels through.",
   "Replace vague nouns like 'thing' with the exact domain-specific term.")

dd("writing-informative", "L.5.6", 7,
   "Choose the best transition: 'Wind and water slowly wear away rock, a process called erosion. ____, when that worn-away material settles somewhere new, scientists call it deposition.'",
   "By contrast",
   [("Similarly", "Similarly signals sameness, but erosion and deposition are being distinguished as opposite processes."),
    ("For example", "Deposition is not one specific example of erosion; it is a separate, contrasting process."),
    ("Therefore", "Deposition is not a result caused by the definition of erosion; it is a contrasting process.")],
   "By contrast signals that deposition is the opposite process from erosion.",
   "Use contrast transitions to clarify two related but opposite scientific processes.")

grade(6)

mc("writing-informative", "W.6.2.c", 1,
   "Choose the best transition: 'Electric cars produce no tailpipe pollution. ____, they are far quieter than gasoline cars.'",
   "Moreover",
   [("However", "The second sentence adds another benefit; it does not contrast with the first."),
    ("For instance", "Being quieter is not a specific example of producing no pollution."),
    ("Therefore", "Quietness is not a result caused by the lack of pollution.")],
   "Moreover adds a second, related benefit to the first idea.",
   "W.6.2.c: choose transitions that match the exact relationship between ideas.")

mc("writing-informative", "W.6.2.c", 1,
   "Choose the best transition: 'Vegetables are full of vitamins. ____, many children avoid eating them.'",
   "However",
   [("Similarly", "Similarly signals agreement, but these two ideas contrast."),
    ("For example", "Avoiding vegetables is not an example of vitamins."),
    ("As a result", "Avoiding vegetables is not caused by vitamins being present.")],
   "However signals the contrast between a food's healthy vitamins and children avoiding it.",
   "Contrast transitions connect ideas that go against each other.")

mc("writing-informative", "W.6.2.c", 2,
   "Choose the best transition: 'Space exploration has produced many everyday inventions. ____, memory foam was first developed for astronaut seats.'",
   "For instance",
   [("However", "The second sentence supports the first with an example; it does not contrast."),
    ("Meanwhile", "Meanwhile suggests two events at the same time, not an example."),
    ("Nevertheless", "Nevertheless signals contrast, not an illustration.")],
   "For instance introduces a specific example that supports the general claim.",
   "Example transitions signal that a specific case is about to follow.")

mc("writing-informative", "W.6.2.c", 2,
   "Choose the best transition: 'Cutting down forests removes the trees that absorb carbon dioxide. ____, deforestation contributes to climate change.'",
   "Therefore",
   [("Meanwhile", "Meanwhile shows simultaneous events, not a cause-and-effect link."),
    ("For instance", "Climate change is not one specific example of cutting trees."),
    ("Yet", "Yet signals contrast, but the second idea is a result, not a contrast.")],
   "Therefore signals that climate change is a direct result of deforestation.",
   "Cause-and-effect transitions link a reason to its outcome.")

mc("writing-informative", "W.6.2.c", 3,
   "Choose the best transition: 'Traders along the Silk Road carried silk and spices westward. ____, merchants moving east carried gold and glassware.'",
   "Meanwhile",
   [("Consequently", "Consequently signals a result, but these two trade flows happen at the same time, not one causing the other."),
    ("For example", "The second sentence is not an example of the first; it describes a separate, simultaneous flow."),
    ("Nevertheless", "Nevertheless signals contrast, but both sentences simply describe trade happening in each direction.")],
   "Meanwhile signals that both trade flows were happening at the same time.",
   "Time transitions like 'meanwhile' show events happening together, not one causing the other.")

mc("writing-informative", "W.6.2.c", 3,
   "Choose the best transition: 'Teenagers often think they need less sleep than children do. ____, most teens need just as much sleep, or more.'",
   "In fact",
   [("Meanwhile", "Meanwhile suggests simultaneous unrelated events, not emphasis on a surprising truth."),
    ("For instance", "The second sentence is not a specific example of the first."),
    ("Afterward", "Afterward signals time order, not emphasis.")],
   "In fact signals that the second sentence emphasizes a surprising, important truth.",
   "Emphasis transitions highlight a key point the reader should notice.")

mc("writing-informative", "W.6.2.c", 4,
   "Choose the best transition: 'Solar panels are expensive to install. ____, many homeowners still choose them to save money over time.'",
   "Nevertheless",
   [("Therefore", "Therefore signals a result, but homeowners choosing panels despite the cost is a contrast, not a result."),
    ("For example", "The second sentence is not a specific instance of the first."),
    ("Similarly", "Similarly signals agreement, but these two ideas are in tension.")],
   "Nevertheless signals that homeowners act despite the drawback mentioned first.",
   "Concession transitions admit a drawback before showing why people act anyway.")

mc("writing-informative", "W.6.2.c", 4,
   "Choose the best transition: 'Many fishing boats take far more fish than the ocean can replace. ____, several fish populations have dropped sharply in recent decades.'",
   "Consequently",
   [("However", "However signals contrast, but the drop in fish populations is a direct effect, not a contrast."),
    ("Meanwhile", "Meanwhile suggests a separate, simultaneous event rather than a caused result."),
    ("For instance", "The population drop is the overall effect, not one specific example.")],
   "Consequently signals that the population drop is caused by overfishing.",
   "Cause-and-effect transitions connect an action to its measurable outcome.")

mc("writing-informative", "W.6.2.c", 4,
   "Choose the best transition: 'Ancient Roman engineers built structures that still stand today. ____, the Pantheon's concrete dome has lasted almost two thousand years.'",
   "For example",
   [("However", "The Pantheon supports the first sentence; it does not contrast with it."),
    ("Consequently", "The Pantheon's survival is not described as a result caused by the first sentence."),
    ("Meanwhile", "Meanwhile would suggest something happening at the same time, not a specific supporting example.")],
   "For example introduces a specific case—the Pantheon—that proves the general claim.",
   "A strong example transition connects a broad claim to one concrete case.")

mc("writing-informative", "W.6.2.c", 5,
   "Choose the best transition: 'Bees pollinate roughly a third of the crops people eat. ____, bee populations are declining around the world.'",
   "Yet",
   [("Therefore", "The decline is not a result of bees being important pollinators; it is a troubling contrast."),
    ("For instance", "The decline is not a specific example of pollination."),
    ("Moreover", "Moreover would add a similar supporting point, but this sentence presents a contrast instead.")],
   "Yet signals the troubling contrast between bees' importance and their declining numbers.",
   "Short contrast words like 'yet' can carry strong emotional weight.")

mc("writing-informative", "W.6.2.c", 5,
   "Choose the best transition: 'Mount St. Helens erupted violently in 1980, flattening forests for miles. ____, scientists watched plants and animals slowly return to the devastated slopes.'",
   "Subsequently",
   [("However", "The scientists' observations are not a contrast to the eruption; they follow it in time."),
    ("For example", "This is not one specific example of the eruption."),
    ("Meanwhile", "Meanwhile implies the same time period, but the recovery happened afterward, over following years.")],
   "Subsequently signals that the recovery happened after the eruption, over time.",
   "Sequence transitions show the order in which events unfolded.")

mc("writing-informative", "W.6.2.c", 6,
   "Choose the best transition: 'Overusing antibiotics allows the strongest bacteria to survive and multiply. ____, some infections have become much harder to treat.'",
   "Thus",
   [("Nevertheless", "Nevertheless signals a contrast, but harder-to-treat infections are a direct consequence, not a contrast."),
    ("For instance", "This sentence states the overall effect, not one specific illustration."),
    ("Meanwhile", "Meanwhile suggests simultaneous events rather than a result that follows.")],
   "Thus signals that harder-to-treat infections are a direct consequence of antibiotic overuse.",
   "Formal cause-and-effect transitions like 'thus' suit scientific explanations.")

mc("writing-informative", "W.6.2.c", 6,
   "Choose the best transition: 'Some historians call the Library of Alexandria one of the greatest centers of learning in the ancient world. ____, scholars there are credited with major advances in geography, medicine, and mathematics.'",
   "Indeed",
   [("However", "The second sentence supports and strengthens the first claim; it does not contrast with it."),
    ("Meanwhile", "Meanwhile would suggest an unrelated, simultaneous event, not supporting emphasis."),
    ("Consequently", "The scholars' achievements are not described as a result caused by the first sentence, but as supporting proof of it.")],
   "Indeed signals that the second sentence strengthens and confirms the first claim.",
   "Emphasis transitions reinforce a claim with stronger supporting proof.")

mc("writing-informative", "W.6.2.c", 7,
   "Choose the best transition: 'A massive glacier carved out the valley thousands of years ago, grinding rock into fine soil. ____, that fertile soil allowed dense forests to take root across the valley floor.'",
   "Afterward",
   [("However", "The forest growth is not presented as a contrast to the glacier's action."),
    ("For instance", "The forest growth is not one specific example of the glacier's carving."),
    ("Nevertheless", "Nevertheless signals tension between ideas, but here one event simply follows the other in time.")],
   "Afterward signals that the forest growth happened later, following the glacier's action.",
   "Time-order transitions clarify which event came first in a long natural process.")

mc("writing-informative", "W.6.2.c", 7,
   "Choose the best transition: 'Wind turbines generate electricity without burning fossil fuels. ____, a single modern turbine can power hundreds of homes.'",
   "What is more",
   [("However", "The second sentence adds another impressive fact; it does not contrast with the first."),
    ("Consequently", "Powering homes is not described as a result caused by the absence of fossil fuels; it is an additional fact."),
    ("For instance", "The statement about powering homes is a separate added fact, not a specific example illustrating the first sentence.")],
   "What is more adds a second impressive fact to strengthen the overall point.",
   "Formal addition transitions can add weight to an already strong claim.")

# ================================================================== text-features
grade(4)

mc("text-features", "RI.4.7", 1,
   "A page about tarantulas has a photo of a spider with small labels pointing to its legs, eyes, and fangs. Which text feature is this?",
   "a labeled diagram",
   [("a glossary", "A glossary defines words in a list; it does not point to parts of a picture."),
    ("a table of contents", "A table of contents lists what's in the whole book, not the parts of one spider."),
    ("a timeline", "A timeline shows events in order over time, not the parts of an animal.")],
   "Labels pointing to specific parts of a picture make it a labeled diagram.",
   "A labeled diagram names parts directly on or next to a picture.")

tf("text-features", "RI.4.7", 1,
   "A caption under a photograph usually explains what is shown in that photograph.", True,
   "Captions give extra information that helps readers understand a specific picture.",
   "Read captions together with their pictures, not separately.")

mc("text-features", "RI.4.7", 2,
   "A book about rivers has a list in the back that gives page numbers for 'dams,' 'deltas,' and 'floods,' arranged alphabetically. What is this list called?",
   "an index",
   [("a glossary", "A glossary defines difficult words; it usually does not give page numbers."),
    ("a table of contents", "A table of contents is near the front and lists chapters in order, not an alphabetical topic list."),
    ("a bibliography", "A bibliography lists sources used, not topics with page numbers.")],
   "An index lists topics alphabetically along with the page where each can be found.",
   "Index = alphabetical list at the back; table of contents = chapter list at the front.")

mc("text-features", "RI.4.7", 2,
   "In an article about hurricanes, the word 'storm surge' appears in bold, and a box on the side defines it as 'a sudden rise in sea level during a storm.' What is the purpose of making the word bold?",
   "to signal that the word is important and defined nearby",
   [("to make the page look more colorful", "Bold print is a reading tool, not simply decoration."),
    ("to show the word is spelled wrong", "Bold print does not indicate a spelling error."),
    ("to show the word should be skipped", "Bold words are usually important, not meant to be skipped.")],
   "Bold print signals a key vocabulary word, often defined nearby in a glossary or sidebar.",
   "Pause at bold words—they are usually important to the topic.")

mc("text-features", "RI.4.7", 3,
   "A chart compares rainfall in four cities: City A gets 10 cm, City B gets 25 cm, City C gets 40 cm, and City D gets 15 cm per year. Which city gets the MOST rainfall?",
   "City C",
   [("City A", "City A has the lowest rainfall shown, 10 cm."),
    ("City B", "City B's rainfall, 25 cm, is less than City C's 40 cm."),
    ("City D", "City D's rainfall, 15 cm, is less than City C's 40 cm.")],
   "City C's 40 cm is the highest number shown in the chart.",
   "When reading a chart, compare every number before choosing the highest.")

order("text-features", "RI.4.7", 3,
      "A diagram shows the life cycle of a frog with arrows connecting four stages. Put the stages in the correct order a frog goes through.",
      ["egg", "tadpole", "tadpole with legs", "adult frog"],
      "A frog's life cycle moves through these stages in this order, as the arrows in the diagram show.",
      "Follow the arrows in a cycle diagram one step at a time to find the correct order.")

mc("text-features", "RI.4.7", 3,
   "A map of a national park has a small box in the corner showing a short line labeled '0 — 1 kilometer.' What is this feature called, and what does it help readers do?",
   "a scale; it helps readers estimate real distances on the map",
   [("a compass rose; it shows direction", "A compass rose shows north, south, east, and west, not distance."),
    ("a legend; it explains symbols", "A legend explains what map symbols mean, not how far apart places are."),
    ("a title; it names the map", "A title tells what the map shows, not how to measure distance.")],
   "A scale shows how a distance on the map relates to a real distance on the ground.",
   "Use a map's scale to turn inches or centimeters on paper into real kilometers.")

mc("text-features", "RI.4.7", 4,
   "An article about the solar system has a heading above each paragraph: 'Mercury,' 'Venus,' 'Earth,' 'Mars.' What do these headings help a reader do?",
   "quickly find information about one specific planet",
   [("memorize the order of all eight planets", "Headings organize information; they don't force memorization."),
    ("see what each planet looks like", "A photo or diagram shows appearance, not a heading."),
    ("learn how far each planet is from the sun", "That information would be in the text or a chart, not just from the heading word.")],
   "Headings let a reader jump straight to the section about one specific planet.",
   "Headings act like signposts pointing to a smaller topic within a longer text.")

mc("text-features", "RI.4.7", 4,
   "A timeline of a city's history shows: 1850 — city founded; 1900 — railroad built; 1950 — population reaches 10,000; 2000 — new airport opens. According to the timeline, which happened FIRST?",
   "the city was founded",
   [("the railroad was built", "The railroad was built in 1900, after the city was founded in 1850."),
    ("the population reached 10,000", "This happened in 1950, much later."),
    ("the airport opened", "This happened in 2000, the most recent event on the timeline.")],
   "1850 is the earliest date on the timeline, so founding the city happened first.",
   "On a timeline, the event with the earliest date happened first.")

mc("text-features", "RI.4.7", 4,
   "An article about bicycles includes both a photograph of a cyclist and a labeled diagram of a bike's parts. Which one would help a reader learn the name of the part that makes the wheel turn?",
   "the labeled diagram",
   [("the photograph", "A photograph shows what something looks like but usually does not name each part."),
    ("the article's title", "A title only names the whole article's topic, not individual parts."),
    ("the first paragraph", "Without labels pointing to the exact part, a paragraph alone is harder to match to it.")],
   "A labeled diagram names specific parts, which a plain photograph usually does not.",
   "Use labeled diagrams, not photographs, to learn the exact names of parts.")

mc("text-features", "RI.4.7", 5,
   "An article's main text explains how ants build tunnels. A sidebar titled 'Did You Know?' adds the fact that some ant colonies live for decades. What is the purpose of a 'Did You Know?' sidebar?",
   "to add an interesting extra fact without interrupting the main explanation",
   [("to summarize everything in the main text", "A short 'Did You Know?' box is too brief to summarize the whole article."),
    ("to correct a mistake in the main text", "The sidebar adds a new fact; it is not fixing an error."),
    ("to list the sources the author used", "That would be a works-cited list, not a 'Did You Know?' box.")],
   "Sidebars add extra, related facts off to the side, separate from the main explanation.",
   "Sidebars are a bonus—skip them without losing the main idea, or read them for extra facts.")

mc("text-features", "RI.4.7", 5,
   "A table compares three animals' top speeds: Cheetah — 110 km/h, Ostrich — 70 km/h, Grizzly bear — 50 km/h. Based on the table, how much faster is the cheetah than the grizzly bear?",
   "60 km/h faster",
   [("40 km/h faster", "110 minus 50 is 60, not 40."),
    ("110 km/h faster", "That is the cheetah's whole speed, not the difference between the two."),
    ("20 km/h faster", "110 minus 50 is 60, not 20.")],
   "Subtracting the grizzly bear's speed (50) from the cheetah's speed (110) gives 60 km/h.",
   "To find a difference in a table, subtract the smaller number from the larger one.")

mc("text-features", "RI.4.7", 5,
   "A book about weather has a glossary that defines 'barometer' as 'a tool that measures air pressure.' Why is this glossary helpful to a reader?",
   "it explains a technical word the reader might not already know",
   [("it tells the reader which chapter discusses barometers", "That is the job of an index, not a glossary."),
    ("it shows a picture of a barometer", "A glossary gives definitions in words, not pictures."),
    ("it lists every tool mentioned in the whole book", "A glossary defines specific words; it is not simply a list of tools.")],
   "A glossary defines difficult or technical vocabulary words used in the text.",
   "When you hit an unfamiliar word, check the glossary before guessing its meaning.")

mc("text-features", "RI.4.7", 6,
   "An author claims that electric car sales have grown every year for the last decade. Which text feature would BEST support this claim?",
   "a line graph showing electric car sales rising each year",
   [("a photograph of one electric car", "A single photo cannot show a trend over ten years."),
    ("a glossary defining 'electric car'", "A definition does not show whether sales grew."),
    ("a map of charging stations", "A map of locations does not show sales numbers over time.")],
   "A line graph is the feature best suited to showing change over many years.",
   "Match the feature to the kind of claim: trends over time fit a line graph.")

mc("text-features", "RI.4.7", 6,
   "A pie chart shows how a family spends its monthly budget: 40% rent, 25% food, 15% transportation, 20% other. According to the chart, which two categories together make up exactly 60% of the budget?",
   "rent and transportation",
   [("rent and food", "40% plus 25% equals 65%, not 60%."),
    ("food and other", "25% plus 20% equals 45%, not 60%."),
    ("transportation and other", "15% plus 20% equals 35%, not 60%.")],
   "40% (rent) plus 15% (transportation) equals exactly 60%.",
   "Add pairs of percentages carefully until you find the pair that matches the target.")

mc("text-features", "RI.4.7", 6,
   "A section explains that bridges can be damaged by rust, heavy traffic, and extreme weather. Which heading BEST fits this section?",
   "Why Bridges Need Regular Repairs",
   [("How Bridges Are Built", "That heading would fit a section about construction, not damage."),
    ("Famous Bridges Around the World", "That heading would fit a section listing specific famous bridges."),
    ("The History of Steel", "That heading is about a material's history, not why bridges need repair.")],
   "The heading should describe the section's actual focus: causes of bridge damage leading to repairs.",
   "A good heading names the cause-and-effect idea the whole section explains.")

mc("text-features", "RI.4.7", 7,
   "The main text says a species of beetle is 'rarely seen in cities,' but the photo caption reads, 'This beetle was photographed on a city sidewalk.' What does this mismatch most likely suggest to a careful reader?",
   "the photo may show an unusual sighting worth noting, not the beetle's typical habitat",
   [("the caption must be a typing mistake", "A reader should consider the information first, not assume an error without evidence."),
    ("the main text is definitely wrong", "One unusual photo does not disprove a general statement about rarity."),
    ("captions never need to match the main text", "Readers should notice when a caption and text seem to conflict, not ignore it.")],
   "An unusual single sighting does not contradict a general statement about rarity—it is just a notable exception.",
   "When a caption and the main text seem to disagree, read carefully before deciding either is wrong.")

order("text-features", "RI.4.7", 7,
      "A diagram shows how a town's recycling process works, with an arrow path from 'collection truck' to 'sorting center' to 'recycling plant' for recyclable material. Put these four steps of that path in order.",
      ["collection truck picks up bins", "sorting center separates materials by type",
       "recyclable material is sent to the recycling plant", "the recycling plant turns material into new products"],
      "Following the arrows in a flowchart diagram in order shows the full recycling process for recyclable materials.",
      "In a flowchart, follow each arrow one at a time instead of skipping ahead.")

grade(5)

mc("text-features", "RI.5.7", 1,
   "A nutrition label on a cereal box lists 'Calories: 120, Sugar: 8g, Fiber: 3g' in a table. What is the main purpose of this table?",
   "to let readers quickly compare specific nutrition facts",
   [("to show what the cereal tastes like", "Taste cannot be shown by a table of numbers."),
    ("to list the ingredients in order", "An ingredients list is usually separate text, not a nutrition facts table."),
    ("to show a picture of the cereal", "A table shows numbers, not images.")],
   "A nutrition table presents exact numbers so readers can compare facts quickly.",
   "Tables are best for presenting exact numbers that readers need to compare.")

tf("text-features", "RI.5.7", 1,
   "A table of contents lists chapter titles in the order they appear in a book.", True,
   "Readers use the table of contents to find which page a chapter starts on.",
   "Table of contents = front of book; index = back of book.")

mc("text-features", "RI.5.7", 2,
   "An article about ocean currents includes a map with curved arrows showing warm and cold currents moving around the globe. What does this map help readers understand that words alone could not show as easily?",
   "the direction and path each current travels around the globe",
   [("the exact temperature of the water in degrees", "A simple arrow map usually does not give exact temperature numbers."),
    ("the number of fish living in each current", "The map shows water movement, not fish populations."),
    ("the history of ocean exploration", "A current map shows movement patterns, not historical events.")],
   "Arrows on a map can show direction and path far more clearly than a written description alone.",
   "Maps with arrows are best for showing movement and direction.")

mc("text-features", "RI.5.7", 2,
   "A report on ancient Mesopotamia has a heading 'Government and Law' followed by a paragraph about Hammurabi's Code. Under which heading would information about Mesopotamian farming methods belong?",
   "a different heading, such as 'Agriculture and Food'",
   [("still under 'Government and Law'", "Farming methods are not about rulers or legal codes, so they don't fit this heading."),
    ("in the book's title only", "A title names the whole report, not one specific topic like farming."),
    ("in the glossary", "A glossary only defines words; it does not hold full explanations of farming methods.")],
   "Farming information belongs under a heading that matches its own topic, not an unrelated one.",
   "Check whether a fact truly matches a heading's topic before grouping it there.")

mc("text-features", "RI.5.7", 3,
   "A line graph tracks a city's average monthly temperature: it rises steadily from January to July, then falls steadily from July to December. In which month is the temperature LIKELY highest?",
   "July",
   [("January", "The graph shows temperature rising FROM January, so January is a low point, not the highest."),
    ("April", "April is in the middle of the rising trend, not the peak."),
    ("December", "December is near the end of the falling trend, close to the lowest point.")],
   "The graph rises until July and falls afterward, so July is the peak.",
   "On a line graph, the highest point on the line marks the highest value.")

mc("text-features", "RI.5.7", 3,
   "A labeled diagram of a volcano shows, from bottom to top: magma chamber, pipe, vent, and crater. Which labeled part is closest to the magma chamber?",
   "the pipe",
   [("the vent", "The vent is near the top, farther from the magma chamber than the pipe."),
    ("the crater", "The crater is at the very top, the farthest part from the magma chamber."),
    ("the label itself", "A label is just text pointing to a part; it is not a physical part of the volcano.")],
   "The diagram lists the pipe directly above the magma chamber, making it the closest part.",
   "In a diagram, follow the order of labels from bottom to top, or vice versa.")

match("text-features", "RI.5.7", 3,
      "Match each text feature with its purpose.",
      [("Infographic", "combines images, numbers, and short text to explain data quickly"),
       ("Footnote", "gives extra information about a specific word or fact at the bottom of a page"),
       ("Flowchart", "shows a process as a series of connected steps"),
       ("Pull quote", "highlights an important sentence from the main text in larger print")],
      "Each feature presents information in a different way suited to its specific purpose.",
      "Ask what kind of information each feature is designed to highlight.")

mc("text-features", "RI.5.7", 4,
   "A history article has a timeline running along the bottom of the page and a separate paragraph describing causes of a war in detail. Why might an author include BOTH features instead of just one?",
   "the timeline shows WHEN events happened, while the paragraph explains WHY they happened",
   [("the timeline and paragraph always repeat the exact same information", "If they repeated each other exactly, one would be unnecessary; they serve different purposes."),
    ("the paragraph is only there to look longer", "Paragraphs add explanation, not just length."),
    ("the timeline is only decoration", "A timeline presents real chronological information, not just decoration.")],
   "Different features often answer different questions—a timeline answers 'when,' while a paragraph answers 'why.'",
   "Ask what unique question each text feature is answering.")

mc("text-features", "RI.5.7", 4,
   "A bar graph compares test scores across four subjects for one class: Math 82, Science 75, Reading 90, and Art 95. According to the graph, in which subject did the class score LOWEST?",
   "Science",
   [("Math", "Math's score of 82 is higher than Science's 75."),
    ("Reading", "Reading's score of 90 is much higher than Science's 75."),
    ("Art", "Art's score of 95 is the highest, not the lowest.")],
   "75 is the lowest of the four scores shown on the bar graph.",
   "On a bar graph, the shortest bar shows the lowest value.")

mc("text-features", "RI.5.7", 4,
   "An article explains renewable energy and includes a diagram of a wind turbine with labeled parts: blades, rotor, generator, and tower. Which labeled part most likely converts spinning motion into electricity?",
   "the generator",
   [("the blades", "The blades catch the wind and start the spinning motion, but they do not create electricity."),
    ("the tower", "The tower only holds the turbine up high; it does not produce electricity."),
    ("the rotor", "The rotor connects the blades to the generator; the actual electricity is produced by the generator.")],
   "The generator is the labeled part specifically designed to convert motion into electricity.",
   "In a labeled diagram, match each part's name to its specific job.")

mc("text-features", "RI.5.7", 5,
   "Two infographics show the same statistic about plastic pollution. Infographic A uses a simple bar chart with clearly labeled numbers. Infographic B uses only large, colorful icons with no numbers. Which infographic would most reliably let a reader report an exact statistic?",
   "Infographic A, because it shows exact labeled numbers",
   [("Infographic B, because it has more color", "Color makes a graphic eye-catching but does not provide exact data."),
    ("Both are equally reliable for exact numbers", "Only Infographic A actually labels numeric values; icons alone don't give exact figures."),
    ("Neither can be trusted for any report", "A chart with clearly labeled numbers can reasonably be used to report a statistic.")],
   "Exact numbers require a feature that actually labels those numbers, not just icons.",
   "Check whether a graphic gives exact labeled numbers before quoting a statistic from it.")

mc("text-features", "RI.5.7", 5,
   "A table shows the boiling points of three liquids: water 100°C, ethanol 78°C, mercury 357°C. Based on the table, which liquid has the LOWEST boiling point?",
   "ethanol",
   [("water", "Water's boiling point, 100°C, is higher than ethanol's 78°C."),
    ("mercury", "Mercury's boiling point, 357°C, is by far the highest of the three."),
    ("none of them boil", "The table specifically lists each liquid's boiling point, so each one does boil.")],
   "78°C is the lowest of the three boiling points listed in the table.",
   "Scan every number in a table before deciding which is highest or lowest.")

mc("text-features", "RI.5.7", 5,
   "A biography includes a sidebar titled 'In Her Own Words' with a direct quotation from the subject. What is the most likely purpose of this sidebar?",
   "to let readers hear the subject's own voice and perspective directly",
   [("to summarize the entire biography in one sentence", "A short quotation cannot summarize an entire life story."),
    ("to correct errors made elsewhere in the biography", "A quotation sidebar shares the subject's words; it isn't primarily for corrections."),
    ("to list the dates of the subject's life", "Dates would more likely appear in a timeline, not a quotation sidebar.")],
   "A direct-quotation sidebar lets readers experience the subject's own words firsthand.",
   "Quotation sidebars add a personal voice that a summary cannot capture.")

mc("text-features", "RI.5.7", 6,
   "A bar graph comparing two companies' profits has a y-axis that starts at $90,000 instead of $0, making a small difference in profit look huge. What problem does this create for readers?",
   "it can make a small difference appear much larger than it really is",
   [("it makes the numbers impossible to read", "The numbers are still readable; the issue is how dramatic the difference looks."),
    ("it means the data must be completely false", "The underlying numbers can still be accurate even though the scale is misleading."),
    ("it has no effect on how readers understand the data", "Starting the axis above zero does change how large the difference appears.")],
   "Starting a bar graph's axis above zero can exaggerate small differences visually.",
   "Always check where a graph's axis starts before judging how big a difference looks.")

mc("text-features", "RI.5.7", 6,
   "A graph shows two lines: one for a town's population and one for its number of schools, both from 1980 to 2020. The population line rises sharply, but the school line stays almost flat. What might a reader reasonably conclude?",
   "schools may have become more crowded as the population grew without new schools being built",
   [("the town's population and number of schools grew at exactly the same rate", "The graph shows population rising sharply while schools stayed flat, which is not the same rate."),
    ("the number of schools has no connection to population at all", "A reader can reasonably consider a connection when a growing population isn't matched by more schools."),
    ("the town built far more schools than it needed", "A flat school line alongside a rising population line does not suggest an oversupply of schools.")],
   "Comparing the two lines shows population growing much faster than the number of schools.",
   "When two lines on a graph diverge, think about what that gap might mean.")

mc("text-features", "RI.5.7", 6,
   "A map's legend uses a solid line for 'paved road' and a dashed line for 'unpaved trail.' The main text mentions hikers reaching a summit by trail only. Which lines on the map would show the hikers' likely route?",
   "the dashed lines",
   [("the solid lines", "Solid lines represent paved roads, but the text says the hikers used a trail."),
    ("lines of any kind, since both represent paths", "The legend specifically distinguishes trails from roads, so only one line type fits the text."),
    ("neither type of line, since hikers don't use mapped routes", "The legend provides a specific symbol for trails, which the map would use to show the route.")],
   "The legend defines dashed lines as unpaved trails, matching the hikers' described route.",
   "Always check a map's legend before deciding what a line or symbol represents.")

mc("text-features", "RI.5.7", 7,
   "An article argues that bats are important for farms. It includes a table of insect numbers eaten per night, a diagram of a bat's wing structure, and a caption noting a photographed bat near a cornfield. Which feature provides the STRONGEST evidence for the article's specific argument about farms?",
   "the table of insect numbers eaten per night",
   [("the diagram of wing structure", "Wing structure explains flight, not the bat's benefit to farms."),
    ("the caption about the photo location", "A caption noting a location is supporting detail, not quantitative evidence of benefit."),
    ("none of the features relate to the argument", "The table directly provides numeric evidence supporting the claim about bats helping farms.")],
   "The table gives measurable evidence directly connected to the claim about bats benefiting farms.",
   "The strongest evidence for a specific claim is usually the feature that measures it directly.")

# ================================================================== commas
grade(4)

mc("commas", "L.4.2", 1,
   "Which sentence uses commas correctly in a list?",
   "Omar packed a tent, a lantern, and a compass.",
   [("Omar packed a tent a lantern and a compass.", "Commas are missing between all the listed items."),
    ("Omar packed a tent, a lantern and, a compass.", "The second comma is placed right before the last item's word instead of before “and.”"),
    ("Omar packed, a tent, a lantern, and a compass.", "There should be no comma right after the verb “packed.”")],
   "Commas separate each item in a series of three or more things.",
   "Count the items in a list — three or more means commas between each one.")

tf("commas", "L.4.2", 1,
   "The sentence “Yes, I finished my homework.” correctly uses a comma after an introductory word.", True,
   "A comma follows a short introductory word like Yes, No, or Well at the start of a sentence.",
   "Introductory words are often followed by a comma.")

mc("commas", "L.4.2", 2,
   "Which sentence uses a comma for direct address correctly?",
   "Layla, can you pass the salt?",
   [("Layla can you, pass the salt?", "The comma should come right after the name Layla, not later in the sentence."),
    ("Layla can you pass the salt?", "A comma is needed after the name when speaking directly to someone."),
    ("Layla, can you pass, the salt?", "There should be no comma before “the salt.”")],
   "A comma follows the name of the person being spoken to directly.",
   "When a sentence speaks to someone by name, set the name off with a comma.")

err("commas", "L.4.2", 2,
    ["The festival starts on July 4", " 2027", " in the city square."], 0, "The festival starts on July 4,",
    "A comma separates the day from the year in a date.",
    "Dates written as month day, year need a comma after the day.")

mc("commas", "L.4.2", 3,
   "Which sentence uses a comma correctly between a city and a country?",
   "My pen pal lives in Aswan, Egypt, near the Nile.",
   [("My pen pal lives in Aswan Egypt, near the Nile.", "A comma is missing between the city and the country."),
    ("My pen pal lives in Aswan, Egypt near the Nile.", "A comma is missing after the country name."),
    ("My pen pal lives, in Aswan, Egypt, near the Nile.", "There should be no comma right after “lives.”")],
   "A comma separates a city from its country, and another comma follows the country name.",
   "City, Country needs commas both before and after the country name.")

err("commas", "L.4.2", 3,
    ["The clouds grew dark", " and everyone hurried", " inside before the storm."], 0, "The clouds grew dark,",
    "Two complete sentences joined by “and” need a comma before the conjunction.",
    "Check if both parts could stand alone as sentences — if so, add a comma before the conjunction.")

mc("commas", "L.4.2", 4,
   "Which sentence punctuates a letter greeting correctly?",
   "Dear Grandma, I miss you very much.",
   [("Dear, Grandma I miss you very much.", "The comma belongs after the name, not after “Dear.”"),
    ("Dear Grandma I miss you very much.", "A comma is needed after the greeting, before the message begins."),
    ("Dear Grandma, I miss, you very much.", "There should be no comma in the middle of the sentence.")],
   "A comma follows the full greeting, right before the body of the letter begins.",
   "Letter greetings like “Dear ___,” always end with a comma.")

mc("commas", "L.4.2", 4,
   "Which sentence uses commas correctly in a list of four items?",
   "We need flour, sugar, butter, and eggs for the cake.",
   [("We need flour sugar, butter, and eggs for the cake.", "A comma is missing after the first item, flour."),
    ("We need flour, sugar, butter and, eggs for the cake.", "The comma is in the wrong spot; it should come before “and,” not after."),
    ("We need flour, sugar, butter, and, eggs for the cake.", "There should not be a comma right after “and.”")],
   "Each item in the series needs a comma after it, including right before “and” plus the last item.",
   "A series of four items still follows the same comma rule as a series of three.")

err("commas", "L.4.2", 5,
    ["After the long bus ride", " the tired students", " finally reached", " the museum."], 0, "After the long bus ride,",
    "A comma follows a longer introductory phrase before the main part of the sentence begins.",
    "If a sentence starts with a phrase telling when or where, add a comma before the main clause.")

mc("commas", "L.4.2", 6,
   "Which sentence correctly joins two complete sentences with a comma and “but”?",
   "I wanted to go to the park, but it started raining.",
   [("I wanted to go to the park but it started raining, heavily.", "The comma is placed after the wrong word; it should come before “but,” which joins two complete sentences."),
    ("I wanted to go to the park, but, it started raining.", "There should be no comma right after “but.”"),
    ("I wanted, to go to the park but it started raining.", "The comma incorrectly splits the first clause instead of appearing before “but.”")],
   "When two complete sentences are joined by “but,” a comma goes right before “but.”",
   "Test each half: if both could stand alone as sentences, add a comma before the joining word.")

mc("commas", "L.4.2", 7,
   "Which sentence correctly uses commas to separate three descriptive adjectives in a row?",
   "The old, dusty, forgotten chest sat in the attic.",
   [("The old dusty, forgotten chest sat in the attic.", "A comma is missing between “old” and “dusty.”"),
    ("The old, dusty forgotten chest sat in the attic.", "A comma is missing between “dusty” and “forgotten.”"),
    ("The old, dusty, forgotten, chest sat in the attic.", "There should be no comma right before the noun “chest.”")],
   "Three describing words in a row before a noun are separated by commas, just like items in a list.",
   "Treat a row of adjectives like a short list — comma after each one except the last.")

grade(5)

mc("commas", "L.5.2.a", 1,
   "Which sentence uses commas correctly in a series?",
   "The farmer grew carrots, potatoes, and onions in his garden.",
   [("The farmer grew carrots potatoes, and onions in his garden.", "A comma is missing between “carrots” and “potatoes.”"),
    ("The farmer grew carrots, potatoes and, onions in his garden.", "The comma is placed after “and” instead of before it."),
    ("The farmer grew, carrots, potatoes, and onions in his garden.", "There should be no comma right after “grew.”")],
   "Each item in a series of three or more needs a comma after it, except the final item.",
   "L.5.2.a: use commas to separate every item in a series.")

tf("commas", "L.5.2.a", 1,
   "In a series of three or more items, a comma should be placed before the word “and” that comes right before the last item.", True,
   "This comma, often called the Oxford comma, separates the second-to-last item from the last.",
   "Count the items: three or more means you need commas between each one, including before “and.”")

mc("commas", "L.5.2.a", 2,
   "Which sentence uses commas correctly in a series of actions?",
   "On Saturdays, Huda cleans her room, walks the dog, and practices piano.",
   [("On Saturdays, Huda cleans her room walks the dog, and practices piano.", "A comma is missing between “room” and “walks.”"),
    ("On Saturdays, Huda cleans her room, walks the dog and, practices piano.", "The comma is misplaced after “and” instead of before it."),
    ("On Saturdays, Huda cleans her room, walks the dog, and, practices piano.", "There should be no comma right after “and.”")],
   "A series can list actions as well as objects, and the same comma rule applies.",
   "Read the sentence aloud and pause where each action ends.")

err("commas", "L.5.2.a", 2,
    ["The chef added garlic", " basil", " and oregano to the sauce."], 0, "The chef added garlic,",
    "A comma is needed after each item in a series except the very last one.",
    "Read the sentence aloud and pause where each item ends.")

mc("commas", "L.5.2.a", 3,
   "Which sentence correctly shows that NO comma is needed because there are only two items?",
   "Nadia packed her swimsuit and sunscreen for the trip.",
   [("Nadia packed her swimsuit, and sunscreen for the trip.", "Two items joined only by “and” do not need a comma before it."),
    ("Nadia packed, her swimsuit and sunscreen for the trip.", "There should be no comma right after “packed.”"),
    ("Nadia packed her swimsuit and, sunscreen for the trip.", "A comma should not be placed right after “and.”")],
   "A series comma rule applies to three or more items; two items joined by “and” need no comma.",
   "Count first: exactly two items joined by “and” usually need no comma at all.")

mc("commas", "L.5.2.a", 3,
   "Which sentence correctly uses commas to separate a series of descriptive words?",
   "The recipe called for ripe, juicy, red tomatoes.",
   [("The recipe called for ripe juicy, red tomatoes.", "A comma is missing between “ripe” and “juicy.”"),
    ("The recipe called for ripe, juicy red, tomatoes.", "There should be no comma right before the noun “tomatoes.”"),
    ("The recipe called for ripe juicy red tomatoes.", "Commas are missing between all three describing words.")],
   "A series of describing words before a noun follows the same comma rule as any other series.",
   "List adjectives the same way you would list objects — commas between each one.")

mc("commas", "L.5.2.a", 4,
   "Which sentence uses commas correctly in a series joined by “or”?",
   "For the field trip, the class can choose the zoo, the aquarium, or the science museum.",
   [("For the field trip, the class can choose the zoo the aquarium, or the science museum.", "A comma is missing between “zoo” and “the aquarium.”"),
    ("For the field trip, the class can choose the zoo, the aquarium or, the science museum.", "The comma is misplaced after “or” instead of before it."),
    ("For the field trip the class can choose, the zoo, the aquarium, or the science museum.", "There should be no comma right after “choose,” and a comma is missing after the introductory phrase.")],
   "A series ending in “or” follows the same comma pattern as one ending in “and.”",
   "The last comma in a series comes right before the final connecting word, whether it's “and” or “or.”")

err("commas", "L.5.2.a", 4,
    ["During the storm, the lights flickered", " the wind howled", " and the windows rattled loudly."], 0,
    "During the storm, the lights flickered,",
    "Each item in a series of three needs a comma after it, except the final item.",
    "A series can list actions, not just objects — the comma rule still applies.")

mc("commas", "L.5.2.a", 5,
   "Which sentence correctly punctuates a series, rather than mistakenly repeating “and” before every item?",
   "The museum displays ancient pottery, ceremonial masks, and carved statues.",
   [("The museum displays ancient pottery, and ceremonial masks, and carved statues.", "Repeating “and” with a comma before each one is unnecessary; only the final “and” needs a comma before it."),
    ("The museum displays ancient pottery ceremonial masks, and carved statues.", "A comma is missing between the first two items."),
    ("The museum displays, ancient pottery, ceremonial masks, and carved statues.", "There should be no comma right after “displays.”")],
   "A standard series needs only one “and,” placed before the final item, with a comma right before it.",
   "Repeating “and” before every item is unnecessary; save it for right before the last item.")

mc("commas", "L.5.2.a", 6,
   "Which sentence correctly punctuates a series inside a longer sentence that begins with a clause?",
   "Because the trail was steep, hikers needed sturdy boots, plenty of water, and a walking stick.",
   [("Because the trail was steep hikers needed sturdy boots, plenty of water, and a walking stick.", "A comma is missing after the introductory clause “Because the trail was steep.”"),
    ("Because the trail was steep, hikers needed sturdy boots plenty of water, and a walking stick.", "A comma is missing between “boots” and “plenty of water.”"),
    ("Because the trail was steep, hikers needed sturdy boots, plenty of water and, a walking stick.", "The comma is misplaced after “and” instead of before it.")],
   "Both the introductory clause and the series inside the sentence need their own correct commas.",
   "Check introductory clauses and series commas separately — a sentence can need both.")

mc("commas", "L.5.2.a", 7,
   "Which sentence correctly uses commas for a series where some items are themselves pairs joined by “and”?",
   "The study compared sleep and memory, diet and energy, and exercise and mood.",
   [("The study compared sleep and memory diet and energy, and exercise and mood.", "A comma is missing after the first paired item, “sleep and memory.”"),
    ("The study compared sleep and memory, diet and energy and, exercise and mood.", "The comma is misplaced after “and” instead of before it."),
    ("The study compared, sleep and memory, diet and energy, and exercise and mood.", "There should be no comma right after “compared.”")],
   "Each paired item in the series is treated as one unit, separated from the next pair by a comma.",
   "When series items are pairs, find the boundary between each whole pair before placing commas.")

grade(6)

mc("commas", "L.6.2.a", 1,
   "Which sentence correctly punctuates an appositive?",
   "Mount Everest, the tallest mountain on Earth, attracts climbers from every country.",
   [("Mount Everest the tallest mountain on Earth, attracts climbers from every country.", "A comma is missing before the appositive “the tallest mountain on Earth.”"),
    ("Mount Everest, the tallest mountain on Earth attracts climbers from every country.", "A comma is missing after the appositive."),
    ("Mount Everest, the tallest, mountain on Earth, attracts climbers from every country.", "An extra comma incorrectly splits the appositive phrase itself.")],
   "A nonessential appositive is set off by commas on both sides.",
   "Find where the extra naming phrase begins and ends, then bracket it with commas.")

tf("commas", "L.6.2.a", 1,
   "A nonrestrictive clause adds extra information that could be removed without changing the sentence's basic meaning.", True,
   "Nonrestrictive clauses are set off by commas because the sentence still makes sense without them.",
   "If you can delete the clause and the sentence still identifies the same thing, it's nonrestrictive.")

mc("commas", "L.6.2.a", 2,
   "Which sentence correctly punctuates a nonrestrictive clause?",
   "The novel, which won several awards, was translated into twelve languages.",
   [("The novel which won several awards, was translated into twelve languages.", "A comma is missing before “which,” at the start of the nonrestrictive clause."),
    ("The novel, which won several awards was translated into twelve languages.", "A comma is missing after the nonrestrictive clause, before “was.”"),
    ("The novel, which won, several awards, was translated into twelve languages.", "An extra comma incorrectly splits the clause itself.")],
   "A nonrestrictive clause is extra information set off by commas on both sides.",
   "Both commas must appear — one before the clause and one right after it.")

mc("commas", "L.6.2.a", 3,
   "Which sentence correctly shows NO commas because the clause is restrictive, meaning it is needed to identify which students are meant?",
   "The students who finished the exam early were allowed to leave.",
   [("The students, who finished the exam early, were allowed to leave.", "Commas here wrongly suggest ALL students finished early, when the clause actually identifies only SOME students."),
    ("The students who finished the exam, early were allowed to leave.", "This comma incorrectly splits the restrictive clause itself."),
    ("The students who, finished the exam early, were allowed to leave.", "This incorrectly isolates part of the restrictive clause with commas.")],
   "A restrictive clause is essential to the sentence's meaning, so it takes no commas.",
   "Ask: does removing the clause change WHICH ones are meant? If yes, it's restrictive — no commas.")

err("commas", "L.6.2.a", 3,
    ["The results", " of course", " surprised every scientist on the team."], 1, ", of course,",
    "A parenthetical interrupter like “of course” is set off by commas on both sides.",
    "If a word or phrase could be lifted out without changing the sentence's structure, set it off with commas.")

mc("commas", "L.6.2.a", 4,
   "Which sentence correctly uses dashes to set off a strong interruption?",
   "The experiment—despite months of careful planning—failed within minutes.",
   [("The experiment despite—months of careful planning—failed within minutes.", "The dash is placed in the wrong spot, splitting the word “despite” from its own phrase."),
    ("The experiment—despite months of careful planning failed within minutes.", "A closing dash is missing before “failed.”"),
    ("The experiment, despite months of careful planning—failed within minutes.", "Mixing a comma and a dash to open and close the same interruption is inconsistent punctuation.")],
   "A pair of dashes, matching at both ends, sets off a strong interruption in a sentence.",
   "Dashes should come in matching pairs, just like parentheses or paired commas.")

mc("commas", "L.6.2.a", 5,
   "Which sentence correctly uses parentheses to add a brief clarifying fact?",
   "The bridge (completed in 1937) remains one of the most photographed landmarks in the world.",
   [("The bridge (completed in 1937 remains) one of the most photographed landmarks in the world.", "The closing parenthesis is in the wrong place, splitting the main sentence."),
    ("The (bridge completed in 1937) remains one of the most photographed landmarks in the world.", "The parentheses incorrectly enclose part of the subject instead of just the extra detail."),
    ("The bridge completed in 1937, remains one of the most photographed landmarks in the world.", "Without parentheses or paired commas, this comma alone incorrectly separates the subject from its verb.")],
   "Parentheses enclose only the extra, clarifying detail, leaving the main sentence intact around them.",
   "Read the sentence without the parentheses — it should still make complete sense on its own.")

mc("commas", "L.6.2.a", 5,
   "Which sentence correctly punctuates an appositive that names someone's title?",
   "Dr. Amina Farouk, the hospital's lead surgeon, performed the operation.",
   [("Dr. Amina Farouk the hospital's lead surgeon, performed the operation.", "A comma is missing before the appositive naming her title."),
    ("Dr. Amina Farouk, the hospital's lead surgeon performed the operation.", "A comma is missing after the appositive, before the verb “performed.”"),
    ("Dr. Amina Farouk, the hospital's, lead surgeon, performed the operation.", "An extra comma incorrectly splits the appositive phrase itself.")],
   "An appositive renaming a person is set off by commas on both sides, just like other appositives.",
   "A title following a name is often a nonessential appositive needing paired commas.")

mc("commas", "L.6.2.a", 6,
   "A writer wants to STRONGLY emphasize an interruption, more than a comma would. Which sentence best achieves this using dashes?",
   "The invention—astonishingly—took less than a week to design.",
   [("The invention, astonishingly, took less than a week to design.", "Commas set off the interrupter gently; the sentence calls for the stronger emphasis of dashes."),
    ("The invention astonishingly took less than a week to design.", "With no punctuation at all, the interrupter isn't set off, so there is no emphasis."),
    ("The invention—astonishingly took less than a week to design.", "A closing dash is missing, so the interruption is not properly set off on both sides.")],
   "Dashes create a stronger, more dramatic pause than commas when setting off an interrupter.",
   "Choose dashes over commas when a writer wants extra emphasis on the interruption.")

mc("commas", "L.6.2.a", 7,
   "The nonrestrictive phrase in a sentence already contains a comma inside it: ‘...the capital, a city of nearly ten million people, which was founded...’ Why might a careful writer use dashes instead of commas to set off ‘a city of nearly ten million people, which was founded in the 16th century’ from the rest of the sentence?",
   "dashes make the boundaries of the long interruption clearer when it already contains its own comma",
   [("commas and dashes always mean exactly the same thing, so it never matters", "If it never mattered, careful writers wouldn't choose one over the other for clarity."),
    ("parentheses would always be a better choice in every case", "The question asks specifically about dashes versus commas here, and parentheses can be just as confusing when a phrase already has internal punctuation."),
    ("dashes are only used in informal writing and should be avoided", "Dashes are a standard, formal punctuation tool for setting off interruptions.")],
   "When an interruption already contains a comma, dashes mark its start and end more clearly than more commas would.",
   "Switch to dashes when a nonrestrictive phrase has its own internal comma, to avoid confusion.")

# ================================================================== greek-latin-roots
grade(4)

mc("greek-latin-roots", "L.4.4.b", 1,
   "The root 'auto' means self. What is an autobiography?",
   "a book a person writes about their own life",
   [("a book about cars", "“Auto” here means self, not automobile."),
    ("a book written by someone else about a stranger", "An autobiography is written BY the person about themselves, not by someone else about a stranger."),
    ("a picture of a famous building", "That would not involve the root “auto” or “bio.”")],
   "Auto (self) + bio (life) + graph (write) = a self-written account of one's own life.",
   "Auto always points back to the self doing the action.")

mc("greek-latin-roots", "L.4.4.b", 1,
   "The root 'phon' means sound. Which word means 'a device that lets people talk to each other over long distances using sound'?",
   "telephone",
   [("telescope", "“Scope” means look, not sound; a telescope is for seeing far away."),
    ("photograph", "“Graph” means write or draw, not sound."),
    ("thermometer", "“Therm” means heat, which is unrelated to sound.")],
   "Tele (far) + phon (sound) = a device for sending sound over a far distance.",
   "Phon always points to sound; look for it in words like phonics and symphony.")

mc("greek-latin-roots", "L.4.4.b", 2,
   "Bio means life and graph means write. What is a biography?",
   "a written account of someone else's life",
   [("a written account of your own life", "That describes an autobiography, since “auto” means self."),
    ("a photograph of a living thing", "A photograph uses light, not writing, to capture an image."),
    ("a list of scientific facts about animals", "That would more likely be called a field guide or encyclopedia entry, not a biography.")],
   "Bio (life) + graph (write) = a written account of a life, usually someone else's.",
   "Compare biography to autobiography: both use bio and graph, but only one adds auto.")

match("greek-latin-roots", "L.4.4.b", 2,
      "Match each root with its meaning.",
      [("dict", "say or speak"), ("scrib/script", "write"), ("duc/duct", "lead"), ("rupt", "break")],
      "These roots appear in words like dictate, scribble, conductor, and erupt.",
      "Think of one example word for each root to remember its meaning.")

mc("greek-latin-roots", "L.4.4.b", 3,
   "The root 'therm' means heat. What does a thermometer measure?",
   "temperature",
   [("distance", "A thermometer measures heat, not how far something is."),
    ("weight", "Weight is measured by a scale, which doesn't involve the root “therm.”"),
    ("sound level", "Sound level is measured by a different kind of instrument, unrelated to heat.")],
   "Therm (heat) + -meter (measure) = a tool that measures heat, or temperature.",
   "Therm shows up in thermal, thermos, and thermometer — all about heat.")

dd("greek-latin-roots", "L.4.4.b", 3,
   "Choose the word: A shape with ____ sides is called a decagon.",
   "ten",
   [("eight", "A shape with eight sides is an octagon, using the root “octa.”"),
    ("five", "A shape with five sides is a pentagon, using the root “penta.”"),
    ("twelve", "A shape with twelve sides is a dodecagon, a different root combination.")],
   "Deca is the Greek root for ten, so a decagon has ten sides.",
   "Match each number-root to its matching polygon name.")

mc("greek-latin-roots", "L.4.4.b", 4,
   "The Latin root 'ject' means throw. Which word means 'to throw something out or force it to leave'?",
   "eject",
   [("inject", "Inject means to force something IN, not throw it out."),
    ("project", "Project means to throw forward, such as projecting an image, not force something out."),
    ("subject", "Subject comes from a different root pairing meaning “thrown under,” not “thrown out.”")],
   "E- (out) + ject (throw) = to throw or force something out.",
   "Match each prefix (e-, in-, pro-) to the direction it adds to the root ject.")

mc("greek-latin-roots", "L.4.4.b", 4,
   "The Latin root 'cred' means believe. Which word describes someone who is easily fooled because they believe things too readily?",
   "credulous",
   [("incredible", "Incredible means hard to believe, which is the opposite idea."),
    ("credential", "A credential is proof of qualification, not a description of someone's gullibility."),
    ("discredit", "To discredit means to cause others to stop believing someone, which is different from being gullible oneself.")],
   "Cred (believe) + -ulous (tending to) = tending to believe things too easily.",
   "Watch the suffix: -ulous often means “tending to” or “full of.”")

mc("greek-latin-roots", "L.4.4.b", 5,
   "The Latin root 'mal' means bad. Which word describes a plan intended to cause harm?",
   "malicious",
   [("malleable", "Malleable means easily shaped, which comes from a different root meaning to hammer, not “bad.”"),
    ("maladjusted", "Maladjusted describes poor adjustment to a situation, not an intent to cause harm."),
    ("malnourished", "Malnourished describes poor nourishment, not harmful intent.")],
   "Mal (bad) combined with the idea of intent gives malicious its meaning of intending harm.",
   "Not every word with “mal” means exactly the same kind of “bad” — check the rest of the word too.")

mc("greek-latin-roots", "L.4.4.b", 5,
   "The Latin root 'vis' means see. Which word describes something that cannot be seen?",
   "invisible",
   [("television", "Television combines “tele” (far) and “vis” (see) to mean seeing from far away, not “unable to be seen.”"),
    ("supervisor", "A supervisor “sees over” or oversees others; it doesn't mean something cannot be seen."),
    ("revise", "Revise means to “see again,” as in looking back over work, not describing invisibility.")],
   "In- (not) + vis (see) + -ible (able to be) = not able to be seen.",
   "Look for the prefix in- or im- to spot when a root's meaning is being reversed.")

grade(5)

mc("greek-latin-roots", "L.5.4.b", 1,
   "Trans means across, and port means carry. What does transport mean?",
   "to carry something from one place to another",
   [("to carry something up high", "Trans means across, not up; that meaning would need a different prefix."),
    ("to stop something from moving", "Transport describes movement, the opposite of stopping."),
    ("to look at something closely", "Looking closely would involve a root like “spect,” not “port.”")],
   "Trans (across) + port (carry) = to carry something across a distance.",
   "Combine the prefix's direction with the root's action to build the meaning.")

mc("greek-latin-roots", "L.5.4.b", 1,
   "The prefix 'sub' means under. What does 'submerge' mean?",
   "to put completely underwater",
   [("to lift something out of water", "Sub means under, so submerge means going under, not coming out."),
    ("to float on the surface", "Floating on the surface is the opposite of going under."),
    ("to freeze something solid", "Freezing is not related to the root “sub” or the idea of going under.")],
   "Sub (under) + merge (plunge into) = to plunge completely under the water.",
   "Sub always points downward or underneath, as in submarine and subway.")

mc("greek-latin-roots", "L.5.4.b", 2,
   "Re means again, and vis means see. What does revisit most likely mean?",
   "to visit a place again",
   [("to see something for the very first time", "Re means again, so revisit cannot mean a first-time visit."),
    ("to leave a place permanently", "Revisit implies returning, not leaving for good."),
    ("to visit a place you have never heard of", "Revisiting requires having been there before, which contradicts never having heard of it.")],
   "Re (again) + visit = to visit a second time, returning to a place already seen.",
   "The prefix re- almost always signals “again” or “back.”")

dd("greek-latin-roots", "L.5.4.b", 2,
   "Choose the number: 'uni' in words like unicorn and unicycle means ____.",
   "one",
   [("two", "Two is shown by the root “bi,” as in bicycle."),
    ("three", "Three is shown by the root “tri,” as in tricycle."),
    ("many", "Many is shown by roots like “multi” or “poly,” not “uni.”")],
   "Uni is the Latin root for one, as in unicorn (one horn) and unicycle (one wheel).",
   "Compare uni-, bi-, and tri- to see how number roots change a word's meaning.")

mc("greek-latin-roots", "L.5.4.b", 3,
   "The root 'contra' means against. What does it mean to contradict someone?",
   "to say the opposite of what someone else said",
   [("to agree completely with someone", "Contra means against, so contradicting means disagreeing, not agreeing."),
    ("to repeat exactly what someone said", "Repeating the same words is not “against” what they said."),
    ("to speak very loudly", "Volume has nothing to do with the root “contra.”")],
   "Contra (against) + dict (say) = to say something that goes against what was said before.",
   "Contra shows up in contrast and contrary too, always carrying the idea of opposition.")

match("greek-latin-roots", "L.5.4.b", 3,
      "Match each root with its meaning.",
      [("flex/flect", "bend"), ("fract/frag", "break"), ("vert", "turn"), ("mob/mot", "move")],
      "These roots appear in words like flexible, fragment, convert, and motion.",
      "Think of a familiar word for each root to recall its meaning.")

mc("greek-latin-roots", "L.5.4.b", 4,
   "Inter means between, and rupt means break. What does it mean to interrupt someone?",
   "to break into the middle of what someone is doing or saying",
   [("to help someone finish a sentence", "Helping finish is cooperative, not a break caused by cutting in."),
    ("to listen quietly without speaking", "Listening quietly is the opposite of breaking into someone's speech."),
    ("to repair something that is broken", "Rupt means break, but “inter” plus “rupt” describes causing a break in an action, not fixing one.")],
   "Inter (between) + rupt (break) = to break in between, cutting into an ongoing action.",
   "Rupt always signals a break, as in erupt, disrupt, and rupture.")

mc("greek-latin-roots", "L.5.4.b", 4,
   "The root 'circum' means around. What does it mean for a ship to circumnavigate the globe?",
   "to sail all the way around the world",
   [("to sail across a narrow river", "Circum means around, not across a narrow space."),
    ("to sail halfway around the world and stop", "Circumnavigate specifically implies completing the full circle, not stopping halfway."),
    ("to sail only along one coastline", "Following one coastline is not the same as going all the way around.")],
   "Circum (around) + navigate (sail/steer) = to sail completely around something.",
   "Circum appears in circumference and circumstance, always pointing to “around.”")

mc("greek-latin-roots", "L.5.4.b", 5,
   "The Latin root 'ambi' means both or around. What does it mean to be ambidextrous?",
   "able to use both hands equally well",
   [("able to see in two directions at once", "Ambidextrous relates to hand use, not vision."),
    ("skilled in exactly one hand only", "Ambidextrous means skilled with BOTH hands, not just one."),
    ("confused about left and right", "Being ambidextrous is a skill, not confusion.")],
   "Ambi (both) + dext (hand/right) = skilled with both hands.",
   "Ambi signals “both,” as in ambiguous, which can mean “both” or multiple ways to read something.")

grade(6)

mc("greek-latin-roots", "L.6.4.b", 1,
   "The root 'omni' means all. What does it mean for a narrator to be omniscient?",
   "knowing everything, including characters' private thoughts",
   [("knowing only what one character says out loud", "That describes a limited narrator, not one who is “all-knowing.”"),
    ("knowing nothing about the story's events", "Omni means all, so this is the opposite of omniscient."),
    ("knowing only events that happen in the future", "Omniscient means knowing everything, not only future events.")],
   "Omni (all) + sci (know) = knowing all things, including private thoughts.",
   "Omni appears in omnivore and omnipresent — both built on the idea of “all.”")

mc("greek-latin-roots", "L.6.4.b", 1,
   "The root 'poly' means many. What is a polygon?",
   "a shape with many straight sides",
   [("a shape with exactly one curved side", "Poly means many, and a polygon's sides are straight, not curved."),
    ("an animal with many legs", "Polygon is a geometry term for a shape, not a living creature."),
    ("a language spoken by many people", "That would relate to “polyglot,” a different word, not “polygon.”")],
   "Poly (many) + gon (angle/side) = a shape with many straight sides and angles.",
   "Poly shows up in polygon and polygamy, always pointing to “many.”")

mc("greek-latin-roots", "L.6.4.b", 2,
   "The root 'hyper' means over or excessive. What does it mean to be hyperactive?",
   "unusually and excessively active or energetic",
   [("unusually calm and still", "Hyper means excessive, which is the opposite of calm and still."),
    ("active only during the night", "Hyperactive describes a high level of energy, not a specific time of day."),
    ("active in only one activity", "Hyperactive describes overall excess energy, not focus on a single activity.")],
   "Hyper (over) + active = having an excessive, over-the-top amount of energy.",
   "Hyper always signals “too much,” as in hypersensitive and hyperlink (a jump over to another page).")

dd("greek-latin-roots", "L.6.4.b", 2,
   "Choose the meaning: 'hypo' in hypothermia means ____, the opposite of 'hyper.'",
   "under or below",
   [("over or above", "That is the meaning of “hyper,” the opposite of “hypo.”"),
    ("beside or next to", "That describes the root “para,” not “hypo.”"),
    ("around", "That describes the root “circum” or “peri,” not “hypo.”")],
   "Hypo (under) + therm (heat) = a condition of dangerously low body heat.",
   "Hyper and hypo are opposite prefixes — one means too much, the other too little.")

mc("greek-latin-roots", "L.6.4.b", 3,
   "The root 'ante' means before. Which word means 'a room located before, or leading into, a larger room'?",
   "antechamber",
   [("postscript", "Post means after, which is the opposite of “ante.”"),
    ("antonym", "Anti/ant means against, a different root from “ante” meaning before."),
    ("antenna", "Antenna is unrelated to the root “ante”; it refers to a sensory or signal-receiving part.")],
   "Ante (before) + chamber (room) = a room that comes before the main room.",
   "Ante shows up in antecedent — something that comes before.")

mc("greek-latin-roots", "L.6.4.b", 3,
   "The root 'post' means after. What does a postscript (P.S.) add to a letter?",
   "a message added after the main letter has been signed",
   [("an introduction written before the letter begins", "Post means after, so a postscript cannot be an introduction that comes first."),
    ("the envelope the letter is mailed in", "A postscript is written text, not the envelope."),
    ("the date the letter was written", "A postscript is an added note, not simply a date.")],
   "Post (after) + script (written) = something written after the main letter is finished.",
   "Post appears in postpone and postgame — both pointing to something after the main event.")

mc("greek-latin-roots", "L.6.4.b", 4,
   "The root 'para' means beside or alongside. What does it mean for two lines to be parallel?",
   "running beside each other at the same distance apart, never meeting",
   [("crossing each other at a sharp angle", "Parallel lines specifically never cross; crossing lines are not parallel."),
    ("curving toward each other until they touch", "Parallel lines keep the same distance apart and do not touch."),
    ("stacked directly on top of one another", "Parallel describes lines running beside each other, not stacked vertically.")],
   "Para (beside) + allel (one another) = running beside one another at an equal distance.",
   "Para appears in paraphrase and paramedic — something existing alongside the main thing.")

mc("greek-latin-roots", "L.6.4.b", 4,
   "The root 'peri' means around. What does the perimeter of a shape measure?",
   "the total distance around the outside edge of a shape",
   [("the space enclosed inside a shape", "That describes area, not perimeter."),
    ("the distance across the middle of a shape", "That might describe a diameter or diagonal, not the distance around the edge."),
    ("the number of sides a shape has", "Counting sides is different from measuring the total distance around them.")],
   "Peri (around) + meter (measure) = a measurement that goes all the way around a shape.",
   "Peri shows up in periscope (looking around) and period, both tied to a boundary or cycle.")

mc("greek-latin-roots", "L.6.4.b", 5,
   "The root 'syn' means together. What does it mean to synchronize two clocks?",
   "to set them so they show the same time and move together",
   [("to set them to show completely different times", "Syn means together, so synchronized clocks should match, not differ."),
    ("to take one clock apart to examine it", "Synchronizing is about matching timing, not disassembling a clock."),
    ("to make one clock run faster than the other", "Running at different speeds is the opposite of staying together in time.")],
   "Syn (together) + chron (time) = to set things to run together in time.",
   "Syn appears in symphony and synonym — both built on the idea of things joined together.")

# ================================================================== context-clues
grade(4)

mc("context-clues", "L.4.4.a", 1,
   "The desert hikers were relieved to find a small, hidden oasis with cool water and shady palm trees. What does oasis mean?",
   "a green, fertile area with water in the middle of a dry desert",
   [("a sandy hill with no plants", "The sentence describes water and shade, not a sandy area with nothing growing."),
    ("a type of desert animal", "Oasis describes a place, not a living creature."),
    ("a dangerous sandstorm", "The hikers felt relieved, which would not describe a dangerous storm.")],
   "The clues “cool water” and “shady palm trees” describe a fertile spot in the desert.",
   "Look for clues that describe what surrounds the unfamiliar word.")

mc("context-clues", "L.4.4.a", 2,
   "The old bridge was so rickety that it swayed and creaked with every step. What does rickety mean?",
   "weak and likely to break or collapse",
   [("brand new and very strong", "Swaying and creaking suggest weakness, not strength."),
    ("brightly painted", "Nothing in the sentence describes color."),
    ("very wide and easy to cross", "Swaying and creaking suggest an unsafe, unstable bridge, not an easy, wide one.")],
   "Swaying and creaking with every step are clues that the bridge is weak and unstable.",
   "Look at what the object DOES in the sentence for clues to its condition.")

mc("context-clues", "L.4.4.a", 3,
   "Compared to her chatty older brother, Mona was reserved, rarely speaking unless someone asked her a direct question. What does reserved mean?",
   "quiet and not inclined to share thoughts openly",
   [("loud and talkative", "The contrast with her “chatty” brother shows reserved means the opposite of talkative."),
    ("angry and rude", "Nothing in the sentence suggests anger or rudeness."),
    ("confused and forgetful", "The sentence is about how much she talks, not about memory.")],
   "The contrast word “compared to” and her chatty brother show that reserved means quiet.",
   "Contrast clues (compared to, unlike, but) point to the opposite meaning of a nearby word.")

mc("context-clues", "L.4.4.a", 3,
   "After weeks without rain, the once-green lawn turned brittle and crumbled under our feet. What does brittle mean?",
   "dry and easily broken",
   [("soft and bouncy", "Crumbling under feet suggests something that breaks easily, not something soft and bouncy."),
    ("wet and slippery", "Weeks without rain suggests dryness, not wetness."),
    ("colorful and shiny", "Nothing in the sentence describes appearance in this way.")],
   "The clue “crumbled under our feet” shows the grass had become dry and easily broken.",
   "Look at the effect described right after the unfamiliar word.")

mc("context-clues", "L.4.4.a", 4,
   "The detective examined every clue meticulously, checking each detail twice before moving on. What does meticulously mean?",
   "with great care and attention to detail",
   [("quickly and carelessly", "Checking each detail twice shows careful attention, not carelessness."),
    ("loudly and angrily", "Nothing about tone or volume is mentioned."),
    ("secretly and dishonestly", "Nothing suggests dishonesty; examining clues carefully is simply thorough work.")],
   "Checking each detail twice is a clue that meticulously means with great care.",
   "Look for an action described right after the word that explains how it was done.")

mc("context-clues", "L.4.4.a", 4,
   "Even though the city was freezing, the hardy little plant managed to bloom right through the snow. What does hardy mean?",
   "able to survive difficult or harsh conditions",
   [("delicate and easily damaged", "A plant that blooms through snow is the opposite of delicate."),
    ("colorful and fragrant", "The sentence focuses on survival in cold, not on scent or color."),
    ("rare and hard to find", "Hardy describes toughness, not how common or rare something is.")],
   "Blooming through snow in a freezing city is a clue that hardy means tough enough to survive.",
   "“Even though” signals a contrast — the plant survived despite a harsh condition.")

grade(5)

mc("context-clues", "L.5.4.a", 2,
   "The committee's decision seemed arbitrary, since no one could explain the reasoning behind choosing that date over any other. What does arbitrary mean?",
   "based on random choice rather than any clear reason",
   [("based on careful research", "The sentence says no one could explain any reasoning, which is the opposite of careful research."),
    ("required by law", "Nothing in the sentence mentions laws or legal rules."),
    ("agreed on by everyone happily", "The sentence suggests confusion about the choice, not happy agreement.")],
   "The clue “no one could explain the reasoning” shows the decision had no clear basis.",
   "Look for a clue that explains WHY something happened, or in this case, why it didn't.")

mc("context-clues", "L.5.4.a", 3,
   "Unlike the previous, bland menu, the new chef's dishes were vibrant, bursting with bold spices and colors. What does vibrant mean?",
   "full of life, energy, or bright, strong qualities",
   [("plain and tasteless", "The contrast with “bland” shows vibrant means the opposite—full of flavor and color."),
    ("extremely expensive", "Price is never mentioned in the sentence."),
    ("very small in portion size", "Portion size is not discussed; the sentence is about flavor and color.")],
   "The contrast with “bland” and the clue “bold spices and colors” show vibrant means lively and strong.",
   "“Unlike” signals a contrast clue — the new menu is the opposite of the old one.")

mc("context-clues", "L.5.4.a", 4,
   "The scientist remained skeptical about the new theory until she could examine the evidence herself. What does skeptical mean?",
   "doubtful and not easily convinced without proof",
   [("completely convinced right away", "Remaining skeptical means NOT being convinced yet, the opposite of this."),
    ("excited and enthusiastic", "The sentence describes caution and doubt, not excitement."),
    ("confused and unable to think clearly", "Skepticism is a thoughtful doubt, not a lack of clear thinking.")],
   "The clue “until she could examine the evidence herself” shows she doubted the theory without proof.",
   "Look for what someone needs before they will accept an idea — that reveals doubt.")

mc("context-clues", "L.5.4.a", 5,
   "The ancient manuscript was so fragile that archivists wore gloves and turned each page with extreme caution. What does archivists mean in this context?",
   "people who care for and preserve historical documents",
   [("people who write brand-new books", "Archivists are described handling an ancient manuscript carefully, not writing new material."),
    ("tourists visiting a museum", "The careful, professional handling described suggests trained workers, not casual visitors."),
    ("scientists studying chemicals", "Nothing in the sentence mentions chemistry; it describes careful handling of an old document.")],
   "Wearing gloves and handling an old manuscript with extreme caution is a clue that archivists preserve documents.",
   "Look at the careful ACTIONS people take to figure out their job.")

mc("context-clues", "L.5.4.a", 5,
   "The mayor's speech was intended to placate angry residents, offering apologies and promises to fix the roads. What does placate mean?",
   "to calm someone down and reduce their anger",
   [("to make someone angrier", "Offering apologies to calm residents is the opposite of making them angrier."),
    ("to ignore someone completely", "The mayor is actively responding with apologies, not ignoring the residents."),
    ("to punish someone for complaining", "Apologizing and promising fixes is not a punishment.")],
   "Offering apologies and promises to angry residents is a clue that placate means to calm someone.",
   "Look at the purpose of the action described right after the word.")

grade(6)

mc("context-clues", "L.6.4.a", 3,
   "The negotiations remained at an impasse for weeks, since neither side was willing to compromise on price. What does impasse mean?",
   "a situation where no progress can be made because both sides disagree",
   [("a quick and easy agreement", "Weeks of disagreement with no compromise is the opposite of a quick agreement."),
    ("a legal document signed by both sides", "The sentence describes ongoing disagreement, not a signed document."),
    ("a friendly conversation about the weather", "The sentence describes tense negotiations, not casual small talk.")],
   "“Neither side was willing to compromise” is a clue that impasse means a standstill with no progress.",
   "Look at what is NOT happening in the sentence — that can reveal the word's meaning too.")

mc("context-clues", "L.6.4.a", 4,
   "His candid response surprised everyone, since most people expected him to avoid the uncomfortable truth. What does candid mean?",
   "honest and direct, even about difficult topics",
   [("vague and evasive", "The sentence contrasts his honesty with what people expected, which would be vague avoidance."),
    ("angry and aggressive", "Nothing in the sentence describes tone of anger, only honesty."),
    ("quiet and withdrawn", "A candid response is spoken directly, not withheld quietly.")],
   "The contrast between what people “expected” and his actual response shows candid means openly honest.",
   "Look for what people EXPECTED versus what actually happened — the gap reveals the meaning.")

mc("context-clues", "L.6.4.a", 5,
   "Years of drought made the once-fertile valley barren, unable to support even the hardiest crops. What does barren mean?",
   "empty of plant life and unable to produce crops",
   [("overflowing with fresh water", "Drought and the inability to support crops suggest dryness, not overflowing water."),
    ("covered in dense, healthy forest", "The sentence describes land that cannot support even hardy crops, the opposite of dense forest."),
    ("recently plowed and ready for planting", "Land ready for planting would be fertile, not barren.")],
   "The clues “years of drought” and “unable to support even the hardiest crops” show barren means empty of plant life.",
   "Look for a cause (drought) and its effect (no crops) to figure out the word's meaning.")

mc("context-clues", "L.6.4.a", 6,
   "The senator's ambiguous statement left reporters unsure whether she supported or opposed the new law. What does ambiguous mean?",
   "unclear and open to more than one interpretation",
   [("extremely clear and specific", "Reporters being unsure shows the statement was unclear, not specific."),
    ("written in a foreign language", "Nothing suggests a language barrier; the confusion is about meaning, not translation."),
    ("very short and brief", "Length is not discussed; the issue is that the meaning was unclear.")],
   "Reporters being “unsure whether she supported or opposed” is a clue that ambiguous means unclear.",
   "Look at the EFFECT the word's described thing had on other people in the sentence.")

mc("context-clues", "L.6.4.a", 6,
   "Rather than confront the problem directly, the company's response was evasive, dodging every specific question reporters asked. What does evasive mean?",
   "avoiding giving a direct or clear answer",
   [("completely honest and forthcoming", "Dodging specific questions is the opposite of being forthcoming."),
    ("loud and confrontational", "The sentence contrasts evasive behavior with confrontation, meaning evasive is NOT confrontational."),
    ("detailed and thorough", "Dodging questions means giving incomplete answers, not thorough ones.")],
   "“Dodging every specific question” is a clue that evasive means avoiding a direct answer.",
   "“Rather than” signals a contrast clue pointing away from directness.")
