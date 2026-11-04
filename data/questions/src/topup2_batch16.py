"""
Question bank top-up 2, batch 16: brings these families to the full target of 50 items each
(original content, Grades 4-6). Families: sound-devices, visualize, pronoun-homophones,
drama-elements, point-of-view. All items are self-contained (no passage references) with an
invented line, sentence, or mini-scene written directly into the stem.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== sound-devices (RL.4.4 / RL.5.4)
grade(4)

mc("sound-devices", "RL.4.4", 1, "Which line uses alliteration (repeated sounds at the START of words)?",
   "Big brown bears bathed by the barn.",
   [("The sun set behind the hill.", "No repeated beginning sounds appear in this line."),
    ("A dog barked twice last night.", "The words here do not start with the same sound.")],
   "“Big, brown, bears, bathed, barn” all start with the b sound.",
   "Alliteration repeats the first consonant sound in nearby words.")

mc("sound-devices", "RL.4.4", 1, "Which line uses alliteration?",
   "Tiny turtles trotted toward the tide.",
   [("The moon rose slowly tonight.", "No words here share the same beginning sound."),
    ("Birds flew over the lake.", "The beginning sounds of these words are all different.")],
   "“Tiny, turtles, trotted, toward, tide” repeat the t sound at the start.",
   "Read the line aloud and listen for a sound that keeps coming back.")

mc("sound-devices", "RL.4.4", 2, "Which line uses assonance (a repeated VOWEL sound inside the words)?",
   "The light, bright kite flies high tonight.",
   [("The cat sat on the bench.", "This repeats a consonant sound, which is consonance, not assonance."),
    ("Birds sang sweetly in the trees.", "No single vowel sound is repeated across these words.")],
   "“Light, bright, kite, high, tonight” all share the long i sound.",
   "Assonance repeats a vowel sound; it does not have to be at the start of the word.")

mc("sound-devices", "RL.4.4", 2, "Which line uses consonance (a repeated sound inside or at the end of words, not at the start)?",
   "The black trucks stacked rocks at dusk.",
   [("The cat sat on the mat.", "This line has rhyme, which repeats whole ending sounds, not a scattered inside sound."),
    ("Birds chirped in the garden.", "No repeated inside or ending sound stands out here.")],
   "The ck sound repeats inside “black, trucks, stacked, rocks.”",
   "Consonance can repeat a consonant sound anywhere in the word, not just the start.")

mc("sound-devices", "RL.4.4", 3, "Which line uses alliteration?",
   "Dusty desert camels crossed the cracked canyon.",
   [("The camel walked slowly across the sand.", "Only one word begins with a matching sound here."),
    ("The sun was hot and bright.", "No repeated beginning sounds appear in this line.")],
   "“Dusty, desert, camels, crossed, cracked, canyon” share the hard c/k sound at the start.",
   "Alliteration can repeat a sound spelled with different letters, like c and k.")

mc("sound-devices", "RL.4.4", 3, "Which line uses assonance?",
   "The train's pale gray paint faded away.",
   [("The train stopped at the station.", "No single vowel sound repeats across several words here."),
    ("The driver waved at the crowd.", "This line does not repeat one vowel sound.")],
   "“Pale, gray, paint, faded, away” all share the long a sound.",
   "Say the line slowly and listen for one vowel sound echoing through it.")

dd("sound-devices", "RL.4.4", 3, "The repeated f sound in “Five fat frogs flopped into the pond” is called ____.",
   "alliteration",
   [("assonance", "Assonance repeats a vowel sound, not a beginning consonant sound."),
    ("rhyme", "Rhyme matches the ending sounds of words, not their beginning sounds.")],
   "The repeated beginning consonant sound is alliteration.",
   "Beginning sound repeated = alliteration.")

mc("sound-devices", "RL.4.4", 4, "Which line uses alliteration?",
   "Six sly sailors sailed past the silver ship.",
   [("The ship sailed across the ocean.", "Only one pair of words shares the same beginning sound here."),
    ("The waves crashed onto the shore.", "No repeated beginning sounds appear in this line.")],
   "“Sly, sailors, sailed, silver, ship” repeat the s sound at the start.",
   "Underline the first letter of each word to spot the repeating sound.")

mc("sound-devices", "RL.4.4", 4, "Which line uses assonance?",
   "The bright firefly flies high in the sky.",
   [("The firefly glowed in the dark yard.", "This line does not repeat one vowel sound through several words."),
    ("A moth landed on the lamp.", "No vowel sound repeats across these words.")],
   "“Bright, firefly, flies, high, sky” all share the long i sound.",
   "Assonance is easiest to hear if you say the line slowly, stretching the vowels.")

mc("sound-devices", "RL.4.4", 4, "Which line uses consonance?",
   "The kids kicked quick, slick shots at the net.",
   [("The kids played soccer after school.", "No inside or ending sound repeats across these words."),
    ("The ball rolled into the goal.", "This line does not repeat a consonant sound inside the words.")],
   "The ck/k sound repeats inside “kicked, quick, slick, shots.”",
   "Listen for a consonant sound echoing in the middle or end of several words.")

mc("sound-devices", "RL.4.4", 5, "Which line uses alliteration?",
   "Six sweet scones sat on the shelf.",
   [("The shelf held fresh bread.", "Only one pair of words here shares a beginning sound."),
    ("The baker opened the shop early.", "No repeated beginning sounds appear in this line.")],
   "“Six, sweet, scones, sat, shelf” repeat the s sound at the start.",
   "Alliteration often appears in groups of three or more words in a row.")

mc("sound-devices", "RL.4.4", 5, "Which line uses assonance?",
   "The green bees sleep deep in the leaves.",
   [("The bees buzzed around the hive.", "No single vowel sound repeats across several words here."),
    ("The garden was full of flowers.", "This line does not repeat one vowel sound.")],
   "“Green, bees, sleep, deep, leaves” all share the long e sound.",
   "Look for the same vowel spelled in different ways, like ee and ea.")

tf("sound-devices", "RL.4.4", 5, "In the line “The slimy snake slithered silently,” the repeated s sound at the start of each word is an example of alliteration.", True,
   "“Slimy, snake, slithered, silently” all begin with the s sound, which is alliteration.",
   "A repeated sound at the START of nearby words is alliteration.")

mc("sound-devices", "RL.4.4", 6, "Which line uses consonance?",
   "The river rocks clicked and clacked below.",
   [("The river flowed past the village.", "No inside or ending sound repeats across several words here."),
    ("The water was cold and clear.", "This line does not repeat a consonant sound inside the words.")],
   "The ck sound repeats inside “rocks, clicked, clacked.”",
   "Consonance can repeat a sound in the middle of a word, not only at the end.")

mc("sound-devices", "RL.4.4", 6, "Which line uses alliteration?",
   "Hungry hikers hauled heavy packs uphill.",
   [("The hikers reached the top at noon.", "No repeated beginning sounds appear in this line."),
    ("The trail was steep and rocky.", "This line does not repeat one beginning sound.")],
   "“Hungry, hikers, hauled, heavy” repeat the h sound at the start.",
   "Four or more words sharing a beginning sound is a strong clue to alliteration.")

match("sound-devices", "RL.4.4", 6, "Match each sound device with the line that shows it.",
      [("Alliteration", "Wild winds whipped the willow tree."),
       ("Assonance", "The deep green stream gleamed in the light."),
       ("Consonance", "The black truck backed into the dock."),
       ("Onomatopoeia", "The balloon went pop!")],
      "Alliteration repeats a beginning sound, assonance repeats a vowel sound inside words, consonance repeats a consonant sound inside or at the end of words, and onomatopoeia is a word that imitates a sound.",
      "Ask: where in the words is the sound repeated — start, middle, or is it a sound-word itself?")

mc("sound-devices", "RL.4.4", 7, "Which line uses BOTH alliteration and assonance?",
   "Sly snakes slide through slippery, shiny slime.",
   [("Sly snakes crawled through the grass.", "This line has alliteration but no repeated vowel sound running through it."),
    ("The grass was wet and green.", "Neither a repeated beginning sound nor a repeated vowel sound appears here.")],
   "The s sound repeats at the start (alliteration) and the long i sound repeats inside the words (assonance).",
   "Check the start of the words first, then check the vowel sounds inside them.")

mc("sound-devices", "RL.4.4", 7, "Which line uses assonance?",
   "The deep stream seemed to gleam at dawn.",
   [("The stream flowed quietly through the valley.", "No one vowel sound repeats through several words here."),
    ("The water sparkled in the morning sun.", "This line does not repeat a single vowel sound.")],
   "“Deep, stream, seemed, gleam” all share the long e sound.",
   "Try reading only the vowels aloud to notice which sound keeps repeating.")

mc("sound-devices", "RL.4.4", 7, "Which line uses consonance?",
   "The bright lights flashed, flickered, and cracked.",
   [("The fireworks lit up the night sky.", "No inside or ending consonant sound repeats across several words here."),
    ("The crowd cheered loudly below.", "This line does not repeat one consonant sound.")],
   "The ck sound repeats inside “flashed, flickered, cracked.”",
   "Consonance is often easiest to hear near the ends of words.")

grade(5)

mc("sound-devices", "RL.5.4", 1, "Which line uses alliteration?",
   "Quiet, quick questions filled the library.",
   [("The library was calm and still.", "No repeated beginning sounds appear in this line."),
    ("Students studied at the long tables.", "This line does not repeat one beginning sound.")],
   "“Quiet, quick, questions” repeat the qu sound at the start.",
   "Alliteration can repeat a sound spelled the same way, like qu.")

mc("sound-devices", "RL.5.4", 1, "Which line uses assonance?",
   "The pale whale sailed away at daybreak.",
   [("The whale swam near the boat.", "No single vowel sound repeats through several words here."),
    ("The ocean was calm that morning.", "This line does not repeat one vowel sound.")],
   "“Pale, whale, sailed, away, daybreak” all share the long a sound.",
   "Stretch out the vowels as you read the line to notice the repeated sound.")

mc("sound-devices", "RL.5.4", 2, "Which line uses consonance?",
   "Trucks rolled past, horns blared and flared.",
   [("Trucks rolled slowly down the street.", "No inside or ending consonant sound repeats across several words here."),
    ("The traffic light turned green.", "This line does not repeat a consonant sound.")],
   "The r sound repeats inside “trucks, rolled, horns, blared, flared.”",
   "Consonance can repeat a sound in several different positions within words.")

mc("sound-devices", "RL.5.4", 2, "A poet writes “Wild winds whipped and wailed through the night.” Why would a poet choose this alliteration?",
   "To make the line's rhythm sound like the howling of the wind",
   [("To make the line easier to spell", "Alliteration affects sound and rhythm, not spelling difficulty."),
    ("To shorten the poem", "Repeating a sound does not change how long a line is.")],
   "Repeating the w sound mimics the rushing, blowing sound of wind, matching the line's meaning.",
   "Ask what feeling or sound the repeated letter imitates.")

mc("sound-devices", "RL.5.4", 3, "Which line uses assonance?",
   "The moon loomed low through the cool gloom.",
   [("The moon rose slowly over the hills.", "No single vowel sound repeats through several words here."),
    ("The sky was dark and starless.", "This line does not repeat one vowel sound.")],
   "“Moon, loomed, cool, gloom” all share the long oo sound.",
   "Long vowel sounds are often the easiest ones to spot repeating.")

mc("sound-devices", "RL.5.4", 3, "In the line “Crash! Boom! Bang! went the thunder,” which sound device is used?",
   "Onomatopoeia, because the words imitate the actual sounds of thunder",
   [("Alliteration, because the words start with the same letter", "“Crash,” “Boom,” and “Bang” do not share one beginning sound."),
    ("Assonance, because the words share a vowel sound", "These words do not share one repeated vowel sound.")],
   "Onomatopoeia uses words that sound like the noise they describe, such as crash, boom, and bang.",
   "If a word sounds like the noise it names, it is onomatopoeia, not alliteration.")

dd("sound-devices", "RL.5.4", 3, "The repeated ck sound inside “The black truck backed into the dock” is an example of ____.",
   "consonance",
   [("assonance", "Assonance repeats a vowel sound, not a consonant sound inside words."),
    ("alliteration", "Alliteration repeats a sound at the START of nearby words, and these words do not all start with the same sound.")],
   "A consonant sound repeated inside or at the end of words is consonance.",
   "Consonance can hide in the middle of a word, not just the start or end.")

mc("sound-devices", "RL.5.4", 4, "A poet writes “Fast, flashy cars flew by in a flash.” What effect does this alliteration create?",
   "It makes the sentence feel quick and exciting, matching the speed of the cars",
   [("It makes the sentence feel slow and calm", "The repeated f sound and short words suggest speed, not calm."),
    ("It makes the sentence confusing to read", "Alliteration is meant to add rhythm and effect, not to confuse readers.")],
   "The quick, repeated f sound mirrors the fast motion of the cars described.",
   "Match the sound of a line to the action or mood it is describing.")

mc("sound-devices", "RL.5.4", 4, "Which line uses assonance?",
   "The pale whale sailed away across the bay.",
   [("The whale dove beneath the waves.", "No single vowel sound repeats through several words here."),
    ("A ship passed near the shore.", "This line does not repeat one vowel sound.")],
   "“Pale, whale, sailed, away, bay” all share the long a sound.",
   "Assonance often links words that look different but sound alike inside.")

mc("sound-devices", "RL.5.4", 4, "A poet writes “Pitter, patter, pitter, patter” to describe rain. What effect does this repeated consonance create?",
   "It mimics the steady, tapping sound of raindrops",
   [("It mimics the sound of thunder", "Thunder is a loud, booming sound, not a light tapping one."),
    ("It shows the rain is about to stop", "Repeated sound patterns suggest the rain continuing steadily, not ending.")],
   "The repeated t sound echoes the light, steady tapping of rain on a surface.",
   "Sound devices often copy the rhythm of the thing they describe.")

mc("sound-devices", "RL.5.4", 5, "Which line uses alliteration?",
   "Dark, damp, dripping decay filled the old cave.",
   [("The cave was cold and silent.", "No repeated beginning sounds appear in this line."),
    ("Water dripped from the ceiling.", "This line does not repeat one beginning sound.")],
   "“Dark, damp, dripping, decay” repeat the d sound at the start.",
   "A gloomy scene often uses heavier sounds like d or b to set the mood.")

mc("sound-devices", "RL.5.4", 5, "Which line uses assonance?",
   "The cold, slow glow of dawn broke over the hills.",
   [("The sun rose over the mountains.", "No single vowel sound repeats through several words here."),
    ("The sky turned orange and pink.", "This line does not repeat one vowel sound.")],
   "“Cold, slow, glow” all share the long o sound.",
   "Read only the stressed vowels aloud to find the repeated sound.")

tf("sound-devices", "RL.5.4", 5, "The word “buzz” in the sentence “The bee's buzz grew louder” is an example of onomatopoeia.", True,
   "“Buzz” imitates the actual sound a bee makes, which makes it onomatopoeia.",
   "Onomatopoeia words usually sound exactly like the noise they name.")

mc("sound-devices", "RL.5.4", 6, "Which line uses consonance?",
   "The metal gears clattered, clanked, and cracked.",
   [("The machine stopped working suddenly.", "No inside or ending consonant sound repeats across several words here."),
    ("The factory was loud and busy.", "This line does not repeat one consonant sound.")],
   "The k/ck sound repeats inside “clattered, clanked, cracked.”",
   "Harsh consonant sounds like k and ck often suggest loud, mechanical noise.")

mc("sound-devices", "RL.5.4", 6, "A poet writes “Silent snow settled slowly on the sleeping town.” How does the alliteration affect the poem's mood?",
   "It creates a calm, quiet, gentle mood that matches the falling snow",
   [("It creates a loud, chaotic mood", "Soft s sounds and words like “silent” and “slowly” do not suggest chaos."),
    ("It creates a fast-paced, urgent mood", "Words like “settled” and “slowly” describe a gentle, unhurried action.")],
   "The soft, repeated s sound mirrors the hush of snow falling gently.",
   "Soft consonant sounds like s or wh often create a calm, quiet feeling.")

match("sound-devices", "RL.5.4", 6, "Match each sound device with the line that shows it.",
      [("Alliteration", "Mighty machines marched across the field."),
       ("Assonance", "The low, slow glow faded into night."),
       ("Consonance", "The thin wind spun and spent itself at dusk."),
       ("Onomatopoeia", "The old gate creaked open.")],
      "Alliteration repeats a beginning sound, assonance repeats a vowel sound inside words, consonance repeats a consonant sound inside or at the end of words, and onomatopoeia is a word that imitates a sound.",
      "Identify where the repeated sound falls in the words — start, middle, or the sound itself being imitated.")

mc("sound-devices", "RL.5.4", 7, "Which line uses consonance but NOT alliteration?",
   "The restless engine growled, groaned, and grumbled through the night.",
   [("Grumpy goats grazed on the grassy green hill.", "This line repeats a sound at the START of the words, so it is alliteration, not just consonance."),
    ("The bright, light kite flew high.", "This line repeats a vowel sound, which is assonance, not consonance.")],
   "The gr sound repeats inside the words “growled, groaned, grumbled,” but the words do not all start the sentence's subject with the same sound pattern as a whole alliterative run.",
   "Consonance without alliteration repeats an inside sound while the surrounding words still vary.")

mc("sound-devices", "RL.5.4", 7, "A poet writes “Deep, sleepy, creeping tide” to describe the ocean at night. What mood does the assonance create?",
   "A slow, calm, drowsy mood that matches the quiet tide",
   [("An excited, energetic mood", "Words like “sleepy” and “creeping” suggest slowness, not energy."),
    ("A frightening, dangerous mood", "The soft, drawn-out sound and gentle word choices do not suggest danger.")],
   "The repeated long e sound in “deep, sleepy, creeping” stretches the line and mirrors the slow, quiet tide.",
   "A drawn-out vowel sound often matches a slow, calm action.")

mc("sound-devices", "RL.5.4", 7, "Which line uses alliteration to build suspense?",
   "Footsteps followed, fading and fast, through the fog.",
   [("Footsteps echoed down the empty hall.", "No repeated beginning sounds appear in this line."),
    ("Someone was walking nearby.", "This line does not repeat one beginning sound.")],
   "The repeated f sound and short phrasing speed up the rhythm, building tension as the footsteps approach.",
   "Fast, clipped alliteration can speed up a line's rhythm to build suspense.")

# ================================================================== visualize (RL.4.7 / RL.5.7)
grade(4)

mc("visualize", "RL.4.7", 1, "Read this sentence: “The old wooden bridge creaked and swayed over the churning brown river.” What should you picture?",
   "A shaky bridge moving above fast, muddy water",
   [("A new bridge standing still over calm water", "The words “creaked,” “swayed,” and “churning” describe motion and age, not stillness."),
    ("A bridge with no river underneath it", "The sentence clearly places a river under the bridge.")],
   "The details “creaked,” “swayed,” and “churning brown” create a picture of an old, unsteady bridge over rough water.",
   "Picture each descriptive word one at a time, then put them together.")

mc("visualize", "RL.4.7", 1, "Which sentence helps you picture the scene MOST clearly?",
   "The orange sun sank slowly behind the jagged purple mountains.",
   [("The sun went down in the evening.", "This sentence gives almost no color or shape details to picture."),
    ("It was sunset.", "This sentence has no descriptive details at all.")],
   "Specific colors (“orange,” “purple”) and shapes (“jagged”) let you form a clear mental picture.",
   "Vivid writing uses specific colors, shapes, and sizes.")

mc("visualize", "RL.4.7", 2, "Read: “Thick gray smoke curled upward from the chimney and vanished into the cold sky.” What picture forms in your mind?",
   "Smoke rising in curls from a chimney and disappearing into a cold sky",
   [("A chimney with no smoke coming out", "The sentence directly describes smoke rising from the chimney."),
    ("A warm, sunny sky with no smoke", "The words “cold” and “smoke” do not match a warm, clear sky.")],
   "The verbs “curled” and “vanished” and the detail “cold sky” build a clear image of rising, fading smoke.",
   "Pay attention to verbs that describe exactly how something moves.")

mc("visualize", "RL.4.7", 2, "Which words help you picture the dog MOST clearly? “The shaggy, mud-splattered dog limped slowly toward the porch.”",
   "shaggy, mud-splattered, limped",
   [("dog, porch, toward", "These are plain nouns and a direction word, not descriptive details."),
    ("slowly, the, toward", "“The” and “toward” are not descriptive words about the dog.")],
   "“Shaggy,” “mud-splattered,” and “limped” describe exactly how the dog looks and moves.",
   "Look for adjectives and specific verbs, not just nouns.")

mc("visualize", "RL.4.7", 3, "Read: “Tiny silver fish darted in every direction as the heron's shadow passed over the shallow pool.” What should you picture?",
   "Many small fish scattering quickly as a bird's shadow crosses the water",
   [("A heron swimming slowly in deep water", "The heron's shadow passes overhead; the heron itself is not described as swimming."),
    ("Fish resting calmly at the bottom of the pool", "“Darted in every direction” shows quick, scattered movement, not calm resting.")],
   "“Darted,” “shadow,” and “shallow pool” together create a picture of startled fish scattering under a passing bird.",
   "Combine the action verbs with the setting details to build one full picture.")

mc("visualize", "RL.4.7", 3, "Which sentence gives you the clearest picture of how the kitchen smelled and sounded?",
   "Sizzling onions popped in the pan while the warm smell of garlic filled the kitchen.",
   [("Someone was cooking dinner.", "This sentence gives no sensory detail about sound or smell."),
    ("The kitchen was being used.", "This sentence has no descriptive detail at all.")],
   "“Sizzling,” “popped,” and “the warm smell of garlic” let you imagine the sound and smell of the kitchen.",
   "Strong imagery often appeals to more than one sense at a time.")

tf("visualize", "RL.4.7", 3, "The sentence “The crowd was noisy” helps you picture the scene more clearly than “Thousands of fans roared and stomped their feet in the stands.”", False,
   "The second sentence gives specific, vivid details, while the first is vague and general.",
   "Specific details almost always create a clearer picture than a general statement.")

mc("visualize", "RL.4.7", 4, "Read: “Jagged icicles hung from the roof like glittering daggers in the pale winter light.” What picture does the word “daggers” help you form?",
   "Icicles that look sharp and pointed, like blades",
   [("Icicles that are soft and round", "“Daggers” suggests something sharp and pointed, not soft or round."),
    ("A roof with no icicles at all", "The sentence clearly describes icicles hanging from the roof.")],
   "Comparing the icicles to daggers helps you picture their sharp, pointed shape.",
   "When writers compare one thing to another, picture the second thing to understand the first.")

mc("visualize", "RL.4.7", 4, "Which detail helps you picture how tired the hikers were?",
   "Their legs trembled with every step as they dragged themselves up the final hill.",
   [("They had been hiking since morning.", "This tells how long they hiked, but does not show how their bodies felt."),
    ("The trail was five miles long.", "This gives a distance, not a picture of the hikers' exhaustion.")],
   "“Trembled” and “dragged themselves” show physical signs of exhaustion you can picture.",
   "Look for details that show a feeling through the body, not just facts.")

mc("visualize", "RL.4.7", 5, "Read: “The marketplace buzzed with vendors shouting prices, carts rattling over cobblestones, and the sharp smell of spices drifting through the air.” What should you picture and sense?",
   "A busy, noisy marketplace full of sound, movement, and strong smells",
   [("A quiet, empty market at night", "The sentence describes shouting, rattling carts, and strong smells, not quiet and empty."),
    ("A market with only one vendor", "The sentence describes many vendors and carts, not just one.")],
   "The sounds (“shouting,” “rattling”) and smell (“sharp smell of spices”) combine to show a busy, lively scene.",
   "When several senses are described together, picture the whole scene at once.")

mc("visualize", "RL.4.7", 5, "Which revision adds the MOST vivid visual detail to “The storm was bad”?",
   "Lightning cracked the sky as hailstones the size of marbles hammered the rooftops.",
   [("The storm lasted a long time.", "This adds a fact about time, not a visual detail."),
    ("The storm was very bad.", "This repeats the same vague idea without adding any specific detail.")],
   "Specific images like “lightning cracked” and “hailstones the size of marbles” let a reader clearly picture the storm.",
   "Add a size, shape, color, or comparison to make a vague sentence vivid.")

dd("visualize", "RL.4.7", 5, "Which word choice helps you picture the water's movement MOST clearly? “The stream ____ over the smooth stones.”",
   "tumbled",
   [("was", "“Was” is a plain linking verb that shows no movement or image."),
    ("went", "“Went” is vague and does not show how the stream moved.")],
   "“Tumbled” shows a specific, tumbling motion over the stones.",
   "Specific verbs almost always paint a clearer picture than general ones.")

mc("visualize", "RL.4.7", 6, "Read: “The abandoned house leaned to one side, its broken shutters banging in the wind, paint peeling like old skin.” What mood does this imagery create?",
   "An eerie, neglected feeling, because every detail shows decay and disrepair",
   [("A cheerful, welcoming feeling", "Leaning walls, broken shutters, and peeling paint do not suggest a cheerful place."),
    ("A busy, crowded feeling", "The description focuses on an abandoned, empty house, not a crowded one.")],
   "Details like “leaned,” “broken,” “banging,” and “peeling” all build a picture of neglect, creating an eerie mood.",
   "Notice how several small visual details can add up to one overall feeling.")

mc("visualize", "RL.4.7", 6, "Which sentence lets you picture the runner's exact movement, not just that she ran?",
   "She pumped her arms and sprinted the last stretch, her ponytail whipping behind her.",
   [("She ran as fast as she could.", "This states the idea of speed but gives no specific visual detail."),
    ("She finished the race.", "This only states the result, with no picture of how she moved.")],
   "“Pumped her arms,” “sprinted,” and “ponytail whipping” show exactly how her body moved.",
   "Specific body details create a sharper picture than a general statement about speed.")

mc("visualize", "RL.4.7", 6, "Read: “Dew clung to each blade of grass, catching the early light like scattered diamonds.” What picture does the comparison to diamonds create?",
   "Drops of dew sparkling brightly in the morning sunlight",
   [("Grass that is completely dry", "The sentence describes dew clinging to the grass, not dry grass."),
    ("A field covered in real diamonds", "The comparison is figurative; the grass is covered in dew, not actual diamonds.")],
   "Comparing the dew to scattered diamonds helps you picture how brightly it sparkles in the light.",
   "A comparison in a description is a tool to picture the real thing more vividly, not a literal statement.")

mc("visualize", "RL.4.7", 7, "Read: “The climber's fingers, raw and trembling, gripped the last crumbling ledge as pebbles skittered into the void below.” Which detail BEST helps you feel the danger of the moment?",
   "pebbles skittered into the void below",
   [("the climber kept going", "This states an action but does not create a visual sense of danger."),
    ("the ledge was near the top", "This gives a location, not a vivid image of risk.")],
   "Picturing pebbles falling into empty space below shows just how high and dangerous the ledge is.",
   "The most vivid detail is often the one that shows consequence or risk, not just action.")

mc("visualize", "RL.4.7", 7, "Which pair of sentences creates the clearest contrast in imagery between a calm and a chaotic scene?",
   "The pond lay still and silver under the moon. Minutes later, sirens screamed and red lights flashed across the water.",
   [("The pond was calm. Then it was not calm anymore.", "This states an idea of change without any vivid visual contrast."),
    ("The night was quiet. The night became loud.", "These sentences name the change but give no specific images to picture.")],
   "The first pair uses specific visual details (“still and silver,” “sirens screamed,” “red lights flashed”) to show a sharp contrast.",
   "A strong contrast needs two sets of vivid, specific details, not just opposite labels.")

mc("visualize", "RL.4.7", 4, "Which sentence helps you picture the campfire MOST clearly?",
   "Orange flames crackled and popped, sending sparks spiraling up into the dark sky.",
   [("The campfire was burning well.", "This sentence gives no specific color, sound, or motion details."),
    ("Someone had started a fire.", "This states a fact with no descriptive detail at all.")],
   "“Crackled,” “popped,” and “sparks spiraling” let you both see and hear the campfire.",
   "Look for verbs that show sound as well as sight for the clearest picture.")

mc("visualize", "RL.4.7", 7, "Read: “The glacier groaned and cracked, a slab of blue-white ice the size of a bus sliding slowly into the churning sea.” Which detail BEST helps you picture the glacier's enormous size?",
   "a slab of blue-white ice the size of a bus",
   [("the glacier groaned and cracked", "This describes sound, not the glacier's size."),
    ("the sea was churning", "This describes the water's movement, not the size of the ice.")],
   "Comparing the ice slab to the size of a bus gives you a real-world object to measure its enormous size against.",
   "Writers often compare something huge or unfamiliar to an object the reader already knows the size of.")

grade(5)

mc("visualize", "RL.5.7", 1, "Read: “Fog rolled in thick waves across the harbor, swallowing the masts of the fishing boats one by one.” What picture should form in your mind?",
   "Dense fog slowly covering boats in a harbor until they disappear from sight",
   [("A clear, sunny day at the harbor", "The sentence describes thick fog, which is the opposite of a clear day."),
    ("Boats sailing quickly out of the harbor", "The boats are described as being covered by fog, not sailing away.")],
   "“Rolled in thick waves” and “swallowing the masts” build a picture of fog gradually hiding the boats from view.",
   "Visualize description in order, the way the writer builds it, detail by detail.")

mc("visualize", "RL.5.7", 1, "Which sentence creates the clearest picture of a busy construction site?",
   "Jackhammers pounded the pavement while dust clouded the air and workers shouted over the roar of machines.",
   [("The construction site was loud and busy.", "This is a general statement without specific sensory details."),
    ("Work was happening at the site.", "This gives no image at all of sound, sight, or activity.")],
   "The specific sounds (“pounded,” “roar”) and sight (“dust clouded the air”) let you picture and hear the scene.",
   "A vivid sentence usually combines at least two senses, like sound and sight.")

mc("visualize", "RL.5.7", 2, "Read: “The abandoned lighthouse stood crooked against the gray sky, its once-white paint now streaked with rust-colored tears.” What does the phrase “rust-colored tears” help you picture?",
   "Long reddish-brown streaks of rust running down the lighthouse like tears on a face",
   [("A lighthouse that is freshly painted", "The description shows rust and streaking, not fresh paint."),
    ("A lighthouse crying real tears", "This is a figurative comparison, not a literal event happening to the lighthouse.")],
   "Comparing the rust streaks to tears helps you visualize thin, dripping lines of reddish-brown color.",
   "When a description compares an object's marks to something human, like tears, picture the shape and movement, not the literal meaning.")

mc("visualize", "RL.5.7", 2, "Which revision gives the clearest visual picture of “The kitchen was a mess”?",
   "Flour dusted every counter, and dirty pans were stacked in a wobbling tower by the sink.",
   [("The kitchen needed to be cleaned.", "This states a conclusion without any specific images."),
    ("Someone had used the kitchen a lot.", "This is vague and gives no picture of what the mess actually looked like.")],
   "Specific images like “flour dusted every counter” and “a wobbling tower” of pans let you picture the mess clearly.",
   "Replace a vague judgment word like “mess” with the specific sights that prove it.")

mc("visualize", "RL.5.7", 3, "Read: “The violinist's bow glided across the strings, drawing out a note that seemed to hang, trembling, in the silent hall.” What should this help you picture and hear?",
   "A smooth, gentle bow movement producing one long, delicate note in a completely quiet room",
   [("A loud, fast song played to a cheering crowd", "The description shows a slow, delicate note in a silent hall, not a loud, fast performance."),
    ("A violin that is broken and silent", "The sentence describes a note being played, not a broken, silent instrument.")],
   "“Glided,” “trembling,” and “silent hall” combine sight and sound to create one delicate, vivid moment.",
   "In vivid writing, often one small action is stretched out with detail to slow the reader down and let them picture it fully.")

mc("visualize", "RL.5.7", 3, "Which sentence best lets a reader visualize the exact texture of the bark described?",
   "The tree's bark was rough and deeply grooved, like the cracked surface of dry desert mud.",
   [("The tree's bark was interesting to look at.", "This is a vague opinion, not a specific visual or textural detail."),
    ("The tree had bark on its trunk.", "This states a basic fact with no descriptive detail at all.")],
   "The comparison to “cracked, dry desert mud” gives a specific texture and pattern you can picture.",
   "A strong comparison borrows an image the reader already knows to describe something new.")

tf("visualize", "RL.5.7", 3, "A writer who wants readers to visualize a scene should rely mainly on vague words like “nice” or “bad” rather than specific sensory details.", False,
   "Vague words give almost no picture; specific sensory details are what let a reader visualize a scene clearly.",
   "The more specific and sensory a detail is, the easier it is to picture.")

mc("visualize", "RL.5.7", 4, "Read: “Steam hissed from the kettle as the old radiator clanked and groaned, filling the cramped apartment with a stubborn warmth.” What mood does this imagery help you picture?",
   "A small, slightly worn but cozy and warm space",
   [("A large, cold, modern apartment", "The sentence describes a cramped, warm space with an old radiator, not a large cold one."),
    ("An apartment with no heating at all", "The radiator and “stubborn warmth” show that the space is being heated.")],
   "Details like “hissed,” “clanked,” “cramped,” and “stubborn warmth” together create a picture of a worn but cozy home.",
   "Several small sensory details often combine to create one overall feeling, not just a single image.")

mc("visualize", "RL.5.7", 4, "Which sentence most clearly helps you visualize the exact moment a wave breaks?",
   "The wave curled, hung for an instant like a wall of glass, then collapsed into a roar of white foam.",
   [("The wave was big and broke on the beach.", "This states the general event without any specific, moment-by-moment imagery."),
    ("There was a wave in the ocean.", "This gives no visual detail about the wave's shape, motion, or sound.")],
   "The step-by-step details (“curled,” “hung,” “collapsed”) let you picture the wave breaking in slow motion.",
   "Breaking a single action into smaller visual steps helps a reader picture it more vividly.")

mc("visualize", "RL.5.7", 5, "Read: “The attic smelled of dust and old paper, sunlight slicing through cracks in the boards and lighting thin trails of floating dust.” Which detail most sharpens the visual picture of light in the room?",
   "sunlight slicing through cracks in the boards",
   [("the attic smelled of dust and old paper", "This describes smell, not a visual picture of light."),
    ("the attic was old", "This is a general fact and does not describe how the light looked.")],
   "“Slicing through cracks” gives a sharp, specific image of narrow beams of light cutting through the dark attic.",
   "When a question asks about visualizing light specifically, look for the detail that describes light's shape or movement.")

dd("visualize", "RL.5.7", 5, "Which phrase creates the clearest visual image of movement? “The eagle ____ over the canyon, barely moving its wings.”",
   "glided silently",
   [("flew around", "This is a general phrase that gives little specific visual detail."),
    ("was in the sky", "This only states a location, with no image of motion at all.")],
   "“Glided silently” paints a specific picture of smooth, quiet, effortless flight.",
   "Choose the phrase that shows HOW an action happens, not just that it happens.")

mc("visualize", "RL.5.7", 6, "Read: “Cracks spread slowly across the dry riverbed, each one deepening under a sky that offered no clouds, no relief, no rain.” What feeling does this imagery create about the drought?",
   "A feeling of helplessness and endless dryness, built through repeated images of cracking earth and an empty sky",
   [("A feeling of hope that rain is coming soon", "The repeated words “no clouds, no relief, no rain” suggest the opposite of hope."),
    ("A feeling of excitement about a coming storm", "Nothing in the description suggests a storm is approaching.")],
   "The spreading cracks and the repeated “no” phrases build a picture of a drought with no end in sight.",
   "Repeated negative images in a row often build a stronger emotional picture than one image alone.")

mc("visualize", "RL.5.7", 6, "Which sentence lets a reader picture the chef's hands specifically, not just that she was cooking?",
   "Her fingers moved quickly, dicing the onion into perfect, even cubes without ever looking down.",
   [("She was a skilled cook.", "This states a conclusion, not a specific picture of her hands at work."),
    ("She cooked dinner for the family.", "This tells what happened, but gives no visual detail of her technique.")],
   "The specific action (“dicing,” “perfect, even cubes,” “without ever looking down”) shows her skill visually.",
   "Show skill or character through a specific, visual action rather than stating it directly.")

mc("visualize", "RL.5.7", 7, "Read: “The subway car rattled through the dark tunnel, fluorescent light flickering over rows of tired faces, each one lit for a second, then swallowed by shadow.” Which detail most sharpens the sense of motion and time passing?",
   "each one lit for a second, then swallowed by shadow",
   [("the subway car rattled through the tunnel", "This describes the sound and general motion, but not the repeating flicker of light and shadow."),
    ("rows of tired faces", "This describes who is there, not the passing rhythm of light and time.")],
   "The repeating pattern of light and shadow over each face creates a picture of time passing quickly, moment by moment.",
   "A repeating visual pattern, like light flickering again and again, can show motion and time passing at once.")

mc("visualize", "RL.5.7", 7, "Which pair of images best helps a reader visualize a character's exhaustion turning into relief?",
   "Her shoulders sagged under the weight of the pack; then, setting it down, she felt her spine straighten and her breath come easy.",
   [("She was tired. Then she felt better.", "This states the change in feeling without any specific visual or physical images."),
    ("She finished the hike and felt good.", "This tells the outcome but gives no image of her body before or after.")],
   "The specific body images (“shoulders sagged,” “spine straighten,” “breath come easy”) let you picture the shift from exhaustion to relief.",
   "Show an emotional change through two contrasting physical images, not a direct statement of feeling.")

mc("visualize", "RL.5.7", 4, "Read: “The blacksmith's hammer rang against the glowing orange iron, scattering a shower of tiny sparks across the dim forge.” What should this help you picture?",
   "Bright orange-hot metal being struck, with sparks flying across a dark workshop",
   [("A cold, quiet workshop with no activity", "The sentence describes ringing hammer blows and glowing iron, not stillness or cold."),
    ("A blacksmith resting after finishing work", "The action described, striking hot iron, shows the blacksmith actively working, not resting.")],
   "“Glowing orange iron” and “a shower of tiny sparks” combine color and motion into one vivid image.",
   "Picture the light source first, then the motion it creates, to build the full image.")

mc("visualize", "RL.5.7", 5, "Read: “Rows of apple trees bent under the weight of their fruit, red globes glowing between dark green leaves in the late afternoon sun.” Which detail most sharpens the picture of the apples themselves?",
   "red globes glowing between dark green leaves",
   [("rows of apple trees bent under the weight of their fruit", "This describes the trees' shape, not a close-up image of the individual apples."),
    ("the late afternoon sun", "This describes the lighting condition, not the apples' appearance.")],
   "Comparing the apples to glowing “red globes” gives a clear, specific color and shape to picture.",
   "When a question asks about one object within a bigger scene, find the detail describing that object specifically.")

mc("visualize", "RL.5.7", 6, "Read: “Snow swallowed the road ahead, headlights carving two pale, shrinking tunnels of light through the swirling white.” What feeling does this imagery create about the drive?",
   "A feeling of danger or disorientation, since the driver can barely see the road through the blinding snow",
   [("A feeling of safety and clear visibility", "“Swallowed the road” and “swirling white” suggest poor visibility, not safety."),
    ("A feeling of excitement about a snowball fight", "The imagery describes a difficult, limited-visibility drive, not a playful snow scene.")],
   "“Swallowed,” “shrinking tunnels of light,” and “swirling white” together build a sense of a dangerous, disorienting drive.",
   "Notice how an author's word choice about sight and size can create fear or tension.")

mc("visualize", "RL.5.7", 7, "Read: “Backstage, ropes and sandbags hung in tangled coils from the rigging, while dancers in half-finished costumes darted past, pins still gleaming in unfinished hems.” Which detail most captures the controlled chaos of backstage preparation?",
   "dancers in half-finished costumes darted past, pins still gleaming in unfinished hems",
   [("ropes and sandbags hung in tangled coils from the rigging", "This describes the equipment overhead, not the frantic activity of the people preparing."),
    ("backstage was busy before the show", "This is a general statement with no specific visual detail.")],
   "The rushing dancers with unfinished costumes show movement and urgency, capturing the frantic energy of last-minute preparation.",
   "Look for the detail that shows people in mid-action, not just objects sitting still.")

# ================================================================== pronoun-homophones (L.4.1.g / L.5.1 / L.6.1)
grade(4)

dd("pronoun-homophones", "L.4.1.g", 1, "Choose the correct word: “____ going to be late if we do not hurry.”",
   "We're",
   [("Were", "“Were” is a past-tense verb, not a contraction of “we are.”"),
    ("Where", "“Where” asks about a place, not “we are.”")],
   "“We're” is the contraction of “we are.”",
   "we're = we are; were = past tense of “are.”")

dd("pronoun-homophones", "L.4.1.g", 1, "Choose the correct word: “The puppy wagged ____ tail happily.”",
   "its",
   [("it's", "“It's” means “it is,” which does not fit here."),
    ("its'", "This spelling is not a real word.")],
   "“Its” shows that the tail belongs to the puppy.",
   "its = belonging to it; it's = it is.")

mc("pronoun-homophones", "L.4.1.g", 2, "Which sentence uses “to,” “too,” and “two” correctly?",
   "I have two apples, and I want to eat one too.",
   [("I have too apples, and I want to eat one two.", "“Too” and “two” are swapped here."),
    ("I have two apples, and I want two eat one too.", "“Two” should be “to” before a verb."),
    ("I have to apples, and I want too eat one two.", "All three words are used incorrectly.")],
   "“Two” is a number, “to” goes before a verb, and “too” means “also.”",
   "two = the number; to = direction/verb; too = also.")

err("pronoun-homophones", "L.4.1.g", 2, ["Please put", " you're books", " back on the shelf", " when you finish."], 1, " your books",
    "The books belong to “you,” so the correct word is “your,” not the contraction “you're.”",
    "your = belongs to you; you're = you are.")

dd("pronoun-homophones", "L.4.1.g", 3, "Choose the correct word: “____ is my seat on the bus.”",
   "This",
   [("These", "“These” is plural and does not match “is.”"),
    ("That's", "“That's” would need a different sentence structure here.")],
   "“This” matches the singular verb “is.”",
   "Match singular pronouns with singular verbs.")

mc("pronoun-homophones", "L.4.1.g", 3, "Which sentence uses “whose” and “who's” correctly?",
   "Who's bringing the snacks, and whose idea was the picnic?",
   [("Whose bringing the snacks, and who's idea was the picnic?", "“Whose” and “who's” are swapped here."),
    ("Who's bringing the snacks, and who's idea was the picnic?", "The second “who's” should be “whose” to show ownership."),
    ("Whose bringing the snacks, and whose idea was the picnic?", "The first word should be “who's,” meaning “who is.”")],
   "“Who's” means “who is”; “whose” shows ownership.",
   "who's = who is; whose = belonging to whom.")

mc("pronoun-homophones", "L.4.1.g", 4, "Which sentence uses its and it's correctly?",
   "It's going to rain, so the dog hid in its bed.",
   [("Its going to rain, so the dog hid in it's bed.", "“Its” and “it's” are swapped here."),
    ("It's going to rain, so the dog hid in it's bed.", "The second word should be “its” to show ownership."),
    ("Its going to rain, so the dog hid in its bed.", "The first word should be “it's,” meaning “it is.”")],
   "“It's” means “it is”; “its” shows ownership.",
   "it's = it is; its = belonging to it.")

dd("pronoun-homophones", "L.4.1.g", 4, "Choose the correct word: “____ not sure where my shoes are.”",
   "I'm",
   [("Im", "This is missing the apostrophe needed for the contraction."),
    ("I am'", "The apostrophe is placed incorrectly for this contraction.")],
   "“I'm” is the contraction of “I am.”",
   "Contractions use an apostrophe to show missing letters.")

tf("pronoun-homophones", "L.4.1.g", 5, "In the sentence “They're planning to paint their fence,” both underlined words are spelled correctly for their meanings.", True,
   "“They're” correctly means “they are,” and “their” correctly shows ownership of the fence.",
   "Check each homophone separately: does it mean “they are,” show ownership, or name a place?")

err("pronoun-homophones", "L.4.1.g", 5, ["The team celebrated", " they're victory", " after the final", " buzzer sounded."], 1, " their victory",
    "The victory belongs to the team, so the correct word is “their,” not the contraction “they're.”",
    "If you can replace it with “they are” and it still makes sense, use “they're.”")

mc("pronoun-homophones", "L.4.1.g", 6, "Which sentence is completely correct?",
   "They're sure their new puppy will love its toy over there.",
   [("There sure they're new puppy will love it's toy over their.", "Every homophone in this sentence is used incorrectly."),
    ("Their sure there new puppy will love its toy over they're.", "“Their” and “there” are swapped, and “they're” is used where “there” belongs."),
    ("They're sure their new puppy will love it's toy over there.", "“It's” should be “its” to show the toy belongs to the puppy.")],
   "“They're” = they are, “their” = belonging to them, “its” = belonging to it, and “there” = a place.",
   "Test each homophone on its own by saying what it should mean in context.")

grade(5)

dd("pronoun-homophones", "L.5.1", 1, "Choose the correct word: “Please turn in ____ assignment before Friday.”",
   "your",
   [("you're", "“You're” means “you are,” which does not fit before “assignment.”"),
    ("yore", "“Yore” means a long time ago and does not fit here.")],
   "“Your” shows the assignment belongs to you.",
   "your = belonging to you; you're = you are.")

dd("pronoun-homophones", "L.5.1", 1, "Choose the correct word: “____ going to arrive late if the bus is delayed again.”",
   "They're",
   [("Their", "“Their” shows ownership and does not fit before “going.”"),
    ("There", "“There” refers to a place and does not fit before “going.”")],
   "“They're” is the contraction of “they are.”",
   "Say the full phrase “they are” to check if the contraction fits.")

mc("pronoun-homophones", "L.5.1", 2, "Which sentence correctly uses “affect” as a verb?",
   "The heavy rain will affect the farmers' harvest this season.",
   [("The heavy rain will effect the farmers' harvest this season.", "“Effect” is usually a noun; the verb form needed here is “affect.”"),
    ("The heavy rain will have an affect on the farmers' harvest.", "After “an,” a noun is needed, so this should be “effect.”")],
   "“Affect” is the verb meaning “to influence.”",
   "Remember: Affect is usually a verb (Action); Effect is usually a noun (End result).")

err("pronoun-homophones", "L.5.1", 2, ["The storm had", " a huge affect", " on the coastal", " town's economy."], 1, " a huge effect",
    "After “a huge,” a noun is needed, and the noun form is “effect,” not the verb “affect.”",
    "If a describing word like “huge” comes before it, you likely need the noun “effect.”")

dd("pronoun-homophones", "L.5.1", 3, "Choose the correct word: “____ been working on this project for weeks.”",
   "They've",
   [("Theyve", "This is missing the apostrophe needed for the contraction."),
    ("There've", "“There've” would mean “there have,” which does not match the meaning here.")],
   "“They've” is the contraction of “they have.”",
   "Say the sentence with “they have” to test whether the contraction fits.")

mc("pronoun-homophones", "L.5.1", 3, "Which sentence uses “principal” and “principle” correctly?",
   "The principal explained the school's main principle: respect for everyone.",
   [("The principle explained the school's main principal: respect for everyone.", "“Principle” and “principal” are swapped here."),
    ("The principal explained the school's main principal: respect for everyone.", "The second word should be “principle,” meaning a rule or belief.")],
   "“Principal” names the school leader; “principle” means a basic rule or belief.",
   "principal = a person (or main); principle = a rule.")

match("pronoun-homophones", "L.5.1", 4, "Match each word with its correct meaning.",
      [("stationary", "not moving"), ("stationery", "writing paper"), ("compliment", "a nice remark"), ("complement", "something that completes another thing")],
      "These pairs sound alike but have very different meanings and spellings.",
      "Link the meaning to a memory trick: stationERy has an E for 'envelope/paper.'")

mc("pronoun-homophones", "L.5.1", 4, "Which sentence uses “who's” and “whose” correctly?",
   "Whose backpack is this, and who's responsible for leaving it here?",
   [("Who's backpack is this, and whose responsible for leaving it here?", "“Who's” and “whose” are swapped here."),
    ("Whose backpack is this, and whose responsible for leaving it here?", "The second word should be “who's,” meaning “who is.”")],
   "“Whose” shows ownership of the backpack; “who's” means “who is.”",
   "Replace the word with “who is”; if it still makes sense, use “who's.”")

dd("pronoun-homophones", "L.5.1", 5, "Choose the correct word: “____ bringing extra chairs for the guests.”",
   "She's",
   [("Shes", "This is missing the apostrophe needed for the contraction."),
    ("Her's", "This spelling is not a real word.")],
   "“She's” is the contraction of “she is.”",
   "The apostrophe replaces the missing letter “a” in “am.”")

err("pronoun-homophones", "L.5.1", 5, ["The two brothers", " could not agree", " who's turn", " it was to cook."], 2, " whose turn",
    "The turn belongs to one of the brothers, so the correct word is “whose,” not the contraction “who's.”",
    "If the word shows ownership, use “whose,” not “who's.”")

mc("pronoun-homophones", "L.5.1", 7, "Which revision correctly fixes this sentence? “Its unclear whose going to present the project, but there sure its ready.”",
   "It's unclear who's going to present the project, but they're sure it's ready.",
   [("Its unclear who's going to present the project, but their sure its ready.", "“Its” at the start should be “it's,” and “their” should be “they're.”"),
    ("It's unclear whose going to present the project, but there sure its ready.", "“Whose” should be “who's,” and “there” should be “they're.”"),
    ("Its unclear whose going to present the project, but there sure it's ready.", "“Its” and “whose” should be “it's” and “who's,” and “there” should be “they're.”")],
   "Each contraction (it's, who's, they're) must mean “it is,” “who is,” and “they are.”",
   "Fix one homophone at a time, checking its exact meaning in context.")

grade(6)

dd("pronoun-homophones", "L.6.1", 1, "Choose the correct word: “The scientists published ____ findings in a respected journal.”",
   "their",
   [("there", "“There” refers to a place, which does not fit before “findings.”"),
    ("they're", "“They're” means “they are,” which does not fit before “findings.”")],
   "“Their” shows the findings belong to the scientists.",
   "their = belonging to them; there = a place; they're = they are.")

mc("pronoun-homophones", "L.6.1", 1, "Which sentence correctly uses “farther” and “further”?",
   "We can discuss this further once we drive a bit farther down the road.",
   [("We can discuss this farther once we drive a bit further down the road.", "“Farther” and “further” are swapped; “farther” refers to physical distance."),
    ("We can discuss this further once we drive a bit further down the road.", "“Further” should be “farther” when describing physical distance.")],
   "“Farther” describes physical distance; “further” describes extent or degree, like discussion.",
   "farther = physical distance; further = extent or degree.")

err("pronoun-homophones", "L.6.1", 2, ["The scientists wanted to", " explore the topic", " farther", " before publishing."], 2, " further",
    "Exploring a topic in more depth uses “further,” not “farther,” which describes physical distance.",
    "further = more discussion or depth; farther = more physical distance.")

dd("pronoun-homophones", "L.6.1", 2, "Choose the correct word: “____ notebook got left behind on the bus seat?”",
   "Whose",
   [("Who's", "“Who's” means “who is,” which does not fit before “notebook.”"),
    ("Who've", "“Who've” means “who have,” which does not fit the sentence.")],
   "“Whose” shows ownership of the notebook.",
   "whose = ownership; who's = who is.")

mc("pronoun-homophones", "L.6.1", 3, "Which sentence correctly uses “it's” and “its”?",
   "It's clear that the committee has made its final decision.",
   [("Its clear that the committee has made it's final decision.", "“Its” and “it's” are swapped here."),
    ("It's clear that the committee has made it's final decision.", "The second word should be “its” to show ownership.")],
   "“It's” means “it is”; “its” shows the decision belongs to the committee.",
   "it's = it is; its = belonging to it.")

match("pronoun-homophones", "L.6.1", 3, "Match each word with its correct meaning.",
      [("elicit", "to draw out a response"), ("illicit", "not legal"), ("allusion", "an indirect reference"), ("illusion", "something that deceives the eye or mind")],
      "These advanced homophone pairs are easy to confuse but have distinct meanings in formal writing.",
      "Notice the small spelling differences (e vs. i, one l vs. two) and link each to its meaning.")

dd("pronoun-homophones", "L.6.1", 4, "Choose the correct word: “The lawyer presented a strong ____ for her client's innocence.”",
   "case",
   [("cite", "“Cite” means to quote or reference a source, not an argument."),
    ("sight", "“Sight” refers to vision, which does not fit this sentence.")],
   "A lawyer presents a legal “case,” not a “cite” or “sight.”",
   "Think about which homophone matches the specific meaning needed in context.")

err("pronoun-homophones", "L.6.1", 4, ["The historian wanted to", " site a reliable", " source in", " her research paper."], 1, " cite a reliable",
    "“Cite” means to quote or credit a source, which fits the meaning; “site” refers to a location.",
    "cite = to quote/reference; site = a location; sight = vision.")

mc("pronoun-homophones", "L.6.1", 5, "Which sentence correctly uses “who's” and “whose”?",
   "Who's going to explain whose project was copied?",
   [("Whose going to explain who's project was copied?", "“Whose” and “who's” are swapped here."),
    ("Who's going to explain who's project was copied?", "The second word should be “whose,” showing ownership of the project.")],
   "“Who's” means “who is”; “whose” shows ownership of the project.",
   "Test each word by substituting “who is” to see if it still makes sense.")

mc("pronoun-homophones", "L.6.1", 6, "Which revision correctly fixes this sentence? “Its unclear who's responsible, but there confident the affect will be positive.”",
   "It's unclear who's responsible, but they're confident the effect will be positive.",
   [("It's unclear whose responsible, but their confident the effect will be positive.", "“Whose” should be “who's,” and “their” should be “they're.”"),
    ("Its unclear who's responsible, but they're confident the affect will be positive.", "“Its” should be “it's,” and “affect” should be the noun “effect.”"),
    ("It's unclear who's responsible, but there confident the affect will be positive.", "“There” should be “they're,” and “affect” should be the noun “effect.”")],
   "Each homophone must match its intended meaning: it's = it is, who's = who is, they're = they are, effect = the noun result.",
   "Correct multi-error sentences one homophone at a time.")

# ================================================================== drama-elements (RL.4.5 / RL.5.5 / RL.6.5)
grade(4)

mc("drama-elements", "RL.4.5", 1, "In a play, what is the list of characters printed at the beginning called?",
   "the cast list",
   [("the script", "The script is the full written text of the play, not just the character list."),
    ("the stage direction", "Stage directions tell actors how to move or speak; they are not a character list.")],
   "The cast list names every character who appears in the play.",
   "Look at the very top of a play script to find the cast list.")

mc("drama-elements", "RL.4.5", 2, "In the line “JAMAL: (whispering) I think someone is behind us,” what do the words in parentheses show?",
   "a stage direction telling the actor HOW to say the line",
   [("the name of the character speaking", "The character's name, Jamal, appears outside the parentheses, before the colon."),
    ("words the audience reads but never hears", "Stage directions guide the actor's performance; they shape what the audience hears and sees.")],
   "Words in parentheses are stage directions that tell the actor how to perform the line.",
   "Stage directions are usually set apart in parentheses or italics.")

mc("drama-elements", "RL.4.5", 3, "What is the setting of a play usually described by at the start of a scene?",
   "a stage direction describing the place and time",
   [("the cast list", "The cast list names the characters, not the setting."),
    ("a character's dialogue", "Dialogue is what characters say; the setting is usually described separately.")],
   "A stage direction at the start of a scene often tells where and when the action happens.",
   "Check the opening stage direction of a scene for setting details.")

dd("drama-elements", "RL.4.5", 3, "In a play, the words characters speak to one another are called ____.",
   "dialogue",
   [("narration", "Narration describes action in a story, but in a play, speech between characters is dialogue."),
    ("a stage direction", "Stage directions tell actors how to move, not what to say.")],
   "Dialogue is the spoken conversation between characters in a play.",
   "If it is in quotation marks or follows a character's name, it is likely dialogue.")

mc("drama-elements", "RL.4.5", 4, "A play is divided into two parts labeled “Scene 1” and “Scene 2.” What does this tell you?",
   "The action happens in two different times or places",
   [("The play has two different casts of characters", "A scene change usually shows a shift in time or place, not a different cast."),
    ("The play is finished after Scene 1", "Numbering scenes shows the play continues into a new part, not that it has ended.")],
   "A new scene usually signals a change in setting or time within the play.",
   "Scene breaks often mean “somewhere else” or “some time later.”")

mc("drama-elements", "RL.4.5", 4, "Which detail BEST shows that a stage direction is giving information about a character's feelings?",
   "“(LINA sighs and sits down heavily)”",
   [("“LINA: Where is my backpack?”", "This is spoken dialogue, not a stage direction about feelings."),
    ("“SCENE 2: The classroom, later that day”", "This stage direction describes setting, not a character's feelings.")],
   "“Sighs” and “sits down heavily” show tiredness or frustration through action.",
   "Stage directions about feelings often describe HOW a character moves or sounds.")

mc("drama-elements", "RL.4.5", 5, "How is reading a play DIFFERENT from reading a short story about the same events?",
   "A play shows events mainly through dialogue and stage directions, without a narrator describing thoughts.",
   [("A play never has a setting.", "Plays do have settings, often described in stage directions."),
    ("A play cannot have more than one character.", "Plays commonly have multiple characters speaking to one another.")],
   "Unlike a story, a play relies on characters' spoken words and stage directions instead of narration.",
   "Ask: is a narrator describing what happens, or are the characters showing it through speech and action?")

match("drama-elements", "RL.4.5", 5, "Match each part of a play with its purpose.",
      [("Cast list", "Names every character in the play"),
       ("Stage direction", "Tells actors how to move or speak"),
       ("Dialogue", "The words characters say to each other"),
       ("Scene", "A section of the play set in one time and place")],
      "Each part of a play script serves a different purpose for actors and readers.",
      "Picture how a director would use each part when staging the play.")

mc("drama-elements", "RL.4.5", 6, "Why might a playwright include the stage direction “(the lights dim slowly)” at the end of a scene?",
   "To signal to the audience that the scene is ending and time or mood is shifting",
   [("To tell the actors to leave the stage immediately", "Dimming lights signals a change, not necessarily an instant exit."),
    ("To show that a new character is about to enter", "Dimming lights more commonly signals an ending or mood shift, not a new entrance.")],
   "Lighting changes are a common way for playwrights to show a scene ending or a mood shifting.",
   "Stage directions about lights or sound often signal transitions between scenes.")

mc("drama-elements", "RL.4.5", 6, "In a two-character scene, why might a playwright have one character enter LATE, after the other has been speaking alone?",
   "To build suspense or show the audience information before the second character learns it",
   [("Because the playwright forgot to include the character earlier", "A planned entrance is a deliberate choice, not a mistake."),
    ("Because the play is too short for both characters to appear together", "Timing an entrance is a storytelling choice, unrelated to the play's length.")],
   "Delaying an entrance lets the audience learn something the other character does not yet know, building suspense.",
   "Ask why a playwright might want the audience to know more than a character does.")

grade(5)

mc("drama-elements", "RL.5.5", 1, "What is the purpose of the cast list at the top of a play script?",
   "To tell the reader who all the characters are before the action begins",
   [("To summarize the entire plot of the play", "A cast list names characters; it does not summarize events."),
    ("To describe the setting of each scene", "Setting is usually described in stage directions, not the cast list.")],
   "Readers and directors use the cast list to know every character before the play starts.",
   "A cast list is like a program handed out before a live performance.")

mc("drama-elements", "RL.5.5", 2, "Which line from a play script is a stage direction rather than dialogue?",
   "“(SAMI crosses the room and opens the window)”",
   [("“Please open the window, Sami.”", "This is dialogue, a line spoken by a character."),
    ("“SAMI: It's getting warm in here.”", "This is dialogue spoken by the character Sami.")],
   "Text in parentheses describing an action is a stage direction, not spoken dialogue.",
   "Stage directions describe movement or tone; dialogue is what characters actually say.")

tf("drama-elements", "RL.5.5", 2, "A director reading a script could safely skip any bracketed instructions and still know every line the audience should hear.", True,
   "Bracketed instructions tell actors how to move or sound, so skipping them still leaves every spoken line of dialogue intact.",
   "Separate what a character SAYS from notes about how they say it.")

mc("drama-elements", "RL.5.5", 3, "Why might a playwright divide a play into two separate scenes instead of writing it as one continuous scene?",
   "To show a clear jump in time or a change in location between the two parts of the story",
   [("To make the play seem shorter than it really is", "Scene breaks are about structure and story, not shortening the play's length."),
    ("Because each scene needs a completely different set of characters", "Scenes can share the same characters; the break usually signals time or place, not new characters.")],
   "A new scene often tells the audience that time has passed or the setting has changed.",
   "A scene break is similar to a chapter break in a story — it marks a shift.")

mc("drama-elements", "RL.5.5", 4, "What does the stage direction “(RANA, covering her face, turns away)” tell the audience about Rana?",
   "She likely feels embarrassed, ashamed, or upset about something",
   [("She is about to leave the stage permanently", "The direction shows a gesture and turn, not a full exit from the play."),
    ("She cannot see the other characters", "Covering her face shows an emotional reaction, not an actual loss of sight.")],
   "Covering one's face and turning away are common gestures that show strong emotion like embarrassment.",
   "Read stage directions about the body the same way you would read a character's inner thoughts in a story.")

match("drama-elements", "RL.5.5", 5, "Match each part of a play with its example.",
      [("Stage direction", "(KHALID paces nervously by the door)"),
       ("Dialogue", "KHALID: I can't believe we're already late!"),
       ("Setting description", "A cramped office, late at night, one lamp still lit"),
       ("Scene heading", "Scene 2: The Following Morning")],
      "Each part of a script has a different function, shown by its format and placement.",
      "Notice the format: parentheses for action, a colon for dialogue, and bold headings for new scenes.")

mc("drama-elements", "RL.5.5", 6, "A playwright includes an ASIDE, where one character speaks directly to the audience while the other characters do not react. What is the purpose of an aside?",
   "To let the audience know a character's private thought that the other characters cannot hear",
   [("To let every character on stage hear a secret at once", "An aside is meant to be heard only by the audience, not the other characters."),
    ("To end the scene immediately", "An aside is a moment within a scene, not a signal that the scene is ending.")],
   "An aside reveals private thoughts to the audience without the other characters knowing.",
   "If a character speaks and the others on stage do not react, it is likely an aside.")

mc("drama-elements", "RL.5.5", 6, "Why might a playwright use very short, clipped dialogue (one or two words per line) during an argument scene?",
   "To make the exchange feel fast, tense, and heated, like two people quickly interrupting each other",
   [("To show the characters are calm and relaxed", "Short, clipped lines usually suggest tension or urgency, not calmness."),
    ("To make the scene easier for actors to memorize", "Line length is a storytelling choice about pacing, not a memorization shortcut.")],
   "Short back-and-forth lines speed up the rhythm of a scene, which matches the tension of an argument.",
   "Notice how the length and pace of dialogue can mirror the emotion of a scene.")

mc("drama-elements", "RL.5.5", 3, "A stage direction reads “(the lights come up slowly on an empty kitchen, dishes piled in the sink)” at the start of Scene 1. What does this direction establish?",
   "The setting and mood of the scene before any character has spoken",
   [("The names of the characters who will appear", "This direction describes a place and objects, not any character names."),
    ("The ending of the play", "An opening stage direction for Scene 1 sets up the beginning, not the ending.")],
   "Opening stage directions often describe the setting and mood before dialogue begins.",
   "Read the first stage direction of a scene the way you would read the opening sentence of a story.")

mc("drama-elements", "RL.5.5", 7, "A playwright has a character repeat the same line, “Everything is fine,” three times across a scene, each time more shakily than the last. What is the likely purpose of this repetition?",
   "To reveal through the character's own words and tone that things are actually NOT fine",
   [("To remind the audience what the character's name is", "Repeating a line about feelings is not a device for reminding the audience of a name."),
    ("To show the play is almost over", "A repeated, shaky line signals emotional tension, not necessarily the play's ending.")],
   "Repeating a line with growing unsteadiness is a dramatic technique that reveals a character's true, hidden feelings.",
   "Watch for repeated lines performed differently each time — the change often reveals the truth.")

grade(6)

mc("drama-elements", "RL.6.5", 1, "What is the dramatic function of a NARRATOR who occasionally speaks directly to the audience in a play?",
   "To give the audience context or information that the characters cannot provide through dialogue alone",
   [("To replace all of the dialogue between characters", "A narrator typically adds context alongside dialogue, not instead of it."),
    ("To act as a silent character who never speaks", "A narrator who speaks directly to the audience is, by definition, speaking, not silent.")],
   "A narrator in a play can step outside the scene to give background information the characters would not naturally say aloud.",
   "Ask what information the audience needs that would feel unnatural coming from a character.")

mc("drama-elements", "RL.6.5", 2, "A character speaks in an ASIDE: “(to the audience) If only they knew what I was planning.” What does this aside reveal?",
   "The character has a hidden plan or motive that the other characters on stage do not know about",
   [("The character is confused about what to do next", "The line shows the character has a clear plan, not confusion."),
    ("The character wants the other characters to hear this line", "An aside is specifically meant to be heard by the audience, not the other characters.")],
   "An aside lets the audience in on a secret the character is deliberately keeping from the others.",
   "Asides often create dramatic irony: the audience knows something a character on stage does not.")

tf("drama-elements", "RL.6.5", 2, "A SOLILOQUY is a long speech a character gives alone on stage, usually revealing their private thoughts or feelings.", True,
   "A soliloquy is spoken when a character is alone, letting the audience hear their inner thoughts directly.",
   "Soli- means “alone”: a soliloquy is spoken by one character with no one else on stage.")

mc("drama-elements", "RL.6.5", 3, "How does the stage direction “(pausing, then smiling for the first time)” contribute to the audience's understanding of the plot?",
   "It signals a turning point, showing the character's attitude is shifting after something important just happened",
   [("It shows the character has been smiling throughout the entire scene", "“For the first time” signals this smile is new, not a continuation of earlier behavior."),
    ("It tells the audience the play is about to end", "A shift in a character's expression does not by itself signal the end of the play.")],
   "Noting the FIRST smile after a pause signals a meaningful emotional shift tied to the plot.",
   "Stage directions that mark a “first” reaction often highlight a turning point.")

mc("drama-elements", "RL.6.5", 4, "Why might a playwright divide a play into several short scenes rather than one long, continuous act?",
   "To let the story jump between different times, places, or groups of characters more efficiently",
   [("To make the play shorter overall", "Dividing into scenes changes structure and pacing, not necessarily total length."),
    ("Because each actor can only appear in one scene", "Actors commonly appear across multiple scenes in the same play.")],
   "Short scenes allow a playwright to shift time, place, or focus quickly without slowing down the story.",
   "Compare scene breaks to chapter breaks that let a story jump ahead or elsewhere.")

match("drama-elements", "RL.6.5", 5, "Match each dramatic element with how it contributes to the play.",
      [("Aside", "Reveals a character's private thought to the audience alone"),
       ("Soliloquy", "Lets a character reflect alone on stage at length"),
       ("Stage direction", "Guides an actor's movement, tone, or expression"),
       ("Scene change", "Shifts the time, place, or focus of the story")],
      "Each dramatic technique gives the playwright a different tool for shaping what the audience understands.",
      "Ask who is meant to hear or see each element: the audience alone, or everyone on stage.")

mc("drama-elements", "RL.6.5", 6, "A playwright has two characters speak in overlapping, interrupted dialogue during a crisis scene. What effect does this likely create?",
   "A feeling of chaos, urgency, or panic, since neither character lets the other finish speaking",
   [("A feeling of calm agreement between the characters", "Interrupted, overlapping dialogue usually signals conflict or urgency, not calm agreement."),
    ("A signal that the scene is a flashback", "Overlapping dialogue reflects pacing and tension, not a shift in time period.")],
   "Interrupting and overlapping speech mirrors the panic and urgency of a crisis.",
   "Dialogue patterns, like interruptions, often mirror the emotional state of a scene.")

mc("drama-elements", "RL.6.5", 7, "Which choice would most effectively show dramatic irony in a scene?",
   "The audience hears a character's aside revealing a secret plan, while the other characters on stage remain unaware of it.",
   [("A character explains their plan directly to every other character on stage.", "If every character knows the plan, there is no gap in knowledge, so there is no dramatic irony."),
    ("The narrator summarizes events the audience has already watched happen.", "Dramatic irony requires a gap between what the audience knows and what characters know, not a repeated summary.")],
   "Dramatic irony depends on the audience knowing something that at least one character on stage does not.",
   "Look for a gap between what the AUDIENCE knows and what a CHARACTER knows.")

mc("drama-elements", "RL.6.5", 3, "In a script, one character's dialogue is written in short, fragmented sentences, while another character's dialogue is long and flowing. What does this contrast most likely reveal?",
   "A difference in the two characters' personalities or emotional states, such as one being anxious and one being calm",
   [("A printing mistake in the script", "A deliberate contrast in sentence length across a whole script is a stylistic choice, not an error."),
    ("That one character is lying and the other is telling the truth", "Sentence length and flow reflect personality or emotion; they are not a reliable sign of honesty.")],
   "Playwrights often use sentence length and rhythm in dialogue to suggest a character's personality or state of mind.",
   "Compare how characters speak, not just what they say, to learn about who they are.")

mc("drama-elements", "RL.6.5", 4, "A stage direction specifies that a prop, an old photograph, should be placed center stage and lit more brightly than anything else in the scene. What does this suggest about the photograph's role in the play?",
   "The photograph is likely important to the plot or a character's motivation, since the lighting draws the audience's attention to it",
   [("The photograph is just background decoration with no importance", "Deliberately highlighting a prop with lighting signals that it matters to the story."),
    ("The scene is about to end because of the lighting change", "A spotlight on a prop usually signals its importance within the scene, not that the scene is ending.")],
   "Stage directions that spotlight an object are a visual way for a playwright to show its importance without dialogue.",
   "Ask why a playwright would want the audience's eyes drawn to one specific object.")

# ================================================================== point-of-view (RL.4.6 / RL.5.6 / RL.6.6)
grade(4)

mc("point-of-view", "RL.4.6", 1, "Which sentence is written in FIRST-person point of view?",
   "I grabbed my umbrella and ran outside before the rain started.",
   [("She grabbed her umbrella and ran outside before the rain started.", "This sentence uses “she,” which is third person, not first person."),
    ("Omar grabbed his umbrella and ran outside before the rain started.", "This sentence names a character and uses “his,” which is third person.")],
   "First-person point of view uses pronouns like “I” and “my” to show the narrator is part of the story.",
   "Look for “I,” “me,” and “my” to spot first-person narration.")

mc("point-of-view", "RL.4.6", 2, "A story says: “Marcus felt nervous, but his sister Dina had no idea anything was wrong.” What does this tell you about the narrator's point of view?",
   "The narrator can see inside Marcus's feelings, which means this is third-person limited point of view.",
   [("The narrator is Marcus, speaking about himself", "If Marcus were narrating, the sentence would likely use “I,” not his name and “his.”"),
    ("The narrator knows every character's thoughts equally", "The narrator shares Marcus's feelings but says Dina has no idea, showing limited access, not full knowledge of everyone.")],
   "Because we know Marcus's feelings but not Dina's, the narrator is following one character closely in third person.",
   "Third-person limited follows one character's thoughts closely, not everyone's.")

dd("point-of-view", "RL.4.6", 2, "A sentence written from the narrator's own experience, using “I” and “me,” is written in ____ person.",
   "first",
   [("second", "Second person uses “you” to address the reader directly, not “I” or “me.”"),
    ("third", "Third person uses a character's name or pronouns like “he” or “she,” not “I.”")],
   "Using “I” and “me” signals first-person point of view.",
   "First person = “I”; third person = a character's name or he/she.")

mc("point-of-view", "RL.4.6", 3, "A story describes what every character is thinking and feeling, as well as events happening in two different places at once. What point of view is this?",
   "Third-person omniscient, because the narrator knows everything about every character",
   [("First person, because the narrator uses “I”", "A first-person narrator can only know their own thoughts, not everyone's."),
    ("Third-person limited, because the narrator follows one character closely", "Third-person limited follows only one character's thoughts, not everyone's at once.")],
   "A narrator who knows all characters' thoughts and events everywhere is using third-person omniscient point of view.",
   "Omniscient means “all-knowing” — the narrator sees and knows everything.")

mc("point-of-view", "RL.4.6", 3, "If a story about a soccer game were told by a player on the losing team, how might the ending feel DIFFERENT than if a neutral narrator told it?",
   "The ending might feel more disappointing or emotional, since the narrator personally experienced the loss.",
   [("The ending would describe exactly the same events in exactly the same way", "A personal narrator usually adds feelings and reactions that a neutral narrator would leave out."),
    ("The ending would focus only on the winning team's celebration", "A losing player would more likely focus on their own team's experience, not the winners' celebration.")],
   "A narrator who lived through the loss is likely to share personal feelings that a neutral narrator would not include.",
   "Think about how a narrator's own experience shapes which details and feelings get shared.")

mc("point-of-view", "RL.4.6", 4, "Which sentence shows a narrator using third-person point of view to describe only what one character knows?",
   "Tariq wondered why his friends were whispering, but he had no idea what they were planning.",
   [("I wondered why my friends were whispering, but I had no idea what they were planning.", "This sentence uses “I,” which is first person, not third person."),
    ("Tariq's friends were planning a surprise party for him.", "This sentence reveals information Tariq does not know, which would not fit a narrator limited to his point of view.")],
   "The sentence uses Tariq's name and pronouns while only sharing what HE knows, which is third-person limited.",
   "Third-person limited shares one character's thoughts, keeping other characters' secrets hidden.")

mc("point-of-view", "RL.4.6", 5, "If “The Lost Key” were told by the family dog instead of a human narrator, what would most likely change?",
   "The details noticed would focus on smells, sounds, and simple observations a dog would notice, not complex thoughts a human might have.",
   [("The plot events would be completely different from the original story", "Changing the narrator usually changes which details are noticed and shared, not necessarily the actual events."),
    ("The story would no longer have any characters in it", "Changing who tells the story does not remove the characters; it changes whose perspective is shown.")],
   "A dog narrator would likely notice different sensory details and would not understand complex human thoughts or plans.",
   "Think about what a narrator CAN and CANNOT realistically notice or understand.")

mc("point-of-view", "RL.4.6", 6, "A reader notices that one character in a story is often wrong about what is really happening, even though the narrator uses “I” throughout. What might this suggest about the narrator?",
   "The narrator may be unreliable, meaning readers should not fully trust everything they say.",
   [("The narrator must be lying on purpose about everything", "Being mistaken is different from deliberately lying; the narrator may simply be wrong, not dishonest."),
    ("The story must be written in third person", "The question states the narrator uses “I,” which means the story is written in first person.")],
   "A first-person narrator who is often mistaken may be an unreliable narrator, and readers must judge events carefully.",
   "First-person narrators can be mistaken or biased, so their view is not always the full truth.")

mc("point-of-view", "RL.4.6", 7, "How would the mood of a scary story about a haunted house most likely change if told from the point of view of a character who is NOT scared at all?",
   "The scene would likely feel calmer or even funny, since the narrator's own calm reaction changes how frightening the details seem.",
   [("The scene would automatically become twice as scary", "A narrator who is not scared tends to lower tension, not increase it."),
    ("The point of view would have no effect on the mood at all", "A narrator's emotional reaction strongly shapes how readers experience the mood of a scene.")],
   "A calm narrator's reactions can make even spooky details feel less frightening, shifting the story's mood.",
   "A narrator's own feelings color how readers experience the events described.")

grade(5)

mc("point-of-view", "RL.5.6", 1, "Which sentence shows third-person omniscient point of view?",
   "Nour believed the plan was perfect, but across town, her brother was already worrying it would fail.",
   [("Nour believed the plan was perfect, and she felt confident about it.", "This sentence only shares Nour's thoughts, which fits third-person limited, not omniscient."),
    ("I believed the plan was perfect, but I knew my brother was worried.", "Using “I” throughout makes this first person, not third-person omniscient.")],
   "The narrator knows both Nour's belief and her brother's worry happening elsewhere, which shows omniscient knowledge.",
   "Omniscient narrators can reveal thoughts and events in more than one place at once.")

mc("point-of-view", "RL.5.6", 1, "Which sentence is written in first-person point of view?",
   "I never expected my science project to actually work on the first try.",
   [("She never expected her science project to actually work on the first try.", "This uses “she,” which is third person, not first person."),
    ("You never expect your science project to work on the first try.", "This uses “you,” which is second person, not first person.")],
   "The pronouns “I” and “my” show the narrator is telling their own experience.",
   "First-person narrators use “I,” “me,” and “my” throughout.")

mc("point-of-view", "RL.5.6", 2, "From what point of view is this passage told? “Rania checked her phone again. She had no idea her friends were already planning something for her birthday.”",
   "Third-person limited, because the narrator shares only Rania's thoughts and not her friends' secret plans in detail",
   [("First person, because the passage uses “her” frequently", "“Her” is a third-person pronoun; first person would use “my” or “I.”"),
    ("Third-person omniscient, because the narrator reveals the friends' exact plans", "The passage only hints that a plan exists without revealing its details, unlike a fully omniscient narrator.")],
   "The narrator stays close to Rania's awareness, mentioning the friends' secret without fully revealing it, which fits limited third person.",
   "Third-person limited follows one character closely, hinting at but not fully revealing what others know.")

mc("point-of-view", "RL.5.6", 3, "If “The Science Fair Disaster” were narrated by the judge instead of the student whose project failed, what would most likely change?",
   "The focus would likely shift to the judge's impressions of many projects, rather than one student's personal feelings about their own failure.",
   [("The events of the science fair would be completely different", "Changing the narrator usually changes perspective and focus, not necessarily the actual events that occur."),
    ("The story would no longer include the student at all", "The student would likely still appear in the story; only the point of view describing them would change.")],
   "A judge would likely notice different details across many projects rather than focus deeply on one student's emotions.",
   "Consider what a new narrator would realistically notice, given their role in the story.")

mc("point-of-view", "RL.5.6", 3, "A reader notices the first-person narrator keeps insisting, “I definitely did nothing wrong,” while other clues in the story suggest otherwise. What might this suggest?",
   "The narrator may be unreliable, and readers should look for other evidence instead of only trusting the narrator's claims.",
   [("The narrator is definitely telling the complete truth", "Repeated insistence combined with contradicting clues is a common sign of an unreliable narrator, not proof of truth."),
    ("The story must be told in third person", "The question states the narrator uses “I,” which means the narration is first person, not third.")],
   "When a narrator's claims conflict with other details in the story, readers should question how reliable that narrator is.",
   "Compare a narrator's claims to the other evidence a story provides.")

tf("point-of-view", "RL.5.6", 4, "A narrator who knows the thoughts and feelings of every character in the story, no matter where they are, is using third-person omniscient point of view.", True,
   "Omniscient means “all-knowing,” which matches a narrator who can reveal any character's thoughts anywhere in the story.",
   "If the narrator can reveal ANY character's private thoughts, the point of view is omniscient.")

mc("point-of-view", "RL.5.6", 4, "How does a limited third-person point of view affect what readers know about side characters?",
   "Readers only learn about side characters through what the main character notices, says, or assumes about them.",
   [("Readers automatically know every side character's private thoughts", "Third-person limited restricts the narration to one character's awareness, not everyone's thoughts."),
    ("Readers learn nothing at all about side characters", "Readers can still learn about side characters indirectly, through the main character's observations.")],
   "Because the narration follows one character, information about others is filtered through that character's perspective.",
   "In limited third person, everything is filtered through one character's eyes and assumptions.")

mc("point-of-view", "RL.5.6", 5, "If a mystery story were told entirely from the thief's point of view instead of the detective's, how would readers' understanding of the story most likely change?",
   "Readers would likely know the truth behind the mystery immediately, which changes the suspense from “who did it” to “will the thief be caught.”",
   [("Readers would understand the story exactly the same way", "Switching the narrator to the person committing the crime dramatically changes what the reader already knows."),
    ("The detective would disappear from the story completely", "The detective could still appear in the story; only the narrating perspective would shift away from them.")],
   "Knowing the thief's perspective from the start removes the mystery of “who,” shifting the suspense to a different question.",
   "Consider what secret information the new narrator would already know from the very start.")

grade(6)

mc("point-of-view", "RL.6.6", 1, "A story is narrated in first person by a character who later admits, “I may have exaggerated a little.” What effect does this admission have on the reader?",
   "It makes readers question how accurate the earlier parts of the story really were.",
   [("It proves every earlier detail in the story was completely accurate", "An admission of exaggeration suggests the opposite — some earlier details may not be fully accurate."),
    ("It has no effect on how readers understand the story", "Learning a narrator may have exaggerated typically changes how much readers trust earlier narration.")],
   "Once a narrator admits to exaggerating, careful readers reconsider how reliable the earlier narration actually was.",
   "A narrator's own admission of bias is a strong clue to watch for throughout the rest of the story.")

mc("point-of-view", "RL.6.6", 2, "Which line would most clearly show that a poem is told from a first-person point of view?",
   "“I climbed the ladder, rung by rung, my hands remembering the cold metal.”",
   [("“She climbed the ladder, rung by rung, her hands remembering the cold metal.”", "This uses “she” and “her,” which is third person, not first person."),
    ("“You climb the ladder, rung by rung, your hands remembering the cold metal.”", "This uses “you” and “your,” which is second person, not first person.")],
   "The words “I” and “my” show the speaker is describing their own personal experience.",
   "First-person poems use “I” and “my” the same way first-person stories do.")

mc("point-of-view", "RL.6.6", 2, "What does an ASIDE reveal that the main dialogue of a scene does not?",
   "A character's private thought or plan that the audience learns but the other characters on stage do not",
   [("A fact that every character already knows", "An aside is specifically meant to share information other characters do NOT know."),
    ("A summary of what happened earlier in the play", "An aside typically reveals a private thought or plan, not a plot summary.")],
   "An aside gives the audience private access to a character's thoughts, creating a gap between what the audience and other characters know.",
   "An aside is a direct line to the audience's understanding, separate from the other characters.")

mc("point-of-view", "RL.6.6", 3, "A story shifts between three different characters' points of view in different chapters, each labeled with that character's name. What is the most likely purpose of this structure?",
   "To let readers understand the same events from multiple perspectives, each with different knowledge or feelings",
   [("To confuse the reader on purpose with no real reason", "Clearly labeled shifting perspectives are typically a deliberate structural choice, not random confusion."),
    ("To show that all three characters think and feel exactly the same way", "If all three characters felt identical, there would be little reason to show each one's separate point of view.")],
   "Multiple labeled points of view usually let readers compare how different characters understand the same events.",
   "Ask what new information or feeling each character's section adds that the others do not share.")

mc("point-of-view", "RL.6.6", 4, "How does narrating a story through a child's point of view, rather than an adult's, typically affect how certain events are understood?",
   "Some events may seem simpler, more confusing, or more exaggerated, since the narration reflects a child's limited understanding.",
   [("The events themselves would need to be entirely different", "A different narrator's perspective changes how events are understood, not necessarily which events occur."),
    ("A child's point of view always makes the story less emotional", "A child's limited understanding can actually heighten emotion, such as fear or wonder, rather than reduce it.")],
   "A child narrator's limited understanding can shape events to seem more confusing, frightening, or simplified than an adult might describe them.",
   "Consider what a narrator's age and experience would realistically let them notice or understand.")

mc("point-of-view", "RL.6.6", 5, "A novel is told in third person, but the narration only ever reveals what one character, Hana, is thinking. What is the effect of keeping this consistent throughout the book?",
   "Readers build a strong, consistent understanding of Hana specifically, while other characters remain partly mysterious.",
   [("Readers understand every character equally well", "Staying limited to one character's thoughts means other characters are understood less deeply, not equally."),
    ("The narration technically becomes first person", "Referring to Hana by name and using “she” instead of “I” keeps the narration in third person, even though it is limited to her thoughts.")],
   "Consistently limiting narration to Hana's thoughts builds deep understanding of her while keeping other characters more distant.",
   "A consistent limited point of view builds intimacy with one character at the expense of full knowledge of the others.")

mc("point-of-view", "RL.6.6", 6, "In a play, the audience watches a character accept a gift they do not know is a trick, because an earlier aside revealed the giver's true plan. What literary effect does this create?",
   "Dramatic irony, since the audience knows something important that the character on stage does not",
   [("Suspense about what the gift physically looks like", "The tension here comes from the audience's extra knowledge, not curiosity about the gift's appearance."),
    ("A plot twist that surprises the audience as well as the character", "Because the audience already knows the plan from the aside, this moment would not surprise them the way it surprises the character.")],
   "Dramatic irony occurs when the audience has information a character on stage lacks, creating tension as the audience watches.",
   "Dramatic irony depends on a gap between the audience's knowledge and a character's knowledge.")

mc("point-of-view", "RL.6.6", 7, "If a historical account of a battle were narrated by a soldier on the losing side instead of a neutral historian, how would the account most likely differ?",
   "It would likely include more personal emotion and specific details from that soldier's own experience, rather than a broad, balanced summary.",
   [("It would list the exact same facts in the exact same order as the historian's account", "A personal narrator typically adds individual experience and feeling that a neutral summary leaves out."),
    ("It would no longer mention the winning side at all", "A personal account could still mention the winning side, though filtered through the soldier's own perspective.")],
   "A personal narrator brings individual experience and emotion that a neutral, broad historical account usually leaves out.",
   "Compare how a personal, limited perspective differs from a broad, neutral summary of the same event.")
