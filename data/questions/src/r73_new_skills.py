"""
r73 (owner): two new skills with 100 original MAP-style questions each.

  1. Complex and Compound-Complex Sentences            (Language Usage · Grammar and Usage · L.{g}.1)
  2. Point of View: First, Second, Third Limited, Third Omniscient   (Reading · Literary Text · RL.{g}.6)

Every skill is split the MAP way into five RIT bands of 20 questions (easiest first). A question's band comes from
the grade it was written for + its Below / On / Above level, read on the RIT scale by the loader
(src/server/questions/bank-scope.ts → ritOf):

  181–190  Grade 3 Below (183) · Grade 3 On (188)
  191–200  Grade 4 Below (194) · Grade 4 On (199)
  201–210  Grade 4 Above (204) · Grade 5 On (206)
  211–220  Grade 6 On (211)    · Grade 6 Above (216)
  221–230  Grade 8 Above (222) · Grade 9 Above (224)

Run:  python3 data/questions/src/r73_new_skills.py   →  data/questions/sets/new-skill-sets.json
Answer positions are balanced by the script (the correct choice is written first here, then placed).
"""
import json
import os
import random

BANDS = [
    ("181-190", [("BELOW", 3), ("ON", 3)], 1),
    ("191-200", [("BELOW", 4), ("ON", 4)], 1),
    ("201-210", [("ABOVE", 4), ("ON", 5)], 2),
    ("211-220", [("ON", 6), ("ABOVE", 6)], 2),
    ("221-230", [("ABOVE", 8), ("ABOVE", 9)], 3),
]
L = "ABCDEFGH"


# ------------------------------------------------------------------ authoring helpers (the right answer first)

def mc(stem, right, wrong, why, passage=None, title=None):
    return {"t": "MULTIPLE_CHOICE", "stem": stem, "right": right, "wrong": wrong, "why": why, "passage": passage, "title": title}


def dd(stem, right, wrong, why, passage=None, title=None):
    return {"t": "DROPDOWN", "stem": stem, "right": right, "wrong": wrong, "why": why, "passage": passage, "title": title}


def ms(stem, rights, wrongs, why, passage=None, title=None):
    return {"t": "MULTI_SELECT", "stem": stem, "rights": rights, "wrongs": wrongs, "why": why, "passage": passage, "title": title}


def ht(stem, segments, correct, why, passage=None, title=None):
    return {"t": "HOT_TEXT", "stem": stem, "segments": segments, "correct": correct, "why": why, "passage": passage, "title": title}


def grid(stem, cols, rows, why, passage=None, title=None):
    """rows: [(text, column index)]"""
    return {"t": "GRID", "stem": stem, "cols": cols, "rows": rows, "why": why, "passage": passage, "title": title}


def tf(stem, answer, why, passage=None, title=None):
    return {"t": "TRUE_FALSE", "stem": stem, "answer": answer, "why": why, "passage": passage, "title": title}


def ec(stem, segments, index, correction, why):
    return {"t": "ERROR_CORRECTION", "stem": stem, "segments": segments, "index": index, "correction": correction, "why": why, "passage": None, "title": None}


def tp(a_stem, a_right, a_wrong, b_stem, b_right, b_wrong, why, passage=None, title=None):
    return {"t": "TWO_PART", "stem": a_stem, "a": (a_stem, a_right, a_wrong), "b": (b_stem, b_right, b_wrong), "why": why, "passage": passage, "title": title}


# ================================================================== 1. Complex and Compound-Complex Sentences

CS = [
    # ---------------- 181–190: clauses, subordinating conjunctions (Grade 3 Below ×10, Grade 3 On ×10)
    [
        mc("A clause has a subject and a verb. Which group of words is an independent clause that can stand alone as a sentence?",
           "The falcon flew over the dunes", ["When the falcon flew over the dunes", "Because the falcon was so hungry", "Over the dunes in the early morning"],
           "It has a subject (the falcon) and a verb (flew), and it makes sense by itself."),
        mc("Which word in this sentence is a subordinating conjunction, a word that starts a dependent clause? “We stayed inside because the wind was strong.”",
           "because", ["stayed", "inside", "wind"],
           "Because starts the dependent clause “because the wind was strong.”"),
        mc("Which group of words is a dependent clause? It has a subject and a verb, but it cannot stand alone.",
           "after Huda finished her homework", ["Huda finished all of her homework", "her homework on the table", "finished quickly and neatly"],
           "“After Huda finished her homework” has a subject and a verb, but it leaves you asking “What happened then?”"),
        tf("True or false: The group of words “Khalid packed his lunch” can stand alone as a sentence.", True,
           "It has a subject (Khalid) and a verb (packed) and is a complete thought, so it is an independent clause."),
        dd("Choose the word that starts a dependent clause and completes the sentence: Omar wore his jacket ____ the morning was cold.",
           "because", ["so", "or"],
           "Because tells the reason Omar wore his jacket."),
        mc("In the sentence “When the bell rang, the students lined up,” which part is the independent clause?",
           "the students lined up", ["When the bell rang", "When the bell rang, the", "the bell rang, the students"],
           "“The students lined up” can stand alone as a sentence."),
        grid("Is each group of words an independent clause or a dependent clause?", ["Independent clause", "Dependent clause"],
             [("Sara read a story", 0), ("while Sara read a story", 1), ("the kitten slept on the rug", 0), ("if the kitten wakes up", 1)],
             "Words like while and if turn a clause into a dependent clause that cannot stand alone."),
        mc("Which sentence has a dependent clause?",
           "Noura smiled when she saw the gift.", ["Noura saw the gift on the kitchen table.", "Noura and her sister saw the gift.", "Noura saw the gift and smiled."],
           "“When she saw the gift” is a dependent clause: it has a subject and a verb but cannot stand alone."),
        ht("Select the dependent clause in this sentence about dinner.",
           ["Before we ate dinner,", "we washed our hands", "with soap and water."], [0],
           "“Before we ate dinner” starts with before and cannot stand alone."),
        mc("Which word can begin a dependent clause?",
           "although", ["and", "but", "or"],
           "Although is a subordinating conjunction. And, but and or join two independent clauses."),

        mc("Which group of words needs another part to be a complete sentence?",
           "If it rains tomorrow", ["It rained all day", "The rain stopped at noon", "We played after the rain"],
           "“If it rains tomorrow” is a dependent clause. It needs an independent clause, such as “we will stay home.”"),
        mc("What does the dependent clause tell in this sentence? “We went to the park after the sun set.”",
           "when we went to the park", ["why we went to the park", "how far away the park was", "who went to the park"],
           "“After the sun set” tells when."),
        ms("Which two groups of words are dependent clauses? Choose two.",
           ["because the bus was late", "until the game ended"], ["the bus was late", "the game ended at six"],
           "Because and until make these clauses dependent. The other two can stand alone."),
        dd("Choose the word that best completes the sentence: Faisal could not play outside ____ he finished his chores.",
           "until", ["and", "or"],
           "Until starts a dependent clause that tells when Faisal could play."),
        mc("Which sentence is made of only one independent clause and nothing else?",
           "My older brother fed the hungry goats in the yard.", ["My brother fed the goats before he left.", "When the goats were hungry, my brother fed them.", "My brother fed the goats because they were hungry."],
           "It has one subject and one verb and no dependent clause. The others each add a dependent clause."),
        ht("Select the subordinating conjunction in the sentence.",
           ["The baby", "slept", "while", "her mother", "cooked rice."], [2],
           "While starts the dependent clause “while her mother cooked rice.”"),
        mc("Which pair of words can both start a dependent clause?",
           "since, unless", ["although, and", "unless, or", "but, yet"],
           "Since and unless are subordinating conjunctions. The others are coordinating conjunctions."),
        grid("Does each sentence have a dependent clause?", ["Has a dependent clause", "No dependent clause"],
             [("Lama drew a picture of a palm tree.", 1), ("Lama drew a palm tree while she waited.", 0), ("If you water the plant, it will grow.", 0), ("The plant grew tall and green.", 1)],
             "“While she waited” and “If you water the plant” are dependent clauses."),
        mc("Which clause best completes the sentence so that it makes sense? “________, we opened the windows.”",
           "Because the room was hot", ["Because the room was cold", "Because the room was quiet", "The room was very hot"],
           "A hot room is a good reason to open windows, and because makes the clause dependent. “The room was very hot” would need a joining word."),
        tf("True or false: Every dependent clause has a subject and a verb.", True,
           "All clauses have a subject and a verb. A dependent clause just cannot stand alone."),
    ],
    # ---------------- 191–200: complex sentences, commas, choosing a subordinator (Grade 4 Below ×10, Grade 4 On ×10)
    [
        mc("A complex sentence has one independent clause and at least one dependent clause. Which sentence is complex?",
           "Since it was Friday, we visited our grandparents.", ["It was Friday, and we visited our grandparents.", "We visited our grandparents on Friday after school.", "It was Friday, so we visited our grandparents."],
           "“Since it was Friday” is a dependent clause joined to the independent clause “we visited our grandparents.”"),
        mc("Which sentence uses a comma correctly after a dependent clause?",
           "When the game ended, the fans cheered loudly.", ["When the game ended the fans, cheered loudly.", "When, the game ended the fans cheered loudly.", "When the game, ended the fans cheered loudly."],
           "When a dependent clause comes first, put a comma right after it."),
        dd("Choose the word that makes this a complex sentence and shows contrast: ____ the test was hard, Yousef did not give up.",
           "Although", ["Because", "And"],
           "Although shows that Yousef kept going even though the test was hard."),
        mc("Which part of this complex sentence is the dependent clause? “The children laughed when the clown fell down.”",
           "when the clown fell down", ["The children laughed", "The children laughed when", "laughed when the clown"],
           "“When the clown fell down” has a subject and verb but cannot stand alone."),
        mc("How can you join these two sentences into one complex sentence? “The shop was closed. We bought bread somewhere else.”",
           "Because the shop was closed, we bought bread somewhere else.", ["The shop was closed, we bought bread somewhere else.", "The shop was closed and, we bought bread somewhere else.", "Because the shop was closed we, bought bread somewhere else."],
           "Because makes the first idea a dependent clause, and a comma follows it."),
        ms("Read the sentences about a school trip. Which two are complex sentences? Choose two.",
           ["We sang songs while the bus drove to Taif.", "After we arrived, the guide met us at the gate."], ["The bus was big and blue.", "We saw roses, and we smelled them."],
           "Each complex sentence has a dependent clause (while…, after…). The others are simple or compound."),
        ht("Select the word that joins the dependent clause to the rest of the sentence.",
           ["Dana", "kept", "reading", "until", "the lights went out."], [3],
           "Until is the subordinating conjunction that begins the dependent clause."),
        mc("Which sentence is NOT a complex sentence?",
           "Majed kicked the ball, and it flew into the net.", ["Majed smiled after he kicked the ball.", "If Majed kicks the ball hard, it will fly very far.", "Before Majed kicked the ball, he took a breath."],
           "It joins two independent clauses with and, so it is compound. The others have a dependent clause."),
        tf("True or false: “The library opens at eight, and it closes at two.” is a complex sentence.", False,
           "Both clauses can stand alone and are joined by and, so it is a compound sentence."),
        mc("Which of these words shows time when it starts a dependent clause?",
           "before", ["because", "although", "unless"],
           "Before tells when something happens. Because gives a reason, although shows contrast and unless shows a condition."),

        mc("Where does the comma belong in this sentence? “If you finish early you may read a book.”",
           "after early", ["after finish", "after may", "after read"],
           "The dependent clause “If you finish early” comes first, so the comma goes right after it."),
        grid("Is each sentence simple or complex?", ["Simple", "Complex"],
             [("The kite rose high into the sky.", 0), ("The kite rose high because the wind was strong.", 1), ("Unless the wind blows, the kite will fall.", 1), ("Turki and Salman flew the red kite.", 0)],
             "Complex sentences have a dependent clause starting with words like because or unless."),
        mc("Which dependent clause tells why?",
           "because the road was flooded", ["when the road was flooded", "where the road ends at the sea", "after the road was fixed"],
           "Because gives a reason. The others tell when or where."),
        mc("Which sentence correctly joins these ideas with “although”? The water was cold. Bader swam in the sea.",
           "Although the water was cold, Bader swam in the sea.", ["Although the water was cold, but Bader swam in the sea.", "Although the water was cold. Bader swam in the sea.", "The water was cold although, Bader swam in the sea."],
           "Use although to start the dependent clause, then a comma. Do not add but."),
        dd("Choose the word that best completes the complex sentence: ____ you heat ice, it melts into water.",
           "When", ["But", "So"],
           "When starts a dependent clause that tells the time something happens."),
        ec("Find and fix the error in this complex sentence.",
           ["When the oven was hot.", "The cookies", "baked", "very quickly."], 0, "When the oven was hot,",
           "“When the oven was hot” cannot stand alone, so it needs a comma, not a period."),
        mc("In which sentence does the dependent clause come at the end?",
           "We cheered loudly as the team scored.", ["As the team scored, we cheered loudly.", "When we cheered, the team scored again.", "If the team scores, we will cheer."],
           "“As the team scored” comes after the independent clause, so no comma is needed."),
        ht("Select the sentence that is complex.",
           ["Grandfather planted a lemon tree.", "He watered it every morning.", "When the first lemon grew, he gave it to me."], [2],
           "“When the first lemon grew” is a dependent clause joined to an independent clause."),
        mc("Which word should fill the blank to show a condition? “You can join the club ____ you bring a signed form.”",
           "if", ["although", "while", "and"],
           "If shows a condition: you can join only when you bring the form."),
        ms("Which two words could start the dependent clause in this sentence? “____ the sun set, the family ate dinner.” Choose two.",
           ["After", "When"], ["And", "So"],
           "After and when are subordinating conjunctions that tell time. And and so cannot start this clause."),
    ],
    # ---------------- 201–210: simple / compound / complex / compound-complex (Grade 4 Above ×10, Grade 5 On ×10)
    [
        mc("Which sentence is a compound sentence, with two independent clauses joined by a word like and, but or so?",
           "The museum was busy, so we came back later.", ["The museum was busy when we arrived.", "Because the museum was busy, we left.", "The busy museum had many visitors on Saturday."],
           "“The museum was busy” and “we came back later” can each stand alone, and so joins them."),
        mc("A compound-complex sentence has at least two independent clauses and at least one dependent clause. Which sentence is compound-complex?",
           "When the rain stopped, Ali rode his bike, and Sara walked the dog.", ["Ali rode his bike to the shop, and Sara walked the dog.", "When the rain finally stopped, Ali rode his bike to the park.", "Ali rode his bike after the rain stopped and the sun came out."],
           "It has one dependent clause (When the rain stopped) and two independent clauses joined by and."),
        grid("Sort each sentence about Hessa's art class by its type.", ["Simple", "Compound", "Complex"],
             [("Hessa painted a vase.", 0), ("Hessa painted a vase, and her sister made a bowl.", 1), ("Hessa painted a vase while her sister made a bowl.", 2)],
             "Simple: one clause. Compound: two independent clauses. Complex: one independent clause and a dependent clause."),
        mc("How many independent clauses are in this sentence? “Although it was late, Nada finished her project, and she showed it to her father.”",
           "two", ["one", "three", "none"],
           "“Nada finished her project” and “she showed it to her father” can each stand alone."),
        mc("What kind of sentence is this? “The cat hid under the bed because the thunder was loud.”",
           "complex", ["simple", "compound", "compound-complex"],
           "It has one independent clause and one dependent clause (because the thunder was loud)."),
        tf("True or false: A compound sentence must have a dependent clause.", False,
           "A compound sentence joins independent clauses. A sentence with a dependent clause is complex or compound-complex."),
        ms("Which two sentences are compound-complex? Choose two.",
           ["After the bell rang, the boys ran outside, and the girls went to the library.", "We wanted to swim, but the pool was closed because it was being cleaned."],
           ["The boys ran outside after the bell rang.", "We wanted to swim, but the pool was closed."],
           "Each correct sentence has two independent clauses and a dependent clause."),
        mc("Which sentence is simple?",
           "Every morning, my grandmother waters the mint in her garden.", ["My grandmother waters the mint, and she picks a few leaves.", "When the sun rises, my grandmother waters the mint.", "My grandmother waters the mint so that it stays fresh and green."],
           "It has only one clause. “Every morning” and “in her garden” are phrases, not clauses."),
        dd("Choose the word that turns this into a compound-complex sentence: ____ the guests arrived, Mom served dates, and Dad poured coffee.",
           "When", ["And", "But"],
           "When adds a dependent clause to the two independent clauses."),
        ht("Select the dependent clause in this compound-complex sentence.",
           ["Ziyad studied hard,", "and he passed the test", "because he reviewed every night."], [2],
           "“Because he reviewed every night” cannot stand alone."),

        mc("What type of sentence is this? “Layan wanted to buy a book, but she did not have enough money.”",
           "compound", ["simple", "complex", "compound-complex"],
           "Two independent clauses are joined by but, and there is no dependent clause."),
        mc("What type of sentence is this? “If we leave early, we can see the camels, and we can still be home by noon.”",
           "compound-complex", ["compound", "complex", "simple"],
           "“If we leave early” is dependent, and two independent clauses are joined by and."),
        mc("Which word in this sentence is a coordinating conjunction that joins two independent clauses? “While the soup cooked, Maha set the table, and Fahad cut the bread.”",
           "and", ["While", "set", "cut"],
           "And joins “Maha set the table” and “Fahad cut the bread.” While starts the dependent clause."),
        grid("Is each sentence complex or compound-complex?", ["Complex", "Compound-complex"],
             [("The birds sang when the sun came up.", 0), ("The birds sang when the sun came up, and the flowers opened.", 1), ("Because it was windy, the door slammed shut.", 0), ("Because it was windy, the door slammed, and the papers flew.", 1)],
             "Adding a second independent clause to a complex sentence makes it compound-complex."),
        mc("Which sentence has exactly one independent clause and two dependent clauses?",
           "When the team won, we cheered because the match was close.", ["The team won the match, and everyone cheered loudly.", "When the team won, everyone cheered, and the coach smiled.", "The team won the match and the shiny silver cup."],
           "“We cheered” is the only independent clause. “When the team won” and “because the match was close” are dependent."),
        ec("Find and fix the error in this sentence about the guests.",
           ["After the guests left,", "we cleaned the room", "we washed the cups."], 1, "we cleaned the room, and",
           "Two independent clauses need a comma and a joining word such as and."),
        mc("Which complex sentence tells what will happen on a condition?",
           "Unless it rains, we will have lunch in the garden.", ["It might rain later, so we will eat our lunch inside.", "We had lunch in the garden with our cousins yesterday.", "It rained, but we ate in the garden."],
           "Unless sets a condition, and it starts a dependent clause."),
        ms("Which two sentences have a dependent clause? Choose two.",
           ["Since Omar was tired, he went to bed early.", "The cake that Grandma baked smelled wonderful."],
           ["Omar was tired, so he went to bed early.", "Grandma baked a cake, and it smelled wonderful."],
           "“Since Omar was tired” and “that Grandma baked” are dependent clauses."),
        mc("Which change would make this simple sentence complex? “The children played football.”",
           "Add a clause such as “after they finished lunch.”", ["Add a word such as “happily” after played.", "Add another clause such as “and they had fun.”", "Change football to “football and basketball.”"],
           "Adding a dependent clause (after they finished lunch) makes the sentence complex."),
        ht("Select the sentence that is compound-complex.",
           ["The wind blew hard all night.", "The tent shook, but it did not fall.", "When morning came, we packed up, and we drove home."], [2],
           "It has a dependent clause (When morning came) and two independent clauses."),
    ],
    # ---------------- 211–220: complex vs compound-complex, combining, relative clauses (Grade 6 On ×10, Grade 6 Above ×10)
    [
        mc("Which choice correctly combines these sentences into one complex sentence? “The boy won the spelling bee. He lives next door.”",
           "The boy who lives next door won the spelling bee.", ["The boy won the spelling bee, he lives next door.", "The boy lives next door, and he won the spelling bee.", "The boy, he lives next door, won the spelling bee."],
           "“Who lives next door” is a dependent clause that describes the boy."),
        mc("Which sentence about meeting an uncle at the airport is compound-complex?",
           "The plane landed late, so we waited at the gate until our uncle came out.", ["The plane landed late, so we waited at the gate for a long time.", "We waited at the gate until our uncle finally came out with his bags.", "Our uncle came out after the plane landed late."],
           "Two independent clauses (joined by so) plus the dependent clause “until our uncle came out.”"),
        mc("Read the sentence. “The scientist, who studies desert plants, gave a talk, and the students asked many questions.” What makes it compound-complex?",
           "It has two independent clauses and one dependent clause.", ["It has one independent clause and two dependent clauses.", "It has two independent clauses and no dependent clause.", "It has three dependent clauses and no independent clause."],
           "“The scientist gave a talk” and “the students asked many questions” are independent. “Who studies desert plants” is dependent."),
        grid("Sort each sentence about Jana's poem by its type.", ["Simple", "Compound", "Complex", "Compound-complex"],
             [("Jana read the poem aloud.", 0), ("Jana read the poem aloud, and the class clapped.", 1), ("When Jana read the poem aloud, the class clapped.", 2), ("When Jana read the poem, the class clapped, and the teacher smiled.", 3)],
             "Count the independent and dependent clauses in each sentence."),
        dd("Choose the word that best completes the complex sentence: The museum ____ we visited has a dinosaur skeleton.",
           "that", ["who", "when"],
           "That begins a clause that describes a thing (the museum). Who is used for people."),
        mc("Which revision turns this compound sentence into a compound-complex sentence? “The market was crowded, but we found fresh figs.”",
           "The market was crowded, but we found fresh figs before they sold out.", ["The market was crowded, but we found fresh figs and sweet dates.", "The market was crowded, so we found fresh figs.", "The crowded market had fresh figs and dates for every shopper."],
           "Adding the dependent clause “before they sold out” makes it compound-complex."),
        ms("Which two sentences are complex but not compound-complex? Choose two.",
           ["The phone rang while we were eating.", "Although the hike was long, nobody complained."],
           ["The phone rang while we were eating, so Dad answered it later.", "The hike was long, but nobody complained."],
           "A complex sentence has only one independent clause. The other two have two independent clauses."),
        mc("How many dependent clauses are in this sentence? “When the alarm rang, Salman jumped out of bed, and he dressed quickly because he was late.”",
           "two", ["one", "three", "none"],
           "“When the alarm rang” and “because he was late” are dependent clauses."),
        ht("Select the two independent clauses in this compound-complex sentence.",
           ["Although the path was steep,", "the hikers kept climbing,", "and they reached the top", "before the sun set."], [1, 2],
           "“The hikers kept climbing” and “they reached the top” can each stand alone."),
        mc("Which sentence uses a dependent clause to show contrast?",
           "Even though Rakan was nervous, he gave a clear speech.", ["Because Rakan was nervous, he practiced his speech.", "Rakan practiced his speech for days until he knew it well.", "After Rakan gave his speech, he sat down."],
           "Even though shows contrast: he was nervous, yet he spoke clearly."),

        mc("Which choice combines these three ideas into one compound-complex sentence? “The power went out. We lit candles. Grandfather told stories.”",
           "When the power went out, we lit candles, and Grandfather told stories.", ["The power went out, we lit candles, Grandfather told stories.", "The power went out, and we lit candles and told old stories together.", "We lit candles and listened to stories when the power went out."],
           "It keeps all three ideas: one dependent clause and two independent clauses joined by and."),
        mc("Which compound-complex sentence is punctuated correctly?",
           "Before the race began, the runners stretched, and the crowd took their seats.", ["Before the race began the runners stretched, and, the crowd took their seats.", "Before the race began, the runners stretched the crowd took their seats.", "Before, the race began, the runners stretched and the crowd, took their seats."],
           "Put a comma after the opening dependent clause and before and when it joins two independent clauses."),
        tf("True or false: “The students who finished early helped the others, and the teacher thanked them.” is a compound-complex sentence.", True,
           "“Who finished early” is a dependent clause, and there are two independent clauses joined by and."),
        mc("Read the sentence. “Our class planted trees in the schoolyard because the principal asked us to help.” Which change would make it compound-complex?",
           "Add “, and the trees grew quickly” at the end.", ["Remove “because the principal asked us to help.”", "Change “because” to “and.”", "Add “green” before “trees.”"],
           "Adding a second independent clause to this complex sentence makes it compound-complex."),
        ec("Find and fix the error in this compound-complex sentence.",
           ["Since the road was closed,", "the bus took a longer way", "and we were late", "for the start of the game."], 1, "the bus took a longer way,",
           "Put a comma before and when it joins two independent clauses."),
        grid("Is each clause from this sentence independent or dependent? “Although Ghada was tired, she finished her painting, and she hung it on the wall.”", ["Independent", "Dependent"],
             [("Although Ghada was tired", 1), ("she finished her painting", 0), ("she hung it on the wall", 0)],
             "Although makes the first clause dependent. The other two can stand alone."),
        mc("Which subordinating conjunction best shows that one event caused another? “____ the river flooded, the farmers moved their animals to higher ground.”",
           "Because", ["Although", "Unless", "Whereas"],
           "Because shows cause and effect: the flood made the farmers move their animals."),
        mc("Which is the best way to combine these sentences? “Ali found a wallet. He returned it to its owner. The owner thanked him.”",
           "After Ali found a wallet, he returned it to its owner, and the owner thanked him.", ["Ali found a wallet, he returned it, the owner thanked him.", "Although Ali found a wallet, he returned it to its owner, and the owner thanked him.", "Ali found a wallet after he returned it to its owner and thanked him."],
           "After shows the right order of events, and the commas are correct."),
        ms("Which two clauses in this sentence are independent? “The bell rang before the test ended, but the teacher gave us extra time because the fire drill had stopped us.” Choose two.",
           ["The bell rang", "the teacher gave us extra time"], ["before the test ended", "because the fire drill had stopped us"],
           "Before and because start dependent clauses. The other two clauses can stand alone."),
        mc("Which sentence has a dependent clause that describes a noun?",
           "The poem that Huda wrote won first prize.", ["Huda wrote a poem, and it won first prize.", "Huda smiled when her poem won first prize.", "Because her poem won, Huda smiled."],
           "“That Huda wrote” tells which poem, so it describes the noun poem."),
    ],
    # ---------------- 221–230: precise meaning, punctuation, revising for effect (Grade 8 Above ×10, Grade 9 Above ×10)
    [
        mc("Which revision best shows that the second event happened in spite of the first? “The test was difficult. Most students passed it.”",
           "Although the test was difficult, most students passed it.", ["Because the test was difficult, most students passed it.", "The test was difficult, so most students passed it.", "When the test was difficult, most of the students passed it."],
           "Although shows contrast: students passed even though the test was hard."),
        mc("Which sentence about the new library is punctuated correctly?",
           "The new library, which opened last week, has a reading garden, and students love it.", ["The new library which opened last week, has a reading garden, and students love it.", "The new library, which opened last week has a reading garden and, students love it.", "The new library, which opened last week, has a reading garden students love it."],
           "Extra information (which opened last week) needs a comma on both sides, and a comma comes before and."),
        mc("Which sentence uses a semicolon correctly in a compound-complex sentence?",
           "Because the flight was delayed, we waited for hours; however, the airline gave us snacks.", ["Because the flight was delayed; we waited for hours, however the airline gave us snacks.", "Because; the flight was delayed, we waited for hours however the airline gave us snacks.", "Because the flight was delayed, we waited; for hours, however, the airline gave us snacks."],
           "A semicolon joins the two independent clauses, and however is followed by a comma."),
        mc("A writer wants the main point, that the team won, to be in the independent clause. Which sentence does this best?",
           "Although two players were injured, the team won the championship.", ["Although the team won the championship, two players were injured.", "The team won, and two players were injured.", "Two players were injured when the team won the championship."],
           "The most important idea belongs in the independent clause; the less important idea goes in the dependent clause."),
        ht("Select the clause that should be set off with commas because it adds extra information.",
           ["My cousin Abdullah", "who lives in Jeddah", "is visiting us this week", "and he brought gifts."], [1],
           "We already know who Abdullah is, so “who lives in Jeddah” is extra and needs commas."),
        mc("Which compound-complex sentence is written correctly?",
           "Whenever Dana reads before bed, she sleeps well, and she wakes up early.", ["Whenever Dana reads before bed, she sleeps well, she wakes up early.", "Whenever Dana reads before bed she sleeps well and, she wakes up early.", "Whenever Dana reads before bed. She sleeps well, and she wakes up early."],
           "It has a comma after the dependent clause and a comma plus and between the independent clauses."),
        grid("Sort each sentence about the match by its type.", ["Simple", "Compound", "Complex", "Compound-complex"],
             [("Feeling ready, the players walked onto the field.", 0), ("The players had trained for weeks, yet they felt nervous.", 1), ("Before the match, the players, who had trained for weeks, felt ready.", 2), ("The players felt ready because they had trained, but the rain delayed the match.", 3)],
             "Phrases such as “Feeling ready” and “Before the match” are not clauses. Count only groups with a subject and a verb."),
        mc("Which subordinating conjunction makes the relationship between the clauses clearest? “____ the desert is very dry, some plants store water in their thick leaves.”",
           "Because", ["Unless", "Although", "Until"],
           "The dry desert is the reason the plants store water, so because fits best."),
        mc("Read the sentence. “Since the museum was free on Saturday, many families visited, but the café ran out of food.” What is the job of the clause “Since the museum was free on Saturday”?",
           "It gives a reason for the families’ visit.", ["It tells when the café ran out of food.", "It names the families who visited the museum.", "It contrasts the museum with the café."],
           "Here since means because, so the clause explains why many families visited."),
        ec("Find and fix the error in this sentence about Noura's soup.",
           ["Because the soup was cold,", "Noura ate all of it,", "and she asked", "for more."], 0, "Although the soup was cold,",
           "A cold soup is not a reason to eat it all. Although shows the contrast the writer means."),

        mc("Which revision combines these ideas into a compound-complex sentence without changing the meaning? “The scouts reached the camp. It was dark. They set up their tents. They cooked dinner.”",
           "After the scouts reached camp in the dark, they set up tents, and they cooked dinner.", ["The scouts reached the camp, it was dark, they set up tents, they cooked dinner.", "The scouts reached the camp in the dark, set up their tents, and then cooked dinner.", "Because the scouts set up their tents, it was dark when they reached the camp."],
           "It has one dependent clause and two independent clauses and keeps the order of events. The third choice is a simple sentence."),
        mc("Which of these sentences is compound-complex?",
           "The girl who won the race thanked her coach, and her parents cheered.", ["The girl who won the race thanked her coach and her parents.", "The girl thanked her coach and her parents after the race.", "Winning the race, the girl thanked her coach, and her parents cheered."],
           "“Who won the race” is dependent, and two independent clauses are joined by and. “Winning the race” is only a phrase."),
        ms("Which two of these sentences about a family trip are compound-complex? Choose two.",
           ["The house that we rented was small, but it had a lovely view.", "We left early so that we would beat the traffic; nevertheless, we arrived late."],
           ["Having rented a small house, we enjoyed its lovely view.", "The small house had a lovely view, and we enjoyed it every day."],
           "Each correct sentence has two independent clauses and a dependent clause (that we rented, so that we would beat the traffic)."),
        mc("Read the sentence. “Whoever finishes the puzzle first will win a prize, and everyone else will get a sticker.” Which part is the dependent clause?",
           "Whoever finishes the puzzle first", ["will win a prize", "everyone else will get a sticker", "Whoever finishes the puzzle first will win a prize"],
           "“Whoever finishes the puzzle first” is a dependent clause that acts as the subject of the first independent clause."),
        mc("Which sentence starts with a dependent clause and keeps the meaning of “Fahad saved his money for months so he could buy a telescope”?",
           "So that he could buy a telescope, Fahad saved his money for months.", ["Fahad, so he could buy a telescope, months saved his money.", "Saving his money, Fahad bought a telescope for months.", "For months, Fahad bought a telescope so that he could save his money."],
           "Moving the dependent clause to the front varies the sentence without changing its meaning."),
        ht("Select the clause that is not independent.",
           ["The mountains looked purple", "as the sun went down,", "and the air grew cool,", "so we put on our jackets."], [1],
           "As is a subordinating conjunction. And and so join independent clauses."),
        dd("Choose the word that correctly completes this compound-complex sentence: The students wanted to stay longer ____ the exhibit was so interesting, but the bus was waiting.",
           "because", ["and", "so"],
           "Because makes “the exhibit was so interesting” a dependent clause giving the reason."),
        mc("Which choice is the clearest and least wordy way to combine these sentences? “Reem entered the contest. The contest was for young writers. She wanted to share her story.”",
           "Reem entered the contest for young writers because she wanted to share her story.", ["Reem entered the contest, and the contest was for young writers, and she wanted to share her story.", "Reem entered the contest, which was a contest that was for young writers, because she wanted to share her story.", "Because Reem entered the contest for young writers, she wanted to share her story."],
           "It is short, clear and shows the right reason. The last choice turns the cause and effect around."),
        tf("True or false: In the sentence “When the lights dimmed, the audience became quiet, and the play began,” the clause “the play began” is a dependent clause.", False,
           "“The play began” can stand alone, so it is independent. “When the lights dimmed” is the dependent clause."),
        mc("A writer used many short sentences: “The wind howled. The tent flapped. We were scared. We stayed inside.” Which revision best varies them with one compound-complex sentence?",
           "As the wind howled and the tent flapped, we were scared, but we stayed inside.", ["The wind howled, the tent flapped, we were scared, we stayed inside.", "The wind howled and the tent flapped and we were scared and we stayed inside.", "The wind howled. The tent flapped because we were scared. We stayed inside."],
           "It joins the ideas with a dependent clause (As…) and two independent clauses joined by but."),
    ],
]


# ================================================================== 2. Point of View

PV = [
    # ---------------- 181–190: pronouns, who is telling (Grade 3 Below ×10, Grade 3 On ×10)
    [
        mc("Who is telling this story about the red bike?",
           "a character in the story who uses I", ["someone outside the story who uses he", "the reader, who is called you", "the cousin, who uses the word we"],
           "The narrator says I and my, so the narrator is a character in the story.",
           "I got a red bike for Eid. I rode it to my cousin's house. My cousin and I raced down the street. I won the race!", "My Red Bike"),
        mc("Which words in the kitten story tell you it is told in third person?",
           "Salma, she, it", ["I, me, my", "we, us, our", "you, your, yours"],
           "Third person uses names and words like she and it.",
           "Salma heard a tiny cry under the car. She bent down and saw a kitten. Salma gave it some milk. The kitten purred happily.", "The Lost Kitten"),
        mc("What point of view is used in these planting directions?",
           "second person", ["first person", "third person limited", "third person omniscient"],
           "The directions speak to the reader as you.",
           "First, you dig a small hole. Next, you drop in two seeds. Then you cover them with soil. Finally, you water them every day.", "Planting Seeds"),
        ht("Select the two sentences that show the narrator is part of the beach trip.",
           ["We drove to the beach in Al Khobar.", "The water was warm and blue.", "I found a pink shell.", "The sand castles were tall."], [0, 2],
           "We and I show that the narrator was there.",
           "We drove to the beach in Al Khobar. The water was warm and blue. I found a pink shell. The sand castles were tall.", "At the Beach"),
        mc("Is the lunch box story told in first person or third person?",
           "third person, because the narrator uses he and his", ["first person, because the narrator uses he and his", "first person, because Omar is the main character", "second person, because the story is about lunch"],
           "He and his are third-person words. The narrator tells about Omar from outside.",
           "Omar opened his lunch box. He found a sandwich and an apple. He smiled because his mother had packed his favorite food.", "Lunch Time"),
        tf("True or false: The narrator of the football story is a character in the story.", True,
           "The narrator uses I and my team, so the narrator is in the story.",
           "I kicked the ball as hard as I could. It flew past the goalkeeper. My team cheered, and I jumped high in the air.", "The Big Game"),
        mc("Which pronoun tells you this story about Grandmother's kitchen is told in first person?",
           "I", ["she", "her", "they"],
           "I is a first-person pronoun. The narrator is telling about himself or herself.",
           "Every Friday, I visit my grandmother. Her kitchen smells like cardamom and fresh bread. She lets me help her make kleija cookies.", "My Grandmother's Kitchen"),
        grid("Is each sentence written in first person or third person?", ["First person", "Third person"],
             [("I fed the ducks at the park.", 0), ("She fed the ducks at the park.", 1), ("We watched the ducks swim.", 0), ("They watched the ducks swim.", 1)],
             "I and we are first person. She and they are third person."),
        mc("In the library card passage, who is the word you talking to?",
           "the reader", ["the librarian", "the narrator's friend", "a character named You"],
           "In second person, you speaks to the reader.",
           "You walk up to the desk. You hand the librarian your new card. She smiles and gives you your first book.", "The Library Card"),
        dd("Choose the pronoun that keeps this sentence in first person: ____ packed my bag for the school trip.",
           "I", ["She", "You"],
           "I matches my and shows the speaker is telling about himself or herself."),

        mc("What point of view is the rain story told from?",
           "third person", ["first person", "second person", "first person plural (we)"],
           "The narrator tells about Lama using her name and she.",
           "Lama looked out the window. Dark clouds covered the mountains. Lama hoped the rain would stop before her picnic. She crossed her fingers.", "Rain in Abha"),
        ms("Which two words show that the science fair passage is told in first person? Choose two.",
           ["I", "We"], ["Reem", "judges"],
           "I and we are first-person pronouns used by the narrator.",
           "Our class had a science fair. I made a volcano with baking soda. My friend Reem made a solar oven. We all clapped when the judges came.", "Our Science Fair"),
        mc("Who is telling the camel story?",
           "a narrator outside the story", ["the strong camel in the story", "one of the thankful travelers", "the reader of the story"],
           "No one in the story says I. The narrator tells about the camel and the travelers from outside.",
           "The camel walked across the hot sand. It carried water for the travelers. The travelers were thankful for the strong camel.", "The Brave Camel"),
        mc("How do you know the narrator is a character in the tea story?",
           "The narrator uses the word I.", ["The narrator talks about Dad.", "The story has tea and mint.", "The narrator uses the word each."],
           "I shows the narrator is taking part in the story.",
           "Dad boiled water in the kettle. I added the tea leaves and a sprig of mint. Dad poured a cup for each of us.", "Making Tea"),
        mc("Which word from the owl story is a third-person pronoun?",
           "it", ["I", "we", "you"],
           "It is a third-person pronoun. The narrator tells about the owl from outside.",
           "The owl sat in the old tree. It closed its eyes all day long. At night, it flew over the farm to hunt.", "The Sleepy Owl"),
        mc("Why is the kite passage told in second person?",
           "It uses you and your to speak to the reader.", ["It uses I and my to tell about the narrator.", "It uses he and his to tell about a boy.", "It uses they and their to tell about kites."],
           "Second person speaks to the reader with you and your.",
           "You hold the string tightly. You run into the wind. Your kite rises higher and higher!", "The Kite Contest"),
        grid("Is each sentence written in first, second, or third person?", ["First person", "Second person", "Third person"],
             [("You should wear a hat in the sun.", 1), ("My hat keeps the sun off my face.", 0), ("His hat is blue and white.", 2)],
             "My is first person, you is second person and his is third person."),
        mc("If Sara told this story herself, how would the first sentence begin?",
           "My brother and I saved our coins for a month.", ["Sara and her brother saved their coins for a month.", "You and your brother saved your coins for a month.", "They saved their coins for a month."],
           "In first person, Sara would use I, my and our.",
           "Sara and her brother saved their coins for a month. They bought a small plant for their mother. Mama hugged them both.", "A Gift for Mama"),
        tf("True or false: The date farm passage is told in first person because it tells what Khalid likes.", False,
           "The narrator uses Khalid's name and he, so it is third person.",
           "Khalid's uncle owns a date farm. Khalid helps pick the dates every summer. He likes the sweet, sticky ones best.", "Dates from the Farm"),
        dd("Choose the pronoun that keeps this sentence in third person: Rakan finished ____ homework before dinner.",
           "his", ["my", "your"],
           "His is a third-person pronoun that matches Rakan."),
    ],
    # ---------------- 191–200: first vs second vs third, inside or outside the story (Grade 4 Below ×10, Grade 4 On ×10)
    [
        mc("From which point of view is the surprise party story told?",
           "first person", ["second person", "third person limited", "third person omniscient"],
           "The narrator uses I and we and is part of the party.",
           "I hid behind the couch with my cousins. When Aunt Hessa opened the door, we jumped up and shouted. She laughed so hard that she dropped her bag.", "The Surprise Party"),
        mc("Which point of view does the writer of the goat-feeding tips use, and why?",
           "second person, to give the reader directions", ["first person, to tell about the writer's goat", "third person, to tell a story about a farmer", "first person, to explain the writer's feelings"],
           "The writer speaks to the reader as you to explain the steps.",
           "Before you feed a goat, wash your hands. Hold the food flat on your palm. Keep your fingers together so the goat does not nibble them.", "How to Feed a Goat"),
        grid("Is the narrator of each sentence a character who takes part (first person) or someone outside the events (third person)?", ["First person", "Third person"],
             [("I could not believe my eyes when the door opened.", 0), ("Faisal could not believe his eyes when the door opened.", 1), ("We ran to the window to see the parade.", 0), ("The children ran to the window to see the parade.", 1)],
             "A narrator who says I or we is in the story. A narrator who uses names and he or they is outside it."),
        mc("Which clue shows that the narrator of the well story is not a character in it?",
           "The narrator calls Bader by name and uses he.", ["The narrator describes the old well in the village.", "The narrator uses the sound word Plop!", "The narrator tells where the well is."],
           "A narrator outside the story uses the character's name and he or she.",
           "Bader walked to the old well at the edge of the village. He dropped a pebble and listened. Plop! He wondered how deep the water was.", "The Old Well"),
        ms("Which two details show that the narrator is part of this evening scene? Choose two.",
           ["We waited at the table", "I passed the water jug"], ["the sun went down", "the call to prayer"],
           "We and I show the narrator is at the table.",
           "We waited at the table as the sun went down. My little sister counted the dates on her plate. When we heard the call to prayer, I passed the water jug to my father.", "Ramadan Evening"),
        mc("Which point of view does the narrator of the pet shop story use?",
           "third person", ["first person", "second person", "first person plural"],
           "The narrator tells about the parrot, the children and Mr. Saleh from outside.",
           "The parrot in the pet shop said hello to everyone. Children laughed whenever it whistled. The shop owner, Mr. Saleh, gave it a cracker each morning.", "The Talking Parrot"),
        ht("Select the two sentences that use a first-person pronoun for the narrator.",
           ["The sand was hot under my feet.", "Jana climbed quickly up the dune.", "She waved from the top of the dune.", "I took a deep breath and kept going."], [0, 3],
           "My and I are first-person pronouns.",
           "The sand was hot under my feet. Jana climbed quickly up the dune. She waved from the top of the dune. I took a deep breath and kept going.", "Climbing the Dune"),
        mc("Which words show that the treasure box passage is in second person?",
           "you, your", ["I, my", "he, his", "they, their"],
           "You and your speak straight to the reader.",
           "You open the old wooden box. Inside, you find a map with a red X. Your heart beats fast as you wonder where it leads.", "The Wooden Box"),
        tf("True or false: A story told in third person uses words like he, she and they for the characters.", True,
           "Third-person narrators use names and he, she, it and they."),
        dd("Choose the word that puts this sentence in second person: ____ should always wear a seat belt in the car.",
           "You", ["I", "He"],
           "You speaks directly to the reader."),

        mc("Who is the narrator of the souq passage?",
           "a narrator outside the story who tells about Maha", ["Maha, who tells what happened to her in the souq", "Maha's mother, who tells about her daughter", "the shopkeeper, who sells Maha the shiny bracelet"],
           "The narrator uses Maha's name and she, so the narrator is outside the story.",
           "Maha held her mother's hand in the busy souq. Then she stopped to look at a shiny bracelet. When she turned around, her mother was gone! Maha's heart pounded.", "Lost in the Souq"),
        mc("What can the reader learn from the first-person narrator of the fishing story?",
           "what the narrator does and feels during the trip", ["what Dad is secretly thinking the whole time", "what the fish is thinking under the water", "what every person on the beach is doing that day"],
           "A first-person narrator can share only his or her own actions and feelings.",
           "Dad and I sailed out at sunrise. I held the fishing line for an hour, and nothing happened. Then something tugged so hard that I almost fell! Dad laughed and helped me pull in a big hamour.", "The Fishing Trip"),
        grid("Sort each sentence by its point of view.", ["First person", "Second person", "Third person"],
             [("I hope it rains tomorrow.", 0), ("You can see the stars from the roof.", 1), ("Fahad hopes it rains tomorrow.", 2), ("We all hope it rains tomorrow.", 0)],
             "I and we are first person, you is second person, and a name such as Fahad is third person."),
        mc("If Ziyad were the narrator of the new student story, which sentence would be correct?",
           "I felt my cheeks get warm.", ["Ziyad felt his cheeks get warm.", "You felt your cheeks get warm.", "He felt his cheeks get warm."],
           "If Ziyad told the story, he would use I and my.",
           "Ziyad walked into the classroom on his first day. Twenty faces turned to look at him. Ziyad felt his cheeks get warm. He sat in the only empty chair.", "The New Student"),
        ms("Which two words in the sandstorm passage are third-person pronouns? Choose two.",
           ["his", "They"], ["sky", "storm"],
           "His and they are third-person pronouns. Sky and storm are nouns.",
           "The sky turned orange. Khalid pulled his scarf over his nose. His sister Nada grabbed his arm. They hurried home before the storm hit.", "Sandstorm"),
        mc("Why might the writer have chosen second person for the birdhouse steps?",
           "to speak directly to the reader who follows the steps", ["to tell a story about a birdhouse the writer once built", "to show the thoughts of every character", "to describe a bird that lives in a birdhouse"],
           "Second person (you) works well for directions a reader will follow.",
           "You will need wood, nails and a hammer. First, you cut the wood into six pieces. Then you nail the pieces together. Ask an adult to help you with the hammer.", "Building a Birdhouse"),
        ht("Select the sentence in which the narrator tells what Turki noticed.",
           ["Turki searched under his bed for his left shoe.", "His brother pretended to read a book.", "Turki noticed a shoelace peeking out from behind his brother's back.", "Turki laughed and grabbed it."], [2],
           "The word noticed tells what Turki saw.",
           "Turki searched under his bed for his left shoe. His brother pretended to read a book. Turki noticed a shoelace peeking out from behind his brother's back. Turki laughed and grabbed it.", "The Missing Shoe"),
        mc("Which sentence would change the race story to third person?",
           "When the whistle blew, Noura ran faster than she ever had before.", ["When the whistle blew, I ran faster than I ever had before.", "When the whistle blew, you ran faster than you ever had before.", "When the whistle blew, we ran faster than we ever had before."],
           "Third person uses a name and she instead of I.",
           "We lined up at the starting line. My legs were shaking. When the whistle blew, I ran faster than I ever had before.", "The Race"),
        dd("Choose the phrase that best completes the sentence: The narrator of the falcon story is ____.",
           "a character who watches the uncle", ["someone outside the story", "the falcon named Sahm"],
           "The narrator says I watched, so the narrator is a character in the story.",
           "My uncle trained a falcon named Sahm. I watched him hold out his glove. The falcon swooped down and landed on it.", "My Uncle's Falcon"),
        tf("True or false: A first-person narrator can always tell exactly what every other character is thinking.", False,
           "A first-person narrator is one character, so he or she can only guess what others think."),
    ],
    # ---------------- 201–210: third limited vs third omniscient (Grade 4 Above ×10, Grade 5 On ×10)
    [
        mc("Which point of view is used in the spelling bee passage?",
           "third person limited", ["third person omniscient", "first person", "second person"],
           "The narrator tells only Yousef's thoughts and feelings.",
           "Yousef stood on the stage and stared at the judges. His hands were sweaty. He wondered if he could remember how to spell “necessary.” He took a deep breath and began.", "The Spelling Bee"),
        mc("Why is the broken vase passage told in third person omniscient?",
           "The narrator tells the thoughts and feelings of several characters.", ["The narrator tells only Huda's thoughts and feelings about the vase.", "The narrator is Huda, who tells the story using I.", "The narrator speaks directly to the reader using you."],
           "We learn how Huda, her mother and her brother each feel.",
           "Huda knocked the vase off the shelf and felt terrible. In the next room, her mother heard the crash and worried that someone was hurt. Huda's little brother hid behind the door, afraid he would be blamed.", "The Broken Vase"),
        grid("Read each description. Is it third person limited or third person omniscient?", ["Third person limited", "Third person omniscient"],
             [("The narrator shares only one character's thoughts.", 0), ("The narrator shares the thoughts of many characters.", 1), ("The narrator knows what is happening in two different places.", 1), ("The reader learns only what one character notices.", 0)],
             "Limited follows one character. Omniscient means all-knowing."),
        mc("Which sentence shows that the narrator of the picnic passage knows more than Sara does?",
           "She did not know that Reem was planning a surprise cake.", ["Sara spread the striped blanket under the tall palm tree.", "She hoped her friends would like the sandwiches.", "The sun was warm and bright over the quiet green park."],
           "Sara does not know about the cake, but the narrator does.",
           "Sara spread the striped blanket under the tall palm tree. The sun was warm and bright over the quiet green park. She hoped her friends would like the sandwiches she had made. She did not know that Reem was planning a surprise cake.", "The Picnic"),
        ms("Which two details show that the science project passage uses third person omniscient? Choose two.",
           ["Faisal worried his model would fall apart.", "Majed thought winning would be easy."], ["Faisal's model was wobbly.", "Majed's robot was finished."],
           "The narrator shares the private thoughts of two different boys.",
           "Faisal frowned at his wobbly model of the solar system. He worried it would fall apart before the fair. Across town, his friend Majed felt proud of his finished robot. Majed thought winning would be easy.", "The Science Project"),
        mc("Whose thoughts does the reader learn in the bus stop passage?",
           "only Lama's", ["only the bus driver's", "Lama's and the driver's", "no one's"],
           "The narrator follows only Lama, so it is third person limited.",
           "Lama tapped her foot at the bus stop. The bus was late again. She wondered if she should walk to school instead. She checked the time and sighed.", "Waiting for the Bus"),
        tf("True or false: The kunafa passage is told in third person limited because it tells about two brothers.", False,
           "It shows what both brothers want and feel, so it is third person omniscient.",
           "Salman wanted the last piece of kunafa, but he said nothing. Rakan also wanted it, but he offered it to his brother. Salman felt grateful and decided to share.", "Two Brothers"),
        ht("Select the two sentences that show the thoughts of two different characters.",
           ["Mrs. Al-Harbi watered her roses every morning.", "She secretly worried that her neighbor's garden was prettier.", "Next door, Mr. Al-Qahtani was sure his jasmine would win.", "The judges would arrive on Thursday."], [1, 2],
           "One sentence shows Mrs. Al-Harbi's worry, and the other shows what Mr. Al-Qahtani believes.",
           "Mrs. Al-Harbi watered her roses every morning. She secretly worried that her neighbor's garden was prettier. Next door, Mr. Al-Qahtani was sure his jasmine would win. The judges would arrive on Thursday.", "The Garden Contest"),
        mc("What point of view does the football match passage use?",
           "third person omniscient", ["third person limited", "first person", "second person"],
           "The narrator tells what the goalkeeper thinks and what the coach hopes.",
           "Ali dribbled the ball toward the goal. The goalkeeper bent his knees, thinking Ali would kick to the left. Ali's coach held his breath on the side of the field, hoping for a goal.", "The Football Match"),
        dd("Choose the words that complete the sentence: A narrator who tells the thoughts of only one character is using ____.",
           "third person limited", ["third person omniscient", "second person"],
           "Limited means the narrator stays with one character."),

        mc("Why does the author use third person limited in the desert camp passage?",
           "to let the reader share Tariq's fear of the unknown sound", ["to show what the fox outside is thinking and planning", "to explain what every camper in the tent is feeling", "to speak to the reader as you, the one in the tent"],
           "Because we know only what Tariq knows, we wonder about the sound too.",
           "Tariq lay in the tent and listened to the wind. He was sure he heard footsteps outside. He pulled his blanket up to his chin. Was it a fox? Was it his cousin playing a trick?", "Night in the Desert Camp"),
        mc("What does the omniscient narrator let the reader know that Noura does not know?",
           "Her father and her brother both know where the key is.", ["Noura is looking for the key to her bicycle lock.", "Noura's father is reading in the next room.", "Noura has searched every drawer in the whole house."],
           "The narrator shares what her father and brother know.",
           "Noura searched every drawer for the key to her bicycle lock. Her father, reading in the next room, remembered that he had put it in his pocket that morning. Noura's younger brother knew too, but he was enjoying watching her search.", "The Lost Key"),
        grid("Is each short passage third person limited or third person omniscient?", ["Third person limited", "Third person omniscient"],
             [("Dana smiled. She hoped her friend would like the card.", 0), ("Dana smiled, hoping her friend would like it. Her friend, Ghada, was thinking about a card of her own.", 1), ("Omar ran home. He was afraid he had missed dinner.", 0), ("Omar ran home, afraid he was late. His mother, at the window, was thinking that he was early.", 1)],
             "When the thoughts of a second character appear, the narrator is omniscient."),
        mc("Which detail best shows that the narrator of the class trip passage is omniscient?",
           "The narrator tells what three different people are thinking.", ["The narrator tells that Mr. Fahad counted the students on the bus.", "The narrator describes the students climbing onto the bus.", "The narrator says Abdullah sat in the back row."],
           "An omniscient narrator can see into the minds of many characters.",
           "Mr. Fahad counted the students as they climbed onto the bus. He hoped no one would get lost at the museum. In the back row, Abdullah grinned; he planned to see the dinosaur room first, no matter what. Beside him, Sami was quietly nervous about the long ride.", "The Class Trip"),
        ms("Which two sentences show the thoughts of characters other than Reem? Choose two.",
           ["A man walking by thought the lemonade looked too sour.", "A little girl wished she had brought her coins."], ["Reem set out cups of cold lemonade.", "She thought the price was fair."],
           "The narrator also shares what the man thinks and what the girl wishes.",
           "Reem set out cups of cold lemonade. She thought the price was fair. A man walking by thought the lemonade looked too sour. A little girl wished she had brought her coins.", "The Lemonade Stand"),
        mc("If the recital passage were told in third person omniscient, what might the narrator add?",
           "what Hessa's father was thinking as he watched her", ["what Hessa could hear as she walked onstage", "how Hessa felt just before she started playing", "where Hessa saw her father in the crowd"],
           "An omniscient narrator could also share the father's thoughts.",
           "Hessa walked onto the stage with her oud. She could hear her own heartbeat. She looked for her father in the crowd and finally spotted his proud smile.", "The Recital"),
        ht("Select the sentence that shows the narrator is omniscient rather than limited to the ant.",
           ["Dark clouds gathered over the hill.", "The little ant hurried to carry one more seed to its nest.", "It feared the rain would wash the path away.", "Far above, a bird watched the ant and wondered why it worked so hard."], [3],
           "The narrator also knows what the bird wonders.",
           "Dark clouds gathered over the hill. The little ant hurried to carry one more seed to its nest. It feared the rain would wash the path away. Far above, a bird watched the ant and wondered why it worked so hard.", "The Ant and the Rain"),
        mc("Why can't the reader know who sent Majed the message?",
           "It is third person limited, so we know only what Majed knows.", ["It is first person, so the narrator chooses to hide the answer.", "It is third person omniscient, so every thought is shared.", "It is second person, so the reader must be the one who sent it."],
           "A limited narrator stays with Majed, and Majed does not know.",
           "Majed read the message on his phone three times. “Meet me at the park,” it said, but there was no name. He felt both curious and nervous. He grabbed his jacket and headed out the door.", "The Message"),
        tf("True or false: The kabsa passage is told from a third person omniscient point of view.", True,
           "The narrator shares what Grandmother knows, what Jana hopes and what her brother wonders.",
           "Grandmother stirred the rice and smiled; she knew this was the children's favorite dish. In the living room, Jana was hoping dinner would be ready soon, while her brother wondered if there would be dessert.", "Cooking Kabsa"),
        mc("Which sentence tells the reader something that Yousef himself does not know?",
           "He did not see the small rock waiting around the bend.", ["Yousef placed his paper boat in the stream.", "The water sparkled in the bright afternoon sun.", "He watched it float away and hoped it would reach the sea."],
           "The narrator knows about the rock even though Yousef cannot see it.",
           "Yousef placed his paper boat in the stream. The water sparkled in the bright afternoon sun. He watched it float away and hoped it would reach the sea. He did not see the small rock waiting around the bend.", "The Paper Boat"),
    ],
    # ---------------- 211–220: evidence, what each narrator can know (Grade 6 On ×10, Grade 6 Above ×10)
    [
        tp("Part A: What is the point of view of the tryouts passage?", "third person limited", ["third person omniscient", "first person", "second person"],
           "Part B: Which detail best supports the answer to Part A?", "Ghada wonders what the coach is writing, but we never learn his thoughts.", ["Ghada laces her shoes slowly before tryouts.", "The coach writes in a notebook during tryouts.", "Ghada has practiced her free throws for a month."],
           "The narrator stays with Ghada. We cannot see into the coach's mind.",
           "Ghada laced her shoes slowly, trying to calm her nerves. She had practiced her free throws every day for a month. As she stepped onto the court, she noticed the coach writing in a notebook and wondered what he was writing about her.", "The Tryouts"),
        mc("How does the omniscient point of view help the reader understand the storm scene?",
           "It shows how differently each person on the boat feels.", ["It keeps the reader guessing about what anyone is thinking.", "It lets the captain tell his own story using I and me.", "It shows only what the cook can see in the kitchen."],
           "We learn the captain's confidence, Hamad's fear and the cook's worry about rice.",
           "Captain Saeed gripped the wheel as the waves grew taller. He was sure they could reach the harbor before dark. Below deck, young Hamad was certain the boat would sink, and he prayed quietly. The cook, meanwhile, thought only about whether the rice would spill.", "Storm at Sea"),
        mc("What is one limit of the first-person narrator in the secret recipe passage?",
           "The narrator can't be sure what is in the jar or what the aunt thinks.", ["The narrator cannot describe what the aunt does in the kitchen at all.", "The narrator cannot tell the reader about personal feelings or wishes.", "The narrator cannot use the word I to tell the story."],
           "A first-person narrator knows only what he or she sees and thinks.",
           "I watched my aunt add a pinch of something to the pot, but she hid the jar before I could read the label. I think it was saffron, but I'm not sure. She just winked at me.", "The Secret Recipe"),
        grid("Which point of view is each sentence written in?", ["First person", "Second person", "Third person limited", "Third person omniscient"],
             [("Nada knew she was right, and Sami knew he was wrong, but neither said a word.", 3), ("Nada knew she was right, though she could only guess what Sami was thinking.", 2), ("I knew I was right, but I said nothing.", 0), ("You know you are right, so you smile and wait.", 1)],
             "Look at the pronouns and at whose thoughts are shared."),
        ms("Which two details best show that the moving day passage is told in third person limited from Layan's point of view? Choose two.",
           ["She remembered planting the lemon tree with her grandfather.", "She hoped her new room would feel like home someday."], ["Layan carried the last box to the car.", "A moving truck was parked by the curb."],
           "These details show Layan's private memories and hopes; the narrator shares no one else's.",
           "Layan carried the last box to the car. A moving truck was parked by the curb. Her eyes stung as she looked back at her old house. She remembered planting the lemon tree with her grandfather. She hoped her new room would feel like home someday.", "Moving Day"),
        mc("What is the effect of the narrator sharing news that Tariq does not yet know?",
           "We know something Tariq doesn't, which builds hope and suspense.", ["The reader feels just as confused as Tariq does about the results.", "The reader learns that Omar is the narrator of the story.", "The reader understands that Tariq's poem lost the contest."],
           "Because the reader knows about the prize, we wait eagerly for Tariq to find out.",
           "When the results were posted, Tariq searched the list for his name. It was not there. He turned away quickly so no one would see his face. He did not notice his friend Omar running toward him with good news: Tariq's poem had won a special prize.", "The Contest Results"),
        ht("Select the two sentences that show the narrator cannot know what Fahad is thinking.",
           ["My cousin Fahad walked ahead of me on the trail.", "He looked tired, but maybe he was just thinking.", "I wished I knew what was on his mind.", "I decided to ask him at the next rest stop."], [1, 2],
           "The words maybe and I wished I knew show the narrator can only guess.",
           "My cousin Fahad walked ahead of me on the trail. He looked tired, but maybe he was just thinking. I wished I knew what was on his mind. I decided to ask him at the next rest stop.", "The Hiking Trip"),
        mc("Which point of view is used in the farmhouse passage, and how do you know?",
           "third person omniscient, because it shows what several characters think", ["third person limited, because the narrator follows only Umm Khalid inside", "first person, because the stranger tells about his own long trip", "third person limited, because the narrator follows only the stranger"],
           "We learn what Umm Khalid wonders, what the stranger hopes and what the dog senses.",
           "A tall stranger knocked at the farmhouse door. Inside, Umm Khalid wondered who would visit so late. The stranger, cold and tired, hoped someone would offer him tea. Out in the barn, the old dog sensed something and began to bark.", "The Visitor"),
        dd("Choose the phrase that best completes the sentence: The narrator learns about Saad's fear by ____.",
           "watching what Saad does", ["reading Saad's mind", "asking the reader questions"],
           "A first-person narrator learns about others by watching them.",
           "My twin brother, Saad, says he isn't scared of the dark. But every night, I see him leave the hallway light on.", "My Twin"),
        tp("Part A: What point of view is used in the clock tower passage?", "third person omniscient", ["third person limited", "first person", "second person"],
           "Part B: Which sentence best supports the answer to Part A?", "Only the clockkeeper knew that the old tower would ring for the last time tomorrow.", ["Every morning at seven, the clock tower rang across the square.", "Bilal, the baker, heard it and pulled the first loaves from the oven.", "Across the street, Mrs. Mona heard it too."],
           "The narrator moves between characters and even knows the clockkeeper's secret.",
           "Every morning at seven, the clock tower rang across the square. Bilal, the baker, heard it and pulled the first loaves from the oven. Across the street, Mrs. Mona heard it too and thought, “Time to open my shop.” Only the clockkeeper knew that the old tower would ring for the last time tomorrow.", "The Clock Tower"),

        mc("How would the exam room passage most likely change if it were told in third person omniscient?",
           "We might also learn how other students or the teacher feel.", ["The reader would learn much less about how Rania feels.", "Rania would tell the story herself, using I and me.", "The reader would be spoken to directly as you."],
           "An omniscient narrator can share the thoughts of anyone in the room.",
           "The room was silent except for pencils scratching. Rania stared at question five. She was sure she had studied this, but her mind felt empty. She glanced at the clock: ten minutes left.", "The Exam Room"),
        mc("What does the last sentence of the grandfather passage show about the first-person narrator?",
           "The narrator's guess about the brother may have been wrong.", ["The narrator knows exactly what the brother is thinking all along.", "The narrator is the grandfather telling the story.", "The narrator does not care about the old stories."],
           "The narrator thought the brother was bored, but his notebook shows he cares.",
           "When Grandfather tells stories about the old days, my brother rolls his eyes. I think he is bored. But last night I saw him writing Grandfather's words in a notebook.", "Grandfather's Stories"),
        ms("Which two effects does the second-person point of view have in the cave passage? Choose two.",
           ["It makes the reader feel like part of the adventure.", "It places the reader inside the cave as the explorer."], ["It shows the thoughts of many different explorers.", "It lets a character named Ali tell the story."],
           "You puts the reader in the explorer's place.",
           "You step into the cave, and the air turns cool. Your flashlight shows drawings of camels on the walls. You wonder who made them long ago.", "The Cave"),
        grid("Which details could a third person limited narrator who follows Waleed include?", ["Could include", "Could not include"],
             [("Waleed felt embarrassed.", 0), ("The shopkeeper thought Waleed was being careless.", 1), ("Waleed saw a shiny edge under the counter.", 0), ("A woman in line secretly planned to help him.", 1)],
             "A limited narrator shares only Waleed's thoughts and what he notices.",
             "Waleed dropped a coin, and it rolled under the counter. He bent down to look for it.", "The Dropped Coin"),
        mc("Which statement best describes the narrator's point of view in the Eid morning passage?",
           "Third person limited: the narrator shares only Lulu's thoughts and feelings.", ["Third person omniscient: the narrator shares the thoughts of the whole family.", "First person: Lulu tells about her own morning using I.", "Second person: the narrator tells the reader what to do on Eid."],
           "We learn what Lulu imagines and feels, and no one else's thoughts.",
           "Lulu woke before everyone else and tiptoed to the window. The street was quiet. She imagined the new dress waiting in her closet and the sweets she would share with her cousins. She could hardly wait for the day to begin.", "Eid Morning"),
        tp("Part A: What does the narrator of the chess passage reveal that Saud does not know?", "Grandfather is only pretending to be worried.", ["Saud moved his knight across the board.", "Saud thinks he has trapped the queen.", "Grandfather nodded slowly at the move."],
           "Part B: Which point of view makes this possible?", "third person omniscient", ["third person limited", "first person, told by Saud", "second person"],
           "Only an omniscient narrator can show Saud's belief and Grandfather's secret plan.",
           "Saud moved his knight and smiled, sure he had trapped his grandfather's queen. Grandfather nodded slowly, pretending to be worried. In truth, he had planned this move three turns ago and was about to win.", "The Chess Game"),
        mc("What does the late-for-school passage show about a first-person narrator?",
           "The narrator can misread what other characters are feeling.", ["The narrator always knows exactly what the teacher is thinking.", "The narrator tells the story from outside the classroom.", "The narrator speaks directly to the reader as you."],
           "The narrator thought Ms. Asma was angry, but she was worried.",
           "I ran into class out of breath. Ms. Asma looked at me with raised eyebrows. I was sure she was angry. Later, she told me she was only worried that I was sick.", "Late for School"),
        ht("Select the sentence that breaks a third person limited point of view focused on Abeer.",
           ["Abeer picked up a glass camel for her mother.", "She wondered if it was too expensive.", "The shopkeeper hoped she would buy it soon, since it was nearly closing time.", "Abeer counted her coins carefully."], [2],
           "This sentence shows the shopkeeper's thoughts, not Abeer's.",
           "Abeer picked up a glass camel for her mother. She wondered if it was too expensive. The shopkeeper hoped she would buy it soon, since it was nearly closing time. Abeer counted her coins carefully.", "The Gift Shop"),
        mc("Why might the author have chosen an omniscient narrator for the rain passage?",
           "to show how the same rain affects two people differently", ["to keep the reader from knowing how Dalia feels about it", "to let Farmer Mansour tell his own story about the rain", "to give the reader directions about what to do in rain"],
           "The narrator shows the farmer's joy and Dalia's worry about the same clouds.",
           "Farmer Mansour looked up at the dark clouds and thanked God; his thirsty fields needed water. In the city, Dalia frowned at the same clouds, worried that her school's outdoor festival would be canceled.", "Two Views of the Rain"),
        dd("Choose the phrase that best completes the sentence: The narrator of the bake sale passage is limited to ____.",
           "Amal's thoughts and feelings", ["every shopper's thoughts", "the reader's own feelings"],
           "We learn only how Amal feels as she waits.",
           "Amal set out her date cookies and waited. Every few minutes, she checked whether anyone was coming. Her stomach fluttered each time someone walked past.", "The Bake Sale"),
    ],
    # ---------------- 221–230: effects of point of view (Grade 8 Above ×10, Grade 9 Above ×10)
    [
        mc("What effect does the omniscient narrator's last sentence create in the apology note passage?",
           "dramatic irony: readers know why Fahad is silent, but Bandar does not", ["suspense, because readers do not know where the note went at all", "humor, because Fahad is only pretending to be angry with Bandar", "confusion, because readers cannot tell which boy is speaking"],
           "Readers know the note was lost, but Bandar does not.",
           "Bandar slipped the apology note into Fahad's backpack before class. All morning, Fahad ignored him, and Bandar's hope sank lower with each hour. What Bandar did not know was that the note had fallen out in the hallway, where a cleaner swept it up with the dust.", "The Note"),
        mc("Why should a reader be careful about trusting the first-person narrator of the basketball passage?",
           "He tells events in ways that always make himself look good.", ["The narrator describes the game from outside the team, as a fan.", "The narrator shares the thoughts of every player on the team.", "The narrator speaks directly to the reader, calling the reader you."],
           "He blames the referee and ignores his own missed shots.",
           "Everyone knows I'm the best player on our team. Coach puts me on the bench sometimes, but that's only to give the others a chance. When we lost on Thursday, it was because the referee was unfair, not because I missed three shots.", "Best Player"),
        tp("Part A: What does the reader know that Nasser does not?", "The boy was returning a wallet the man had dropped.", ["The boy was wearing a green cap.", "The market below the roof was crowded.", "The boy bumped into a man in the crowd."],
           "Part B: How does this difference affect the reader?", "It shows that Nasser's quick judgment is wrong.", ["It proves that the boy is a thief.", "It makes Nasser the narrator of the story.", "It keeps the reader from knowing the truth."],
           "The narrator lets readers see more than Nasser, so we know he misjudged the boy.",
           "From the rooftop, Nasser watched the crowded market below. He saw a boy in a green cap bump into a man and walk quickly away. Nasser was certain the boy had stolen the man's wallet. He did not see the boy stop a moment later to hand the man the wallet he had dropped.", "The Market"),
        mc("How does the omniscient point of view create humor in the dinner passage?",
           "It reveals Uncle Hamad's secret opinion and Aunt Latifa's pride.", ["It keeps every character's true feelings hidden from the reader.", "It lets Aunt Latifa tell the whole story in her own words.", "It speaks to the reader directly about how to cook a good soup."],
           "The reader knows the soup is salty while the cook feels proud.",
           "At dinner, Uncle Hamad praised the soup loudly, though he secretly found it too salty. Aunt Latifa, who had made it, beamed with pride. Only young Dana noticed her uncle quietly drinking glass after glass of water, and she tried hard not to laugh.", "The Dinner Guest"),
        ms("Which two effects does the third person limited point of view create in the dunes passage? Choose two.",
           ["The reader shares Rashid's uncertainty about where he is.", "Tension builds because the reader knows only what Rashid believes."], ["The reader learns exactly where the oasis is located.", "The reader hears the thoughts of other travelers nearby."],
           "We stay inside Rashid's mind, so we do not know if he is lost either.",
           "Rashid trudged through the dunes, sure the oasis was just over the next hill. His water bottle was nearly empty. Each hill looked the same, but he told himself he was not lost.", "Shifting Sands"),
        mc("What is the main effect of the second-person point of view in the letter passage?",
           "It pulls the reader into the mystery as the finder of the letter.", ["It shows the reader the private thoughts of the letter's writer.", "It helps the narrator explain events from long ago.", "It makes the reader an outside observer watching the scene."],
           "Using you makes the reader feel like the one holding the letter.",
           "You find the letter tucked inside an old book at the library. The paper is yellow, and the handwriting is shaky. You read the first line: “If you are reading this, the treasure is still hidden.” You look around. No one is watching.", "The Letter"),
        grid("A writer wants to tell a story about a school play. Which point of view best fits each goal?", ["First person", "Second person", "Third person limited", "Third person omniscient"],
             [("Show what every actor is secretly worried about.", 3), ("Let the reader feel like the actor on the stage.", 1), ("Have the lead actor tell her own experience.", 0), ("Keep the reader inside one actor's mind only.", 2)],
             "Each point of view gives the reader a different kind of view into the story."),
        mc("How would the reader's experience of the kite passage change if it were told in third person limited from Sami's point of view?",
           "We would not learn Rayan's plan, so the kite would seem lost for good.", ["The reader would learn even more about Rayan's thoughts and plans.", "The reader would be told what the kite itself is thinking.", "Nothing would change, because Sami already knows about the plan."],
           "Sami does not know Rayan's plan, so a limited narrator could not tell it.",
           "The kite fluttered in the branches of the acacia tree. Sami, who had lost it, had already given up and gone home sad. Across the road, his neighbor Rayan spotted the kite and decided to climb up for it, planning to return it in the morning.", "The Lost Kite"),
        mc("Which statement best explains how the first-person point of view shapes the award passage?",
           "We feel the narrator's nerves but cannot know where the mother is.", ["Readers learn exactly why the mother is not in the audience.", "Readers see the whole event through the mother's eyes instead.", "Readers are told what each person in the audience is thinking."],
           "We know only what the narrator sees and feels on stage.",
           "When my name was called, I walked to the stage and tried to look calm. My knees felt like jelly. I looked out at the audience, and I could not find my mother's face. I told myself she must be stuck in traffic.", "The Award"),
        dd("Choose the term that completes the sentence: Because readers know about the cake while Mona does not, the passage creates ____.",
           "dramatic irony", ["a flashback", "a simile"],
           "Dramatic irony happens when readers know something a character does not.",
           "Mona believed her sister had forgotten her birthday. Her sister, meanwhile, was hiding a cake in the neighbor's kitchen.", "The Birthday"),

        tp("Part A: Which point of view is used in the desert guide passage?", "third person omniscient", ["third person limited, following Sultan", "first person", "second person"],
           "Part B: Which detail best supports the answer to Part A?", "The narrator reveals both the tourists' beliefs and Sultan's private worry.", ["The tourists are chatting and taking photos.", "Sultan smiles and keeps walking ahead.", "The sky is getting darker over the dunes."],
           "Showing what the tourists assume and what Sultan fears means the narrator knows more than one mind.",
           "The tourists followed Sultan across the dunes, chatting and taking photos. They assumed he knew every inch of the desert. Sultan smiled and kept walking, but his eyes kept flicking to the darkening sky; he had seen sandstorms come this way before, and he did not like what he saw.", "The Desert Guide"),
        mc("Which revision changes the watch passage to first person while keeping the meaning?",
           "I opened the box slowly. Inside was the watch my grandfather used to wear. My throat tightened.", ["You open the box slowly. Inside is the watch your grandfather wore. Your throat tightens.", "Jumana opened the box slowly. Inside was the watch I used to wear. Her throat tightened.", "She opened the box slowly. Inside was the watch her grandfather used to wear. Her throat tightened."],
           "First person replaces Jumana and her with I and my throughout.",
           "Jumana opened the box slowly. Inside was the watch her grandfather used to wear. Her throat tightened.", "The Watch"),
        mc("How does the narrator's knowledge of both boys affect the reader's view of the conflict after the race?",
           "Readers see the trip was an accident, so Waleed's anger is mistaken.", ["Readers agree with Waleed that Khalid cheated on purpose in the race.", "Readers cannot tell what either of the two boys thinks or feels.", "Readers learn the story only from inside Khalid's own thoughts."],
           "Knowing Khalid twisted his ankle shows the fall was not on purpose.",
           "Waleed was certain that Khalid had tripped him on purpose during the race. He refused to shake Khalid's hand afterward. Khalid walked away confused, still rubbing the ankle he had twisted when he stumbled into Waleed.", "The Race Rival"),
        ht("Select the two sentences that show the narrator moving between the minds of different characters.",
           ["Asma told her best friend that she was moving to Dammam.", "Her friend promised to keep it secret.", "That evening, the friend told no one, though she felt so sad that she cried in her room for an hour.", "Asma, at home, wondered whether she had been wise to tell."], [2, 3],
           "One sentence shows the friend's private sadness, and the other shows Asma's private doubt.",
           "Asma told her best friend that she was moving to Dammam. Her friend promised to keep it secret. That evening, the friend told no one, though she felt so sad that she cried in her room for an hour. Asma, at home, wondered whether she had been wise to tell.", "The Shared Secret"),
        mc("What does the first-person point of view suggest about the narrator's understanding of Mr. Jaber?",
           "The narrator relies on rumors and actions, so the view may be incomplete.", ["The narrator fully understands Mr. Jaber's private thoughts and plans.", "The narrator is Mr. Jaber himself, describing his own quiet life.", "The narrator proves that Mr. Jaber truly dislikes all children."],
           "The narrator only sees what Mr. Jaber does and hears what friends say.",
           "Our neighbor, old Mr. Jaber, never smiles. He sits on his porch and stares at the street. My friends say he dislikes children. But yesterday, when my ball rolled into his yard, he picked it up and gently tossed it back.", "The Neighbor"),
        ms("Which two statements about point of view are accurate? Choose two.",
           ["A third person limited narrator shares only one character's inner thoughts.", "A first-person narrator can be mistaken about other characters' feelings."], ["A second-person narrator always tells the thoughts of every character.", "A third person omniscient narrator must be a character in the story."],
           "Limited stays with one mind, and a first-person narrator can misjudge others."),
        mc("The author tells the waiting room scene only through Bushra's eyes. What is the most likely reason?",
           "to make the reader share Bushra's worry and uncertainty", ["to explain exactly what the doctors are doing behind the doors", "to show what each nurse thinks about the girl waiting", "to teach the reader the rules for visiting a hospital"],
           "Like Bushra, the reader does not know what is happening behind the doors.",
           "Bushra sat in the waiting room, staring at the doors. Every time a nurse walked out, her heart jumped. Nobody told her anything about her grandmother. She counted the tiles on the floor to stay calm.", "The Waiting Room"),
        mc("Which point of view is used in the drawing passage, and what does it allow the reader to see?",
           "third person limited; it reveals what Hamza really thinks", ["third person omniscient; it shows the thoughts of the whole family", "first person; it lets the little sister explain her drawing", "second person; it tells the reader how to praise a drawing"],
           "We learn only Hamza's private thoughts; his sister is described from outside.",
           "Hamza told his little sister that her drawing was the best he had ever seen. He did not really think so, but he could not bear to see her disappointed. His sister ran to hang it on the fridge, glowing.", "The Kind Words"),
        tf("True or false: The bridge passage stays in third person limited from Faris's point of view the whole time.", False,
           "The last sentence shares Mazen's hope, so the narrator leaves Faris's mind.",
           "Faris stepped onto the narrow bridge. He told himself not to look down. Behind him, his cousin Mazen hoped Faris would turn back, but he said nothing.", "The Narrow Bridge"),
        mc("What is the overall effect of the omniscient narration in the lantern passage?",
           "It connects many different hopes into one shared, peaceful moment.", ["It creates suspense by hiding what each of the characters wants.", "It shows that only one person on the beach made a wish.", "It makes the reader the main character of the scene."],
           "The narrator shares each person's wish, joining them in one scene.",
           "As the lanterns rose into the night sky, each person on the beach made a quiet wish. Old Ibrahim wished for rain on his farm. Little Sara wished for a puppy. Her mother wished only that her children would always be this happy.", "Lanterns"),
    ],
]


# ------------------------------------------------------------------ build

def balanced(n, k, seed):
    """n positions in 0..k-1, as even as possible, in a shuffled order (seeded)."""
    out = [i % k for i in range(n)]
    random.Random(seed).shuffle(out)
    return out


def build(code, skill, items_by_band, meta):
    qs = []
    flat = [(b, i, q) for b, band in enumerate(items_by_band) for i, q in enumerate(band)]
    # balanced answer positions per type
    mc4 = [x for x in flat if x[2]["t"] == "MULTIPLE_CHOICE"]
    dd3 = [x for x in flat if x[2]["t"] == "DROPDOWN"]
    msx = [x for x in flat if x[2]["t"] == "MULTI_SELECT"]
    tpx = [x for x in flat if x[2]["t"] == "TWO_PART"]
    pos = {}
    for (x, p) in zip(mc4, balanced(len(mc4), 4, code + "mc")): pos[id(x[2])] = p
    for (x, p) in zip(dd3, balanced(len(dd3), 3, code + "dd")): pos[id(x[2])] = p
    pairs = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    for (x, p) in zip(msx, balanced(len(msx), 6, code + "ms")): pos[id(x[2])] = pairs[p]
    tpa = balanced(len(tpx), 4, code + "tpa"); tpb = balanced(len(tpx), 4, code + "tpb")
    for j, x in enumerate(tpx): pos[id(x[2])] = (tpa[j], tpb[j])

    def place(right, wrong, p):
        opts = list(wrong)
        opts.insert(p, right)
        return opts

    n = 0
    for b, i, q in flat:
        band, slots, dok = BANDS[b]
        level, grade = slots[0] if i < 10 else slots[1]
        n += 1
        out = {"ref": f"R73-{code}-{n:03d}", "level": level, "grade": grade, "rit": band, "dok": dok,
               "mapTest": meta["mapTest"], "mapArea": meta["mapArea"]}
        t = q["t"]
        if q.get("passage"):
            out["passageTitle"] = q.get("title")
            out["passage"] = q["passage"]
        out["stem"] = q["stem"]
        if t == "MULTIPLE_CHOICE":
            p = pos[id(q)]
            out["options"] = place(q["right"], q["wrong"], p); out["correct"] = L[p]
        elif t == "DROPDOWN":
            p = pos[id(q)]
            out["type"] = t; out["options"] = place(q["right"], q["wrong"], p); out["correct"] = L[p]
        elif t == "MULTI_SELECT":
            a, c = pos[id(q)]
            opts = [None] * 4
            opts[a], opts[c] = q["rights"]
            rest = iter(q["wrongs"])
            opts = [o if o is not None else next(rest) for o in opts]
            out["type"] = t; out["options"] = opts; out["correct"] = L[a] + L[c]
        elif t == "HOT_TEXT":
            out["type"] = t
            out["hotText"] = {"segments": [{"id": f"s{k + 1}", "text": s} for k, s in enumerate(q["segments"])],
                              "correct": [f"s{k + 1}" for k in q["correct"]], "maxSelect": len(q["correct"])}
        elif t == "GRID":
            out["type"] = t
            out["grid"] = {"rows": [{"id": f"r{k + 1}", "text": r[0]} for k, r in enumerate(q["rows"])],
                           "columns": [{"id": f"c{k + 1}", "text": c} for k, c in enumerate(q["cols"])],
                           "answer": {f"r{k + 1}": f"c{r[1] + 1}" for k, r in enumerate(q["rows"])}}
        elif t == "TRUE_FALSE":
            out["type"] = t; out["answer"] = q["answer"]
        elif t == "ERROR_CORRECTION":
            out["type"] = t; out["segments"] = q["segments"]; out["errorIndex"] = q["index"]; out["correction"] = q["correction"]
        elif t == "TWO_PART":
            pa, pb = pos[id(q)]
            (sa, ra, wa), (sb, rb, wb) = q["a"], q["b"]
            mk = lambda r, w, p: [{"label": L[k], "text": o, "correct": k == p, "rationale": None} for k, o in enumerate(place(r, w, p))]
            out["type"] = t
            out["twoPart"] = {"partA": {"stem": sa, "options": mk(ra, wa, pa)}, "partB": {"stem": sb, "options": mk(rb, wb, pb)}}
        out["why"] = q["why"]
        qs.append(out)
    # one set per RIT band (20 questions): a load chunk stays short
    sets = []
    for b, (band, _, _) in enumerate(BANDS):
        sets.append({"skill": skill, **{k: v for k, v in meta.items() if k not in ("mapTest",)}, "band": band,
                     "questions": [q for q in qs if q["rit"] == band]})
    return sets


CS_META = {"grade": 5, "ccss": "L.5.1", "domain": "Grammar & Conventions", "mapTest": "Language Usage", "mapArea": "Language: Understand, Edit for Grammar, Usage"}
PV_META = {"grade": 5, "ccss": "RL.5.6", "domain": "Reading Literature", "mapTest": "Reading", "mapArea": "Literary Text"}

if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    sets = build("CS", "Complex and Compound-Complex Sentences", CS, CS_META) + \
        build("PV", "Point of View: First, Second, Third Limited, Third Omniscient", PV, PV_META)
    doc = {"_note": "r73 (owner): two new skills, 100 original MAP-style questions each, five RIT bands of 20 (181–190 … 221–230), "
                    "easiest first — Complex and Compound-Complex Sentences (Language Usage · Grammar and Usage) and Point of View: "
                    "First, Second, Third Limited, Third Omniscient (Reading · Literary Text). Built by data/questions/src/r73_new_skills.py. "
                    "The skills are created in Grades 4–6 when missing (Admin → Questions → Load new questions → New skills).",
           "sets": sets}
    path = os.path.join(root, "data", "questions", "sets", "new-skill-sets.json")
    with open(path, "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(path, sum(len(s["questions"]) for s in sets), "questions in", len(sets), "sets")
