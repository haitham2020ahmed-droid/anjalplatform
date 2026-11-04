"""
Question bank top-up 2, batch 14: brings these families to the full target of 50 items each
(original content, Grades 4-6): comparatives, titles-abbreviations, adverbs, sentences,
compound-sentences.
"""
from qb import dd, err, fill, grade, match, mc, ms, order, tf

# ================================================================== comparatives
grade(4)

dd("comparatives", "L.4.1", 1, "Choose the word: “A giraffe is ____ than a zebra.”",
   "taller", [("tallest", "Comparing only two animals needs -er, not -est."),
              ("tall", "You need a comparing word here."),
              ("more tall", "Short adjectives like “tall” add -er instead of “more.”")],
   "Comparing two animals uses the comparative form -er: taller.", "Two things: add -er. Three or more: add -est.")

dd("comparatives", "L.4.1", 1, "Choose the word: “Of the three bags, the blue one is the ____.”",
   "heaviest", [("heavier", "“Heavier” compares only two bags."),
                ("heavy", "You need a comparing word."),
                ("most heavy", "Short adjectives like “heavy” change y to i and add -est.")],
   "Comparing three bags needs the superlative -est: heaviest.", "“Of the three” signals a superlative.")

mc("comparatives", "L.4.1", 2, "Which sentence compares two drawings correctly?",
   "Lina’s drawing is more colorful than Hana’s.",
   [("Lina’s drawing is colorfuler than Hana’s.", "Long adjectives use “more,” not -er."),
    ("Lina’s drawing is most colorful than Hana’s.", "“Most” compares three or more, and “than” signals only two."),
    ("Lina’s drawing is more colorfuller than Hana’s.", "Never use “more” and -er together.")],
   "“Colorful” is a long adjective, so “more” is used to compare two drawings.",
   "Long adjectives (three or more syllables) take more/most, not -er/-est.")

dd("comparatives", "L.4.1", 2, "Choose the word: “This path is ____ than that one.”",
   "shorter", [("shortest", "Comparing two paths needs -er."),
               ("short", "You need a comparing word."),
               ("more short", "Short adjectives like “short” add -er.")],
   "Comparing two paths uses -er: shorter.", "Short one-syllable adjectives usually add -er/-est.")

mc("comparatives", "L.4.1", 2, "Which sentence uses comparing words correctly for three runners?",
   "Of the three runners, Sara finished the fastest.",
   [("Of the three runners, Sara finished faster.", "“Faster” compares only two runners."),
    ("Of the three runners, Sara finished the most fast.", "“Fast” is short, so it takes -est, not “most.”"),
    ("Of the three runners, Sara finished fastest than the others.", "Never use “than” after a superlative.")],
   "Comparing three or more runners needs the superlative -est: fastest.",
   "Never use “than” right after a superlative like fastest.")

tf("comparatives", "L.4.1", 3, "“Older” correctly compares the ages of two brothers.", True,
   "Comparing exactly two people uses the comparative -er form: older.", "Check how many things are being compared before choosing -er or -est.")

err("comparatives", "L.4.1", 3, ["Grandpa's old toolbox felt", " much more heavier", " in my arms", " than the new plastic one."], 1, " much heavier",
    "Never pair “more” with an -er ending; “heavier” by itself already shows the comparison.", "Double comparatives (more + -er) are always wrong.")

dd("comparatives", "L.4.1", 3, "Choose the word: “This riddle is ____ than the last one.”",
   "trickier", [("trickiest", "Comparing two riddles needs -er."),
                ("tricky", "You need a comparing word."),
                ("more tricky", "Short adjectives ending in y change to i and add -er.")],
   "Comparing two riddles uses -er, changing y to i: trickier.", "For adjectives ending in consonant + y, change y to i before adding -er/-est.")

mc("comparatives", "L.4.1", 3, "Which sentence uses the irregular comparative correctly?",
   "My cold is worse today than it was yesterday.",
   [("My cold is more bad today than it was yesterday.", "“Bad” is irregular: bad, worse, worst."),
    ("My cold is badder today than it was yesterday.", "“Badder” is not a word; use “worse.”"),
    ("My cold is worst today than it was yesterday.", "“Worst” compares three or more, not two.")],
   "Bad changes to worse to worst; comparing two days uses worse.", "Memorize irregular forms: good-better-best, bad-worse-worst.")

dd("comparatives", "L.4.1", 4, "Choose the word: “Please speak ____ than you did before.”",
   "more quietly", [("quietlier", "Adverbs ending in -ly use “more,” not -er."),
                     ("quieter", "“Quieter” compares the adjective, not how someone speaks."),
                     ("most quietly", "“Most” compares three or more.")],
   "Adverbs ending in -ly form comparatives with more: more quietly.", "Adverbs ending in -ly almost always use more/most.")

mc("comparatives", "L.4.1", 4, "Which sentence correctly compares how two sisters sing?",
   "Mona sings more beautifully than her sister.",
   [("Mona sings beautifullier than her sister.", "-ly adverbs use “more,” not -er."),
    ("Mona sings most beautifully than her sister.", "“Most” is for three or more, but “than” signals a two-way comparison."),
    ("Mona sings beautifuller than her sister.", "“Beautiful” is a long word; its adverb form also needs “more.”")],
   "More plus beautifully compares how two sisters sing.", "Compare adverbs the same way as long adjectives: more/most.")

err("comparatives", "L.4.1", 4, ["By midafternoon the sand", " felt more hot", " beneath our bare feet", " than it had at sunrise."], 1, " felt hotter",
    "Short adjectives like “hot” double the final consonant and add -er instead of using “more.”",
    "One-syllable adjectives ending in one vowel plus one consonant double that consonant before -er/-est.")

dd("comparatives", "L.4.1", 4, "Choose the word: “This is the ____ day of the whole year.”",
   "hottest", [("hotter", "“Hotter” compares only two days, not the whole year."),
               ("hot", "You need a comparing word."),
               ("most hot", "Short adjectives like “hot” double the consonant and add -est, not “most.”")],
   "“The whole year” signals a superlative with a doubled consonant: hottest.",
   "Double the final consonant before -er/-est when a short adjective ends in one vowel plus one consonant.")

mc("comparatives", "L.4.1", 5, "Which sentence makes an equal comparison correctly?",
   "This bridge is as long as that one.",
   [("This bridge is so long as that one.", "Equal comparisons use “as…as,” not “so…as.”"),
    ("This bridge is as longer as that one.", "Do not add -er inside an “as…as” comparison."),
    ("This bridge is as long than that one.", "Equal comparisons use “as” on both sides, not “than.”")],
   "Equal comparisons use the pattern as + adjective + as.", "Look for “as…as” to compare two equal things.")

dd("comparatives", "L.4.1", 5, "Choose the word: “This hallway was ____ than I remembered.”",
   "narrower", [("narrowest", "This still compares just two states, so -er is needed, not -est."),
                ("more narrow", "“Narrow” is a short adjective and takes -er."),
                ("narrow", "You need a comparing word.")],
   "Comparing two states (now and before) uses -er: narrower.", "Watch for comparisons across time, not only between two objects.")

mc("comparatives", "L.4.1", 5, "Which sentence compares distance correctly using “farther”?",
   "The library is farther from school than the park is.",
   [("The library is further from school than the park is.", "“Further” is usually used for figurative distance, not physical distance."),
    ("The library is farthest from school than the park is.", "A superlative cannot be followed by “than.”"),
    ("The library is more far from school than the park is.", "“Far” is irregular: far, farther, farthest.")],
   "Far is irregular; “farther” compares physical distance between two places.",
   "Use “farther” for physical distance and “further” for additional or figurative ideas.")

err("comparatives", "L.4.1", 6, ["Once Nadia redrew the diagram,", " it became more clearer", " to everyone", " sitting near the back of the room."], 1, " clearer",
    "“More” and the -er ending cannot be combined; “clearer” alone is the correct comparative.",
    "A double comparative (more + -er) is always incorrect.")

dd("comparatives", "L.4.1", 6, "Choose the correct comparative adverb: “The detective solved the case ____ than anyone expected.”",
   "more cleverly", [("cleverlier", "-ly adverbs cannot take -er; use “more.”"),
                      ("more clever", "This compares the adjective, not how the detective solved it."),
                      ("most cleverly", "“Most” compares three or more, but “than anyone” signals a two-way comparison.")],
   "The -ly adverb cleverly forms its comparative with more: more cleverly.",
   "To compare an action, check whether the word ends in -ly; if so, use more/most.")

mc("comparatives", "L.4.1", 7, "Which sentence correctly compares three essays using the irregular word for “little”?",
   "Of the three essays, this one has the least detail.",
   [("Of the three essays, this one has the less detail.", "“Less” compares only two things; use “least” for three or more."),
    ("Of the three essays, this one has the littlest detail.", "“Littlest” is not standard; the irregular superlative is “least.”"),
    ("Of the three essays, this one has less detail than the others.", "Comparing three or more items needs the superlative “least,” not “less.”")],
   "Little changes to less to least, an irregular pattern; three or more items need the superlative least.",
   "Little is irregular: little, less, least — just like good, better, best.")

grade(5)

dd("comparatives", "L.5.1", 1, "Choose the word: “This novel is ____ than the one I read last month.”",
   "longer", [("longest", "Comparing two novels needs -er."),
              ("long", "You need a comparing word."),
              ("more long", "Short adjectives like “long” add -er, not “more.”")],
   "Comparing two novels uses -er: longer.", "Two things compared uses -er; three or more uses -est.")

dd("comparatives", "L.5.1", 1, "Choose the word: “Of all the rivers on the map, the Nile is the ____.”",
   "longest", [("longer", "“Longer” compares only two rivers."),
               ("long", "You need a comparing word."),
               ("most long", "Short adjectives add -est, not “most.”")],
   "Comparing many rivers needs the superlative -est: longest.", "“Of all” signals a superlative.")

dd("comparatives", "L.5.1", 2, "Choose the word: “Dana looked ____ after the surprise party than she had all week.”",
   "happier", [("happiest", "This compares only two states (before and after), so use -er."),
               ("happy", "You need a comparing word."),
               ("more happy", "Short adjectives ending in y change to i and add -er.")],
   "Comparing two states uses -er, changing y to i: happier.", "For adjectives ending in consonant + y, change y to i before adding -er/-est.")

mc("comparatives", "L.5.1", 2, "Which sentence compares the triplets correctly?",
   "Of the triplets, Ahmed is the happiest.",
   [("Of the triplets, Ahmed is happier.", "“Happier” compares only two people, but there are three triplets."),
    ("Of the triplets, Ahmed is the most happy.", "Short adjectives ending in y take -est, not “most.”"),
    ("Of the triplets, Ahmed is happiest than the others.", "Never use “than” right after a superlative.")],
   "Comparing three triplets needs the superlative -est: happiest.", "A group of three or more always needs the superlative form.")

err("comparatives", "L.5.1", 2, ["Grandpa gives", " more wiser", " advice", " than anyone I know."], 1, " wiser",
    "“More” and the -er ending cannot be combined; “wiser” alone is the correct comparative.",
    "Never combine “more” with an -er ending.")

dd("comparatives", "L.5.1", 3, "Choose the word: “This lamp is ____ than the old one.”",
   "brighter", [("brightest", "Comparing two lamps needs -er."),
                ("bright", "You need a comparing word."),
                ("more bright", "Short adjectives like “bright” add -er.")],
   "Comparing two lamps uses -er: brighter.", "Short adjectives usually just add -er or -est.")

mc("comparatives", "L.5.1", 3, "Which sentence correctly compares many stars?",
   "Of all the stars in the sky, that one looks the brightest.",
   [("Of all the stars in the sky, that one looks brighter.", "“Brighter” compares only two stars."),
    ("Of all the stars in the sky, that one looks the most bright.", "Short adjectives like “bright” take -est, not “most.”"),
    ("Of all the stars in the sky, that one looks brightest than the rest.", "Never use “than” after a superlative.")],
   "Comparing all the stars in the sky needs the superlative -est: brightest.", "“Of all” is a clue to use the superlative form.")

tf("comparatives", "L.5.1", 3, "“Quieter” correctly compares the noise level of two classrooms.", True,
   "Comparing exactly two classrooms uses the comparative -er form: quieter.", "Count how many things are compared before choosing -er or -est.")

dd("comparatives", "L.5.1", 3, "Choose the word: “Of the four classrooms, Room 2 is the ____.”",
   "quietest", [("quieter", "“Quieter” compares only two classrooms."),
                ("quiet", "You need a comparing word."),
                ("most quiet", "Short adjectives like “quiet” add -est, not “most.”")],
   "Comparing four classrooms needs the superlative -est: quietest.", "“Of the four” signals a superlative, not a comparative.")

mc("comparatives", "L.5.1", 4, "Which sentence compares the two bridges correctly?",
   "The new bridge is stronger than the old one.",
   [("The new bridge is more strong than the old one.", "“Strong” is a short adjective and takes -er, not “more.”"),
    ("The new bridge is strongest than the old one.", "A superlative cannot be followed by “than.”"),
    ("The new bridge is more stronger than the old one.", "Never combine “more” with an -er ending.")],
   "Comparing two bridges uses -er: stronger.", "Short adjectives add -er or -est; do not add “more” as well.")

dd("comparatives", "L.5.1", 4, "Choose the word: “Of all the ropes in the gym, this one is the ____.”",
   "strongest", [("stronger", "“Stronger” compares only two ropes."),
                 ("strong", "You need a comparing word."),
                 ("most strong", "Short adjectives like “strong” add -est, not “most.”")],
   "Comparing all the ropes needs the superlative -est: strongest.", "“Of all” is a clue to use a superlative.")

mc("comparatives", "L.5.1", 4, "Which sentence compares two devices correctly?",
   "This laptop is more expensive than that tablet.",
   [("This laptop is expensiver than that tablet.", "Long adjectives like “expensive” use “more,” not -er."),
    ("This laptop is most expensive than that tablet.", "“Most” compares three or more, but “than” signals only two."),
    ("This laptop is more expensiver than that tablet.", "Never combine “more” with an -er ending.")],
   "“Expensive” is a long adjective, so comparing two devices uses more.", "Long adjectives of three or more syllables use more/most.")

dd("comparatives", "L.5.1", 4, "Choose the word: “Of the three laptops, this one is the ____.”",
   "most expensive", [("more expensive", "“More expensive” compares only two laptops."),
                       ("expensivest", "Long adjectives never take -est."),
                       ("expensive", "You need a comparing word.")],
   "Comparing three laptops needs the superlative most: most expensive.", "Long adjectives use most for the superlative, never -est.")

mc("comparatives", "L.5.1", 5, "Which sentence compares two houses’ locations correctly?",
   "Our house is closer to the beach than yours is.",
   [("Our house is more close to the beach than yours is.", "“Close” is a short adjective and takes -er, not “more.”"),
    ("Our house is closest to the beach than yours is.", "A superlative cannot be followed by “than.”"),
    ("Our house is more closer to the beach than yours is.", "Never combine “more” with an -er ending.")],
   "Comparing two houses uses -er: closer.", "Short adjectives take -er or -est, not both “more” and -er.")

dd("comparatives", "L.5.1", 5, "Choose the word: “Of all the shops on the street, the bakery is the ____ to school.”",
   "closest", [("closer", "“Closer” compares only two shops."),
               ("close", "You need a comparing word."),
               ("most close", "Short adjectives like “close” add -est, not “most.”")],
   "Comparing all the shops needs the superlative -est: closest.", "“Of all” signals a superlative, not a comparative.")

mc("comparatives", "L.5.1", 5, "Which sentence compares two riddles correctly?",
   "This riddle is more interesting than the last one.",
   [("This riddle is interestinger than the last one.", "Long adjectives like “interesting” use “more,” not -er."),
    ("This riddle is most interesting than the last one.", "“Most” compares three or more, but “than” signals only two."),
    ("This riddle is more interestinger than the last one.", "Never combine “more” with an -er ending.")],
   "“Interesting” is a long adjective, so comparing two riddles uses more.", "Long adjectives always use more/most, never -er/-est.")

match("comparatives", "L.5.1", 6, "Match each short adjective with its comparative (-er) form.",
      [("wise", "wiser"), ("brave", "braver"), ("gentle", "gentler"), ("simple", "simpler")],
      "Short adjectives form the comparative by adding -er.", "For adjectives already ending in e, just add -r.")

err("comparatives", "L.5.1", 6, ["This machine is", " the most interestingest", " invention", " of the century."], 1, " most interesting",
    "“Interesting” is a long adjective; use only “most,” never add -est as well.",
    "Long adjectives never take -er or -est at all.")

mc("comparatives", "L.5.1", 7, "Which sentence makes an equal comparison correctly?",
   "Her answer was as careful as mine.",
   [("Her answer was more careful as mine.", "An equal comparison needs “as” on both sides, not “more…as.”"),
    ("Her answer was as careful than mine.", "Equal comparisons use “as…as,” not “as…than.”"),
    ("Her answer was so careful as mine.", "Equal comparisons use “as…as,” not “so…as.”")],
   "Equal comparisons use the pattern as + adjective + as.", "Look for the exact pattern “as…as” to spot an equal comparison.")

# ================================================================== titles-abbreviations
grade(4)

mc("titles-abbreviations", "L.4.2", 1, "Which is the correct abbreviation for “Mister”?",
   "Mr.", [("Mstr.", "This is not a standard abbreviation."),
           ("Mis.", "This is not a standard abbreviation."),
           ("M.", "This abbreviation is too short to be clear.")],
   "“Mister” is abbreviated as “Mr.” before a man’s name.", "Titles before names always end with a period.")

mc("titles-abbreviations", "L.4.2", 1, "Which is the correct abbreviation for a married woman’s title?",
   "Mrs.", [("Mrss.", "This is misspelled."),
            ("Mr.", "This abbreviation is for a man’s title."),
            ("Mss.", "This is not the standard abbreviation.")],
   "“Mrs.” is the title used before a married woman’s name.", "Titles before names always end with a period.")

dd("titles-abbreviations", "L.4.2", 2, "Choose the abbreviation: “Karim Nassar ____ plays on the same team his father once did.”",
   "Jr.", [("Jnr.", "This is not the standard American abbreviation."),
           ("Jun.", "This is not the standard abbreviation for this use."),
           ("J.", "This abbreviation is too short to be clear.")],
   "“Jr.” after a name shows a son is named after his father.", "Jr. and Sr. show a name is shared between a parent and child.")

dd("titles-abbreviations", "L.4.2", 2, "Choose the abbreviation: “The club meets every ____.”",
   "Wed.", [("Wd.", "This is not the standard abbreviation for Wednesday."),
            ("Wen.", "This is misspelled."),
            ("We.", "This abbreviation is too short to be clear.")],
   "“Wed.” is the standard abbreviation for Wednesday.", "Day abbreviations usually use the first three letters plus a period.")

mc("titles-abbreviations", "L.4.2", 2, "Which sentence writes a date with the month correctly abbreviated?",
   "The trip begins on Jan. 5, 2024.",
   [("The trip begins on Jan 5, 2024.", "An abbreviation needs a period after it: Jan."),
    ("The trip begins on JAN. 5, 2024.", "Month abbreviations are not written in all capital letters."),
    ("The trip begins on J.a.n. 5, 2024.", "Only the whole abbreviation gets one period, not each letter.")],
   "“Jan.” is the correctly capitalized and punctuated abbreviation for January.", "Abbreviate a month with its first three letters and one period.")

dd("titles-abbreviations", "L.4.2", 3, "Choose the abbreviation for the unit: “The new shelf is 6 ____ long.”",
   "ft.", [("fts.", "The abbreviation for feet does not add an s."),
           ("f.", "This abbreviation is too short to be clear."),
           ("feet.", "This is the full word, not an abbreviation.")],
   "“Ft.” is the abbreviation for feet.", "Many measurement abbreviations stay the same whether singular or plural.")

dd("titles-abbreviations", "L.4.2", 3, "Choose the abbreviation for the unit: “This bag of rice weighs 2 ____.”",
   "lb.", [("lbs", "Without a period this does not look like an abbreviation."),
           ("pd.", "This is not the standard abbreviation for pounds."),
           ("lib.", "This is not a measurement abbreviation.")],
   "“Lb.” is the abbreviation for pound.", "“Lb.” comes from the Latin word libra, but it still means pound.")

mc("titles-abbreviations", "L.4.2", 3, "Which sentence correctly abbreviates “Avenue” in an address?",
   "She lives on 12 Palm Ave.",
   [("She lives on 12 Palm Av.", "The standard abbreviation keeps the first three letters: Ave."),
    ("She lives on 12 Palm AVE.", "Street-type abbreviations are not written in all capital letters."),
    ("She lives on 12 Palm Avenue.,", "This is the full word, not an abbreviation, and has an extra comma.")],
   "“Ave.” is the standard abbreviation for Avenue.", "Street-type words (St., Ave., Rd.) keep a capital letter and a period.")

mc("titles-abbreviations", "L.4.2", 3, "How should the title of a short poem be written inside a sentence?",
   "Nour wrote a poem called “My Shadow.”",
   [("Nour wrote a poem called My Shadow.", "The title of a short poem needs quotation marks around it."),
    ("Nour wrote a poem called ‘my shadow.’", "Every important word in a title starts with a capital letter."),
    ("Nour wrote a poem called “my Shadow.”", "The first word of a title is always capitalized, even if short.")],
   "Titles of short works like poems and songs go inside quotation marks, with important words capitalized.",
   "Short works (poems, songs, short stories) get quotation marks; long works (books, movies) are underlined or italicized.")

mc("titles-abbreviations", "L.4.2", 4, "How should the title of a long book be shown when it is handwritten?",
   "Maha is reading The Secret Garden.",
   [("Maha is reading “The Secret Garden.”", "Quotation marks are for short works, not whole books."),
    ("Maha is reading the secret garden.", "Every important word in a book title is capitalized."),
    ("Maha is reading The secret Garden.", "“Secret” is an important word in the title and must be capitalized too.")],
   "Long works like books are underlined when handwritten (or italicized when typed), with important words capitalized.",
   "Underline or italicize long works; use quotation marks for short works.")

mc("titles-abbreviations", "L.4.2", 4, "Which sentence correctly writes the title of a song?",
   "We sang “Rain on the Roof” at the concert.",
   [("We sang Rain on the Roof at the concert.", "Song titles are set off with quotation marks."),
    ("We sang “rain on the roof” at the concert.", "Every important word of the title should be capitalized."),
    ("We sang “Rain on the roof” at the concert.", "“Roof” is an important word in the title and must be capitalized too.")],
   "Song titles, like other short works, are placed in quotation marks with important words capitalized.",
   "Short works get quotation marks; capitalize every important word in a title.")

mc("titles-abbreviations", "L.4.2", 4, "Which greeting correctly begins a friendly letter?",
   "Dear Grandma,",
   [("Dear Grandma.", "A friendly letter’s greeting ends with a comma, not a period."),
    ("dear Grandma,", "The first word of a greeting is always capitalized."),
    ("Dear grandma,", "A specific family member’s name used as a title, like Grandma, is capitalized here.")],
   "A friendly letter greeting starts with a capital letter and ends with a comma.", "Greetings in letters always end with a comma, not a period.")

mc("titles-abbreviations", "L.4.2", 5, "Which closing correctly ends a friendly letter?",
   "Love, Mariam",
   [("Love Mariam", "A letter closing needs a comma after the closing word."),
    ("love, Mariam", "The first word of a closing is always capitalized."),
    ("Love, mariam", "A person’s name is always capitalized.")],
   "A friendly letter closing is capitalized and followed by a comma before the signature.", "Closings like “Love,” or “Your friend,” always need a comma.")

order("titles-abbreviations", "L.4.2", 5, "Nadia is writing a thank-you note to her grandmother. Put the sections she should write, in order.",
      ["when she is writing it", "how she greets her grandmother", "the message she wants to share", "how she signs off", "her name at the very end"],
      "A friendly letter always moves from when it was written, to a greeting, to the message, to a sign-off, and finally the writer's name.",
      "Think of a letter like a story: it starts with when, then who it is for, then the message.")

mc("titles-abbreviations", "L.4.2", 5, "Which sentence abbreviates the date correctly in a note?",
   "The class trip is set for Oct. 9.",
   [("The class trip is set for Oct 9.", "An abbreviation needs a period after it: Oct."),
    ("The class trip is set for OCT. 9.", "Month abbreviations are not written in all capital letters."),
    ("The class trip is set for Octo. 9.", "The standard abbreviation uses only the first three letters: Oct.")],
   "“Oct.” is the correctly punctuated abbreviation for October.", "Most month abbreviations use the first three letters plus a period.")

dd("titles-abbreviations", "L.4.2", 6, "Choose the abbreviation: “____ Malik gave the order to set sail.”",
   "Capt.", [("Cap.", "This is not the standard abbreviation for Captain."),
             ("Cptn.", "This is not the standard abbreviation."),
             ("C.", "This abbreviation is too short to be clear.")],
   "“Capt.” is the standard abbreviation for Captain before a name.", "Military and ship titles like Captain are often abbreviated before a name.")

err("titles-abbreviations", "L.4.2", 6, ["Our class read", " the book charlotte’s web", " for our reading project."], 1, " the book Charlotte’s Web",
    "Every important word in a book’s title is capitalized.", "Capitalize the first word and every important word in a title.")

mc("titles-abbreviations", "L.4.2", 7, "Which sentence correctly abbreviates the name of the country?",
   "The U.S. has fifty states.",
   [("The US has fifty states.", "This common abbreviation is usually written with periods: U.S."),
    ("The u.s. has fifty states.", "The letters in this abbreviation are capitalized."),
    ("The U.S has fifty states.", "A period is needed after each letter: U.S.")],
   "“U.S.” is written with a capital letter and a period after each initial.", "Abbreviations made from initials usually keep a period after each letter.")

dd("titles-abbreviations", "L.4.2", 7, "Choose the abbreviation: “The parade route turns onto Palm ____.”",
   "Blvd.", [("Bvd.", "This is misspelled; the standard abbreviation is Blvd."),
             ("Boul.", "This is not the standard abbreviation."),
             ("B.", "This abbreviation is too short to be clear.")],
   "“Blvd.” is the standard abbreviation for Boulevard.", "Street-type words like Boulevard keep a capital letter and a period when abbreviated.")

grade(5)

mc("titles-abbreviations", "L.5.2", 1, "Which is the correct abbreviation for a woman’s title that does not state marital status?",
   "Ms.", [("Ms", "A title abbreviation needs a period at the end."),
           ("Mss.", "This is not the standard abbreviation."),
           ("Mz.", "This is not the standard spelling of the abbreviation.")],
   "“Ms.” is used before a woman’s name regardless of marital status.", "Title abbreviations before names always end with a period.")

dd("titles-abbreviations", "L.5.2", 1, "Choose the abbreviation: “Tariq Hassan ____ runs the family bakery his grandfather started.”",
   "Sr.", [("Snr.", "This is not the standard American abbreviation."),
           ("Ser.", "This is not a recognized abbreviation for this use."),
           ("S.", "This abbreviation is too short to be clear.")],
   "“Sr.” shows that Tariq is the older of two family members sharing a name.", "Sr. marks the older person; Jr. marks the younger person with the same name.")

dd("titles-abbreviations", "L.5.2", 2, "Choose the abbreviation: “The library is closed every ____.”",
   "Thu.", [("Thur", "Without a period this does not look like a standard abbreviation."),
            ("Th.", "This abbreviation is too short to be the standard form."),
            ("Thus.", "This is misspelled.")],
   "“Thu.” is a standard abbreviation for Thursday.", "Day abbreviations usually use the first three or four letters plus a period.")

dd("titles-abbreviations", "L.5.2", 2, "Choose the abbreviation: “School begins again in ____.”",
   "Sept.", [("Sep.", "This month is more commonly abbreviated with four letters: Sept."),
             ("Septr.", "This is not a standard abbreviation."),
             ("SEPT.", "Month abbreviations are not written in all capital letters.")],
   "“Sept.” is the common abbreviation for September.", "Some months, like September, keep four letters in their abbreviation.")

mc("titles-abbreviations", "L.5.2", 2, "Which sentence correctly abbreviates the date?",
   "The science fair is on Nov. 11, 2025.",
   [("The science fair is on Nov 11, 2025.", "An abbreviation needs a period after it: Nov."),
    ("The science fair is on NOV. 11, 2025.", "Month abbreviations are not written in all capital letters."),
    ("The science fair is on Novem. 11, 2025.", "The standard abbreviation uses only the first three letters: Nov.")],
   "“Nov.” is the correctly punctuated abbreviation for November.", "Most month abbreviations use the first three letters plus a period.")

dd("titles-abbreviations", "L.5.2", 3, "Choose the abbreviation for the unit: “The notebook is 8 ____ wide.”",
   "in.", [("ins.", "The abbreviation for inches does not add an s."),
           ("inc.", "This abbreviation means something different (incorporated)."),
           ("i.", "This abbreviation is too short to be clear.")],
   "“In.” is the abbreviation for inch or inches.", "Many measurement abbreviations stay the same whether singular or plural.")

dd("titles-abbreviations", "L.5.2", 3, "Choose the abbreviation for the unit: “Add 4 ____ of vanilla extract.”",
   "oz.", [("ozs.", "The abbreviation for ounce does not add an s."),
           ("ou.", "This is not the standard abbreviation."),
           ("o.", "This abbreviation is too short to be clear.")],
   "“Oz.” is the standard abbreviation for ounce.", "“Oz.” comes from an older word for ounce but still means ounce today.")

mc("titles-abbreviations", "L.5.2", 3, "Which sentence correctly abbreviates “miles per hour”?",
   "The speed limit here is 40 mph.",
   [("The speed limit here is 40 m.p.h.", "The common form of this abbreviation does not use periods."),
    ("The speed limit here is 40 MPH.", "This abbreviation is usually written in lowercase."),
    ("The speed limit here is 40 mi.p.h.", "This is not the standard abbreviation.")],
   "“Mph” is the standard way to abbreviate miles per hour, written without periods.", "Some common abbreviations, like mph, drop the periods entirely.")

dd("titles-abbreviations", "L.5.2", 3, "Choose the abbreviation: “The new mailbox is on Cedar ____.”",
   "Rd.", [("Rod.", "This is not the standard abbreviation."),
           ("R.", "This abbreviation is too short to be clear."),
           ("Raod.", "This is misspelled.")],
   "“Rd.” is the standard abbreviation for Road.", "Street-type words like Road keep a capital letter and a period when abbreviated.")

mc("titles-abbreviations", "L.5.2", 4, "Which sentence correctly shows the title of a movie?",
   "We watched Finding Nemo last night.",
   [("We watched “Finding Nemo” last night.", "Movie titles, like book titles, are underlined or italicized, not placed in quotation marks."),
    ("We watched finding nemo last night.", "Every important word in a movie title is capitalized."),
    ("We watched Finding nemo last night.", "“Nemo” is an important word in the title and must be capitalized too.")],
   "Movie titles are long works, so they are italicized (or underlined when handwritten), with important words capitalized.",
   "Long works (books, movies) are underlined or italicized; short works get quotation marks.")

mc("titles-abbreviations", "L.5.2", 4, "Which sentence correctly shows the title of a newspaper article?",
   "I read an article called “Saving the Coral Reefs.”",
   [("I read an article called Saving the Coral Reefs.", "Short works like articles need quotation marks around the title."),
    ("I read an article called “saving the coral reefs.”", "Every important word in the title should be capitalized."),
    ("I read an article called “Saving the coral Reefs.”", "“Coral” and “Reefs” are important words that must also be capitalized.")],
   "Article titles are short works, so they are placed in quotation marks with important words capitalized.",
   "Short works (articles, poems, songs) get quotation marks; capitalize every important word.")

mc("titles-abbreviations", "L.5.2", 4, "Which greeting correctly begins a formal business letter?",
   "Dear Sir or Madam:",
   [("Dear Sir or Madam,", "A formal business letter greeting ends with a colon, not a comma."),
    ("dear Sir or Madam:", "The first word of a greeting is always capitalized."),
    ("Dear sir or madam:", "The titles “Sir” and “Madam” are capitalized here.")],
   "A formal letter’s greeting is capitalized and ends with a colon.", "Formal letters use a colon after the greeting; friendly letters use a comma.")

mc("titles-abbreviations", "L.5.2", 5, "Which closing correctly ends a formal business letter?",
   "Sincerely,",
   [("Sincerely", "A letter closing needs a comma after the closing word."),
    ("sincerely,", "The first word of a closing is always capitalized."),
    ("Sincerely yours", "A letter closing needs a comma after the closing phrase.")],
   "“Sincerely,” is a standard, properly punctuated closing for a formal letter.", "Formal closings like “Sincerely,” or “Respectfully,” still need a comma.")

match("titles-abbreviations", "L.5.2", 5, "Match each abbreviation with the word it stands for.",
      [("Tue.", "Tuesday"), ("Dec.", "December"), ("Blvd.", "Boulevard"), ("oz.", "ounce")],
      "Abbreviations are shortened forms of a word, usually ending with a period.", "Say the full word aloud to check an abbreviation makes sense.")

dd("titles-abbreviations", "L.5.2", 5, "Choose the abbreviation: “Turn left on Willow ____ to reach the park.”",
   "Ln.", [("Lan.", "This is not the standard abbreviation."),
           ("L.", "This abbreviation is too short to be clear."),
           ("Lne.", "This is misspelled.")],
   "“Ln.” is the standard abbreviation for Lane.", "Street-type words like Lane keep a capital letter and a period when abbreviated.")

err("titles-abbreviations", "L.5.2", 6, ["She subscribes to", " a magazine called national geographic", " for her science class."], 1, " a magazine called National Geographic",
    "Every important word in a magazine’s title is capitalized.", "Capitalize the first word and every important word in a title, even in a magazine name.")

mc("titles-abbreviations", "L.5.2", 6, "Which sentence correctly writes a person’s initials?",
   "T. J. Carter signed the card.",
   [("TJ Carter signed the card.", "Each initial needs its own period."),
    ("T.J Carter signed the card.", "Each initial needs a period and a space after it."),
    ("T. J Carter signed the card.", "The second initial also needs a period after it.")],
   "Each initial in a name gets its own period, with a space between them.", "Treat each initial like its own abbreviation: letter, period, space.")

order("titles-abbreviations", "L.5.2", 6, "Put the parts of a formal business letter in the correct order.",
      ["the heading", "the inside address", "the greeting", "the body", "the closing", "the signature"],
      "A formal business letter follows this order: heading, inside address, greeting, body, closing, signature.",
      "The inside address tells who you are writing to, and it always comes right after your own heading.")

mc("titles-abbreviations", "L.5.2", 7, "Which sentence uses the abbreviation “etc.” correctly?",
   "Bring snacks, drinks, etc., for the trip.",
   [("Bring snacks, drinks, ect., for the trip.", "This abbreviation is misspelled; the correct form is etc."),
    ("Bring snacks, drinks, etc for the trip.", "The abbreviation etc. needs a period after it."),
    ("Bring snacks, Etc., for the trip.", "“Etc.” is not capitalized in the middle of a sentence.")],
   "“Etc.” is short for “and so on” and is spelled with a period after it, usually followed by a comma in a list.",
   "“Etc.” always ends with a period, even in the middle of a sentence.")

# ================================================================== adverbs
grade(4)

mc("adverbs", "L.4.1", 1, "Which word tells HOW she spoke? “The librarian spoke quietly in the hall.”",
   "quietly", [("librarian", "This is a noun."), ("spoke", "This is the verb."), ("hall", "This is a noun.")],
   "“Quietly” tells how the librarian spoke.", "Many adverbs that tell how end in -ly.")

dd("adverbs", "L.4.1", 2, "Choose the adverb that tells WHEN: “The mail carrier always arrives ____.”",
   "promptly", [("quietly", "This tells how."), ("upstairs", "This tells where."), ("mail", "This is a noun.")],
   "“Promptly” tells when the mail carrier arrives.", "Adverbs answer how, when, or where.")

mc("adverbs", "L.4.1", 2, "Which word is an adverb that tells WHERE? “The cat hid upstairs during the storm.”",
   "upstairs", [("cat", "This is a noun."), ("hid", "This is the verb."), ("storm", "This is a noun.")],
   "“Upstairs” tells where the cat hid.", "Where-adverbs: here, there, upstairs, outside, inside.")

dd("adverbs", "L.4.1", 3, "Choose the adverb that tells HOW OFTEN: “He ____ brushes his teeth before bed.”",
   "always", [("softly", "This tells how."), ("there", "This tells where."), ("teeth", "This is a noun.")],
   "“Always” tells how often he brushes his teeth.", "How-often adverbs include always, never, usually, sometimes.")

err("adverbs", "L.4.1", 3, ["The nurse", " checked", " the wound", " very careful."], 3, " very carefully",
    "“Carefully” is the adverb that describes how the nurse checked; “careful” is an adjective.", "Use an adverb, not an adjective, to describe a verb.")

mc("adverbs", "L.4.1", 4, "Which word is an adverb that tells HOW? “The dog barked loudly at the stranger.”",
   "loudly", [("dog", "This is a noun."), ("barked", "This is the verb."), ("stranger", "This is a noun.")],
   "“Loudly” tells how the dog barked.", "Adverbs that tell how often end in -ly.")

dd("adverbs", "L.4.1", 4, "Choose the adverb that shows a small degree: “She had ____ enough time to finish.”",
   "barely", [("completely", "This means the opposite, a large degree."), ("quickly", "This tells how, not how much."), ("time", "This is a noun.")],
   "“Barely” shows that she had only a small amount of time.", "Degree adverbs tell how much: barely, almost, completely, very.")

mc("adverbs", "L.4.1", 5, "Which word is an adverb that tells HOW? “The kitten crept nervously toward the bowl.”",
   "nervously", [("kitten", "This is a noun."), ("crept", "This is the verb."), ("bowl", "This is a noun.")],
   "“Nervously” tells how the kitten crept.", "Adverbs that tell how often end in -ly.")

dd("adverbs", "L.4.1", 5, "Choose the adverb that tells WHEN: “I saw them at the market ____.”",
   "yesterday", [("carefully", "This tells how."), ("there", "This tells where, not when."), ("market", "This is a noun.")],
   "“Yesterday” tells when she saw them.", "When-adverbs: today, yesterday, tomorrow, soon, later.")

mc("adverbs", "L.4.1", 6, "Which word is an adverb in this sentence? “The workers arrived early for the shift.”",
   "early", [("workers", "This is a noun."), ("arrived", "This is the verb."), ("shift", "This is a noun.")],
   "“Early” tells when the workers arrived, even though it does not end in -ly.", "Not every adverb ends in -ly; some common ones like fast, early, and soon do not.")

mc("adverbs", "L.4.1", 7, "In this sentence, what does the adverb “overly” describe? “The overly confident runner tripped at the finish line.”",
   "confident", [("runner", "This is a noun."), ("tripped", "This is a verb, but “overly” sits right before the word it describes."), ("finish", "This is part of a noun phrase.")],
   "“Overly” is a degree adverb that describes the adjective “confident.”", "An adverb right before an adjective usually describes that adjective, telling how much.")

grade(5)

dd("adverbs", "L.5.1", 1, "Choose the adverb that tells HOW: “The dancer moved ____ across the stage.”",
   "gracefully", [("sudden", "This is an adjective, not an adverb."), ("there", "This tells where, not how."), ("stage", "This is a noun.")],
   "“Gracefully” tells how the dancer moved.", "Adverbs that tell how usually end in -ly.")

dd("adverbs", "L.5.1", 2, "Choose the adverb that tells HOW OFTEN: “Our neighbors ____ invite us for dinner.”",
   "frequently", [("gracefully", "This tells how."), ("downstairs", "This tells where."), ("dinner", "This is a noun.")],
   "“Frequently” tells how often the neighbors invite them.", "How-often adverbs include frequently, rarely, occasionally, always.")

mc("adverbs", "L.5.1", 3, "Which word is an adverb that tells WHERE? “Ants built their colony underground near the old tree.”",
   "underground", [("ants", "This is a noun."), ("built", "This is a verb."), ("tree", "This is a noun.")],
   "“Underground” tells where the ants built their colony.", "Where-adverbs can be a single word like underground, upstairs, or outside.")

dd("adverbs", "L.5.1", 4, "Choose the adverb that tells WHEN: “The pilot landed the plane ____ after the warning light appeared.”",
   "immediately", [("gracefully", "This tells how, not when."), ("underground", "This tells where, not when."), ("plane", "This is a noun.")],
   "“Immediately” tells when the pilot landed the plane.", "When-adverbs can show a very short gap in time, like immediately or instantly.")

dd("adverbs", "L.5.1", 5, "Choose the degree adverb: “This soup is ____ salty for my taste.”",
   "too", [("very carefully", "This is an adverb phrase that tells how, not degree in this pattern."), ("soup", "This is a noun."), ("salty", "This is the adjective being described, not the adverb.")],
   "“Too” shows the soup has more salt than wanted.", "Degree adverbs like too, very, and quite tell how much of a quality there is.")

dd("adverbs", "L.5.1", 5, "Choose the degree adverb: “This cake is ____ delicious for a first try.”",
   "quite", [("deliciously", "This is an adverb form of the adjective itself, not a degree word."), ("cake", "This is a noun."), ("try", "This is a noun.")],
   "“Quite” shows a high degree of how delicious the cake is.", "Degree adverbs like quite, very, and too usually come right before an adjective.")

mc("adverbs", "L.5.1", 6, "Which sentence uses the comparative form of an adverb correctly?",
   "She explained the puzzle more gracefully than her partner did.",
   [("She explained the puzzle gracefullier than her partner did.", "-ly adverbs cannot take -er; use “more.”"),
    ("She explained the puzzle most gracefully than her partner did.", "“Most” compares three or more, but “than” signals only two."),
    ("She explained the puzzle more gracefuller than her partner did.", "Never combine “more” with an -er ending.")],
   "Adverbs ending in -ly form their comparative with more: more gracefully.", "-ly adverbs always use more/most, never -er/-est.")

mc("adverbs", "L.5.1", 6, "Which sentence uses the superlative form of an adverb correctly?",
   "Of all the dancers, Yara moved the most gracefully.",
   [("Of all the dancers, Yara moved the gracefullest.", "-ly adverbs cannot take -est; use “most.”"),
    ("Of all the dancers, Yara moved more gracefully.", "“More” compares only two dancers, but “of all” signals a group."),
    ("Of all the dancers, Yara moved the most gracefulliest.", "Never combine “most” with an -est ending.")],
   "Adverbs ending in -ly form their superlative with most: most gracefully.", "“Of all” is a clue to use the superlative most + adverb.")

err("adverbs", "L.5.1", 6, ["He performed", " very bad", " on the quiz", " yesterday."], 1, " very badly",
    "“Badly” is the adverb that describes how he performed; “bad” is an adjective.", "Use an adverb, not an adjective, after an action verb.")

mc("adverbs", "L.5.1", 7, "What does the adverb “nearly” describe in this sentence? “The nearly finished painting impressed everyone.”",
   "finished", [("painting", "This is a noun."), ("impressed", "“Nearly” sits right before the word it describes, not this verb."), ("everyone", "This is a pronoun.")],
   "“Nearly” is a degree adverb that describes the participle “finished,” telling how complete it was.",
   "A degree adverb right before an adjective or participle usually describes that word.")

match("adverbs", "L.5.1", 7, "Match each adverb with the question it answers about the verb.",
      [("quickly", "how"), ("soon", "when"), ("everywhere", "where"), ("rarely", "how often")],
      "Adverbs answer how, when, where, or how often an action happens.", "Ask yourself the question (how? when? where? how often?) to find what an adverb tells.")

grade(6)

mc("adverbs", "L.6.1", 2, "Which conjunctive adverb correctly shows contrast between these two ideas? “It started to rain; ____, the game continued.”",
   "however", [("therefore", "This shows a result, not a contrast."), ("moreover", "This shows an added idea, not a contrast."), ("meanwhile", "This shows two things happening at the same time, not a contrast.")],
   "“However” signals a contrast between the rain and the game continuing.", "Conjunctive adverbs like however and nevertheless show contrast between two clauses.")

dd("adverbs", "L.6.1", 2, "Choose the conjunctive adverb: “The bridge was damaged; ____, the town built a temporary crossing.”",
   "therefore", [("however", "This shows contrast, but the second idea is a result, not a contrast."), ("moreover", "This adds information rather than showing a result."), ("meanwhile", "This shows two events at the same time, not a cause and its result.")],
   "“Therefore” shows that the temporary crossing was a result of the damaged bridge.", "Conjunctive adverbs like therefore and consequently show a cause-and-result relationship.")

dd("adverbs", "L.6.1", 3, "Choose the conjunctive adverb: “The hikers packed extra water; ____, they brought a first-aid kit.”",
   "moreover", [("however", "This shows contrast, but the second idea simply adds to the first."), ("meanwhile", "This shows two events at the same time, not an added idea."), ("otherwise", "This shows an alternative result, not an added idea.")],
   "“Moreover” adds another piece of information to the first idea.", "Conjunctive adverbs like moreover and furthermore add a related idea.")

mc("adverbs", "L.6.1", 3, "Which conjunctive adverb correctly completes this contrast? “The forecast predicted storms; ____, the sky stayed clear all day.”",
   "nevertheless", [("therefore", "This shows a result, not an unexpected contrast."), ("furthermore", "This adds information, not a contrast."), ("meanwhile", "This shows events happening at the same time, not a contrast.")],
   "“Nevertheless” shows the clear sky happened despite the stormy forecast.", "Conjunctive adverbs like nevertheless show an unexpected contrast.")

dd("adverbs", "L.6.1", 4, "Choose the conjunctive adverb: “The team practiced every morning; ____, they studied game film every night.”",
   "furthermore", [("however", "This shows contrast, but the second idea adds to the first."), ("otherwise", "This shows an alternative result, not an added idea."), ("meanwhile", "This shows events at the same time, but here one activity follows the other.")],
   "“Furthermore” adds another detail to the team’s routine.", "Furthermore and moreover both signal an additional, related idea.")

mc("adverbs", "L.6.1", 4, "Which conjunctive adverb correctly shows two things happening at the same time? “The chef prepared dessert; ____, the waiter set the tables.”",
   "meanwhile", [("therefore", "This shows a result, not two events at the same time."), ("nevertheless", "This shows contrast, not simultaneous action."), ("furthermore", "This adds information rather than showing timing.")],
   "“Meanwhile” shows the two actions happening during the same period of time.", "Meanwhile signals that two events are happening at once.")

err("adverbs", "L.6.1", 5, ["The bridge was closed", ", however", " traffic flowed smoothly on the detour."], 1, "; however,",
    "A conjunctive adverb joining two independent clauses needs a semicolon before it and a comma after it.",
    "Conjunctive adverbs like however, therefore, and moreover use a semicolon, then the adverb, then a comma.")

mc("adverbs", "L.6.1", 5, "Which sentence correctly uses the conjunctive adverb “otherwise”?",
   "Finish your homework now; otherwise, you will have no free time later.",
   [("Finish your homework now, otherwise you will have no free time later.", "A conjunctive adverb joining two clauses needs a semicolon before it, not just a comma."),
    ("Finish your homework now; otherwise you will have no free time later.", "A comma is needed after a conjunctive adverb like otherwise."),
    ("Finish your homework now otherwise, you will have no free time later.", "A semicolon is needed before the conjunctive adverb.")],
   "“Otherwise” shows the result if the homework is not finished, properly punctuated with a semicolon and comma.",
   "Otherwise usually introduces a warning about what happens if something is not done.")

dd("adverbs", "L.6.1", 6, "Choose the conjunctive adverb: “The power went out across the city; ____, the hospital’s backup generators turned on.”",
   "consequently", [("meanwhile", "This shows timing, not a cause-and-result relationship."), ("nevertheless", "This shows contrast, not a result."), ("moreover", "This adds information rather than showing a result.")],
   "“Consequently” shows the generators turning on was a direct result of the power outage.", "Consequently signals that the second clause is a direct effect of the first.")

mc("adverbs", "L.6.1", 7, "Which word is a sentence adverb that comments on the whole sentence? “Surprisingly, the smallest player scored the winning goal.”",
   "Surprisingly", [("smallest", "This is an adjective describing “player.”"), ("player", "This is a noun."), ("scored", "This is the verb.")],
   "“Surprisingly” comments on the entire event, not on a single word in the sentence.", "A sentence adverb at the start of a sentence, set off by a comma, describes the whole idea that follows.")

# ================================================================== sentences
grade(4)

mc("sentences", "L.4.1", 1, "Which sentence is an interrogative sentence (asks a question)?",
   "What time does the bus leave?",
   [("The bus leaves at eight.", "This sentence makes a statement, so it is declarative."),
    ("Wait for the bus here.", "This sentence gives a command, so it is imperative."),
    ("What a long wait that was!", "This sentence shows strong feeling, so it is exclamatory.")],
   "An interrogative sentence asks a question and ends with a question mark.", "Interrogative sentences usually begin with words like what, who, when, or do.")

mc("sentences", "L.4.1", 1, "Which sentence is an imperative sentence (gives a command)?",
   "Please hand me the scissors.",
   [("Could you hand me the scissors?", "This sentence asks a question, so it is interrogative."),
    ("I need the scissors now.", "This sentence makes a statement, so it is declarative."),
    ("Those scissors are so sharp!", "This sentence shows strong feeling, so it is exclamatory.")],
   "An imperative sentence gives a command or makes a request.", "Imperative sentences often begin with the verb itself, as if “you” is understood.")

mc("sentences", "L.4.1", 2, "Which sentence is an exclamatory sentence?",
   "What a wonderful surprise this is!",
   [("This is a wonderful surprise.", "This sentence simply states a fact, so it is declarative."),
    ("Is this a wonderful surprise?", "This sentence asks a question, so it is interrogative."),
    ("Tell me about the surprise.", "This sentence gives a command, so it is imperative.")],
   "An exclamatory sentence shows strong feeling and ends with an exclamation point.", "Exclamatory sentences often begin with “what” or “how” and express excitement.")

mc("sentences", "L.4.1", 2, "Which sentence is a declarative sentence?",
   "The bakery opens at seven o’clock.",
   [("Does the bakery open at seven?", "This sentence asks a question, so it is interrogative."),
    ("Open the bakery at seven!", "This sentence gives a strong command, so it is imperative."),
    ("What an early opening time!", "This sentence shows strong feeling, so it is exclamatory.")],
   "A declarative sentence simply states a fact and ends with a period.", "Most everyday sentences that tell information are declarative.")

match("sentences", "L.4.1", 3, "Match each sentence with the way it begins.",
      [("Across the yard, the dog barked loudly.", "begins with a prepositional phrase"),
       ("Barking loudly, the dog ran across the yard.", "begins with a participial phrase"),
       ("The dog barked loudly across the yard.", "begins with the subject"),
       ("Loudly, the dog barked across the yard.", "begins with an adverb")],
      "Writers vary how a sentence begins to make their writing more interesting.", "Look at the very first word or phrase to tell how a sentence begins.")

mc("sentences", "L.4.1", 3, "Which sentence has a compound SUBJECT?",
   "Sara and Tom washed the car together.",
   [("Sara washed and waxed the car together.", "This sentence has one subject but two verbs, so it has a compound predicate."),
    ("Sara washed the car and the bike.", "This sentence has one subject and one verb with two objects."),
    ("Sara washed the car carefully and quickly.", "This sentence has one subject, one verb, and two adverbs.")],
   "“Sara and Tom” are two subjects joined by “and,” making a compound subject.", "A compound subject has two or more subjects doing the same action.")

mc("sentences", "L.4.1", 4, "Which sentence has a compound PREDICATE?",
   "The cat stretched and yawned in the sun.",
   [("The cat and the dog slept in the sun.", "This sentence has two subjects joined by “and,” so it has a compound subject."),
    ("The sleepy cat stretched in the sun.", "This sentence has only one verb, “stretched.”"),
    ("The cat stretched in the warm, bright sun.", "This sentence has only one verb and two adjectives.")],
   "“Stretched” and “yawned” are two verbs joined by “and,” making a compound predicate.", "A compound predicate has two or more verbs for the same subject.")

err("sentences", "L.4.1", 4, ["What a thrilling race that was", "."], 1, "!",
    "An exclamatory sentence expresses strong feeling and should end with an exclamation point, not a period.",
    "Look for words like “what” or “how” at the start of a sentence as a clue it is exclamatory.")

mc("sentences", "L.4.1", 5, "Which sentence begins with a dependent clause followed by a comma?",
   "After the storm passed, the farmers inspected their fields.",
   [("The farmers inspected their fields after the storm passed.", "This sentence ends with the dependent clause, so no comma is needed before it."),
    ("The farmers, after the storm passed, inspected their fields.", "The dependent clause interrupts the sentence instead of beginning it."),
    ("After the storm the farmers inspected their fields passed.", "This sentence is scrambled and does not make sense.")],
   "“After the storm passed” is a dependent clause at the start of the sentence, so it needs a comma after it.",
   "When a sentence starts with a clause beginning with a word like after, because, or when, add a comma after the clause.")

mc("sentences", "L.4.1", 6, "Which sentence begins with a participial phrase?",
   "Eager to win, the twins practiced every afternoon.",
   [("The twins practiced every afternoon because they were eager to win.", "This sentence begins with the subject, not a participial phrase."),
    ("The twins, eager to win, practiced every afternoon.", "The phrase interrupts the sentence instead of beginning it."),
    ("Every afternoon, the twins practiced because they wanted to win.", "This sentence begins with a short adverb phrase, not a participial phrase.")],
   "“Eager to win” describes the twins and comes before the subject, making it a participial phrase opener.",
   "A sentence that opens by describing the subject, followed by a comma, often begins with a participial phrase.")

mc("sentences", "L.4.1", 7, "Which sentence begins with an adjective phrase describing the subject?",
   "Determined and focused, the climbers reached the summit before noon.",
   [("The climbers reached the summit before noon because they were determined.", "This sentence begins with the subject, not a describing phrase."),
    ("The climbers, determined and focused, reached the summit before noon.", "The describing phrase interrupts the sentence instead of beginning it."),
    ("Before noon, the determined climbers reached the summit.", "This sentence begins with a time phrase, not an adjective phrase describing the subject.")],
   "“Determined and focused” describes the climbers and opens the sentence, set off by a comma.",
   "When describing words about the subject open a sentence, they are usually followed by a comma.")

grade(5)

mc("sentences", "L.5.1", 1, "Which sentence is a compound sentence?",
   "The rain stopped, and the sun came out.",
   [("The rain stopped, the sun came out.", "Two independent clauses joined only by a comma form a comma splice, not a correct compound sentence."),
    ("The rain stopped and the sun came out.", "Without a comma before “and,” this reads as a simple sentence with a compound predicate."),
    ("After the rain stopped, the sun came out.", "This sentence has one independent clause and one dependent clause, making it complex.")],
   "Two independent clauses joined by a comma and a coordinating conjunction form a compound sentence.",
   "Check for two complete sentences joined by a comma plus a word like and, but, or or.")

mc("sentences", "L.5.1", 2, "Which sentence is a complex sentence?",
   "Because the bridge was icy, drivers slowed down.",
   [("The bridge was icy, so drivers slowed down.", "This sentence joins two independent clauses with a comma and conjunction, making it compound."),
    ("The icy bridge made drivers slow down.", "This sentence has only one independent clause and no dependent clause."),
    ("Drivers slowed down, and the bridge was icy.", "This sentence joins two independent clauses, making it compound.")],
   "A dependent clause (“Because the bridge was icy”) joined to an independent clause makes this a complex sentence.",
   "Look for a clause starting with a word like because, although, or when joined to a complete sentence.")

mc("sentences", "L.5.1", 2, "Which sentence has a compound predicate?",
   "The gardener watered the plants and trimmed the hedges.",
   [("The gardener and the assistant worked in the yard.", "This sentence has two subjects joined by “and,” making a compound subject."),
    ("The careful gardener watered the plants.", "This sentence has only one verb, “watered.”"),
    ("The gardener watered the tall, green plants.", "This sentence has only one verb and two adjectives.")],
   "“Watered” and “trimmed” are two verbs for the same subject, making a compound predicate.", "A compound predicate has two or more verbs joined by a conjunction.")

match("sentences", "L.5.1", 3, "Match each example with its sentence structure.",
      [("The dog barked.", "Simple"),
       ("The dog barked, and the cat ran.", "Compound"),
       ("Because it rained, the game was postponed.", "Complex"),
       ("Because it rained, the game was postponed, but the fans stayed anyway.", "Compound-complex")],
      "Sentence structure depends on how many independent and dependent clauses a sentence has.",
      "Count the independent clauses, then check for any dependent clauses, to name the structure.")

mc("sentences", "L.5.1", 3, "Which sentence correctly uses an appositive to rename the subject?",
   "My uncle, a retired pilot, now teaches flying lessons.",
   [("My uncle a retired pilot now teaches flying lessons.", "An appositive needs commas on both sides to set it off."),
    ("My uncle, a retired pilot now teaches flying lessons.", "A second comma is needed after the appositive, before the verb."),
    ("My uncle a retired pilot, now teaches flying lessons.", "A comma is needed before the appositive, not only after it.")],
   "“A retired pilot” renames “my uncle” and is set off by a comma on each side.", "An appositive is extra information about a noun, framed by a pair of commas.")

err("sentences", "L.5.1", 4, ["The museum was crowded", " we still enjoyed every exhibit."], 0, "The museum was crowded, but",
    "Two independent clauses need a comma and a conjunction between them, not just a comma.",
    "A comma alone cannot join two complete sentences; add a coordinating conjunction after it.")

mc("sentences", "L.5.1", 5, "Which sentence uses a noun clause as its subject?",
   "Whoever finishes first will choose the game.",
   [("The fastest runner will choose the game.", "This sentence has a simple noun phrase as its subject, not a noun clause."),
    ("The winner will choose the game first.", "This sentence has a simple noun phrase as its subject, not a noun clause."),
    ("First, someone will choose the game.", "This sentence has a simple pronoun as its subject, not a noun clause.")],
   "“Whoever finishes first” is a clause acting as the subject of the sentence.", "A noun clause can act like a noun, serving as the subject or object of a sentence.")

mc("sentences", "L.5.1", 5, "Which sentence correctly uses a nonrestrictive clause with commas?",
   "The bakery, which opened last spring, sells fresh bread daily.",
   [("The bakery which opened last spring sells fresh bread daily.", "A nonrestrictive clause needs commas on both sides to set it off."),
    ("The bakery, which opened last spring sells fresh bread daily.", "A second comma is needed after the clause, before the verb."),
    ("The bakery which opened last spring, sells fresh bread daily.", "A comma is needed before the clause as well, not only after it.")],
   "“Which opened last spring” adds extra, non-essential information and is set off by commas.",
   "A clause beginning with which that adds extra detail (not needed to identify the noun) uses commas on both sides.")

order("sentences", "L.5.1", 6, "Arrange the clauses to form one clear complex sentence.",
      ["Although it was raining,", "the children", "played outside."],
      "A dependent clause beginning with “although” is followed by a comma, then the subject and predicate.",
      "A clause like “although it was raining” cannot stand alone, so it leans on the main clause that follows.")

mc("sentences", "L.5.1", 7, "Which sentence uses inverted word order for emphasis in a compound-complex sentence?",
   "Not only did the team win, but they also broke the record.",
   [("The team won, and they also broke the record.", "This sentence does not use the inverted “not only…but also” structure for emphasis."),
    ("The team not only won but also they broke the record.", "The word order after “but also” is scrambled; the subject should come first."),
    ("Did the team win, but they also broke the record.", "This begins like a question but does not form a correct sentence.")],
   "“Not only did the team win” inverts the usual subject-verb order for emphasis, paired with “but also.”",
   "The pattern “not only…but also” often flips the subject and verb in its first part for emphasis.")

grade(6)

mc("sentences", "L.6.1", 2, "Which sentence begins with an infinitive phrase?",
   "To save time, the team ordered lunch online.",
   [("The team ordered lunch online to save time.", "This sentence ends with the infinitive phrase, so it does not begin with one."),
    ("The team, to save time, ordered lunch online.", "The infinitive phrase interrupts the sentence instead of beginning it."),
    ("Saving time, the team ordered lunch online.", "This sentence begins with a participial phrase, not an infinitive phrase.")],
   "“To save time” is an infinitive phrase that opens the sentence, set off by a comma.",
   "An infinitive phrase begins with “to” plus a verb and often explains a purpose.")

mc("sentences", "L.6.1", 2, "Which sentence begins with a participial phrase?",
   "Collecting shells, the children wandered along the shore.",
   [("The children wandered along the shore collecting shells.", "This sentence ends with the participial phrase, so it does not begin with one."),
    ("The children, collecting shells, wandered along the shore.", "The phrase interrupts the sentence instead of beginning it."),
    ("To collect shells, the children wandered along the shore.", "This sentence begins with an infinitive phrase, not a participial phrase.")],
   "“Collecting shells” describes the children and opens the sentence, set off by a comma.",
   "A participial phrase opener usually ends in -ing or -ed and is followed by a comma.")

mc("sentences", "L.6.1", 3, "Which sentence is a compound sentence with sophisticated vocabulary?",
   "The orchestra tuned their instruments, and the audience grew quiet with anticipation.",
   [("The orchestra tuned their instruments and the audience grew quiet.", "Without a comma before “and,” joining two independent clauses this way is a run-on."),
    ("The orchestra tuned their instruments, the audience grew quiet.", "Two independent clauses joined only by a comma form a comma splice."),
    ("Tuning their instruments, the orchestra made the audience grow quiet.", "This sentence has only one independent clause, making it simple, not compound.")],
   "Two independent clauses joined correctly by a comma and “and” make this a compound sentence.",
   "A compound sentence needs a comma and a coordinating conjunction between two complete sentences.")

mc("sentences", "L.6.1", 3, "Which sentence is a complex sentence with an unexpected contrast?",
   "Although she was exhausted, Layla finished the marathon with a smile.",
   [("Layla was exhausted, but she finished the marathon with a smile.", "This sentence joins two independent clauses, making it compound."),
    ("Layla finished the marathon with a smile despite being exhausted.", "This has one independent clause and a prepositional phrase, not a dependent clause with “although.”"),
    ("Exhausted, Layla still finished the marathon with a smile.", "This sentence opens with a single adjective, not a dependent clause.")],
   "The dependent clause “Although she was exhausted” joined to an independent clause makes this a complex sentence.",
   "Clauses beginning with although or though signal an unexpected contrast in a complex sentence.")

mc("sentences", "L.6.1", 4, "Which sentence uses parallel structure correctly in a series of verbs?",
   "The scientist recorded her data, analyzed the results, and presented her findings.",
   [("The scientist recorded her data, analyzing the results, and presented her findings.", "The verb forms do not match; “analyzing” breaks the parallel pattern."),
    ("The scientist recorded her data, analyzed the results, and to present her findings.", "“To present” does not match the other two past-tense verbs."),
    ("The scientist, recording her data, analyzed the results, and presented her findings.", "The first verb form does not match the other two in the series.")],
   "All three verbs (recorded, analyzed, presented) use the same past-tense form, keeping the series parallel.",
   "Check that every item in a series uses the same grammatical form.")

match("sentences", "L.6.1", 4, "Match each example with its sentence structure.",
      [("The wind blew.", "Simple"),
       ("The wind blew, and the leaves scattered.", "Compound"),
       ("Although the wind blew, the kite stayed up.", "Complex"),
       ("Although the wind blew, the kite stayed up, and the children cheered.", "Compound-complex")],
      "Sentence structure depends on how many independent and dependent clauses a sentence has.",
      "Count the independent clauses first, then look for any dependent clauses, to name the structure.")

err("sentences", "L.6.1", 5, ["The coach wanted the players to run faster,", " jump higher,", " and showing more effort."], 2, " and show more effort.",
    "Parallel structure requires the same verb form in a series: run, jump, show.",
    "Check that every item in a list uses the same grammatical form as the others.")

mc("sentences", "L.6.1", 5, "Which sentence begins with a perfect participial phrase?",
   "Having finished her homework, Mona watched a movie.",
   [("Mona watched a movie after she finished her homework.", "This sentence begins with the subject, not a participial phrase."),
    ("Mona, having finished her homework, watched a movie.", "The phrase interrupts the sentence instead of beginning it."),
    ("Finishing her homework, Mona later watched a movie.", "This uses a simple participial phrase, not the perfect form “having finished.”")],
   "“Having finished her homework” is a perfect participial phrase showing an action completed before the main action.",
   "The pattern “having + past participle” shows one action finished before another begins.")

order("sentences", "L.6.1", 6, "Arrange the clauses to form one clear compound-complex sentence.",
      ["Because the storm knocked out power,", "the neighbors gathered candles,", "and everyone shared a quiet dinner by candlelight."],
      "This sentence has a dependent clause followed by two independent clauses joined by “and,” making it compound-complex.",
      "A compound-complex sentence has at least one dependent clause and two independent clauses.")

mc("sentences", "L.6.1", 7, "Which sentence is a compound-complex sentence with a strong opening phrase?",
   "Exhausted but triumphant, the climbers finally reached the summit as the sun began to set.",
   [("The climbers were exhausted but triumphant when they reached the summit.", "This sentence has one independent clause and one dependent clause, making it complex, not compound-complex."),
    ("The climbers reached the summit, and the sun began to set.", "This sentence has two independent clauses but no dependent clause, making it compound, not compound-complex."),
    ("Exhausted but triumphant, the climbers reached the summit, and they celebrated.", "The second clause lacks a dependent clause like “as the sun began to set.”")],
   "This sentence has an opening descriptive phrase, an independent clause, and a dependent clause beginning with “as,” making it compound-complex.",
   "Look for a describing opener, at least one independent clause, and a dependent clause together.")

# ================================================================== compound-sentences
grade(4)

dd("compound-sentences", "L.4.1", 1, "Choose the conjunction: “I packed my bag, ____ my brother packed his.”",
   "and", [("so", "“So” would mean the second action was a result of the first, which does not fit here."),
           ("but", "“But” signals a contrast, but both brothers are doing the same thing."),
           ("or", "“Or” signals a choice, but both actions are happening.")],
   "“And” joins two similar actions happening together.", "Use “and” to join two ideas that go together.")

dd("compound-sentences", "L.4.1", 2, "Choose the conjunction: “She wore a coat, ____ the morning was cold.”",
   "for", [("but", "“But” signals a contrast, but the coat and the cold morning go together."),
           ("or", "“Or” signals a choice, not a reason."),
           ("yet", "“Yet” signals a contrast, but this sentence gives a reason instead.")],
   "“For” means “because” here, giving the reason she wore a coat.", "“For” can join two clauses when the second clause explains why.")

mc("compound-sentences", "L.4.1", 2, "Which sentence is a compound sentence?",
   "The kite soared high, and the children cheered.",
   [("The kite soared high in the breezy sky.", "This sentence has only one independent clause, so it is simple."),
    ("The kite, soaring high, delighted the children.", "This sentence has only one independent clause, so it is simple."),
    ("Soaring high, the kite delighted the cheering children.", "This sentence has only one independent clause, so it is simple.")],
   "Two independent clauses joined by a comma and “and” make this a compound sentence.", "Check for two complete sentences joined by a comma plus a conjunction like and, but, or or.")

mc("compound-sentences", "L.4.1", 3, "Which sentence places the comma correctly in a compound sentence?",
   "Nour fed the chickens, and Adam collected the eggs.",
   [("Nour fed the chickens and, Adam collected the eggs.", "The comma belongs right before the conjunction, not after it."),
    ("Nour fed the chickens and Adam, collected the eggs.", "The comma is in the wrong place; it should come before “and.”"),
    ("Nour fed the chickens, and, Adam collected the eggs.", "There should be only one comma, placed before “and.”")],
   "The comma goes right before the coordinating conjunction that joins the two independent clauses.", "In a compound sentence, the comma always comes right before the conjunction.")

err("compound-sentences", "L.4.1", 3, ["The bell rang", " and", " the students lined up quickly."], 0, "The bell rang,",
    "A compound sentence needs a comma before the coordinating conjunction that joins its two independent clauses.",
    "Always place a comma right before and, but, or, so, for, nor, or yet when joining two complete sentences.")

mc("compound-sentences", "L.4.1", 4, "Which sentence is a compound sentence that includes a question?",
   "Would you like tea, or do you prefer juice?",
   [("Would you like tea or juice?", "This sentence has one independent clause with a choice of two nouns, so it is simple."),
    ("Do you prefer tea, juice, or water?", "This sentence has one independent clause with a list of choices, so it is simple."),
    ("Tea or juice, which do you prefer?", "This sentence does not join two complete independent clauses with a conjunction.")],
   "Two independent questions joined by a comma and “or” make this a compound sentence.", "A compound sentence can be made of two questions, two statements, or a mix.")

tf("compound-sentences", "L.4.1", 4, "“I called my friend, but she did not answer,” is a compound sentence.", True,
   "Two independent clauses are joined by a comma and the conjunction “but.”", "Check for two complete sentences joined by a comma plus a conjunction.")

mc("compound-sentences", "L.4.1", 5, "Which sentence best combines these two sentences? “Hassan likes soccer. His sister likes basketball.”",
   "Hassan likes soccer, but his sister likes basketball.",
   [("Hassan likes soccer his sister likes basketball.", "Two independent clauses need a comma and a conjunction between them, not nothing."),
    ("Hassan likes soccer, his sister likes basketball.", "A comma alone cannot join two independent clauses; a conjunction is needed too."),
    ("Hassan likes soccer and his sister likes basketball.", "Without a comma before “and,” this reads incorrectly as one long clause.")],
   "“But” shows the contrast between the two siblings’ favorite sports, joined correctly with a comma.", "Choose a conjunction that matches the relationship between the two ideas, then add a comma before it.")

mc("compound-sentences", "L.4.1", 6, "Which sentence correctly uses a comma and a coordinating conjunction to join two independent clauses?",
   "The lights flickered, so we lit a candle.",
   [("The lights flickered so we lit a candle.", "A comma is missing before the coordinating conjunction “so.”"),
    ("The lights flickered, so, we lit a candle.", "Only one comma is needed, placed before “so,” not after it too."),
    ("The lights flickered so, we lit a candle.", "The comma belongs before “so,” not after it.")],
   "The comma before “so” correctly joins the two independent clauses in this compound sentence.", "A coordinating conjunction joining two complete sentences always needs a comma right before it.")

grade(5)

mc("compound-sentences", "L.5.1.a", 1, "Which sentence correctly uses the correlative conjunction pair “either…or”?",
   "Either you finish your chores, or you lose your screen time.",
   [("Either you finish your chores, and you lose your screen time.", "“Either” must be paired with “or,” not “and.”"),
    ("Either you finish your chores, or, you lose your screen time.", "Only one comma is needed in this sentence, not two."),
    ("Either you finish your chores or you lose, your screen time.", "The comma is placed in the wrong spot; it belongs before “or.”")],
   "“Either” correctly pairs with “or” to show two possible outcomes.", "Correlative conjunctions come in matching pairs, like either/or and neither/nor.")

mc("compound-sentences", "L.5.1.a", 2, "Which sentence correctly uses the correlative conjunction pair “both…and”?",
   "Both the teacher and the principal praised the project.",
   [("Both the teacher but also the principal praised the project.", "“Both” must be paired with “and,” not “but also.”"),
    ("Both the teacher or the principal praised the project.", "“Both” must be paired with “and,” not “or.”"),
    ("Both the teacher, and the principal praised the project.", "No comma is needed between “teacher” and “and” in this short pair.")],
   "“Both” correctly pairs with “and” to show two people doing the same thing.", "Correlative conjunctions must be used in their matching pairs to be correct.")

mc("compound-sentences", "L.5.1.a", 2, "Which sentence correctly joins two independent clauses with a semicolon?",
   "The storm knocked out power; the neighbors shared flashlights.",
   [("The storm knocked out power, the neighbors shared flashlights.", "A comma alone cannot join two independent clauses without a conjunction; use a semicolon instead."),
    ("The storm knocked out power; and the neighbors shared flashlights.", "A semicolon already joins the clauses, so the conjunction “and” is not needed too."),
    ("The storm knocked out power: the neighbors shared flashlights.", "A colon is not used to join two closely related independent clauses this way; use a semicolon.")],
   "A semicolon can join two closely related independent clauses without a conjunction.", "Use a semicolon when two complete sentences are closely related and you do not want to use a conjunction.")

err("compound-sentences", "L.5.1.a", 3, ["The road was flooded", " drivers took", " a different route."], 0, "The road was flooded;",
    "Two independent clauses with no conjunction between them need a semicolon, not just a space or a comma.",
    "If you can split a sentence into two complete sentences with no joining word, use a semicolon.")

mc("compound-sentences", "L.5.1.a", 4, "Which sentence correctly uses the correlative conjunction pair “whether…or”?",
   "Whether you choose pasta or rice, dinner will be ready soon.",
   [("Whether you choose pasta and rice, dinner will be ready soon.", "“Whether” must be paired with “or,” not “and.”"),
    ("Whether you choose pasta, or rice, dinner will be ready soon.", "No comma is needed between “pasta” and “or” in this short phrase."),
    ("Whether you choose pasta or rice dinner will be ready soon.", "A comma is needed after the introductory clause, before “dinner.”")],
   "“Whether” correctly pairs with “or” to present a choice.", "Correlative conjunctions like whether/or must appear together as a matching pair.")

match("compound-sentences", "L.5.1.a", 4, "Match each pair of correlative conjunctions with the sentence that uses it correctly.",
      [("either...or", "Either we walk or we take the bus."),
       ("neither...nor", "Neither the cat nor the dog made a sound."),
       ("not only...but also", "Not only did she sing, but she also danced."),
       ("both...and", "Both my parents and my grandparents came.")],
      "Correlative conjunctions work in matching pairs to connect related ideas.", "Memorize the pairs together: either/or, neither/nor, both/and, not only/but also.")

mc("compound-sentences", "L.5.1.a", 5, "Which correlative conjunction pair is used in this sentence? “Not only was the cake delicious, but it was also beautiful.”",
   "not only...but also", [("either...or", "This pair is not used in the sentence; the sentence shows two true things, not a choice."),
                            ("neither...nor", "This pair would show two negative things, but the sentence describes two positive qualities."),
                            ("both...and", "This pair is a close match in meaning, but the exact words used are “not only” and “but also.”")],
   "The sentence uses the matching pair “not only…but also” to add a second surprising quality.", "Look for the exact matching words of a correlative pair, not just a similar meaning.")

mc("compound-sentences", "L.5.1.a", 6, "Which sentence best combines these ideas using a semicolon and a conjunctive adverb?",
   "The ferry was delayed; however, the passengers remained calm.",
   [("The ferry was delayed, however the passengers remained calm.", "A semicolon, not a comma, is needed before a conjunctive adverb joining two independent clauses."),
    ("The ferry was delayed; however the passengers remained calm.", "A comma is needed after the conjunctive adverb “however.”"),
    ("The ferry was delayed however, the passengers remained calm.", "A semicolon is needed before the conjunctive adverb, not just a comma after it.")],
   "A semicolon before “however” and a comma after it correctly join these two independent clauses.", "Conjunctive adverbs joining two complete sentences need a semicolon before and a comma after.")

grade(6)

mc("compound-sentences", "L.6.2", 2, "Which sentence correctly joins two related independent clauses with a semicolon?",
   "The experiment failed twice; the third attempt finally worked.",
   [("The experiment failed twice, the third attempt finally worked.", "A comma alone cannot join two independent clauses without a conjunction; use a semicolon instead."),
    ("The experiment failed twice; and the third attempt finally worked.", "A semicolon already joins the clauses, so the conjunction “and” is unnecessary."),
    ("The experiment failed twice: the third attempt finally worked.", "A colon is not the right mark for joining two closely related independent clauses this way.")],
   "A semicolon can join two closely related independent clauses without a conjunction.", "Use a semicolon when two complete, related sentences do not need a conjunction between them.")

err("compound-sentences", "L.6.2", 2, ["The council debated the plan", " for hours", " they could not agree."], 2, " but they could not agree.",
    "Two independent clauses need a comma and a coordinating conjunction between them, not just a comma or nothing.",
    "If a sentence has two complete ideas with no joining word, add a comma and a conjunction like but or so.")

mc("compound-sentences", "L.6.2", 3, "Which sentence correctly uses a semicolon with a conjunctive adverb to show sequence?",
   "The director explained the schedule; then the cast rehearsed the final scene.",
   [("The director explained the schedule, then the cast rehearsed the final scene.", "A comma alone is not strong enough to join two independent clauses; use a semicolon instead."),
    ("The director explained the schedule; then, the cast rehearsed the final scene.", "No comma is needed right after “then” in this short conjunctive adverb."),
    ("The director explained the schedule: then the cast rehearsed the final scene.", "A colon is not the right mark for joining two independent clauses this way.")],
   "A semicolon correctly joins the two independent clauses, with “then” showing the order of events.", "A semicolon can join two related independent clauses, sometimes followed by a short time word like then.")

dd("compound-sentences", "L.6.2", 3, "Choose the conjunction: “The bridge was closed, ____ engineers worked through the night to repair it.”",
   "so", [("yet", "“Yet” signals a contrast, but the engineers’ work is a result of the closure."),
          ("nor", "“Nor” is used to add a second negative idea, which does not fit here."),
          ("for", "“For” gives a reason, but this sentence shows a result instead.")],
   "“So” shows that the repair work happened as a result of the bridge closure.", "Use “so” to join a cause with its result.")

mc("compound-sentences", "L.6.2", 4, "Which sentence correctly joins two independent clauses with a semicolon and added description?",
   "The hikers reached the summit; exhausted but proud, they admired the view.",
   [("The hikers reached the summit, exhausted but proud, they admired the view.", "A comma alone cannot join two independent clauses; a semicolon is needed here."),
    ("The hikers reached the summit; exhausted but proud they admired the view.", "A comma is needed after the descriptive phrase “exhausted but proud.”"),
    ("The hikers reached the summit: exhausted but proud, they admired the view.", "A colon is not the right mark for joining two independent clauses this way.")],
   "A semicolon joins the two independent clauses, and a comma sets off the descriptive phrase that follows.", "A semicolon can join two independent clauses even when the second one begins with a describing phrase.")

match("compound-sentences", "L.6.2", 5, "Match each coordinating conjunction with the relationship it usually shows.",
      [("and", "adds an idea"), ("but", "shows contrast"), ("so", "shows result"), ("for", "shows reason")],
      "Each coordinating conjunction signals a different relationship between two clauses.", "Memorize FANBOYS (for, and, nor, but, or, yet, so) along with what each one signals.")

err("compound-sentences", "L.6.2", 6, ["The negotiations stalled", " nevertheless", " both sides kept talking."], 1, "; nevertheless,",
    "A conjunctive adverb joining two independent clauses needs a semicolon before it and a comma after it.",
    "Conjunctive adverbs like nevertheless, however, and therefore use a semicolon, then the adverb, then a comma.")

mc("compound-sentences", "L.6.2", 7, "Which revision best combines these ideas into one compound-complex sentence? “The lab results came back. They were inconclusive. The team repeated the test.”",
   "The lab results came back, but they were inconclusive; the team repeated the test.",
   [("The lab results came back. They were inconclusive, so the team repeated the test.", "This keeps two separate sentences instead of combining all three ideas into one sentence."),
    ("The lab results came back but they were inconclusive the team repeated the test.", "This is missing the needed comma before “but” and the semicolon between the last two clauses."),
    ("The lab results came back, they were inconclusive, the team repeated the test.", "Joining three independent clauses with only commas creates comma splices.")],
   "A comma and “but” join the first two clauses, and a semicolon joins the third, correctly combining all three ideas.",
   "A compound-complex combination can use a conjunction for one join and a semicolon for another.")
