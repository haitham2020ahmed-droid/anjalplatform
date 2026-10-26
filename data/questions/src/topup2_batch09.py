"""
Question bank top-up 2, batch 09: brings these families to the full target of 50 items each
(original content, Grades 4-6): word-choice-tone, ask-answer-questions, plural-nouns, suffixes.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== word-choice-tone
grade(6)

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “The old farmhouse sat empty at the end of the lane. The gate groaned and sagged on its rusted hinges, and weeds choked the path to the door.” How does the phrase “groaned and sagged on its rusted hinges” affect the tone of this description?",
   "It creates a tone of decay and neglect.",
   [("It creates a tone of cheerful welcome.", "A groaning, sagging gate does not suggest anyone is being welcomed."),
    ("It creates a tone of thrilling adventure.", "Nothing in the description suggests excitement or adventure."),
    ("It creates a tone of urgent danger.", "The description suggests slow decline over time, not sudden danger.")],
   "Words like “groaned,” “sagged,” and “rusted” paint a picture of long, slow decay.",
   "Look for words describing texture and condition—words like rusted or sagging often signal decay.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “The fishing boat rose and fell on black water as thunder rolled overhead. Captain Reza gripped the wheel, watching the horizon disappear into the storm.” How does the phrase “the horizon disappear into the storm” affect the tone of this description?",
   "It creates a tone of dread and foreboding.",
   [("It creates a tone of calm relaxation.", "A disappearing horizon in a storm suggests danger, not calm."),
    ("It creates a tone of playful humor.", "Nothing about a captain facing a storm is meant to be funny."),
    ("It creates a tone of proud celebration.", "There is no achievement being celebrated in this tense moment.")],
   "Losing sight of the horizon in a storm suggests the danger is growing, creating a sense of dread.",
   "When a character loses something important, like the horizon, think about what that loss signals emotionally.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “Vendors shouted over one another, waving bright scarves and ripe fruit, while the smell of roasting corn drifted through the crowded lane.” How does the phrase “vendors shouted over one another” affect the tone of this description?",
   "It creates a tone of lively excitement.",
   [("It creates a tone of quiet sadness.", "Shouting vendors and a crowded, colorful lane are the opposite of quiet."),
    ("It creates a tone of solemn respect.", "Nothing about a noisy, crowded market suggests solemn behavior."),
    ("It creates a tone of fearful tension.", "There is no danger described; the energy here is cheerful, not frightening.")],
   "The overlapping shouts and vivid sensory details create an energetic, bustling tone.",
   "Overlapping action and bright sensory words often signal an energetic, lively tone.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “Pencils scratched against paper in uneven bursts. Nadia stared at question seven, her hand trembling slightly as the clock ticked louder than she remembered.” How does the phrase “the clock ticked louder than she remembered” affect the tone of this description?",
   "It creates a tone of nervous anticipation.",
   [("It creates a tone of bored indifference.", "A trembling hand and a loudly ticking clock suggest the opposite of boredom."),
    ("It creates a tone of joyful relief.", "Nothing in the scene suggests the tension has eased yet."),
    ("It creates a tone of angry frustration.", "Nadia's trembling suggests nervousness, not anger.")],
   "The clock seeming louder than usual reflects Nadia's rising nervousness as time presses on her.",
   "A character's heightened awareness of small details, like a ticking clock, often signals their inner tension.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “Moonlight settled over the garden like a soft blanket. Jasmine scented the still air, and not even the fountain dared to break the silence.” How does the phrase “not even the fountain dared to break the silence” affect the tone of this description?",
   "It creates a tone of peaceful calm.",
   [("It creates a tone of panicked urgency.", "A still, silent garden under moonlight suggests the opposite of panic."),
    ("It creates a tone of bitter resentment.", "There is no conflict or anger described in this peaceful scene."),
    ("It creates a tone of chaotic confusion.", "The scene is marked by stillness and order, not chaos.")],
   "Personifying the fountain as not daring to break the silence emphasizes just how still and peaceful the garden is.",
   "Personification that exaggerates stillness or quiet often signals a calm, peaceful tone.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “Omar's legs burned with every step, but he fixed his eyes on the ridge above and kept climbing, refusing to look back down at how far he had come.” How does the phrase “refusing to look back down” affect the tone of this description?",
   "It creates a tone of determined grit.",
   [("It creates a tone of lighthearted amusement.", "Burning muscles and a refusal to quit suggest serious effort, not humor."),
    ("It creates a tone of gentle nostalgia.", "The scene is about pushing forward, not remembering the past."),
    ("It creates a tone of bitter defeat.", "Omar is still climbing and pushing on, which is the opposite of giving up.")],
   "Choosing to keep climbing and not look back shows Omar's determination to finish despite the pain.",
   "A character's small physical choices, like refusing to look back, often reveal their mindset.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “Dust motes drifted through a single beam of light as Layla ran her fingers along spines of books untouched for decades, each one exhaling a faint, papery breath as she opened it.” How does the phrase “exhaling a faint, papery breath” affect the tone of this description?",
   "It creates a tone of quiet reverence.",
   [("It creates a tone of loud celebration.", "The scene is marked by stillness and quiet, not noise or celebration."),
    ("It creates a tone of comic absurdity.", "Describing old books with care and detail is not meant to be humorous."),
    ("It creates a tone of violent conflict.", "There is no struggle or fighting in this still, careful scene.")],
   "Describing the books as if they are gently breathing gives the old library a reverent, almost sacred quality.",
   "Personifying ordinary objects with gentle, careful actions often creates a reverent or thoughtful tone.")

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “Steam curled up from the pot of lentil soup, and Grandma hummed softly while she stirred, the kitchen glowing warm under the evening light.” How does the phrase “the kitchen glowing warm” affect the tone of this description?",
   "It creates a tone of homely warmth.",
   [("It creates a tone of cold indifference.", "A glowing, warm kitchen with humming and soup is the opposite of cold."),
    ("It creates a tone of frantic urgency.", "Nothing in this calm, humming scene suggests rushing or panic."),
    ("It creates a tone of eerie suspicion.", "The scene describes comfort and warmth, not anything mysterious or unsettling.")],
   "The warm glow paired with Grandma's humming creates a comforting, homely feeling.",
   "Warm light and gentle sounds, like humming, often build a cozy, homely tone.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “Branches clawed at Samir's jacket as the last light faded between the trees, and somewhere behind him, a twig snapped that he hadn't stepped on.” How does the phrase “a twig snapped that he hadn't stepped on” affect the tone of this description?",
   "It creates a tone of eerie unease.",
   [("It creates a tone of calm contentment.", "An unexplained sound in a dark forest creates tension, not contentment."),
    ("It creates a tone of joyful celebration.", "Nothing about being alone in a darkening forest suggests celebration."),
    ("It creates a tone of proud confidence.", "Samir's situation suggests growing worry, not confidence.")],
   "An unexplained sound suggests Samir may not be alone, creating an eerie, uneasy feeling.",
   "An unexplained noise or movement often signals an eerie or suspenseful tone.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “Horns blared, and commuters shoved past one another toward the station, checking their watches every few seconds as the minute hand crept toward the hour.” How does the phrase “checking their watches every few seconds” affect the tone of this description?",
   "It creates a tone of frantic urgency.",
   [("It creates a tone of lazy relaxation.", "Blaring horns and constant watch-checking are the opposite of relaxed."),
    ("It creates a tone of quiet sorrow.", "There is no sadness described, only rushing and pressure."),
    ("It creates a tone of playful mischief.", "The scene describes stress about time, not playful behavior.")],
   "Repeatedly checking the time shows how anxious and rushed the commuters feel.",
   "Repeated small actions, like checking a watch, often reveal a character's urgency.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “Mist hung low over the fields as the sun rose slowly, and the only sound was a rooster calling once, then falling silent again.” How does the phrase “falling silent again” affect the tone of this description?",
   "It creates a tone of gentle tranquility.",
   [("It creates a tone of sudden terror.", "A quiet farm at sunrise with a single rooster call suggests peace, not fear."),
    ("It creates a tone of bitter anger.", "There is no conflict or frustration described in this calm scene."),
    ("It creates a tone of wild chaos.", "The scene is defined by stillness and quiet, not chaos.")],
   "The return to silence after one small sound emphasizes just how peaceful and still the farm is.",
   "A brief sound followed by silence often emphasizes stillness and calm.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “Visitors spoke in whispers beneath the enormous skeleton suspended overhead, as if their ordinary voices might somehow disturb something that had been still for sixty million years.” How does the phrase “might somehow disturb something that had been still for sixty million years” affect the tone of this description?",
   "It creates a tone of solemn awe.",
   [("It creates a tone of nervous embarrassment.", "The visitors are not embarrassed; they are impressed and respectful."),
    ("It creates a tone of bored impatience.", "Whispering out of respect suggests fascination, not boredom."),
    ("It creates a tone of comic exaggeration.", "The description is sincere, not meant to be funny.")],
   "Imagining their voices disturbing something ancient shows how deeply impressed and respectful the visitors feel.",
   "When characters act carefully around something impressive, the tone is often one of awe.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “With ten seconds left, Hana drove down the sideline as the entire stadium seemed to hold its breath, every eye locked on the ball at her feet.” How does the phrase “the entire stadium seemed to hold its breath” affect the tone of this description?",
   "It creates a tone of thrilling suspense.",
   [("It creates a tone of gentle sadness.", "A tense, final play is exciting, not sorrowful."),
    ("It creates a tone of lazy boredom.", "A stadium holding its breath suggests intense attention, not boredom."),
    ("It creates a tone of bitter jealousy.", "There is no envy described, only shared anticipation.")],
   "Describing the whole stadium as holding its breath shows the tense excitement of the final moments.",
   "When an entire crowd reacts together, it often signals a moment of shared suspense.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “Sparks drifted up into the dark as Yusuf leaned closer to the fire, his voice dropping low, and the circle of listeners leaned in with him, as though the night itself were listening too.” How does the phrase “as though the night itself were listening too” affect the tone of this description?",
   "It creates a tone of cozy intimacy.",
   [("It creates a tone of harsh criticism.", "There is no judgment described; the group is simply absorbed in the story."),
    ("It creates a tone of frantic panic.", "Leaning in close to listen suggests calm closeness, not panic."),
    ("It creates a tone of cold detachment.", "The circle leaning in together suggests warmth and closeness, not distance.")],
   "Imagining the night itself listening emphasizes how close and intimate the moment feels for the group.",
   "Personifying the surroundings as part of the moment often deepens a sense of intimacy.")

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “Rain traced slow lines down the window as Dina watched the empty street, the gray afternoon stretching on without end.” How does the phrase “stretching on without end” affect the tone of this description?",
   "It creates a tone of quiet melancholy.",
   [("It creates a tone of wild excitement.", "A slow, gray, empty afternoon suggests sadness, not excitement."),
    ("It creates a tone of proud triumph.", "Nothing in the scene suggests an achievement to be proud of."),
    ("It creates a tone of comic silliness.", "The description is sincere and sad, not meant to be funny.")],
   "Describing the afternoon as endless reflects Dina's sense of being stuck in a slow, gloomy mood.",
   "Exaggerating how long something feels often signals a melancholy or gloomy tone.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “Children shrieked with laughter as waves chased them up the sand, and the whole beach smelled like salt and melting ice cream.” How does the phrase “children shrieked with laughter” affect the tone of this description?",
   "It creates a tone of carefree joy.",
   [("It creates a tone of quiet mourning.", "Laughter and chasing waves describe happiness, not grief."),
    ("It creates a tone of tense suspicion.", "Nothing about children playing suggests danger or distrust."),
    ("It creates a tone of bitter regret.", "There is no description of loss or wishing something were different.")],
   "The children's laughter and playful chasing create a light, joyful, carefree mood.",
   "Sounds of laughter and playful movement usually signal a joyful, carefree tone.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “The wind howled against the cabin walls, and every window had vanished behind a solid wall of white, leaving nothing outside but the storm.” How does the phrase “leaving nothing outside but the storm” affect the tone of this description?",
   "It creates a tone of bleak isolation.",
   [("It creates a tone of cheerful celebration.", "A howling blizzard that erases the outside world suggests danger, not celebration."),
    ("It creates a tone of calm curiosity.", "The scene emphasizes being trapped and cut off, not curiosity."),
    ("It creates a tone of proud confidence.", "There is no sense of control described; the storm has taken over everything.")],
   "Saying nothing exists outside but the storm emphasizes how completely cut off and alone the scene feels.",
   "When a description erases everything except one threatening force, it often signals bleak isolation.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “Each dune looked exactly like the last, and Fahad's legs moved on their own now, long after his mind had stopped believing they ever would reach water.” How does the phrase “long after his mind had stopped believing” affect the tone of this description?",
   "It creates a tone of weary exhaustion.",
   [("It creates a tone of giddy excitement.", "Legs moving automatically from exhaustion is the opposite of excitement."),
    ("It creates a tone of playful teasing.", "The scene describes genuine physical struggle, not playfulness."),
    ("It creates a tone of calm satisfaction.", "Fahad's doubt about reaching water shows distress, not satisfaction.")],
   "Describing his body moving after his mind gave up shows just how physically and mentally exhausted Fahad is.",
   "When a character's body and mind seem to separate from exhaustion, the tone is often weary.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “Maya smoothed her new backpack straps for the third time and practiced her name in her head, just in case someone asked and her voice decided not to work.” How does the phrase “just in case... her voice decided not to work” affect the tone of this description?",
   "It creates a tone of jittery excitement.",
   [("It creates a tone of deep grief.", "Nervousness about a first day is not the same as sorrow or loss."),
    ("It creates a tone of calm boredom.", "Repeating small nervous actions suggests the opposite of boredom."),
    ("It creates a tone of angry defiance.", "Maya's actions show nervousness, not anger or resistance.")],
   "Worrying that her own voice might fail her shows Maya's nervous excitement about the new day.",
   "Small, repeated nervous habits often reveal a jittery, anxious-excited tone.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “Fatima counted the ceiling tiles for the fourth time, glancing up each time footsteps passed, hoping and dreading in the same breath that they would stop outside her door.” How does the phrase “hoping and dreading in the same breath” affect the tone of this description?",
   "It creates a tone of tense worry.",
   [("It creates a tone of relaxed indifference.", "Counting tiles anxiously and reacting to every footstep show the opposite of indifference."),
    ("It creates a tone of joyful anticipation.", "The word “dreading” shows fear mixed in, not pure joy."),
    ("It creates a tone of comic relief.", "The scene is sincere and anxious, not meant to be funny.")],
   "Feeling both hope and dread at once captures the uncertain, worried tension of waiting for news.",
   "Combining two opposite feelings, like hope and dread, often creates a tone of tense worry.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “Omar watched his grandmother's plane shrink into a silver dot above the runway, already missing a voice he had heard every single morning of his life.” How does the phrase “already missing a voice he had heard every single morning” affect the tone of this description?",
   "It creates a tone of bittersweet longing.",
   [("It creates a tone of furious anger.", "Missing someone is not the same as being angry at them."),
    ("It creates a tone of lighthearted comedy.", "The scene describes a sincere, emotional goodbye, not humor."),
    ("It creates a tone of calm indifference.", "Missing a voice heard every day shows deep feeling, not indifference.")],
   "Beginning to miss her before she has even left shows the bittersweet pain and love in this goodbye.",
   "When a character feels loss before it fully happens, the tone often becomes bittersweet.")

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “Hassan swayed with the crowded train, holding the same pole as four strangers, his eyelids drifting shut between stops he had counted a hundred times before.” How does the phrase “counted a hundred times before” affect the tone of this description?",
   "It creates a tone of tired resignation.",
   [("It creates a tone of thrilling adventure.", "A familiar, exhausting commute is the opposite of an exciting adventure."),
    ("It creates a tone of joyful surprise.", "There is nothing new or surprising in a routine, tiring commute."),
    ("It creates a tone of proud achievement.", "Hassan's drifting eyelids suggest fatigue, not pride.")],
   "Counting the same stops a hundred times shows how routine and tiring this daily commute has become for Hassan.",
   "Describing something as repeated many times often signals a tired, resigned tone.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “The elephant lowered her trunk gently toward the smallest visitor in the front row, who gasped and grabbed her mother's hand without taking her eyes off the enormous, curious creature.” How does the phrase “without taking her eyes off” affect the tone of this description?",
   "It creates a tone of delighted wonder.",
   [("It creates a tone of quiet grief.", "A child gasping with excitement at an elephant shows delight, not sadness."),
    ("It creates a tone of harsh criticism.", "There is no judgment described, only fascination."),
    ("It creates a tone of angry protest.", "The child's reaction shows amazement, not anger.")],
   "Staring without looking away shows how captivated and delighted the child is by the elephant.",
   "An inability to look away often signals a tone of wonder or fascination.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “Dew clung to every leaf in the greenhouse as the first light turned the glass walls gold, and even the usually busy gardener paused to simply stand among the rows.” How does the phrase “paused to simply stand among the rows” affect the tone of this description?",
   "It creates a tone of lush, inviting calm.",
   [("It creates a tone of frantic rushing.", "A gardener pausing to stand still is the opposite of rushing."),
    ("It creates a tone of bitter complaint.", "There is nothing negative described in this peaceful, golden scene."),
    ("It creates a tone of mocking sarcasm.", "The description is sincere and appreciative, not sarcastic.")],
   "The gardener pausing to simply stand and take in the scene shows how calm and inviting the greenhouse feels.",
   "When a busy character suddenly pauses to notice beauty, the tone often shifts to calm appreciation.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “The Ferris wheel stood frozen against the gray sky, its seats swinging in the wind as if children had just stepped out of them and simply never come back.” How does the phrase “as if children had just stepped out of them and simply never come back” affect the tone of this description?",
   "It creates a tone of haunting sadness.",
   [("It creates a tone of lively celebration.", "An abandoned, frozen Ferris wheel suggests loss, not celebration."),
    ("It creates a tone of calm relaxation.", "The image is unsettling and sad, not peaceful."),
    ("It creates a tone of playful silliness.", "The sentence is meant to feel eerie and sad, not funny.")],
   "Imagining children who never returned gives the abandoned park a haunting, sorrowful feeling.",
   "Imagining absent people in an empty place often creates a haunting, melancholy tone.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “Fishing boats rocked gently against the dock as their lights blinked on one by one, and old Karim watched from the pier, remembering boats that no longer came home.” How does the phrase “boats that no longer came home” affect the tone of this description?",
   "It creates a tone of wistful nostalgia.",
   [("It creates a tone of sudden terror.", "A quiet, reflective evening at the harbor is not frightening."),
    ("It creates a tone of loud triumph.", "The scene is quiet and reflective, not celebratory."),
    ("It creates a tone of harsh mockery.", "There is no ridicule described; Karim is remembering with longing.")],
   "Remembering boats that never returned gives Karim's quiet evening a wistful, nostalgic feeling.",
   "A character's quiet memory of loss often creates a wistful, nostalgic tone.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “The old bridge disappeared into fog only a few steps ahead, and Sara could hear her own footsteps more clearly than she could see her own hand.” How does the phrase “could hear her own footsteps more clearly than she could see her own hand” affect the tone of this description?",
   "It creates a tone of mysterious uncertainty.",
   [("It creates a tone of joyful celebration.", "Losing sight of her own hand in fog suggests confusion, not celebration."),
    ("It creates a tone of calm boredom.", "Not being able to see clearly creates tension, not boredom."),
    ("It creates a tone of proud confidence.", "Sara's limited sight suggests uncertainty, not confidence.")],
   "Being unable to see even her own hand emphasizes how disorienting and mysterious the foggy bridge feels.",
   "Losing a basic sense, like sight, often builds a tone of mystery or uncertainty.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “The canyon walls blazed orange and pink as the sun sank lower, and Leila realized, standing at the rim, how impossibly small her own voice would sound if she shouted into all that space.” How does the phrase “how impossibly small her own voice would sound” affect the tone of this description?",
   "It creates a tone of humble awe.",
   [("It creates a tone of bitter frustration.", "Leila's reaction is wonder at the canyon's size, not frustration."),
    ("It creates a tone of comic exaggeration.", "The description is sincere and reflective, not meant to be funny."),
    ("It creates a tone of cold detachment.", "Realizing how small she is compared to the canyon shows deep feeling, not detachment.")],
   "Imagining how small her voice would sound shows how humbled and amazed Leila feels standing before something so vast.",
   "When a character feels small next to something enormous, the tone is often one of humble awe.")

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “Bees bumbled lazily between wildflowers, and Noor flopped down in the grass, letting the warm breeze decide which blade of grass to tickle next.” How does the phrase “letting the warm breeze decide” affect the tone of this description?",
   "It creates a tone of lighthearted cheer.",
   [("It creates a tone of deep sorrow.", "A lazy, warm meadow scene suggests happiness, not sadness."),
    ("It creates a tone of urgent danger.", "There is nothing threatening in this relaxed, cheerful scene."),
    ("It creates a tone of bitter resentment.", "Nothing in the scene suggests anger or unfairness.")],
   "Giving control to the breeze shows how relaxed and carefree Noor feels in this cheerful moment.",
   "Giving nature control over small, playful actions often creates a lighthearted tone.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “Apples thudded softly into the grass as the breeze passed through, and Grandfather simply watched, in no hurry to pick up what had already fallen.” How does the phrase “in no hurry to pick up what had already fallen” affect the tone of this description?",
   "It creates a tone of quiet contentment.",
   [("It creates a tone of panicked rushing.", "Grandfather being in no hurry is the opposite of panic."),
    ("It creates a tone of bitter complaint.", "There is nothing negative described in this calm, satisfied scene."),
    ("It creates a tone of fearful suspicion.", "Nothing in the orchard scene suggests distrust or fear.")],
   "Grandfather's unhurried patience shows a quiet contentment with the slow pace of the autumn afternoon.",
   "A character's unhurried patience often signals a tone of quiet contentment.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “Drums thudded through the square as dancers spun in bright skirts, and even the oldest grandmothers clapped along, unable to stay still.” How does the phrase “unable to stay still” affect the tone of this description?",
   "It creates a tone of joyful celebration.",
   [("It creates a tone of solemn mourning.", "Dancing, drumming, and clapping describe happiness, not grief."),
    ("It creates a tone of anxious worry.", "Nothing about the lively scene suggests concern or fear."),
    ("It creates a tone of cold detachment.", "Everyone, even the grandmothers, is actively joining in, not staying distant.")],
   "Even the oldest grandmothers being unable to stay still shows how infectious and joyful the festival energy is.",
   "When excitement spreads to everyone, including those usually calm, it often signals a joyful tone.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “The same machine hissed the same way it had for fifteen years, and Tariq moved his hands through the same motions without needing to look down even once.” How does the phrase “without needing to look down even once” affect the tone of this description?",
   "It creates a tone of grim monotony.",
   [("It creates a tone of thrilling surprise.", "Repeating the same motion for fifteen years is the opposite of surprising."),
    ("It creates a tone of cheerful excitement.", "There is nothing joyful described in this repetitive, mechanical scene."),
    ("It creates a tone of peaceful relaxation.", "The repeated phrase “the same” suggests tiring routine, not relaxation.")],
   "Working without even needing to look shows how mechanical and dull this repeated routine has become for Tariq.",
   "Repeating the word “same” often signals a grim, monotonous tone.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “Thirty thousand voices rose together as the ball sailed toward the net, a single wall of sound that seemed to lift the stadium right off its foundation.” How does the phrase “seemed to lift the stadium right off its foundation” affect the tone of this description?",
   "It creates a tone of electric excitement.",
   [("It creates a tone of quiet despair.", "Thirty thousand voices rising together describes excitement, not despair."),
    ("It creates a tone of gentle calm.", "A roaring crowd is the opposite of a calm scene."),
    ("It creates a tone of bitter disappointment.", "The crowd's reaction suggests thrilling anticipation, not disappointment.")],
   "Exaggerating that the sound could lift the stadium emphasizes the overwhelming, electric excitement of the crowd.",
   "Exaggerated physical effects of sound or energy often signal an electric, exciting tone.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “Rows of velvet seats sat empty under a single working light, and the echo of the last closing door seemed to hang in the air long after the sound itself had faded.” How does the phrase “seemed to hang in the air long after the sound itself had faded” affect the tone of this description?",
   "It creates a tone of lonely stillness.",
   [("It creates a tone of joyful reunion.", "An empty theater under one light describes isolation, not reunion."),
    ("It creates a tone of frantic energy.", "The scene emphasizes stillness and quiet, not frantic movement."),
    ("It creates a tone of proud triumph.", "There is nothing to celebrate in this empty, quiet space.")],
   "The echo lingering after the sound has faded emphasizes just how still and lonely the empty theater feels.",
   "Sound lingering in an otherwise silent space often emphasizes loneliness or stillness.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “Dr. Amina held the beaker up to the light for the third time, turning it slowly, unwilling to write anything down until she was certain of what she wasn't quite believing yet.” How does the phrase “unwilling to write anything down until she was certain” affect the tone of this description?",
   "It creates a tone of cautious curiosity.",
   [("It creates a tone of careless boredom.", "Examining something for the third time shows careful attention, not boredom."),
    ("It creates a tone of loud celebration.", "Dr. Amina is still uncertain, not celebrating a confirmed result yet."),
    ("It creates a tone of angry suspicion.", "Her hesitation reflects careful curiosity, not anger or distrust of a person.")],
   "Her reluctance to record results until certain shows careful, curious hesitation about an exciting possibility.",
   "A character's careful hesitation before accepting something exciting often signals cautious curiosity.")

mc("word-choice-tone", "RL.6.4", 1,
   "Read this description: “A thin plume of ash rose from the distant peak, and the whole village gathered on the hillside to watch in silence, no one quite sure whether to run or simply stare.” How does the phrase “no one quite sure whether to run or simply stare” affect the tone of this description?",
   "It creates a tone of awed terror.",
   [("It creates a tone of playful amusement.", "A rising ash plume and uncertainty about running describe fear, not play."),
    ("It creates a tone of calm relief.", "The villagers' uncertainty shows fear, not relief."),
    ("It creates a tone of bored indifference.", "Everyone gathering to watch in silence shows deep attention, not indifference.")],
   "The villagers' uncertainty between fleeing and staring shows how the volcano inspires both fear and fascination.",
   "When a character is torn between fear and fascination, the tone is often one of awed terror.")

mc("word-choice-tone", "RL.6.4", 2,
   "Read this description: “The scientist listened to the glacier groan and crack beneath her boots, a sound she had once found beautiful and now found impossible to listen to without counting the years it had left.” How does the phrase “impossible to listen to without counting the years it had left” affect the tone of this description?",
   "It creates a tone of mournful urgency.",
   [("It creates a tone of lighthearted joy.", "Counting the years a glacier has left describes worry, not joy."),
    ("It creates a tone of bored repetition.", "Her reaction shows deep concern, not boredom."),
    ("It creates a tone of proud satisfaction.", "There is nothing to be proud of in watching something disappear.")],
   "Counting the glacier's remaining years shows the scientist's growing grief and urgent concern about its disappearance.",
   "A character measuring time running out often signals a mournful, urgent tone.")

mc("word-choice-tone", "RL.6.4", 3,
   "Read this description: “Three people stood at the bus stop stamping their feet against the cold, none of them speaking, all of them watching the same empty road for a bus that was already fifteen minutes late.” How does the phrase “a bus that was already fifteen minutes late” affect the tone of this description?",
   "It creates a tone of patient weariness.",
   [("It creates a tone of joyful anticipation.", "Waiting silently in the cold for a late bus is not joyful."),
    ("It creates a tone of furious violence.", "Stamping feet from cold is not the same as aggression or violence."),
    ("It creates a tone of calm relaxation.", "Standing in the cold watching for a late bus describes discomfort, not relaxation.")],
   "Waiting silently for a bus that is already late shows the tired, patient weariness of the people at the stop.",
   "Small, repeated discomforts, like stamping feet in the cold, often build a weary tone.")

mc("word-choice-tone", "RL.6.4", 4,
   "Read this description: “Dust floated in the single beam of light as Huda lifted the lid of the old box, and a photograph of her mother at seven years old looked back at her, younger than Huda had ever imagined she could be.” How does the phrase “younger than Huda had ever imagined she could be” affect the tone of this description?",
   "It creates a tone of tender nostalgia.",
   [("It creates a tone of harsh criticism.", "Huda's reaction shows warmth and surprise, not judgment."),
    ("It creates a tone of frantic panic.", "Looking through old photos slowly is calm, not panicked."),
    ("It creates a tone of bitter jealousy.", "There is no envy described, only tender surprise and affection.")],
   "Huda's surprise at seeing her mother so young reveals a tender, nostalgic connection to the past.",
   "A character's surprise at seeing a loved one's past often creates a tender, nostalgic tone.")

mc("word-choice-tone", "RL.6.4", 5,
   "Read this description: “The flashlight beam shook slightly in Bilal's hand as it swept across shelves he usually passed without a glance, each shadow stretching a little longer than he remembered the room being.” How does the phrase “each shadow stretching a little longer than he remembered” affect the tone of this description?",
   "It creates a tone of creeping fear.",
   [("It creates a tone of relaxed comfort.", "A shaking flashlight and stretching shadows describe fear, not comfort."),
    ("It creates a tone of joyful surprise.", "Bilal's reaction suggests unease, not happiness."),
    ("It creates a tone of proud confidence.", "His shaking hand suggests nervousness, not confidence.")],
   "Shadows seeming to stretch longer than remembered shows Bilal's growing, creeping fear in the dark basement.",
   "Familiar spaces described as suddenly unfamiliar or distorted often create a tone of creeping fear.")

mc("word-choice-tone", "RL.6.4", 6,
   "Read this description: “Waves slammed against the rocks below as the keeper climbed the spiral stairs one more time, refusing to let the light go dark no matter how hard the wind pushed against the glass.” How does the phrase “refusing to let the light go dark no matter how hard the wind pushed” affect the tone of this description?",
   "It creates a tone of steadfast courage.",
   [("It creates a tone of careless indifference.", "The keeper's determination to keep the light on shows the opposite of indifference."),
    ("It creates a tone of playful teasing.", "Fighting to keep a light on during a dangerous storm is serious, not playful."),
    ("It creates a tone of bitter defeat.", "The keeper is actively resisting the storm, not giving up.")],
   "The keeper's refusal to let the storm win shows steady, determined courage in the face of danger.",
   "A character's refusal to give up against a powerful force often signals a tone of steadfast courage.")

mc("word-choice-tone", "RL.6.4", 7,
   "Read this description: “Steel beams caught the first light as the crew gathered below, and Khalid looked up at the half-finished frame, already picturing the building that didn't exist yet but somehow already felt real to him.” How does the phrase “already felt real to him” affect the tone of this description?",
   "It creates a tone of hopeful ambition.",
   [("It creates a tone of quiet despair.", "Picturing a finished building with excitement shows hope, not despair."),
    ("It creates a tone of bitter sarcasm.", "Khalid's imagining is sincere, not mocking."),
    ("It creates a tone of calm indifference.", "Feeling something is already real shows strong emotional investment, not indifference.")],
   "Imagining the unfinished building as already real shows Khalid's hopeful, ambitious excitement for what it will become.",
   "A character picturing a future outcome with excitement often signals a tone of hopeful ambition.")

# ================================================================== ask-answer-questions
grade(4)

mc("ask-answer-questions", "RI.4.1", 1,
   "Read this passage: “Volcanoes form when melted rock, called magma, rises up through cracks in the Earth's crust. When a volcano erupts, the magma is called lava once it reaches the surface. Some volcanoes erupt quietly, while others explode with great force.” Which question is answered by this passage?",
   "What is lava called before it reaches the surface?",
   [("How many volcanoes are there in the world?", "The passage never gives a total count of volcanoes."),
    ("Which country has the most volcanoes?", "The passage does not mention any countries."),
    ("How long does an eruption usually last?", "The passage does not state how long eruptions last.")],
   "The passage states that magma is called lava once it reaches the surface, so this question is directly answered.",
   "Scan the passage for the exact words in the question to find its answer.")

dd("ask-answer-questions", "RI.4.1", 2,
   "Read this passage: “Recycling centers sort glass, plastic, and paper into separate bins. Glass is crushed and melted down to make new jars and bottles. Paper is mixed with water and pressed into new sheets.” Which question can be answered using this passage: “What happens to ____ after it is sorted at a recycling center?”",
   "glass",
   [("money", "The passage never discusses money or earnings."),
    ("workers", "The passage does not mention the number of workers."),
    ("history", "The passage does not mention any history of recycling centers.")],
   "The passage explains that glass is crushed and melted to make new jars and bottles.",
   "Look for the exact process described step by step.")

tf("ask-answer-questions", "RI.4.1", 1,
   "Read this passage: “Camels store fat in their humps, not water. This fat can be used for energy when food is scarce in the desert. A camel's wide feet also keep it from sinking into soft sand.” This passage explains that a camel's hump is used to store water.",
   False,
   "The passage says the hump stores fat, not water.",
   "Watch for details that correct a common misunderstanding.")

mc("ask-answer-questions", "RI.4.1", 2,
   "Read this passage: “Workers built the pyramids using large limestone blocks. They used ramps and wooden sleds to move the heavy stones into place. Many workers were paid with food, not money.” A reader wants to know how workers moved heavy stones. Which sentence answers that question?",
   "They used ramps and wooden sleds to move the heavy stones into place.",
   [("Workers built the pyramids using large limestone blocks.", "This tells what material was used, not how the stones were moved."),
    ("Many workers were paid with food, not money.", "This explains payment, not movement of stones."),
    ("The pyramids still stand today.", "This sentence is not in the passage and does not answer the question.")],
   "Ramps and sleds are named as the exact tools used to move the stones.",
   "Match the words in the question to the exact sentence that uses those same ideas.")

mc("ask-answer-questions", "RI.4.1", 3,
   "Read this passage: “Early bicycles had no pedals; riders pushed their feet along the ground. Later models added pedals attached directly to the front wheel. Chains connecting the pedals to the back wheel were not added until years later.” Which question would be MOST useful to ask BEFORE reading a full article titled “How the Bicycle Changed Over Time”?",
   "What did the earliest bicycles look like?",
   [("What color was the first bicycle painted?", "This detail is unlikely to be covered by an article about how bicycles changed over time."),
    ("How much does a bicycle cost today?", "An article about history would not likely include today's prices."),
    ("Who is the fastest cyclist in the world?", "This question is not related to the historical topic of the article.")],
   "A question about the earliest bicycles connects directly to a title about how bicycles changed over time.",
   "A good preview question matches the topic promised by the title.")

mc("ask-answer-questions", "RI.4.1", 2,
   "Read this passage: “Rainforest trees grow so close together that their leaves form a thick ceiling called a canopy. Very little sunlight reaches the forest floor below. Because of this, many rainforest plants have grown unusually large leaves to catch what light they can.” Which question is answered by this passage?",
   "Why do many rainforest plants have large leaves?",
   [("How many species of trees live in rainforests?", "The passage does not count the number of tree species."),
    ("How tall is the average rainforest tree?", "No specific height is given in the passage."),
    ("What animals live in the canopy?", "The passage does not mention animals.")],
   "The passage explains that large leaves help plants catch what little light reaches the forest floor.",
   "Find the sentence that gives a reason, since “why” questions need a cause.")

mc("ask-answer-questions", "RI.4.1", 4,
   "Read this passage: “Planets closer to the sun complete their orbits faster than planets farther away. Mercury, the closest planet, orbits the sun in just 88 days. Neptune, the farthest planet, takes about 165 years.” Which question CANNOT be answered using this passage?",
   "What is the surface temperature of Mercury?",
   [("Which planet orbits the sun the fastest?", "The passage states Mercury orbits fastest, so this can be answered."),
    ("About how long does Neptune take to orbit the sun?", "The passage gives this exact number, about 165 years."),
    ("Does distance from the sun affect orbit speed?", "The passage directly explains this relationship.")],
   "The passage never mentions temperature at all, so that question has no answer here.",
   "If a detail never appears anywhere in the passage, the question cannot be answered.")

mc("ask-answer-questions", "RI.4.1", 3,
   "Read this passage: “Worker bees communicate the location of food by performing a 'waggle dance.' The angle of the dance tells other bees the direction to fly. The length of the dance tells them how far away the food is.” A student asks, “How do bees know how far away food is?” Which sentence answers this?",
   "The length of the dance tells them how far away the food is.",
   [("Worker bees communicate the location of food by performing a 'waggle dance.'", "This introduces the dance but does not explain distance specifically."),
    ("The angle of the dance tells other bees the direction to fly.", "This explains direction, not distance."),
    ("Bees live together in large groups called colonies.", "This sentence is not even in the passage.")],
   "Only the sentence about the dance's length directly explains how bees learn distance.",
   "Match the exact word in the question, like “far,” to the sentence using that same idea.")

tf("ask-answer-questions", "RI.4.1", 1,
   "Read this passage: “Most libraries organize nonfiction books by subject using a number system. Fiction books are usually arranged alphabetically by the author's last name. This system helps readers find books quickly without asking for help.” According to this passage, fiction books are arranged by subject number, just like nonfiction.",
   False,
   "The passage says fiction books are arranged alphabetically by author, not by subject number.",
   "Check whether a statement matches every detail in the passage, not just part of it.")

mc("ask-answer-questions", "RI.4.1", 4,
   "Read this passage: “When a cold front moves into an area, it pushes warm air upward quickly. This often causes sudden thunderstorms. Warm fronts move more slowly and usually bring a long period of light rain instead.” Which question is answered by this passage?",
   "Why do cold fronts often cause sudden thunderstorms?",
   [("How fast does wind usually blow during a thunderstorm?", "No wind speed is given."),
    ("Which season has the most cold fronts?", "The passage does not mention seasons."),
    ("How many thunderstorms happen each year?", "No yearly count is given.")],
   "The passage explains that cold fronts push warm air upward quickly, which causes sudden storms.",
   "Look for a cause-and-effect sentence to answer a “why” question.")

mc("ask-answer-questions", "RI.4.1", 3,
   "Read this passage: “Not all spiders build webs to catch prey. Jumping spiders instead rely on sharp eyesight to spot insects, then leap onto them. Trapdoor spiders dig burrows and wait hidden until prey walks nearby.” Which question is answered by this passage?",
   "How do jumping spiders catch their prey without a web?",
   [("How many eyes does a jumping spider have?", "The passage never gives an exact number of eyes."),
    ("How deep do trapdoor spiders dig their burrows?", "No depth is mentioned."),
    ("Which spider species is the most dangerous?", "The passage does not discuss danger level.")],
   "The passage explains that jumping spiders use sharp eyesight and leap onto their prey.",
   "Find the sentence naming the exact spider in the question.")

mc("ask-answer-questions", "RI.4.1", 5,
   "Read this passage: “Topsoil is the dark upper layer where most plant roots grow, rich in decayed leaves and tiny organisms. Below it lies a layer called subsoil, which has fewer nutrients and holds less water. It can take hundreds of years for a thick layer of topsoil to form.” Which question is answered by this passage?",
   "What makes topsoil different from subsoil?",
   [("How many types of soil exist worldwide?", "No total count is given."),
    ("Which crops grow best in subsoil?", "The passage does not mention specific crops."),
    ("How deep do most plant roots grow?", "The passage does not state a specific depth.")],
   "The passage compares topsoil and subsoil, naming the differences in nutrients and water.",
   "A comparison question is answered when a passage directly contrasts two things.")

tf("ask-answer-questions", "RI.4.1", 2,
   "Read this passage: “Yeast is a living organism that feeds on sugar in dough and releases gas bubbles. These bubbles get trapped in the dough, making it rise before baking. Without yeast, bread would stay flat and dense.” This passage explains that yeast makes bread rise by releasing gas bubbles.",
   True,
   "The passage directly states that yeast releases gas bubbles that get trapped and make the dough rise.",
   "Check the statement sentence by sentence against the passage before deciding true or false.")

mc("ask-answer-questions", "RI.4.1", 4,
   "Read this passage: “Modern high-speed trains use magnets to lift slightly above the track, reducing friction. Without wheels touching the rail, the trains can travel much faster. This technology is called maglev.” Which question is answered by this passage?",
   "How do maglev trains reduce friction?",
   [("How fast is the fastest maglev train ever recorded?", "No specific speed record is given."),
    ("Which country built the first maglev train?", "The passage does not mention a country."),
    ("How much does it cost to build a maglev track?", "No cost information is given.")],
   "The passage explains that magnets lift the train so wheels do not touch the rail, reducing friction.",
   "Look for the specific mechanism named in the passage to answer a “how” question.")

mc("ask-answer-questions", "RI.4.1", 3,
   "Read this passage: “Old lighthouses burned whale oil or kerosene to create light, which keepers had to refill by hand. Modern lighthouses use electric bulbs and run automatically. Because of this, most lighthouses today no longer need a keeper living on site.” A reader wants to know why lighthouse keepers are rarely needed today. Which sentence answers this?",
   "Modern lighthouses use electric bulbs and run automatically.",
   [("Old lighthouses burned whale oil or kerosene to create light.", "This describes the past, not why keepers are no longer needed."),
    ("Keepers had to refill the light by hand.", "This also describes the old system, not the reason keepers are unnecessary now."),
    ("Lighthouses warn ships about dangerous rocks.", "This sentence is not in the passage.")],
   "Automatic electric lighthouses no longer need a person to refill or operate them by hand.",
   "Look for the sentence describing the modern system when asked why something changed.")

mc("ask-answer-questions", "RI.4.1", 5,
   "Read this passage: “Acoustic guitars make sound using the vibration of strings over a hollow wooden body, which naturally amplifies the sound. Electric guitars instead use magnetic pickups to turn string vibrations into an electric signal that is sent to an amplifier.” Which question is answered by this passage?",
   "How does an acoustic guitar make its sound louder without electricity?",
   [("How many strings does a typical electric guitar have?", "No specific string count is given."),
    ("Which guitar brand is the most popular?", "The passage does not mention brands."),
    ("How loud can an amplifier get?", "No volume level is given.")],
   "The passage explains that a hollow wooden body naturally amplifies an acoustic guitar's sound.",
   "Look for the exact mechanism described in the passage that matches the question's topic.")

mc("ask-answer-questions", "RI.4.1", 4,
   "Read this passage: “Emperor penguins huddle together in large groups to survive Antarctic winters, taking turns standing on the wind-exposed outer edge. This constant rotation helps every penguin share the warmth near the center. Chicks stay close to a parent's feet to avoid the icy ground.” Which question CANNOT be answered using this passage?",
   "How many emperor penguins live in Antarctica today?",
   [("How do penguins share warmth while huddling?", "The passage explains the rotation system clearly."),
    ("Where do penguin chicks stay to avoid the cold ground?", "The passage states chicks stay close to a parent's feet."),
    ("Why do penguins take turns on the outer edge?", "The passage explains this rotation shares the warmth.")],
   "No population number is given anywhere in the passage, so that question has no answer here.",
   "If a detail never appears anywhere in the passage, the question cannot be answered.")

order("ask-answer-questions", "RI.4.1", 2,
      "Put these steps in order for previewing an informational article before you read it.",
      ["Read the title and headings to predict the topic.",
       "Ask yourself what you already know about the topic.",
       "Skim any pictures or captions for extra clues."],
      "Good readers preview a text by looking at its structure before asking what they might learn.",
      "Preview first, then connect it to what you already know.")

order("ask-answer-questions", "RI.4.1", 6,
      "Put these steps in order for finding the answer to a specific question in an informational article.",
      ["Turn the question into a few key words.",
       "Scan the headings to find the matching section.",
       "Read that section closely to confirm the answer."],
      "Turning a question into key words makes it much faster to scan for the matching section.",
      "Scanning is for finding; close reading is for confirming.")

grade(5)

mc("ask-answer-questions", "RI.5.1", 1,
   "Read this passage: “During photosynthesis, plants use sunlight to convert carbon dioxide and water into glucose and oxygen. Chlorophyll, the pigment that makes leaves green, absorbs the sunlight needed for this process. Without enough sunlight, a plant cannot produce the glucose it needs for energy.” Which question is answered by this passage?",
   "What role does chlorophyll play in photosynthesis?",
   [("How many leaves does an average tree have?", "No leaf count is given."),
    ("Which plants produce the most oxygen?", "The passage does not compare different plants."),
    ("How long does photosynthesis take to complete?", "No time duration is mentioned.")],
   "The passage explains that chlorophyll absorbs the sunlight needed for photosynthesis.",
   "Match the exact term in the question to where it appears in the passage.")

mc("ask-answer-questions", "RI.5.1", 2,
   "Read this passage: “White blood cells patrol the bloodstream searching for harmful invaders like bacteria and viruses. Some white blood cells, called memory cells, remember germs the body has fought before. This is why a person often cannot catch the same strain of a disease twice.” Which question is answered by this passage?",
   "Why can't a person usually catch the same strain of a disease twice?",
   [("How many white blood cells are in the human body?", "No specific number of cells is given."),
    ("Which organ produces white blood cells?", "The passage does not name the organ that produces them."),
    ("How fast do white blood cells travel?", "No travel speed is given.")],
   "The passage explains that memory cells remember past germs, preventing a repeat infection from the same strain.",
   "Find the sentence that gives a reason, since “why” questions need a cause.")

tf("ask-answer-questions", "RI.5.1", 1,
   "Read this passage: “Power plants generate electricity that travels through high-voltage transmission lines over long distances. Transformers then lower the voltage so it is safe to use in homes. Without transformers, the electricity reaching houses would be far too dangerous to use.” This passage explains that transformers increase the voltage before it reaches homes.",
   False,
   "The passage states transformers lower the voltage, not increase it, to make it safe.",
   "Watch for details that reverse a direction, like raising versus lowering.")

mc("ask-answer-questions", "RI.5.1", 3,
   "Read this passage: “Coal, oil, and natural gas formed over millions of years from the remains of ancient plants and animals buried under heat and pressure. Because they take so long to form, scientists call them nonrenewable resources. Burning these fuels releases energy, but also releases carbon dioxide into the atmosphere.” Which question is answered by this passage?",
   "Why are coal, oil, and natural gas considered nonrenewable resources?",
   [("How much carbon dioxide does a car release each year?", "No specific yearly amount for cars is given."),
    ("Which country produces the most natural gas?", "No countries are mentioned."),
    ("How is coal transported to power plants?", "Transportation is not discussed.")],
   "The passage explains these fuels are nonrenewable because they take millions of years to form.",
   "A “why” question is answered by the sentence that gives the reason behind a label or fact.")

mc("ask-answer-questions", "RI.5.1", 4,
   "Read this passage: “Many Arctic terns migrate nearly pole to pole each year, covering more distance than almost any other bird. Scientists believe they navigate partly by sensing the Earth's magnetic field. Young terns that have never made the journey before still manage to find their way.” Which question CANNOT be answered using this passage?",
   "How fast can an Arctic tern fly during migration?",
   [("How do scientists believe Arctic terns navigate?", "The passage states they may sense the Earth's magnetic field."),
    ("Do young terns need to learn the route from older birds?", "The passage implies no, since they find their way without prior experience."),
    ("Which bird travels nearly pole to pole?", "The passage names the Arctic tern.")],
   "No flight speed is given anywhere in the passage, so that detail cannot be found here.",
   "If a detail never appears anywhere in the passage, the question cannot be answered.")

mc("ask-answer-questions", "RI.5.1", 3,
   "Read this passage: “Roman engineers built aqueducts that used a gentle, constant downward slope to move water across great distances using only gravity. Some aqueducts ran underground, while others were raised on tall stone arches to cross valleys. Lead pipes, called fistulae, carried the water the final distance into cities.” Which question is answered by this passage?",
   "How did Roman aqueducts move water without pumps?",
   [("How many aqueducts did the Romans build in total?", "No total number is given."),
    ("What were Roman roads made of?", "Roads are not discussed in this passage."),
    ("How long did it take to build a typical aqueduct?", "No construction time is mentioned.")],
   "The passage explains that a gentle downward slope let gravity move the water without pumps.",
   "Look for the exact mechanism named in the passage to answer a “how” question.")

mc("ask-answer-questions", "RI.5.1", 2,
   "Read this passage: “Coral reefs are built by tiny animals called coral polyps, which form hard skeletons from minerals in seawater. Algae living inside the polyps provide them with food through photosynthesis in exchange for shelter. When water becomes too warm, the algae leave, causing the coral to turn white in a process called bleaching.” A student wants to know why coral turns white in warm water. Which sentence answers this?",
   "When water becomes too warm, the algae leave, causing the coral to turn white in a process called bleaching.",
   [("Coral reefs are built by tiny animals called coral polyps.", "This explains what builds reefs, not why bleaching happens."),
    ("Algae living inside the polyps provide them with food through photosynthesis.", "This explains the normal relationship, not the cause of bleaching."),
    ("Coral reefs support thousands of species of fish.", "This sentence is not in the passage.")],
   "Only this sentence directly explains the cause of bleaching: algae leaving in warm water.",
   "Match the key phrase in the question, like “turns white,” to the sentence that mentions it.")

mc("ask-answer-questions", "RI.5.1", 5,
   "Read this passage: “GPS satellites broadcast signals containing the exact time they were sent. A receiver on the ground compares the arrival times of signals from several satellites to calculate its distance from each one. Using these distances together, the receiver can pinpoint its exact location.” Which question is answered by this passage?",
   "How does a GPS receiver calculate its exact location?",
   [("How many GPS satellites orbit the Earth?", "No exact number of satellites is given."),
    ("How high above Earth do GPS satellites orbit?", "No altitude is mentioned."),
    ("Who invented the first GPS satellite?", "The passage does not discuss history or inventors.")],
   "The passage explains that comparing signal arrival times lets a receiver calculate its location.",
   "Look for the step-by-step process described to answer a “how” question.")

tf("ask-answer-questions", "RI.5.1", 2,
   "Read this passage: “Sound travels as vibrations through a medium like air, water, or metal. Because water molecules are packed more tightly than air molecules, sound actually travels faster through water than through air. In a vacuum with no molecules at all, sound cannot travel at all.” According to this passage, sound travels faster through air than through water.",
   False,
   "The passage states sound travels faster through water because its molecules are packed more tightly.",
   "Watch for comparisons that could be reversed from what the passage actually says.")

mc("ask-answer-questions", "RI.5.1", 5,
   "Read this passage: “The Earth's crust is broken into large sections called tectonic plates that float on a layer of slowly moving hot rock. When two plates collide, the pressure can push land upward to form mountain ranges over millions of years. When plates slide past each other instead, the sudden release of built-up pressure can cause earthquakes.” Which question is answered by this passage?",
   "What causes earthquakes along plate boundaries?",
   [("How many tectonic plates does the Earth have?", "No exact number of plates is given."),
    ("How tall is the tallest mountain range on Earth?", "No specific height is given."),
    ("How fast do tectonic plates usually move?", "No specific speed is given.")],
   "The passage explains that plates sliding past each other release pressure suddenly, causing earthquakes.",
   "A “what causes” question is answered by the sentence describing the triggering action.")

mc("ask-answer-questions", "RI.5.1", 4,
   "Read this passage: “Vaccines introduce a weakened or inactive form of a germ into the body, which cannot cause the actual disease. This exposure trains the immune system to recognize and fight that germ quickly in the future. Because the immune system already knows the germ, a vaccinated person often never develops serious symptoms if exposed later.” Which question is answered by this passage?",
   "Why does a vaccinated person often avoid serious symptoms later?",
   [("How many vaccines does a child typically receive?", "No specific number of vaccines is mentioned."),
    ("Who created the very first vaccine?", "The passage does not discuss history or inventors."),
    ("How long does a vaccine take to be developed?", "No development timeline is given.")],
   "The passage explains that the trained immune system recognizes the germ quickly, preventing serious illness.",
   "Find the sentence that gives a reason, since “why” questions need a cause.")

mc("ask-answer-questions", "RI.5.1", 7,
   "Read this passage: “Surface ocean currents are driven mainly by wind patterns pushing water across the globe. Deeper currents, however, are driven by differences in water temperature and salt content, since colder, saltier water is denser and sinks. Together, these currents form a slow, continuous loop sometimes called the global conveyor belt.” Which question is answered by this passage?",
   "What causes deep ocean currents to form, unlike surface currents?",
   [("How fast do surface currents typically move?", "No specific speed is given for surface currents."),
    ("Which ocean has the strongest currents?", "No specific ocean is named or compared."),
    ("How deep is the average ocean current?", "No depth measurement is given.")],
   "The passage explains that temperature and salt differences, not wind, drive deep currents.",
   "Look for the contrast word “however” to find where a passage explains a difference.")

mc("ask-answer-questions", "RI.5.1", 3,
   "Read this passage: “Before the printing press, books were copied by hand, a slow process that made books rare and expensive. Johannes Gutenberg's printing press used movable metal letters that could be rearranged and reused for different pages. This allowed many identical copies of a book to be produced far more quickly than by hand.” A reader wants to know why Gutenberg's press could make books faster than copying by hand. Which sentence answers this?",
   "Johannes Gutenberg's printing press used movable metal letters that could be rearranged and reused for different pages.",
   [("Before the printing press, books were copied by hand, a slow process.", "This describes the old method, not why the new one was faster."),
    ("This allowed many identical copies of a book to be produced.", "This states the result, but the actual reason is the reusable metal letters described elsewhere."),
    ("Books became common in households across Europe.", "This sentence is not in the passage.")],
   "The reusable, rearrangeable metal letters are the specific reason the press worked faster than copying by hand.",
   "Separate the cause from the result: one sentence explains why, another states what happened.")

mc("ask-answer-questions", "RI.5.1", 4,
   "Read this passage: “Solar panels convert sunlight directly into electricity using special materials that release electrons when struck by light. Wind turbines instead capture the kinetic energy of moving air and turn it into electricity using spinning blades connected to a generator. Both are considered renewable because their energy sources will not run out.” Which question CANNOT be answered using this passage?",
   "Which state generates the most wind energy?",
   [("How do solar panels convert sunlight into electricity?", "The passage explains that special materials release electrons when struck by light."),
    ("Why are solar and wind power considered renewable?", "The passage states their energy sources will not run out."),
    ("What captures the kinetic energy in a wind turbine?", "The passage states the spinning blades capture this energy.")],
   "No specific state or region is ever named in the passage, so that question has no answer here.",
   "If a detail never appears anywhere in the passage, the question cannot be answered.")

mc("ask-answer-questions", "RI.5.1", 2,
   "Read this passage: “A computer program is a list of precise instructions written in a language the computer can interpret. If even one instruction contains an error, called a bug, the program may behave unexpectedly or stop working. Programmers use tools called debuggers to step through code and locate exactly where a bug occurs.” Which question is answered by this passage?",
   "What tool do programmers use to locate a bug in their code?",
   [("How many lines of code does the average program have?", "No specific line count is given."),
    ("Which programming language is the most popular?", "The passage does not compare or name specific languages."),
    ("How long does it usually take to fix a bug?", "No time estimate is given.")],
   "The passage names debuggers as the tool programmers use to step through code and find bugs.",
   "Match the exact word in the question, like “tool,” to the word used in the passage.")

mc("ask-answer-questions", "RI.5.1", 5,
   "Read this passage: “Carbohydrates are the body's quickest source of energy, broken down rapidly into glucose for the bloodstream. Proteins take longer to digest and are mainly used to build and repair muscle tissue rather than for quick energy. Because fats take the longest to break down, they provide a slower, longer-lasting source of energy.” Which question is answered by this passage?",
   "Why do carbohydrates provide energy more quickly than fats?",
   [("How many calories are in one gram of protein?", "No specific calorie count is given."),
    ("Which food has the highest amount of protein?", "No specific foods are named or compared."),
    ("How much protein should a person eat daily?", "No daily recommendation is given.")],
   "The passage explains that carbohydrates break down rapidly, while fats take the longest to break down.",
   "A comparison question is answered when a passage directly contrasts how fast two things happen.")

tf("ask-answer-questions", "RI.5.1", 3,
   "Read this passage: “Most bacteria are harmless or even helpful, such as the bacteria in the human gut that aid digestion. A small number of bacteria, however, are pathogenic, meaning they can cause disease. Antibiotics work by targeting structures found only in bacterial cells, which is why they do not affect viruses.” According to this passage, antibiotics are effective against both bacteria and viruses.",
   False,
   "The passage states antibiotics target structures found only in bacterial cells, so they do not affect viruses.",
   "Check the statement sentence by sentence against the passage before deciding true or false.")

order("ask-answer-questions", "RI.5.1", 2,
      "Put these steps in order for planning research questions before reading several sources about a topic like renewable energy.",
      ["List everything you already know about the topic.",
       "Write three specific questions you want answered.",
       "Decide which source is most likely to answer each question."],
      "Good researchers list prior knowledge first, then turn gaps in that knowledge into specific questions before choosing sources.",
      "Specific questions lead you to specific answers faster than vague ones.")

mc("ask-answer-questions", "RI.5.1", 6,
   "Read this passage: “Evaporation turns liquid water into vapor using energy from the sun, mostly from oceans and lakes. As this vapor rises and cools, it condenses into tiny droplets that form clouds. When these droplets grow large and heavy enough, they fall back to Earth as precipitation.” Which question is answered by this passage?",
   "What causes water vapor to condense into clouds?",
   [("How many gallons of water evaporate from the ocean each day?", "No specific daily amount is given."),
    ("Which type of cloud produces the most rain?", "The passage does not name or compare cloud types."),
    ("How long does the water cycle take to complete once?", "No specific duration is given.")],
   "The passage explains that rising vapor cools and condenses into droplets that form clouds.",
   "A “what causes” question is answered by the sentence describing the triggering change.")

# ================================================================== plural-nouns
grade(4)

dd("plural-nouns", "L.4.1", 1, "Choose the plural: “The chef sharpened both ____ before cooking.”",
   "knives", [("knifes", "Words ending in -fe often change f to v before adding -es: knife → knives."),
              ("knife's", "An apostrophe shows ownership, not a plural."),
              ("kniven", "This is not how English forms this plural.")],
   "Knife ends in -fe, so change f to v and add -es: knives.",
   "Many nouns ending in -fe or -f change to -ves in the plural.")

dd("plural-nouns", "L.4.1", 2, "Choose the plural: “The nursery cared for six ____.”",
   "babies", [("babys", "Words ending in a consonant + y change y to i before adding -es."),
              ("baby's", "An apostrophe shows ownership, not a plural."),
              ("babes", "This changes the word's meaning, not just its number.")],
   "Baby ends in consonant + y, so change y to i and add -es: babies.",
   "Consonant + y → change y to i, then add -es.")

mc("plural-nouns", "L.4.1", 3, "Which sentence uses the plural of “bus” correctly?",
   "Three buses lined up outside the school.",
   [("Three busses lined up outside the school.", "The standard spelling of the plural is “buses,” with one s."),
    ("Three bus's lined up outside the school.", "An apostrophe shows ownership, not a plural."),
    ("Three buss lined up outside the school.", "This does not form a plural at all.")],
   "Most nouns ending in -s add -es to form the plural: bus → buses.",
   "Nouns ending in s, x, ch, or sh usually add -es.")

dd("plural-nouns", "L.4.1", 4, "Choose the plural: “We planted two rows of ____ in the garden.”",
   "potatoes", [("potatos", "Most nouns ending in a consonant + o add -es, not just -s."),
                ("potatoe's", "An apostrophe shows ownership, not a plural."),
                ("potatoies", "This is not how the plural is spelled.")],
   "Potato ends in consonant + o, so add -es: potatoes.",
   "Many nouns ending in consonant + o add -es (potatoes, tomatoes, heroes).")

mc("plural-nouns", "L.4.1", 5, "Which sentence uses the plural of “mouse” correctly?",
   "Two mice scurried behind the barn.",
   [("Two mouses scurried behind the barn.", "Mouse has an irregular plural that changes the vowel sound."),
    ("Two mices scurried behind the barn.", "This adds an extra -s to an already irregular plural."),
    ("Two mouse scurried behind the barn.", "The plural form must change; it cannot stay the same.")],
   "Mouse is an irregular noun; its plural is mice, not mouses.",
   "Irregular plurals often change the inside vowel: mouse→mice, man→men.")

dd("plural-nouns", "L.4.1", 6, "Choose the plural: “Both of her ____ were covered in sand.”",
   "feet", [("foots", "Foot is irregular and does not simply add -s."),
            ("footes", "This is not a real word."),
            ("foot's", "An apostrophe shows ownership, not a plural.")],
   "Foot is irregular; its plural is feet.",
   "Some irregular plurals change the whole middle of the word: foot→feet, tooth→teeth.")

mc("plural-nouns", "L.4.1", 7, "Which sentence uses the plural of “tooth” correctly?",
   "The dentist checked all of my teeth.",
   [("The dentist checked all of my tooths.", "Tooth is irregular; it does not add -s."),
    ("The dentist checked all of my toothes.", "This is not the correct irregular form."),
    ("The dentist checked all of my tooth.", "The plural form must change to show more than one.")],
   "Tooth is irregular; its plural is teeth.",
   "Memorize irregular plurals like tooth→teeth since they don't follow the usual rule.")

dd("plural-nouns", "L.4.1", 2, "Choose the plural: “The park was full of ____ on Saturday morning.”",
   "children", [("childs", "Child has a special irregular plural."),
                ("childes", "This is not the correct form."),
                ("child's", "An apostrophe shows ownership, not a plural.")],
   "Child is irregular; its plural is children.",
   "A few plurals, like child→children, don't follow any common pattern—just memorize them.")

mc("plural-nouns", "L.4.1", 3, "Which sentence shows the correct plural of “man”?",
   "Two men repaired the old fence.",
   [("Two mans repaired the old fence.", "Man is irregular; it does not add -s."),
    ("Two mens repaired the old fence.", "The irregular plural is already “men”; it does not need an extra -s."),
    ("Two man repaired the old fence.", "The plural form must change to show more than one.")],
   "Man is irregular; its plural is men.",
   "Man→men and woman→women change the vowel sound in the middle.")

tf("plural-nouns", "L.4.1", 4, "“The fisherman caught five fish” uses the correct plural of “fish.”",
   True,
   "Fish can stay the same in the plural when referring to several of the same kind of fish.",
   "A few nouns, like fish, deer, and sheep, look the same in singular and plural.")

err("plural-nouns", "L.4.1", 5, ["Two newborn", " calfs", " slept beside", " the barn door."], 1, " calves",
    "Calf ends in -f, so change f to v and add -es: calves, not calfs.",
    "Words like calf, half, and leaf change f to v before adding -es.")

# grade(5) --------------------------------------------------- plural-nouns
grade(5)

dd("plural-nouns", "L.5.2", 1, "Choose the plural: “Both ____ attended the community meeting together.”",
   "wives", [("wifes", "Words ending in -fe usually change f to v before adding -s."),
             ("wife's", "An apostrophe shows ownership, not a plural."),
             ("wiven", "This is not how English forms this plural.")],
   "Wife ends in -fe, so change f to v and add -s: wives.",
   "Many nouns ending in -fe or -f change to -ves in the plural.")

mc("plural-nouns", "L.5.2", 2, "Which sentence uses the plural of “wolf” correctly?",
   "A pack of wolves howled in the distance.",
   [("A pack of wolfs howled in the distance.", "Words ending in -f often change f to v before adding -es."),
    ("A pack of wolve howled in the distance.", "This drops the final -s needed for the plural."),
    ("A pack of wolf's howled in the distance.", "An apostrophe shows ownership, not a plural.")],
   "Wolf ends in -f, so change f to v and add -es: wolves.",
   "Many nouns ending in -f change to -ves in the plural.")

dd("plural-nouns", "L.5.2", 3, "Choose the plural: “Several ____ bounced off the canyon walls.”",
   "echoes", [("echos", "Most nouns ending in consonant + o add -es, not just -s."),
              ("echo's", "An apostrophe shows ownership, not a plural."),
              ("echoies", "This is not how the plural is spelled.")],
   "Echo ends in consonant + o, so add -es: echoes.",
   "Many nouns ending in consonant + o add -es (echoes, heroes, tomatoes).")

dd("plural-nouns", "L.5.2", 4, "Choose the plural: “The librarian dusted all of the tall ____.”",
   "shelves", [("shelfs", "Words ending in -f often change f to v before adding -es."),
               ("shelve's", "An apostrophe shows ownership, not a plural."),
               ("shelfes", "This is not how English forms this plural.")],
   "Shelf ends in -f, so change f to v and add -es: shelves.",
   "Words like shelf, half, and wolf change f to v before adding -es.")

mc("plural-nouns", "L.5.1", 5, "Which sentence shows the correct plural of “goose”?",
   "A flock of geese flew south for the winter.",
   [("A flock of gooses flew south for the winter.", "Goose is irregular; it does not simply add -s."),
    ("A flock of geeses flew south for the winter.", "This adds an extra -s to an already irregular plural."),
    ("A flock of goose flew south for the winter.", "The plural form must change to show more than one.")],
   "Goose is irregular; its plural is geese.",
   "Goose→geese follows the same pattern as foot→feet and tooth→teeth.")

dd("plural-nouns", "L.5.2", 6, "Choose the plural: “Only a few ____ showed up early for the rehearsal.”",
   "people", [("persons", "This form is used only in very formal or legal contexts, not everyday speech."),
              ("peoples", "“Peoples” refers to different ethnic or cultural groups, not simply more than one person."),
              ("person's", "An apostrophe shows ownership, not a plural.")],
   "The common, everyday plural of person is people.",
   "Person→people is irregular and does not follow the usual -s rule.")

err("plural-nouns", "L.5.2", 7, ["She split the orange", " into two equal", " halfs", " for her brothers."], 2, " halves",
    "Half ends in -f, so change f to v and add -s: halves, not halfs.",
    "Words like half, calf, and shelf change f to v before adding -es or -s.")

mc("plural-nouns", "L.5.1", 3, "Which sentence shows the correct plural of “hero”?",
   "The parade honored several local heroes.",
   [("The parade honored several local heros.", "Most nouns ending in consonant + o add -es, not just -s."),
    ("The parade honored several local hero's.", "An apostrophe shows ownership, not a plural."),
    ("The parade honored several local heroies.", "This is not how the plural is spelled.")],
   "Hero ends in consonant + o, so add -es: heroes.",
   "Many nouns ending in consonant + o add -es (heroes, potatoes, echoes).")

dd("plural-nouns", "L.5.2", 2, "Choose the plural: “The reporter had visited twelve different ____ that year.”",
   "cities", [("citys", "Words ending in consonant + y change y to i before adding -es."),
              ("city's", "An apostrophe shows ownership, not a plural."),
              ("citties", "This misspells the plural form.")],
   "City ends in consonant + y, so change y to i and add -es: cities.",
   "Consonant + y → change y to i, then add -es.")

tf("plural-nouns", "L.5.1", 4, "“A herd of deer grazed quietly near the old fence” uses the correct plural of “deer.”",
   True,
   "Deer is one of several animal names that stay the same in the singular and plural.",
   "A few animal nouns—deer, moose, sheep—don't change form in the plural.")

match("plural-nouns", "L.5.2", 5, "Match each singular noun with its plural.",
      [("scarf", "scarves"), ("thief", "thieves"), ("elf", "elves"), ("hoof", "hooves")],
      "Most nouns ending in -f change the f to v and add -es in the plural.",
      "Say the word aloud—many -f nouns sound like they end in a v sound in the plural.")

# grade(6) --------------------------------------------------- plural-nouns
grade(6)

dd("plural-nouns", "L.6.1", 1, "Choose the plural: “The bakery sold out of fresh ____ by noon.”",
   "loaves", [("loafs", "Words ending in -f often change f to v before adding -es."),
              ("loave's", "An apostrophe shows ownership, not a plural."),
              ("loafes", "This is not how English forms this plural.")],
   "Loaf ends in -f, so change f to v and add -es: loaves.",
   "Words like loaf, leaf, and scarf change f to v before adding -es.")

mc("plural-nouns", "L.6.1", 2, "Which sentence correctly forms the plural of “cliff”?",
   "Seabirds nested along the rocky cliffs.",
   [("Seabirds nested along the rocky clives.", "Not every noun ending in -ff changes to -ves; “cliff” simply adds -s."),
    ("Seabirds nested along the rocky cliff's.", "An apostrophe shows ownership, not a plural."),
    ("Seabirds nested along the rocky cliffes.", "Nouns ending in a double consonant like -ff usually just add -s.")],
   "Cliff ends in a double f, so it simply adds -s: cliffs, unlike single-f words such as leaf.",
   "Watch out: not every word ending in f or ff changes to -ves.")

mc("plural-nouns", "L.6.1", 3, "Which sentence correctly forms the plural of “roof”?",
   "Snow covered the roofs of every house on the street.",
   [("Snow covered the rooves of every house on the street.", "This item teaches the standard plural “roofs,” the form most widely accepted in formal writing."),
    ("Snow covered the roof's of every house on the street.", "An apostrophe shows ownership, not a plural."),
    ("Snow covered the roof of every house on the street.", "The plural form must change to show more than one house's roof.")],
   "Roof is an exception; its standard plural simply adds -s: roofs.",
   "A few -f words, like roof and chief, break the usual f-to-v pattern.")

dd("plural-nouns", "L.6.1", 4, "Choose the plural: “The three village ____ met to settle the dispute.”",
   "chiefs", [("chieves", "Chief is an exception to the usual f-to-v pattern; it simply adds -s."),
              ("chief's", "An apostrophe shows ownership, not a plural."),
              ("chiefes", "This is not how the plural is spelled.")],
   "Chief is an exception; it simply adds -s: chiefs.",
   "Chief, roof, and belief are exceptions that don't change f to v.")

mc("plural-nouns", "L.6.1", 5, "Which sentence uses the plural of “cactus” correctly?",
   "The desert garden displayed several rare cacti.",
   [("The desert garden displayed several rare cactuses only.", "This item tests the classical Latin plural “cacti,” which this family uses for this word."),
    ("The desert garden displayed several rare cactus.", "The plural form must change to show more than one."),
    ("The desert garden displayed several rare cactis.", "This misspells the Latin plural form.")],
   "Cactus comes from Latin and takes the plural cacti.",
   "Some words borrowed from Latin or Greek form plurals in unusual ways.")

dd("plural-nouns", "L.6.1", 6, "Choose the plural: “Several types of ____ grew on the fallen log.”",
   "fungi", [("funguses", "This item tests the classical Latin plural “fungi” for this word."),
             ("fungus's", "An apostrophe shows ownership, not a plural."),
             ("fungis", "This misspells the Latin plural form.")],
   "Fungus comes from Latin and takes the plural fungi.",
   "Words ending in -us from Latin often take -i in the plural: cactus→cacti, fungus→fungi.")

mc("plural-nouns", "L.6.1", 7, "Which sentence uses the plural of “phenomenon” correctly?",
   "Scientists studied several unusual weather phenomena.",
   [("Scientists studied several unusual weather phenomenons.", "This item tests the Greek plural “phenomena” for this word."),
    ("Scientists studied several unusual weather phenomenon.", "The plural form must change to show more than one."),
    ("Scientists studied several unusual weather phenomenas.", "Adding -s to the already-plural “phenomena” is incorrect.")],
   "Phenomenon comes from Greek and takes the plural phenomena.",
   "Words ending in -on from Greek often take -a in the plural: criterion→criteria, phenomenon→phenomena.")

dd("plural-nouns", "L.6.1", 3, "Choose the plural: “The judges listed three ____ for scoring the essays.”",
   "criteria", [("criterions", "This item tests the Greek plural “criteria” for this word."),
                ("criterion's", "An apostrophe shows ownership, not a plural."),
                ("criterias", "Adding -s to the already-plural “criteria” is incorrect.")],
   "Criterion comes from Greek and takes the plural criteria.",
   "Criterion→criteria follows the same Greek pattern as phenomenon→phenomena.")

err("plural-nouns", "L.6.1", 4, ["Both of my", " mother-in-laws", " live", " in the same town."], 1, " mothers-in-law",
    "In a hyphenated compound like mother-in-law, the main noun (mother) is pluralized, not the last word.",
    "For compounds like mother-in-law, make the main noun plural, not the final word.")

mc("plural-nouns", "L.6.1", 6, "Which sentence uses an accepted plural of “octopus” correctly?",
   "The aquarium tank held two octopuses.",
   [("The aquarium tank held two octopi.", "“Octopi” is based on a mistaken Latin pattern; this family teaches “octopuses” as the standard English plural."),
    ("The aquarium tank held two octopus.", "The plural form must change to show more than one."),
    ("The aquarium tank held two octopus's.", "An apostrophe shows ownership, not a plural.")],
   "Octopus comes from Greek, not Latin, so the standard English plural is octopuses.",
   "Not every word ending in -us follows the Latin -i pattern; check a dictionary for words like octopus.")

# ================================================================== suffixes
grade(4)

mc("suffixes", "L.4.4.b", 1, "What does the word “baker” mean?",
   "a person who bakes",
   [("the act of baking", "That would be “baking,” not “baker.”"),
    ("full of baked goods", "-ful means full of; -er means a person who does something."),
    ("able to bake", "-able means able to; -er means a person who does something.")],
   "-er added to “bake” means a person who does that action.",
   "-er and -or often mean “a person who.”")

mc("suffixes", "L.4.4.b", 2, "The art teacher said Lina's mural was “colorful.” What does “colorful” mean?",
   "It is full of bright colors.",
   [("Someone erased the colors from it.", "The word describes a painting PACKED with color, not one with the color removed."),
    ("Only one person is allowed to paint it.", "Nothing about the suffix -ful relates to who is allowed to do something."),
    ("It can be painted over with a brush.", "That describes a possibility (able-to), which is the job of -able, not -ful.")],
   "-ful attaches to “color” to build a word meaning “full of” that quality.",
   "Spot -ful at the end of a word and think “packed with” that thing.")

mc("suffixes", "L.4.4.b", 3, "The lifeguard said the small jellyfish on the beach was “harmless.” What does “harmless” mean?",
   "It cannot hurt anyone.",
   [("It is covered in damage.", "This reverses the meaning; -less signals the ABSENCE of harm, not a covering of it."),
    ("Only a lifeguard may touch it.", "The suffix says nothing about who is permitted to do something."),
    ("It belongs to someone who studies harm.", "A word ending in -ist or -er names a person; -less does not.")],
   "The ending -less takes away the quality named by the base word, so harmless means lacking any harm.",
   "When you see -less, picture the base word's quality disappearing completely.")

mc("suffixes", "L.4.4.b", 4, "What does the word “bravely” mean?",
   "in a brave way",
   [("full of bravery", "-ful would give that meaning, not -ly."),
    ("without bravery", "-less would give that meaning, not -ly."),
    ("a person who is brave", "That describes a noun, not how an action is done.")],
   "-ly turns the adjective “brave” into an adverb describing how something is done.",
   "-ly often means “in a certain way.”")

mc("suffixes", "L.4.4.b", 5, "Dad called the puppet show “enjoyable.” What does “enjoyable” mean?",
   "It is capable of being enjoyed.",
   [("It is overflowing with fun.", "The quality of “overflowing with” a thing is what -ful does, not -able."),
    ("Nobody wants to watch it.", "This is the opposite; -able signals a positive possibility, not a rejection."),
    ("It belongs to a performer.", "A performer-naming word would end in -er, not -able.")],
   "The suffix -able means the base verb's action CAN be done, so enjoyable means capable of being enjoyed.",
   "When a word ends in -able, ask “can this be done?” to find its meaning.")

mc("suffixes", "L.4.4.b", 6, "The nurse noticed Huda's sadness after she lost her toy. What does “sadness” mean?",
   "The condition of feeling sad.",
   [("Doing something in a sad manner.", "Describing HOW an action is performed is the job of -ly, not -ness."),
    ("Overflowing with sad feelings.", "“Sadness” already names the feeling itself, so stacking -ful on top repeats the same idea."),
    ("Capable of becoming sad.", "A possibility like “can become” belongs to -able, not -ness.")],
   "The ending -ness changes the describing word “sad” into a noun that names that very condition.",
   "Spot -ness and think of the plain, named condition the base word describes.")

mc("suffixes", "L.4.4.b", 7, "What does the word “actor” mean?",
   "a person who acts",
   [("the act of acting", "That would be “acting” or “an act.”"),
    ("full of acting", "-ful means full of, not a person."),
    ("without acting", "-less means without.")],
   "-or added to “act” means a person who does that action.",
   "-er and -or often mean “a person who.”")

dd("suffixes", "L.4.4.b", 1, "Choose the word that means “without pain”: “The shot was ____ thanks to the new numbing cream.”",
   "painless", [("painful", "-ful means full of; this would mean full of pain, the opposite."),
                ("paining", "This is not a real word form."),
                ("painly", "-ly cannot attach directly to “pain” this way; it is not a real word.")],
   "-less means without, so painless means without pain.",
   "-less often means “without” a quality.")

mc("suffixes", "L.4.4.b", 2, "The weather report called today “cloudy.” What does “cloudy” mean?",
   "The sky is covered with clouds.",
   [("The sky has no clouds at all.", "This is the opposite; the suffix -y signals the presence of clouds, not their absence."),
    ("A scientist who studies clouds.", "A word naming a scientist usually ends in -ist, not -y."),
    ("The clouds can be moved by hand.", "A possibility like “can be moved” is what -able does, not -y.")],
   "The ending -y gives an adjective meaning “covered with” or “like” the base word, so cloudy means covered with clouds.",
   "When a short word ends in -y, think “covered with” that thing.")

dd("suffixes", "L.4.4.b", 3, "Choose the word that means “in a gentle, quiet way”: “She closed the door ____ so the baby wouldn't wake.”",
   "softly", [("softer", "-er compares two things, not “in a way.”"),
              ("softness", "-ness makes a noun, not a word describing how something is done."),
              ("softful", "This is not a real word.")],
   "-ly turns the adjective “soft” into an adverb describing how something is done.",
   "-ly often means “in a certain way.”")

mc("suffixes", "L.4.4.b", 4, "The librarian said the handwriting on the note was “readable.” What does “readable” mean?",
   "It is capable of being read.",
   [("It talks about books all day.", "A word naming someone who constantly does an action would end in -er, not -able."),
    ("It is overflowing with letters.", "“Overflowing with” something is the job of -ful, not -able."),
    ("Nobody is allowed to read it.", "This is the opposite; -able signals a positive possibility, not a restriction.")],
   "The suffix -able means the base verb CAN be done, so readable means capable of being read.",
   "When a word ends in -able, ask “can this be done?” to find its meaning.")

mc("suffixes", "L.4.4.b", 5, "The cave guide warned the hikers about the “darkness” ahead. What does “darkness” mean?",
   "The condition of having no light.",
   [("Doing something in a sneaky manner.", "Describing HOW something is done is the job of -ly, not -ness."),
    ("Capable of blocking out light.", "A possibility like “can block” belongs to -able, not -ness."),
    ("A creature that only comes out at night.", "A word naming a creature or person usually ends in -er or -ist, not -ness.")],
   "The ending -ness changes the describing word “dark” into a noun naming that condition.",
   "Spot -ness and think of the plain, named condition the base word describes.")

mc("suffixes", "L.4.4.b", 6, "What does the word “visitor” mean?",
   "a person who visits",
   [("the act of visiting", "That would be “visiting” or “a visit.”"),
    ("full of visiting", "-ful means full of, not a person."),
    ("able to visit", "That is the meaning of -able.")],
   "-or added to “visit” means a person who does that action.",
   "-er and -or often mean “a person who.”")

dd("suffixes", "L.4.4.b", 7, "Choose the word that means “full of power”: “The ____ motor pulled the boat easily across the lake.”",
   "powerful", [("powerless", "-less means without, the opposite meaning."),
                ("powering", "This describes an action, not “full of power.”"),
                ("powerly", "This is not a real word.")],
   "-ful means full of, so powerful means full of power.",
   "-ful often means “full of” a quality.")

match("suffixes", "L.4.4.b", 4, "Match each suffix with its meaning.",
      [("-able", "able to be"), ("-ness", "the state of being"), ("-y", "full of or like"), ("-or", "a person who does something")],
      "Knowing what each suffix usually means helps you figure out an unfamiliar word's meaning.",
      "Break a long word into its base and suffix to guess its meaning.")

grade(5)

mc("suffixes", "L.5.4.b", 1, "The coach could hear the “excitement” building in the locker room before the game. What does “excitement” mean?",
   "The feeling of being thrilled.",
   [("A player who constantly thrills the crowd.", "A word naming a person usually ends in -er or -ist, not -ment."),
    ("Likely to cause a thrill in others.", "Describing a TENDENCY to cause something is the job of -ive, not -ment."),
    ("The act of making someone calm down.", "This is the opposite effect; the base word “excite” means to stir up feeling, not settle it.")],
   "The suffix -ment turns the verb “excite” into a noun that names the resulting feeling.",
   "Spot -ment and look for the noun naming the result of the verb's action.")

mc("suffixes", "L.5.4.b", 2, "What does the word “active” mean?",
   "tending to act or move",
   [("the state of acting", "That is closer to the meaning of -ment or -ity."),
    ("full of action", "That is closer to the meaning of -ous, as in a word like “actionous,” which is not real."),
    ("to make something act", "That is closer to the meaning of -ize.")],
   "-ive describes a tendency to do the action of the base word.",
   "-ive often turns a verb into an adjective meaning “tending to.”")

mc("suffixes", "L.5.4.b", 3, "The park ranger warned hikers that the cliff trail was “dangerous.” What does “dangerous” mean?",
   "It is full of danger.",
   [("It has no risk at all.", "This is the opposite; the suffix -ous signals the PRESENCE of danger, not its absence."),
    ("A person trained to handle danger.", "A word naming a trained person usually ends in -ist or -er, not -ous."),
    ("The act of removing a hazard.", "An action word like this would usually end in -ing or -tion, not -ous.")],
   "The suffix -ous builds an adjective meaning “full of” the base noun, so dangerous means full of danger.",
   "Spot -ous and think “full of” the quality the base word names.")

mc("suffixes", "L.5.4.b", 4, "Yara's endless questions showed her “curiosity” about how things work. What does “curiosity” mean?",
   "The quality of wanting to know things.",
   [("Someone who answers every question asked.", "A word naming a person who performs an action usually ends in -er, not -ity."),
    ("Overflowing with unanswered questions.", "“Overflowing with” something describes -ful, not -ity."),
    ("Avoiding new or unfamiliar things.", "This is the opposite; curiosity describes seeking out the unfamiliar, not avoiding it.")],
   "The suffix -ity turns the adjective “curious” into a noun naming that quality.",
   "Spot -ity or -ty and look for the noun naming the quality the adjective describes.")

dd("suffixes", "L.5.4.b", 5, "Choose the word that means “to become dark”: “At dusk, the sky began to ____ over the quiet valley.”",
   "darken", [("darkness", "This is a noun naming a state, not a verb meaning “to become.”"),
              ("darkly", "This describes how something is done, not a change happening."),
              ("darkful", "This is not a real word.")],
   "-en can turn an adjective into a verb meaning “to become” that quality.",
   "-en often means “to become” or “to make.”")

dd("suffixes", "L.5.4.b", 6, "Choose the word that means “to make modern”: “The committee voted to ____ the aging library building.”",
   "modernize", [("modernly", "This describes how something is done, not an action of change."),
                 ("modernness", "This names a state, not an action."),
                 ("modernous", "This is not a real word.")],
   "-ize means “to make,” so modernize means to make modern.",
   "-ize often turns an adjective or noun into a verb meaning “to make.”")

mc("suffixes", "L.5.4.b", 7, "What does the word “natural” mean?",
   "relating to nature",
   [("full of nature", "That would need -ful, not -al."),
    ("the act of being in nature", "That is closer to the meaning of -ment."),
    ("tending toward nature", "That is closer to the meaning of -ive.")],
   "-al turns the noun “nature” into an adjective meaning “relating to.”",
   "-al often turns a noun into an adjective meaning “relating to.”")

mc("suffixes", "L.5.4.b", 1, "What does the word “replacement” mean?",
   "the act of replacing",
   [("tending to replace", "That is closer to the meaning of -ive."),
    ("full of replacing", "-ous or -ful would suggest that, not -ment."),
    ("able to be replaced", "That is closer to the meaning of -able.")],
   "-ment turns the verb “replace” into a noun naming the action.",
   "-ment often names the result or act of a verb.")

mc("suffixes", "L.5.4.b", 2, "What does the word “creative” mean?",
   "tending to create new things",
   [("the state of creating", "That is closer to the meaning of -ment or -ity."),
    ("full of creation", "That is closer to the meaning of -ous."),
    ("able to be created", "That is closer to the meaning of -able.")],
   "-ive describes a tendency to do the action of the base word, here “create.”",
   "-ive often turns a verb into an adjective meaning “tending to.”")

mc("suffixes", "L.5.4.b", 3, "What does the word “courageous” mean?",
   "full of courage",
   [("without courage", "That would be the opposite, closer to a word with -less."),
    ("the state of having courage", "That is closer to the meaning of -ity."),
    ("tending to show courage occasionally", "-ous simply means full of, not occasional.")],
   "-ous means full of, so courageous means full of courage.",
   "-ous often means “full of” a quality.")

mc("suffixes", "L.5.4.b", 4, "The coach praised Omar's “ability” to read the field quickly. What does “ability” mean?",
   "The quality of being capable of doing something.",
   [("A player who trains others daily.", "A word naming a person who performs an action usually ends in -er, not -ity."),
    ("Lacking any skill whatsoever.", "This is the opposite; ability describes having skill, not the absence of it."),
    ("The act of teaching a new skill.", "An action word like this would usually end in -ing or -tion, not -ity.")],
   "The suffix -ity turns the adjective “able” into a noun naming that quality.",
   "Spot -ity or -ty and look for the noun naming the quality the adjective describes.")

dd("suffixes", "L.5.4.b", 5, "Choose the word that means “to become stronger”: “Daily practice will ____ your reading skills.”",
   "strengthen", [("strength", "This is the noun itself, not a verb meaning “to become.”"),
                  ("strongly", "This describes how something is done, not a change happening."),
                  ("strengthful", "This is not a real word.")],
   "-en can turn a noun or adjective into a verb meaning “to become” or “to make.”",
   "-en often means “to become” or “to make.”")

dd("suffixes", "L.5.4.b", 6, "Choose the word that means “to put into order”: “Please ____ these files before the meeting starts.”",
   "organize", [("organization", "This is a noun naming a result, not a verb meaning to act."),
                ("organically", "This word is unrelated in meaning to putting things in order."),
                ("organal", "This is not a real word.")],
   "-ize means “to make,” so organize means to make organized, or put into order.",
   "-ize often turns a noun or adjective into a verb meaning “to make.”")

mc("suffixes", "L.5.4.b", 7, "What does the word “musical” mean?",
   "relating to music",
   [("full of music", "That would need -ful, not -al."),
    ("the act of making music", "That is closer to the meaning of -ment."),
    ("able to make music", "That is closer to the meaning of -able.")],
   "-al turns the noun “music” into an adjective meaning “relating to.”",
   "-al often turns a noun into an adjective meaning “relating to.”")

match("suffixes", "L.5.4.b", 4, "Match each suffix with its meaning.",
      [("-ive", "tending to"), ("-ous", "full of"), ("-ity", "the state of being"), ("-ize", "to make")],
      "Knowing what each suffix usually means helps you figure out an unfamiliar word's meaning.",
      "Break a long word into its base and suffix to guess its meaning.")
