"""
Question bank top-up 2, batch 06: brings these families to the full target of 50 items each
(original content, Grades 4-6): description, capitalization, reference-materials,
figurative-language, character-perspective.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== description (Grade 4 only)
grade(4)

# -- Ant colonies
mc("description", "RI.4.5", 1,
   "Read: “Ant colonies are organized into different roles. The queen lays eggs deep inside the nest, worker ants gather food and build tunnels, and soldier ants defend the colony from danger. Each ant has a clear job that keeps the colony running smoothly.” How does the author mainly organize this paragraph?",
   "By describing the different roles ants have in a colony.",
   [("By telling the order in which an ant egg becomes an adult.", "No growth stages or ages are described."),
    ("By comparing ant colonies to bee colonies.", "No other insect is mentioned for comparison."),
    ("By explaining what causes ants to build tunnels.", "No cause-and-effect relationship is described.")],
   "The paragraph lists separate roles — queen, workers, soldiers — within one colony.",
   "Description paragraphs list facts and details about one topic.")
dd("description", "RI.4.5", 2,
   "Choose the word that signals another descriptive detail: “Worker ants gather food. ____, they build and repair tunnels.”",
   "Also", [("First", "“First” signals a step in a sequence, not an added detail."),
            ("Because", "“Because” signals a cause."),
            ("Later", "“Later” signals time order.")],
   "“Also” adds another detail about what worker ants do.", "Also, another, in addition — these words add description details.")

# -- Sahara Desert
mc("description", "RI.4.5", 3,
   "Read: “The Sahara Desert is extremely dry and hot during the day, but temperatures drop sharply at night. Sand dunes stretch for miles, and very little rain falls each year. Few plants can survive there except hardy shrubs and cactus-like plants.” How does the author organize information about the Sahara in this paragraph?",
   "By listing physical features and conditions of the desert.",
   [("By narrating a trip across the desert in time order.", "No events or timeline are given."),
    ("By comparing the Sahara to a rainforest.", "No other place is mentioned for comparison."),
    ("By explaining what caused the desert to form.", "The paragraph does not explain a cause.")],
   "The paragraph describes several features — temperature, dunes, rainfall, and plants — about one place.",
   "Description paragraphs pile up facts about a single subject.")
match("description", "RI.4.5", 4, "Match each Sahara detail with what it tells you.",
      [("Sand dunes stretch for miles", "a landform feature"),
       ("Temperatures drop at night", "a weather detail"),
       ("Few plants survive", "a living-things detail")],
      "Each detail describes a different aspect of the desert.", "Look for separate facts under one topic.")

# -- Egyptian cotton
mc("description", "RI.4.5", 5,
   "Read: “Egyptian cotton is famous for its long, soft fibers. Farmers grow it along the fertile banks of the Nile, where the soil is rich and the weather is warm. The fine threads are woven into smooth sheets, towels, and shirts sold around the world.” Which sentence gives a descriptive detail about WHERE the cotton grows?",
   "Farmers grow it along the fertile banks of the Nile, where the soil is rich and the weather is warm.",
   [("Egyptian cotton is famous for its long, soft fibers.", "This describes the fiber, not the growing location."),
    ("The fine threads are woven into smooth sheets, towels, and shirts sold around the world.", "This describes products made from the cotton."),
    ("Egyptian cotton is grown only in one small village.", "This sentence is not in the paragraph.")],
   "This sentence names the Nile's banks as the growing location.", "Scan for the sentence naming a specific place.")
dd("description", "RI.4.5", 6,
   "Choose the word that adds another description detail: “Egyptian cotton has long, soft fibers. ____, it is known for being very strong.”",
   "In addition", [("As a result", "This signals cause and effect."),
                    ("Before this", "This signals time order."),
                    ("Unlike this", "This signals a contrast.")],
   "“In addition” adds a further descriptive detail about the cotton.", "In addition, furthermore, also — all add more description.")

# -- The Nile River
mc("description", "RI.4.5", 7,
   "Read: “The Nile River flows north through Egypt for thousands of kilometers. Its banks are lined with green farmland, while its waters support fish, birds, and boats. Ancient and modern cities have grown along its edges.” What is the MAIN topic this paragraph describes?",
   "The features and importance of the Nile River.",
   [("A single boat trip down the Nile.", "No specific trip or journey is narrated."),
    ("The differences between the Nile and another river.", "No other river is mentioned for comparison."),
    ("The reasons the Nile sometimes floods.", "No cause of flooding is explained.")],
   "Every sentence adds a fact describing the river and its surroundings.", "Ask: what one subject do all the sentences describe?")
tf("description", "RI.4.5", 1,
   "A friend says the Nile paragraph above is organized as a list of facts, not as a sequence of events with a beginning and an end. Is the friend correct?", True,
   "The sentences list facts about the river's length, banks, and the cities near it, with no single timed sequence.", "A description structure gives facts, not a sequence of events.")

# -- School library
mc("description", "RI.4.5", 2,
   "Read: “The school library has tall shelves filled with storybooks, atlases, and science magazines. Soft chairs sit near the big windows, and a quiet reading corner is set aside for younger students. A librarian helps students find books and use the computers.” Which detail describes the library's seating area?",
   "Soft chairs sit near the big windows.",
   [("Tall shelves filled with storybooks, atlases, and science magazines.", "This describes the shelves, not the seating."),
    ("A librarian helps students find books.", "This describes the librarian's job."),
    ("The library closes at four o'clock.", "This detail is not in the paragraph.")],
   "This sentence tells readers where students can sit.", "Match each detail to the part of the topic it describes.")
fill("description", "RI.4.5", 3,
     "Fill in: A paragraph that gives many facts about one topic, like the library above, uses a ____ structure. (one word)",
     ["description", "descriptive"],
     "Listing many facts about a single topic is a description structure.", "Description = many details, one topic.")

# -- Peregrine falcons
mc("description", "RI.4.5", 4,
   "Read: “Peregrine falcons have narrow wings built for speed and sharp eyes that can spot prey from far away. Their curved beaks tear meat easily, and their strong talons grip tightly onto branches or prey. These features make falcons skilled hunters.” Why did the author most likely describe the falcon's wings, eyes, beak, and talons separately?",
   "To give readers a clear picture of each body part that helps the falcon hunt.",
   [("To explain why falcons are becoming rare.", "No information about falcon populations is given."),
    ("To compare falcons with eagles.", "No other bird is mentioned."),
    ("To tell the order in which falcons are born and grow.", "No growth stages or time order are described.")],
   "Breaking the description into separate body parts helps readers picture the whole bird.", "Authors often describe a subject part by part.")
match("description", "RI.4.5", 5, "Match each falcon body part with what it is used for.",
      [("narrow wings", "flying fast"), ("sharp eyes", "spotting prey"),
       ("curved beak", "tearing meat"), ("strong talons", "gripping tightly")],
      "Each body part has its own descriptive detail about its purpose.", "Look for a feature paired with its function.")

# -- Camels
mc("description", "RI.4.5", 6,
   "Read: “Camels can survive for days without water because they store fat in their humps. Thick eyelashes and nostrils that close protect them from blowing sand. Wide, tough feet keep them from sinking into loose sand.” Which structure does this paragraph use to explain camels?",
   "It describes several physical features that help camels survive in the desert.",
   [("It explains the order in which a camel grows from birth to adulthood.", "No growth stages or ages are mentioned."),
    ("It compares camels to horses.", "No other animal is named for comparison."),
    ("It argues that camels should be protected.", "The paragraph states facts, not an opinion.")],
   "The paragraph lists separate features — humps, eyelashes, nostrils, feet — that help camels survive.",
   "Count the separate features listed about one subject.")
err("description", "RI.4.5", 7,
    ["Camels can survive for days without water.", " First,", " they also have thick eyelashes that protect their eyes."],
    1, " Also,",
    "“Also” adds another descriptive detail; “First” wrongly suggests a step in a sequence.",
    "Check whether a transition adds a detail or shows a step in order.")

# -- Coral reefs
mc("description", "RI.4.5", 1,
   "Read: “Coral reefs are home to colorful fish, sea turtles, and tiny shrimp. The coral itself looks like branching rock but is actually built by millions of tiny living animals. Reefs also shelter young fish from larger predators.” What is this paragraph mostly about?",
   "The living things and shelter found in a coral reef.",
   [("A story about a diver exploring a reef.", "No character or events are narrated."),
    ("The difference between coral reefs and rainforests.", "No other habitat is compared."),
    ("Why coral reefs are disappearing.", "No cause of reef loss is explained.")],
   "Every sentence adds a fact describing the reef and the animals living there.", "Ask what single topic every sentence describes.")
dd("description", "RI.4.5", 2,
   "Choose the best word: “Coral reefs shelter fish. ____, they protect young sea turtles.”",
   "Furthermore", [("Therefore", "This signals a cause-and-effect result."),
                    ("Finally", "This signals the last step in a sequence."),
                    ("Unlike", "This signals a contrast.")],
   "“Furthermore” adds another fact about what reefs protect.", "Also/furthermore/in addition add more description.")

# -- Volcanoes
mc("description", "RI.4.5", 3,
   "Read: “A volcano is a mountain with an opening that can release melted rock called lava. Thick clouds of ash sometimes rise from the opening, and the ground around it can tremble before an eruption. Some volcanoes stay quiet for hundreds of years.” Which detail describes what happens to the ground near a volcano?",
   "The ground around it can tremble before an eruption.",
   [("A volcano is a mountain with an opening that can release lava.", "This defines a volcano, not the ground's behavior."),
    ("Thick clouds of ash sometimes rise from the opening.", "This describes the ash, not the ground."),
    ("Some volcanoes stay quiet for hundreds of years.", "This describes how long volcanoes can be inactive.")],
   "This sentence specifically describes the trembling ground.", "Match each detail to exactly what it is describing.")
tf("description", "RI.4.5", 4,
   "A classmate claims the volcano paragraph above narrates a single eruption from start to finish, step by step. Is the classmate right?", False,
   "The paragraph lists general facts about volcanoes, not a single eruption unfolding in order.",
   "Description gives facts; sequence tells a time-ordered story.")

# -- Bicycles
mc("description", "RI.4.5", 5,
   "Read: “A bicycle has two wheels connected by a frame, with pedals that turn a chain to move the back wheel. Handlebars let the rider steer, and brakes squeeze the wheels to slow down. Some bicycles also have gears to make hills easier to climb.” How does the author mainly organize this paragraph about bicycles?",
   "By describing each part of a bicycle and what it does.",
   [("By telling the history of when bicycles were invented.", "No dates or historical events are mentioned."),
    ("By comparing bicycles to cars.", "No other vehicle is mentioned."),
    ("By explaining the steps to fix a flat tire.", "No repair steps are given.")],
   "The paragraph names separate parts — wheels, pedals, handlebars, brakes, gears — and what each does.",
   "Look for a list of parts, each with its own detail.")
mc("description", "RI.4.5", 6,
   "Read the paragraph above about bicycles. Which detail explains how a bicycle's gears help the rider?",
   "Some bicycles also have gears to make hills easier to climb.",
   [("A bicycle has two wheels connected by a frame.", "This describes the frame, not the gears."),
    ("Handlebars let the rider steer.", "This describes steering, not gears."),
    ("Brakes squeeze the wheels to slow down.", "This describes braking, not gears.")],
   "This sentence specifically explains what the gears are for.", "Match the question to the exact detail that answers it.")

# -- Lighthouses
mc("description", "RI.4.5", 7,
   "Read: “A lighthouse is a tall tower built near dangerous coastlines. A bright, rotating light at the top warns ships of rocks below. Many lighthouses also have a foghorn that sounds when visibility is poor.” Which statement best explains the structure of this paragraph?",
   "It lists separate features of a lighthouse and what each one does for ships.",
   [("It tells a story about a ship that crashed near a lighthouse.", "No specific event or characters are described."),
    ("It compares lighthouses built in different countries.", "No other lighthouses are named for comparison."),
    ("It explains why lighthouses are no longer used today.", "The paragraph does not discuss whether lighthouses are still used.")],
   "The paragraph describes the tower, the light, and the foghorn as separate features.",
   "Count how many separate features are described about the subject.")
mc("description", "RI.4.5", 1,
   "Read the paragraph above about lighthouses. Which detail tells how the lighthouse warns ships in fog?",
   "Many lighthouses also have a foghorn that sounds when visibility is poor.",
   [("A lighthouse is a tall tower built near dangerous coastlines.", "This describes the tower's location, not the fog warning."),
    ("A bright, rotating light at the top warns ships of rocks below.", "This light is used mainly when it can be seen, not in heavy fog."),
    ("Lighthouses are painted in bright colors.", "This detail is not in the paragraph.")],
   "The foghorn detail specifically addresses poor visibility.", "Find the sentence that matches the exact condition asked about.")

# -- Rainforests
mc("description", "RI.4.5", 2,
   "Read: “Tropical rainforests are warm and extremely wet, with rain falling almost every day. Tall trees form a thick canopy that blocks most sunlight from reaching the ground. Thousands of plant and animal species live in the many layers of the forest.” What is the MAIN topic described in this paragraph?",
   "The climate and layers of a tropical rainforest.",
   [("A single hike through a rainforest trail.", "No specific trip or characters are described."),
    ("The reasons rainforests are being cut down.", "No cause of deforestation is explained."),
    ("A comparison between rainforests and deserts.", "No other biome is named for comparison.")],
   "Every sentence adds a general fact about the rainforest itself.", "Ask what single place or thing every sentence is about.")
match("description", "RI.4.5", 3, "Match each rainforest detail with what it describes.",
      [("Rain falling almost every day", "the climate"),
       ("A thick canopy of tall trees", "the plant layers"),
       ("Thousands of species living there", "the animal life")],
      "Each detail describes a different part of the rainforest.", "Sort details by what part of the topic they belong to.")

# -- Spiders
mc("description", "RI.4.5", 4,
   "Read: “Most spiders have eight legs and two body sections. Many spin silk webs to trap insects, while others hunt their prey by chasing it. Spider silk is extremely strong for its thin size.” Which detail describes how some spiders catch food?",
   "Many spin silk webs to trap insects, while others hunt their prey by chasing it.",
   [("Most spiders have eight legs and two body sections.", "This describes a spider's body, not how it catches food."),
    ("Spider silk is extremely strong for its thin size.", "This describes the silk's strength, not a hunting method."),
    ("Spiders live mostly in cold climates.", "This detail is not stated in the paragraph.")],
   "This sentence names two different hunting methods.", "Find the sentence that directly answers the question asked.")
dd("description", "RI.4.5", 5,
   "Choose the best word: “A spider has eight legs. ____, it has two main body sections.”",
   "Additionally", [("So", "This signals a result, not an added detail."),
                     ("Instead", "This signals a contrast or substitution."),
                     ("Next", "This signals a step in a sequence.")],
   "“Additionally” adds another physical detail about the spider.", "Also/additionally/another signal more description, not order or cause.")

# -- Bakeries
mc("description", "RI.4.5", 6,
   "Read: “A bakery fills its shelves with warm loaves of bread, flaky pastries, and sweet cakes. The smell of fresh dough drifts through the open door, and large ovens hum in the back room. Bakers knead dough early each morning before customers arrive.” How is information about the bakery mainly organized in this paragraph?",
   "By describing sights, smells, and sounds found inside the bakery.",
   [("By telling the steps to bake a cake, in order.", "No numbered steps or recipe is given."),
    ("By comparing this bakery to a restaurant.", "No other business is named for comparison."),
    ("By explaining why fresh bread costs more than packaged bread.", "No price comparison or cause is discussed.")],
   "The paragraph lists sensory details — sight, smell, sound — about the bakery.",
   "Look for details grouped by the senses they describe.")
mc("description", "RI.4.5", 7,
   "Read the paragraph above about the bakery. Which detail appeals to the reader's sense of smell?",
   "The smell of fresh dough drifts through the open door.",
   [("Warm loaves of bread, flaky pastries, and sweet cakes fill the shelves.", "This appeals to sight, not smell."),
    ("Large ovens hum in the back room.", "This appeals to hearing, not smell."),
    ("Bakers knead dough early each morning.", "This describes an action, not a smell.")],
   "This sentence directly names a smell.", "Look for words naming what you would smell, see, or hear.")

# -- Trains
mc("description", "RI.4.5", 1,
   "Read: “A freight train pulls dozens of long cars loaded with coal, grain, or steel. Powerful engines at the front provide the strength to pull such heavy loads. Loud horns warn nearby cars and pedestrians at crossings.” Which detail describes how the train warns people nearby?",
   "Loud horns warn nearby cars and pedestrians at crossings.",
   [("A freight train pulls dozens of long cars loaded with coal, grain, or steel.", "This describes the cargo, not a warning."),
    ("Powerful engines at the front provide the strength to pull heavy loads.", "This describes the engine's power, not a warning."),
    ("Freight trains travel only at night.", "This detail is not in the paragraph.")],
   "This sentence directly describes the horn as a warning.", "Match the question to the exact detail that answers it.")
tf("description", "RI.4.5", 2,
   "Someone argues the freight-train paragraph above is built from general facts rather than from a story about one particular trip. Do you agree?", True,
   "The sentences give general facts about freight trains, not a single timed event.",
   "Facts about a subject in general signal a description structure.")

# -- Mosques
mc("description", "RI.4.5", 3,
   "Read: “Many mosques have a tall tower called a minaret, where the call to prayer can be heard. Inside, patterned carpets cover the floor, and arched doorways lead into a large open hall. Domes on the roof help carry sound throughout the building.” Which detail describes a feature of the mosque's roof?",
   "Domes on the roof help carry sound throughout the building.",
   [("Many mosques have a tall tower called a minaret.", "This describes the tower, not the roof."),
    ("Patterned carpets cover the floor.", "This describes the floor, not the roof."),
    ("Arched doorways lead into a large open hall.", "This describes the doorways, not the roof.")],
   "This sentence names the domes as a roof feature.", "Check which part of the building each detail belongs to.")
match("description", "RI.4.5", 4, "Match each mosque feature with what it is used for.",
      [("minaret", "calling people to prayer"), ("carpets", "covering the floor"), ("domes", "carrying sound")],
      "Each architectural feature has its own descriptive purpose.", "Pair each feature with its function.")

# -- Glaciers
mc("description", "RI.4.5", 5,
   "Read: “A glacier is a huge, slow-moving sheet of ice formed from packed snow. Deep cracks called crevasses can form as the ice moves over uneven ground. Glaciers can carve valleys and leave behind piles of rock called moraines.” What is the author's purpose in listing the crevasses and moraines in this paragraph?",
   "To describe specific features that form as a glacier moves.",
   [("To explain the order in which the glacier melts each year.", "No yearly melting timeline is given."),
    ("To compare glaciers in different countries.", "No specific countries or other glaciers are named."),
    ("To warn readers about the dangers of climbing glaciers.", "The paragraph states facts, not a warning.")],
   "Both features are described as results of the glacier's movement, adding detail to the description.",
   "Ask why the author added each extra fact about the topic.")
dd("description", "RI.4.5", 6,
   "Choose the best word: “A glacier moves slowly over land. ____, it can carve out deep valleys.”",
   "On top of that", [("However", "This signals a contrast."),
                       ("Before", "This signals time order."),
                       ("Because", "This signals a cause.")],
   "“On top of that” adds another descriptive fact about what glaciers do.", "Also/in addition/on top of that add more description.")

# -- Orchards
mc("description", "RI.4.5", 7,
   "Read: “An orchard is a large area planted with rows of fruit trees such as apple, orange, or fig trees. Bees fly between the blossoms, helping the trees produce fruit. Workers pick the ripe fruit by hand each season.” Which sentence structure best describes how this paragraph is organized?",
   "It lists separate facts about the trees, the bees, and the workers in an orchard.",
   [("It narrates one specific day of picking fruit.", "No single day or event with a timeline is described."),
    ("It compares an orchard to a vegetable garden.", "No other type of farm is named for comparison."),
    ("It explains the cause of poor fruit harvests.", "No cause of a poor harvest is discussed.")],
   "Each sentence adds a separate fact about a different part of the orchard.",
   "Count the separate facts given about one overall topic.")
mc("description", "RI.4.5", 1,
   "Read the paragraph above about the orchard. Which detail describes how fruit trees get help producing fruit?",
   "Bees fly between the blossoms, helping the trees produce fruit.",
   [("An orchard is a large area planted with rows of fruit trees.", "This defines an orchard, not how fruit is produced."),
    ("Workers pick the ripe fruit by hand each season.", "This describes harvesting, not fruit production."),
    ("Orchards are always found near rivers.", "This detail is not stated in the paragraph.")],
   "This sentence explains the bees' role in fruit production.", "Find the exact sentence that answers the question.")

# -- Museums
mc("description", "RI.4.5", 2,
   "Read: “A natural history museum displays dinosaur bones, sparkling rocks, and preserved animals behind glass cases. Guided tours explain how each exhibit connects to the history of life on Earth. Interactive screens let visitors test their own knowledge.” What does this paragraph mainly describe?",
   "The exhibits and features found inside a natural history museum.",
   [("A field trip a class took last spring.", "No specific class or trip is narrated."),
    ("The difference between two museums in different cities.", "No second museum is named for comparison."),
    ("Why some museums charge an entrance fee.", "No reason for fees is explained.")],
   "Every sentence names a different feature found inside the museum.", "Ask what overall subject every sentence describes.")
tf("description", "RI.4.5", 3,
   "Could the museum paragraph above be rewritten as a timeline of one visitor's single afternoon at the museum, step by step?", False,
   "The sentences describe general features of the museum, not a single visit's timeline.",
   "General facts about a place, not events in order, signal description.")

# -- Solar system
mc("description", "RI.4.5", 4,
   "Read: “The solar system includes the sun at its center, eight planets, and many moons and asteroids. Some planets, like Mercury, are small and rocky, while others, like Jupiter, are huge balls of gas. Each planet travels around the sun on its own path called an orbit.” Which detail describes a difference among the planets themselves?",
   "Some planets, like Mercury, are small and rocky, while others, like Jupiter, are huge balls of gas.",
   [("The solar system includes the sun at its center, eight planets, and many moons and asteroids.", "This lists the parts of the solar system, not a difference among planets."),
    ("Each planet travels around the sun on its own path called an orbit.", "This describes orbits, not size or makeup."),
    ("The sun is the brightest star we can see.", "This detail is not in the paragraph.")],
   "This sentence directly compares planet sizes and materials.", "Look for the sentence naming specific differences.")
match("description", "RI.4.5", 5, "Match each solar system term with what it describes.",
      [("sun", "the center of the solar system"),
       ("moons and asteroids", "smaller objects in the solar system"),
       ("orbit", "a planet's path around the sun")],
      "Each term is paired with the detail that defines it.", "Match vocabulary with its description in the text.")

# -- Recycling centers
mc("description", "RI.4.5", 6,
   "Read: “A recycling center sorts paper, glass, plastic, and metal into separate bins. Large machines crush cans and shred paper into smaller pieces. Trucks then carry the sorted materials to factories where they are made into new products.” How does the author mainly organize facts about the recycling center?",
   "By describing the separate materials, machines, and steps found at the center.",
   [("By arguing that recycling should be mandatory everywhere.", "The paragraph states facts, not an opinion or argument."),
    ("By comparing recycling centers in two different towns.", "No second recycling center is named for comparison."),
    ("By explaining what caused people to start recycling.", "No historical cause is discussed.")],
   "The paragraph lists separate facts about sorting, machines, and transport.",
   "Look for a list of related facts about one process or place.")
err("description", "RI.4.5", 7,
    ["The center sorts materials into bins.", " First,", " it also uses machines to crush cans."],
    1, " Also,",
    "“Also” adds another fact; “First” wrongly implies a time-ordered step.",
    "Check whether a transition adds a fact or shows a sequence step.")

# -- Playgrounds
mc("description", "RI.4.5", 1,
   "Read: “A playground usually has swings, a slide, and a climbing structure with bars and ladders. Soft rubber mats or sand cover the ground to cushion falls. Benches nearby let parents sit and watch their children play.” Which detail describes what covers the playground ground?",
   "Soft rubber mats or sand cover the ground to cushion falls.",
   [("A playground usually has swings, a slide, and a climbing structure.", "This describes the equipment, not the ground covering."),
    ("Benches nearby let parents sit and watch their children play.", "This describes the benches, not the ground."),
    ("Playgrounds are only open during the summer.", "This detail is not in the paragraph.")],
   "This sentence specifically names what covers the ground.", "Find the exact sentence matching the question.")
mc("description", "RI.4.5", 2,
   "Looking back at that same playground paragraph, where does it say grown-ups can watch the kids from?",
   "Benches nearby let parents sit and watch their children play.",
   [("Swings, a slide, and bars for climbing fill the play area.", "This names the equipment itself, not a spot for watching."),
    ("A cushioned layer keeps falls from hurting.", "This names the ground's safety layer, not a seat."),
    ("A fence surrounds the whole play area.", "No fence is mentioned anywhere in the paragraph.")],
   "The benches are the spot named for parents to sit and watch.", "Find the exact sentence matching the question.")

# ================================================================== capitalization
grade(4)

mc("capitalization", "L.4.2.a", 1, "Which sentence is capitalized correctly?",
   "My friend Layla came over after school.",
   [("My friend layla came over after school.", "“Layla” is a specific person's name and must start with a capital letter."),
    ("my friend Layla came over after school.", "The first word of a sentence must be capitalized."),
    ("My Friend Layla came over after school.", "“Friend” is a common noun and should not be capitalized.")],
   "Layla is a proper noun naming a specific person, and the sentence's first word must also be capitalized.",
   "Capitalize the first word of every sentence and every proper noun.")
dd("capitalization", "L.4.2.a", 2, "Choose the correctly capitalized word: “Our class trip is on ____.”",
   "Thursday", [("thursday", "Days of the week are proper nouns and need a capital letter."),
                 ("THURSDAY", "Only the first letter of a day name is capitalized, not all letters."),
                 ("thurday", "This is misspelled.")],
   "Days of the week are proper nouns, so only the first letter is capitalized.", "Capitalize days, months, and holidays.")
err("capitalization", "L.4.2.a", 3, ["We celebrate", " eid al-fitr", " every year", " after Ramadan."], 1, " Eid al-Fitr",
    "Eid al-Fitr is the specific name of a holiday, so its main words are capitalized.", "Capitalize the names of holidays.")
mc("capitalization", "L.4.2.a", 4, "Which sentence is capitalized correctly?",
   "Fatima speaks Arabic, English, and French.",
   [("Fatima speaks arabic, english, and french.", "Languages are proper nouns and must be capitalized."),
    ("fatima speaks Arabic, English, and French.", "The first word of the sentence must be capitalized."),
    ("Fatima Speaks Arabic, English, and French.", "“Speaks” is a verb, not a proper noun, and should not be capitalized.")],
   "Languages are proper nouns and are always capitalized.", "Capitalize the names of languages and nationalities.")
mc("capitalization", "L.4.2.a", 5, "Which sentence uses a title correctly?",
   "Dr. Hassan examined the patient carefully.",
   [("dr. Hassan examined the patient carefully.", "A title before a name, like Dr., is capitalized."),
    ("Dr. hassan examined the patient carefully.", "A person's name is always capitalized."),
    ("The Dr. examined the patient carefully.", "Without a name attached, “doctor” is a common noun and should not be capitalized.")],
   "Dr. is a title directly before a name, so both the title and the name are capitalized.",
   "Capitalize a title only when it comes right before a specific name.")
mc("capitalization", "L.4.2.a", 6, "Which book title is capitalized correctly?",
   "The Secret of the Lost City",
   [("the secret of the lost city", "The first word and all major words of a title must be capitalized."),
    ("The secret of the Lost city", "Major words like “Secret” and “City” must also be capitalized."),
    ("The Secret Of The Lost City", "Short words like “of” and “the” inside a title are usually not capitalized.")],
   "In a title, the first word and all important words are capitalized, but short connecting words are usually lowercase.",
   "Capitalize the first, last, and all major words in a title.")
mc("capitalization", "L.4.2.a", 7, "Which sentence is capitalized correctly?",
   "Mars and Jupiter are easier to see in the night sky than Mercury.",
   [("mars and jupiter are easier to see in the night sky than mercury.", "Planet names are proper nouns and must be capitalized."),
    ("Mars and Jupiter are easier to see in the Night Sky than Mercury.", "“Night sky” is a common noun phrase, not a proper noun, so it should not be capitalized."),
    ("Mars And Jupiter are easier to see in the night sky than Mercury.", "“And” is a connecting word, not a proper noun, so it should not be capitalized.")],
   "The names of planets are proper nouns and are always capitalized.",
   "Capitalize the names of planets, but not general sky words like sun, moon, or sky.")
tf("capitalization", "L.4.2.a", 1,
   "The sentence “my sister and i went to the market” is capitalized correctly.", False,
   "The pronoun “I” is always capitalized, and the sentence should begin with a capital letter: “My sister and I went to the market.”",
   "Always capitalize the pronoun I, wherever it appears in a sentence.")
dd("capitalization", "L.4.2.a", 2, "Choose the correctly capitalized word: “We visited the ____ last summer.”",
   "Cairo Tower", [("cairo tower", "A specific landmark's name is a proper noun and must be capitalized."),
                    ("Cairo tower", "Both words in this landmark's name should be capitalized."),
                    ("CAIRO TOWER", "Only the first letter of each word is capitalized, not the whole name.")],
   "Cairo Tower names one specific landmark, so it is fully capitalized.", "Capitalize every important word in the name of a specific place.")
mc("capitalization", "L.4.2.a", 3, "Which sentence capitalizes school subjects correctly?",
   "I have math class right after English class.",
   [("I have Math class right after english class.", "“Math” is a general subject and should not be capitalized; “English” is a language and must be capitalized."),
    ("I have math class right after english class.", "“English” is a language, so it must be capitalized."),
    ("I have Math class right after English Class.", "“Math” and the second “class” are common nouns and should not be capitalized.")],
   "General subjects like math are not capitalized, but “English” is a language and is always capitalized.",
   "Capitalize a subject only if it is also the name of a language.")
mc("capitalization", "L.4.2.a", 4, "Which sentence capitalizes family titles correctly?",
   "I asked Grandma if my cousin could visit, but my grandma said he was busy.",
   [("I asked grandma if my cousin could visit, but my grandma said he was busy.", "Used as a name in direct address, “Grandma” must be capitalized."),
    ("I asked Grandma if my cousin could visit, but my Grandma said he was busy.", "The second “grandma” follows “my” and is a common noun, so it should not be capitalized."),
    ("I asked Grandma if my Cousin could visit, but my grandma said he was busy.", "“Cousin” is a common noun and should not be capitalized.")],
   "Capitalize a family title when it is used in place of a person's name, but not when it follows a possessive word like my.",
   "Ask: could I replace this word with the person's actual name? If yes, capitalize it.")
mc("capitalization", "L.4.2.a", 5, "Which sentence is capitalized correctly?",
   "Our class is studying Ancient Egypt and the building of the pyramids.",
   [("our class is studying ancient egypt and the building of the pyramids.", "The first word of the sentence and the specific historical era “Ancient Egypt” must be capitalized."),
    ("Our class is studying ancient Egypt and the building of the Pyramids.", "“Ancient” is part of the specific era's name and should be capitalized; “pyramids” here is a general noun, not a specific name."),
    ("Our class is studying Ancient egypt and the building of the pyramids.", "Both words of “Ancient Egypt” must be capitalized.")],
   "Ancient Egypt is the name of a specific historical era and both words are capitalized.",
   "Capitalize the full name of a specific historical period.")
mc("capitalization", "L.4.2.a", 6, "Which sentence capitalizes directions correctly?",
   "We drove south for an hour before reaching villages in the Middle East.",
   [("We drove South for an hour before reaching villages in the middle east.", "“South” here is just a compass direction and should not be capitalized; “Middle East” is a specific region and must be capitalized."),
    ("We drove south for an hour before reaching villages in the middle east.", "“Middle East” names a specific region and must be capitalized."),
    ("we drove south for an hour before reaching villages in the Middle East.", "The first word of the sentence must be capitalized.")],
   "A simple compass direction like south is lowercase, but a specific named region like the Middle East is capitalized.",
   "Capitalize a direction word only when it names a specific region.")
mc("capitalization", "L.4.2.a", 7, "Which sentence is capitalized correctly?",
   "Omar bought a box of Crunchy Flakes cereal at the store.",
   [("Omar bought a box of crunchy flakes cereal at the store.", "“Crunchy Flakes” is a specific brand name and must be capitalized."),
    ("omar bought a box of Crunchy Flakes cereal at the store.", "The first word of the sentence must be capitalized."),
    ("Omar bought a box of Crunchy flakes Cereal at the store.", "“Cereal” is a common noun and should not be capitalized; both words of the brand name should be capitalized together.")],
   "Crunchy Flakes is a specific brand name, so both words are capitalized.", "Capitalize specific brand and product names.")
mc("capitalization", "L.4.2.a", 1, "Which sentence is capitalized correctly?",
   "Our new house is on Palm Street.",
   [("Our new house is on palm street.", "“Palm Street” is a specific street name and must be capitalized."),
    ("our new house is on Palm Street.", "The first word of the sentence must be capitalized."),
    ("Our new house is on Palm street.", "Both words of the street name must be capitalized.")],
   "Palm Street is the name of a specific road, so both words are capitalized.", "Capitalize every word in the name of a specific street.")
fill("capitalization", "L.4.2.a", 2,
     "Fill in the blank with the correctly capitalized word: “____ asked, ‘Can you help me?’” (the sentence begins with a girl's name, mona)",
     ["Mona"],
     "A sentence's first word, including a name, is always capitalized.", "Always capitalize the very first word of a sentence.")
tf("capitalization", "L.4.2.a", 3,
   "In the sentence “Sami whispered, ‘the door is open,’” the word “the” inside the quotation should be capitalized because it begins a new spoken sentence.", True,
   "A quotation that is a complete sentence begins with a capital letter, even inside the quotation marks.",
   "Capitalize the first word of a direct quotation if it is a full sentence.")
mc("capitalization", "L.4.2.a", 4, "Which sentence abbreviates a title correctly?",
   "Mr. Adel and Mrs. Nabil both teach fourth grade.",
   [("mr. Adel and mrs. Nabil both teach fourth grade.", "Title abbreviations like Mr. and Mrs. must be capitalized."),
    ("Mr. adel and Mrs. nabil both teach fourth grade.", "The names following the titles must also be capitalized."),
    ("MR. Adel and MRS. Nabil both teach fourth grade.", "Only the first letter of these abbreviations is capitalized, not the whole word.")],
   "Mr. and Mrs. are title abbreviations placed before names, so only their first letters are capitalized.",
   "Capitalize just the first letter of title abbreviations like Mr., Mrs., and Dr.")
mc("capitalization", "L.4.2.a", 5, "Which sentence is capitalized correctly?",
   "The Egyptian team practiced hard before the Japanese team arrived.",
   [("the egyptian team practiced hard before the japanese team arrived.", "Nationalities like Egyptian and Japanese are proper adjectives and must be capitalized."),
    ("The egyptian team practiced hard before the Japanese team arrived.", "“Egyptian” is a nationality and must be capitalized."),
    ("The Egyptian Team practiced hard before the Japanese Team arrived.", "“Team” is a common noun and should not be capitalized.")],
   "Egyptian and Japanese describe a specific nationality, so they are always capitalized.",
   "Capitalize words that come from the name of a country, even when used as adjectives.")

grade(5)

mc("capitalization", "L.5.2.a", 1, "Which sentence is capitalized correctly?",
   "The World Health Organization released a new report.",
   [("The world health organization released a new report.", "“World Health Organization” is the specific name of an organization and must be capitalized."),
    ("the World Health Organization released a new report.", "The first word of the sentence must be capitalized."),
    ("The World health organization released a new report.", "Every major word in this organization's name must be capitalized.")],
   "World Health Organization is a specific proper noun naming an organization.",
   "Capitalize every important word in the full name of an organization.")
mc("capitalization", "L.5.2.a", 2, "Which sentence is capitalized correctly?",
   "Every winter, our city hosts the Winter Olympics.",
   [("Every Winter, our city hosts the winter Olympics.", "“Winter” as a season is lowercase; “Winter Olympics” is a specific event name and must be capitalized."),
    ("every winter, our city hosts the Winter Olympics.", "The first word of the sentence must be capitalized."),
    ("Every winter, our city hosts the winter olympics.", "“Winter Olympics” is the specific name of an event and both words must be capitalized.")],
   "Seasons are lowercase, but the name of a specific event like the Winter Olympics is capitalized.",
   "Capitalize a season's name only when it is part of a specific event's title.")
mc("capitalization", "L.5.2.a", 3, "Which sentence is capitalized correctly?",
   "Next term I am taking Introduction to Robotics instead of a general robotics class.",
   [("Next term I am taking introduction to robotics instead of a general robotics class.", "“Introduction to Robotics” is the specific title of a course and must be capitalized."),
    ("Next term I am taking Introduction to Robotics instead of a general Robotics class.", "“Robotics” here is a general subject, not the course title, so it should not be capitalized."),
    ("next term I am taking Introduction to Robotics instead of a general robotics class.", "The first word of the sentence must be capitalized.")],
   "A specific course title is capitalized, while the same word used generally is not.",
   "Capitalize a course name only when you mean its exact official title.")
mc("capitalization", "L.5.2.a", 4, "Which sentence is capitalized correctly?",
   "The chef prepared a Mediterranean dish with fresh herbs.",
   [("The chef prepared a mediterranean dish with fresh herbs.", "“Mediterranean” comes from a specific place name and must be capitalized."),
    ("the chef prepared a Mediterranean dish with fresh herbs.", "The first word of the sentence must be capitalized."),
    ("The Chef prepared a Mediterranean Dish with fresh herbs.", "“Chef” and “dish” are common nouns and should not be capitalized.")],
   "Mediterranean is a proper adjective formed from the name of a sea, so it is always capitalized.",
   "Capitalize adjectives formed from proper nouns, like Mediterranean or Egyptian.")
mc("capitalization", "L.5.2.a", 5, "Which sentence is capitalized correctly?",
   "President Al-Sisi met with the Minister of Education yesterday.",
   [("president Al-Sisi met with the minister of education yesterday.", "A title directly before a specific name or a specific office's full title must be capitalized."),
    ("President Al-Sisi met with the minister of education yesterday.", "“Minister of Education” is the specific title of an office and should be capitalized."),
    ("President al-Sisi met with the Minister of Education yesterday.", "A person's last name is always capitalized.")],
   "A title used right before a name, or a specific office's full title, is capitalized.",
   "Capitalize a government title only when it names a specific office or comes before a name.")
mc("capitalization", "L.5.2.a", 6, "Which sentence is capitalized correctly?",
   "Students studied the Declaration of Independence in history class.",
   [("Students studied the declaration of independence in history class.", "“Declaration of Independence” is the specific title of a document and must be capitalized."),
    ("Students studied the Declaration of independence in history class.", "Every major word of this document's title must be capitalized."),
    ("students studied the Declaration of Independence in history class.", "The first word of the sentence must be capitalized.")],
   "The Declaration of Independence is the official title of a specific document.",
   "Capitalize the full official title of a specific document.")
mc("capitalization", "L.5.2.a", 7, "Which sentence is capitalized correctly?",
   "Remember this rule: Always capitalize the first word after a colon if it begins a complete sentence.",
   [("Remember this rule: always capitalize the first word after a colon if it begins a complete sentence.", "A complete sentence after a colon should begin with a capital letter."),
    ("remember this rule: Always capitalize the first word after a colon if it begins a complete sentence.", "The first word of the whole sentence must be capitalized."),
    ("Remember this rule: Always Capitalize the first word after a colon if it begins a complete sentence.", "“Capitalize” is a regular verb here and should not be capitalized.")],
   "When a complete sentence follows a colon, its first word is capitalized.",
   "Capitalize after a colon only if a full sentence follows.")
mc("capitalization", "L.5.2.a", 1, "Which sentence is capitalized correctly?",
   "An Arabian horse and a common pony grazed in the same field.",
   [("An arabian horse and a common pony grazed in the same field.", "“Arabian” comes from a proper noun and must be capitalized."),
    ("an Arabian horse and a common pony grazed in the same field.", "The first word of the sentence must be capitalized."),
    ("An Arabian Horse and a common Pony grazed in the same field.", "“Horse” and “pony” are common nouns and should not be capitalized.")],
   "Arabian is a proper adjective naming a specific region, so it is capitalized even though horse is not.",
   "Capitalize only the proper-noun part of a breed name.")
mc("capitalization", "L.5.2.a", 2, "Which sentence is capitalized correctly?",
   "My Egyptian-American cousin is visiting next week.",
   [("My egyptian-american cousin is visiting next week.", "Both parts of this hyphenated nationality are proper adjectives and must be capitalized."),
    ("my Egyptian-American cousin is visiting next week.", "The first word of the sentence must be capitalized."),
    ("My Egyptian-american cousin is visiting next week.", "Both halves of a hyphenated proper adjective are capitalized.")],
   "Each part of a hyphenated nationality formed from a proper noun is capitalized.",
   "Capitalize every proper-noun part of a hyphenated word.")
mc("capitalization", "L.5.2.a", 3, "Which sentence is capitalized correctly?",
   "She sang “A Song for the Sea” at the concert.",
   [("She sang “a song for the sea” at the concert.", "The first word and all major words of a song title must be capitalized."),
    ("She sang “A song for the Sea” at the concert.", "“Song” is a major word in the title and must also be capitalized."),
    ("she sang “A Song for the Sea” at the concert.", "The first word of the sentence must be capitalized.")],
   "The first word and all major words of a song's title are capitalized.",
   "Treat a song or poem title like a book title: capitalize the major words.")
mc("capitalization", "L.5.2.a", 4, "Which sentence is capitalized correctly?",
   "I told Mom about my test, but my mom already knew the results.",
   [("I told mom about my test, but my mom already knew the results.", "Used in direct address in place of a name, “Mom” must be capitalized."),
    ("I told Mom about my test, but my Mom already knew the results.", "The second “mom” follows the possessive “my” and should not be capitalized."),
    ("i told Mom about my test, but my mom already knew the results.", "The first word of the sentence must be capitalized.")],
   "A family title used in place of a name is capitalized, but not when it follows a possessive word like my.",
   "If you could swap in the person's real name, capitalize it.")
mc("capitalization", "L.5.2.a", 5, "Which sentence is capitalized correctly?",
   "The match was held at Cairo International Stadium.",
   [("The match was held at cairo international stadium.", "“Cairo International Stadium” is the specific name of a place and must be capitalized."),
    ("the match was held at Cairo International Stadium.", "The first word of the sentence must be capitalized."),
    ("The match was held at Cairo international Stadium.", "Every major word in this stadium's name must be capitalized.")],
   "Cairo International Stadium is the proper name of a specific place.",
   "Capitalize every important word in the official name of a building or stadium.")
mc("capitalization", "L.5.2.a", 6, "Which sentence is capitalized correctly?",
   "Fans around the world watch the World Cup every four years.",
   [("Fans around the world watch the world cup every four years.", "“World Cup” is the specific name of an event and must be capitalized."),
    ("fans around the world watch the World Cup every four years.", "The first word of the sentence must be capitalized."),
    ("Fans around the World watch the World Cup every four years.", "“World” used generally here is a common noun and should not be capitalized.")],
   "World Cup names a specific event, while world used generally is a common noun.",
   "Capitalize a word only when it is part of a specific proper name.")
mc("capitalization", "L.5.2.a", 7, "Which sentence is capitalized correctly?",
   "Farmers in the Nile Delta grow rice, while farmers south of the city grow wheat.",
   [("Farmers in the nile delta grow rice, while farmers south of the city grow wheat.", "“Nile Delta” is a specific region's name and must be capitalized."),
    ("Farmers in the Nile Delta grow rice, while farmers South of the city grow wheat.", "“South” here is just a compass direction and should not be capitalized."),
    ("farmers in the Nile Delta grow rice, while farmers south of the city grow wheat.", "The first word of the sentence must be capitalized.")],
   "The Nile Delta is a specific named region, while south here is only a general direction.",
   "Capitalize a direction word only when it is part of a specific region's name.")
err("capitalization", "L.5.2.a", 1, ["Early humans in", " the stone age", " made tools", " from sharpened rock."], 1, " the Stone Age",
    "The Stone Age is the name of a specific historical period and is capitalized.", "Capitalize the full name of a specific historical era.")
fill("capitalization", "L.5.2.a", 2,
     "Fill in the correctly capitalized word: “Can you help me, ____?” (the sentence is spoken directly to someone named Uncle, used in place of his name)",
     ["Uncle"],
     "Used in direct address in place of a name, a family title is capitalized.", "A family title used as a name in speech is capitalized.")
tf("capitalization", "L.5.2.a", 3,
   "In the sentence “I support the al-ahly football club,” the team's name should be capitalized as “Al-Ahly Football Club.”", True,
   "Al-Ahly Football Club is the official name of a specific team and every major word is capitalized.",
   "Capitalize every major word in the official name of a club or team.")
mc("capitalization", "L.5.2.a", 4, "Which sentence is capitalized correctly?",
   "Scientists study how Earth's climate is changing, while farmers dig into the earth to plant seeds.",
   [("Scientists study how earth's climate is changing, while farmers dig into the earth to plant seeds.", "“Earth” as the name of our planet is a proper noun and must be capitalized."),
    ("Scientists study how Earth's climate is changing, while farmers dig into the Earth to plant seeds.", "Here “earth” means soil, a common noun, and should not be capitalized."),
    ("scientists study how Earth's climate is changing, while farmers dig into the earth to plant seeds.", "The first word of the sentence must be capitalized.")],
   "Earth is capitalized when it names our planet, but lowercase when it means soil or ground.",
   "Capitalize Earth only when you mean the planet.")

# ================================================================== reference-materials
grade(4)

mc("reference-materials", "L.4.4.c", 1,
   "The guide words on a dictionary page are “desert” and “detail.” Which word would appear on that page?",
   "dessert", [("deal", "“Deal” comes before “desert” in alphabetical order."),
               ("devil", "“Devil” comes after “detail” in alphabetical order."),
               ("dentist", "“Dentist” comes before “desert” because “den” comes before “des.”")],
   "“Dessert” falls alphabetically between “desert” and “detail.”",
   "Compare letter by letter after the matching guide-word start.")
tf("reference-materials", "L.4.4.c", 2,
   "A glossary defines only the special words used in one particular book, while a dictionary defines words from the whole language.", True,
   "A glossary is limited to one book's vocabulary, but a dictionary covers the language in general.",
   "Glossary = one book; dictionary = the whole language.")
mc("reference-materials", "L.4.4.c", 3,
   "You wrote “The dog was happy.” Which resource would help you replace “happy” with a more exact word like “thrilled” or “content”?",
   "A thesaurus, since it lists words with similar meanings",
   [("An atlas, since it shows maps", "An atlas does not list word meanings."),
    ("A glossary, since it only defines words from one book", "A glossary does not offer a list of similar words to choose from."),
    ("An index, since it lists page numbers", "An index does not list word meanings or similar words.")],
   "A thesaurus groups together words with similar meanings so you can pick a more precise one.",
   "Thesaurus = words with similar meanings.")
mc("reference-materials", "L.4.4.c", 4,
   "A dictionary entry shows “run (v.).” What does “v.” tell you?",
   "That “run” is being used as a verb in this entry",
   [("That “run” rhymes with “fun”", "Abbreviations like this do not show rhymes."),
    ("That “run” is a proper noun", "“V.” means verb, not noun."),
    ("That “run” has multiple meanings", "The abbreviation shows the part of speech, not how many meanings a word has.")],
   "“V.” is a part-of-speech abbreviation meaning verb.",
   "Learn common abbreviations: n. noun, v. verb, adj. adjective.")
mc("reference-materials", "L.4.4.c", 5,
   "A dictionary entry says: “trunk (noun) 1. the main stem of a tree 2. a large storage box 3. an elephant's long nose.” Which meaning fits “The elephant used its trunk to spray water”?",
   "Meaning 3",
   [("Meaning 1", "A tree's stem cannot spray water."),
    ("Meaning 2", "A storage box cannot spray water."),
    ("All three meanings", "Only one meaning fits this sentence.")],
   "An elephant sprays water using its long nose, so the third meaning fits.",
   "Read each meaning and test it in the sentence.")
order("reference-materials", "L.4.4.c", 6, "Put these words in the order they would appear in a dictionary.",
      ["lantern", "large", "lasso", "late", "laugh"],
      "Compare letters one by one: lan, lar, las, lat, lau.",
      "After matching letters, compare the next different letter.", qtype="WORD_ORDER")
mc("reference-materials", "L.4.4.c", 7,
   "You want to find which page discusses “volcanoes” in a long book about Earth science. Which reference tool should you check?",
   "The index, because it lists specific topics in alphabetical order with page numbers",
   [("The table of contents, because it lists chapter titles in the order they appear", "Chapter titles are broader and not alphabetical, making one specific topic harder to find."),
    ("The glossary, because it defines difficult words", "A glossary defines words; it does not list topics or page numbers."),
    ("The thesaurus, because it lists synonyms", "A thesaurus does not list pages or topics in a book.")],
   "An index lists specific topics alphabetically with their page numbers, making it the fastest way to find one topic.",
   "Use the index for a specific topic; use the table of contents for a chapter overview.")
mc("reference-materials", "L.4.4.c", 1,
   "A dictionary shows “giraffe (juh-RAF).” What does the part in parentheses help you do?",
   "Pronounce the word correctly",
   [("Spell the word correctly", "The respelling is not the normal spelling."),
    ("Know how many meanings the word has", "Meanings are numbered separately, not shown in the respelling."),
    ("Know what part of speech the word is", "Part of speech uses abbreviations like n. or v., not a respelling.")],
   "The respelling in parentheses shows how to say the word aloud.",
   "Say the syllables in the respelling to pronounce a new word.")
mc("reference-materials", "L.4.4.c", 2,
   "A thesaurus entry for “huge” lists “gigantic, enormous” as similar words and “tiny” as an opposite. Which section lists the opposite?",
   "The antonym section",
   [("The synonym section", "That section lists words with similar meanings, like “gigantic.”"),
    ("The pronunciation section", "A thesaurus usually does not focus on pronunciation."),
    ("The definition section", "A thesaurus lists related words, not full definitions.")],
   "Antonyms are opposite-meaning words, listed separately from synonyms.",
   "Synonym = similar meaning; antonym = opposite meaning.")
mc("reference-materials", "L.4.4.c", 3,
   "Which is an advantage of using a digital dictionary instead of a print dictionary?",
   "You can type a word and search for it instantly instead of flipping pages",
   [("It never makes spelling mistakes", "Digital tools can still contain errors."),
    ("It always gives a shorter definition", "Definition length depends on the resource, not the format."),
    ("It replaces the need to learn new words", "Using any dictionary still requires learning new words.")],
   "Digital dictionaries let you search instead of using guide words to flip through pages.",
   "Think about what is faster or easier in a digital format.")
fill("reference-materials", "L.4.4.c", 4,
     "Fill in: The small list of definitions found at the back of a nonfiction book is called a ____.",
     ["glossary"],
     "A glossary is located at the back of a book and defines words used in it.",
     "Glossary = back-of-the-book word list.")

grade(5)

mc("reference-materials", "L.5.4.c", 1,
   "A dictionary entry reads: “bank (noun) 1. the land along a river 2. a place where people keep money.” Which meaning fits “We sat on the bank and watched the boats go by”?",
   "Meaning 1",
   [("Meaning 2", "You cannot sit on a place where people keep money and watch boats."),
    ("Both meanings", "Only one meaning fits this sentence."),
    ("Neither meaning", "Meaning 1 clearly fits.")],
   "Sitting beside the water and watching boats matches the river-bank meaning.",
   "Read each meaning and test it in the sentence.")
mc("reference-materials", "L.5.4.c", 2,
   "A thesaurus lists “slim, skinny, scrawny” as synonyms for “thin.” Which word has the most negative connotation?",
   "Scrawny",
   [("Slim", "This word usually has a positive or neutral connotation."),
    ("Skinny", "This word is mostly neutral, less negative than “scrawny.”"),
    ("Thin", "This is the plain, neutral original word.")],
   "“Scrawny” suggests being unpleasantly or unhealthily thin, which is a negative connotation.",
   "A thesaurus lists similar words, but their connotations can be very different.")
mc("reference-materials", "L.5.4.c", 3,
   "A dictionary entry shows “child (noun) pl. children.” What does “pl.” tell you?",
   "That “children” is the irregular plural form of “child”",
   [("That “children” is a synonym for “child”", "“Pl.” does not mean synonym."),
    ("That “child” can be used as a verb", "“Pl.” refers to plural nouns, not verbs."),
    ("That “children” is pronounced differently from “child”", "“Pl.” is about the plural form, not pronunciation.")],
   "“Pl.” marks the plural form, which for “child” is the irregular word “children.”",
   "Learn common entry abbreviations, including pl. for plural.")
mc("reference-materials", "L.5.4.c", 4,
   "A dictionary entry for “frog” ends with “see also: amphibian.” What should you do with this note?",
   "Look up “amphibian” for related information about the larger animal group frogs belong to",
   [("Ignore it, because it is not part of the definition", "Cross-references point to useful related entries."),
    ("Assume “frog” and “amphibian” mean exactly the same thing", "They are related but not identical terms."),
    ("Look for “amphibian” in the index instead of the dictionary", "The note is a dictionary cross-reference, not an index instruction.")],
   "A “see also” note points to a related entry that adds useful background.",
   "Follow cross-references to learn how a word connects to a broader category.")
mc("reference-materials", "L.5.4.c", 5,
   "Which resource would best explain the exact scientific meaning of the word “photosynthesis”?",
   "A science dictionary or glossary written for that subject",
   [("A thesaurus", "A thesaurus lists similar words, not exact scientific definitions."),
    ("An atlas", "An atlas shows maps, not word meanings."),
    ("A rhyming dictionary", "A rhyming dictionary lists words that sound alike, not definitions.")],
   "A subject-specific dictionary or glossary gives the precise meaning used in that field.",
   "Choose a reference tool that matches the subject you are studying.")
order("reference-materials", "L.5.4.c", 6, "Put these words in the order they would appear in a dictionary.",
      ["bridge", "brief", "bright", "brilliant", "bring"],
      "Compare letters one by one: brid, brie, brig, bril, brin.",
      "After matching letters, compare the next different letter.", qtype="WORD_ORDER")
mc("reference-materials", "L.5.4.c", 7,
   "An online dictionary entry for “comfortable” includes a small speaker icon next to a respelling. What is this icon most useful for?",
   "Hearing the correct pronunciation and stress of the word",
   [("Seeing a picture that shows the word's meaning", "A speaker icon plays sound, not an image."),
    ("Finding synonyms for the word", "That is a thesaurus feature, not a pronunciation tool."),
    ("Checking how the word is spelled", "Spelling is shown in the entry itself, not through the audio icon.")],
   "A speaker icon in a digital dictionary plays the correct pronunciation aloud.",
   "Use audio features to check pronunciation and stress.")
mc("reference-materials", "L.5.4.c", 1,
   "While reading a science textbook, you see the unfamiliar term “photosynthesis” in bold print. What is the fastest way to find its meaning?",
   "Check the glossary at the back of the textbook",
   [("Look in a general dictionary from a different book", "The textbook's own glossary matches exactly how the term is used in that book."),
    ("Skip the word and keep reading", "Understanding bold key terms matters for comprehension."),
    ("Ask a classmate to guess the meaning", "A guess may be inaccurate; the glossary gives the exact definition.")],
   "A textbook's glossary defines its own bold key terms quickly and accurately.",
   "Bold or highlighted words are usually defined in the book's own glossary.")
mc("reference-materials", "L.5.4.c", 2,
   "For a formal research report, which word choice from a thesaurus entry for “big” fits best?",
   "Substantial",
   [("Humongous", "This word sounds too informal for a research report."),
    ("Gigantic", "This word is more common in casual or dramatic writing, not formal reports."),
    ("Huge", "This common, informal word is less precise for formal writing.")],
   "“Substantial” sounds more formal and precise than casual synonyms like “huge” or “humongous.”",
   "Choose a thesaurus synonym that matches the tone of your writing.")
tf("reference-materials", "L.5.4.c", 3,
   "A thesaurus entry usually gives a full definition of each word it lists.", False,
   "A thesaurus mainly lists related words; a dictionary gives full definitions.",
   "Thesaurus = related words; dictionary = full definitions.")
mc("reference-materials", "L.5.4.c", 4,
   "A dictionary shows “des·ert (noun) DEZ-ert: a dry, sandy region; de·sert (verb) dih-ZERT: to abandon.” Which pronunciation fits “The soldiers refused to desert their post”?",
   "dih-ZERT, because here “desert” is used as a verb",
   [("DEZ-ert, because here “desert” is used as a noun", "The sentence uses “desert” as a verb, not to refer to a dry region."),
    ("Both pronunciations work equally well here", "Only the verb pronunciation fits this sentence's meaning."),
    ("Neither pronunciation, since this must be a different word", "This is the same word “desert,” just a different part of speech.")],
   "Used as a verb meaning to abandon, “desert” is pronounced dih-ZERT.",
   "Check the part of speech to choose the correct pronunciation.")

grade(6)

mc("reference-materials", "L.6.4.c", 1,
   "Which reference tool would best explain that the word “biology” comes from Greek roots meaning “life” and “study of”?",
   "A dictionary with word-origin (etymology) notes",
   [("A thesaurus", "A thesaurus lists similar words, not word origins."),
    ("An atlas", "An atlas shows maps, not word histories."),
    ("A glossary from a math textbook", "A math glossary would not include this biology term's origin.")],
   "Etymology notes in a dictionary explain the original roots and meanings of a word.",
   "Look for an etymology note to learn a word's root meaning.")
mc("reference-materials", "L.6.4.c", 2,
   "For a persuasive speech praising a leader's courage, which thesaurus synonym for “brave” fits best?",
   "Valiant",
   [("Reckless", "This word suggests careless risk-taking, a negative connotation."),
    ("Foolhardy", "This word suggests poor judgment, a negative connotation."),
    ("Daring", "This word can hint at risk in a way that feels less clearly admirable than “valiant.”")],
   "“Valiant” praises courage without any negative hint of recklessness.",
   "Match a synonym's connotation to the tone you want to create.")
mc("reference-materials", "L.6.4.c", 3,
   "A dictionary entry for “light” lists definition 1 as “not heavy” and definition 5 as “to set something on fire.” Which definition is most likely used more often in everyday speech?",
   "Definition 1, because dictionaries often list more common meanings first",
   [("Definition 5, because later definitions are always more common", "Dictionaries usually list common meanings first, not last."),
    ("Both definitions are used equally often", "Dictionaries list meanings in a general order of frequency, not equal use."),
    ("Neither definition is common", "Definition 1 is a very common meaning of “light.”")],
   "Dictionaries typically order meanings from most to least common.",
   "A lower definition number often, but not always, signals a more common meaning.")
mc("reference-materials", "L.6.4.c", 4,
   "A dictionary entry for “affect” ends with “compare: effect.” Why would the dictionary include this note?",
   "Because “affect” and “effect” are easily confused words with different meanings",
   [("Because “affect” and “effect” are spelled exactly the same", "They are spelled differently, which is part of why they're confused."),
    ("Because the entry ran out of room and needed a shorter definition", "A compare note is not about saving space."),
    ("Because “affect” is no longer used in modern English", "“Affect” is a commonly used word today.")],
   "A “compare” note warns readers about a similar word that is often mixed up with this one.",
   "Follow a “compare” note to tell two easily confused words apart.")
mc("reference-materials", "L.6.4.c", 5,
   "The guide words on a dictionary page are “pamphlet” and “parade.” Which word would appear on this page?",
   "panic",
   [("palace", "“Palace” comes before “pamphlet” in alphabetical order."),
    ("parent", "“Parent” comes after “parade” in alphabetical order."),
    ("pact", "“Pact” comes before “pamphlet” in alphabetical order.")],
   "“Panic” falls alphabetically between “pamphlet” and “parade.”",
   "Compare letter by letter after the matching guide-word start.")
order("reference-materials", "L.6.4.c", 6, "Put these words in the order they would appear in a dictionary.",
      ["sequence", "serene", "serious", "settle", "seven"],
      "Compare letters one by one: seq, ser(e), ser(i), set, sev.",
      "When the first letters match, compare the next different letter.", qtype="WORD_ORDER")
mc("reference-materials", "L.6.4.c", 7,
   "You need several paragraphs of background information about the history of the Roman Empire, not just a short definition. Which resource is the better choice?",
   "An encyclopedia, because it gives detailed explanations rather than brief definitions",
   [("A dictionary, because it lists every meaning of every word", "A dictionary gives brief definitions, not in-depth historical background."),
    ("A thesaurus, because it lists many related words", "A thesaurus does not give background information on topics."),
    ("A glossary, because it only covers words from one book", "A glossary gives brief definitions specific to one book, not depth on a historical topic.")],
   "An encyclopedia provides detailed, multi-paragraph explanations of topics, unlike a brief dictionary definition.",
   "Choose an encyclopedia when you need depth, not just a quick definition.")
mc("reference-materials", "L.6.4.c", 1,
   "A dictionary app suggests “photosynthesis” as soon as you type “photo.” What is the main benefit of this autocomplete feature?",
   "It helps you find and spell long or difficult words more quickly",
   [("It automatically defines every word you have ever searched for", "Autocomplete suggests spellings, not past definitions."),
    ("It replaces the need to read the definition once you find the word", "You still need to read the definition for meaning."),
    ("It only works for very short, simple words", "Autocomplete is especially useful for long or difficult words.")],
   "Autocomplete speeds up finding long or hard-to-spell words.",
   "Use autocomplete to save time looking up tricky spellings.")
mc("reference-materials", "L.6.4.c", 2,
   "A dictionary respelling shows “dic·tion·ar·y (DIK-shuh-ner-ee).” Which syllable receives the primary stress?",
   "DIK",
   [("shuh", "This syllable is unstressed."),
    ("ner", "This syllable is unstressed."),
    ("ee", "This final syllable is unstressed.")],
   "Capital letters in a respelling show the syllable with the primary stress.",
   "Look for the capitalized syllable to find the stressed part of a word.")
mc("reference-materials", "L.6.4.c", 3,
   "A dictionary shows “ob·ject (noun) OB-jekt: a thing; ob·ject (verb) ob-JEKT: to disagree.” Which pronunciation fits “Many parents object to the new school schedule”?",
   "ob-JEKT, because here “object” is used as a verb meaning to disagree",
   [("OB-jekt, because here “object” is used as a noun", "The sentence uses “object” as a verb, not as a thing."),
    ("Both pronunciations fit equally well here", "Only the verb pronunciation fits this sentence's meaning."),
    ("Neither pronunciation fits, since this must be a typo", "“Object” is a real word with two valid pronunciations depending on its part of speech.")],
   "Used as a verb meaning to disagree, “object” is pronounced ob-JEKT.",
   "Check the part of speech to choose the correct pronunciation.")

# ================================================================== figurative-language
grade(4)

mc("figurative-language", "RL.4.4", 1,
   "“The stars winked at us from the night sky.” Which type of figurative language is this, and why?",
   "Personification, because the stars are given the human action of winking.",
   [("Simile, because it compares two things using “like” or “as”", "There is no “like” or “as” in this sentence."),
    ("Hyperbole, because it is a wild exaggeration", "Winking stars is not presented as an impossible exaggeration here."),
    ("Idiom, because it is a common saying with a hidden meaning", "This is not a well-known saying; it's an original image.")],
   "Giving the stars the human action of winking is personification.",
   "Personification gives human actions or feelings to something non-human.")
mc("figurative-language", "RL.4.4", 2,
   "“Her tears fell like rain.” What does this simile help the reader understand?",
   "That she was crying heavily, with many tears falling",
   [("That it was raining outside while she cried", "The sentence compares her tears to rain; it does not say it was actually raining."),
    ("That her tears were cold like rain", "The comparison is about how many tears fell, not their temperature."),
    ("That she stopped crying suddenly", "“Fell like rain” suggests a lot of tears, not a sudden stop.")],
   "Comparing tears to rain shows that many tears fell steadily.",
   "In a simile, think about what quality the two things share.")
mc("figurative-language", "RL.4.4", 3,
   "“I asked a million questions before the test.” What does this hyperbole mean?",
   "She asked many questions, even though she did not ask exactly one million",
   [("She asked exactly one million questions", "Hyperbole is an exaggeration, not a literal count."),
    ("She was too shy to ask any questions", "The sentence says she did ask many questions."),
    ("She asked one short question", "“A million” signals far more than one question.")],
   "Hyperbole uses an obvious exaggeration to show that she asked a lot of questions.",
   "Hyperbole exaggerates to make a strong impression, not to state a fact.")
mc("figurative-language", "RL.4.4", 4,
   "“The classroom was a zoo during the fire drill.” What does this metaphor suggest?",
   "The classroom was noisy, chaotic, and hard to control",
   [("The classroom actually contained animals", "The sentence is a metaphor, not a literal statement."),
    ("The classroom was calm and orderly", "A zoo suggests the opposite: noise and disorder."),
    ("The classroom smelled bad", "The comparison is about behavior, not smell.")],
   "Comparing the classroom to a zoo suggests loud, chaotic behavior.",
   "A metaphor says one thing IS another to highlight a shared quality.")
mc("figurative-language", "RL.4.4", 5,
   "“The giant stood like a mountain over the village.” Which type of figurative language is this, and why?",
   "Simile, because it uses “like” to compare the giant to a mountain.",
   [("A metaphor, since one thing is called another thing directly", "The connecting word “like” is right there in the sentence, which rules out a direct, word-free comparison."),
    ("Personification, since a non-living thing acts human", "The giant is already alive and human-like; nothing lifeless is being given human behavior here."),
    ("Hyperbole, since the claim is wildly exaggerated", "Comparing a giant's size to a mountain is a believable comparison, not a wild exaggeration.")],
   "The word “like” signals a direct comparison between the giant and a mountain.",
   "Look for “like” or “as” to spot a simile.")
mc("figurative-language", "RL.4.4", 6,
   "“The old gate groaned as it opened.” What does this personification suggest?",
   "The gate made a loud, creaky sound, as if it were complaining",
   [("The gate opened silently and smoothly", "“Groaned” suggests a loud, unpleasant sound, not silence."),
    ("The gate was painted a dull gray color", "The sentence describes a sound, not a color."),
    ("The gate opened by itself without anyone touching it", "The sentence does not say how the gate was opened, only the sound it made.")],
   "Giving the gate a human sound like groaning suggests it made a loud, unpleasant creak.",
   "Personification gives human actions or feelings to objects or animals.")
mc("figurative-language", "RL.4.4", 7,
   "“The library was silent as a tomb, and the clock ticked like a patient heartbeat.” Which statement best explains how these two comparisons work together?",
   "Both comparisons build a picture of a still, hushed place where only a slow, steady sound can be heard",
   [("The first comparison shows noise, and the second shows silence, so they contradict each other", "Both comparisons actually describe stillness and quiet, not a contradiction."),
    ("Both comparisons suggest the library was crowded with people", "Neither comparison mentions people; they describe silence and a ticking sound."),
    ("The comparisons describe how fast time was passing", "The heartbeat comparison suggests steadiness, not speed.")],
   "Comparing the library to a tomb and the clock to a heartbeat both emphasize deep stillness broken only by one steady sound.",
   "When two comparisons appear together, look for what feeling or picture they build as a pair.")
tf("figurative-language", "RL.4.4", 1,
   "True or false: This sentence contains a simile: “The kite danced in the wind.”", False,
   "There is no “like” or “as” comparing the kite to something else; giving the kite the human action of dancing makes this personification, not a simile.",
   "A simile always uses “like” or “as” to compare two things.")
dd("figurative-language", "RL.4.4", 2,
   "Choose the best word to complete the simile: “The ice was as ____ as glass.”",
   "smooth", [("loud", "Glass is not known for being loud; this word does not fit the comparison."),
              ("happy", "Glass does not have feelings; this word does not fit the comparison."),
              ("heavy", "The comparison is about texture, not weight.")],
   "Glass is known for being smooth, so this word completes the simile's comparison.",
   "A good simile compares a quality the two things truly share.")

grade(5)

mc("figurative-language", "RL.5.4", 1,
   "“The news spread through the school like wildfire.” What does this simile show?",
   "That the news spread extremely quickly to many people",
   [("That the news was about an actual fire", "The sentence compares how fast news spread, not an actual fire."),
    ("That very few people heard the news", "Wildfire spreads to a large area quickly, suggesting many people heard it."),
    ("That the news was kept secret", "Spreading like wildfire means the opposite of staying secret.")],
   "Wildfire spreads fast and widely, so this simile shows the news reached many people quickly.",
   "Think about the well-known quality of the second thing in a simile.")
mc("figurative-language", "RL.5.4", 2,
   "“The wind argued with the trees all night.” Which type of figurative language is this, and why?",
   "Personification, because the wind is described doing the human action of arguing.",
   [("Simile, because it uses “like” or “as” to compare two things", "There is no “like” or “as” in this sentence."),
    ("Hyperbole, because it describes an impossible exaggeration", "Wind moving trees roughly is not presented as an impossible exaggeration here."),
    ("Idiom, because it is a well-known saying", "This is an original image, not a common saying.")],
   "Giving the wind the human action of arguing is personification.",
   "Personification gives human actions, thoughts, or feelings to something non-human.")
mc("figurative-language", "RL.5.4", 3,
   "“Her mind was a locked door when asked about the accident.” What does this metaphor suggest?",
   "She refused to share any information about the accident",
   [("She had forgotten everything about the accident", "A locked door suggests she is keeping information in, not that she forgot it."),
    ("She was eager to explain every detail of the accident", "A locked door suggests the opposite: she is not sharing details."),
    ("She had never heard about the accident", "The metaphor suggests she knows something but will not reveal it.")],
   "Comparing her mind to a locked door suggests she is deliberately keeping information from others.",
   "A metaphor replaces one thing with another to highlight a shared quality — here, being closed off.")
mc("figurative-language", "RL.5.4", 4,
   "“I could sleep for a hundred years after that race.” What does this hyperbole mean?",
   "She was extremely tired after the race",
   [("She actually planned to sleep for a hundred years", "Hyperbole is an obvious exaggeration, not a literal plan."),
    ("She felt too energized to sleep at all after the race", "“Could sleep for a hundred years” suggests extreme tiredness, not energy."),
    ("She finished the race in record time", "The sentence describes how tired she felt, not her race time.")],
   "The impossible exaggeration of sleeping for a hundred years shows how exhausted she felt.",
   "Hyperbole exaggerates far beyond reality to express a strong feeling.")
mc("figurative-language", "RL.5.4", 5,
   "“Her voice was a melody that calmed the whole room.” Which type of figurative language is this, and why?",
   "Metaphor, because her voice is directly called a melody without using “like” or “as.”",
   [("Simile, because it compares two things using “like” or “as”", "There is no “like” or “as” in this sentence."),
    ("Personification, because an object is given human traits", "A voice already belongs to a person; nothing non-human is given human traits here."),
    ("Hyperbole, because it describes an impossible exaggeration", "Calling a voice calming is not an extreme exaggeration.")],
   "Saying her voice IS a melody, without “like” or “as,” makes this a metaphor.",
   "A metaphor states that one thing is another thing.")
mc("figurative-language", "RL.5.4", 6,
   "“The old computer wheezed and groaned before finally starting.” What does this personification suggest?",
   "The computer made rough, labored sounds, as if it were struggling to start",
   [("The computer started instantly and silently", "“Wheezed and groaned” suggests slow, difficult, noisy starting, not silence."),
    ("The computer was brand new", "These sounds suggest an old, struggling machine, not a new one."),
    ("The computer played music when it started", "“Wheezed and groaned” describes rough mechanical sounds, not music.")],
   "Giving the computer human sounds like wheezing and groaning suggests it struggled to start, like an exhausted person.",
   "Personification can make a machine seem tired or unwell.")
mc("figurative-language", "RL.5.4", 7,
   "The author compares the approaching storm to “a wolf prowling closer every hour.” What does this comparison suggest about the storm?",
   "That the storm felt slow but threatening, like a predator stalking its prey",
   [("That the storm was moving away from the area", "“Prowling closer” means the storm was approaching, not leaving."),
    ("That the storm was harmless and gentle", "Comparing the storm to a wolf suggests danger, not gentleness."),
    ("That the storm arrived suddenly without warning", "“Closer every hour” suggests a slow, gradual approach, not a sudden one.")],
   "Comparing the storm to a prowling wolf suggests a slow, patient, and dangerous approach.",
   "Think about what qualities the comparison's second image usually has.")
tf("figurative-language", "RL.5.4", 1,
   "True or false: This sentence contains personification: “The shy moon peeked from behind the clouds.”", True,
   "Giving the moon the human qualities of shyness and peeking is personification.",
   "Personification gives human feelings or actions to something non-human.")
dd("figurative-language", "RL.5.4", 2,
   "Choose the best word to complete the simile: “The crowd roared as loud as ____.”",
   "thunder", [("a whisper", "A whisper is quiet, which does not match a roaring crowd."),
               ("a feather", "A feather is light and silent, which does not fit a loud comparison."),
               ("silence", "Silence is the opposite of loud and does not fit this simile.")],
   "Thunder is known for being extremely loud, which fits the roaring crowd.",
   "Pick a comparison word that is famous for the exact quality you need.")

grade(6)

mc("figurative-language", "RL.6.4", 1,
   "“Life is a winding road full of unexpected turns.” What does this metaphor mean?",
   "Life has many unpredictable changes and challenges along the way",
   [("Life is literally shaped like a road", "This is a metaphor, not a literal description of life's shape."),
    ("Life stays the same without any changes", "A winding road with turns suggests change and unpredictability, not sameness."),
    ("Life always follows a straight, easy path", "A winding road suggests twists and difficulty, not a straight, easy path.")],
   "Comparing life to a winding road highlights the unexpected changes and challenges people face.",
   "In an extended metaphor, think about what the whole comparison represents.")
mc("figurative-language", "RL.6.4", 2,
   "“Fear is a shadow that follows without a sound.” Which type of figurative language is this, and why?",
   "A metaphor, since the feeling fear is called a shadow outright.",
   [("A simile, since a connecting word sets up the comparison", "No connecting word such as “like” or “as” appears anywhere in this sentence."),
    ("Personification, since a lifeless thing is acting human", "Fear is an emotion, not an object, and it is being called a shadow rather than given human behavior."),
    ("Hyperbole, since the statement exaggerates wildly", "Describing fear as a silent presence is a comparison, not an over-the-top exaggeration.")],
   "Saying fear IS a shadow, without “like” or “as,” makes this a metaphor.",
   "A metaphor states directly that one thing is another.")
mc("figurative-language", "RL.6.4", 3,
   "“This backpack weighs a ton.” What does this hyperbole mean?",
   "The backpack feels extremely heavy, though it does not literally weigh a ton",
   [("The backpack actually weighs 2,000 pounds", "Hyperbole is an exaggeration, not a literal measurement."),
    ("The backpack is completely empty", "“Weighs a ton” suggests the backpack feels very heavy, not empty."),
    ("The backpack is a normal, light weight", "“A ton” is an exaggeration meant to show the backpack feels unusually heavy.")],
   "Saying the backpack weighs a ton is an obvious exaggeration to show how heavy it feels.",
   "Hyperbole uses impossible numbers or claims to stress a feeling.")
mc("figurative-language", "RL.6.4", 4,
   "“The city never sleeps, its lights blinking through the night.” What does this personification suggest?",
   "The city stays active and lively through the night, without truly stopping",
   [("The city is completely empty after dark", "“Never sleeps” suggests constant activity, not emptiness."),
    ("The city's lights turn off automatically at night", "Blinking lights suggest the city stays lit and active, not dark."),
    ("The city only has activity during the day", "“Never sleeps” specifically describes constant nighttime activity.")],
   "Giving the city the human trait of never sleeping suggests constant nighttime activity.",
   "Personification can describe a place as if it has human habits like sleeping.")
mc("figurative-language", "RL.6.4", 5,
   "“Her excuses dissolved like sugar in hot tea.” Which type of figurative language is this, and why?",
   "Simile, because it uses “like” to compare her excuses dissolving to sugar dissolving in tea.",
   [("Metaphor, because it states one thing is another without “like” or “as”", "This sentence uses the word “like,” which signals a simile, not a metaphor."),
    ("Personification, because an object is given human traits", "Excuses are not given a human action here; they are compared to a physical process."),
    ("Hyperbole, because it describes an impossible exaggeration", "Dissolving excuses is a comparison, not an extreme exaggeration.")],
   "The word “like” signals a direct comparison between her excuses disappearing and sugar dissolving.",
   "Look for “like” or “as” to spot a simile.")
mc("figurative-language", "RL.6.4", 6,
   "The author describes the old oak tree as “a silent witness to a hundred years of change.” What does this personification suggest about the tree?",
   "That the tree has stood through many years of history without being able to speak about what it has seen",
   [("That the tree can actually talk about the past", "“Silent witness” means the tree cannot speak, even though it has seen much."),
    ("That the tree is younger than it appears", "“A hundred years of change” suggests the tree is very old, not young."),
    ("That the tree has changed its own location many times", "The sentence describes change happening around the tree, not the tree moving.")],
   "Calling the tree a silent witness suggests it has observed a century of change without being able to tell anyone about it.",
   "Personification can suggest a long, quiet history for something non-human.")
mc("figurative-language", "RL.6.4", 7,
   "“The soldier's courage was a flame that no storm could extinguish, burning quietly even in the coldest nights.” Which statement best explains how the metaphor and the idea of persistence work together here?",
   "The flame metaphor shows that the soldier's courage stayed steady and strong no matter how difficult or discouraging things became",
   [("The flame metaphor shows that the soldier's courage eventually burned out completely", "The sentence says the flame could not be extinguished, meaning the courage did not burn out."),
    ("The storm represents the soldier's own doubts about fighting", "Based on this sentence alone, the storm represents outside hardship or danger, not the soldier's personal doubts."),
    ("The metaphor suggests the soldier's courage depended on warm weather", "“Coldest nights” shows the courage stayed strong despite harsh conditions, not because of warm weather.")],
   "Comparing courage to an unextinguishable flame burning through storms and cold nights emphasizes that it remained steady despite hardship.",
   "When a metaphor is extended with more details, each detail should strengthen the same main idea.")
tf("figurative-language", "RL.6.4", 1,
   "True or false: This sentence contains a hyperbole: “I nearly died of embarrassment when I tripped in the hallway.”", True,
   "Saying she “nearly died” of embarrassment is an obvious exaggeration, which is hyperbole.",
   "Hyperbole uses extreme, impossible language to express a strong feeling.")
dd("figurative-language", "RL.6.4", 2,
   "Choose the best word to complete the simile: “The debate became as tense as a ____ about to snap.”",
   "rubber band", [("feather", "A feather is light and relaxed, which does not fit a comparison about tension."),
                    ("pillow", "A pillow is soft and comfortable, which does not fit a comparison about tension."),
                    ("cloud", "A cloud is soft and floating, which does not match the image of something about to snap.")],
   "A rubber band stretched to its limit captures the feeling of extreme tension right before something breaks.",
   "Pick a comparison that is known for being able to “snap” under tension.")

# ================================================================== character-perspective
grade(4)

mc("character-perspective", "RL.4.6", 1,
   "Read: “Everyone cheered when the carnival came to town, but Yusuf stayed home because loud crowds made him anxious.” What is Yusuf's perspective on the carnival?",
   "He feels uneasy about crowded, noisy events, unlike most people.",
   [("He is excited to go to the carnival with his friends.", "The passage says he stayed home, not that he wanted to go."),
    ("He thinks the carnival is boring.", "The passage gives anxiety about crowds as the reason, not boredom."),
    ("He does not know the carnival is happening.", "He clearly knows about it, since he chose to stay home instead.")],
   "Yusuf's choice to stay home because of loud crowds shows he feels anxious in that situation, unlike everyone who cheered.",
   "Look at a character's actions and the reason given for them to find their perspective.")
tf("character-perspective", "RL.4.6", 2,
   "Read: “The teacher said the field trip was canceled due to rain, but Mariam smiled because she had forgotten her permission slip anyway.” True or false: Mariam is disappointed by the news like the rest of the class.", False,
   "Mariam smiled at the news, showing relief rather than disappointment, because she would not have been able to go anyway.",
   "Compare a character's reaction to what you would expect, to notice a different perspective.")
mc("character-perspective", "RL.4.6", 3,
   "Read: “Khalid thought the broken clock should be thrown away, but his sister Rania wanted to keep it on the shelf because their grandfather had given it to her.” How is Rania's perspective different from Khalid's?",
   "Rania values the clock for its connection to their grandfather, while Khalid only sees it as broken and useless.",
   [("Rania thinks the clock still works perfectly.", "The clock is described as broken; her reason for keeping it is sentimental, not that it works."),
    ("Khalid also wants to keep the clock for sentimental reasons.", "Khalid wants to throw it away, showing he does not share her sentimental view."),
    ("Rania does not know who gave her the clock.", "The passage says their grandfather gave it to her, so she does know.")],
   "Khalid judges the clock only by its condition, while Rania values its sentimental connection to their grandfather.",
   "Two characters can view the same object differently based on what it means to them.")
mc("character-perspective", "RL.4.6", 4,
   "Read: “Adham groaned when the coach announced extra practice, but Dina punched the air with excitement because she loved any chance to improve her serve.” What is Dina's perspective on the extra practice?",
   "She is excited about the extra practice because it gives her more time to improve a skill she cares about.",
   [("She is upset about having to miss her other plans.", "The passage shows excitement, not disappointment about lost plans."),
    ("She agrees with Adham that the extra practice is unwelcome.", "Dina's excited reaction is the opposite of Adham's groan."),
    ("She does not care about volleyball or her serve.", "The passage specifically says she loved chances to improve her serve.")],
   "Dina's excited reaction shows she values the extra chance to practice, unlike Adham.",
   "Contrasting reactions to the same event reveal different perspectives.")
mc("character-perspective", "RL.4.6", 5,
   "Read: “Zain's mother called the thunderstorm beautiful and powerful, but Zain hid under his blanket, convinced the loud booms meant something terrible was about to happen.” How do Zain and his mother see the thunderstorm differently?",
   "His mother admires the storm's power, while Zain feels frightened and expects something bad to happen.",
   [("Zain's mother is also frightened by the thunder.", "The passage says she calls it beautiful and powerful, showing admiration, not fear."),
    ("Zain thinks the storm is beautiful, just like his mother.", "Zain hides in fear, which is the opposite of admiring the storm."),
    ("Neither of them notices the thunderstorm happening.", "Both clearly notice and react strongly to the storm, just in different ways.")],
   "The mother's admiration contrasts with Zain's fear, showing two different perspectives on the same storm.",
   "Opposite feelings about the same event point to different perspectives.")
mc("character-perspective", "RL.4.6", 6,
   "A story about a lost puppy is told only from the puppy's owner's point of view. How would the story change if it were also told from the puppy's point of view?",
   "Readers would also learn what the puppy was thinking and feeling while it was lost, not just the owner's worry.",
   [("The story would no longer include the puppy at all.", "Adding the puppy's point of view would include more about the puppy, not remove it."),
    ("The events of the story would completely change.", "Adding a new point of view usually reveals more feelings and thoughts, not different events."),
    ("The owner's feelings would no longer matter to the story.", "The owner's point of view could still be included alongside the puppy's.")],
   "Adding another character's point of view adds their inner thoughts and feelings to the story, without erasing the original viewpoint.",
   "Think about what new feelings or thoughts a different point of view would reveal.")
mc("character-perspective", "RL.4.6", 7,
   "A class trip story is told only through Hassan's diary entries. How would readers' understanding of the trip change if Hassan's teacher's diary entries were added?",
   "Readers would see the trip from an adult's perspective too, which might reveal concerns or plans Hassan never noticed.",
   [("Readers would lose Hassan's original thoughts about the trip.", "Adding another diary does not have to erase Hassan's own entries."),
    ("The events of the trip itself would change.", "Adding a new perspective changes what readers understand, not the actual events that happened."),
    ("Readers would only learn the exact same information twice.", "A teacher would likely notice different things than a student, like schedules or responsibilities.")],
   "A second point of view, like the teacher's, often reveals thoughts, worries, or details the first narrator did not notice.",
   "A new point of view usually adds information the original narrator could not have known or noticed.")
mc("character-perspective", "RL.4.6", 1,
   "Read: “Everyone groaned when the museum guide announced a two-hour lecture, but Lina leaned forward eagerly, since she loved learning the history behind every object.” What is Lina's perspective on the lecture?",
   "She is eager and interested because she enjoys learning historical details.",
   [("She is bored and wants to leave early.", "The passage shows her leaning forward eagerly, not acting bored."),
    ("She agrees with everyone else that the lecture is too long.", "Her eager reaction is different from the group's groan."),
    ("She does not understand what the lecture is about.", "Her interest suggests she understands and enjoys the topic.")],
   "Lina's eager reaction shows she enjoys the historical details, unlike the rest of the group.",
   "Notice when a character's reaction is different from everyone else's.")
tf("character-perspective", "RL.4.6", 2,
   "Read: “Karim's older brother said moving to a new city would be a great adventure, but Karim cried in his room because he did not want to leave his friends behind.” True or false: Karim shares his brother's excited view of the move.", False,
   "Karim feels upset about leaving his friends, which is the opposite of his brother's excitement about an adventure.",
   "A character's actions, like crying, often reveal their true feelings.")
mc("character-perspective", "RL.4.6", 3,
   "Read: “Salma thought the old, dusty attic looked spooky and unwelcoming, but her cousin Nadia thought it looked like the perfect hideout for secret adventures.” How is Nadia's perspective different from Salma's?",
   "Nadia sees the attic as exciting and full of possibility, while Salma sees it as scary and unpleasant.",
   [("Nadia also finds the attic frightening.", "Nadia sees it as a perfect hideout, which shows excitement, not fear."),
    ("Salma thinks the attic would make a great hideout too.", "Salma's description as spooky and unwelcoming is the opposite of a fun hideout."),
    ("Neither girl has an opinion about the attic.", "Both girls clearly have strong, opposite opinions about the attic.")],
   "Nadia's excitement about secret adventures contrasts with Salma's fear of the spooky attic.",
   "The same place can seem very different depending on who is looking at it.")
mc("character-perspective", "RL.4.6", 4,
   "Read: “The coach called the tournament loss a disappointing result, but Hassan smiled, proud that his team had improved so much since the season began.” What is Hassan's perspective on the loss?",
   "He focuses on his team's improvement and feels proud, rather than only seeing the loss as disappointing.",
   [("He agrees completely with the coach that the result was only disappointing.", "Hassan's smile and pride show a different, more positive view than the coach's."),
    ("He is embarrassed that his team lost the tournament.", "The passage describes pride, not embarrassment."),
    ("He thinks the team did not improve at all this season.", "Hassan is specifically proud of how much the team improved.")],
   "Hassan sees the loss through the lens of his team's progress, giving him a more positive perspective than the coach's.",
   "A character can focus on a different part of the same event to form a different perspective.")
mc("character-perspective", "RL.4.6", 5,
   "Read: “Dina's father said the city's new noisy construction site was a sign of exciting progress, but Dina covered her ears and wished for the quiet park that used to be there.” How do Dina and her father see the construction site differently?",
   "Her father views it hopefully as progress, while Dina misses the quiet park and dislikes the noise.",
   [("Dina's father also dislikes the noise from the construction.", "The passage says he calls it a sign of exciting progress, showing a positive view."),
    ("Dina is excited about the new construction, just like her father.", "Dina covers her ears and wishes for the old park, showing she dislikes the change."),
    ("Neither of them has noticed the construction site yet.", "Both clearly notice and react to the construction site, just differently.")],
   "The father's hopeful view of progress contrasts with Dina's longing for the quiet park that used to be there.",
   "A change can feel like progress to one person and a loss to another.")

grade(5)

mc("character-perspective", "RL.5.6", 1,
   "Read: “Everyone congratulated Hana on winning the debate, but she quietly wondered if she had only won because her opponent seemed nervous.” What is Hana's perspective on her win?",
   "She feels uncertain about whether she truly deserved the win.",
   [("She feels completely confident that she won fairly.", "Her quiet wondering shows doubt, not full confidence."),
    ("She believes she definitely lost the debate.", "She is described as the winner; her doubt is about whether it was deserved, not about the outcome."),
    ("She is angry at her opponent for losing.", "The passage shows quiet doubt, not anger.")],
   "Hana's private doubt about her opponent's nervousness shows she questions whether her win was fully deserved.",
   "A character's private thoughts can reveal a different perspective than their public reaction.")
mc("character-perspective", "RL.5.6", 2,
   "Read: “The principal announced that uniforms would now be required, calling it a step toward fairness among students. Yusra argued it would only hide the real differences in students' lives outside school.” How does Yusra's perspective differ from the principal's?",
   "Yusra believes uniforms only mask inequality rather than truly solving it, unlike the principal's view of fairness.",
   [("Yusra agrees that uniforms create true fairness among students.", "Yusra argues the opposite: that uniforms only hide, not fix, differences."),
    ("The principal also doubts that uniforms will help.", "The principal calls it a step toward fairness, showing support, not doubt."),
    ("Yusra has no opinion about the new uniform policy.", "Yusra clearly argues a specific point about the policy.")],
   "Yusra sees the policy as a surface-level fix, while the principal sees it as a genuine step toward fairness.",
   "Look for the reasoning behind each character's opinion, not just whether they agree or disagree.")
mc("character-perspective", "RL.5.6", 3,
   "Read: “Samir's coach praised his aggressive playing style as determined, but Samir's teammate Lina thought it was reckless and put the team at risk.” How do Lina and the coach view Samir's playing style differently?",
   "The coach sees determination in his style, while Lina sees it as risky and careless.",
   [("Lina also admires Samir's playing style as determined.", "Lina views the style as reckless, which is a negative judgment, not admiration."),
    ("The coach also worries that Samir's style is too risky.", "The coach praises the style, showing approval rather than concern."),
    ("Neither of them has an opinion about how Samir plays.", "Both clearly have strong, opposing opinions about his playing style.")],
   "The same aggressive style is read as admirable determination by the coach and as careless risk by Lina.",
   "The same behavior can be judged very differently depending on a person's priorities.")
mc("character-perspective", "RL.5.6", 4,
   "Read: “Dina's grandmother spoke fondly of the old neighborhood before it was rebuilt, remembering the noisy markets and narrow streets. Dina, who had only seen photos, found the new wide avenues and modern shops far more appealing.” How is Dina's perspective different from her grandmother's?",
   "Dina appreciates the modern changes she has grown up with, while her grandmother misses the neighborhood's earlier character.",
   [("Dina also wishes the old noisy markets had never been replaced.", "Dina prefers the new avenues and shops, showing the opposite view."),
    ("Dina's grandmother prefers the new modern shops over the old markets.", "The grandmother speaks fondly of the old neighborhood, showing she prefers it."),
    ("Neither of them has any opinion about the neighborhood's changes.", "Both clearly have strong, different opinions about the changes.")],
   "Having only known the new neighborhood, Dina values its modern features, while her grandmother's memories make her miss what was lost.",
   "A person's own experience, even secondhand through photos or stories, shapes their perspective.")
mc("character-perspective", "RL.5.6", 5,
   "Read: “The scientist explained that the experiment's failure provided valuable data about what did not work, while the new intern saw only a wasted afternoon.” How do the scientist and the intern view the failed experiment differently?",
   "The scientist values the failure as useful information, while the intern sees it only as wasted time.",
   [("The intern also sees the failure as valuable information.", "The intern views it as a wasted afternoon, not as useful information."),
    ("The scientist agrees that the afternoon was wasted.", "The scientist specifically calls the data valuable, not a waste."),
    ("Neither of them reacts to the experiment's result.", "Both clearly react with a specific opinion about the result.")],
   "Experience lets the scientist see value in a failed result that the less experienced intern views only as lost time.",
   "A person's experience with a situation can shape whether they see a setback as useful or wasted.")
mc("character-perspective", "RL.5.6", 6,
   "A story about a difficult hiking trip is narrated only by the group's most experienced hiker. How might readers' understanding change if it were also narrated by the least experienced hiker in the group?",
   "Readers would also learn about struggles, fears, or doubts that the experienced hiker might not have noticed or felt as strongly.",
   [("The actual events of the hiking trip would be completely different.", "Adding a new narrator changes what readers understand and feel, not the actual events that happened."),
    ("Readers would lose all the details the experienced hiker already shared.", "Adding another narrator does not have to remove the first narrator's details."),
    ("Both narrators would notice and feel exactly the same things.", "Different levels of experience usually lead to different reactions and observations.")],
   "A less experienced narrator would likely notice difficulties and fears that a confident, experienced hiker might overlook.",
   "A character's background and experience shape what they notice and how they feel.")
mc("character-perspective", "RL.5.6", 7,
   "A historical event is described in a textbook mainly through the decisions of a king, with little mention of ordinary villagers. How would adding a villager's account change readers' understanding of the event?",
   "Readers would see how the king's decisions actually affected daily life for ordinary people, not just the decisions themselves.",
   [("The king's decisions would no longer be part of the story.", "Adding a villager's account adds a new perspective; it does not have to remove the king's decisions."),
    ("The historical facts of what happened would change completely.", "A new perspective changes understanding and emphasis, not the basic historical facts."),
    ("Readers would learn nothing new from the villager's account.", "A villager would likely reveal everyday effects and feelings the king's account leaves out.")],
   "A villager's account would reveal the everyday human impact of the king's decisions, adding depth the textbook's focus on the king alone misses.",
   "Whose perspective a text centers shapes which effects and feelings get mentioned.")
mc("character-perspective", "RL.5.6", 1,
   "Read: “Everyone at the party admired the tall, elaborate cake, but Reem, the baker's younger sister, only saw the uneven frosting she had tried and failed to smooth out.” What is Reem's perspective on the cake?",
   "She focuses critically on a flaw others do not notice, because she knows how it was made.",
   [("She thinks the cake looks perfect, just like everyone else.", "Reem specifically notices the uneven frosting, unlike the admiring guests."),
    ("She does not care about the cake at all.", "Her noticing the frosting flaw shows she does care, just critically."),
    ("She believes the cake is the ugliest one she has ever seen.", "The passage shows her noticing one flaw, not calling the whole cake ugly.")],
   "Knowing the effort and mistakes behind the cake, Reem notices a flaw that guests, who only see the finished result, miss entirely.",
   "Someone close to how something was made often notices different details than an outside observer.")
tf("character-perspective", "RL.5.6", 2,
   "Read: “The manager called the store's slow afternoon a chance to reorganize the shelves calmly, while the new cashier found the empty hours boring and worried about losing hours.” True or false: The manager and the cashier share the same positive view of the slow afternoon.", False,
   "The manager sees the slow afternoon positively as a chance to reorganize, while the cashier finds it boring and worries about losing work hours.",
   "Two people can experience the exact same situation with very different feelings.")
mc("character-perspective", "RL.5.6", 3,
   "Read: “Omar's father insisted that saving every spare coin was simply responsible, while Omar, saving for a new bicycle, felt it was an unbearably slow way to reach his goal.” How is Omar's perspective different from his father's?",
   "Omar feels impatient about the slow pace of saving, while his father views the same habit as simply being responsible.",
   [("Omar's father also feels impatient about saving slowly.", "The father calls it simply responsible, showing calm acceptance, not impatience."),
    ("Omar agrees that saving slowly is the responsible choice.", "Omar feels the pace is unbearably slow, showing frustration rather than agreement."),
    ("Neither of them has an opinion about saving money.", "Both clearly have strong opinions about the habit of saving.")],
   "Omar's goal-driven impatience contrasts with his father's calm view of saving as simply a responsible habit.",
   "A specific goal, like buying a bicycle, can change how someone feels about a general habit.")
mc("character-perspective", "RL.5.6", 4,
   "Read: “The travel writer described the crowded, chaotic market as full of vibrant energy and life, while a local shopkeeper, tired after a twelve-hour shift, only wished for a quiet moment to rest.” How do the travel writer and the shopkeeper see the market differently?",
   "The writer admires the market's energy as an outsider, while the exhausted shopkeeper longs for the quiet the writer does not need.",
   [("The shopkeeper also finds the market's energy exciting and refreshing.", "The shopkeeper is described as tired and wishing for quiet, not excited."),
    ("The travel writer also wishes the market were quieter.", "The writer describes the chaos positively as vibrant energy, not as something to escape."),
    ("Neither of them has a reaction to the market's atmosphere.", "Both clearly react strongly to the market, just in opposite ways.")],
   "A visitor experiencing the market briefly can enjoy its energy, while someone working there all day may simply feel exhausted by the same chaos.",
   "A short visit and a long workday can create very different perspectives on the same place.")
mc("character-perspective", "RL.5.6", 5,
   "Read: “The committee praised the new policy as a quick, efficient solution, but the employee who would have to follow it every day worried it ignored small but important details of daily work.” How do the committee and the employee view the new policy differently?",
   "The committee sees the policy as efficient overall, while the employee worries it overlooks details that matter in daily practice.",
   [("The employee also believes the policy is a perfect, efficient solution.", "The employee worries about overlooked details, showing concern rather than full approval."),
    ("The committee also worries about small daily details being ignored.", "The committee praises the policy as efficient, showing confidence rather than worry."),
    ("Neither group has formed an opinion about the new policy.", "Both groups clearly have specific, differing opinions about the policy.")],
   "Those who design a policy from a distance may focus on overall efficiency, while those who must carry it out daily notice details that could cause problems.",
   "People closer to the daily impact of a decision often notice different concerns than those who made it.")
