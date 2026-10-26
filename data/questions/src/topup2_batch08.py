"""
Question bank top-up 2, batch 08: brings these families to the full target of 50 items each
(original content, Grades 4-6).
Families: word-relationships (G6), apostrophes-contractions (G4-G5), imagery (G4-G6),
compare-contrast (G4-G6).
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== word-relationships
grade(6)

# -- part-to-whole (6) --
mc("word-relationships", "L.6.5.b", 1, "Which pair shows a PART-to-WHOLE relationship?",
   "page : book",
   [("author : reader", "This names two different people, not a part contained within a whole."),
    ("pencil : eraser", "These are two separate tools used together, not a part of a whole."),
    ("library : shelf", "This reverses the order; a shelf is a part of a library, not the other way around.")],
   "A page is one part that makes up the whole book.",
   "Ask: is the first word physically contained inside the second?")

mc("word-relationships", "L.6.5.b", 2, "Which pair shows a PART-to-WHOLE relationship?",
   "petal : flower",
   [("bee : hive", "A bee is one member of a group that lives in a hive, which is member-to-group, not part-to-whole."),
    ("garden : petal", "This reverses the order; the petal is the part, and it comes first in a true part-to-whole pair."),
    ("stem : soil", "Both of these are separate things a plant needs, not a part and the whole it belongs to.")],
   "A petal is one part of the whole flower.",
   "The part should be something that is physically attached to or inside the whole.")

mc("word-relationships", "L.6.5.b", 3, "Which pair shows the SAME relationship as “wing : bird”?",
   "verse : song",
   [("radio : station", "A radio plays a station's broadcast; it is not a piece contained inside the station."),
    ("audience : song", "An audience listens to a song, but it is not a part of the song itself."),
    ("instrument : musician", "This shows a tool and the person who uses it, not a part and its whole.")],
   "Just as a wing is one part of the whole bird, a verse is one part of the whole song.",
   "Restate the pair as “a ___ is one part of a ___” and test each choice.")

dd("word-relationships", "L.6.5.b", 3, "Choose the word that completes the PART-to-WHOLE analogy: branch : ____ :: wave : ocean",
   "tree",
   [("leaf", "A leaf is also a part of a tree, so this pairs two parts instead of a part and its whole."),
    ("forest", "A forest is a group of many trees, which is member-to-group, not part-to-whole."),
    ("root", "A root is a different part of the tree, not the whole tree itself.")],
   "A branch is one part of the whole tree, just as a wave is one part of the whole ocean.",
   "The second word in each pair should be the complete thing that contains the first.")

mc("word-relationships", "L.6.5.b", 4, "Which pair shows a PART-to-WHOLE relationship?",
   "hinge : door",
   [("tool : carpenter", "This shows a worker and the tool they use, not a part and its whole."),
    ("house : neighborhood", "A house is one member of a neighborhood, which is member-to-group, not part-to-whole."),
    ("window : curtain", "These are two separate objects often used together, but neither is a piece of the other.")],
   "A hinge is a small part that is built into the whole door.",
   "Picture taking the object apart: is the first word one of the pieces you would find?")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows a PART-to-WHOLE relationship?",
   "spoke : wheel",
   [("tire : road", "A tire touches a road, but the road is not a whole object that contains the tire."),
    ("axle : engine", "An axle and an engine are both separate parts of a car; neither is the whole that contains the other."),
    ("driver : wheel", "This names a person and an object, not a part and the whole it belongs to.")],
   "A spoke is one of the thin parts that make up the whole wheel.",
   "If you removed the first word's object, would the second word's object still be complete?")

# -- whole-to-part, reversed order (5) --
mc("word-relationships", "L.6.5.b", 2, "Which pair shows a WHOLE-to-PART relationship, with the whole named first?",
   "necklace : bead",
   [("jeweler : necklace", "This shows a worker and the object they make, not a whole and one of its parts."),
    ("bead : bracelet", "This lists the part first and the whole second, which is the reverse order being asked for."),
    ("necklace : jewelry box", "A jewelry box stores a necklace; it is not a piece of the necklace itself.")],
   "The necklace, the whole object, is named first, followed by the bead, one of its many parts.",
   "Check the order: does the first word contain the second, or is it the other way around?")

mc("word-relationships", "L.6.5.b", 3, "Which pair shows a WHOLE-to-PART relationship, with the whole named first?",
   "orchestra : violin",
   [("violin : musician", "This shows an object and the person who plays it, not a whole and one of its parts."),
    ("violin : orchestra", "This lists the part first and the whole second, the reverse of what is being asked for."),
    ("conductor : orchestra", "A conductor leads the orchestra but is not one of the orchestra's component parts.")],
   "The orchestra, the whole group, is named first, followed by the violin, one of its instruments.",
   "Say the pair as a sentence: “The ___ is made up of many ___s.”")

dd("word-relationships", "L.6.5.b", 4, "Choose the word that completes the WHOLE-to-PART analogy: forest : ____ :: fleet : ship",
   "tree",
   [("jungle", "This renames the whole with a similar word instead of naming one of its parts."),
    ("leaf", "A leaf is a part of a tree, not a part of the forest at this level of the comparison."),
    ("ranger", "A ranger works in a forest but is not one of the forest's physical parts.")],
   "A forest is made up of many trees, just as a fleet is made up of many ships.",
   "Match the level of the comparison: forest relates to tree the way fleet relates to ship.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows a WHOLE-to-PART relationship, with the whole named first?",
   "skeleton : bone",
   [("doctor : skeleton", "This shows a worker and the object they study, not a whole and one of its parts."),
    ("bone : marrow", "This compares two things found inside a body, but it does not match the skeleton-and-bone pair being described."),
    ("body : skeleton", "This lists the larger whole first and the skeleton second, but the skeleton is itself a whole made of bones, which is the relationship asked for.")],
   "The skeleton, the whole structure, is named first, followed by the bone, one of its parts.",
   "Ask which word names a single piece and which word names the full structure.")

mc("word-relationships", "L.6.5.b", 6, "Which pair shows a WHOLE-to-PART relationship, with the whole named first?",
   "committee : member",
   [("member : vote", "This shows a role and an action, not a whole and one of its parts."),
    ("member : committee", "This lists the part first and the whole second, the reverse of what is being asked for."),
    ("chairperson : committee", "A chairperson has a special role within the group, but the question asks for the group and any ordinary part of it.")],
   "A committee, the whole group, is made up of its individual members.",
   "The whole should be a single unit, and the part should be one piece inside it.")

# -- item-to-category (6) --
mc("word-relationships", "L.6.5.b", 1, "Which pair shows an ITEM-to-CATEGORY relationship?",
   "salmon : fish",
   [("ocean : salmon", "An ocean is a habitat, not the general group or category that salmon belongs to."),
    ("fisherman : salmon", "This shows a worker and the thing they catch, not an item and its category."),
    ("salmon : dinner", "A salmon can become a meal, but “dinner” is not the biological category it belongs to.")],
   "A salmon is one specific example that belongs to the broader category of fish.",
   "Ask: is the second word a general group that the first word is a type of?")

mc("word-relationships", "L.6.5.b", 2, "Which pair shows an ITEM-to-CATEGORY relationship?",
   "oak : tree",
   [("acorn : oak", "An acorn grows into an oak, which is more of a cause-and-growth relationship, not item-to-category."),
    ("tree : forest", "This is item-to-group, since a tree is a member of a forest, not an item and its general category."),
    ("oak : furniture", "Furniture can be made from oak wood, but “furniture” is not the category oak itself belongs to.")],
   "An oak is one specific kind of tree, so it belongs to the broad category “tree.”",
   "The category word should describe a whole group the first word is a member of, by type.")

dd("word-relationships", "L.6.5.b", 3, "Choose the word that completes the ITEM-to-CATEGORY analogy: tulip : flower :: python : ____",
   "snake",
   [("reptile", "A python is also a reptile, but “snake” is the more exact match to how specific “flower” is for tulip."),
    ("desert", "A desert is a habitat where some pythons live, not the category of animal it belongs to."),
    ("predator", "This describes how the python behaves, not the general group it belongs to.")],
   "A tulip belongs to the category “flower,” and a python belongs to the matching category “snake.”",
   "Pick the category that is at the same level of detail on both sides of the analogy.")

mc("word-relationships", "L.6.5.b", 4, "Which pair shows an ITEM-to-CATEGORY relationship?",
   "cumulus : cloud",
   [("sky : cumulus", "This reverses the order; the cloud type should be named first as the specific item.", ),
    ("rain : cumulus", "Rain can fall from some clouds, but this names an effect, not the category the cloud belongs to."),
    ("weather : forecast", "These two words describe a general topic and a type of report about it, not an item and its category.")],
   "Cumulus is one specific kind of cloud, so it belongs to the broad category “cloud.”",
   "The first word should be a specific example, and the second should be the broader group.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows an ITEM-to-CATEGORY relationship?",
   "sonata : composition",
   [("composer : sonata", "This shows a worker and the thing they create, not an item and its category."),
    ("orchestra : sonata", "An orchestra can perform a sonata, but the orchestra is not the category the sonata belongs to."),
    ("symphony : orchestra", "A symphony is performed by an orchestra, but this pairs a piece with a performing group, not an item with its category.")],
   "A sonata is one specific type of musical composition, so it belongs to the category “composition.”",
   "Check that the second word names a broad type the first word fits into.")

mc("word-relationships", "L.6.5.b", 6, "Which pair shows an ITEM-to-CATEGORY relationship?",
   "diesel : fuel",
   [("engine : diesel", "This shows a machine and the fuel it uses, not an item and its category."),
    ("fuel : diesel", "This lists the category first and the item second, the reverse of what is being asked for."),
    ("gallon : fuel", "A gallon is a unit used to measure fuel, not a type of fuel itself.")],
   "Diesel is one specific kind of fuel, so it belongs to the broad category “fuel.”",
   "Say the pair as “a ___ is a type of ___” and see if it still makes sense.")

# -- cause-to-effect (6) --
mc("word-relationships", "L.6.5.b", 2, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "drought : wilted crops",
   [("farmer : crops", "This shows a worker and the thing they grow, not a cause and its effect."),
    ("rain : drought", "Rain actually helps prevent a drought rather than causing one, so this is not a true cause-and-effect pair."),
    ("crops : harvest", "These are two steps in a farming process, not a single cause producing one effect.")],
   "A drought causes crops to dry out and wilt from lack of water.",
   "Ask which event happens first and makes the second event happen.")

mc("word-relationships", "L.6.5.b", 3, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "earthquake : collapsed bridge",
   [("engineer : bridge", "This shows a worker and the structure they build, not a cause and its effect."),
    ("bridge : river", "This shows an object and the place it is built over, not a cause and its effect."),
    ("collapse : earthquake", "This lists the effect before the cause, the reverse of the order being asked for.")],
   "The shaking from the earthquake is what caused the bridge to collapse.",
   "The cause should be the event, and the effect should be the result of that event.")

dd("word-relationships", "L.6.5.b", 4, "Choose the word or phrase that completes the CAUSE-and-EFFECT analogy: frost : frozen pipes :: heat wave : ____",
   "melted asphalt",
   [("sunscreen", "This is something people use during a heat wave, not an effect the heat wave causes."),
    ("thermometer", "A thermometer measures temperature; it is not an effect caused by extreme heat."),
    ("summer", "This names a season, not a specific effect caused by the heat wave.")],
   "Just as frost causes pipes to freeze, extreme heat can cause asphalt roads to melt.",
   "The second word in each pair should describe something that happens because of the first.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "neglect : rusted gate",
   [("paint : gate", "Paint and a gate are an object and a material used on it, not a cause and its effect."),
    ("gate : fence", "A gate is usually part of a fence, which is part-to-whole, not cause-and-effect."),
    ("rust : metal", "This describes a property that can affect metal, but it does not name a cause producing a distinct result.")],
   "Years of neglect, such as never cleaning or oiling it, is what caused the gate to rust.",
   "Picture the first word as an ongoing condition and the second as its lasting result.")

mc("word-relationships", "L.6.5.b", 6, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "overfishing : declining fish population",
   [("fisherman : boat", "This shows a worker and the tool they use, not a cause and its effect."),
    ("ocean : fish", "This shows a habitat and the animals that live there, not a cause and its effect."),
    ("population : decline", "This only restates the effect by itself, without naming the cause that produced it.")],
   "Catching too many fish over time is what causes the overall fish population to shrink.",
   "Ask: does the first idea explain why the second idea happened?")

mc("word-relationships", "L.6.5.b", 7, "Which pair shows a CAUSE-and-EFFECT relationship?",
   "deforestation : soil erosion",
   [("logger : tree", "This shows a worker and the object they cut down, not a cause and its effect."),
    ("erosion : deforestation", "This lists the effect before the cause, the reverse of the order being asked for."),
    ("forest : wildlife", "This shows a habitat and the animals that live in it, not a cause and its effect.")],
   "Removing trees leaves soil unprotected, which causes it to wash or blow away.",
   "Tree roots normally hold soil in place; removing them removes that protection.")

# -- effect-to-cause (4) --
mc("word-relationships", "L.6.5.b", 3, "Which pair shows an EFFECT-to-CAUSE relationship, with the effect named first?",
   "sunburn : too much sun exposure",
   [("sunscreen : skin", "This shows a protective item and the body part it protects, not an effect and its cause."),
    ("sun exposure : sunburn", "This lists the cause before the effect, the reverse of the order being asked for."),
    ("tan : summer", "This is a loose association between a season and a skin change, not a precise effect naming its cause.")],
   "The sunburn is the effect, and spending too long in the sun is the cause that produced it.",
   "Read the pair as “___ happened because of ___” to check the order.")

mc("word-relationships", "L.6.5.b", 4, "Which pair shows an EFFECT-to-CAUSE relationship, with the effect named first?",
   "shattered window : thrown rock",
   [("glass : window", "This shows a material and the object made from it, not an effect and its cause."),
    ("thrown rock : shattered window", "This lists the cause before the effect, the reverse of the order being asked for."),
    ("window : house", "This is part-to-whole, since a window is part of a house, not an effect and its cause.")],
   "The shattered window is the effect, and the thrown rock is what caused it to break.",
   "Find the result first, then ask what event made that result happen.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows an EFFECT-to-CAUSE relationship, with the effect named first?",
   "traffic jam : stalled truck blocking the highway",
   [("highway : truck", "This shows a location and an object on it, not an effect and its cause."),
    ("stalled truck : traffic jam", "This lists the cause before the effect, the reverse of the order being asked for."),
    ("driver : truck", "This shows a person and the vehicle they operate, not an effect and its cause.")],
   "The traffic jam is the effect, caused by the stalled truck blocking the road.",
   "The effect word usually names a problem or change; the cause word explains why it happened.")

mc("word-relationships", "L.6.5.b", 6, "Which pair shows an EFFECT-to-CAUSE relationship, with the effect named first?",
   "power outage : downed electrical line during the storm",
   [("electrician : line", "This shows a worker and the object they repair, not an effect and its cause."),
    ("storm : outage", "The storm is a broader trigger, but it is not the precise, direct cause of the outage described here."),
    ("downed line : power outage", "This lists the cause before the effect, the reverse of the order being asked for.")],
   "The power outage is the effect, caused directly by the electrical line that fell during the storm.",
   "Look for the exact event that directly caused the problem, not just the general situation around it.")

# -- tool-to-user / worker-to-tool (5) --
mc("word-relationships", "L.6.5.b", 2, "Which pair shows a TOOL-to-USER relationship?",
   "scalpel : surgeon",
   [("hospital : surgeon", "This shows a workplace and a worker, not a tool and the person who uses it."),
    ("surgeon : scalpel", "This lists the user first and the tool second, the reverse of what is being asked for."),
    ("patient : surgeon", "These are two people in a medical setting, not a tool and its user.")],
   "A scalpel is the tool that a surgeon uses to perform surgery.",
   "The tool should be an object, and the user should be the person who operates it.")

mc("word-relationships", "L.6.5.b", 3, "Which pair shows a TOOL-to-USER relationship?",
   "telescope : astronomer",
   [("star : telescope", "This shows the object being observed and the tool used to observe it, not a tool and its user."),
    ("astronomer : telescope", "This lists the user first and the tool second, the reverse of what is being asked for."),
    ("observatory : astronomer", "This shows a workplace and a worker, not a tool and the person who uses it.")],
   "A telescope is the tool that an astronomer uses to study the sky.",
   "Ask which word names an object you hold and which names the person who holds it.")

dd("word-relationships", "L.6.5.b", 4, "Choose the word that completes the TOOL-to-USER analogy: stethoscope : doctor :: whisk : ____",
   "baker",
   [("flour", "Flour is an ingredient a baker might use, not the person who uses the whisk."),
    ("oven", "An oven is a different tool entirely, not the person using the whisk."),
    ("bakery", "A bakery is a workplace, not the person who actually uses the tool.")],
   "Just as a doctor uses a stethoscope, a baker uses a whisk.",
   "Match each tool to the type of person who would naturally hold and use it.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows a TOOL-to-USER relationship?",
   "gavel : judge",
   [("courtroom : judge", "This shows a workplace and a worker, not a tool and the person who uses it."),
    ("judge : gavel", "This lists the user first and the tool second, the reverse of what is being asked for."),
    ("lawyer : judge", "These are two different professional roles, not a tool and its user.")],
   "A gavel is the small tool a judge uses to call for order in the courtroom.",
   "The first word in a tool-to-user pair should be something the second word physically holds.")

mc("word-relationships", "L.6.5.b", 6, "Which pair shows a TOOL-to-USER relationship?",
   "chisel : sculptor",
   [("marble : sculptor", "Marble is a material a sculptor shapes, not a tool they hold and use."),
    ("sculptor : chisel", "This lists the user first and the tool second, the reverse of what is being asked for."),
    ("studio : sculptor", "This shows a workplace and a worker, not a tool and the person who uses it.")],
   "A chisel is the tool a sculptor uses to carve and shape stone or wood.",
   "Picture the object in someone's hand; the hand it belongs in is the user.")

# -- degree / intensity (5) --
mc("word-relationships", "L.6.5.b", 3, "A weather reporter needs a word pair for the same kind of heat, going from mild to extreme. Which pair fits?",
   "warm : scorching",
   [("warm : cold", "This pair sits at opposite ends of the temperature scale, not two points on the same side."),
    ("scorching : freezing", "Both words here already describe extremes, just at opposite ends, not a mild-to-strong climb."),
    ("warm : sunny", "A quality (heat) and an unrelated weather trait don't belong on a single shared scale.")],
   "“Warm” and “scorching” both describe heat, but “scorching” describes a much more intense heat.",
   "Both words should describe the exact same quality, just to different strengths.")

mc("word-relationships", "L.6.5.b", 4, "A counselor wants to rank one emotion from a mild spark up to its most extreme version. Which pair fits?",
   "annoyed : furious",
   [("annoyed : calm", "Calm is the absence of irritation, the opposite direction from building anger."),
    ("furious : relaxed", "Relaxed sits at the opposite end from rage, not a milder step toward it."),
    ("annoyed : happy", "Happiness is an unrelated emotion, not a milder point on the anger scale.")],
   "Being furious is a much stronger version of the mild irritation you feel when annoyed.",
   "Rank the two feelings on one scale from mild to extreme.")

dd("word-relationships", "L.6.5.b", 4, "Choose the word that shows a STRONGER version of “tired”: She wasn't just tired, she was ____ after the race.",
   "exhausted",
   [("rested", "This is the opposite of tired, not a stronger version of it."),
    ("awake", "This does not describe tiredness at all."),
    ("bored", "This describes a different feeling entirely, not a greater amount of tiredness.")],
   "“Exhausted” describes an extreme level of tiredness, far beyond ordinary tiredness.",
   "Look for context clues like “wasn't just ___” that signal a stronger word is needed.")

mc("word-relationships", "L.6.5.b", 5, "Which pair shows two words that describe the SAME quality, but the second word is much STRONGER?",
   "damp : drenched",
   [("damp : dry", "These describe opposite amounts of wetness, not two strengths of the same quality."),
    ("drenched : parched", "These are opposite extremes of wetness and dryness, not a mild and a stronger version of the same quality."),
    ("damp : cool", "These describe two different qualities, not the same quality at two different strengths.")],
   "Both words describe wetness, but “drenched” means far wetter than merely “damp.”",
   "Ask whether both words sit on the same scale, just at different points.")

mc("word-relationships", "L.6.5.b", 6, "A writing coach asks for a pair tracking ONE emotion from a slight worry up to total panic. Which pair fits?",
   "concerned : terrified",
   [("concerned : fearless", "Fearless describes having no fear at all, moving away from the feeling rather than deeper into it."),
    ("terrified : confident", "Confidence is unrelated to fear, not a milder step back from panic."),
    ("concerned : curious", "Curiosity is an unrelated feeling, not a weaker version of worry.")],
   "Terror is a far more extreme version of the mild worry described as “concerned.”",
   "Picture a thermometer for the feeling: where would each word land?")

# -- antonym relationship (4) --
mc("word-relationships", "L.6.5.b", 2, "Which pair of words are ANTONYMS (opposites)?",
   "generous : stingy",
   [("generous : kind", "These two words are close in meaning, not opposites."),
    ("stingy : cheap", "These two words are close in meaning, not opposites."),
    ("generous : wealthy", "Being generous and being wealthy describe unrelated qualities, not opposite ones.")],
   "Someone who is generous freely gives, while someone who is stingy refuses to give; these describe opposite behaviors.",
   "Check each pair against a simple test: does one word mean roughly the opposite of the other?")

mc("word-relationships", "L.6.5.b", 3, "Which pair of words are ANTONYMS (opposites)?",
   "transparent : opaque",
   [("transparent : clear", "These two words are close in meaning, not opposites."),
    ("opaque : dark", "These two words are related in meaning, but “dark” is not the true opposite of “transparent.”"),
    ("transparent : glass", "This pairs a quality with a material, not two opposite qualities.")],
   "Something transparent lets light pass through it, while something opaque blocks light completely.",
   "Opposite pairs should describe two qualities that cannot both be fully true at once.")

dd("word-relationships", "L.6.5.b", 5, "Choose the ANTONYM that completes the sentence: The hallway was so ____ that we could barely see, unlike the brilliantly lit lobby.",
   "dim",
   [("bright", "This matches the description of the lobby, not the contrasting description of the hallway."),
    ("spacious", "This describes size, not how much light there was."),
    ("narrow", "This describes width, not light, so it does not contrast with “brilliantly lit.”")],
   "“Dim” is the opposite of “brilliantly lit,” matching the contrast the sentence describes.",
   "Look for clue words like “unlike” that signal an opposite is needed.")

mc("word-relationships", "L.6.5.b", 6, "Which pair of words are ANTONYMS (opposites)?",
   "meticulous : careless",
   [("meticulous : thorough", "These two words are close in meaning, not opposites."),
    ("careless : clumsy", "These two words are close in meaning, not opposites."),
    ("meticulous : slow", "Being meticulous does not necessarily mean being slow, so this is not a true opposite pair.")],
   "Someone meticulous pays extremely close attention to detail, while someone careless pays little attention at all.",
   "Picture each word's behavior; true antonyms cannot describe the same action at the same time.")

# -- defining characteristic / function (2) --
mc("word-relationships", "L.6.5.b", 4, "Which pair correctly matches an object with its defining FUNCTION?",
   "thermometer : measuring temperature",
   [("thermometer : glass", "This names a material the object might be made of, not the function it performs."),
    ("doctor : thermometer", "This shows a user and a tool, not an object and the function it performs."),
    ("temperature : weather", "This pairs two general ideas, not a specific object with the exact job it is built to do.")],
   "A thermometer's defining job is to measure temperature.",
   "Ask: what is this object specifically built to do?")

match("word-relationships", "L.6.5.b", 5, "Match each tool with the defining function it performs.",
      [("compass", "showing direction"), ("barometer", "measuring air pressure"),
       ("microscope", "magnifying tiny objects"), ("thermostat", "regulating temperature")],
      "Each tool is defined mainly by the one specific job it is built to perform.",
      "Ask what single task each object is specifically designed to do.")

# ================================================================== apostrophes-contractions
grade(4)

dd("apostrophes-contractions", "L.4.2", 1, "Choose the contraction for “he will”: “____ be here soon.”",
   "He’ll",
   [("Hes’ll", "This is not a real word or contraction."),
    ("Hell", "Without the apostrophe, this spells a completely different word."),
    ("He’ll’s", "An extra apostrophe and letters make this incorrect.")],
   "“He will” contracts to “he’ll,” with the apostrophe replacing “wi.”",
   "Say the two words fast to hear which letters disappear.")

fill("apostrophes-contractions", "L.4.2", 1, "Write the contraction for “is not”: “That ____ fair!”",
     ["isn't", "isn’t"],
     "“Is not” contracts to “isn’t”; the apostrophe replaces the letter o.",
     "The apostrophe always sits where a letter is missing.")

dd("apostrophes-contractions", "L.4.2", 2, "Choose the contraction for “I will”: “____ meet you at the gate.”",
   "I’ll",
   [("Ill", "Without the apostrophe, this spells a different word meaning sick."),
    ("I’ll’ve", "There is no such double contraction."),
    ("Ia’ll", "This spelling is not correct.")],
   "“I will” contracts to “I’ll.”",
   "Read the sentence aloud: does it sound like “I will meet you”?")

mc("apostrophes-contractions", "L.4.2", 2, "Which sentence uses a possessive correctly?",
   "The dog’s leash is red.",
   [("The dogs leash is red.", "Without an apostrophe, “dogs” just looks plural, not possessive."),
    ("The dog’s’ leash is red.", "An extra apostrophe after “dog’s” is never correct."),
    ("The dogs’s leash is red.", "This wrongly adds both a plural ending and a possessive ending.")],
   "One dog owns the leash, so the singular possessive “dog’s” is correct.",
   "Ask how many owners there are before you decide where the apostrophe goes.")

dd("apostrophes-contractions", "L.4.2", 2, "Choose the correct word: “____ going to rain later.”",
   "It’s",
   [("Its", "“Its” shows ownership; the sentence needs “it is.”"),
    ("Its’", "This spelling is never correct in English."),
    ("I’ts", "The apostrophe is in the wrong place.")],
   "“It’s” is the contraction for “it is,” which fits this sentence.",
   "Replace the word with “it is”: if the sentence still makes sense, use “it’s.”")

mc("apostrophes-contractions", "L.4.2", 3, "Which sentence correctly shows that a leash belongs to MORE THAN ONE dog?",
   "The dogs’ leash is torn.",
   [("The dog’s leash is torn.", "This shows that only one dog owns the leash."),
    ("The dogs’s leash is torn.", "This incorrectly adds an extra s after the apostrophe."),
    ("The dog’s’ leash is torn.", "This apostrophe placement is never correct.")],
   "When the owners are plural and already end in s, the apostrophe goes after the s: dogs’.",
   "Plural owner ending in s: just add an apostrophe after the s.")

err("apostrophes-contractions", "L.4.2", 3, ["The students", " project", " won", " first prize."], 0, "students’",
    "More than one student shares the project, so the apostrophe belongs after the s: students’.",
    "Decide if the owner is one person or many before placing the apostrophe.")

dd("apostrophes-contractions", "L.4.2", 3, "Choose the contraction for “they have”: “____ already left.”",
   "They’ve",
   [("Their've", "This is not a real contraction."),
    ("Theyve", "The apostrophe is missing."),
    ("They’ve’s", "There is no such word.")],
   "“They have” contracts to “they’ve.”",
   "The apostrophe replaces the “ha” in “have.”")

tf("apostrophes-contractions", "L.4.2", 3, "“Could not” correctly contracts to “couldn’t.”", True,
   "The apostrophe replaces the letter o in “not,” making “couldn’t.”",
   "Most “not” contractions just drop the o: isn’t, wasn’t, couldn’t.")

mc("apostrophes-contractions", "L.4.2", 4, "Which sentence correctly uses “whose”?",
   "Whose umbrella got left on the bus seat?",
   [("Who’s umbrella got left on the bus seat?", "“Who’s” means “who is,” which would make this question meaningless."),
    ("Whos umbrella got left on the bus seat?", "This spelling of “whose” is incorrect; “whose” never takes an apostrophe."),
    ("Who’se umbrella got left on the bus seat?", "This is not a correct spelling of either word.")],
   "“Whose” shows ownership, asking who the umbrella belongs to.",
   "“Whose” = belonging to whom; “who’s” = who is.")

dd("apostrophes-contractions", "L.4.2", 4, "Choose the correct word: “____ bringing the snacks today?”",
   "Who’s",
   [("Whose", "“Whose” shows ownership; the sentence needs “who is.”"),
    ("Who’se", "This is not a correct spelling."),
    ("Whos", "The apostrophe is missing.")],
   "“Who’s” is the contraction for “who is,” which fits this question.",
   "Try replacing the word with “who is” to check if it still makes sense.")

mc("apostrophes-contractions", "L.4.2", 4, "Which sentence correctly shows the possessive of the name Chris?",
   "Chris’s backpack is on the bus.",
   [("Chriss’ backpack is on the bus.", "The apostrophe must come right after the s already in “Chris,” not after an extra one."),
    ("Chris backpack is on the bus.", "Without an apostrophe, there is no way to show that the backpack belongs to Chris."),
    ("Chrises backpack is on the bus.", "This incorrectly changes the spelling of the name instead of adding a possessive ending.")],
   "For a singular name ending in s, add ’s to show possession: Chris’s.",
   "Singular owner: add ’s, even if the name already ends in s.")

dd("apostrophes-contractions", "L.4.2", 5, "Choose the correct word: “The kitten hid beneath ____ favorite blanket.”",
   "its",
   [("it’s", "“It’s” means “it is,” which does not make sense here."),
    ("its’", "This spelling is never correct."),
    ("it's’", "This spelling mixes two errors and is never correct.")],
   "“Its” shows that the blanket belongs to the kitten, with no apostrophe needed.",
   "“Its” with no apostrophe always shows ownership.")

mc("apostrophes-contractions", "L.4.2", 5, "Which sentence uses an apostrophe correctly?",
   "We couldn’t find the children’s shoes.",
   [("We couldnt find the childrens shoes.", "Both missing apostrophes make the sentence incorrect."),
    ("We couldn’t find the childrens’ shoes.", "“Children” does not end in s, so its possessive is children’s, not childrens’."),
    ("We could’nt find the children’s shoes.", "The apostrophe in “couldn’t” is in the wrong spot.")],
   "“Couldn’t” needs its apostrophe before the t, and “children’s” adds ’s because “children” is already plural without an s.",
   "Irregular plurals like “children” and “men” still just add ’s for possession.")

dd("apostrophes-contractions", "L.4.2", 5, "Choose the correct word: “The children lost ____ library books.”",
   "their",
   [("there", "“There” points to a location, not ownership."),
    ("they’re", "“They’re” means “they are,” which does not fit here."),
    ("theirs", "“Theirs” stands alone and cannot be placed directly before a noun like “books.”")],
   "“Their” shows that the books belong to the children.",
   "“Their” shows ownership; “there” shows place; “they’re” means “they are.”")

mc("apostrophes-contractions", "L.4.2", 6, "Which sentence correctly fixes the error in: “The teams uniform's were in the van.”",
   "The team’s uniforms were in the van.",
   [("The teams’ uniform's were in the van.", "This still wrongly places an apostrophe in the plural word “uniforms.”"),
    ("The teams uniforms were in the van.", "This drops the needed apostrophe that shows the uniforms belong to the team."),
    ("The team’s uniform’s were in the van.", "“Uniforms” here is simply plural, so it should not have an apostrophe at all.")],
   "“Team’s” shows ownership, while “uniforms” is just a plain plural and needs no apostrophe.",
   "Only add an apostrophe when a word shows ownership, never just because a word is plural.")

mc("apostrophes-contractions", "L.4.2", 6, "Which sentence correctly fixes the error in: “Its a shame the puppy hurt it’s paw.”",
   "It’s a shame the puppy hurt its paw.",
   [("Its a shame the puppy hurt its paw.", "The first word means “it is” and needs an apostrophe."),
    ("It’s a shame the puppy hurt it’s paw.", "The second word shows ownership and should not have an apostrophe."),
    ("Its’ a shame the puppy hurt its’ paw.", "This spelling of “its” is never correct in either spot.")],
   "“It’s” (it is) starts the sentence, and “its” (ownership) describes the puppy's own paw.",
   "“It’s” = it is. “Its” = belonging to it. “Its’” is never correct.")

tf("apostrophes-contractions", "L.4.2", 6, "In the sentence “The girls’ bikes were parked outside,” more than one girl owns a bike.", True,
   "The apostrophe after the s in “girls’” shows that the bikes belong to several girls.",
   "Apostrophe after a plural s usually signals more than one owner.")

mc("apostrophes-contractions", "L.4.2", 7, "Which sentence uses contractions and possessives correctly?",
   "We’re sure the cat’s bowl is empty again.",
   [("Were sure the cats bowl is empty again.", "Both missing apostrophes change or confuse the meaning of the words."),
    ("We’re sure the cats’ bowl is empty again.", "This makes “cats” plural, suggesting more than one cat owns the bowl, which is not stated."),
    ("Were sure the cat’s bowl is empty again.", "“Were” without an apostrophe is a different word meaning the past tense of “are.”")],
   "“We’re” means “we are,” and “cat’s” correctly shows the bowl belongs to one cat.",
   "Read each short word aloud as its full form to check it fits the sentence.")

grade(5)

dd("apostrophes-contractions", "L.5.2", 1, "Choose the contraction for “should not”: “You ____ run near the pool.”",
   "shouldn’t",
   [("should’nt", "The apostrophe is in the wrong place; it belongs before the t."),
    ("shouldnt", "The apostrophe is missing."),
    ("should’n’t", "This has one apostrophe too many.")],
   "“Should not” contracts to “shouldn’t,” with the apostrophe replacing the o.",
   "The apostrophe in “not” contractions almost always sits right before the final t.")

mc("apostrophes-contractions", "L.5.2", 1, "Which sentence correctly shows that MORE THAN ONE sister shares a bedroom?",
   "My sisters’ bedroom is upstairs.",
   [("My sister’s bedroom is upstairs.", "This shows that only one sister owns the bedroom."),
    ("My sisters bedroom is upstairs.", "Without an apostrophe, this does not show ownership at all."),
    ("My sisters’s bedroom is upstairs.", "This incorrectly adds an extra s after the apostrophe.")],
   "Since “sisters” already ends in s, the possessive for the plural owners is formed by adding only an apostrophe: sisters’.",
   "Plural noun already ending in s: add just an apostrophe, no extra s.")

fill("apostrophes-contractions", "L.5.2", 2, "Write the contraction for “would have”: “If I had known, I ____ called sooner.”",
     ["would've", "would’ve"],
     "“Would have” contracts to “would’ve,” with the apostrophe replacing “ha.”",
     "Be careful not to write “would of,” which is an incorrect spelling of this contraction.")

dd("apostrophes-contractions", "L.5.2", 2, "Choose the correct word: “The museum changed ____ opening hours.”",
   "its",
   [("it’s", "“It’s” means “it is,” which does not make sense before “opening hours.”"),
    ("its’", "This spelling is never correct in English."),
    ("their", "“Their” needs a plural owner; “the museum” is a single institution here.")],
   "“Its” shows that the opening hours belong to the museum, with no apostrophe.",
   "If you can swap in “it is” and the sentence still makes sense, use “it’s”; otherwise use “its.”")

mc("apostrophes-contractions", "L.5.2", 2, "Which sentence correctly fixes the error in: “The childrens coats were soaked.”",
   "The children’s coats were soaked.",
   [("The childrens’ coats were soaked.", "“Children” does not end in s, so its possessive form is children’s, not childrens’."),
    ("The childrens's coats were soaked.", "This adds an incorrect extra s to an already irregular plural."),
    ("The childs coats were soaked.", "This changes “children” to the singular “child,” which is not what the sentence means.")],
   "“Children” is an irregular plural that does not end in s, so its possessive simply adds ’s: children’s.",
   "Irregular plurals (children, men, women, people) add ’s even though they are already plural.")

err("apostrophes-contractions", "L.5.2", 3, ["The jurys", " verdict", " shocked", " the courtroom."], 0, "jury’s",
    "Only one jury reached the verdict, so the singular possessive “jury’s” is needed.",
    "If there is a single owner, add ’s, even when the owner's name ends in a vowel sound.")

dd("apostrophes-contractions", "L.5.2", 3, "Choose the correct word: “The two scientists shared ____ research notes.”",
   "their",
   [("there", "“There” points to a location, not ownership."),
    ("they’re", "“They’re” means “they are,” which does not fit before “research notes.”"),
    ("theirs", "“Theirs” stands alone and cannot be placed directly before the noun “notes.”")],
   "“Their” shows that the research notes belong to the two scientists.",
   "“Their” shows ownership; “they’re” means “they are”; “there” points to a place.")

mc("apostrophes-contractions", "L.5.2", 3, "Which sentence correctly fixes the error in: “Its unclear whose going to lead the project.”",
   "It’s unclear who’s going to lead the project.",
   [("Its unclear whose going to lead the project.", "The first word means “it is” and needs an apostrophe."),
    ("It’s unclear whose going to lead the project.", "The second word here should mean “who is,” not show ownership, so it needs an apostrophe."),
    ("It's unclear who's going to lead the project.", "This uses straight apostrophes instead of the platform's standard curly apostrophe style.")],
   "“It’s” means “it is,” and “who’s” means “who is”; both fit the meaning of this sentence.",
   "Test each word by replacing it with its full two-word form.")

dd("apostrophes-contractions", "L.5.2", 4, "Choose the correct word: “Each team practiced ____ routine for weeks.”",
   "its",
   [("it’s", "“It’s” means “it is,” which does not make sense before “routine.”"),
    ("their", "“Their” is plural, but “each team” is treated as one single group here."),
    ("theirs", "“Theirs” stands alone and cannot be placed directly before the noun “routine.”")],
   "“Each team,” though made of many people, is treated as one unit, so the singular possessive “its” is correct.",
   "Words like “each” and “every” usually take a singular pronoun.")

mc("apostrophes-contractions", "L.5.2", 4, "Which sentence correctly shows a possessive for a plural noun that does NOT end in s?",
   "The geese’s nests were hidden in the reeds.",
   [("The gooses’ nests were hidden in the reeds.", "“Goose” is irregular; its plural is “geese,” not “gooses.”"),
    ("The geeses’ nests were hidden in the reeds.", "This adds an incorrect extra s to the already correct plural “geese.”"),
    ("The geese nests were hidden in the reeds.", "Without an apostrophe, this does not show that the nests belong to the geese.")],
   "“Geese” is already plural without an s, so its possessive adds ’s: geese’s.",
   "First find the correct plural form, then add ’s if it does not already end in s.")

err("apostrophes-contractions", "L.5.2", 4, ["The companys", " profits", " rose", " sharply this year."], 0, "company’s",
    "Only one company earned the profits, so the singular possessive “company’s” is needed.",
    "Check whether the apostrophe is missing entirely before deciding where it goes.")

dd("apostrophes-contractions", "L.5.2", 5, "Choose the contraction for “I would”: “____ rather walk than wait for the bus.”",
   "I’d",
   [("Id", "The apostrophe is missing, which changes the meaning of the word."),
    ("I’ld", "This is not a correct spelling of the contraction."),
    ("I’d’ve", "This is a different, longer contraction meaning “I would have.”")],
   "“I would” contracts to “I’d.”",
   "“I’d” can mean “I would” or “I had” — check the context to be sure which one fits.")

mc("apostrophes-contractions", "L.5.2", 5, "Which sentence correctly fixes the error in: “Theyre bringing there own lunch to the picnic.”",
   "They’re bringing their own lunch to the picnic.",
   [("There bringing there own lunch to the picnic.", "Neither word here fits; the sentence needs “they are” and “belonging to them.”"),
    ("They’re bringing they’re own lunch to the picnic.", "The second word should show ownership, not mean “they are.”"),
    ("Their bringing their own lunch to the picnic.", "The first word should mean “they are,” not show ownership.")],
   "“They’re” means “they are,” and “their” shows that the lunch belongs to them.",
   "They’re = they are. Their = belonging to them. There = a place.")

mc("apostrophes-contractions", "L.5.2", 6, "Which sentence correctly fixes the error in: “The witness’ story didnt match the officers’ report.”",
   "The witness’s story didn’t match the officer’s report.",
   [("The witnesses story didn’t match the officers report.", "This drops all three needed apostrophes."),
    ("The witness’s story didn’t match the officers’ report.", "This treats “officer” as plural owners, but only one officer wrote the report."),
    ("The witness’ story didnt match the officer’s report.", "This is missing the apostrophe in the contraction “didn’t,” and uses the less clear style for “witness.”")],
   "“Witness’s” and “officer’s” each show a single owner, and “didn’t” needs its apostrophe for the missing letter o.",
   "Check possessives and contractions separately; a sentence can have errors in both.")

tf("apostrophes-contractions", "L.5.2", 6, "In the sentence “The babies’ toys were scattered across the floor,” the apostrophe shows that more than one baby owns toys.", True,
   "“Baby” becomes “babies” in the plural, and adding an apostrophe after the s shows plural possession: babies’.",
   "Form the plural first, then add the apostrophe based on whether it already ends in s.")

fill("apostrophes-contractions", "L.5.2", 6, "Write the contraction for “you are not”: “____ allowed to park here after six.”",
     ["You're not", "You’re not", "you're not", "you’re not"],
     "“You are” contracts to “you’re,” and the word “not” stays separate to make “you’re not.”",
     "Only the “you are” part contracts; “not” is not shortened in this phrase.")

mc("apostrophes-contractions", "L.5.2", 7, "Which sentence demonstrates correct use of BOTH a contraction and a possessive?",
   "She hasn’t finished reading her brother’s favorite book yet.",
   [("She hasnt finished reading her brothers favorite book yet.", "Both apostrophes are missing from the contraction and the possessive."),
    ("She has’nt finished reading her brother’s favorite book yet.", "The apostrophe in the contraction is placed before the wrong letter."),
    ("She hasn’t finished reading her brothers’ favorite book yet.", "This wrongly treats “brothers” as more than one owner, but only one brother is mentioned.")],
   "“Hasn’t” correctly contracts “has not,” and “brother’s” correctly shows a single owner.",
   "Check each apostrophe separately: is it forming a contraction or showing ownership?")

dd("apostrophes-contractions", "L.5.2", 2, "Choose the correct word: “____ sure the printer is broken again.”",
   "We’re",
   [("Were", "Without the apostrophe, this spells the past-tense word “were,” not “we are.”"),
    ("Wer’e", "This apostrophe placement is not correct."),
    ("We’er", "This spelling is not a real contraction.")],
   "“We’re” is the contraction for “we are,” which fits at the start of this sentence.",
   "Replace the short word with “we are” to check whether the sentence still makes sense.")

mc("apostrophes-contractions", "L.5.2", 7, "Which sentence correctly shows the possessive form of a hyphenated family term?",
   "My brother-in-law’s new truck is parked outside.",
   [("My brother’s-in-law new truck is parked outside.", "The apostrophe should attach to the very last part of the hyphenated term, not the first."),
    ("My brother-in-laws new truck is parked outside.", "Without an apostrophe, this looks like a plural rather than a possessive."),
    ("My brothers-in-law’s new truck is parked outside.", "This wrongly makes “brother” plural first, which is not what the sentence describes.")],
   "For a hyphenated compound noun, the possessive ’s attaches to the final word in the term.",
   "Treat the whole hyphenated phrase as one word and add ’s only at its very end.")

# ================================================================== imagery
grade(4)

mc("imagery", "RL.4.4", 1, "Read the sentence: “The campfire crackled and popped as orange sparks jumped into the dark sky.” Which sense does this sentence appeal to MOST?",
   "hearing",
   [("taste", "Nothing in the sentence describes a flavor."),
    ("smell", "The sentence focuses on sound, not scent."),
    ("touch", "No one is described touching anything in this sentence.")],
   "“Crackled and popped” are sound words that let you hear the fire.",
   "Look for words that describe a sound to find hearing imagery.")

mc("imagery", "RL.4.4", 2, "Which phrase uses imagery that helps you SMELL what is happening? “The kitchen filled with the sharp smell of fresh mint tea.”",
   "“the sharp smell of fresh mint tea”",
   [("“the kitchen filled”", "This describes space filling up, not a smell by itself."),
    ("“fresh mint tea”", "On its own this names the drink, but it is the word “smell” that creates the scent image."),
    ("“in the kitchen”", "This only tells you the location, not a sensory detail.")],
   "The phrase names a smell directly, letting you imagine the scent of mint.",
   "Smell imagery often uses the word “smell” or “scent” along with a description.")

dd("imagery", "RL.4.4", 2, "Choose the word that best completes this imagery about touch: The wool blanket felt ____ against my cold hands.",
   "scratchy",
   [("quiet", "This describes sound, not a feeling of touch."),
    ("colorful", "This describes sight, not a feeling of touch."),
    ("sweet", "This describes taste, not a feeling of touch.")],
   "“Scratchy” describes a rough texture you feel with your hands.",
   "Touch words describe how something feels, such as its texture or temperature.")

mc("imagery", "RL.4.4", 3, "Read the sentence: “Layla bit into the lemon and her whole face puckered at the sour taste.” Which sense is this sentence mainly about?",
   "taste",
   [("sight", "While “puckered” can be seen, the sentence is really about the sour flavor she tasted."),
    ("hearing", "No sound is described in this sentence."),
    ("smell", "The sentence focuses on flavor, not scent.")],
   "The sour taste of the lemon is the main sensory detail described.",
   "Taste words often describe flavors like sour, sweet, salty, or bitter.")

tf("imagery", "RL.4.4", 3, "The sentence “The puppy's fur was soft and warm against my cheek” appeals mostly to the sense of touch.", True,
   "Soft and warm describe how the fur feels, which is a touch detail.",
   "Touch imagery describes texture, temperature, or pressure.")

mc("imagery", "RL.4.4", 4, "Which sentence uses imagery that helps the reader SEE a clear picture?",
   "The sky turned a deep purple as the first stars began to glitter.",
   [("The weather changed later that evening.", "This states a fact with no descriptive picture."),
    ("It got dark outside after a while.", "This is a plain statement, with no vivid detail to picture."),
    ("The evening was nice and calm.", "“Nice” and “calm” are vague and do not create a clear picture.")],
   "The specific colors and the image of glittering stars let the reader clearly picture the sky.",
   "Strong imagery uses specific, colorful details instead of vague words.")

mc("imagery", "RL.4.4", 4, "Read the sentence: “The thunder rumbled low, then cracked so loudly that the windows rattled.” Which sense does this appeal to?",
   "hearing",
   [("taste", "No flavor is mentioned in this sentence."),
    ("smell", "No scent is described in this sentence."),
    ("touch", "The windows rattling is a result of sound, but the sentence focuses on what is heard.")],
   "Rumbling, cracking, and rattling are all sound details.",
   "Sound words such as rumble, crack, and rattle signal hearing imagery.")

dd("imagery", "RL.4.4", 5, "Choose the word that creates smell imagery: The bakery air was thick with the ____ of cinnamon rolls.",
   "aroma",
   [("sound", "This word relates to hearing, not smell."),
    ("shape", "This word relates to sight, not smell."),
    ("weight", "This word relates to touch or measurement, not smell.")],
   "“Aroma” describes a smell, letting you imagine the scent of cinnamon rolls.",
   "“Aroma” and “scent” are common words used to create smell imagery.")

mc("imagery", "RL.4.4", 5, "Which sentence combines TWO different senses in its imagery?",
   "The icy lemonade was so cold it made her teeth ache, and its sourness made her eyes water.",
   [("The lemonade was in a tall glass on the table.", "This only describes the setting, with no sensory detail."),
    ("She poured the lemonade carefully into the glass.", "This describes an action, not a sensory experience."),
    ("The glass of lemonade sat near the window.", "This only tells the location, with no sensory detail.")],
   "The sentence describes both the cold feeling (touch) and the sour taste.",
   "Look for more than one sensory detail packed into a single sentence.")

mc("imagery", "RL.4.4", 6, "Why might an author choose to describe “the metallic taste of blood after biting her lip” instead of simply writing “she hurt her lip”?",
   "To let the reader feel exactly what the character experienced, not just know that it happened.",
   [("To make the sentence shorter and easier to read.", "The descriptive version is actually longer, not shorter."),
    ("To avoid describing any feelings at all.", "The sentence directly describes a physical feeling."),
    ("To change what actually happened in the story.", "The event itself, biting her lip, stays the same either way.")],
   "Vivid sensory imagery helps readers experience events through the character's senses rather than just being told facts.",
   "Ask: does this detail let me imagine the moment, or just report a fact?")

mc("imagery", "RL.4.4", 7, "Read the paragraph: “Sand scorched the soles of Mariam's bare feet as the salty ocean breeze tangled her hair. Somewhere nearby, a gull shrieked.” Which senses are used?",
   "touch (hot sand), smell (salty breeze), and hearing (the gull's shriek)",
   [("sight only", "The paragraph contains far more than just visual details."),
    ("taste and sight only", "No flavor is described anywhere in the paragraph."),
    ("touch only", "Smell and hearing details are present as well as touch.")],
   "The paragraph layers hot sand (touch), the salty breeze (smell), and the gull's shriek (hearing) together.",
   "In longer passages, imagery often combines several senses to build one full scene.")

grade(5)

mc("imagery", "RL.5.4", 2, "Read the line: “The old violin's strings hummed a low, trembling note that seemed to shiver through the empty hall.” Which sense does the imagery mainly appeal to?",
   "hearing",
   [("sight", "While the hall is mentioned, the focus is on the sound of the note, not how anything looks."),
    ("smell", "No scent is described in this line."),
    ("taste", "No flavor is described in this line.")],
   "“Hummed” and “trembling note” describe sound, letting the reader hear the violin.",
   "Look past the setting word to find the sensory detail doing the describing.")

mc("imagery", "RL.5.4", 3, "Which phrase from “The frost had etched silver ferns across the window, and the air smelled faintly of wood smoke” appeals to the sense of smell?",
   "“smelled faintly of wood smoke”",
   [("“frost had etched silver ferns”", "This describes a visual pattern, appealing to sight."),
    ("“across the window”", "This only gives a location, with no sensory quality."),
    ("“the air”", "On its own this simply names a thing, not a scent.")],
   "The phrase directly names a smell, letting the reader imagine the scent of smoke.",
   "Smell imagery usually names the scent itself, not just the object producing it.")

dd("imagery", "RL.5.4", 3, "Choose the word that best completes this sight imagery: The lighthouse beam swept a ____ arc of gold across the black water.",
   "glowing",
   [("silent", "This word relates to hearing, not sight."),
    ("bitter", "This word relates to taste, not sight."),
    ("rough", "This word relates to touch, not sight.")],
   "“Glowing” describes how the light appears, creating a visual image.",
   "Sight imagery describes color, brightness, shape, or movement that can be seen.")

mc("imagery", "RL.5.4", 4, "Read the sentence: “Her palms stung from the rope's rough fibers as she pulled herself up, inch by burning inch.” Which TWO senses does this imagery appeal to?",
   "touch and a feeling of pain or burning",
   [("sight and hearing", "No visual or sound detail is described in this sentence."),
    ("taste and smell", "No flavor or scent is described in this sentence."),
    ("hearing only", "The sentence focuses entirely on physical feeling, with no sound mentioned.")],
   "“Stung,” “rough fibers,” and “burning” all describe physical sensations felt through touch.",
   "Physical sensations like burning, stinging, or aching usually signal touch imagery.")

tf("imagery", "RL.5.4", 4, "In the sentence “Steam curled off the noodles, carrying the sharp bite of ginger and garlic across the room,” the imagery appeals mainly to smell.", True,
   "The phrase “sharp bite of ginger and garlic” describes a strong smell carried through the air.",
   "Words like “carrying” an odor across a space often signal smell imagery.")

mc("imagery", "RL.5.4", 5, "Which revision adds vivid SIGHT imagery to the plain sentence “The garden had flowers in it”?",
   "Crimson tulips and golden daffodils lined the winding garden path.",
   [("The garden was nice and had some plants.", "This stays vague, without any specific visual detail."),
    ("There were flowers growing in the garden.", "This barely changes the original sentence and adds no vivid detail."),
    ("The garden smelled wonderful in spring.", "This adds a smell detail, not a sight detail.")],
   "Specific colors and flower names let the reader clearly picture the garden.",
   "Replace vague words like “nice” with exact colors, shapes, or names.")

match("imagery", "RL.5.4", 5, "Match each descriptive phrase with the sense it appeals to most.",
      [("the engine's steady growl", "Hearing"), ("the rusty gate's jagged edge", "Touch"),
       ("the tang of unripe mangoes", "Taste"), ("smoke drifting over the valley", "Sight")],
      "Each phrase focuses on one dominant sensory detail.",
      "Ask which sense would notice this detail first in real life.")

mc("imagery", "RL.5.4", 6, "Read the passage: “The diesel fumes stung Fatima's throat as the ferry's horn blasted twice, and spray from the waves soaked her shoes.” Which THREE senses are used?",
   "smell, hearing, and touch",
   [("sight, taste, and smell", "No visual detail or flavor is described in this passage."),
    ("taste, touch, and hearing", "No flavor is described in this passage."),
    ("sight only", "Smell, hearing, and touch are all present, but no visual detail is described.")],
   "“Stung” (smell), the horn's “blasted” (hearing), and the soaking spray (touch) each appeal to a different sense.",
   "In longer passages, list each sensory clue separately before deciding which senses are used.")

mc("imagery", "RL.5.4", 6, "Why might an author choose the phrase “the chalky, bitter taste of the medicine” instead of simply writing “the medicine tasted bad”?",
   "To let the reader imagine the exact unpleasant flavor rather than just knowing it was unpleasant.",
   [("To make the sentence more confusing for the reader.", "Specific sensory detail generally makes writing clearer, not more confusing."),
    ("To avoid describing the medicine at all.", "The phrase actually gives more description, not less."),
    ("To change the reader's opinion about the character.", "This detail describes a taste, not the character's personality.")],
   "Specific sensory words like “chalky” and “bitter” create a sharper, more precise image than a general word like “bad.”",
   "Precise sensory words almost always create a stronger image than vague ones.")

mc("imagery", "RL.5.4", 7, "How does the imagery in “The rain hissed against the tin roof while mud squelched under every step” shape the mood of the scene?",
   "It creates an uncomfortable, messy mood through unpleasant sounds and textures.",
   [("It creates a peaceful, sunny mood.", "Hissing rain and squelching mud do not suggest sunshine or peace."),
    ("It creates an exciting, celebratory mood.", "Nothing in the imagery suggests celebration."),
    ("It creates a silent, empty mood.", "The imagery describes active sounds and textures, not silence.")],
   "The harsh sound of hissing rain and the unpleasant feel of squelching mud together build a gloomy, uncomfortable mood.",
   "Ask what feeling the specific sounds and textures would give you if you experienced them yourself.")

grade(6)

mc("imagery", "RL.6.4", 2, "Read the line: “The engine's exhaust left a bitter, oily taste at the back of his throat as the truck rattled over the gravel.” Which TWO senses dominate this imagery?",
   "taste and hearing",
   [("sight and smell", "No visual detail or scent is directly described in this line."),
    ("touch only", "While the rattling could be felt, the sentence focuses on taste and the sound of rattling."),
    ("smell and sight", "No scent or visual detail is directly described in this line.")],
   "“Bitter, oily taste” appeals to taste, and “rattled” is a sound detail appealing to hearing.",
   "Separate each descriptive phrase and match it to exactly one or two senses.")

mc("imagery", "RL.6.4", 3, "Which phrase from “Frost silvered the fence, and the air bit sharply at any exposed skin” creates touch imagery?",
   "“bit sharply at any exposed skin”",
   [("“Frost silvered the fence”", "This describes a visual effect, appealing to sight."),
    ("“the air”", "On its own this names a thing, not a sensory quality."),
    ("“any exposed skin”", "This only names a body part, not a sensation.")],
   "“Bit sharply” describes a painful, stinging feeling on the skin, which is a touch sensation.",
   "Touch imagery often uses words for pain, pressure, temperature, or texture.")

dd("imagery", "RL.6.4", 3, "Choose the word that best completes this imagery about hearing: The old floorboards ____ under every careful step.",
   "groaned",
   [("sparkled", "This word relates to sight, not hearing."),
    ("tasted", "This word relates to taste, not hearing."),
    ("smelled", "This word relates to smell, not hearing.")],
   "“Groaned” describes a sound the floorboards make, creating an auditory image.",
   "Sound verbs like groan, creak, and rattle usually signal hearing imagery.")

mc("imagery", "RL.6.4", 4, "Read the sentence: “The alley reeked of rotting fruit, and flies droned lazily over the overflowing bins.” Which TWO senses does this sentence appeal to?",
   "smell and hearing",
   [("taste and touch", "No flavor or physical sensation of touch is described."),
    ("sight only", "The sentence focuses on an odor and a sound, not on visual description."),
    ("touch and taste", "No flavor or physical sensation of touch is described.")],
   "“Reeked” describes a smell, and “droned” describes the sound the flies make.",
   "Look for one verb or adjective tied to each specific sense.")

tf("imagery", "RL.6.4", 4, "In the sentence “The marble floor radiated a biting cold that crept through her thin socks,” the imagery appeals mainly to touch.", True,
   "“Biting cold” and “crept through her thin socks” describe a physical sensation felt through the skin.",
   "Temperature and physical pressure described against the body usually signal touch imagery.")

mc("imagery", "RL.6.4", 5, "Which revision strengthens the plain sentence “The street market was busy and loud” with more vivid SENSORY imagery?",
   "Vendors shouted over clattering carts, and the smoky scent of grilled corn drifted between the stalls.",
   [("The street market had many people and sounds.", "This barely changes the vague original with no specific sensory detail."),
    ("The market was crowded with shoppers that day.", "This adds no new sensory detail beyond the general idea of crowding."),
    ("People walked around the busy market quickly.", "This describes movement generally, without any specific sensory image.")],
   "Specific sound details (shouting, clattering) and smell details (smoky scent of corn) replace the vague words “busy and loud.”",
   "Trade vague words like “busy” for precise sounds, smells, or sights.")

match("imagery", "RL.6.4", 5, "Match each descriptive phrase with the sense it appeals to most.",
      [("the diesel's acrid sting in the nose", "Smell"), ("gears grinding somewhere below deck", "Hearing"),
       ("the raw sting of a rope burn", "Touch"), ("neon signs smeared across the wet pavement", "Sight")],
      "Each phrase centers on one specific sensory impression.",
      "Identify the exact body part or sense organ each detail would affect.")

mc("imagery", "RL.6.4", 6, "Read the passage: “Diesel fumes stung his eyes as gulls screeched overhead, and the dock planks, slick with spray, threatened to send him sliding.” Which combination of senses is at work?",
   "smell (diesel fumes), hearing (screeching gulls), and touch (slick, sliding planks)",
   [("sight, taste, and smell", "No flavor is described in this passage, and no visual color or shape detail is given."),
    ("touch only", "Smell and hearing are also clearly present alongside touch."),
    ("taste and sight", "Neither flavor nor a visual detail is described in this passage.")],
   "Each clause in the sentence targets a different sense: fumes for smell, screeching for hearing, and slick planks for touch.",
   "Break a long, layered sentence into clauses and assign each one its own sense.")

mc("imagery", "RL.6.4", 6, "How does the imagery in “The silence pressed against his ears like a physical weight, broken only by his own ragged breathing” affect the mood of the scene?",
   "It builds a tense, unsettling mood by making even the absence of sound feel heavy and oppressive.",
   [("It creates a cheerful, relaxed mood.", "Pressing silence and ragged breathing do not suggest cheerfulness."),
    ("It creates a busy, chaotic mood.", "The scene is described as silent, not chaotic."),
    ("It creates a mood of celebration.", "Nothing in the imagery suggests celebration.")],
   "Describing silence itself as a “weight” and breathing as “ragged” builds tension and discomfort rather than calm.",
   "Even the absence of sound can be turned into imagery that shapes mood.")

mc("imagery", "RL.6.4", 7, "Why might an author describe a character's fear as “a cold hand closing slowly around her ribs” instead of writing “she felt afraid”?",
   "To use a physical, sensory comparison that lets readers feel the fear in their own bodies rather than just being told about it.",
   [("To make the sentence easier to understand at a glance.", "The figurative image is actually more complex than the plain statement, not simpler."),
    ("To avoid naming the emotion at all.", "The image is built specifically to convey fear, even without the word “afraid.”"),
    ("To shorten the description as much as possible.", "The imagery adds length and detail rather than shortening the sentence.")],
   "Comparing fear to a physical sensation, a cold hand tightening, makes the abstract feeling vivid and felt rather than simply stated.",
   "Writers often turn feelings into physical sensations to make emotions more vivid.")

# ================================================================== compare-contrast
grade(4)

mc("compare-contrast", "RI.4.5", 1, "An author is writing about how a frog and a toad look alike and different. Which structure best fits this topic?",
   "Compare and contrast",
   [("Sequence", "Sequence organizes steps or events in time order, not similarities and differences."),
    ("Cause and effect", "Cause and effect shows why something happened, not how two things are alike and different."),
    ("Description", "Description gives details about one single thing, not a comparison of two things.")],
   "Comparing how a frog and toad are alike and different is exactly what compare-and-contrast structure does.",
   "If a text is about two or more things side by side, think compare-and-contrast.")

mc("compare-contrast", "RI.4.5", 2, "Which signal words most likely show a COMPARISON (a similarity)?",
   "both, similarly, also",
   [("first, next, finally", "These words show the order of steps, which signals sequence."),
    ("because, so, as a result", "These words show cause and effect, not similarity."),
    ("unlike, in contrast, however", "These words signal a difference, not a similarity.")],
   "Words like “both,” “similarly,” and “also” point out that two things share something in common.",
   "Learn one short list of comparison words and one short list of contrast words.")

dd("compare-contrast", "RI.4.5", 2, "Choose the word that signals a CONTRAST: Bicycles need pedaling to move, ____ scooters can be pushed with one foot.",
   "whereas",
   [("and", "“And” joins two ideas but does not highlight a difference between them."),
    ("also", "“Also” signals a similarity, not a difference."),
    ("similarly", "“Similarly” signals that two things are alike, not different.")],
   "“Whereas” introduces a difference between how bicycles and scooters are moved.",
   "Contrast words include but, however, unlike, and whereas.")

mc("compare-contrast", "RI.4.5", 3, "A paragraph explains how camels and horses both have four legs, but only camels have humps that store fat. What is this paragraph mainly doing?",
   "Comparing and contrasting camels and horses",
   [("Describing only camels", "The paragraph also discusses horses, not just camels."),
    ("Explaining the steps to care for a camel", "No steps or order of actions are given."),
    ("Explaining why camels have humps", "The paragraph states a fact about humps, but does not explain the cause of the hump.")],
   "The paragraph shows one similarity (four legs) and one difference (humps) between camels and horses.",
   "Look for both a similarity and a difference in the same paragraph.")

tf("compare-contrast", "RI.4.5", 3, "An article that explains how solar panels and wind turbines both produce electricity, but work in very different ways, uses a compare-and-contrast structure.", True,
   "The article discusses a similarity (both produce electricity) and a difference (how they work), which is compare-and-contrast.",
   "Check for at least one similarity and one difference between the two subjects.")

mc("compare-contrast", "RI.4.5", 4, "Which sentence uses a compare-and-contrast structure?",
   "Owls hunt mainly at night, while hawks hunt mainly during the day.",
   [("Owls build nests high in tree branches.", "This only describes one animal, with no comparison."),
    ("First, the owl spots its prey from a branch.", "This describes a step in a process, not a comparison."),
    ("Because owls have excellent night vision, they can hunt in darkness.", "This explains a cause and its effect, not a comparison between two animals.")],
   "The sentence shows a clear difference between when owls and hawks hunt.",
   "Look for two subjects being discussed side by side in the same sentence.")

match("compare-contrast", "RI.4.5", 4, "Match each short description with the text structure it mostly matches.",
      [("How ants and bees are alike and different", "Compare and contrast"), ("The steps to plant a seed, in order", "Sequence"),
       ("Why the ice melted in the sun", "Cause and effect"), ("Facts about one kind of shark", "Description")],
      "Each description matches the text structure that fits its purpose.",
      "Ask what the paragraph is mainly trying to do: compare, order, explain why, or describe.")

mc("compare-contrast", "RI.4.5", 5, "An author writes an article comparing city life and country life. Why might the author choose a compare-and-contrast structure instead of a simple description?",
   "To help readers clearly see how the two kinds of life are alike and different.",
   [("To explain the order that cities were built in history.", "That would require a sequence structure, not a comparison."),
    ("To explain why cities became crowded over time.", "That would require a cause-and-effect structure, not a comparison."),
    ("To describe only city life in great detail.", "The structure requires discussing both subjects, not just one.")],
   "Comparing two subjects side by side helps readers notice similarities and differences they might otherwise miss.",
   "Authors choose compare-and-contrast when their main goal is to show how two things relate.")

mc("compare-contrast", "RI.4.5", 6, "Which pair of sentences uses signal words to show both a similarity AND a difference?",
   "Both sharks and dolphins live in the ocean. However, sharks are fish while dolphins are mammals.",
   [("Sharks and dolphins both live in the ocean.", "This sentence only shows a similarity, with no contrast given."),
    ("Dolphins are mammals, and sharks are fish.", "This states a fact about each animal but uses no clear signal words for comparison or contrast."),
    ("Sharks have been on Earth for millions of years.", "This gives one fact about sharks only, with no comparison at all.")],
   "“Both” signals the similarity, and “however” signals the difference, in the very same pair of sentences.",
   "Strong compare-and-contrast writing often pairs a similarity signal with a contrast signal.")

mc("compare-contrast", "RI.4.5", 7, "Which topic would be BEST suited to a compare-and-contrast structure?",
   "How a public library and a bookstore are similar and different",
   [("The steps for checking out a library book", "This is a process best organized by sequence, not comparison."),
    ("Why a library might run out of copies of a popular book", "This is best explained with cause and effect, not comparison."),
    ("A description of what one library's reading room looks like", "This focuses on only one place, with nothing to compare it to.")],
   "This topic names two subjects, a library and a bookstore, and asks how they are alike and different.",
   "A compare-and-contrast topic always needs at least two subjects to put side by side.")

grade(5)

mc("compare-contrast", "RI.5.5", 2, "An author organizes an article by first describing how volcanoes and earthquakes are both caused by shifting tectonic plates, then explaining how their effects differ. What is the overall structure of this article?",
   "Compare and contrast",
   [("Problem and solution", "The article explains similarities and differences, not a problem followed by its fix."),
    ("Sequence", "The article is not organized by a series of steps or events in time order."),
    ("Description", "The article discusses two phenomena together, not just details about one.")],
   "The article explicitly discusses a shared cause and then contrasting effects, which is a compare-and-contrast structure.",
   "An article can use compare-and-contrast for part of itself even if it mixes in other details.")

mc("compare-contrast", "RI.5.5", 3, "Which sentence signals a comparison used to make an unfamiliar idea easier to understand?",
   "A cell's nucleus works much like a city's control center, directing most of the city's major decisions.",
   [("A cell's nucleus contains the cell's genetic material.", "This states a fact about the nucleus alone, without comparing it to anything else."),
    ("First, the nucleus sends out instructions to the rest of the cell.", "This describes a step in a process, not a comparison."),
    ("Because the nucleus is damaged, the cell cannot function properly.", "This explains a cause and effect, not a comparison to something familiar.")],
   "Comparing the nucleus to a city's control center helps readers understand an unfamiliar idea using something familiar.",
   "Authors often compare a hard science idea to something everyday to make it clearer.")

dd("compare-contrast", "RI.5.5", 3, "Choose the signal word that best shows a DIFFERENCE: Renewable energy sources can be replenished naturally, ____ fossil fuels take millions of years to form and cannot be quickly replaced.",
   "whereas",
   [("additionally", "“Additionally” adds information but does not highlight a difference."),
    ("likewise", "“Likewise” signals a similarity, not a difference."),
    ("furthermore", "“Furthermore” adds a point but does not itself show a contrast.")],
   "“Whereas” introduces the contrast between how quickly each type of energy source can be replaced.",
   "Build a list of contrast signal words: whereas, unlike, on the other hand, in contrast.")

mc("compare-contrast", "RI.5.5", 4, "A paragraph explains that both bats and dolphins use echolocation to find prey, but bats use it in the air while dolphins use it underwater. What is the paragraph's purpose?",
   "To compare the shared ability of echolocation and contrast where each animal uses it",
   [("To explain how bats first learn to use echolocation", "No developmental process or sequence of learning is described."),
    ("To argue that dolphins are better hunters than bats", "The paragraph does not make an argument about which animal is better."),
    ("To describe only how dolphins swim underwater", "The paragraph discusses both animals, not dolphins alone.")],
   "The paragraph shows a similarity (both use echolocation) and a difference (air versus water).",
   "Look for one shared trait and one differing detail within the same paragraph.")

tf("compare-contrast", "RI.5.5", 4, "An article that explains that both tornadoes and hurricanes involve strong rotating winds, yet form under very different weather conditions, uses a compare-and-contrast structure.", True,
   "The article pairs a similarity (rotating winds) with a difference (how they form), which is compare-and-contrast.",
   "Check whether the text names at least one similarity and one difference between its two subjects.")

mc("compare-contrast", "RI.5.5", 5, "Why might an author choose a compare-and-contrast structure to explain the difference between a democracy and a monarchy?",
   "To help readers clearly understand how political power is shared or held differently in each system",
   [("To describe only the history of one monarchy in detail", "That purpose would call for a simple description of a single topic, not two."),
    ("To explain the order of events that led to a specific revolution", "That purpose would call for a sequence structure, not a comparison."),
    ("To explain the cause of a single political event", "That purpose would call for a cause-and-effect structure, not a comparison.")],
   "Comparing two systems of government side by side makes their differences in power easier to see and understand.",
   "Compare-and-contrast is especially useful for explaining ideas that only make sense next to each other.")

match("compare-contrast", "RI.5.5", 5, "Match each description with the text structure it mostly matches.",
      [("How plant cells and animal cells are alike and different", "Compare and contrast"),
       ("The order of steps in cell division", "Sequence"),
       ("Why a cell might stop dividing", "Cause and effect"),
       ("A detailed description of one type of cell", "Description")],
      "Each description's main purpose points to a different text structure.",
      "Decide whether the text's main goal is to compare, order events, explain a cause, or describe one thing.")

mc("compare-contrast", "RI.5.5", 6, "Which revision best uses a compare-and-contrast structure to improve this plain sentence: “Lions and wolves are both predators.”",
   "Like wolves, lions hunt in groups, but while wolves rely on long chases, lions depend on short, powerful bursts of speed.",
   [("Lions and wolves are both predators that hunt animals.", "This barely changes the original sentence and adds no clear contrast."),
    ("Lions live in prides, and wolves live in packs.", "This only states a fact about each animal's group, without a signal word connecting a similarity and a difference."),
    ("Wolves are more dangerous than lions in the wild.", "This states an opinion rather than comparing and contrasting specific traits.")],
   "The revision names a shared trait (hunting in groups) and a specific contrast (chase versus burst of speed), connected by signal words.",
   "A strong compare-and-contrast sentence usually names one similarity and one clear, specific difference.")

mc("compare-contrast", "RI.5.5", 7, "A science article states, “Unlike mammals, reptiles cannot regulate their own body temperature internally; however, both groups rely on their environment in different ways to stay active.” What is the sentence doing?",
   "Contrasting how body temperature is regulated while also noting a shared dependence on the environment",
   [("Listing the steps reptiles take to find food", "No sequence of actions or steps is described in the sentence."),
    ("Explaining why mammals evolved fur", "The sentence does not discuss the cause of fur or any evolutionary trait."),
    ("Describing only the habitats where reptiles live", "The sentence focuses on temperature regulation, not habitat description alone.")],
   "“Unlike” signals the contrast in regulation, and “however, both” signals a related similarity in environmental dependence.",
   "Watch for sentences that use both a contrast word and a comparison word together.")

mc("compare-contrast", "RI.5.5", 7, "Which topic would be BEST suited to a compare-and-contrast structure?",
   "How wind energy and solar energy each generate electricity, and how they differ in cost and reliability",
   [("The order of steps to install a single solar panel", "This is a process best organized by sequence, not comparison."),
    ("Why solar panels become less efficient over time", "This is best explained with cause and effect, not comparison."),
    ("A detailed description of one wind turbine's parts", "This focuses on only one object, with nothing to compare it to.")],
   "This topic names two energy sources and asks how they are alike and different in several specific ways.",
   "Look for a topic phrased around two or more subjects and the word “differ” or “alike.”")

grade(6)

mc("compare-contrast", "RI.6.5", 2, "An author organizes an essay by first explaining how print newspapers and online news sites both aim to inform readers, then detailing how their speed and depth of coverage differ. What is the primary role of this structural choice?",
   "It lets the author highlight a shared purpose before analyzing specific differences between the two formats.",
   [("It lists the historical order in which each format was invented.", "The essay is not organized as a timeline of invention."),
    ("It explains the cause of declining newspaper sales.", "The essay compares the two formats rather than explaining why sales changed."),
    ("It gives only a detailed description of one news format.", "The essay discusses both formats together, not just one.")],
   "Starting with a similarity before moving into differences helps readers see both the shared goal and the distinct methods of each format.",
   "Notice the order an author uses: similarities first can set up contrasts that follow.")

mc("compare-contrast", "RI.6.5", 3, "Which sentence from an essay about two authors' writing styles signals a CONTRAST?",
   "While Author A relies on short, clipped sentences to build tension, Author B favors long, flowing sentences to create a calm mood.",
   [("Both authors often write about ordinary family life.", "This sentence signals a similarity, not a contrast."),
    ("Author A published her first novel in her twenties.", "This states a single fact about one author, with no comparison at all."),
    ("Readers often recommend both authors to fans of realistic fiction.", "This sentence signals a similarity, not a contrast.")],
   "“While” introduces a direct contrast between the two authors' sentence structures and the moods they create.",
   "Look for a signal word connecting two specific, opposite techniques or traits.")

dd("compare-contrast", "RI.6.5", 3, "Choose the signal word that best shows a DIFFERENCE: Classical architecture emphasizes symmetry and columns, ____ modern architecture often favors irregular shapes and open space.",
   "whereas",
   [("moreover", "“Moreover” adds a point but does not itself highlight a contrast."),
    ("similarly", "“Similarly” signals a likeness, not a difference."),
    ("consequently", "“Consequently” signals a result, not a contrast between two styles.")],
   "“Whereas” introduces the contrast between the two architectural styles described.",
   "Contrast words link two specific, opposing details within one sentence.")

mc("compare-contrast", "RI.6.5", 4, "A passage explains that both a monologue and a soliloquy involve a single character speaking at length, but a soliloquy is typically delivered when the character believes no one else is listening. What is the passage's main purpose?",
   "To compare the shared format of both devices while contrasting the specific condition under which each is used",
   [("To explain the history of when monologues were first used on stage", "No historical timeline or sequence of events is described."),
    ("To argue that soliloquies are more effective than monologues", "The passage explains a distinction, but it does not argue that one device is better."),
    ("To describe only the structure of a monologue", "The passage discusses both devices, not a monologue alone.")],
   "The passage identifies a shared trait (a single speaker) and a key difference (whether others are presumed to be listening).",
   "In literary analysis, compare-and-contrast often clarifies two related but distinct terms.")

tf("compare-contrast", "RI.6.5", 4, "An essay explaining that both impressionist and realist painters sought to capture everyday life, yet used dramatically different techniques to do so, uses a compare-and-contrast structure.", True,
   "The essay pairs a shared goal (everyday life as subject matter) with a difference (technique), which is a compare-and-contrast structure.",
   "Check for a shared purpose or trait paired with at least one specific difference.")

mc("compare-contrast", "RI.6.5", 5, "Why might an author choose a compare-and-contrast structure to analyze two competing scientific theories about an extinction event?",
   "To let readers weigh the strengths and weaknesses of each theory by examining them side by side",
   [("To describe only the fossil evidence for a single theory", "That purpose calls for a straightforward description of one theory, not two."),
    ("To explain the sequence of events during the extinction itself", "That purpose calls for a sequence structure, not a comparison of theories."),
    ("To explain the single most likely cause of the extinction without comparing views", "That purpose would avoid comparison entirely, which contradicts the structure described.")],
   "Placing two theories side by side allows readers to evaluate the specific evidence and reasoning behind each one.",
   "Compare-and-contrast is a common structure in texts that weigh competing explanations or arguments.")

match("compare-contrast", "RI.6.5", 5, "Match each description of a text's purpose with the structure it most closely matches.",
      [("Examining how two economic policies produce different outcomes", "Compare and contrast"),
       ("Explaining the order of events leading to a stock market crash", "Sequence"),
       ("Explaining why unemployment rose after a policy change", "Cause and effect"),
       ("Giving detailed facts about a single company's history", "Description")],
      "Each purpose points to the text structure best suited to accomplish it.",
      "Identify the author's main goal: comparing, ordering events, explaining a cause, or describing one subject.")

mc("compare-contrast", "RI.6.5", 6, "Which revision best uses a compare-and-contrast structure to strengthen the vague sentence: “Renewable and nonrenewable energy sources are different.”",
   "Although both renewable and nonrenewable sources can generate electricity, renewable sources replenish naturally while nonrenewable sources take millions of years to form.",
   [("Renewable and nonrenewable energy sources are used around the world.", "This states a fact about use but names no specific similarity or difference."),
    ("Solar panels and wind turbines are both renewable.", "This only compares two renewable sources to each other, not renewable to nonrenewable sources."),
    ("Nonrenewable sources cause more pollution than renewable sources.", "This makes a single claim about pollution rather than developing a full comparison and contrast.")],
   "The revision names a shared function (generating electricity) and a specific, well-explained difference (how quickly each replenishes).",
   "A strong compare-and-contrast revision replaces a vague claim with one clear similarity and one clear, explained difference.")

mc("compare-contrast", "RI.6.5", 7, "An essay states, “Unlike a traditional classroom, an online course removes the fixed schedule that in-person learning requires; however, both formats still depend on consistent student engagement to succeed.” What is this sentence doing?",
   "Contrasting the structural flexibility of each format while identifying a shared requirement for success",
   [("Listing the technical steps needed to set up an online course", "No sequence of setup steps is described in the sentence."),
    ("Explaining why online courses became more popular during a particular decade", "The sentence does not explain a historical cause for popularity."),
    ("Describing only the physical layout of a traditional classroom", "The sentence focuses on scheduling and engagement, not classroom layout.")],
   "“Unlike” signals the contrast in scheduling, and “however, both” signals the shared need for engagement.",
   "In sophisticated texts, a single sentence can hold both a contrast and comparison, linked by two different signal words.")

mc("compare-contrast", "RI.6.5", 7, "Which topic would be BEST suited to a compare-and-contrast structure?",
   "How two historical leaders approached the same crisis differently, despite facing nearly identical circumstances",
   [("The exact sequence of battles in a single military campaign", "This is a process best organized by sequence, not comparison."),
    ("Why one historical leader lost public support over time", "This is best explained with cause and effect, not comparison."),
    ("A detailed biography of only one historical leader's early life", "This focuses on a single leader, with nothing to compare against.")],
   "This topic explicitly names two leaders and nearly identical circumstances, inviting a direct comparison of their differing approaches.",
   "A strong compare-and-contrast topic often highlights a shared situation faced by two different subjects.")
