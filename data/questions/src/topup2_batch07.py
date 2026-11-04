"""
Question bank top-up 2, batch 07: brings these families to the full target of 50 items
each (original content, Grades 4-6): puns, combining-sentences, nouns, make-predictions,
theme.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== puns
grade(5)

mc("puns", "L.5.5", 1, 'Read the pun: "The baker almost closed his shop, but a new recipe finally brought in more dough." Which word creates the double meaning?',
   "dough", [("baker", "This word names the person, not the double meaning."), ("shop", "This word names the place, not the double meaning."), ("recipe", "This word names the instructions, not the double meaning.")],
   "“Dough” can mean bread dough or, informally, money, which is why the sentence is funny.", "A pun hides two meanings inside one word.")
mc("puns", "L.5.5", 1, 'Read the pun: "The river otter kept its savings at the bank, right on the river’s own bank." Which word creates the double meaning?',
   "bank", [("otter", "This word names the animal, not the double meaning."), ("savings", "This word only has one meaning here."), ("river", "This word only has one meaning here.")],
   "“Bank” can mean the edge of a river or a place to keep money.", "Look for the word that fits two different pictures.")
mc("puns", "L.5.5", 1, 'Read the pun: "The new puppy loved sitting under the old oak tree, barking at its own bark." Which word creates the double meaning?',
   "bark", [("puppy", "This word only has one meaning here."), ("tree", "This word only has one meaning here."), ("oak", "This word only has one meaning here.")],
   "“Bark” can mean the sound a dog makes or the covering of a tree trunk.", "Puns often hide a second meaning inside a common word.")
mc("puns", "L.5.5", 2, 'Read the pun: "The feather was so light that it floated straight up toward the light." Which word creates the double meaning?',
   "light", [("feather", "This word only has one meaning here."), ("floated", "This is a verb with only one meaning here."), ("straight", "This word only has one meaning here.")],
   "“Light” can mean not heavy or a glowing source of brightness.", "Ask yourself: does this word make sense in two different ways?")
mc("puns", "L.5.5", 2, 'Read the pun: "The scientist studied a single cell under the microscope while her phone’s cell signal kept dropping." Which word creates the double meaning?',
   "cell", [("scientist", "This word only has one meaning here."), ("microscope", "This word only has one meaning here."), ("signal", "This word only has one meaning here.")],
   "“Cell” can mean a tiny unit of a living thing or a mobile phone connection.", "A pun often uses a word that belongs to two very different topics.")
mc("puns", "L.5.5", 2, 'Read the pun: "The nurse told the patient to be patient while the test results came back." Which word creates the double meaning?',
   "patient", [("nurse", "This word only has one meaning here."), ("test", "This word only has one meaning here."), ("results", "This word only has one meaning here.")],
   "“Patient” can mean a person getting medical care or the quality of waiting calmly.", "The same spelling can act as a noun or an adjective in a pun.")
mc("puns", "L.5.5", 3, 'Read the pun: "The confused outfielder swung his bat at what turned out to be a bat flying over the field." Which word creates the double meaning?',
   "bat", [("outfielder", "This word only has one meaning here."), ("swung", "This is a verb with only one meaning here."), ("field", "This word only has one meaning here.")],
   "“Bat” can mean a piece of sports equipment or a flying nocturnal animal.", "Picture both meanings of the word to find the pun.")
mc("puns", "L.5.5", 3, 'Read the pun: "The pilot laughed when a fly landed on the windshield just as she prepared to fly the plane." Which word creates the double meaning?',
   "fly", [("pilot", "This word only has one meaning here."), ("windshield", "This word only has one meaning here."), ("plane", "This word only has one meaning here.")],
   "“Fly” can mean a small flying insect or to pilot an aircraft through the sky.", "Puns can switch a word between a noun and a verb.")
mc("puns", "L.5.5", 3, 'Read the pun: "The campers struck a match to start the fire before the soccer match began." Which word creates the double meaning?',
   "match", [("campers", "This word only has one meaning here."), ("fire", "This word only has one meaning here."), ("soccer", "This word only has one meaning here.")],
   "“Match” can mean a small stick used to start a fire or a sports game.", "The same word can belong to two completely different activities.")
mc("puns", "L.5.5", 3, 'Read the pun: "The elephant lifted the heavy trunk of the fallen tree with its own trunk." Which word creates the double meaning?',
   "trunk", [("elephant", "This word only has one meaning here."), ("fallen", "This word only has one meaning here."), ("heavy", "This word only has one meaning here.")],
   "“Trunk” can mean the thick stem of a tree or an elephant’s long nose.", "Think about which word names two very different body parts or objects.")
mc("puns", "L.5.5", 4, 'Read the pun: "The thirsty baseball pitcher filled his water pitcher after striking out the final batter." Which word creates the double meaning?',
   "pitcher", [("baseball", "This word only has one meaning here."), ("water", "This word only has one meaning here."), ("batter", "This word only has one meaning here.")],
   "“Pitcher” can mean the player who throws the ball or a container for liquid.", "The same word can name both a person and an object.")
mc("puns", "L.5.5", 4, 'Read the pun: "The mystery writer drew a garden plot in her backyard, and the plot of her new novel grew just as fast." Which word creates the double meaning?',
   "plot", [("writer", "This word only has one meaning here."), ("backyard", "This word only has one meaning here."), ("grew", "This word only has one meaning here.")],
   "“Plot” can mean a small area of ground or the events of a story.", "Writers love puns about words from their own craft.")
mc("puns", "L.5.5", 4, 'Read the pun: "Samir circled the date on his calendar for his first date at the new restaurant." Which word creates the double meaning?',
   "date", [("calendar", "This word only has one meaning here."), ("first", "This word only has one meaning here."), ("restaurant", "This word only has one meaning here.")],
   "“Date” can mean a day on the calendar or a planned outing with someone.", "Some puns depend on a word that names both a time and an event.")
mc("puns", "L.5.5", 4, 'Read the pun: "The duck’s long bill helped it scoop up fish while its owner worried about the vet bill." Which word creates the double meaning?',
   "bill", [("duck", "This word only has one meaning here."), ("fish", "This word only has one meaning here."), ("owner", "This word only has one meaning here.")],
   "“Bill” can mean a bird’s beak or a request for payment.", "Animals and money sometimes share the same pun word.")
mc("puns", "L.5.5", 5, 'Read the pun: "The boxer slipped the diamond ring into his pocket before stepping into the ring for the final round." Which word creates the double meaning?',
   "ring", [("boxer", "This word only has one meaning here."), ("diamond", "This word only has one meaning here."), ("pocket", "This word only has one meaning here.")],
   "“Ring” can mean a piece of jewelry or the roped area where boxers compete.", "Sports often give words a second, surprising meaning.")
mc("puns", "L.5.5", 5, 'Read the pun: "The pianist left a short note on the piano explaining why the last note sounded off." Which word creates the double meaning?',
   "note", [("pianist", "This word only has one meaning here."), ("piano", "This word only has one meaning here."), ("explaining", "This is a verb with only one meaning here.")],
   "“Note” can mean a short written message or a single musical sound.", "Music and writing sometimes share the exact same pun word.")
mc("puns", "L.5.5", 5, 'Read the pun: "The fisherman weighed the trout on a scale, admiring every silver scale on its skin." Which word creates the double meaning?',
   "scale", [("fisherman", "This word only has one meaning here."), ("trout", "This word only has one meaning here."), ("silver", "This word only has one meaning here.")],
   "“Scale” can mean a tool for weighing things or one of the small plates covering a fish.", "A single animal can hide two meanings of the same word.")
mc("puns", "L.5.5", 5, 'Read the pun: "The vet said the stray dog gained a pound after just one week at the animal pound." Which word creates the double meaning?',
   "pound", [("vet", "This word only has one meaning here."), ("stray", "This word only has one meaning here."), ("week", "This word only has one meaning here.")],
   "“Pound” can mean a unit of weight or a shelter where stray animals are kept.", "Sometimes the pun word is a unit of measurement with a second meaning.")
mc("puns", "L.5.5", 5, 'Read the pun: "The injured drummer wrapped a rubber band around his wrist before the band’s final song." Which word creates the double meaning?',
   "band", [("drummer", "This word only has one meaning here."), ("wrist", "This word only has one meaning here."), ("final", "This word only has one meaning here.")],
   "“Band” can mean a thin loop of material or a group of musicians.", "Music groups often inspire puns about their own name.")
mc("puns", "L.5.5", 5, 'Read the pun: "The traffic jam made Lina late for the cooking class where she planned to make strawberry jam." Which word creates the double meaning?',
   "jam", [("traffic", "This word only has one meaning here."), ("cooking", "This word only has one meaning here."), ("strawberry", "This word only has one meaning here.")],
   "“Jam” can mean cars stuck in a line or a sweet fruit spread.", "Food words make some of the easiest puns to spot.")
mc("puns", "L.5.5", 6, 'Read the pun: "The committee decided to table the new rule and set it right on the kitchen table until next week." Which word creates the double meaning?',
   "table", [("committee", "This word only has one meaning here."), ("rule", "This word only has one meaning here."), ("kitchen", "This word only has one meaning here.")],
   "“Table” can mean to delay a decision or a piece of furniture.", "A pun can even turn a noun into a verb.")
mc("puns", "L.5.5", 6, 'Read the pun: "The locksmith said the key point of his speech was how to cut the perfect key." Which word creates the double meaning?',
   "key", [("locksmith", "This word only has one meaning here."), ("speech", "This word only has one meaning here."), ("perfect", "This word only has one meaning here.")],
   "“Key” can mean something important or a metal tool that opens a lock.", "The word “key” is a favorite for puns about importance.")
mc("puns", "L.5.5", 6, 'Read the pun: "The church’s heart doctor explained that the heart is an organ just before the church organ began to play." Which word creates the double meaning?',
   "organ", [("doctor", "This word only has one meaning here."), ("explained", "This is a verb with only one meaning here."), ("church", "This word only has one meaning here.")],
   "“Organ” can mean a body part or a large musical instrument.", "Science and music sometimes share the same pun word.")
mc("puns", "L.5.5", 6, 'Read the pun: "The director chose the perfect cast for the play the same week the actor got a cast for his broken arm." Which word creates the double meaning?',
   "cast", [("director", "This word only has one meaning here."), ("play", "This word only has one meaning here."), ("broken", "This word only has one meaning here.")],
   "“Cast” can mean the group of actors in a show or a hard covering for a broken bone.", "Theater words often double as medical words in a pun.")
mc("puns", "L.5.5", 6, 'Read the pun: "The shop owner placed the new scale on the counter right after deciding to counter her rival’s lower prices." Which word creates the double meaning?',
   "counter", [("shop", "This word only has one meaning here."), ("rival", "This word only has one meaning here."), ("prices", "This word only has one meaning here.")],
   "“Counter” can mean a flat surface in a store or to respond against something.", "A pun can hide a verb and a noun inside the same spelling.")
mc("puns", "L.5.5", 7, 'Read the pun: "The senator’s new draft of the law arrived the same day a cold draft blew through the office window." Which word creates the double meaning?',
   "draft", [("senator", "This word only has one meaning here."), ("office", "This word only has one meaning here."), ("window", "This word only has one meaning here.")],
   "“Draft” can mean an early written version or a current of air.", "Government and weather words rarely share a pun, but this one does.")
mc("puns", "L.5.5", 7, 'Read the pun: "The salesman’s pitch was so smooth that the crowd barely noticed the pitch of his voice rising with excitement." Which word creates the double meaning?',
   "pitch", [("salesman", "This word only has one meaning here."), ("crowd", "This word only has one meaning here."), ("excitement", "This word only has one meaning here.")],
   "“Pitch” can mean a persuasive talk or the highness and lowness of a sound.", "Advanced puns often use a word with three or more real meanings.")
mc("puns", "L.5.5", 7, 'Read the pun: "The restaurant served tender steak alongside a sign explaining that cash was the only legal tender accepted." Which word creates the double meaning?',
   "tender", [("restaurant", "This word only has one meaning here."), ("steak", "This word only has one meaning here."), ("cash", "This word only has one meaning here.")],
   "“Tender” can mean soft and easy to chew or an accepted form of payment.", "Legal and cooking vocabulary can sometimes share the same pun word.")
mc("puns", "L.5.5", 7, 'Read the pun: "The lifeguard gave a friendly wave just before warning swimmers about the enormous wave rolling in." Which word creates the double meaning?',
   "wave", [("lifeguard", "This word only has one meaning here."), ("swimmers", "This word only has one meaning here."), ("warning", "This word only has one meaning here.")],
   "“Wave” can mean a hand gesture or a moving ridge of ocean water.", "Beach scenes are a classic setting for this kind of pun.")

mc("puns", "L.5.5", 5, 'Read the sentence: "The hiker rested her tired palm against the trunk of a palm tree." Why is this sentence a pun?',
   "“Palm” names both the inside of the hand and a kind of tree.",
   [("It uses two words that rhyme with each other.", "The humor comes from one word’s two meanings, not from rhyme."), ("It repeats the exact same sentence twice.", "The sentence is not repeated; one word carries two meanings instead."), ("It compares the hiker to a tree using the word “like.”", "There is no “like” or “as” comparison here, so it is not a simile.")],
   "“Palm” refers to part of the hand and also to a type of tree, so the sentence plays on both meanings at once.",
   "A pun usually hides two meanings inside just one word.")
mc("puns", "L.5.5", 6, 'Read the sentence: "Before giving her speech, the nervous speaker had to stem the shaking in her voice while standing near the flower’s stem." Why is this sentence a pun?',
   "“Stem” means both to stop or control something and the stalk of a plant.",
   [("It describes two different flowers in the same garden.", "There is only one flower mentioned; the humor is about the word “stem,” not the setting."), ("It uses alliteration with words that start the same way.", "The repeated sound of “s” is not what creates the humor here; the double meaning of “stem” is."), ("It gives the speaker two separate names.", "The speaker is only named once; the pun comes from the shared word “stem.”")],
   "“Stem” can mean to hold something back and also the stalk that supports a flower, so the sentence uses both meanings.",
   "When one word fits two completely different pictures, look for the pun there.")
mc("puns", "L.5.5", 6, 'Read the sentence: "The construction crew used a tall crane to lift the beam while a real crane, the bird, watched quietly from the fence." Why is this sentence a pun?',
   "“Crane” names both the lifting machine and the long-legged bird.",
   [("It describes the bird helping build the fence.", "The bird only watches; it does not help with construction, so this is not the joke."), ("It uses a metaphor comparing the machine to a bird.", "The sentence does not say the machine IS a bird; it simply uses the shared word “crane” for two real things."), ("It shows the crew arguing about which crane to use.", "There is no argument in the sentence; the humor comes from the shared word.")],
   "“Crane” is the name of both a heavy lifting machine and a tall wading bird, which creates the pun.",
   "Machines and animals sometimes share surprising names.")
mc("puns", "L.5.5", 7, 'Read the sentence: "The treaty needed an official seal of approval before the zoo’s newest seal could be named after it." Why is this sentence a pun?',
   "“Seal” means both an official stamp of approval and the ocean animal.",
   [("It describes a zoo that only keeps seals.", "The zoo likely has other animals too; this detail is not the source of the humor."), ("It compares a treaty to an animal using “like” or “as.”", "There is no direct comparison word like “like” or “as”; this is wordplay, not a simile."), ("It repeats the word “treaty” for emphasis.", "The word “treaty” is not repeated; the pun depends on the word “seal” instead.")],
   "“Seal” can mean an official stamp used to approve documents and also a flippered sea animal.",
   "Official and animal words rarely cross paths, which is exactly what makes this pun surprising.")

mc("puns", "L.5.5", 2, 'Read the pun: "The shoemaker said the sole purpose of a good sole is to protect your feet." Which word creates the double meaning?',
   "sole", [("shoemaker", "This word only has one meaning here."), ("purpose", "This word only has one meaning here."), ("protect", "This is a verb with only one meaning here.")],
   "“Sole” can mean the only one or the bottom part of a shoe.", "A single word can describe both an idea and an object.")
mc("puns", "L.5.5", 3, 'Read the pun: "After the long winter, the old mattress’s spring finally popped just as spring arrived." Which word creates the double meaning?',
   "spring", [("winter", "This word only has one meaning here."), ("mattress", "This word only has one meaning here."), ("popped", "This is a verb with only one meaning here.")],
   "“Spring” can mean a coil inside a mattress or the season that comes after winter.", "Seasons sometimes share their name with an everyday object.")
mc("puns", "L.5.5", 3, 'Read the pun: "The electrician said the river’s current reminded him of the electrical current he fixes every day." Which word creates the double meaning?',
   "current", [("electrician", "This word only has one meaning here."), ("river", "This word only has one meaning here."), ("fixes", "This is a verb with only one meaning here.")],
   "“Current” can mean the flow of a river or the flow of electricity.", "Nature and technology sometimes borrow the very same word.")
mc("puns", "L.5.5", 4, 'Read the pun: "Her idea for recycling old tires into playground swings was so novel that she wrote a novel about it." Which word creates the double meaning?',
   "novel", [("idea", "This word only has one meaning here."), ("recycling", "This word only has one meaning here."), ("playground", "This word only has one meaning here.")],
   "“Novel” can mean new and original or a long written story.", "The same word can describe an idea and a kind of book.")
mc("puns", "L.5.5", 2, 'Read the pun: "The contractor measured exactly one yard of fabric to repair the fence around the back yard." Which word creates the double meaning?',
   "yard", [("contractor", "This word only has one meaning here."), ("fabric", "This word only has one meaning here."), ("fence", "This word only has one meaning here.")],
   "“Yard” can mean a unit of length or an outdoor area next to a house.", "A measuring word can sometimes double as the name of a place.")
tf("puns", "L.5.5", 3, 'In the sentence "The sculptor chopped the wooden block before walking around the block to clear her head," the pun is created by the word "block," which means both a piece of wood and a section of a street.', True,
   "“Block” does carry two meanings here: a solid chunk of material and a city block, which is exactly what makes the sentence a pun.", "If a single word fits two very different pictures in one sentence, it is likely a pun.")
tf("puns", "L.5.5", 4, 'In the sentence "The frightened rabbit decided to bolt the moment the loose bolt fell from the fence," the word "bolt" is NOT a pun because it only has one meaning there.', False,
   "“Bolt” actually has two meanings here: to run away suddenly and a metal fastener, which does make it a pun.", "Before deciding a word is not a pun, check whether it could mean two different things.")
tf("puns", "L.5.5", 4, 'The sentence "The carpenter tried not to chip the wood while eating a chip during his break" uses the word "chip" as a pun.', True,
   "“Chip” means both to accidentally break off a small piece and a crispy snack food, so this is a true pun.", "Food words are a common source of puns in everyday sentences.")
tf("puns", "L.5.5", 5, 'In the sentence "The sisters started a row about who should row the boat first," the word "row" is a pun because it means both an argument and to paddle a boat.', True,
   "“Row” can mean a noisy disagreement or the act of paddling, so the sentence does use it as a pun.", "Say the sentence slowly and listen for a word that could mean two different things.")
tf("puns", "L.5.5", 2, 'The sentence "Grandfather lowered the bucket into the well and said he felt well again" is NOT a pun.', False,
   "This sentence actually IS a pun, because “well” means both a water source and feeling healthy.", "Read closely: a sentence can look plain but still hide a pun inside one repeated word.")

match("puns", "L.5.5", 7, "Match each word to the TWO meanings it has in these puns.",
      [("grill", "a device for cooking food AND to question someone closely"),
       ("iron", "a metal AND an appliance used for pressing clothes"),
       ("tank", "a military vehicle AND to perform very badly"),
       ("mole", "a small burrowing animal AND a spy working in secret")],
      "Each of these words has two very different meanings, which is exactly what makes a pun work.",
      "Puns often rely on a word that could belong to two completely unrelated topics.")

# ================================================================== combining-sentences
grade(4)

mc("combining-sentences", "L.4.3", 1, 'Combine the sentences: "Lina has a bicycle. Lina has a scooter."',
   "Lina has a bicycle and a scooter.",
   [("Lina has a bicycle, Lina has a scooter.", "Two complete sentences cannot be joined with only a comma."), ("Lina has a bicycle but a scooter.", "“But” signals a contrast, but these two things are not opposites."), ("Lina a bicycle and a scooter has.", "The verb “has” must stay right after the subject.")],
   "Combining the shared subject with “and” joins the two things Lina owns into one smooth sentence.", "When two sentences share a subject, join the different objects with “and.”")
mc("combining-sentences", "L.4.3", 1, 'Combine the sentences: "The sun was hot. The sun was bright."',
   "The sun was hot and bright.",
   [("The sun was hot, the sun was bright.", "Two complete sentences cannot be joined with only a comma."), ("The sun was hot so bright.", "“So” does not correctly link two describing words this way."), ("Hot the sun was and bright.", "This word order is confusing and not a natural sentence.")],
   "Since both sentences describe the same subject, the two adjectives can be joined with “and.”", "Look for the word that repeats, then combine what is left with “and,” “but,” or “or.”")
mc("combining-sentences", "L.4.3", 2, 'Combine the sentences using a compound subject: "Omar plays football. Sami plays football."',
   "Omar and Sami play football.",
   [("Omar plays football and Sami plays football and.", "This repeats information and ends awkwardly."), ("Omar and Sami plays football.", "A compound subject joined by “and” needs the plural verb “play.”"), ("Omar plays football, Sami too.", "This uses a comma incorrectly to join two separate ideas.")],
   "Since both boys do the same action, their names can be joined with “and” to make one compound subject.", "Two subjects doing the same thing can share one verb.")
mc("combining-sentences", "L.4.3", 2, 'Combine the sentences using "but": "Mona wanted pizza. Mona ordered pasta instead."',
   "Mona wanted pizza, but she ordered pasta instead.",
   [("Mona wanted pizza and she ordered pasta instead.", "“And” does not show the contrast between wanting one thing and getting another."), ("Mona wanted pizza she ordered pasta instead.", "Without a comma and conjunction, this is a run-on sentence."), ("Mona wanted pizza, but pasta instead ordered she.", "This word order is not a correct sentence.")],
   "“But” shows the contrast between what Mona wanted and what actually happened.", "Use “but” when the second idea surprises or contrasts with the first.")
tf("combining-sentences", "L.4.3", 2, '"Omar fixed the leaky faucet. Omar repainted the fence that same weekend." can be combined as "Omar fixed the leaky faucet and repainted the fence that same weekend."', True,
   "Since both sentences share the subject “Omar,” the two verb phrases can be joined with “and” without repeating his name.", "When the subject repeats, you often only need to combine the verbs.")
mc("combining-sentences", "L.4.3", 3, 'Combine the sentences using an appositive: "Dr. Faris is our dentist. Dr. Faris lives on Elm Street."',
   "Dr. Faris, our dentist, lives on Elm Street.",
   [("Dr. Faris our dentist lives on Elm Street.", "Without commas, the appositive is confusing to read."), ("Dr. Faris lives on Elm Street, our dentist.", "The appositive should sit right next to the name it renames."), ("Our dentist Dr. Faris, lives on Elm Street.", "A comma is missing before the name to properly set off the appositive.")],
   "“Our dentist” renames Dr. Faris, so it can be tucked next to his name between commas.", "An appositive is a renaming phrase set off by commas right after the noun it describes.")
mc("combining-sentences", "L.4.3", 3, 'Combine the sentences using a relative clause: "The boy won the race. The boy trains every morning."',
   "The boy who trains every morning won the race.",
   [("The boy won the race who trains every morning.", "The relative clause should follow “boy” directly, not come after “race.”"), ("The boy, trains every morning, won the race.", "A comma alone cannot replace the relative pronoun “who.”"), ("The boy won the race and trains every morning.", "“And” does not show that training is a fact about the boy, not a second event.")],
   "“Who trains every morning” is a relative clause that describes the boy right where his name appears.", "Relative clauses with “who” or “which” go directly after the noun they describe.")
err("combining-sentences", "L.4.3", 4, ["The twins baked cookies", " they", " shared them with the neighbors."], 1, " and they",
    "Two complete sentences joined only by a comma need a conjunction like “and” to combine them correctly.", "If you can swap the comma for a period, you likely need “and,” “but,” or “or” instead.")
mc("combining-sentences", "L.4.3", 4, 'Combine the sentences using a participial phrase: "Huda finished her homework. She went outside to play."',
   "Having finished her homework, Huda went outside to play.",
   [("Finished her homework, Huda went outside to play.", "The phrase needs “Having” to clearly show the homework was completed first."), ("Huda finished her homework went outside to play.", "This is missing a comma and reads as a run-on."), ("Having finished her homework Huda, went outside to play.", "The comma is placed in the wrong spot in this sentence.")],
   "“Having finished her homework” shows the first action was completed before the second one began.", "A participial phrase starting with “Having” shows one action happened before another.")
mc("combining-sentences", "L.4.3", 4, 'Combine the sentences using "or": "You can have juice. You can have milk."',
   "You can have juice or milk.",
   [("You can have juice and milk.", "“And” suggests both at once, but the original sentences present a choice."), ("You can have juice, you can have milk.", "A comma alone cannot join these two complete sentences."), ("You can have, juice or milk.", "The comma is placed in the wrong spot in this sentence.")],
   "“Or” shows that juice and milk are two choices, not two things happening together.", "Use “or” when the sentences describe a choice between options.")
mc("combining-sentences", "L.4.3", 5, 'Combine the sentences using a relative clause: "The library added a reading room. The reading room is very quiet."',
   "The library added a reading room, which is very quiet.",
   [("The library added a reading room it is very quiet.", "This is a run-on with no conjunction or relative pronoun."), ("The library, which is very quiet, added a reading room.", "The clause “which is very quiet” describes the room, not the library."), ("The library added a reading room very quiet which is.", "This word order is not a correct sentence.")],
   "“Which is very quiet” describes the reading room, so it belongs right after that phrase.", "Place a “which” clause directly after the noun it describes.")
mc("combining-sentences", "L.4.3", 5, 'Which is the BEST combined sentence? "The puppy barked. The puppy wagged its tail. The puppy ran to the door."',
   "The puppy barked, wagged its tail, and ran to the door.",
   [("The puppy barked and the puppy wagged its tail and the puppy ran to the door.", "Repeating “the puppy” three times is wordy and not the smoothest combination."), ("The puppy barked, it wagged its tail, it ran to the door.", "Using commas alone without “and” before the last item creates a run-on."), ("The puppy barked wagged its tail and ran to the door.", "A comma is missing after “barked” in this list of three actions.")],
   "When one subject does three actions, list the verbs in a series separated by commas, with “and” before the last one.", "A series of three actions by the same subject uses commas and one final “and.”")
mc("combining-sentences", "L.4.3", 5, 'Combine the sentences using "because": "Rami stayed inside. It was raining heavily."',
   "Rami stayed inside because it was raining heavily.",
   [("Rami stayed inside, it was raining heavily.", "A comma alone cannot join these two ideas without a connecting word."), ("Because Rami stayed inside, it was raining heavily.", "This reverses the cause and the effect of the original sentences."), ("Rami stayed inside it was raining heavily because.", "This word order is confusing and not a natural sentence.")],
   "“Because” connects the effect (staying inside) to its cause (the heavy rain).", "Put the reason after “because” to explain why something happened.")
tf("combining-sentences", "L.4.3", 3, '"Sara draws. Sara paints." can be combined as "Sara draws and paints."', True,
   "Since both sentences share the subject “Sara,” the two verbs can be joined with “and” without repeating her name.", "A shared subject often lets you combine just the verbs.")
mc("combining-sentences", "L.4.3", 6, 'Which is the BEST way to combine these sentences with a semicolon? "The movie started late. The popcorn was already gone."',
   "The movie started late; the popcorn was already gone.",
   [("The movie started late, the popcorn was already gone.", "A comma alone cannot join two complete sentences; this is a comma splice."), ("The movie started late; but the popcorn was already gone.", "A semicolon should not be followed by “but”; choose one or the other."), ("The movie started late the popcorn was already gone;", "The semicolon is placed in the wrong spot and the sentence runs together before it.")],
   "A semicolon can join two closely related complete sentences without using “and” or “but.”", "A semicolon works like a soft period between two related complete thoughts.")
err("combining-sentences", "L.4.3", 5, ["Noura studies hard", " she", " always passes her tests."], 1, " and she",
    "Two complete sentences joined only by a comma need a conjunction like “and” to combine them correctly.", "Check for a missing “and,” “but,” or “or” wherever a comma joins two full sentences.")
mc("combining-sentences", "L.4.3", 6, 'Combine the sentences using a compound predicate: "The eagle soared above the cliff. The eagle searched for fish."',
   "The eagle soared above the cliff and searched for fish.",
   [("The eagle soared above the cliff, the eagle searched for fish.", "A comma alone cannot join these two actions by the same subject."), ("The eagle soared above the cliff and the eagle searched for fish.", "Repeating “the eagle” is unnecessary since the subject did not change."), ("The eagle soared above the cliff searched for fish.", "A conjunction such as “and” is missing between the two actions.")],
   "Since the eagle performs both actions, the verbs can be joined with “and” without repeating the subject.", "A compound predicate lets one subject share two verbs joined by “and.”")
mc("combining-sentences", "L.4.3", 7, 'Which is the BEST combined sentence? "Captain Youssef leads the ship. Captain Youssef has sailed for twenty years. He knows every reef nearby."',
   "Captain Youssef, who has sailed for twenty years, knows every reef nearby.",
   [("Captain Youssef leads the ship and has sailed for twenty years and knows every reef nearby.", "Stringing three ideas together with “and” repeatedly makes the sentence choppy and unclear."), ("Captain Youssef leads the ship, he has sailed for twenty years, he knows every reef nearby.", "Joining three complete sentences with commas alone creates a run-on."), ("Who has sailed for twenty years, Captain Youssef knows every reef nearby and leads the ship.", "Starting with “who” this way creates a confusing and incorrect sentence.")],
   "The relative clause “who has sailed for twenty years” smoothly adds detail about Captain Youssef within the main idea.", "A relative clause can tuck extra information into the middle of a sentence.")
mc("combining-sentences", "L.4.3", 7, 'Which is the BEST combined sentence? "The bridge was old. Engineers repaired the bridge. The bridge reopened to traffic."',
   "After engineers repaired the old bridge, it reopened to traffic.",
   [("The bridge was old and engineers repaired it and it reopened to traffic.", "Repeating “and” three times makes the sentence feel choppy instead of smooth."), ("The bridge was old, engineers repaired the bridge, the bridge reopened to traffic.", "Joining three complete sentences with only commas creates a run-on."), ("Engineers repaired the old bridge it reopened to traffic.", "A conjunction or proper punctuation is missing between the two main ideas.")],
   "Starting with “After” shows the order of events and smoothly combines all three ideas into one clear sentence.", "A time word like “after” or “before” can combine several related events in order.")

grade(5)

mc("combining-sentences", "L.5.3", 2, 'Combine the sentences using "although": "Ali practiced every day. Ali did not win the match."',
   "Although Ali practiced every day, he did not win the match.",
   [("Ali practiced every day, he did not win the match.", "A comma alone cannot join these two complete sentences without a connecting word."), ("Ali practiced every day although he did not win the match.", "Starting with “although” is also correct, but this version lacks the needed comma before “although.”"), ("Although Ali did not win the match, he practiced every day.", "This reverses which idea is the main contrast being pointed out.")],
   "“Although” signals a contrast between Ali’s effort and the outcome of the match.", "Use “although” to join an idea with an unexpected result.")
mc("combining-sentences", "L.5.3", 2, 'Combine the sentences using an appositive: "Mrs. Nabil teaches chemistry. Mrs. Nabil won an award last year."',
   "Mrs. Nabil, who won an award last year, teaches chemistry.",
   [("Mrs. Nabil teaches chemistry, who won an award last year.", "The relative clause should sit right next to the name it describes, not at the end."), ("Mrs. Nabil won an award last year teaches chemistry.", "This sentence is missing the comma and relative pronoun needed to combine the ideas."), ("Who won an award last year, Mrs. Nabil teaches chemistry.", "Starting the sentence this way creates an awkward, incorrect structure.")],
   "The clause “who won an award last year” adds extra detail right where Mrs. Nabil is introduced.", "A descriptive clause usually follows immediately after the noun it describes.")
mc("combining-sentences", "L.5.3", 3, 'Combine the sentences using "since": "The ferry was delayed. The tide was too low."',
   "The ferry was delayed since the tide was too low.",
   [("The ferry was delayed, the tide was too low.", "A comma alone cannot join these two complete ideas."), ("Since the ferry was delayed, the tide was too low.", "This reverses the cause and effect: the low tide caused the delay, not the other way around."), ("The ferry was delayed the tide too low since.", "This word order does not form a correct sentence.")],
   "“Since” introduces the reason the ferry was delayed: the tide being too low.", "“Since” can mean “because” when it introduces a reason.")
tf("combining-sentences", "L.5.3", 2, '"The chef seasoned the soup. The chef tasted the soup." can be combined as "The chef seasoned and tasted the soup."', True,
   "Since both sentences share the subject “the chef,” the two actions can be joined with “and” without repeating the subject.", "A shared subject often lets you combine just the verbs with “and.”")
mc("combining-sentences", "L.5.3", 3, 'Combine the sentences using a participial phrase: "The hikers reached the summit. They had climbed for six hours."',
   "Having climbed for six hours, the hikers reached the summit.",
   [("Climbed for six hours, the hikers reached the summit.", "The phrase needs “Having” to clearly show the climbing happened first."), ("The hikers reached the summit climbed for six hours.", "This sentence is missing the comma and proper phrase structure."), ("Having climbed for six hours the hikers, reached the summit.", "The comma is placed in the wrong spot in this sentence.")],
   "“Having climbed for six hours” shows the climbing was completed before they reached the top.", "A participial phrase with “Having” shows one action finished before another began.")
mc("combining-sentences", "L.5.3", 4, 'Which is the BEST combined sentence? "The robot rolled forward. The robot scanned the room. The robot reported no danger."',
   "The robot rolled forward, scanned the room, and reported no danger.",
   [("The robot rolled forward and the robot scanned the room and reported no danger.", "Repeating “the robot” and “and” twice makes the sentence feel clunky."), ("The robot rolled forward, it scanned the room, it reported no danger.", "Joining three actions with commas alone and no final “and” creates a run-on."), ("The robot rolled forward scanned the room and reported no danger.", "A comma is missing after “forward” in this list of three actions.")],
   "Listing the three actions in a series with commas and a final “and” makes the sentence clear and smooth.", "A series of actions by one subject needs commas between items and “and” before the last one.")
mc("combining-sentences", "L.5.3", 4, 'Combine the sentences using "however" and a semicolon: "The forecast predicted rain. The festival continued as planned."',
   "The forecast predicted rain; however, the festival continued as planned.",
   [("The forecast predicted rain, however, the festival continued as planned.", "A comma alone before “however” is too weak to join two complete sentences; a semicolon is needed."), ("The forecast predicted rain however the festival continued as planned.", "Without any punctuation around “however,” this reads as a run-on."), ("However, the forecast predicted rain; the festival continued as planned.", "Moving “however” to the front changes which idea the contrast word is attached to.")],
   "A semicolon plus “however” shows the contrast between the rainy forecast and the festival going on anyway.", "Use a semicolon before “however” when joining two full sentences with a contrast.")
err("combining-sentences", "L.5.3", 4, ["The scientists collected samples", " they", " analyzed them back at the lab."], 1, " and they",
    "Two complete sentences joined only by a comma need a conjunction such as “and” to combine them correctly.", "A comma between two full sentences without “and,” “but,” or “or” is a comma splice.")
mc("combining-sentences", "L.5.3", 5, 'Combine the sentences using "whose": "The author visited our school. The author’s new book just won an award."',
   "The author whose new book just won an award visited our school.",
   [("The author visited our school whose new book just won an award.", "The “whose” clause should follow “author” directly, not come at the end."), ("The author, the new book just won an award, visited our school.", "A comma alone cannot replace the relative pronoun “whose.”"), ("Whose new book just won an award, the author visited our school.", "Starting the sentence this way creates an awkward, unclear structure.")],
   "“Whose new book just won an award” describes the author and fits right after that word.", "“Whose” introduces a clause that shows ownership and describes the noun right before it.")
mc("combining-sentences", "L.5.3", 5, 'Combine the sentences using "while": "Noor read quietly. Her brother practiced the drums loudly."',
   "While her brother practiced the drums loudly, Noor read quietly.",
   [("Noor read quietly, her brother practiced the drums loudly.", "A comma alone cannot join these two complete ideas."), ("Noor read quietly while her brother practiced the drums loudly her.", "This sentence has an extra word and does not read correctly."), ("Her brother practiced the drums loudly while, Noor read quietly.", "The comma is placed in the wrong spot in this sentence.")],
   "“While” shows that both actions were happening at the same time.", "“While” joins two actions that happen at the same time.")
tf("combining-sentences", "L.5.3", 4, '"The twins trained for months. The twins qualified for the finals." can be combined as "After training for months, the twins qualified for the finals."', True,
   "The phrase “After training for months” shows the training happened before they qualified, which correctly combines both ideas.", "A time phrase like “after” can show the order between two related events.")
mc("combining-sentences", "L.5.3", 5, 'Combine the sentences using "therefore" and a semicolon: "The bridge inspection failed. The city closed the bridge immediately."',
   "The bridge inspection failed; therefore, the city closed the bridge immediately.",
   [("The bridge inspection failed, therefore, the city closed the bridge immediately.", "A comma alone before “therefore” is too weak to join two complete sentences; a semicolon is needed."), ("The bridge inspection failed therefore the city closed the bridge immediately.", "Without any punctuation around “therefore,” this reads as a run-on."), ("Therefore, the bridge inspection failed; the city closed the bridge immediately.", "Moving “therefore” to the front changes which idea the result word is attached to.")],
   "A semicolon plus “therefore” shows that closing the bridge was a direct result of the failed inspection.", "Use a semicolon before “therefore” when one complete sentence is the result of another.")
mc("combining-sentences", "L.5.3", 6, 'Which is the BEST combined sentence? "Dr. Hana runs the clinic. Dr. Hana grew up in this village. She treats patients for free on Fridays."',
   "Dr. Hana, who grew up in this village, treats patients for free on Fridays.",
   [("Dr. Hana runs the clinic and grew up in this village and treats patients for free on Fridays.", "Stringing three ideas together with “and” repeatedly makes the sentence choppy and unclear."), ("Dr. Hana runs the clinic, she grew up in this village, she treats patients for free on Fridays.", "Joining three complete sentences with commas alone creates a run-on."), ("Who grew up in this village, Dr. Hana runs the clinic and treats patients for free on Fridays.", "Starting with “who” this way creates a confusing and incorrect sentence.")],
   "The relative clause “who grew up in this village” adds background detail smoothly within the main idea about her free clinic days.", "A relative clause can add background information without needing a separate sentence.")
err("combining-sentences", "L.5.3", 6, ["The divers found the wreck", " but", " they could not explore it fully, the tanks nearly empty."], 1, ", but",
    "Two independent clauses joined by “but” need a comma before the conjunction, not just “but” alone.", "Before a coordinating conjunction joining two complete sentences, place a comma.")
mc("combining-sentences", "L.5.3", 6, 'Combine the sentences using "unless": "The match will be postponed. The rain stops within the hour."',
   "The match will be postponed unless the rain stops within the hour.",
   [("The match will be postponed, the rain stops within the hour.", "A comma alone cannot join these two complete ideas without a connecting word."), ("Unless the match will be postponed, the rain stops within the hour.", "This places “unless” on the wrong clause, reversing the intended condition."), ("The match will be postponed the rain stops within the hour unless.", "This word order does not form a correct sentence.")],
   "“Unless” introduces the one condition that would stop the match from being postponed.", "“Unless” means “if not” and introduces a condition.")
mc("combining-sentences", "L.5.3", 6, 'Which is the BEST combined sentence? "The architect studied the blueprints. The architect measured the site. The architect proposed three designs."',
   "After studying the blueprints and measuring the site, the architect proposed three designs.",
   [("The architect studied the blueprints and measured the site and proposed three designs.", "Repeating “and” twice makes the sentence feel choppy instead of smooth."), ("The architect studied the blueprints, measured the site, the architect proposed three designs.", "Repeating “the architect” unnecessarily breaks the flow of the combined sentence."), ("Studying the blueprints and measuring the site the architect proposed three designs.", "A comma is missing after the introductory phrase in this sentence.")],
   "Starting with “After” turns the first two actions into one introductory phrase before the main action.", "An introductory phrase can combine two earlier actions before the main verb.")
mc("combining-sentences", "L.5.3", 7, 'Which is the BEST combined sentence? "The village built a new well. The well supplies water to every farm. The farms had struggled during the drought."',
   "The new well, which supplies water to every farm, eased the struggles caused by the drought.",
   [("The village built a new well and it supplies water to every farm and the farms struggled during the drought.", "Stringing three ideas together with “and” repeatedly makes the sentence choppy and unclear."), ("The village built a new well, it supplies water to every farm, the farms struggled during the drought.", "Joining three complete sentences with commas alone creates a run-on."), ("Which supplies water to every farm, the village built a new well during the drought.", "Starting with “which” this way creates a confusing and incorrect sentence.")],
   "The relative clause “which supplies water to every farm” smoothly explains the well’s purpose while connecting it to the drought it eased.", "A relative clause can connect a cause to its effect within one clear sentence.")
mc("combining-sentences", "L.5.3", 7, 'Combine the sentences using "despite": "The climbers kept moving. The storm grew worse by the hour."',
   "Despite the worsening storm, the climbers kept moving.",
   [("The climbers kept moving, the storm grew worse by the hour.", "A comma alone cannot join these two complete ideas without a connecting word."), ("The climbers kept moving despite, the storm grew worse by the hour.", "The comma is placed in the wrong spot in this sentence."), ("Despite the climbers kept moving, the storm grew worse by the hour.", "“Despite” should introduce the storm as the obstacle, not the climbers’ action.")],
   "“Despite” shows that the climbers kept going even though the storm was getting worse.", "“Despite” introduces an obstacle that did not stop the main action.")

# ================================================================== nouns
grade(4)

mc("nouns", "L.4.1", 1, 'Which word is a common noun? "Laila walked her playful puppy to the park."',
   "puppy", [("Laila", "This is a proper noun, a specific person's name."), ("playful", "This is an adjective describing the puppy."), ("walked", "This is a verb.")],
   "“Puppy” names a general kind of animal, not one specific, capitalized name.", "Common nouns are not capitalized unless they begin a sentence.")
mc("nouns", "L.4.1", 1, 'Which word is a proper noun? "My uncle works in Amman every summer."',
   "Amman", [("uncle", "This is a common noun for a family member in general."), ("works", "This is a verb."), ("summer", "This is a common noun for a season.")],
   "“Amman” names one specific city, so it is capitalized as a proper noun.", "Proper nouns name a particular person, place, or thing.")
mc("nouns", "L.4.1", 2, 'Which word names something you can touch? "Her patience amazed the whole violin class."',
   "violin", [("patience", "This is abstract; you cannot see or touch patience."), ("amazed", "This is a verb."), ("whole", "This is an adjective.")],
   "A violin is a real object you can see and hold, so it is a concrete noun.", "Concrete nouns can be sensed with your five senses.")
mc("nouns", "L.4.1", 2, 'Which word is an abstract noun? "The firefighter’s bravery inspired the entire neighborhood."',
   "bravery", [("firefighter", "This is concrete; a firefighter is a person you can see."), ("neighborhood", "This is concrete; it names a real place."), ("inspired", "This is a verb.")],
   "Bravery is a quality you cannot see or touch, so it is an abstract noun.", "Abstract nouns name ideas, feelings, or qualities.")
mc("nouns", "L.4.1", 3, 'Which word is a collective noun? "A swarm of bees surrounded the fig tree."',
   "swarm", [("bees", "This names individual insects, not the word for the group."), ("fig", "This is an adjective describing the tree."), ("tree", "This names one single object, not a group.")],
   "“Swarm” names a whole group of bees acting as one unit.", "Collective nouns name a group treated as a single thing: swarm, herd, flock.")
ms("nouns", "L.4.1", 3, 'Which TWO words are nouns? "The curious otter splashed happily in the stream."',
   ["otter", "stream"], [("curious", "This is an adjective describing the otter."), ("splashed", "This is a verb.")],
   "A noun names a person, place, thing, or animal; “otter” and “stream” both fit.", "Test each word: can you put “the” in front of it?")
mc("nouns", "L.4.1", 4, 'Which word names a SPECIFIC mountain and is a proper noun? "Climbers from many countries try to reach the top of Everest every spring."',
   "Everest", [("mountain", "This is a common noun for any mountain in general."), ("climbers", "This is a common noun for people in general."), ("spring", "This is a common noun for the season.")],
   "“Everest” names one particular mountain, so it is capitalized as a proper noun.", "Proper nouns name one exact person, place, or thing.")
mc("nouns", "L.4.1", 4, 'Which word is a collective noun? "The audience cheered when the dancer finished her final spin."',
   "audience", [("dancer", "This names one single person, not a group."), ("spin", "This names one single action, not a group."), ("finished", "This is a verb.")],
   "“Audience” names a whole group of people watching together.", "A collective noun stands for many people or things acting as one.")
mc("nouns", "L.4.1", 5, 'Which word in this sentence is a concrete noun? "Curiosity led the young explorer toward the glowing lantern."',
   "lantern", [("curiosity", "This is abstract; you cannot see or touch curiosity."), ("young", "This is an adjective."), ("led", "This is a verb.")],
   "A lantern is a real object you can see and hold, so it is a concrete noun.", "If you can picture touching it, it is probably a concrete noun.")
ms("nouns", "L.4.1", 5, 'Which TWO words are abstract nouns? "The team’s determination and loyalty carried them through the final round."',
   ["determination", "loyalty"], [("team", "This names a group you can picture, so it is a collective noun."), ("round", "This names a stage of a game, something concrete in the story.")],
   "Determination and loyalty are qualities you cannot see or touch, so both are abstract nouns.", "Abstract nouns often name feelings or qualities, not things you can hold.")
mc("nouns", "L.4.1", 7, 'In "The committee’s generosity funded a new playground for the collective benefit of the whole town," which word best shows an abstract idea rather than a group or a place?',
   "generosity", [("committee", "This is a collective noun; it names a group."), ("playground", "This is concrete; it names a real place."), ("town", "This is concrete; it names a real place.")],
   "Generosity is a quality you cannot see or touch, which makes it an abstract noun.", "Separate the group words and place words from the ones naming feelings or qualities.")

grade(5)

mc("nouns", "L.5.1", 1, 'Which word is a proper noun? "Every winter, my cousin visits Cairo to see the pyramids."',
   "Cairo", [("cousin", "This is a common noun for a family member in general."), ("winter", "This is a common noun for a season."), ("pyramids", "This is a common noun written in lowercase for structures in general.")],
   "“Cairo” names one specific city, so it is capitalized as a proper noun.", "Proper nouns name one exact person, place, or thing and are always capitalized.")
mc("nouns", "L.5.1", 2, 'Which word is an abstract noun? "The athlete’s determination surprised her coach."',
   "determination", [("athlete", "This is concrete; an athlete is a person you can see."), ("coach", "This is concrete; a coach is a person you can see."), ("surprised", "This is a verb.")],
   "Determination is a quality you cannot see or touch, so it is an abstract noun.", "Abstract nouns name qualities or feelings, not things you can hold.")
mc("nouns", "L.5.1", 2, 'Which word is a collective noun? "A fleet of fishing boats returned before the storm."',
   "fleet", [("boats", "This names individual vessels, not the word for the group."), ("storm", "This names one single event, not a group."), ("returned", "This is a verb.")],
   "“Fleet” names a whole group of boats traveling together.", "Collective nouns name a group treated as a single thing: fleet, crew, team.")
mc("nouns", "L.5.1", 3, 'Which word is a concrete noun? "Freedom meant more to the sailor than the shining compass in his hand."',
   "compass", [("freedom", "This is abstract; you cannot see or touch freedom."), ("shining", "This is an adjective."), ("meant", "This is a verb.")],
   "A compass is a real object you can see and hold, so it is a concrete noun.", "Concrete nouns can be sensed with your five senses.")
ms("nouns", "L.5.1", 3, 'Which TWO words are proper nouns? Choose from: "Hassan," "sister," "traveled," "Istanbul."',
   ["Hassan", "Istanbul"], [("sister", "This is a common noun for a family member in general."), ("traveled", "This is a verb.")],
   "“Hassan” names a specific person and “Istanbul” names a specific city, so both are proper nouns.", "Proper nouns are always capitalized because they name one exact thing.")
mc("nouns", "L.5.1", 4, 'In "The gift became a cherished memory," which word is used as a predicate noun?',
   "memory", [("gift", "This is the subject of the sentence."), ("became", "This is the linking verb."), ("cherished", "This is an adjective describing the memory.")],
   "“Memory” follows the linking verb “became” and renames the subject “gift.”", "A predicate noun follows a linking verb and renames the subject.")
mc("nouns", "L.5.1", 4, 'Which word is the object of the preposition in "The parrot perched beside the window"?',
   "window", [("parrot", "This is the subject of the sentence."), ("perched", "This is the verb."), ("beside", "This is the preposition itself, not its object.")],
   "“Window” comes right after the preposition “beside,” making it the object of the preposition.", "A preposition is always followed by its object: a noun or pronoun.")
mc("nouns", "L.5.1", 5, 'In "Ms. Farida, a skilled potter, judged the art contest," which word renames "Ms. Farida"?',
   "potter", [("contest", "This is the direct object of the verb “judged.”"), ("judged", "This is the verb."), ("art", "This is an adjective describing the contest.")],
   "“A skilled potter” is an appositive that renames Ms. Farida, and “potter” is its key noun.", "An appositive renames the noun right before it, usually set off by commas.")
mc("nouns", "L.5.1", 5, 'In "The coach handed Lamees the trophy," which word is the indirect object?',
   "Lamees", [("coach", "This is the subject of the sentence."), ("trophy", "This is the direct object; it answers “handed what?”"), ("handed", "This is the verb.")],
   "Lamees is the person who received the trophy, which makes her the indirect object.", "The indirect object answers “to whom?” or “for whom?” after the verb.")
mc("nouns", "L.5.1", 6, 'In "The storm toppled the old lighthouse," which word is the direct object?',
   "lighthouse", [("storm", "This is the subject of the sentence."), ("toppled", "This is the verb."), ("old", "This is an adjective describing the lighthouse.")],
   "“Lighthouse” receives the action of the verb “toppled,” making it the direct object.", "A direct object answers “what?” or “whom?” right after the verb.")
ms("nouns", "L.5.1", 7, 'Which TWO words are abstract nouns? "The crew valued honesty and fairness above a trophy."',
   ["honesty", "fairness"], [("crew", "This names a group you can picture, so it is a collective noun."), ("trophy", "This is concrete; a trophy is an object you can see and touch.")],
   "Honesty and fairness are qualities you cannot see or touch, so both are abstract nouns.", "Abstract nouns often describe values or feelings rather than physical things.")

grade(6)

mc("nouns", "L.6.1", 2, 'Which word is a proper noun? "The scientists published their findings in Nature during the spring."',
   "Nature", [("scientists", "This is a common noun for people in general."), ("findings", "This is a common noun for results in general."), ("published", "This is a verb.")],
   "“Nature” here names a specific, titled journal, so it is capitalized as a proper noun.", "A proper noun can even be the specific title of a publication.")
mc("nouns", "L.6.1", 2, 'Which word is a gerund used as a noun in "Swimming calmed her nerves after the long exam"?',
   "Swimming", [("calmed", "This is the verb of the sentence."), ("nerves", "This is a regular noun, not a verb form acting as a noun."), ("long", "This is an adjective describing the exam.")],
   "“Swimming” is a verb form ending in -ing that acts as the subject noun of the sentence.", "A gerund looks like a verb but does the job of a noun in the sentence.")
mc("nouns", "L.6.1", 3, 'Which word is an abstract noun? "The negotiator’s patience ended the long dispute peacefully."',
   "patience", [("negotiator", "This is concrete; a negotiator is a person you can see."), ("dispute", "This names a specific event in the story, not a quality."), ("peacefully", "This is an adverb.")],
   "Patience is a quality you cannot see or touch, so it is an abstract noun.", "Abstract nouns name qualities, not people or specific events.")
mc("nouns", "L.6.1", 3, 'Which word is a collective noun? "A jury of twelve citizens reached a verdict by evening."',
   "jury", [("citizens", "This names individual people, not the word for the group."), ("verdict", "This names a decision, not a group of people."), ("evening", "This names a time of day.")],
   "“Jury” names a whole group of citizens acting as one decision-making body.", "Collective nouns name a group acting together as one unit.")
mc("nouns", "L.6.1", 4, 'In "Her final project became a model for the whole class," which word is the predicate noun?',
   "model", [("project", "This is the subject of the sentence."), ("became", "This is the linking verb."), ("class", "This is the object of the preposition “for.”")],
   "“Model” follows the linking verb “became” and renames the subject “project.”", "A predicate noun follows a linking verb and renames the subject.")
mc("nouns", "L.6.1", 4, 'Which group of words acts as a noun clause (the direct object) in "The judges announced that Samir had won first place"?',
   "that Samir had won first place", [("The judges", "This is the subject of the sentence."), ("announced", "This is the verb of the sentence."), ("first place", "This is only part of the clause, not the complete noun clause.")],
   "The entire clause “that Samir had won first place” acts as one noun, receiving the action of “announced.”", "A noun clause can act as a whole direct object made of several words.")
ms("nouns", "L.6.1", 5, 'Which TWO words are concrete nouns? "The architect sketched a bridge while admiring its elegance."',
   ["architect", "bridge"], [("elegance", "This is an abstract noun naming a quality."), ("admiring", "This is a verb.")],
   "An architect and a bridge are both real things you can see, so they are concrete nouns.", "Concrete nouns name things you could point to or touch.")
mc("nouns", "L.6.1", 5, 'In "Mr. Haikal, a retired engineer, inspected the dam," which phrase is the appositive?',
   "a retired engineer", [("the dam", "This is the direct object of the verb “inspected.”"), ("inspected", "This is the verb."), ("Mr. Haikal", "This is the noun being renamed, not the renaming phrase itself.")],
   "“A retired engineer” is the appositive that renames Mr. Haikal right next to his name.", "An appositive is the renaming phrase, set off by commas, not the noun it renames.")
mc("nouns", "L.6.1", 6, 'In "The volunteers consider the program a success," which word renames "the program"?',
   "success", [("volunteers", "This is the subject of the sentence."), ("consider", "This is the verb."), ("program", "This is the noun being renamed, not the renaming word.")],
   "“Success” follows “the program” and renames it as an object complement.", "An object complement renames or describes the direct object right after it.")
mc("nouns", "L.6.1", 7, 'Which sentence replaces the underlined verb with a noun form (a nominalization)? Original: "The city will expand the harbor."',
   "The city’s expansion of the harbor is planned.",
   [("The city will expand the harbor quickly.", "This still uses the verb “expand,” not a noun form of it."), ("The harbor was expanded by the city.", "This keeps “expanded” as a verb, just in the passive voice."), ("Expand the harbor, said the mayor.", "This still uses “expand” as a verb in a command, not as a noun.")],
   "“Expansion” turns the verb “expand” into a noun, which is exactly what a nominalization does.", "A nominalization changes an action word into a noun, usually by adding an ending like -ion or -ment.")

# ================================================================== make-predictions
grade(4)

mc("make-predictions", "RL.4.1", 1, 'Read: "Omar brushed his teeth, put on his pajamas, and climbed into bed." What will Omar most likely do next?',
   "Go to sleep.",
   [("Eat breakfast.", "This is a morning activity, but Omar is getting ready for bed, not for the day."), ("Go to school.", "Putting on pajamas and climbing into bed signals bedtime, not school time."), ("Play outside.", "It is nighttime in this scene, not playtime.")],
   "Every detail—brushing teeth, pajamas, and climbing into bed—points to Omar getting ready to sleep.", "Picture the routine described and ask what naturally comes right after it.")
mc("make-predictions", "RL.4.1", 1, 'Read: "Dark clouds covered the sky, and the wind picked up speed." What will most likely happen next?',
   "It will start to rain.",
   [("The sun will come out.", "Dark clouds and strong wind usually signal a storm is coming, not clear skies."), ("The wind will stop completely.", "The wind is picking up speed, not calming down."), ("It will snow heavily.", "There is no mention of cold weather that would suggest snow.")],
   "Dark clouds and rising wind are classic signs that a storm, including rain, is approaching.", "Weather clues like clouds and wind often predict what kind of weather is coming.")
mc("make-predictions", "RL.4.1", 2, 'Read: "Yara practiced her violin every day after school for a whole month before the big recital." What is the BEST prediction?',
   "Yara will perform well at the recital.",
   [("Yara will forget how to play the violin.", "A full month of daily practice makes forgetting very unlikely."), ("Yara will quit playing the violin.", "Nothing in the passage suggests she wants to stop playing."), ("Yara will miss the recital.", "There is no clue suggesting she will be absent.")],
   "A whole month of daily practice strongly suggests Yara will be well prepared for the recital.", "Look at the effort a character puts in to predict how things will likely turn out.")
tf("make-predictions", "RL.4.1", 2, 'Read: "Tariq forgot to water his plant for two weeks while he was on vacation." Based on this, it makes sense to predict that the plant will probably look wilted when he returns.', True,
   "Plants need regular water, so going two full weeks without any is likely to leave it wilted.", "Think about what normally happens when a living thing is missing something it needs.")
mc("make-predictions", "RL.4.1", 3, 'Read: "The kitten batted at the ball of yarn, chased it across the room, and pounced again and again." What will the kitten most likely do next?',
   "Keep playing with the yarn.",
   [("Fall asleep immediately.", "Nothing in the passage shows the kitten is tired yet; it is still actively playing."), ("Run outside.", "There is no door or yard mentioned in the passage."), ("Ignore the yarn completely.", "The kitten is clearly enjoying chasing and pouncing on the yarn.")],
   "The kitten’s repeated chasing and pouncing shows it is still very interested in the yarn.", "A character’s repeated actions are a strong clue about what they will do next.")
mc("make-predictions", "RL.4.1", 3, 'Read: "Hassan studied his multiplication tables every night, but he still mixed up the sevens and eights on his last three quizzes." Which detail BEST supports the prediction that Hassan might struggle with the sevens and eights again?',
   "He mixed up the sevens and eights on his last three quizzes.",
   [("He studied every night.", "This detail actually suggests improvement, not continued struggle."), ("He has a quiz tomorrow.", "Having a quiz does not by itself show a pattern of struggling."), ("He likes math class.", "Liking a subject does not predict making the same mistake again.")],
   "A pattern repeated three times in a row is strong evidence that the same mistake might happen again.", "Look for a repeated pattern, not just a single detail, to support a prediction.")
mc("make-predictions", "RL.4.1", 4, 'Read: "The campers noticed their tent poles were bent and dark clouds were rolling in fast, but they decided to keep hiking farther from camp." What will most likely happen?',
   "The campers will get caught in bad weather far from shelter.",
   [("The campers will reach camp before the storm.", "They are moving farther away from camp, not back toward it."), ("The tent will fix itself.", "Tents cannot repair themselves without someone fixing them."), ("The storm will pass without any rain.", "Fast-moving dark clouds are a strong sign that a storm, likely with rain, is coming.")],
   "Moving away from shelter while a storm approaches makes it likely the campers will be caught in bad weather.", "Combine two clues—the danger sign and the characters’ choice—to predict the outcome.")
ms("make-predictions", "RL.4.1", 4, 'Read: "Noor saved part of her allowance every week and kept a list of chores to earn extra money for a new bicycle." Which TWO details help you predict that Noor will be able to buy the bicycle?',
   ["She saved part of her allowance every week.", "She did extra chores to earn more money."],
   [("She wanted a red bicycle.", "Her color preference does not affect whether she can afford the bicycle."), ("She rides her old bicycle to school.", "This detail does not show she is actively saving money for a new one.")],
   "Saving money regularly and earning extra through chores both build toward having enough money.", "Look for details that show steady progress toward a goal.")
mc("make-predictions", "RL.4.1", 5, 'Read: "The bridge builders tested the new design in a water tank, and it held steady even under heavy weights." What is the BEST prediction about the real bridge?',
   "The real bridge will likely hold up well under heavy loads.",
   [("The real bridge will collapse immediately.", "The successful test result suggests the opposite outcome."), ("The builders will cancel the project.", "A successful test is a reason to continue the project, not stop it."), ("The bridge will be built using a completely different design.", "There is no reason given to abandon a design that worked well in testing.")],
   "A design that held steady under heavy weights in testing is likely to perform well in the real bridge.", "A successful test is strong evidence for predicting future success.")
mc("make-predictions", "RL.4.1", 5, 'Read: "Every time the school bell rings for recess, Bilal’s dog waits by the fence because it knows Bilal will walk by soon." What can readers predict the dog will do tomorrow at recess time?',
   "The dog will wait by the fence again.",
   [("The dog will run away from the school.", "Nothing in the passage suggests the dog wants to leave the area."), ("The dog will stop recognizing the bell.", "The repeated pattern shows the dog has clearly learned the schedule."), ("The dog will ignore Bilal completely.", "The dog clearly waits specifically because it expects to see Bilal.")],
   "Since this happens every time the bell rings, the same pattern is likely to repeat tomorrow.", "A habit repeated “every time” is a strong clue that it will happen again.")
mc("make-predictions", "RL.4.1", 6, 'Read: "The farmer checked the weather report, saw a dry spell was forecast for the next two weeks, and immediately set up extra irrigation pipes across his fields." Which detail BEST supports the prediction that the farmer is preparing for a drought?',
   "He set up extra irrigation pipes right after seeing the dry forecast.",
   [("He checked the weather report.", "Checking the report alone does not show he is preparing, only gathering information."), ("He owns a large farm.", "The size of the farm does not relate to preparing for a drought."), ("He grows several different crops.", "This detail is about variety of crops, not water preparation.")],
   "Taking direct action—adding irrigation—right after the forecast shows he is actively preparing for dry weather.", "An action taken because of a clue is stronger evidence than the clue alone.")
mc("make-predictions", "RL.4.1", 6, 'Read: "After the team lost three games in a row, the coach changed the lineup, added two new practice drills, and reminded the players to support each other." What is the BEST prediction for the next game?',
   "The team has a good chance of performing better in the next game.",
   [("The team will quit the league.", "Nothing in the passage suggests the players want to give up."), ("The coach will refuse to attend the next game.", "The coach is actively working to help the team improve, not planning to leave."), ("The new drills will have no effect at all.", "The coach’s specific changes are meant to help the team, making some improvement likely.")],
   "The coach’s active changes after the losing streak suggest the team is likely to improve.", "When a character takes clear steps to fix a problem, predict improvement.")
mc("make-predictions", "RL.4.1", 7, 'Read: "The engineer noticed a strange vibration in the machine, logged the reading, and ordered a replacement part two days before the part was expected to fail." Which detail BEST supports the prediction that a breakdown was avoided?',
   "She ordered the replacement part before the expected failure.",
   [("She noticed a strange vibration.", "Noticing the problem alone does not prevent it; the ordered part does."), ("She logged the reading in a notebook.", "Recording data does not by itself prevent the breakdown."), ("The machine had worked fine for years.", "Past performance does not explain why this specific breakdown was avoided.")],
   "Ordering the part before the expected failure is the action that directly prevents the breakdown.", "Look for the action that directly solves the problem, not just the clue that revealed it.")
tf("make-predictions", "RL.4.1", 7, 'Read: "The negotiators had already agreed on nearly every point in the contract, with only the delivery date still undecided." Based on this, it makes sense to predict that the two sides will likely reach a full agreement soon.', True,
   "Agreeing on nearly every point with only one small issue left makes a full agreement likely very soon.", "When almost everything is already settled, predict that the small remaining piece will likely be resolved too.")

grade(5)

mc("make-predictions", "RL.5.1", 1, 'Read: "Sami laced up his running shoes, stretched for ten minutes, and lined up at the starting line of the marathon." What will Sami most likely do next?',
   "Start running the race.",
   [("Go back home to sleep.", "He is at the starting line, ready to race, not heading home."), ("Take off his running shoes.", "He just put them on to prepare for the race he is about to run."), ("Watch the race from the stands.", "He is a runner lining up to compete, not a spectator in the stands.")],
   "Every detail in the passage shows Sami is fully prepared and positioned to begin the race.", "When a character finishes preparing and is in position, predict the action that follows naturally.")
mc("make-predictions", "RL.5.1", 2, 'Read: "The chess champion studied her opponent’s last ten moves carefully and noticed he always protected his queen the same way." What is the BEST prediction about her next move?',
   "She will use a strategy that targets the opponent’s predictable pattern.",
   [("She will give up the match.", "Careful study of her opponent suggests she is preparing to win, not quit."), ("She will ignore everything she noticed.", "Noticing a clear pattern is useful information she would likely use, not ignore."), ("She will switch to a completely different game.", "There is no indication she wants to stop playing chess.")],
   "Noticing a predictable pattern in an opponent is exactly the kind of clue a skilled player would use strategically.", "When a character gathers specific information, predict they will use it to their advantage.")
tf("make-predictions", "RL.5.1", 2, 'Read: "Despite months of rehearsal, the lead actor lost her voice the night before opening night." Based on this, it makes sense to predict that the show might face a last-minute challenge.', True,
   "Losing a voice right before a performance is a clear sign of a last-minute problem the show must handle.", "A sudden setback right before an event is a strong clue that a challenge is coming.")
mc("make-predictions", "RL.5.1", 3, 'Read: "The young falcon had practiced short flights from branch to branch all week and was now perched at the very top of the tall cliff." What will the falcon most likely do next?',
   "Attempt a longer flight from the cliff.",
   [("Stay on the branch forever.", "It has already moved up to the cliff, showing clear progress beyond the branch."), ("Forget how to fly.", "A full week of practice makes forgetting how to fly very unlikely."), ("Build a nest instead of flying.", "Nothing in the passage suggests the falcon is building a nest.")],
   "A week of practice followed by climbing to a higher point suggests the falcon is ready to try a bigger flight.", "Track a character’s progress over time to predict their next, bigger step.")
mc("make-predictions", "RL.5.1", 3, 'Read: "The scientists recorded rising temperatures in the lake for the third summer in a row and saw fewer fish eggs each year." Which detail BEST supports the prediction that the fish population will keep declining?',
   "Fewer fish eggs were found each of the three years.",
   [("The scientists took careful notes.", "Taking notes itself does not predict a change in the fish population."), ("The lake is popular with tourists.", "Tourism is unrelated to the data about fish eggs."), ("The temperature was measured in summer.", "The season of measurement does not by itself predict the population decline.")],
   "A three-year pattern of declining fish eggs is strong, repeated evidence that the trend will likely continue.", "A trend repeated over several years is stronger evidence than a single data point.")
mc("make-predictions", "RL.5.1", 4, 'Read: "Despite practicing her speech every night for two weeks, Maya’s hands still shook and her voice cracked during the final rehearsal." What is the BEST prediction for the actual speech?',
   "Maya will likely feel nervous but may still improve with more practice.",
   [("Maya will refuse to give the speech.", "Nothing in the passage suggests she plans to back out of giving it."), ("Maya will suddenly become a completely confident speaker overnight.", "Nervousness built up over two weeks rarely disappears instantly."), ("The speech topic will be changed entirely.", "There is no mention anywhere of changing the topic of the speech.")],
   "Two weeks of practice with some lingering nervousness suggests a realistic mix of continued nerves and gradual improvement.", "Realistic predictions often combine a character’s weakness with the progress they have already made.")
ms("make-predictions", "RL.5.1", 4, 'Read: "The explorers packed extra water, checked the weather forecast twice, and told rangers their exact route before entering the canyon." Which TWO details help you predict the explorers are preparing carefully for a safe trip?',
   ["They packed extra water.", "They told rangers their exact route."],
   [("They entered the canyon in the morning.", "The time of day they entered does not show careful safety preparation."), ("They have hiked before.", "Past hiking experience is not a detail from this specific preparation described.")],
   "Packing extra supplies and informing rangers of their route are both clear safety precautions.", "Focus on the specific actions a character takes, not general background facts.")
mc("make-predictions", "RL.5.1", 5, 'Read: "The startup’s app crashed during its first public demo, but the engineers found and fixed the bug within an hour and ran three flawless tests afterward." What is the BEST prediction about the next public demo?',
   "The next demo will likely go more smoothly.",
   [("The app will crash again in exactly the same way.", "The specific bug that caused that crash has already been found and fixed."), ("The company will shut down the project.", "Fixing the bug and running successful tests shows the team is continuing their effort."), ("The engineers will stop testing the app.", "Running three flawless tests shows they are still actively and carefully testing it.")],
   "Fixing the known problem and then passing several tests strongly suggests the next demo will go better.", "A fixed problem followed by successful tests is strong evidence of improvement.")
mc("make-predictions", "RL.5.1", 5, 'Read: "Every volunteer who signed up early for the beach cleanup brought their own gloves and bags, while the city promised extra supplies for latecomers." Which detail BEST supports the prediction that the cleanup will have enough supplies for everyone?',
   "The city promised extra supplies for latecomers.",
   [("Volunteers signed up early.", "Signing up early does not by itself guarantee enough supplies for everyone."), ("The cleanup is at the beach.", "The location of the cleanup does not relate to the supply levels."), ("Some volunteers brought their own gloves.", "This helps some volunteers but does not address supplies for the latecomers.")],
   "The city’s promise specifically addresses the group that might otherwise be left without supplies.", "Look for the detail that directly solves the potential shortage, not just a related fact.")
mc("make-predictions", "RL.5.1", 6, 'Read: "The city council reviewed traffic data showing accidents had dropped sharply at every intersection where new crosswalk signals were installed last year." What is the BEST prediction if more signals are installed citywide?',
   "Accidents will likely decrease at the newly equipped intersections.",
   [("Traffic will completely disappear.", "Crosswalk signals reduce accidents; they do not eliminate traffic volume."), ("The council will remove all the signals.", "The positive data gives a strong reason to add more signals, not remove them."), ("Accidents will increase everywhere.", "This directly contradicts the data showing a sharp drop in accidents.")],
   "Since signals reduced accidents at every intersection where they were installed, more installations should have a similar effect.", "A result that repeats “at every” location is a strong basis for predicting the same result elsewhere.")
mc("make-predictions", "RL.5.1", 6, 'Read: "The marathon runner had battled a knee injury for months but finished every training run in the two weeks leading up to race day without any pain." Which detail BEST supports the prediction that she will be able to complete the marathon?',
   "She finished every training run pain-free in the two weeks before the race.",
   [("She battled a knee injury for months.", "This detail suggests risk and past difficulty, not current readiness."), ("The marathon is a long race.", "The length of the race is not evidence about her recent recovery."), ("She has run marathons before.", "Past marathons do not address her recent injury recovery specifically.")],
   "Recent, consistent pain-free training is the strongest and most current evidence of her readiness.", "The most recent, repeated evidence usually outweighs older background facts.")
mc("make-predictions", "RL.5.1", 7, 'Read: "The negotiating team had resolved every disagreement except one minor clause, and both sides had already scheduled a signing ceremony for the following week." Which detail BEST supports the prediction that the agreement will be signed as planned?',
   "Both sides had already scheduled a signing ceremony for the following week.",
   [("Only one minor clause remained unresolved.", "This shows the sides are close, but alone it does not show a ceremony is already arranged."), ("The negotiation took several months.", "The length of the process does not predict whether the signing will happen as planned."), ("Both teams argued about many issues earlier.", "Past disagreements do not predict the outcome of the final signing by themselves.")],
   "Already scheduling the ceremony shows both sides expect and are planning for the agreement to be finalized.", "A concrete, planned next step is stronger evidence than how smooth or rocky the process was before.")
tf("make-predictions", "RL.5.1", 7, 'Read: "The orchestra had performed the symphony flawlessly in six straight rehearsals, and the conductor told the musicians there was nothing left to change." Based on this, it makes sense to predict that the upcoming concert will likely go well.', True,
   "Six flawless rehearsals in a row, with no changes needed, strongly suggests the concert will go well.", "A long streak of success right before an event is strong evidence that the event will likely go well too.")

# ================================================================== theme
grade(4)

mc("theme", "RL.4.2", 1, 'Read: "Farid practiced his handwriting every night even though his letters were messy at first. By the end of the term, his teacher praised his neat, careful writing." Which sentence best states the theme of this story?',
   "Hard work pays off over talent alone.",
   [("Teachers are always strict.", "The story shows encouragement from the teacher, not strictness."), ("Writing neatly is impossible for beginners.", "The story shows the opposite: improvement was possible with practice."), ("Only naturally talented students succeed.", "Farid succeeded through steady practice, not natural talent.")],
   "Farid’s messy start and improved ending show that consistent effort, not natural skill, led to his success.", "Look at how a character changes from the beginning to the end of the story to find the theme.")
tf("theme", "RL.4.2", 2, 'In the story where Mona shared half of her lunch with a classmate who had forgotten his own, and the two became close friends afterward, the theme is best described as: small acts of kindness can make a big difference.', True,
   "Mona’s small act of sharing led to a meaningful new friendship, which is exactly what the theme describes.", "A small action with a big result is often a clue pointing to the story’s theme.")
mc("theme", "RL.4.2", 3, 'Read: "Lina almost quit her science project after her first volcano model collapsed, but her friend convinced her to rebuild it. The rebuilt volcano won first prize at the fair." Which sentence best states the theme of this story?',
   "Giving up too soon can cost you a success that was within reach.",
   [("Science fairs are only for experts.", "The story is about persistence after a setback, not about expertise."), ("Friends should always agree with you.", "The friend encouraged Lina to keep trying, not simply to agree with her."), ("Volcanoes are difficult to build.", "This is a detail about the project, not the lesson the story teaches.")],
   "Lina nearly quit right before her eventual success, showing how close giving up came to costing her that success.", "Notice moments when a character almost quits to find a theme about persistence.")
mc("theme", "RL.4.2", 3, 'Read: "Each rower on the boat pulled at a different pace until the coach told them to count together out loud. Once they rowed in rhythm, the boat sliced through the water and won the heat." Which sentence best states the theme of this story?',
   "Working as a team accomplishes more than working alone.",
   [("Coaches should never give instructions.", "The coach’s instruction is exactly what helped the team succeed."), ("Rowing boats are heavier than they look.", "This is a physical detail, not the lesson of the story."), ("Only the fastest rower matters in a race.", "The story shows that working together, not one person’s speed, led to winning.")],
   "The rowers only succeeded once they stopped pulling separately and worked together in rhythm.", "Watch what changes right before a story’s success to find its lesson.")
mc("theme", "RL.4.2", 4, 'Read: "The new student wore old, patched clothes, and some classmates avoided him until they learned he had built his own telescope from scrap metal and was the best in the astronomy club." Which sentence best states the theme of this story?',
   "Judging others by appearances can lead to mistakes.",
   [("Telescopes are expensive to build.", "This is a detail about the student’s project, not the main lesson."), ("New students are always unpopular.", "The story actually shows the classmates were wrong to avoid him."), ("Astronomy clubs only accept experts.", "The story does not suggest any membership requirement for the club.")],
   "The classmates’ early judgment based on clothing turned out to be completely wrong once they learned the truth.", "Look for a mistaken first impression that gets corrected later in the story.")
tf("theme", "RL.4.2", 4, 'In the story where Rami’s bread dough collapsed twice before he discovered he needed to let it rise longer, the theme is that mistakes are valuable because they teach important lessons.', True,
   "Rami’s two failures directly led him to the discovery that solved his problem, showing mistakes can be valuable teachers.", "When a character learns something useful specifically from a failure, that points to a theme about mistakes.")
mc("theme", "RL.4.2", 5, 'Read: "Instead of hiding his torn backpack from his parents, Adam showed them right away, and together they found a simple way to fix it with a sewing kit." Which sentence best states the theme of this story?',
   "Facing a problem directly is better than avoiding it.",
   [("Sewing kits can fix almost anything.", "This is a detail about the solution, not the lesson the story teaches."), ("Parents are always upset about small problems.", "The parents helped calmly, showing the opposite of being upset."), ("Backpacks should never be repaired.", "This directly contradicts what actually happens in the story.")],
   "Adam’s choice to show the problem right away, instead of hiding it, led to a quick and easy solution.", "Compare what a character chooses to do with what might have happened if they had chosen differently.")
mc("theme", "RL.4.2", 6, 'Read: "When the well in the village ran low, each family brought a bucket of water from their own supply to fill the school’s water tank until the rains returned." Which sentence best states the theme of this story?',
   "Sharing what you have can bring a community together.",
   [("Villages always run out of water in summer.", "This is a setting detail, not the lesson of the story."), ("Only the school needed water.", "The story shows the whole community helped meet a shared need, not just the school."), ("Rain never returns to dry villages.", "The story actually mentions that the rains eventually returned.")],
   "Every family contributing from their own supply shows how sharing helped the whole community get through a hard time.", "Notice when many characters each give a little to solve a shared problem.")

grade(5)

mc("theme", "RL.5.2", 2, 'Read: "Reem found an expensive watch on the bus and could have kept it, but she gave it to the driver, who tracked down its owner and thanked her publicly." Which sentence best states the theme of this story?',
   "Honesty is more valuable than a quick advantage.",
   [("Buses are good places to find valuables.", "This is a setting detail, not the lesson of the story."), ("Drivers should keep lost items for themselves.", "This directly contradicts the honest choice made in the story."), ("Expensive items are always returned to their owners.", "This is not guaranteed in general; Reem’s honest choice is what made the return possible.")],
   "Reem chose honesty over keeping something valuable for herself, and that choice led to a good outcome.", "Look at the choice a character makes when tempted, to uncover the theme.")
mc("theme", "RL.5.2", 3, 'Read: "Hadi wanted to repaint the fence in one afternoon, but his grandfather convinced him to do two thin coats over two days. The finished fence looked smooth with no drips." Which sentence best states the theme of this story?',
   "Patience often leads to better results than rushing.",
   [("Painting fences is always a two-day job.", "This describes only this specific case, not a lesson that applies more broadly."), ("Grandfathers always know more than grandsons.", "The story’s point is about taking time, not about age or experience in general."), ("Thin paint never covers properly.", "In the story, the thin coats actually worked very well.")],
   "Taking the slower, patient approach of two thin coats led to a smoother result than rushing would have.", "Compare the rushed plan to the patient plan to find the lesson about results.")
tf("theme", "RL.5.2", 3, 'In the story where fishermen agreed to let smaller fish go so the lake would have enough fish next season, the theme is that respecting nature protects the people who depend on it.', True,
   "By protecting the smaller fish now, the fishermen are protecting their own future catches, showing how respecting nature helps people too.", "When characters give something up now to protect a resource for later, think about themes connecting nature and people.")
mc("theme", "RL.5.2", 4, 'Read: "Before the storm warning was even issued, Layla’s family had already stocked candles, water, and a radio. When the power went out for two days, they were comfortable while neighbors scrambled for supplies." Which sentence best states the theme of this story?',
   "Preparation turns luck into success.",
   [("Storms always last exactly two days.", "This is a specific detail from the story, not a general lesson."), ("Only wealthy families can prepare for storms.", "Nothing in the story suggests that wealth was the reason for their preparation."), ("Candles are the most important emergency supply.", "This names one item, not the broader lesson about preparing ahead.")],
   "Layla’s family prepared before anyone knew for certain a storm was coming, and that early preparation paid off.", "Notice what a character does before trouble arrives to find a theme about preparation.")
mc("theme", "RL.5.2", 5, 'Read: "Karim spent his Saturday mornings tutoring younger students for free. Years later, when he struggled in his first job, one of those former students, now a manager, helped him get hired." Which sentence best states the theme of this story?',
   "Helping others in need often helps you in return.",
   [("Tutoring always leads to a job offer.", "This specific outcome is not guaranteed; the lesson is broader than one exact result."), ("Managers only hire people they already know.", "The story’s point is about kindness coming back around, not about favoritism."), ("Saturdays are the best day to volunteer.", "This is a detail about timing, not the lesson of the story.")],
   "Karim’s years of free tutoring eventually came back to help him when he needed it most.", "Look for an action early in a story that quietly returns to help the character later.")
mc("theme", "RL.5.2", 6, 'Read: "When the kitchen’s main oven broke an hour before the banquet, the head chef calmly reorganized the stovetop burners instead of panicking, and the meal was served on time." Which sentence best states the theme of this story?',
   "Staying calm under pressure leads to better decisions.",
   [("Ovens break down more often than stoves.", "This is a detail about kitchen appliances, not the story’s lesson."), ("Banquets should always have backup ovens.", "This suggests one specific solution, not the broader lesson about staying calm."), ("Head chefs never make mistakes.", "The story is about handling a problem calmly, not about avoiding mistakes entirely.")],
   "The chef’s calm response, rather than panic, is exactly what allowed the meal to be served on time.", "Compare a calm reaction to a panicked one to find the story’s lesson.")
mc("theme", "RL.5.2", 7, 'Read: "When Dina’s project partner was hospitalized the week before the science fair, Dina finished both of their parts and then insisted both names stay on the winning project." Which sentence best states the theme of this story?',
   "True friendship means helping without expecting anything back.",
   [("Science fairs should only list one name per project.", "This directly contradicts what Dina insisted on at the end of the story."), ("Hospitals always interfere with school projects.", "This is a plot detail, not the lesson the story teaches."), ("Winning is only possible by working alone.", "Dina’s actions show the opposite: she helped her partner instead of taking credit alone.")],
   "Dina did extra work and still shared the credit, showing she helped her friend without wanting anything extra for herself.", "Notice when a character gives credit away instead of keeping it, to find a theme about friendship.")

grade(6)

mc("theme", "RL.6.2", 2, 'Read: "At seventy, Mr. Aziz enrolled in a beginner’s coding class alongside teenagers, insisting he wanted to build a website for his old bookshop before he retired for good." Which sentence best states the theme of this story?',
   "It’s never too late to learn something new.",
   [("Coding classes are only useful for teenagers.", "Mr. Aziz disproves this by learning successfully at seventy years old."), ("Older people should not use computers.", "The story clearly shows the opposite is true."), ("Bookshops cannot have websites.", "This directly contradicts Mr. Aziz’s goal in the story.")],
   "Mr. Aziz’s choice to learn a brand-new skill late in life shows that age does not have to limit new learning.", "Pay attention to a character’s age compared with what they choose to try, to find the theme.")
mc("theme", "RL.6.2", 3, 'Read: "Though her hands trembled before every competition, the gymnast stepped onto the mat and performed her routine exactly as she had practiced." Which sentence best states the theme of this story?',
   "Courage means acting despite fear, not feeling no fear at all.",
   [("Gymnasts never feel nervous before a competition.", "Her trembling hands clearly show that she does feel nervous."), ("Trembling hands always ruin a performance.", "She still performed the routine successfully despite her trembling hands."), ("Only fearless people become champions.", "The story shows she succeeded despite fear, not because she had none.")],
   "The gymnast performed well even though she was clearly afraid, showing that courage does not require the absence of fear.", "Look for a character acting despite a feeling, rather than without that feeling at all.")
mc("theme", "RL.6.2", 4, 'Read: "Teased for his unusual left-handed grip, the young fencer refused to switch hands and later used that same unconventional angle to defeat the regional champion." Which sentence best states the theme of this story?',
   "Being different from others can be a strength, not a weakness.",
   [("Left-handed people are naturally better at fencing.", "The story is about his specific unique style, not a general rule about left-handed fencers."), ("Teasing always makes athletes quit a sport.", "He did not quit despite being teased for his grip."), ("Fencing requires switching grips often.", "This contradicts his choice to keep using his own unusual grip.")],
   "The very trait that made him a target of teasing turned out to be the advantage that helped him win.", "Notice when a character’s unusual trait becomes an advantage instead of a flaw.")
tf("theme", "RL.6.2", 4, 'In the story where a merchant secretly watered down his oil to sell more bottles but lost all his regular customers once they noticed, the theme is that greed can cause people to lose more than they gain.', True,
   "The merchant gained a little extra product to sell but lost his entire customer base, showing greed cost him far more than it gained.", "Compare what a greedy character gains in the short term with what they ultimately lose.")
mc("theme", "RL.6.2", 5, 'Read: "After a bitter argument split two lifelong friends apart for a year, one of them finally apologized at a reunion, and the two spent the rest of the evening laughing like old times." Which sentence best states the theme of this story?',
   "Forgiveness can repair a friendship that anger would destroy.",
   [("Arguments always end friendships forever.", "The story actually shows that the friendship was repaired, not ended forever."), ("Apologies never change how people feel.", "The apology clearly changed the mood of the reunion for the better."), ("Reunions are only for strangers.", "The reunion in the story brought together old friends, not strangers.")],
   "A single apology was able to undo a full year of distance caused by anger, showing the power of forgiveness.", "Compare the length of the conflict with how quickly it was resolved to find the theme.")
mc("theme", "RL.6.2", 6, 'Read: "While testing an unrelated chemical mixture out of simple curiosity, the young researcher stumbled onto a discovery that years of planned experiments had failed to produce." Which sentence best states the theme of this story?',
   "Curiosity can lead to discoveries that careful planning alone would miss.",
   [("Planned experiments always fail.", "The story only shows that this particular planned approach had not yet succeeded, not that all planning fails."), ("Curiosity is dangerous in a laboratory.", "The story presents curiosity as valuable here, not as something dangerous."), ("Discoveries only happen by following strict steps.", "The discovery in the story happened outside of the strict planned steps.")],
   "The unplanned, curious experiment succeeded where years of careful, planned experiments had not.", "Notice when an accidental or curious action succeeds where careful planning did not.")
mc("theme", "RL.6.2", 7, 'Read: "Despite her coach’s doubts about her chances, the swimmer kept believing she could qualify, trained before dawn every day, and shaved two full seconds off her best time at the trials." Which sentence best states the theme of this story?',
   "Believing in yourself helps you overcome doubt from others.",
   [("Coaches are always right about their swimmers.", "The coach’s doubts turned out to be mistaken in this story."), ("Training before dawn guarantees success.", "The lesson is about her self-belief, not specifically about the training schedule."), ("Doubt from others always comes true.", "The swimmer’s success in the story disproves this statement.")],
   "The swimmer’s own belief in herself, not her coach’s doubts, is what carried her to an improved result.", "Compare what a character believes about themselves with what others around them believe.")
